"""Fold the climate normals harvested by harvest_climate.py into app_data.json.

Adds:
  - dest.climate              12-month normal + summary (only for dests present
                              in cache/climate.json; others are left untouched)
  - meta.climate_model        source / period / comfort-index definition
  - meta.data_sources.open_meteo  attribution entry
  - bumps meta.schema_version to >= 15

The climate block is small (~12 short rows per dest), so unlike activities it is
NOT stripped by sync-data.mjs - it ships straight to the app for the weather
"best time to go" view. Idempotent: re-running just refreshes from the cache.

Pipeline order:
    harvest_climate  ->  apply_climate  ->  sync-data (build)

Usage:
    python apply_climate.py                       # patches the default targets
    python apply_climate.py path/to/app_data.json [more.json ...]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "climate.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # real dataset
    ROOT / "continent-app" / "public" / "app_data.json",  # what the dev app serves
]

CLIMATE_MODEL = {
    "source": "WorldClim 2.1 (1970-2000 normals, 5 arc-min)",
    "period": "1970-2000",
    "vars": ["t_high", "t_low", "t_mean", "precip_mm", "comfort"],
    "comfort": {
        "range": "0-100",
        "weights": {"temp": 0.60, "dry": 0.25, "sun": 0.15},
        "definition": "Tourist-comfort index: daytime warmth (full marks 20-27C, "
                      "falling to 0 at 6C and 38C), dryness (100 at 0 mm/month, 0 "
                      "at ~130 mm), and sunshine from solar radiation.",
    },
    "summary_fields": ["best_months", "peak_comfort", "warmest", "wettest"],
}

DATA_SOURCE = {
    "provider": "WorldClim 2.1 (Fick & Hijmans 2017)",
    "license": "Free for academic and other uses; attribution requested",
    "used_for": "per-destination 12-month climate normals + tourist comfort index",
}


def _load(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def patch(path: Path, cache: dict) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.setdefault("meta", {})
    dests = data.get("destinations", {})

    applied = 0
    for did, dest in dests.items():
        rec = cache.get(did)
        if not rec:
            continue
        dest["climate"] = {
            "source": rec["source"],
            "period": rec["period"],
            "months": rec["months"],
            "summary": rec["summary"],
        }
        applied += 1

    meta["climate_model"] = CLIMATE_MODEL
    ds = meta.setdefault("data_sources", {})
    ds.pop("open_meteo", None)  # superseded by the bulk raster source
    ds["worldclim"] = DATA_SOURCE
    meta["schema_version"] = max(meta.get("schema_version", 0), 15)

    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    coverage = f"{applied}/{len(dests)}"
    print(f"  {path.name}: climate on {coverage} dests "
          f"({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> None:
    cache = _load(CACHE)
    if not cache:
        print("No cache/climate.json - run harvest_climate.py first.")
        return
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print(f"Applying climate layer (schema v15) from {len(cache)} cached normals:")
    for t in targets:
        patch(t, cache)


if __name__ == "__main__":
    main()
