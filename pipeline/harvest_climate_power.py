"""Climate normals from NASA POWER climatology - replaces WorldClim 2.1.

Why the switch (dossier spec, section 11): WorldClim 2.1 is licensed for
non-commercial use only, and Carta ships affiliate links and now a
redistributable PDF that prints monthly values. NASA POWER is US-government
open data (no licence restriction, credit is a courtesy we give anyway), it
covers every land coordinate, and the climatology endpoint returns all twelve
monthly means in ONE small request per point - no 30-year daily downloads and
none of the per-point throttling that killed the old Open-Meteo harvest at
~15 destinations/hour.

Method:
  - T2M (monthly mean) and T2M_RANGE (mean daily range) give
        t_high = T2M + RANGE/2,  t_low = T2M - RANGE/2
    (the climatology's T2M_MAX/T2M_MIN are 20-year EXTREMES, not means -
    using them would print record temperatures as normals).
  - The MERRA-2 cell is ~50 km, so a valley town inherits its cell's mean
    elevation. The response carries the cell elevation; we fetch the real
    destination elevation (Open-Meteo elevation API, Copernicus DEM, 100
    points per call) and apply a 6.5 C/km lapse correction, capped at 5 C.
  - precip: PRECTOTCORR mm/day x days in month; solar: ALLSKY_SFC_SW_DWN
    kWh/m2/day x 3600 -> kJ, feeding the SAME 0-100 comfort index the
    WorldClim stage used (weights temp .60 / dry .25 / sun .15), so best
    months keep their meaning.

Writes cache/climate.json in the schema apply_climate.py reads, for EVERY
destination it can resolve (existing entries are replaced; a failed fetch
keeps whatever was there). Raw responses are memoised in
cache/climate_power_raw.json so a re-run is free.

Pipeline order:  harvest_climate_power -> apply_climate -> sync-data -> dossier

Usage:
    python pipeline/harvest_climate_power.py            # full catalogue
    python pipeline/harvest_climate_power.py --limit 20 # pilot
ASCII clean, no em dashes, per project convention.
"""

import argparse
import calendar
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "continent-app" / "public" / "app_data.json"
CACHE = ROOT / "cache" / "climate.json"
RAW = ROOT / "cache" / "climate_power_raw.json"
ELEV = ROOT / "cache" / "climate_elevations.json"

POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"
ELEV_API = "https://api.open-meteo.com/v1/elevation"
UA = {"User-Agent": "CartaClimate/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"}
PACE_S = 0.8  # per worker; both APIs 429 under real bursts
SOURCE = "NASA POWER (MERRA-2), 2001-2020 climatology, lapse-corrected"
PERIOD = "2001-2020"
MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
              "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
LAPSE_C_PER_KM = 6.5
MAX_LAPSE_C = 5.0

COMFORT_W = {"temp": 0.60, "dry": 0.25, "sun": 0.15}


def _temp_score(t_high):
    if 20 <= t_high <= 27:
        return 100.0
    if t_high < 20:
        return max(0.0, 100.0 - (20 - t_high) * (100.0 / 14.0))
    return max(0.0, 100.0 - (t_high - 27) * (100.0 / 11.0))


def _dry_score(precip_mm):
    return max(0.0, 100.0 - precip_mm * (100.0 / 130.0))


def _sun_score(srad_kj):
    return max(0.0, min(100.0, (srad_kj - 4000) * (100.0 / 20000.0)))


def _comfort(t_high, precip_mm, srad_kj):
    return round(COMFORT_W["temp"] * _temp_score(t_high)
                 + COMFORT_W["dry"] * _dry_score(precip_mm)
                 + COMFORT_W["sun"] * _sun_score(srad_kj))


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def coords_of(dest):
    lat = dest.get("city_lat", dest.get("lat"))
    lon = dest.get("city_lon", dest.get("lon"))
    return lat, lon


