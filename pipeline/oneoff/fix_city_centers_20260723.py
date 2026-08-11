"""One-off, 2026-07-23: repair runway-anchored city centres from geonames.

The data audit's open item "~30 runway city-centres" turned out to be 79:
IATA city/town dests whose city_lat/city_lon sit at/near the airport instead
of downtown (Vienna's was 22 km out, so the POI harvest around it collected
parish churches near Schwechat). The dest's geonames block already names the
right settlement (name-validated rematch); its dist_km > 3 exposes the bad
centre. Repair: set city_lat/city_lon to the matched geonames record's own
coordinates (cache/geonames_cities500.txt, keyed by geonameid) and update
dist_km. Gems are untouched: their anchor is the site itself, and a distant
geonames settlement is expected there.

Run from repo root:  python pipeline/oneoff/fix_city_centers_20260723.py
Prints the fixed list; writes both app_data.json targets atomically.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline_io import atomic_write_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CITIES = ROOT / "cache" / "geonames_cities500.txt"
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
DIST_KM_BAD = 3.0


def geonames_coords():
    """geonameid -> (lat, lon) from the cities500 dump (tab-separated)."""
    out = {}
    with open(CITIES, encoding="utf-8") as f:
        for line in f:
            p = line.split("\t")
            if len(p) > 5:
                try:
                    out[int(p[0])] = (float(p[4]), float(p[5]))
                except ValueError:
                    continue
    return out


def km(a, b, c, d):
    return 111 * math.sqrt((a - c) ** 2 + ((b - d) * math.cos(math.radians(a))) ** 2)


def main():
    coords = geonames_coords()
    fixed_ids = []
    for path in TARGETS:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        fixed = 0
        for code, v in data["destinations"].items():
            if code.startswith("gem:"):
                continue
            g = v.get("geonames") or {}
            if (g.get("dist_km") or 0) <= DIST_KM_BAD:
                continue
            if g.get("settlement") not in ("city", "town"):
                continue
            c = coords.get(g.get("geonameid"))
            if not c:
                print(f"  ! no cities500 row for {code} ({g.get('geonameid')})")
                continue
            old = (v.get("city_lat"), v.get("city_lon"))
            v["city_lat"], v["city_lon"] = c
            g["dist_km"] = 0.0
            fixed += 1
            if path == TARGETS[0]:
                fixed_ids.append(code)
                moved = km(old[0], old[1], c[0], c[1]) if old[0] is not None else -1
                print(f"  {code} {v.get('city')}: centre moved {moved:.1f} km")
        atomic_write_json(path, data)
        print(f"{path.name}: {fixed} city centres repaired")
    (ROOT / "cache" / "recentered_city_lat_20260723.json").write_text(
        json.dumps(fixed_ids), encoding="utf-8")


if __name__ == "__main__":
    main()
