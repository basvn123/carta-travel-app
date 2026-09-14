"""When to go: a monthly climatology per summit, and the months it points at.

Brief 05 asks for two things under "conditions" and is emphatic that they are
different products. This module is the first one only:

    (a) BEST SEASON, static, in the wire.  Twelve monthly values per summit
        plus a derived `best_months` array, computed once, cached forever,
        licence clean, no runtime call.
    (b) LIVE CONDITIONS, out of scope this cycle.  Open-Meteo's free tier is
        non-commercial, there is no pan-European avalanche API (CAAML is a
        schema, not a service, and integrating ~20 national feeds is real
        work), and Windy's webcam URLs expire in ten minutes. Nothing live
        may enter the wire: it would break the cache-is-the-snapshot
        invariant. The page links out to the national service instead, which
        is what the hazard block already does.

## The source, and the honest deviation

The brief names ERA5-Land through the Copernicus Climate Data Store, and that
is the right source: free, commercial use permitted, monthly means back to
1950. It needs an account and an API key. There is no CDS key on this box and
nothing in the repo's .env, so `--source era5` is written and will run the
moment `CDSAPI_KEY` (or ~/.cdsapirc) exists, and the DEFAULT source is NASA
POWER, which this repo already ships a harvester for
(pipeline/harvest_climate_power.py, and see docs/tos/data_licenses.md).

POWER is US government open data with no licence restriction, it needs no
key, and its climatology endpoint answers all twelve monthly means in one
small request. Its cell is ~50 km, which for a temperature normal at a summit
is a smaller error than it sounds: the cell mean is corrected to the summit's
own elevation with the standard 6.5 C/km lapse rate, exactly as the
destination climate layer does, and it is the ELEVATION rather than the
horizontal position that decides whether a European summit is under snow.

Both sources are marked in the wire (`season.src`), so a row measured by
POWER can be told from a row measured by ERA5-Land after the key lands.

## What is derived, and what it is not

    t        monthly mean temperature at the summit, lapse corrected, C
    wet      monthly precipitation days (POWER: mm/day converted with the
             layer's own wet-day threshold; ERA5-Land: the same)
    snow     the probability the summit is under snow, 0..100

`snow` is a MODEL, not a measurement, and the model is one line: snow cover
is near certain when the monthly mean is below -2 C and near absent above
+4 C, with a linear ramp between, damped where the month is dry because snow
needs precipitation to arrive. Copernicus Land's high resolution Fractional
Snow Cover product, which would measure it, has concluded production; its
archive would still serve a climatology and integrating it is a bigger job
than this cycle can hold, so the estimate ships marked as an estimate, the
way the elevation-and-latitude season estimate it replaces already did.

`best_months` is the answer to "when should I go": months whose snow
probability is under 35 per cent and whose mean temperature is over 3 C,
falling back to the warmest three months where nothing clears that bar, which
is what a 3,000 m summit deserves rather than an empty chip row.

Usage, from the repo root:
    python pipeline/mountains/season.py                    # every enriched row
    python pipeline/mountains/season.py --countries CH,AT
    python pipeline/mountains/season.py --source era5      # once a key exists

ASCII clean, no em dashes, per project convention.
"""

import argparse
import calendar
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

if sys.platform == "win32":
    # A Bosnian summit name stops an export dead on a cp1252
    # console otherwise, which is a silly way to lose a build.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = HERE.parents[1]
CACHE = ROOT / "cache" / "mountains"
SEASON = CACHE / "season.json"
RAW = CACHE / "season_raw.json"

POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"
UA = {"User-Agent": "CartaMountains/2.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)"}
MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
              "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MODEL_VERSION = "peak_season_v1"

