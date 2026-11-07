"""Sea temperature on the D23 validation runner (T1194, ROADMAP D23 Climate row).

Carta's monthly sea temperature is NASA JPL MUR SST v4.1 (mean 2003 to 2022,
T1097). The reference is an independent product: Copernicus Marine (CMEMS)
monthly sea surface temperature at coastal points, exported by the owner as
a CSV (the CMEMS licence needs an account, so no script fetches it; see the
T1194 report for the product and the export command):

    data/reports/validation/sea/cmems_sst.csv
    id,name,cc,lat,lon,month,sst_c,source,period

Carta's side is the shipped wire: beaches (`continent-app/public/beaches/
{CC}.json`, key `sea_temp`, twelve figures) and destinations (`climate.water_c`
in `continent-app/public/app_data.json`, only where open water lies within
20 km). A reference point matches the nearest Carta beach within MAX_KM, else
the nearest destination with water_c within MAX_KM.

  flags   matched   the point has a Carta sea temperature to compare.
  facts   within    Carta is within TOL_C of the reference.
  rank    (reference, Carta)
  error   (reference, Carta): MAE in C headline; MdAPE is reported but not gated.
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

from layer_climate import iso2, km, num

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "data" / "reports" / "validation" / "sea" / "cmems_sst.csv"
BEACH_DIR = ROOT / "continent-app" / "public" / "beaches"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"

NAME = "sea"
SHARE = 1.0
MIN_PER_COUNTRY = 12
MAX_KM = 25.0
TOL_C = 1.5
CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.within", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 60},
]


def references(ctx):
    path = Path(ctx.get("reference") or REFERENCE)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            lat, lon, m, t = num(r.get("lat")), num(r.get("lon")), num(r.get("month")), num(r.get("sst_c"))
            if None in (lat, lon, m, t) or not 1 <= int(m) <= 12:
                continue
            sid = r.get("id") or r.get("name")
            out.append({"id": f"{sid}|{int(m):02d}", "point": sid, "name": r.get("name") or sid,
                        "countries": [iso2(r.get("cc"))], "lat": lat, "lon": lon, "month": int(m), "sst": t})
    return out


def _twelve(v):
    return isinstance(v, list) and len(v) == 12 and all(isinstance(x, (int, float)) for x in v)


def load(ctx):
    rows = []
    bdir = Path(ctx.get("beach_dir") or BEACH_DIR)
    for f in sorted(bdir.glob("*.json")) if bdir.is_dir() else []:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for b in data.get("beaches") or []:
            if _twelve(b.get("sea_temp")) and isinstance(b.get("lat"), (int, float)):
                rows.append({"id": b.get("id"), "name": b.get("name"), "kind": "beach", "cc": iso2(b.get("cc")),
                             "lat": b["lat"], "lon": b["lon"], "c": b["sea_temp"]})
    wire = Path(ctx.get("wire") or WIRE)
    try:
        dests = json.loads(wire.read_text(encoding="utf-8")).get("destinations") or {}
    except (OSError, ValueError):
        dests = {}
    for did, d in (dests.items() if isinstance(dests, dict) else enumerate(dests)):
        w = (d.get("climate") or {}).get("water_c")
        if _twelve(w) and isinstance(d.get("lat"), (int, float)):
            rows.append({"id": d.get("id", did), "name": d.get("city") or str(did), "kind": "dest",
                         "cc": iso2(d.get("iso2")), "lat": d["lat"], "lon": d["lon"], "c": w})
    cells = {}
    for r in rows:
        cells.setdefault((math.floor(r["lat"]), math.floor(r["lon"])), []).append(r)
    return {"rows": rows, "cells": cells, "n_beach": sum(r["kind"] == "beach" for r in rows),
            "n_dest": sum(r["kind"] == "dest" for r in rows)}


def nearest(carta, lat, lon):
    best, best_key = None, None
    ky, kx = math.floor(lat), math.floor(lon)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for r in carta["cells"].get((ky + dy, kx + dx), ()):
                d = km(lat, lon, r["lat"], r["lon"])
                if d <= MAX_KM:
                    key = (r["kind"] != "beach", d)      # a beach wins over a destination
                    if best is None or key < best_key:
                        best, best_key = r, key
    return (best, best_key[1]) if best else (None, None)


def match(refs, carta):
    out = []
    for r in refs:
        row, d = nearest(carta, r["lat"], r["lon"])
        res = {"id": r["id"], "country": r["countries"][0], "month": r["month"], "point": r["point"],
               "flags": {"matched": row is not None}, "facts": {}, "rank": None, "error": None}
        if row is None:
            res["note"] = "no_carta_sea_near"
        else:
            got = row["c"][r["month"] - 1]
            res["facts"] = {"within": abs(got - r["sst"]) <= TOL_C}
            res["rank"] = res["error"] = (r["sst"], got)
            res.update({"diff": round(got - r["sst"], 2), "ref": r["sst"], "carta": got, "name": r["name"],
                        "carta_id": row["id"], "carta_kind": row["kind"], "km": round(d, 1)})
            res["note"] = "agrees" if res["facts"]["within"] else ("carta_warmer" if got > r["sst"] else "carta_cooler")
        out.append(res)
    return out


def gaps(results, n=30):
    rs = [r for r in results if r.get("diff") is not None]
    rs.sort(key=lambda r: (-abs(r["diff"]), r["id"]))
    return [{"id": r["id"], "country": r["country"], "month": r["month"], "diff_c": r["diff"],
             "reference": r["ref"], "carta": r["carta"], "carta_id": r["carta_id"], "km": r["km"],
             "cause_code": r["note"]} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"path": str(ctx.get("_ref_path") or REFERENCE)},
            "carta": {"beaches_with_sea_temp": carta["n_beach"], "destinations_with_water_c": carta["n_dest"]}}
