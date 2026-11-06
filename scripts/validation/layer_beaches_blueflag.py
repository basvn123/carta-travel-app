"""Blue Flag on the D23 validation runner (T1189): coverage of flagged beaches.

Terms (research, T1189): FEE reserves the copyright of blueflag.global and
publishes no open list, so nothing is scraped or committed from it. The
reference is an owner-supplied CSV (data/reports/validation/beaches/
blueflag_wikidata.csv, columns: id,name,lat,lon,cc), made from Wikidata
(CC0) with the SPARQL query in docs/runbooks or the T1189 report. It is a
hint, not a reference: Wikidata Blue Flag coverage is patchy and stale, so
the check is soft and only reports coverage and the share in the rated tier.
"""
from __future__ import annotations

import csv
from pathlib import Path

import layer_beaches as lb

NAME = "beaches_blueflag"
SHARE = 1.0
MIN_PER_COUNTRY = 5
FLAGS = lb.ROOT / "data" / "reports" / "validation" / "beaches" / "blueflag_wikidata.csv"
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
    {"metric": "in_rated", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 30},
]
load = lb.load


def references(ctx):
    path = Path(ctx.get("reference") or FLAGS)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
            except (KeyError, ValueError):
                continue
            out.append({"id": r.get("id") or r.get("name"), "countries": [lb.iso2(r.get("cc"))],
                        "name": r.get("name") or "", "lat": lat, "lon": lon,
                        "type": None, "q": None, "q1": None})
    return out


def match(refs, carta):
    res = lb.match(refs, carta)
    for r in res:
        r["facts"] = {}
        r["rank"] = r["error"] = None
        r["flags"].pop("open", None)
    return res


gaps = lb.gaps
describe = lb.describe
