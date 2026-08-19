"""Add the schema-v8 car layer to an existing app_data.json in place.

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


def patch(path: Path) -> None:
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
        )
        dest["local_transport"] = lt
        if lt["car_needed"]:
            n_needed += 1

    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    n = len(data.get("destinations", {}))
    print(f"  {path.name}: {n} destinations, {n_needed} need a car "
          f"({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying car layer (schema v8):")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