# The cell the raw answer is cached against. POWER's grid is 0.5 x 0.625
# degrees, so every summit inside one cell gets the same profile and pays for
# it once: 2,471 enriched summits share a few hundred cells, and the elevation
# correction afterwards is what makes them different from each other.
CELL_DEG = 0.5
LAPSE_C_PER_KM = 6.5
# How far the lapse correction may move a reading. A 4,000 m summit inside a
# 400 m cell is a 23 C correction, which is real, but past this the answer is
# an extrapolation rather than a reading and it is capped and flagged.
MAX_LAPSE_C = 26.0
# How much rain one European wet day carries, used to turn a monthly mean
# mm/day into a count of days it rained on. 5 mm is the continental average
# a climatology can be read against; it is an estimate and is marked as one.
WET_INTENSITY_MM = 5.0

SNOW_ALL_BELOW_C = -2.0
SNOW_NONE_ABOVE_C = 4.0
BEST_MAX_SNOW = 35
BEST_MIN_TEMP_C = 3.0

SOURCE_LABEL = {
    "power": "NASA POWER climatology (MERRA-2), US government open data",
    "era5": "ERA5-Land monthly means, Copernicus Climate Data Store",
}


def cell_key(lat, lon):
    return (f"{math.floor(lat / CELL_DEG) * CELL_DEG:.2f},"
            f"{math.floor(lon / CELL_DEG) * CELL_DEG:.2f}")


