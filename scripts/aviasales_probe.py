"""Aviasales / Travelpayouts Data API coverage probe (T1112, ROADMAP D14).

Question it answers before any switch from the sweep: on the 10,094 routes of
data/flights/_routes.json, does the Data API return a price for the month, how
fresh is it, and how does it compare with the price the sweep holds today?

  python scripts/aviasales_probe.py --months 2027-01,2027-02 \
      --sweep cache/flights/sweep_export.csv --out cache/flights/aviasales_probe

Inputs
  --routes   route list (default data/flights/_routes.json: origin -> dest -> month mask)
  --airports airport list for the country of each origin (default data/flights/_airports.json)
  --months   comma list of YYYY-MM to probe (default: the 2 months after next month)
  --sweep    optional CSV or JSON lines with o,d,date,price (an export of the D1 `fares`
             table); the cheapest sweep price per route and month is the comparison
  --fixtures DIR  read recorded responses DIR/<O>-<D>-<YYYY-MM>.json instead of the
             network (no token needed); this is how the tests run

Token: environment variable AVIASALES_TOKEN only (a Travelpayouts API token). It is
sent in the X-Access-Token header, never printed, never written to the output.
Base URL: AVIASALES_API_BASE (default https://api.travelpayouts.com).

Resumable: every answer is appended to <out>/results.jsonl as it arrives; a rerun
skips route+month pairs already answered (status ok or empty) and retries errors.
Rate limited: --rps requests per second (default 2); 429 and 5xx back off and retry.

Output (in --out): results.jsonl (raw answers) and coverage.json + coverage.md
(coverage overall, by origin country, by month; freshness; price gap distribution).
Exit 0 when the report was written, 2 when nothing could be probed.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

TOKEN_ENV = "AVIASALES_TOKEN"
BASE_ENV = "AVIASALES_API_BASE"
DEFAULT_BASE = "https://api.travelpayouts.com"
ENDPOINT = "/aviasales/v3/prices_for_dates"
GAP_BUCKETS = [
    ("api cheaper than -20%", None, -20.0),
    ("-20% to -5%", -20.0, -5.0),
    ("within 5%", -5.0, 5.0),
    ("+5% to +20%", 5.0, 20.0),
    ("api dearer than +20%", 20.0, None),
]
AGE_BUCKETS = [("under 1 day", 0, 1), ("1 to 3 days", 1, 3), ("3 to 7 days", 3, 7), ("7 days or more", 7, None)]


def default_months(today: date | None = None) -> list[str]:
    t = today or datetime.now(timezone.utc).date()
    out = []
    y, m = t.year, t.month
    for k in (2, 3):  # departures a few weeks out, where cached fares exist
        mm = m + k
        out.append(f"{y + (mm - 1) // 12}-{(mm - 1) % 12 + 1:02d}")
    return out


def load_routes(path: Path) -> list[tuple[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))["routes"]
    return sorted((o, d) for o, dests in data.items() for d in dests)


def load_countries(path: Path) -> dict[str, str]:
    return {k: v.get("country") or "unknown" for k, v in json.loads(path.read_text(encoding="utf-8")).items()}


def load_sweep(path: Path | None) -> dict[tuple[str, str, str], float]:
    """Cheapest sweep price per (origin, dest, YYYY-MM)."""
    best: dict[tuple[str, str, str], float] = {}
    if not path:
        return best
    text = path.read_text(encoding="utf-8")
    if text.lstrip().startswith("{"):
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        rows = list(csv.DictReader(text.splitlines()))
    for r in rows:
        try:
            price = float(r["price"])
            key = (r["o"], r["d"], str(r["date"])[:7])
        except (KeyError, TypeError, ValueError):
            continue
        if price > 0 and (key not in best or price < best[key]):
            best[key] = price
    return best


def parse_response(body: dict, now: datetime) -> dict:
    """One API body -> {status, price, age_days, transfers, airline}. Cheapest offer wins."""
    offers = [o for o in (body.get("data") or []) if isinstance(o, dict) and o.get("price")]
    if not body.get("success", True) or not offers:
        return {"status": "empty"}
    o = min(offers, key=lambda x: float(x["price"]))
    age = None
    found = o.get("found_at") or o.get("created_at")  # absent on some endpoints: freshness then unknown
    if found:
        try:
            ts = datetime.fromisoformat(str(found).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            age = max(0.0, (now - ts).total_seconds() / 86400)
        except ValueError:
            pass
    return {
        "status": "ok",
        "price": float(o["price"]),
        "age_days": None if age is None else round(age, 2),
        "transfers": o.get("transfers"),
        "airline": o.get("airline"),
        "currency": body.get("currency"),
    }


class Fetcher:
    """Network fetcher with a rate limit and bounded retries. Never prints the token."""

    def __init__(self, token: str, base: str, rps: float, sleep=time.sleep, opener=urllib.request.urlopen):
        self.token, self.base, self.interval = token, base.rstrip("/"), 1.0 / max(rps, 0.01)
        self.sleep, self.opener, self._last = sleep, opener, 0.0

    def __call__(self, o: str, d: str, month: str) -> dict:
        q = urllib.parse.urlencode({
            "origin": o, "destination": d, "departure_at": month, "one_way": "true",
            "sorting": "price", "limit": 5, "currency": "eur",
        })
        req = urllib.request.Request(f"{self.base}{ENDPOINT}?{q}", headers={"X-Access-Token": self.token})
        for attempt in range(4):
            wait = self.interval - (time.monotonic() - self._last)
            if wait > 0:
                self.sleep(wait)
            self._last = time.monotonic()
            try:
                with self.opener(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise SystemExit(f"auth refused (HTTP {e.code}): check {TOKEN_ENV}")
                if e.code == 429 or e.code >= 500:
                    self.sleep(2 ** (attempt + 1))
                    continue
                return {"success": False, "http": e.code}
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                self.sleep(2 ** (attempt + 1))
        raise RuntimeError("no answer after 4 tries")


def fixture_fetcher(directory: Path):
    def fetch(o: str, d: str, month: str) -> dict:
        p = directory / f"{o}-{d}-{month}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"success": True, "data": []}
    return fetch


def read_done(results: Path) -> dict[tuple[str, str, str], dict]:
    done: dict[tuple[str, str, str], dict] = {}
    if results.exists():
        for line in results.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue  # a torn last line from a killed run
            if r.get("status") in ("ok", "empty"):
                done[(r["o"], r["d"], r["month"])] = r
    return done


def probe(routes, months, fetch, results: Path, now: datetime, limit: int | None = None) -> dict:
    done = read_done(results)
    results.parent.mkdir(parents=True, exist_ok=True)
    asked = errors = 0
    with results.open("a", encoding="utf-8") as fh:
        for o, d in routes:
            for m in months:
                if (o, d, m) in done:
                    continue
                if limit is not None and asked >= limit:
                    return {"asked": asked, "errors": errors, "done": done}
                asked += 1
                try:
                    rec = {"o": o, "d": d, "month": m, **parse_response(fetch(o, d, m), now)}
                except RuntimeError as e:
                    rec = {"o": o, "d": d, "month": m, "status": "error", "error": str(e)}
                    errors += 1
                fh.write(json.dumps(rec) + "\n")
                fh.flush()
                if rec["status"] != "error":
                    done[(o, d, m)] = rec
    return {"asked": asked, "errors": errors, "done": done}


def _share(n: int, total: int) -> float:
    return round(100.0 * n / total, 1) if total else 0.0


def _bucket(value: float, buckets):
    for label, lo, hi in buckets:
        if (lo is None or value >= lo) and (hi is None or value < hi):
            return label
    return buckets[-1][0]


def build_report(records, countries, sweep, routes_total: int, months) -> dict:
    recs = [r for r in records if r["status"] in ("ok", "empty")]
    total = len(recs)
    ok = [r for r in recs if r["status"] == "ok"]

    def cov(group):
        g = defaultdict(lambda: [0, 0])
        for r in recs:
            k = group(r)
            g[k][0] += 1
            g[k][1] += r["status"] == "ok"
        return {k: {"probed": a, "priced": b, "coverage_pct": _share(b, a)} for k, (a, b) in sorted(g.items())}

    gaps, labelled = [], defaultdict(int)
    for r in ok:
        s = sweep.get((r["o"], r["d"], r["month"]))
        if s:
            gap = 100.0 * (r["price"] - s) / s
            gaps.append(gap)
            labelled[_bucket(gap, GAP_BUCKETS)] += 1
    ages = [r["age_days"] for r in ok if r.get("age_days") is not None]
    age_b = defaultdict(int)
    for a in ages:
        age_b[_bucket(a, [(l, lo, hi) for l, lo, hi in AGE_BUCKETS])] += 1
    return {
        "routes_total": routes_total,
        "months": list(months),
        "probed": total,
        "priced": len(ok),
        "coverage_pct": _share(len(ok), total),
        "by_country": cov(lambda r: countries.get(r["o"], "unknown")),
        "by_month": cov(lambda r: r["month"]),
        "freshness": {
            "with_timestamp": len(ages),
            "median_age_days": round(statistics.median(ages), 2) if ages else None,
            "buckets": {l: age_b.get(l, 0) for l, _, _ in AGE_BUCKETS},
        },
        "price_gap": {
            "compared": len(gaps),
            "no_sweep_price": len(ok) - len(gaps),
            "median_gap_pct": round(statistics.median(gaps), 1) if gaps else None,
            "buckets": {l: labelled.get(l, 0) for l, _, _ in GAP_BUCKETS},
        },
    }


def render_markdown(rep: dict) -> str:
    head = (
        f"Routes in list: {rep['routes_total']}. Months: {', '.join(rep['months'])}. "
        f"Route-months probed: {rep['probed']}, priced: {rep['priced']} ({rep['coverage_pct']}%)."
    )
    L = ["# Aviasales coverage probe", "", head, ""]
    for title, key in (("Coverage by origin country", "by_country"), ("Coverage by month", "by_month")):
        L += [f"## {title}", "", "| Group | Probed | Priced | Coverage % |", "|---|---|---|---|"]
        for k, v in rep[key].items():
            L.append(f"| {k} | {v['probed']} | {v['priced']} | {v['coverage_pct']} |")
        L.append("")
    f = rep["freshness"]
    L += ["## Freshness", "", f"Offers with a timestamp: {f['with_timestamp']}; median age (days): {f['median_age_days']}.", "",
          "| Age | Offers |", "|---|---|"] + [f"| {k} | {v} |" for k, v in f["buckets"].items()] + [""]
    g = rep["price_gap"]
    L += ["## Price gap against the sweep (api minus sweep, share of sweep)", "",
          f"Compared: {g['compared']}; priced but no sweep price: {g['no_sweep_price']}; median gap %: {g['median_gap_pct']}.", "",
          "| Gap | Route-months |", "|---|---|"] + [f"| {k} | {v} |" for k, v in g["buckets"].items()] + [""]
    return "\n".join(L)


def main(argv=None, fetch=None, now: datetime | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--routes", default="data/flights/_routes.json")
    ap.add_argument("--airports", default="data/flights/_airports.json")
    ap.add_argument("--months", default=None)
    ap.add_argument("--sweep", default=None)
    ap.add_argument("--fixtures", default=None)
    ap.add_argument("--out", default="cache/flights/aviasales_probe")
    ap.add_argument("--rps", type=float, default=2.0)
    ap.add_argument("--limit", type=int, default=None, help="stop after this many new requests (a smoke run)")
    a = ap.parse_args(argv)

    months = a.months.split(",") if a.months else default_months()
    routes = load_routes(Path(a.routes))
    if fetch is None:
        if a.fixtures:
            fetch = fixture_fetcher(Path(a.fixtures))
        else:
            token = os.environ.get(TOKEN_ENV, "")
            if not token:
                print(f"{TOKEN_ENV} is not set", file=sys.stderr)
                return 2
            fetch = Fetcher(token, os.environ.get(BASE_ENV, DEFAULT_BASE), a.rps)
    out = Path(a.out)
    now = now or datetime.now(timezone.utc)
    res = probe(routes, months, fetch, out / "results.jsonl", now, a.limit)
    records = list(read_done(out / "results.jsonl").values())
    if not records:
        print("nothing probed", file=sys.stderr)
        return 2
    rep = build_report(records, load_countries(Path(a.airports)), load_sweep(Path(a.sweep) if a.sweep else None), len(routes), months)
    (out / "coverage.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (out / "coverage.md").write_text(render_markdown(rep), encoding="utf-8")
    print(f"asked {res['asked']}, errors {res['errors']}; priced {rep['priced']}/{rep['probed']} ({rep['coverage_pct']}%) -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
