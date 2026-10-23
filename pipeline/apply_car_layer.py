"""Add the schema-v8 car layer to an existing app_data.json in place.

Tier: Manual

Adds:
  - meta.car_model                 (driving + rental parameters; see car_layer.py)
  - dest.local_transport           (car_needed / transit_quality / reason / rental
                                     rate / road_connected, per destination)
  - bumps meta.schema_version to 8

Idempotent: re-running just refreshes the values. Distances/fuel are computed at
runtime by the React app from meta.home + each dest's lat/lon, so nothing about
distance is stored here.

Usage:
    python apply_car_layer.py                      # patches the default targets
    python apply_car_layer.py path/to/app_data.json [more.json ...]
    python apply_car_layer.py --transit cache/transit_lines.json   # T642: {dest_id: {train,bus,ferry}}

T642: the car rule also reads the destination's rail/bus/ferry lines
(practical.transit.train/bus/ferry from T641, a {dest_id: {...}} JSON via
--transit or the default cache/transit_lines.json when it exists) and the OSM
parking harvest (cache/parking_osm.json). Both absent: the category rule.
"""

import json
import sys
from pathlib import Path

import car_layer
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",            # real 450-dest dataset
    ROOT / "continent-app" / "public" / "app_data.json",  # what the dev app serves
]


TRANSIT_DEFAULT = ROOT / "cache" / "transit_lines.json"
PARKING = ROOT / "cache" / "parking_osm.json"


def _load(p: Path):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def patch(path: Path, transit=None, parking=None) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("meta", {})

    meta["car_model"] = car_layer.CAR_MODEL
    # Never downgrade: later layers (beauty=9, images=10) may already have run.
    meta["schema_version"] = max(meta.get("schema_version", 0), 8)

    n_needed = 0
    for dest in data.get("destinations", {}).values():
        lt = car_layer.local_transport_for(
            dest.get("city"),
            dest.get("iso2"),
            dest.get("tier"),
            dest.get("categories") or [],
            transit=(transit or {}).get(dest.get("id")),
            parking=(parking or {}).get(dest.get("id")),
        )
        dest["local_transport"] = lt
        if lt["car_needed"]:
            n_needed += 1

    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    n = len(data.get("destinations", {}))
    print(f"  {path.name}: {n} destinations, {n_needed} need a car "
          f"({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> None:
    args = sys.argv[1:]
    transit_path = TRANSIT_DEFAULT
    if "--transit" in args:
        i = args.index("--transit")
        transit_path = Path(args[i + 1])
        del args[i:i + 2]
    targets = [Path(a) for a in args] or DEFAULT_TARGETS
    transit = _load(transit_path)
    parking = (_load(PARKING) or {}).get("dests")
    print(f"Applying car layer (schema v8): transit lines {'yes' if transit else 'absent'}, "
          f"parking {len(parking) if parking else 'absent'}")
    for t in targets:
        patch(t, transit, parking)


if __name__ == "__main__":
    main()
