"""Add per-country toll & vignette estimates to app_data.json in place.

Adds:
  - meta.car_model.toll_model  ("per_country_v1" + the full rate tables)
  - dest.driving_toll          (round-trip tolls PER CAR: per-km tolls by
                                corridor country, vignettes, fixed crossings)

The runtime (runtime_pricing.drivingEstimate) prefers dest.driving_toll and
falls back to the old flat toll_eur_per_100km when it is absent. Destinations
that cannot be driven to (road_connected false) get no block. Idempotent.

Usage:
    python apply_toll_layer.py                      # patches the default targets
    python apply_toll_layer.py path/to/app_data.json [more.json ...]
"""

import json
import sys
from pathlib import Path

import toll_layer

ROOT = Path(__file__).resolve().parent
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]


def patch(path: Path, index) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("meta", {})
    home = meta.get("home") or {}
    home_pt = (home.get("lat", 50.8466), home.get("lon", 4.3528))

    n = with_block = 0
    for dest in data.get("destinations", {}).values():
        n += 1
        block = toll_layer.compute_driving_toll(index, home_pt, dest)
        if block:
            dest["driving_toll"] = block
            with_block += 1
        else:
            dest.pop("driving_toll", None)

    meta.setdefault("car_model", {})["toll_model"] = toll_layer.TOLL_MODEL
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False),
                    encoding="utf-8")
    print(f"  {path.name}: {with_block}/{n} destinations tolled "
          f"({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying toll layer (per_country_v1):")
    index = toll_layer.CountryIndex()
    for t in targets:
        patch(t, index)


if __name__ == "__main__":
    main()
