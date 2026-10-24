"""Walk from the town centre and from the nearest ferry pier to each beach.

Tier: On demand (T641; read by export_beaches.py through explore_overlay)

Sources: the beach's own position and its base town (published beach wires and
app_data), plus OpenStreetMap ferry terminals (ODbL 1.0, Overpass union queries per
batch of 25 beaches: amenity=ferry_terminal, and public_transport=station or platform with
ferry=yes).

Method, said plainly because it is modelled and not a routed path: the walk is
the straight line between the two points times a detour factor of 1.3, at
4.5 km/h. It is the same detour factor the pipeline uses for roads
(apply_airport_anchors.DETOUR), kept for walking because no pedestrian router
is wired here. Where a router is available later (the trailslab Valhalla),
replace `km` and `min` and set `m` to "routed"; the keys do not change.

    cache/beach_walks.json rows[beach id] = {
        "centre": {"km", "min", "town", "m": "modelled"},      # base town centre
        "pier":   {"km", "min", "name", "m": "modelled"}}      # within PIER_MAX_KM
A pier farther than PIER_MAX_KM (straight line) is left out: a ferry pier 20 km
away is not "the pier". A centre farther than CENTRE_MAX_KM is left out too.

Usage, from the repo root:
    python pipeline/beaches/harvest_beach_walks.py --countries IT        # sample
    python pipeline/beaches/harvest_beach_walks.py                       # all (about 15 min)
    --out-dir DIR  write under DIR instead of cache/

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INPUT = Path(os.environ.get("CARTA_INPUT_ROOT", ROOT))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402

DETOUR = 1.3
SPEED_KMH = 4.5
PIER_MAX_KM = 4.0
CENTRE_MAX_KM = 8.0
BATCH = 25                 # beaches per Overpass union query


def haversine_km(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def walk(km_line: float) -> dict:
    km = km_line * DETOUR
    return {"km": round(km, 1), "min": int(round(km / SPEED_KMH * 60 / 5.0) * 5) or 5, "m": "modelled"}


def piers_near(batch: list) -> list:
    """[(lat, lon, name)] ferry terminals within PIER_MAX_KM of any beach of a
    batch of (id, lat, lon). Union queries, not a country area query: area
    queries over a whole country timed out on every mirror in the T641 trial."""
    r = int(PIER_MAX_KM * 1000)
    clauses = "".join(
        f'nwr(around:{r},{la},{lo})["amenity"="ferry_terminal"];'
        f'nwr(around:{r},{la},{lo})["public_transport"~"^(station|platform)$"]["ferry"="yes"];'
        for _, la, lo in batch)
    q = f"[out:json][timeout:300];({clauses});out tags center;"
    last = None
    for ep in sources.OVERPASS_ENDPOINTS:
        try:
            els = json.loads(sources.request(ep, data={"data": q}, timeout=330, tries=2))["elements"]
            break
        except Exception as exc:
            last = exc
    else:
        raise RuntimeError(f"batch failed: {last}")
    out = []
    for e in els:
        c = e.get("center") or {}
        lat, lon = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
        if lat is None or lon is None:
            continue
        out.append((lat, lon, (e.get("tags") or {}).get("name") or ""))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries")
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    want = set(a.countries.split(",")) if a.countries else None
    dests = json.loads((INPUT / "continent-app" / "public" / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    rows, stats = {}, {"beaches": 0, "centre": 0, "pier": 0}
    for p in sorted((INPUT / "continent-app" / "public" / "beaches").glob("*.json")):
        cc = p.stem
        if want and cc not in want:
            continue
        beaches = json.loads(p.read_text(encoding="utf-8")).get("beaches", [])
        piers_by = {}
        ordered = sorted(beaches, key=lambda x: (x["lat"], x["lon"]))
        for i in range(0, len(ordered), BATCH):
            batch = ordered[i:i + BATCH]
            try:
                found = piers_near([(b["id"], b["lat"], b["lon"]) for b in batch])
            except Exception as exc:
                print(f"{cc}: a batch of {len(batch)} failed ({str(exc)[:80]}), no piers for it", flush=True)
                found = []
            for b in batch:
                piers_by[b["id"]] = found
        for b in beaches:
            stats["beaches"] += 1
            row = {}
            base = b.get("base") or {}
            d = dests.get(base.get("id")) if base.get("id") else None
            if d:
                lat, lon = d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon"))
                if lat is not None:
                    km = haversine_km(b["lat"], b["lon"], lat, lon)
                    if km <= CENTRE_MAX_KM:
                        row["centre"] = {**walk(km), "town": base.get("city") or d.get("city")}
                        stats["centre"] += 1
            best = None
            for la, lo, name in piers_by.get(b["id"], []):
                km = haversine_km(b["lat"], b["lon"], la, lo)
                if km <= PIER_MAX_KM and (best is None or km < best[0]):
                    best = (km, name)
            if best:
                row["pier"] = {**walk(best[0])}
                if best[1]:
                    row["pier"]["name"] = best[1]
                stats["pier"] += 1
            if row:
                rows[b["id"]] = row
        print(f"{cc}: {len(beaches)} beaches, {sum(len(v) for v in piers_by.values())} terminal hits", flush=True)
    meta = {"source": "base town and beach positions; OpenStreetMap ferry terminals (ODbL 1.0)",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "method": "modelled",
            "rule": f"straight line x {DETOUR} at {SPEED_KMH} km/h", "unit": "km, minutes"}
    ov.save("beach_walks", rows, meta, Path(a.out_dir) if a.out_dir else None)
    print(stats)


if __name__ == "__main__":
    main()
