"""Published fare examples on the D23 validation runner (T1190, Prices row).

Terms (research, T1190): there is no open absolute air fare series (Eurostat
counts passengers, not prices; HICP CP0733 is an index of change), and
airline and Google pages must not be read by a script for this. So the
reference is a short owner-kept CSV of fares an airline or airport published
for a route and month ("from EUR 29.99", a fare seen by hand on the airline
site), at data/reports/validation/prices/fare_examples.csv:

    id,origin,dest,month,fare_eur,cc,source,url,read_on

fare_eur is one adult, one way, in euros, as published; cc is the origin
airport's country. Carta's side is the sweep's per-airport files
(data/flights/{IATA}.json on R2, the publish.mjs shape), copied to
cache/flights_wire/ by the owner (owner step T1190-c).

  flags   matched  Carta has at least one swept fare on that route in that
                   month (either direction file is not used: way out only).
  facts   within   Carta's cheapest fare that month is within TOL of the
                   published one. A published "from" fare is a floor, so a
                   Carta fare far ABOVE it is the gap that matters.
  rank    (published, Carta cheapest) across routes.
  error   (published, Carta cheapest).
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "data" / "reports" / "validation" / "prices" / "fare_examples.csv"
WIRE_DIR = ROOT / "cache" / "flights_wire"

NAME = "prices_fares"
SHARE = 1.0
MIN_PER_COUNTRY = 5
TOL = 0.35
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 10},
    {"metric": "fact.within", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 10},
    {"metric": "error_mdape", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 10},
]


def references(ctx):
    path = Path(ctx.get("reference") or EXAMPLES)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                fare = float(r["fare_eur"])
            except (KeyError, TypeError, ValueError):
                continue
            o, d, m = (r.get("origin") or "").upper(), (r.get("dest") or "").upper(), r.get("month") or ""
            if len(o) != 3 or len(d) != 3 or len(m) != 7 or fare <= 0:
                continue
            out.append({"id": r.get("id") or f"{o}-{d}-{m}", "countries": [(r.get("cc") or "??").upper()],
                        "origin": o, "dest": d, "month": m, "fare": fare, "source": r.get("source") or ""})
    return out


def load(ctx):
    """{'dir', 'files': {IATA: file or None}} read lazily per origin."""
    return {"dir": Path(ctx.get("wire") or WIRE_DIR), "files": {}}


def _file(carta, iata):
    if iata not in carta["files"]:
        try:
            carta["files"][iata] = json.loads((carta["dir"] / f"{iata}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            carta["files"][iata] = None
    return carta["files"][iata]


def cheapest(carta, origin, dest, month):
    f = _file(carta, origin) or {}
    days = (f.get("to") or {}).get(dest) or {}
    prices = [v[0] for day, v in days.items() if day.startswith(month) and v and v[0] and v[0] > 0]
    return min(prices) if prices else None


def match(refs, carta):
    out = []
    for r in refs:
        c = cheapest(carta, r["origin"], r["dest"], r["month"])
        res = {"id": r["id"], "country": r["countries"][0], "flags": {"matched": c is not None},
               "facts": {"within": None}, "rank": None, "error": None, "published": r["fare"], "carta": c}
        if c is not None:
            res["facts"]["within"] = abs(c / r["fare"] - 1) <= TOL
            res["rank"] = res["error"] = (r["fare"], float(c))
            res["note"] = "agrees" if res["facts"]["within"] else ("carta_above" if c > r["fare"] else "carta_below")
        else:
            res["note"] = "no_swept_fare" if _file(carta, r["origin"]) else "no_wire_file"
        out.append(res)
    return out


def gaps(results, n=30):
    rs = [r for r in results if r.get("carta")]
    rs.sort(key=lambda r: (-abs(r["carta"] / r["published"] - 1), r["id"]))
    return [{"id": r["id"], "published": r["published"], "carta": r["carta"], "cause_code": r["note"]} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"path": str(ctx.get("_ref_path") or EXAMPLES)},
            "carta": {"wire_dir": str(carta["dir"]), "files_read": sum(1 for v in carta["files"].values() if v)}}