def _load(path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def _save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    os.replace(tmp, path)


def fetch_power(lat, lon, tries=3):
    """One POWER climatology point: twelve monthly means, and the elevation
    of the cell they were computed for."""
    qs = urllib.parse.urlencode({
        "parameters": "T2M,PRECTOTCORR",
        "community": "RE",
        "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}",
        "format": "JSON",
    })
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(f"{POWER}?{qs}", headers=UA)
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            break
        except Exception as exc:                      # noqa: BLE001
            last = exc
            time.sleep(4.0 * (attempt + 1))
    else:
        raise RuntimeError(f"POWER declined after {tries} tries: {last}")
    params = (data.get("properties") or {}).get("parameter") or {}
    coords = (data.get("geometry") or {}).get("coordinates") or [None, None, None]
    out = {"cell_elev": coords[2] if len(coords) > 2 else None, "src": "power"}
    for var in ("T2M", "PRECTOTCORR"):
        vals = [(params.get(var) or {}).get(m) for m in MONTH_KEYS]
        if any(v is None or v == -999.0 for v in vals):
            return None
        out[var] = vals
    return out


def fetch_era5(lat, lon):
    """ERA5-Land monthly means through the Copernicus CDS.

    Written, not exercised: there is no CDS key on this box. It stays here
    because the brief names this source and because the moment a key exists
    this is a one flag switch rather than a rewrite. The CDS answers a bbox
    request, so the same cell caching applies."""
    try:
        import cdsapi                                 # noqa: F401
    except ImportError as exc:
        raise RuntimeError("ERA5-Land needs `pip install cdsapi` and a CDS "
                           "API key in ~/.cdsapirc (see "
                           "https://cds.climate.copernicus.eu). The default "
                           "source, NASA POWER, needs neither.") from exc
    raise RuntimeError("ERA5-Land: no CDS credentials found. Set CDSAPI_URL "
                       "and CDSAPI_KEY, or write ~/.cdsapirc, then re-run "
                       "with --source era5.")


def snow_probability(t_mean_c, precip_mm):
    """0..100, the chance the summit is under snow that month.

    A model with two knobs and no pretension: certain below -2 C, absent
    above +4 C, linear between, and damped in a dry month because snow lying
    on a summit had to fall there first."""
    if t_mean_c <= SNOW_ALL_BELOW_C:
        p = 1.0
    elif t_mean_c >= SNOW_NONE_ABOVE_C:
        p = 0.0
    else:
        p = (SNOW_NONE_ABOVE_C - t_mean_c) / (SNOW_NONE_ABOVE_C - SNOW_ALL_BELOW_C)
    if precip_mm < 20 and p < 1.0:
        p *= 0.75
    return int(round(100 * max(0.0, min(1.0, p))))


def profile(raw, summit_ele):
    """The twelve months at ONE summit, from its cell's raw climatology."""
    lapse = 0.0
    capped = False
    if summit_ele is not None and raw.get("cell_elev") is not None:
        lapse = (raw["cell_elev"] - summit_ele) / 1000.0 * LAPSE_C_PER_KM
        if abs(lapse) > MAX_LAPSE_C:
            lapse = math.copysign(MAX_LAPSE_C, lapse)
            capped = True
    temps, wets, snows = [], [], []
    for i in range(12):
        days = calendar.monthrange(2020, i + 1)[1]
        t = raw["T2M"][i] + lapse
        mm_day = raw["PRECTOTCORR"][i]
        precip = mm_day * days
        # Wet days from a monthly mean, which is the one number POWER's
        # climatology gives: a European wet day carries about WET_DAY_MM of
        # rain, so the month's total divided by that is how many days it
        # rained on, capped at the month. It is an estimate and the wire says
        # so (`est`); ERA5-Land can answer it directly when a key lands.
        wet = int(round(min(float(days), precip / WET_INTENSITY_MM)))
        temps.append(int(round(t)))
        wets.append(wet)
        snows.append(snow_probability(t, precip))
    best = [i + 1 for i in range(12)
            if snows[i] <= BEST_MAX_SNOW and temps[i] >= BEST_MIN_TEMP_C]
    fallback = False
    if not best:
        # A summit that never clears the bar still has a season, and it is the
        # one every guidebook gives it: the three warmest months. Marked, so
        # the page can say "the least snow is in July" rather than promise a
        # walk.
        order = sorted(range(12), key=lambda i: -temps[i])[:3]
        best = sorted(i + 1 for i in order)
        fallback = True
    out = {
        "src": raw.get("src", "power"),
        "t": temps,
        "wet": wets,
        "snow": snows,
        "best": best,
        "est": True,
    }
    if fallback:
        out["snowbound"] = True
    if capped:
        out["lapse_capped"] = True
    return out


def sweep(rows, seasons, raws, source="power", pace=1.0, label=""):
    """Fill in every row that has no season yet, one network call per CELL."""
    made = 0
    for row in rows:
        key = f"{row['lat']:.5f},{row['lon']:.5f}"
        if key in seasons:
            continue
        ckey = cell_key(row["lat"], row["lon"])
        raw = raws.get(ckey)
        if raw is None:
            try:
                raw = (fetch_era5(row["lat"], row["lon"]) if source == "era5"
                       else fetch_power(row["lat"], row["lon"]))
            except Exception as exc:                  # noqa: BLE001
                print(f"    {row.get('name', key)}: {str(exc)[:110]}")
                continue
            if raw is None:
                print(f"    {row.get('name', key)}: no climatology at this cell")
                continue
            raws[ckey] = raw
            _save(RAW, raws)
            time.sleep(pace)
        seasons[key] = profile(raw, row.get("ele"))
        made += 1
        if made % 50 == 0:
            _save(SEASON, seasons)
    if made:
        _save(SEASON, seasons)
        print(f"  {label}: {made} summits, {len(raws)} cells cached")
    else:
        print(f"  {label}: cached")
    return made


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--source", choices=("power", "era5"), default="power")
    parser.add_argument("--pace", type=float, default=1.0)
    args = parser.parse_args()

    from harvest_peaks import COUNTRIES
    from peak_sources import load_cache
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    seasons, raws = _load(SEASON), _load(RAW)
    total = 0
    for cc in (wanted or COUNTRIES):
        rich = load_cache("rich", cc)
        rows = (rich or {}).get("peaks") or []
        if not rows:
            continue
        total += sweep(rows, seasons, raws, source=args.source, pace=args.pace,
                       label=cc)
    print(f"[season] {len(seasons)} summits, {len(raws)} climatology cells "
          f"({total} new this run), model {MODEL_VERSION}")


if __name__ == "__main__":
    main()