def fetch_elevations(dests):
    """dest id -> ground elevation (m), 100 points per call, cached."""
    elev = load_json(ELEV, {})
    todo = [(k, *coords_of(d)) for k, d in dests.items() if k not in elev]
    todo = [(k, la, lo) for k, la, lo in todo if la is not None]
    for i in range(0, len(todo), 100):
        batch = todo[i:i + 100]
        qs = urllib.parse.urlencode({
            "latitude": ",".join(f"{la:.4f}" for _, la, _ in batch),
            "longitude": ",".join(f"{lo:.4f}" for _, _, lo in batch),
        })
        for attempt in range(4):
            try:
                res = get(f"{ELEV_API}?{qs}")
                for (k, _, _), e in zip(batch, res.get("elevation", [])):
                    elev[k] = e
                break
            except Exception as e:  # noqa: BLE001 - 429s clear on a real pause
                wait = 8 * (attempt + 1)
                print(f"  elevation batch {i // 100}: {e}; retry in {wait}s",
                      flush=True)
                time.sleep(wait)
        time.sleep(1.2)
        if (i // 100) % 10 == 0:
            save_json(ELEV, elev)
    save_json(ELEV, elev)
    return elev


def fetch_power(lat, lon):
    qs = urllib.parse.urlencode({
        "parameters": "T2M,T2M_RANGE,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
        "community": "RE",
        "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}",
        "format": "JSON",
    })
    d = get(f"{POWER}?{qs}")
    pp = d.get("properties", {}).get("parameter", {})
    cell_elev = (d.get("geometry", {}).get("coordinates") or [None, None, None])[2]
    out = {"cell_elev": cell_elev}
    for var in ("T2M", "T2M_RANGE", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"):
        vals = [pp.get(var, {}).get(m) for m in MONTH_KEYS]
        if any(v is None or v == -999.0 for v in vals):
            return None
        out[var] = vals
    return out


def build_record(raw, dest_elev, lat, lon):
    lapse = 0.0
    if dest_elev is not None and raw.get("cell_elev") is not None:
        lapse = (raw["cell_elev"] - dest_elev) / 1000.0 * LAPSE_C_PER_KM
        lapse = max(-MAX_LAPSE_C, min(MAX_LAPSE_C, lapse))
    months = []
    for i in range(12):
        t = raw["T2M"][i] + lapse
        half = raw["T2M_RANGE"][i] / 2.0
        t_high = round(t + half, 1)
        t_low = round(t - half, 1)
        days = calendar.monthrange(2020, i + 1)[1]
        precip = round(raw["PRECTOTCORR"][i] * days)
        srad_kj = raw["ALLSKY_SFC_SW_DWN"][i] * 3600.0
        months.append({
            "t_high": t_high, "t_low": t_low,
            "t_mean": round(t, 1),
            "precip_mm": precip,
            "comfort": _comfort(t_high, precip, srad_kj),
        })
    best = max(m["comfort"] for m in months)
    return {
        "source": SOURCE, "period": PERIOD,
        "lat": round(lat, 4), "lon": round(lon, 4),
        "months": months,
        "summary": {
            "best_months": [i + 1 for i, m in enumerate(months)
                            if m["comfort"] >= best - 8],
            "peak_comfort": best,
            "warmest": max(range(12), key=lambda i: months[i]["t_high"]) + 1,
            "wettest": max(range(12), key=lambda i: months[i]["precip_mm"]) + 1,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    dests = load_json(DATA, {}).get("destinations", {})
    if args.limit:
        dests = dict(list(dests.items())[: args.limit])
    print(f"[power] {len(dests)} destinations")

    print("[power] resolving ground elevations...")
    elev = fetch_elevations(dests)

    raw_cache = load_json(RAW, {})
    cache = load_json(CACHE, {})
    ok = fail = cached = 0
    ids = list(dests)

    # POWER answers in 2-3 s per point; serially that is hours for the
    # catalogue. A small pool keeps the wall clock sane while staying polite:
    # four in flight is well under anything the service throttles.
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    lock = threading.Lock()

    def work(did):
        lat, lon = coords_of(dests[did])
        if lat is None:
            return did, None, "no coords"
        with lock:
            memo = raw_cache.get(did)
        if memo is not None:
            return did, memo, "memo"
        last = None
        for attempt in range(3):
            try:
                raw = fetch_power(lat, lon)
                time.sleep(PACE_S)
                return did, raw, None if raw else "fill value"
            except Exception as e:  # noqa: BLE001 - back off, 429s are transient
                last = str(e)
                time.sleep(6 * (attempt + 1))
        return did, None, last

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(work, did): did for did in ids}
        done = 0
        for fut in as_completed(futures):
            did, raw, why = fut.result()
            done += 1
            if raw is None:
                fail += 1
                if fail % 25 == 1:
                    print(f"  {did}: {why}", flush=True)
            else:
                if why == "memo":
                    cached += 1
                lat, lon = coords_of(dests[did])
                with lock:
                    raw_cache[did] = raw
                    cache[did] = build_record(raw, elev.get(did), lat, lon)
                ok += 1
            if done % 100 == 0:
                with lock:
                    save_json(RAW, raw_cache)
                    save_json(CACHE, cache)
                print(f"  {done}/{len(ids)} ({ok} ok, {fail} failed)", flush=True)

    save_json(RAW, raw_cache)
    save_json(CACHE, cache)
    print(f"[power] done: {ok} built ({cached} from memo), {fail} failed "
          f"-> {CACHE} now holds {len(cache)}")


if __name__ == "__main__":
    main()
