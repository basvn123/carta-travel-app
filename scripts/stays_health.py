"""Scraper and source health for the stays scrape (T1074, ROADMAP D5).

Reads what a scrape run leaves behind and says, per source, whether the last
run still finds what earlier runs found:

  yield   prices per page of a run, from the "session:" line the scrapers print
          (logs/stays_<source>.log). Alert when the latest run's yield is below
          70% of the median of the previous (up to) 7 runs. A session that read
          no page (everything already done) is not a run.
  drift   per source, place and bed kind, the median price of a run (the month
          its observations were captured) against the run before, from the
          scrape journal (cache/stays/journal_scrape.sqlite). Alert when it
          moves more than 25%, with at least MIN_OBS observations in each run.

Output: a JSON report (default cache/stays/stays_health.json) the admin can
read, and an exit code for the box to mail on:

  0  nothing to report      1  at least one alert      2  nothing could be read

Usage:
  python scripts/stays_health.py
  python scripts/stays_health.py --logs logs --journal cache/stays/journal_scrape.sqlite
"""

import argparse
import json
import re
import sqlite3
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YIELD_FLOOR = 0.70      # of the median of the previous runs
BASELINE_RUNS = 7       # previous runs the median is taken over
MIN_BASELINE = 2        # fewer previous runs than this: no yield verdict
DRIFT_LIMIT = 0.25      # a median price moving more than this is drift
MIN_OBS = 3             # observations a run needs for a place to be compared

HEAD = re.compile(r"====\s+stays scrape\s+(\S+)\s+(\S+)\s+started\s+(.*?)\s*====")
SESSION = re.compile(r"session:\s*(\d+)\s+pages,\s*(\d+)\s+prices")


def read_text(path):
    raw = Path(path).read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    return raw.decode("utf-8", errors="replace")


def parse_log(text, source=None):
    """Runs from a scraper log: [{source, run, started, pages, prices}], in
    file order. A session with 0 pages did nothing and is left out."""
    out, head = [], None
    for line in text.splitlines():
        m = HEAD.search(line)
        if m:
            head = {"run": m.group(1), "source": source or m.group(2), "started": m.group(3)}
            continue
        m = SESSION.search(line)
        if m and head:
            pages, prices = int(m.group(1)), int(m.group(2))
            if pages > 0:
                out.append({**head, "pages": pages, "prices": prices})
    return out


def yield_alerts(runs, floor=YIELD_FLOOR, window=BASELINE_RUNS, min_baseline=MIN_BASELINE):
    """Per source, the latest run's yield against the median of the runs before it.
    Returns (alerts, summary)."""
    alerts, summary = [], {}
    by_source = {}
    for r in runs:
        by_source.setdefault(r["source"], []).append(r)
    for source, rs in sorted(by_source.items()):
        y = [r["prices"] / r["pages"] for r in rs]
        last, before = y[-1], y[:-1][-window:]
        info = {"runs": len(rs), "latest_yield": round(last, 3), "latest_started": rs[-1].get("started"),
                "latest_pages": rs[-1]["pages"], "latest_prices": rs[-1]["prices"]}
        if len(before) < min_baseline:
            info["verdict"] = "not enough history"
        else:
            med = statistics.median(before)
            info["baseline_median"] = round(med, 3)
            info["baseline_runs"] = len(before)
            if med > 0 and last < floor * med:
                info["verdict"] = "alert"
                alerts.append({
                    "kind": "yield", "source": source,
                    "message": (f"{source}: {last:.2f} prices per page in the latest run, "
                                f"{last / med:.0%} of the median {med:.2f} of the previous "
                                f"{len(before)} runs (floor {floor:.0%})"),
                    "latest": round(last, 3), "median": round(med, 3),
                })
            else:
                info["verdict"] = "ok"
        summary[source] = info
    return alerts, summary


def drift_alerts(rows, limit=DRIFT_LIMIT, min_obs=MIN_OBS):
    """rows: (source, dest_id, bed, run, price). Per source, place and bed, the
    median of the latest run against the run before it."""
    groups = {}
    for source, dest, bed, run, price in rows:
        if price and price > 0:
            groups.setdefault((source, dest, bed), {}).setdefault(run, []).append(price)
    alerts, compared = [], 0
    for (source, dest, bed), runs in sorted(groups.items()):
        usable = [(r, statistics.median(p)) for r, p in sorted(runs.items()) if len(p) >= min_obs]
        if len(usable) < 2:
            continue
        (r0, m0), (r1, m1) = usable[-2], usable[-1]
        compared += 1
        move = m1 / m0 - 1
        if abs(move) > limit:
            alerts.append({
                "kind": "drift", "source": source, "dest_id": dest, "bed": bed,
                "message": f"{source} {dest} {bed}: median {m0:.2f} ({r0}) to {m1:.2f} ({r1}), {move:+.0%}",
                "from_run": r0, "to_run": r1, "from": round(m0, 2), "to": round(m1, 2),
                "move": round(move, 3),
            })
    return alerts, compared


def journal_rows(path):
    con = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro", uri=True)
    try:
        return con.execute(
            "select source, dest_id, bed, substr(captured, 1, 7), price_eur from obs"
            " where price_eur is not null").fetchall()
    finally:
        con.close()


def build_report(logs_dir, journal_path, now=None):
    now = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = {"generated_at": now, "thresholds": {
        "yield_floor": YIELD_FLOOR, "baseline_runs": BASELINE_RUNS, "drift_limit": DRIFT_LIMIT,
        "min_obs": MIN_OBS}, "inputs": {}, "alerts": []}
    runs = []
    logs = sorted(Path(logs_dir).glob("stays_*.log")) if Path(logs_dir).is_dir() else []
    for lg in logs:
        runs += parse_log(read_text(lg), source=lg.stem.removeprefix("stays_"))
    report["inputs"]["logs"] = [p.name for p in logs]
    ya, report["yield"] = yield_alerts(runs)
    report["alerts"] += ya
    da, compared = [], 0
    if journal_path and Path(journal_path).exists():
        da, compared = drift_alerts(journal_rows(journal_path))
        report["inputs"]["journal"] = Path(journal_path).name
    report["drift"] = {"compared": compared, "alerts": len(da)}
    report["alerts"] += da
    report["readable"] = bool(runs) or bool(report["inputs"].get("journal"))
    report["status"] = "alert" if report["alerts"] else "ok" if report["readable"] else "unreadable"
    return report


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--logs", default=str(ROOT / "logs"))
    ap.add_argument("--journal", default=str(ROOT / "cache" / "stays" / "journal_scrape.sqlite"))
    ap.add_argument("--out", default=str(ROOT / "cache" / "stays" / "stays_health.json"))
    a = ap.parse_args(argv)
    rep = build_report(a.logs, a.journal)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=1, ensure_ascii=False), encoding="utf-8")
    for al in rep["alerts"]:
        print("ALERT", al["message"])
    print(f"stays health: {rep['status']}, {len(rep['alerts'])} alerts, report {out}")
    return {"ok": 0, "alert": 1}.get(rep["status"], 2)


if __name__ == "__main__":
    sys.exit(main())
