"""Opening hours (and a fare record) of the lift beside a peak, from OpenStreetMap.

Tier: On demand (T641; read by export_peaks.py through explore_overlay)

Source: OpenStreetMap contributors, ODbL 1.0 (commercial use allowed, credit
required), via Overpass: the `opening_hours` and `charge` tags on aerialway
(cable_car, gondola, chair_lift, mixed_lift, funicular as railway=funicular or
railway=rack) within LIFT_M of the peak. The nearest lift that carries an
`opening_hours` tag wins. The hours are kept as the OSM opening_hours string
(for example "Mo-Su 08:30-17:00; Dec 25 off"), unparsed, with the lift name.
A lift with no tag gives no row: absence is "not mapped".

Only peaks whose published wire row already says a lift serves them
(a `why` entry of kind lift) are asked, so a mountain with no lift is not
given hours by chance.

Prices: `charge` is read when it parses to one amount and written as a price
record `fare` {value, unit, currency, source, date, quality}. The app's
`lift.price` slot is NOT filled from it (no price is shown in this batch;
price plan phase F9 reads `lift.fare`).

    cache/peak_lift_hours.json rows[peak id] = {
        "hours": "Mo-Su 08:30-17:00", "name": "...", "m": distance from the peak,
        "src": "OpenStreetMap opening_hours", "date": "YYYY-MM-DD",
        "fare"?: {"value", "unit": "per person, single ride"?, "currency", "source", "date", "quality"}}

Usage, from the repo root:
    python pipeline/mountains/harvest_lift_hours.py --countries AT --limit 40    # sample
    python pipeline/mountains/harvest_lift_hours.py                               # all (about 30 min)

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
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
import explore_overlay as ov  # noqa: E402
import sources  # noqa: E402
from harvest_poi_fees import parse_charge  # noqa: E402

LIFT_M = 2500
BATCH = 20


def hav_m(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))


def has_lift(row: dict) -> bool:
    return any(w.get("k") == "lift" for w in row.get("why") or [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--out-dir")
    a = ap.parse_args()
    want = set(a.countries.split(",")) if a.countries else None
    peaks = []
    for f in sorted((INPUT / "continent-app" / "public" / "mountains").glob("[A-Z][A-Z].json")):
        if want and f.stem not in want:
            continue
        for r in json.loads(f.read_text(encoding="utf-8")).get("mountains", []):
            if has_lift(r):
                peaks.append(r)
    if a.limit:
        peaks = peaks[:a.limit]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = {}
    for i in range(0, len(peaks), BATCH):
        batch = peaks[i:i + BATCH]
        clauses = "".join(
            f'nwr(around:{LIFT_M},{p["lat"]},{p["lon"]})["aerialway"~"^(cable_car|gondola|chair_lift|mixed_lift)$"]["opening_hours"];'
            f'nwr(around:{LIFT_M},{p["lat"]},{p["lon"]})["railway"~"^(funicular|rack)$"]["opening_hours"];'
            for p in batch)
        q = f"[out:json][timeout:240];({clauses});out tags center;"
        els = None
        for ep in sources.OVERPASS_ENDPOINTS:
            try:
                els = json.loads(sources.request(ep, data={"data": q}, timeout=280, tries=2))["elements"]
                break
            except Exception:
                continue
        if els is None:
            print(f"  batch {i} failed", flush=True)
            continue
        for p in batch:
            best = None
            for e in els:
                c = e.get("center") or {}
                la, lo = e.get("lat", c.get("lat")), e.get("lon", c.get("lon"))
                if la is None:
                    continue
                m = hav_m(p["lat"], p["lon"], la, lo)
                if m <= LIFT_M and (best is None or m < best[0]):
                    best = (m, e.get("tags") or {})
            if best:
                t = best[1]
                row = {"hours": t["opening_hours"][:120], "m": int(best[0]),
                       "src": "OpenStreetMap opening_hours", "date": today}
                if t.get("name"):
                    row["name"] = t["name"][:60]
                got = parse_charge(t.get("charge") or "")
                if got:
                    row["fare"] = {"value": got[0], "unit": "per person", "currency": got[1],
                                   "source": "OpenStreetMap charge tag", "date": today, "quality": "osm_text"}
                rows[p["id"]] = row
        print(f"  {min(i + BATCH, len(peaks))}/{len(peaks)} peaks, {len(rows)} with hours", flush=True)
    meta = {"source": "OpenStreetMap contributors (ODbL 1.0) opening_hours, charge", "date": today, "method": "measured"}
    ov.save("peak_lift_hours", rows, meta, Path(a.out_dir) if a.out_dir else None)
    print("peaks asked", len(peaks), "with hours", len(rows))


if __name__ == "__main__":
    main()
