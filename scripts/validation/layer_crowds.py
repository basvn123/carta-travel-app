"""Crowds by month on the D23 validation runner (T1194, ROADMAP D23 Climate row).

Carta's monthly crowd shape (T649, T1098) is each destination's regional
month share of annual nights, `crowding.monthly.share` (twelve shares). The
reference is Eurostat tour_occ_nim, nights spent at tourist accommodation by
country and month, exported by the owner as a CSV (CC BY 4.0 as understood,
to be confirmed on the Eurostat copyright notice; the UK is not in it):

    data/reports/validation/crowds/eurostat_nights_country_month.csv
    cc,year,month,nights

Years with all 12 months count; the last three such years are averaged, as in
harvest_uk_crowds.py. The reference item is a country-month: its share of the
country's annual nights. Carta's share for a country is the mean of its
destinations' month shares weighted by nights_per_km2, so busy places count
more, like the nights do. Destinations are tourist-biased, which is a known
limit; the national total is the honest comparison all the same.

  flags   matched   Carta has crowding shares for the country.
  facts   within    the shares differ by at most TOL_POINTS percentage points.
          peak      only on the reference's peak month: it is also one of
                    Carta's three busiest months.
  rank    (reference share, Carta share)
  error   (reference share, Carta share), shares in percent.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from layer_climate import iso2, num

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "data" / "reports" / "validation" / "crowds" / "eurostat_nights_country_month.csv"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"

NAME = "crowds"
SHARE = 1.0
MIN_PER_COUNTRY = 12
TOL_POINTS = 1.5
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.within", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.peak", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 10},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 60},
]


def references(ctx):
    path = Path(ctx.get("reference") or REFERENCE)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    years = {}
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            cc, y, m, n = iso2(r.get("cc")), num(r.get("year")), num(r.get("month")), num(r.get("nights"))
            if not cc or None in (y, m, n) or not 1 <= int(m) <= 12 or n < 0:
                continue
            years.setdefault(cc, {}).setdefault(int(y), {})[int(m)] = n
    out = []
    for cc, ys in sorted(years.items()):
        full = sorted(y for y, ms in ys.items() if len(ms) == 12 and sum(ms.values()) > 0)[-3:]
        if not full:
            continue
        shares = []
        for m in range(1, 13):
            shares.append(sum(ys[y][m] / sum(ys[y].values()) for y in full) / len(full) * 100)
        peak = max(range(12), key=lambda i: shares[i]) + 1
        for m in range(1, 13):
            out.append({"id": f"{cc}|{m:02d}", "countries": [cc], "month": m, "share": shares[m - 1],
                        "peak": m == peak, "years": full})
    return out


def load(ctx):
    path = Path(ctx.get("wire") or WIRE)
    try:
        dests = json.loads(path.read_text(encoding="utf-8")).get("destinations") or {}
    except (OSError, ValueError):
        dests = {}
    acc = {}
    for d in (dests.values() if isinstance(dests, dict) else dests):
        c = d.get("crowding") or {}
        sh = (c.get("monthly") or {}).get("share")
        w = c.get("nights_per_km2")
        if not (isinstance(sh, list) and len(sh) == 12 and isinstance(w, (int, float)) and w > 0):
            continue
        a = acc.setdefault(iso2(d.get("iso2")), {"w": 0.0, "s": [0.0] * 12, "n": 0})
        tot = sum(sh) or 1
        a["w"] += w
        a["n"] += 1
        a["s"] = [x + w * v / tot * 100 for x, v in zip(a["s"], sh)]
    shares = {cc: {"share": [x / a["w"] for x in a["s"]], "n": a["n"]} for cc, a in acc.items() if a["w"]}
    return {"countries": shares, "path": str(path)}


def match(refs, carta):
    out = []
    for r in refs:
        cc = r["countries"][0]
        got = carta["countries"].get(cc)
        res = {"id": r["id"], "country": cc, "month": r["month"], "flags": {"matched": got is not None},
               "facts": {}, "rank": None, "error": None}
        if got is None:
            res["note"] = "no_carta_crowding"
        else:
            g = got["share"][r["month"] - 1]
            res["facts"] = {"within": abs(g - r["share"]) <= TOL_POINTS, "peak": None}
            if r["peak"]:
                top3 = sorted(range(12), key=lambda i: -got["share"][i])[:3]
                res["facts"]["peak"] = (r["month"] - 1) in top3
            res["rank"] = res["error"] = (round(r["share"], 3), round(g, 3))
            res.update({"diff": round(g - r["share"], 2), "ref": round(r["share"], 2), "carta": round(g, 2),
                        "dests": got["n"], "name": cc})
            res["note"] = "agrees" if res["facts"]["within"] else ("carta_busier" if g > r["share"] else "carta_quieter")
        out.append(res)
    return out


def gaps(results, n=30):
    rs = [r for r in results if r.get("diff") is not None]
    rs.sort(key=lambda r: (-abs(r["diff"]), r["id"]))
    return [{"id": r["id"], "country": r["country"], "month": r["month"], "diff_points": r["diff"],
             "reference": r["ref"], "carta": r["carta"], "destinations": r["dests"],
             "cause_code": r["note"]} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"path": str(ctx.get("_ref_path") or REFERENCE)},
            "carta": {"wire": carta["path"], "countries_with_shares": len(carta["countries"])}}
