"""Monthly water temperature per beach and per coastal destination.

Tier: On demand (T641; the full run is T640's, see Execution/P15)

Source: NASA JPL MUR SST v4.1 (GHRSST Level 4, 0.01 degree), the monthly mean
product served by NOAA CoastWatch ERDDAP (dataset jplMURSST41mday). Public
domain (NASA PO.DAAC data policy: no restrictions on use or redistribution,
credit requested), so it is clear for commercial use. A satellite foundation
SST, measured.

Method: per 1 degree tile, one ERDDAP call returns every month of the years
YEAR_FROM..YEAR_TO on a 0.03 degree stride (about 3 km). The calendar-month
mean over those years is the climatology of a cell. A cell counts when all
twelve months are valid. A point takes the nearest valid cell within
MAX_KM. Lakes are in the product too (it is a water mask, not a sea mask),
so a lake beach gets the lake surface temperature.

Outputs (cache/, read by export_beaches.py and apply_climate.py):
    sea_temp_beaches.json   rows: {beach id: {"c": [12], "km": d, "cell": [lat, lon]}}
    sea_temp_dest.json      rows: {destination id: {"c": [12], "km": d}}
Tiles are cached in cache/sea_temp/ (one small json each, resumable).

Usage, from the repo root:
    python pipeline/harvest_sea_temp.py --point 40.62,14.48          # one point
    python pipeline/harvest_sea_temp.py --beaches --countries IT     # sample
    python pipeline/harvest_sea_temp.py --beaches --dests            # full run
    --out-dir DIR   write the outputs and tiles under DIR instead of cache/

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# CARTA_INPUT_ROOT points the reads (wires) at another checkout, for a sparse worktree
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(ROOT / "pipeline"))
import explore_overlay as ov  # noqa: E402

ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41mday.csv?sst"
UA = {"User-Agent": "CartaSeaTemp/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"}
YEAR_FROM, YEAR_TO = 2017, 2022
STRIDE = 3                      # x 0.01 degree
BEACH_MAX_KM = 6.0
DEST_MAX_KM = 20.0
PLAUSIBLE = (-2.0, 32.0)        # water 0 to 32 C gate, with a margin at the cold end
SOURCE = ("NASA JPL MUR SST v4.1 via NOAA CoastWatch ERDDAP jplMURSST41mday, "
          f"monthly mean {YEAR_FROM}-{YEAR_TO}")
LICENCE = "Public domain (NASA PO.DAAC, no restrictions on use; credit requested)"


def _tile_dir(base: Path) -> Path:
    d = base / "sea_temp"
    d.mkdir(parents=True, exist_ok=True)
    return d


def fetch_tile(la: int, lo: int, base: Path) -> dict:
    """{(lat, lon): [12]} for the 1 degree tile whose south-west corner is
    (la, lo). Cached on disk; an empty tile (open land) is cached too."""
    path = _tile_dir(base) / f"{la}_{lo}.json"
    if path.exists():
        doc = json.loads(path.read_text(encoding="utf-8"))
        return {(c[0], c[1]): c[2] for c in doc["cells"]}
    t0, t1 = f"{YEAR_FROM}-01-16T12:00:00Z", f"{YEAR_TO}-12-16T12:00:00Z"
    url = (f"{ERDDAP}%5B({t0}):1:({t1})%5D%5B({la}):{STRIDE}:({la + 1})%5D"
           f"%5B({lo}):{STRIDE}:({lo + 1})%5D")
    last = None
    body = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read().decode("utf-8")
            break
        except Exception as exc:
            last = exc
            if getattr(exc, "code", None) == 404:   # no data in the window
                body = ""
                break
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"tile {la},{lo}: {last}")
    sums: dict = {}
    if body:
        rd = csv.reader(io.StringIO(body))
        next(rd, None)
        next(rd, None)
        for row in rd:
            if len(row) < 4 or row[3] in ("NaN", ""):
                continue
            month = int(row[0][5:7]) - 1
            key = (round(float(row[1]), 2), round(float(row[2]), 2))
            acc = sums.setdefault(key, [[0.0, 0] for _ in range(12)])
            acc[month][0] += float(row[3])
            acc[month][1] += 1
    cells = []
    for key, acc in sums.items():
        if all(n > 0 for _, n in acc):
            vals = [round(s / n, 1) for s, n in acc]
            if all(PLAUSIBLE[0] <= v <= PLAUSIBLE[1] for v in vals):
                cells.append([key[0], key[1], vals])
    path.write_text(json.dumps({"tile": [la, lo], "stride": STRIDE, "cells": cells},
                               separators=(",", ":")), encoding="utf-8")
    return {(c[0], c[1]): c[2] for c in cells}


def haversine_km(a, b, c, d):
    p = math.pi / 180
    x = (math.sin((c - a) * p / 2) ** 2
         + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(x))


def lookup(lat: float, lon: float, base: Path, max_km: float):
    """(12 values, km, (cell lat, cell lon)) of the nearest valid cell within
    max_km, or None. Reads the tiles that cover the search window."""
    span = max_km / 111.0 + 0.05
    tiles = {(math.floor(la), math.floor(lo))
             for la in (lat - span, lat + span) for lo in (lon - span, lon + span)}
    best = None
    for la, lo in sorted(tiles):
        for (cl, co), vals in fetch_tile(la, lo, base).items():
            km = haversine_km(lat, lon, cl, co)
            if km <= max_km and (best is None or km < best[1]):
                best = (vals, km, (cl, co))
    return best


def beach_points(countries):
    pub = INPUT / "continent-app" / "public" / "beaches"
    for p in sorted(pub.glob("*.json")):
        if countries and p.stem not in countries:
            continue
        for b in json.loads(p.read_text(encoding="utf-8")).get("beaches", []):
            yield b["id"], b["lat"], b["lon"]


def dest_points():
    doc = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))
    for did, d in doc["destinations"].items():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if lat is not None and lon is not None:
            yield did, lat, lon


def run(points, base: Path, max_km: float, label: str):
    rows, n = {}, 0
    for pid, lat, lon in points:
        n += 1
        hit = lookup(lat, lon, base, max_km)
        if hit:
            rows[pid] = {"c": hit[0], "km": round(hit[1], 1), "cell": list(hit[2])}
        if n % 200 == 0:
            print(f"  {label}: {n} points, {len(rows)} with a water cell", flush=True)
    print(f"{label}: {len(rows)} of {n} points carry a temperature")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--point")
    ap.add_argument("--beaches", action="store_true")
    ap.add_argument("--dests", action="store_true")
    ap.add_argument("--countries")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    base = Path(a.out_dir) if a.out_dir else ov.CACHE
    base.mkdir(parents=True, exist_ok=True)
    if a.point:
        lat, lon = map(float, a.point.split(","))
        print(lookup(lat, lon, base, DEST_MAX_KM))
        return
    meta = {"source": SOURCE, "licence": LICENCE, "method": "measured",
            "unit": "degree_C", "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "url": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41mday.html"}
    countries = set(a.countries.split(",")) if a.countries else None

    def cap(it):
        for i, x in enumerate(it):
            if a.limit and i >= a.limit:
                return
            yield x

    if a.beaches:
        rows = run(cap(beach_points(countries)), base, BEACH_MAX_KM, "beaches")
        ov.save("sea_temp_beaches", rows, meta, base)
    if a.dests:
        rows = run(cap(dest_points()), base, DEST_MAX_KM, "destinations")
        ov.save("sea_temp_dest", rows, meta, base)


if __name__ == "__main__":
    main()
