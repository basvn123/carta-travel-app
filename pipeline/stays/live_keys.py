"""Xotelo keys per destination for the live bed price (T540).

The app's /api/stays asks Xotelo for tonight's real prices of a few properties
in a town, for the traveller's own nights. This picks those properties once,
from the discovered pool (discover_xotelo.py, no API calls here), with the same
rule as the price anchors (price_xotelo.choose_anchors): inside the town's
footprint, the most reviewed hotel in each price quartile and the two most
reviewed guesthouses. Hostels and apartments are left out: Xotelo's dorm and
whole-flat prices are too thin to beat the scrape and Inside Airbnb.

Each destination's stays record gains `xk`, a list of [key, kind, stars, band, typ]:
  key    Xotelo hotel key, "g{geo}-d{id}"
  kind   "h" hotel, "g" guesthouse
  stars  OSM star class matched by name and place, 0 when unknown
  band   hotel price quartile 0 (cheapest) to 3, -1 for a guesthouse
  typ    the property's typical night, the geometric mean of TripAdvisor's
         yearly low and high (EUR). The app compares tonight's price with it:
         the most reviewed hotels sit above the market, so their price is used
         as a factor on the model, not as the price itself.

Usage:
  python pipeline/stays/live_keys.py            patch out/stays/v1 in place
  python pipeline/stays/live_keys.py --public   and copy it into the app's public/
build_stays.py calls attach() on every build, so the monthly refresh keeps them.
"""

import argparse
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT, ROOT, load_destinations, read_json, write_json  # noqa: E402
from price_xotelo import PROPS, SUPPLY_RAW, choose_anchors  # noqa: E402

V = OUT / "v1"
PUBLIC = ROOT / "continent-app" / "public" / "stays" / "v1"
CELL = 4            # grid cells of 1/4 degree, so a town only scans its neighbours
# T562 calibration (calibrate_live.py, 2026-10-22: 85 ordinary Tuesdays in 26
# towns, 476 Xotelo calls): tonight / geomean(yearly low, high) ran at 0.804 of
# the model's own season, so the geometric mean sits about 24% above a hotel's
# real typical night. typ is scaled by that, so an ordinary week reads 1.0.
TYP_SCALE = 0.804
KIND = {"hotel": "h", "guesthouse": "g"}


def _grid(pool):
    g = defaultdict(list)
    for p in pool:
        if p.get("lat") is None or p.get("lon") is None or p.get("kind") not in KIND:
            continue
        g[(int(p["lat"] * CELL), int(p["lon"] * CELL))].append(p)
    return g


def keys_for(dest, grid, osm_rows):
    cy, cx = int(dest["lat"] * CELL), int(dest["lon"] * CELL)
    near = [p for dy in (-1, 0, 1) for dx in (-1, 0, 1) for p in grid.get((cy + dy, cx + dx), ())]
    picks = choose_anchors(dest, near, osm_rows)
    by_key = {p["key"]: p for p in near}
    out = []
    for a in picks:
        p = by_key.get(a["key"]) or {}
        lo, hi = p.get("pmin"), p.get("pmax")
        if a["kind"] not in KIND or not (lo and hi and 5 <= lo <= hi):
            continue
        out.append([a["key"], KIND[a["kind"]], a.get("stars") or 0, a.get("band", -1),
                    round((lo * hi) ** 0.5 * TYP_SCALE)])
    return out


def attach(records, dests=None):
    """Add `xk` to each record (dict id -> record). Returns how many have keys.
    Without a pool (a fresh Actions runner) it changes nothing."""
    pool = list((read_json(PROPS, {}) or {}).values())
    if not pool:
        return 0
    osm = read_json(SUPPLY_RAW, {}) or {}
    grid = _grid(pool)
    n = 0
    for d in dests or load_destinations():
        rec = records.get(d["id"])
        if rec is None or d.get("lat") is None:
            continue
        xk = keys_for(d, grid, osm.get(d["iso2"], []))
        if xk:
            rec["xk"] = xk
            n += 1
        else:
            rec.pop("xk", None)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", action="store_true")
    a = ap.parse_args()
    files = sorted(p for p in V.glob("*.json") if p.name != "manifest.json")
    if not files:
        sys.exit(f"no stays build in {V}: run build_stays.py first")
    data = {p: json.loads(p.read_text(encoding="utf-8")) for p in files}
    records = {i: r for d in data.values() for i, r in d["dests"].items()}
    n = attach(records)
    for p, d in data.items():
        write_json(p, d, compact=True)      # `built` is kept: same prices, more keys
    print(f"{n} of {len(records)} destinations have live keys")
    if a.public:
        for p in files:
            shutil.copy2(p, PUBLIC / p.name)
        print(f"copied {len(files)} files to {PUBLIC}")


if __name__ == "__main__":
    main()
