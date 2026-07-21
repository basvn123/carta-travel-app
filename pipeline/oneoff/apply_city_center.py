"""Add schema-v13 city-centre coordinates to app_data.json in place.

Airport-tier destinations store their AIRPORT lat/lon - that's where Ryanair
lands. For "how far is my stay from the city" UX (the Day planner's
door-to-door advice especially) measuring from the airport is wrong: a stay in
central Copenhagen reads ~6 km from CPH's stored coordinate even though you're
already downtown, which wrongly triggers an inter-city "getting there" leg.

This layer adds, per destination:
  - dest.city_lat / dest.city_lon    the actual city centre

Gems already store city-centre coordinates, so city_lat/lon == lat/lon for
them. For airport-tier rows the centre is derived from the destination's
harvested sights (activities.items_full): the coordinate-wise median of the
POIs, which is robust to a few outlying attractions and lands on the historic
core. Destinations without enough POIs fall back to their stored lat/lon (no
worse than today).

Because it reads activities.items_full, run this BEFORE sync-data strips that
field - i.e. against app_data/app_data.json, then `npm run data` ships it into
continent-app/public/app_data.json.

Idempotent: re-running just refreshes city_lat/city_lon.

Usage:
    python apply_city_center.py                    # patches app_data/app_data.json
    python apply_city_center.py --report           # dry run, prints biggest shifts
    python apply_city_center.py path/to/app_data.json [more.json ...]
"""

import json
import math
import sys
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[2]
# Only the master carries activities.items_full; sync-data.mjs then propagates
# city_lat/city_lon into public/app_data.json (npm run data).
DEFAULT_TARGETS = [ROOT / "app_data" / "app_data.json"]

MIN_POIS = 5  # below this the median is too noisy - keep the stored coordinate


def _haversine_km(a_lat, a_lon, b_lat, b_lon):
    r = 6371.0
    p = math.pi / 180
    dlat = (b_lat - a_lat) * p
    dlon = (b_lon - a_lon) * p
    h = (math.sin(dlat / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def city_center_for(dest):
    """Return (city_lat, city_lon, source) for a destination.

    Gems already sit on their centre; airport rows use the median of their
    harvested POIs, falling back to the stored (airport) coordinate.
    """
    lat, lon = dest.get("lat"), dest.get("lon")
    if dest.get("tier") == "gem":
        return lat, lon, "gem"

    pois = (dest.get("activities") or {}).get("items_full") or []
    lats = [p["lat"] for p in pois if isinstance(p.get("lat"), (int, float))]
    lons = [p["lon"] for p in pois if isinstance(p.get("lon"), (int, float))]
    if len(lats) >= MIN_POIS and len(lons) >= MIN_POIS:
        return round(median(lats), 5), round(median(lons), 5), "pois"
    return lat, lon, "fallback"


def patch(path: Path, report_only: bool = False) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.setdefault("meta", {})

    shifts = []  # (km, id, city) for airport rows, to sanity-check the derivation
    n_pois = n_fallback = 0
    for dest in data.get("destinations", {}).values():
        clat, clon, source = city_center_for(dest)
        dest["city_lat"] = clat
        dest["city_lon"] = clon
        if source == "pois":
            n_pois += 1
            if dest.get("lat") is not None:
                shifts.append((
                    _haversine_km(dest["lat"], dest["lon"], clat, clon),
                    dest.get("id"), dest.get("city"),
                ))
        elif source == "fallback":
            n_fallback += 1

    if report_only:
        shifts.sort(reverse=True)
        print(f"  {path.name}: {n_pois} airport centres from POIs, "
              f"{n_fallback} fell back to airport coord")
        print("  biggest airport->centre shifts (km):")
        for km, did, city in shifts[:12]:
            print(f"    {km:6.1f}  {did:<10} {city}")
        return

    # Never downgrade: this layer runs after activities (v12).
    meta["schema_version"] = max(meta.get("schema_version", 0), 13)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    n = len(data.get("destinations", {}))
    print(f"  {path.name}: {n} destinations, {n_pois} airport centres from POIs, "
          f"{n_fallback} fell back ({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    report_only = "--report" in sys.argv[1:]
    targets = [Path(a) for a in args] or DEFAULT_TARGETS
    print(f"Applying city-centre layer (schema v13){' [dry run]' if report_only else ''}:")
    for t in targets:
        patch(t, report_only=report_only)


if __name__ == "__main__":
    main()
