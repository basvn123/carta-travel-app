"""Fold the climate normals harvested by harvest_climate.py into app_data.json.

Tier: Scheduled (run_pipeline task climate)

Adds:
  - dest.climate              12-month normal + summary (+ T631: rain_days,
                              wind_ms, elev_m parallel keys when harvested) (only for dests present
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
from pipeline_io import atomic_write_json
from derive_sunshine import METHOD as SUN_METHOD, sun_hours

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "climate.json"
ELEV = ROOT / "cache" / "climate_elevations.json"
RAW = ROOT / "cache" / "climate_power_raw.json"       # NASA POWER monthly means (ALLSKY_SFC_SW_DWN)
SEA = ROOT / "cache" / "sea_temp_dest.json"           # T641: harvest_sea_temp.py --dests
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # real dataset
    ROOT / "continent-app" / "public" / "app_data.json",  # what the dev app serves
]

CLIMATE_MODEL = {
    # NASA POWER replaced WorldClim 2.1 on 2026-08-26: WorldClim's licence is
    # non-commercial only, and the destination dossier now redistributes the
    # monthly values inside exported PDFs. POWER is US-government open data,
    # covers every land coordinate (so the old 39 percent gap closes), and its
    # 2001-2020 window is a truer "what will it be like" than 1970-2000.
    # Values are lapse-corrected from the MERRA-2 cell's mean elevation to the
    # destination's own (6.5 C/km, capped 5 C) - see harvest_climate_power.py.
    "source": "NASA POWER (MERRA-2), 2001-2020 climatology, lapse-corrected",
    "period": "2001-2020",
    "vars": ["t_high", "t_low", "t_mean", "precip_mm", "comfort"],
    # T631: parallel arrays beside `months`, never inside it. rain_days is the
    # mean count of days with at least 1 mm per calendar month, wind_ms the
    # mean 10 m wind in m/s (both from the NASA POWER daily endpoint, see
    # harvest_climate_power.py --daily); elev_m is the destination ground
    # elevation (Copernicus DEM via Open-Meteo) the temperatures are lapse
    # corrected to, which the app needs to derive a temperature at altitude.
    "parallel": ["rain_days", "wind_ms", "elev_m", "sun_h", "water_c"],
    # T641: sun_h is twelve monthly totals of sunshine hours, MODELLED from the
    # POWER all-sky radiation (derive_sunshine.py). water_c is twelve monthly
    # mean sea surface temperatures in C for a coastal destination, MEASURED
    # (satellite, NASA MUR SST, 2003-2022 mean), only when open sea lies within
    # 25 km (harvest_sea_temp.py).
    "sun_h_method": SUN_METHOD,
    "water_c_method": "measured: NASA JPL MUR SST v4.1 monthly, mean of 2003-2022, nearest open-water cell within 25 km",
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
    "provider": "NASA POWER project, NASA Langley Research Center",
    "license": "US Government work; no use restriction, acknowledgement appreciated",
    "used_for": "per-destination 12-month climate normals + tourist comfort index",
}


def _load(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


_RAW = None
_SEA = None


def extras(rec: dict, did: str, elev: dict) -> dict:
    """The T631 parallel keys for one destination, only those that exist."""
    global _RAW, _SEA
    if _RAW is None:
        _RAW = _load(RAW)
        _SEA = _load(SEA)
    out = {}
    raw = _RAW.get(did) or {}
    lat = rec.get("lat")
    if isinstance(lat, (int, float)):
        sun = sun_hours(lat, raw.get("ALLSKY_SFC_SW_DWN"))
        if sun:
            out["sun_h"] = sun
    sea = _SEA.get(did) or {}
    if isinstance(sea.get("c"), list) and len(sea["c"]) == 12 and sea.get("km", 99) <= 25:
        out["water_c"] = sea["c"]
    for key in ("rain_days", "wind_ms"):
        vals = rec.get(key)
        if isinstance(vals, list) and len(vals) == 12:
            out[key] = vals
    e = rec.get("elev_m", elev.get(did))
    if isinstance(e, (int, float)):
        out["elev_m"] = round(e)
    return out


def patch(path: Path, cache: dict, elev: dict | None = None) -> None:
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
            **extras(rec, did, elev or {}),
        }
        applied += 1

    meta["climate_model"] = CLIMATE_MODEL
    ds = meta.setdefault("data_sources", {})
    ds.pop("open_meteo", None)   # superseded (live forecasts keep their own credit)
    ds.pop("worldclim", None)    # superseded by NASA POWER, licence-safe for PDFs
    ds["nasa_power"] = DATA_SOURCE
    meta["schema_version"] = max(meta.get("schema_version", 0), 15)

    atomic_write_json(path, data, indent=1, ensure_ascii=False)
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
    elev = _load(ELEV)
    for t in targets:
        patch(t, cache, elev)


if __name__ == "__main__":
    main()
