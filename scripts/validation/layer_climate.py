"""Climate on the D23 validation runner (T1194, ROADMAP D23 Climate row).

Reference: monthly normals from a national met office or the WMO 1991-2020
set, supplied by the owner as one long CSV (no script reads a met office site;
see the T1194 report for sources and terms):

    data/reports/validation/climate/normals.csv
    id,name,cc,lat,lon,elev_m,month,tmax_c,tmin_c,precip_mm,source,period

One row per station and month (month 1 to 12). elev_m may be empty. A station
is one stratum item per month, so the runner's country strata, sampling and
Wilson intervals work as for every other layer. Carta's side is the shipped
wire `continent-app/public/app_data.json` (destination `climate.m`: twelve
[high, low, precip, comfort] rows), read from disk, no network.

A station matches the nearest Carta destination within MAX_KM whose ground
elevation (climate.elev_m, or climate.elev) is within MAX_ELEV_M of the
station's, when both are known. Carta temperatures are lapse corrected to
that elevation, so a valley station against a hill town is a bad pair, not
a Carta fault.

  flags   matched   the station-month has a Carta destination to compare.
  facts   tmax      Carta's high is within TEMP_TOL C of the normal.
          tmin      Carta's low is within TEMP_TOL C of the normal.
          rain      Carta's precipitation is within RAIN_REL of the normal
                    or RAIN_ABS mm (whichever is wider; dry months are noisy).
  rank    (reference mean temperature, Carta mean temperature).
  error   (reference mean temperature, Carta mean temperature): MAE in C is
          the headline; MdAPE is not meaningful near 0 C and is not gated.
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NORMALS = ROOT / "data" / "reports" / "validation" / "climate" / "normals.csv"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"

NAME = "climate"
SHARE = 1.0
MIN_PER_COUNTRY = 12
MAX_KM = 30.0
MAX_ELEV_M = 250.0
TEMP_TOL = 2.0
RAIN_REL = 0.30
RAIN_ABS = 15.0
ISO_ALIAS = {"EL": "GR", "UK": "GB"}

CHECKS = [
    {"metric": "coverage", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.tmax", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.tmin", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "fact.rain", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 60},
    {"metric": "error_mae", "kind": "soft", "direction": "lower", "tolerance_points": 5, "min_n": 60},
]


def km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 12742.0 * math.asin(math.sqrt(a))


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def iso2(code):
    code = (code or "").strip().upper()
    return ISO_ALIAS.get(code, code)


def references(ctx):
    path = Path(ctx.get("reference") or NORMALS)
    ctx["_ref_path"] = path
    if not path.exists():
        return []
    out = []
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            lat, lon, m = num(r.get("lat")), num(r.get("lon")), num(r.get("month"))
            hi, lo, pr = num(r.get("tmax_c")), num(r.get("tmin_c")), num(r.get("precip_mm"))
            if lat is None or lon is None or m is None or not 1 <= int(m) <= 12 or hi is None or lo is None:
                continue
            sid = r.get("id") or r.get("name")
            out.append({"id": f"{sid}|{int(m):02d}", "station": sid, "name": r.get("name") or sid,
                        "countries": [iso2(r.get("cc"))], "lat": lat, "lon": lon,
                        "elev": num(r.get("elev_m")), "month": int(m),
                        "tmax": hi, "tmin": lo, "precip": pr})
    return out


def load(ctx):
    """Carta destinations with a full climate block, from the wire."""
    path = Path(ctx.get("wire") or WIRE)
    try:
        dests = json.loads(path.read_text(encoding="utf-8")).get("destinations") or {}
    except (OSError, ValueError):
        dests = {}
    rows = []
    for did, d in (dests.items() if isinstance(dests, dict) else enumerate(dests)):
        c = d.get("climate") or {}
        m = c.get("m")
        if not (isinstance(m, list) and len(m) == 12 and isinstance(d.get("lat"), (int, float))):
            continue
        elev = c.get("elev_m", c.get("elev"))
        rows.append({"id": d.get("id", did), "name": d.get("city") or d.get("name") or str(did),
                     "cc": iso2(d.get("iso2")), "lat": d["lat"], "lon": d["lon"], "m": m,
                     "elev": elev if isinstance(elev, (int, float)) else None})
    return {"rows": rows, "cells": _grid(rows), "path": str(path)}


def _grid(rows):
    g = {}
    for r in rows:
        g.setdefault((math.floor(r["lat"]), math.floor(r["lon"])), []).append(r)
    return g


def nearest(carta, lat, lon, elev=None, max_km=MAX_KM, max_elev=MAX_ELEV_M):
    """(row, km, status): status ok, elevation, or none."""
    best, best_d, elev_hit = None, None, False
    ky, kx = math.floor(lat), math.floor(lon)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for r in carta["cells"].get((ky + dy, kx + dx), ()):
                d = km(lat, lon, r["lat"], r["lon"])
                if d > max_km:
                    continue
                if elev is not None and r["elev"] is not None and abs(elev - r["elev"]) > max_elev:
                    elev_hit = True
                    continue
                if best is None or d < best_d:
                    best, best_d = r, d
    if best:
        return best, best_d, "ok"
    return None, None, "elevation" if elev_hit else "none"


def rain_ok(ref, got):
    return abs(got - ref) <= max(RAIN_ABS, RAIN_REL * ref)


def match(refs, carta):
    out = []
    for r in refs:
        row, d, status = nearest(carta, r["lat"], r["lon"], r["elev"])
        res = {"id": r["id"], "country": r["countries"][0], "month": r["month"], "station": r["station"],
               "flags": {"matched": row is not None}, "facts": {}, "rank": None, "error": None}
        if row is None:
            res["note"] = "no_destination_near" if status == "none" else "elevation_mismatch"
            out.append(res)
            continue
        hi, lo, pr = row["m"][r["month"] - 1][:3]
        ref_mean, got_mean = (r["tmax"] + r["tmin"]) / 2, (hi + lo) / 2
        res["facts"] = {"tmax": abs(hi - r["tmax"]) <= TEMP_TOL, "tmin": abs(lo - r["tmin"]) <= TEMP_TOL,
                        "rain": None if r["precip"] is None or pr is None else rain_ok(r["precip"], pr)}
        res["rank"] = res["error"] = (round(ref_mean, 2), round(got_mean, 2))
        res.update({"diff": round(got_mean - ref_mean, 2), "dest": row["id"], "dest_name": row["name"],
                    "km": round(d, 1), "ref": {"tmax": r["tmax"], "tmin": r["tmin"], "precip": r["precip"]},
                    "carta": {"tmax": hi, "tmin": lo, "precip": pr}, "name": r["name"]})
        res["note"] = "agrees" if res["facts"]["tmax"] and res["facts"]["tmin"] else (
            "carta_warmer" if got_mean > ref_mean else "carta_cooler")
        out.append(res)
    return out


def gaps(results, n=30):
    rs = [r for r in results if r.get("diff") is not None]
    rs.sort(key=lambda r: (-abs(r["diff"]), r["id"]))
    return [{"id": r["id"], "country": r["country"], "month": r["month"], "diff_c": r["diff"],
             "reference": r["ref"], "carta": r["carta"], "dest": r["dest"], "km": r["km"],
             "cause_code": r["note"]} for r in rs[:n]]


def describe(ctx, carta):
    return {"reference": {"path": str(ctx.get("_ref_path") or NORMALS)},
            "carta": {"wire": carta["path"], "destinations_with_climate": len(carta["rows"])}}
