"""Bulk climate normals from WorldClim 2.1 rasters - no API, no rate limits.

Replaces the per-point Open-Meteo harvest (which the free tier throttled to
~15 dests/hour, i.e. days for the full catalogue). WorldClim 2.1 ships global
1970-2000 monthly climate normals as GeoTIFFs; we download them once (5 arc-min
~= 9 km) and sample every destination locally in one pass - seconds, and it
scales to tens of thousands of points.

Variables used (cache/worldclim/wc2.1_5m_{var}_{01..12}.tif):
    tmin  monthly avg daily min temp, degC   -> t_low
    tmax  monthly avg daily max temp, degC   -> t_high
    prec  monthly precipitation total, mm    -> precip_mm  (+ dryness score)
    srad  solar radiation, kJ m-2 day-1      -> sunshine score

Writes cache/climate.json in the SAME schema apply_climate.py already reads:
    { "<destId>": {source, period, lat, lon, months[12], summary} }
so the applier and the BestTimePanel weather strip need no change beyond the
source label. Per month: {t_high, t_low, t_mean, precip_mm, comfort}. The
0-100 comfort index keeps the Open-Meteo weights (temp .60 / dry .25 / sun .15)
but derives dryness from monthly precip and sun from solar radiation.

Coastal / island points that land on an ocean (nodata) pixel fall back to the
nearest land pixel within a small search radius.

Usage:
    python harvest_climate_worldclim.py            # all destinations
    python harvest_climate_worldclim.py --limit 20 # pilot
"""

import argparse
import json
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WC = ROOT / "cache" / "worldclim"
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "climate.json"

# Europe + Atlantic islands (Azores ~-31, Canaries ~-18) + Cyprus/Turkey (~40E).
WIN_W, WIN_S, WIN_E, WIN_N = -32.0, 26.0, 46.0, 72.0
RES = "5m"
SOURCE = "WorldClim 2.1 (1970-2000 normals, 5 arc-min)"
PERIOD = "1970-2000"

# --- comfort index (same shape/weights as the Open-Meteo version) ----------
COMFORT_W = {"temp": 0.60, "dry": 0.25, "sun": 0.15}


def _temp_score(t_high):
    if 20 <= t_high <= 27:
        return 100.0
    if t_high < 20:
        return max(0.0, 100.0 - (20 - t_high) * (100.0 / 14.0))
    return max(0.0, 100.0 - (t_high - 27) * (100.0 / 11.0))


def _dry_score(precip_mm):
    # 100 for a dry month, 0 once a month sees ~130 mm.
    return max(0.0, 100.0 - precip_mm * (100.0 / 130.0))


def _sun_score(srad):
    # srad in kJ m-2 day-1: ~3000 (dark N winter) .. ~28000 (bright S summer).
    return max(0.0, min(100.0, (srad - 4000) * (100.0 / 20000.0)))


def _comfort(t_high, precip_mm, srad):
    s = (COMFORT_W["temp"] * _temp_score(t_high)
         + COMFORT_W["dry"] * _dry_score(precip_mm)
         + COMFORT_W["sun"] * _sun_score(srad))
    return round(s)


def load_var(var):
    """Return (masked stack (12,H,W), affine transform of the window)."""
    stack = []
    transform = None
    for m in range(1, 13):
        path = WC / f"wc2.1_{RES}_{var}_{m:02d}.tif"
        with rasterio.open(path) as ds:
            win = from_bounds(WIN_W, WIN_S, WIN_E, WIN_N, ds.transform)
            arr = ds.read(1, window=win, masked=True)
            transform = ds.window_transform(win)
        stack.append(arr)
    return np.ma.stack(stack), transform


def _rowcol(transform, lon, lat):
    col = int((lon - transform.c) / transform.a)
    row = int((lat - transform.f) / transform.e)
    return row, col


def sample12(stack, transform, lon, lat, maxr=6):
    """12-month vector at the nearest valid (land) pixel, or None."""
    H, W = stack.shape[1], stack.shape[2]
    r0, c0 = _rowcol(transform, lon, lat)
    for rad in range(0, maxr + 1):
        for dr in range(-rad, rad + 1):
            for dc in range(-rad, rad + 1):
                if max(abs(dr), abs(dc)) != rad:
                    continue  # only the ring at this radius
                r, c = r0 + dr, c0 + dc
                if 0 <= r < H and 0 <= c < W and not stack.mask[0, r, c]:
                    # cast first: int16 rasters (prec) can't hold a NaN fill
                    return stack[:, r, c].astype("float64").filled(np.nan)
    return None


def _coords(dest):
    lat = dest.get("city_lat")
    lon = dest.get("city_lon")
    if lat is None or lon is None:
        lat, lon = dest.get("lat"), dest.get("lon")
    return lat, lon


def build_record(tmin, tmax, prec, srad, lat, lon):
    months = []
    for i in range(12):
        t_low = round(float(tmin[i]), 1)
        t_high = round(float(tmax[i]), 1)
        p = round(float(prec[i]))
        s = float(srad[i])
        months.append({
            "t_high": t_high,
            "t_low": t_low,
            "t_mean": round((t_high + t_low) / 2, 1),
            "precip_mm": p,
            "comfort": _comfort(t_high, p, s),
        })
    best = max(m["comfort"] for m in months)
    best_months = [i + 1 for i, m in enumerate(months) if m["comfort"] >= best - 8]
    warmest = max(range(12), key=lambda i: months[i]["t_high"]) + 1
    wettest = max(range(12), key=lambda i: months[i]["precip_mm"]) + 1
    return {
        "source": SOURCE, "period": PERIOD,
        "lat": round(lat, 4), "lon": round(lon, 4),
        "months": months,
        "summary": {"best_months": best_months, "peak_comfort": best,
                    "warmest": warmest, "wettest": wettest},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    print("[wc] loading rasters (Europe window)...")
    tmin_s, tf = load_var("tmin")
    tmax_s, _ = load_var("tmax")
    prec_s, _ = load_var("prec")
    srad_s, _ = load_var("srad")
    print(f"[wc] window {tmin_s.shape[2]}x{tmin_s.shape[1]} px loaded")

    data = json.loads(DATA.read_text(encoding="utf-8"))
    dests = data["destinations"]
    ids = list(dests)[: args.limit] if args.limit else list(dests)

    cache = {}
    ok = miss = sea = 0
    for did in ids:
        lat, lon = _coords(dests[did])
        if lat is None or lon is None:
            miss += 1
            continue
        tmin = sample12(tmin_s, tf, lon, lat)
        if tmin is None:
            sea += 1
            continue
        tmax = sample12(tmax_s, tf, lon, lat)
        prec = sample12(prec_s, tf, lon, lat)
        srad = sample12(srad_s, tf, lon, lat)
        if tmax is None or prec is None or srad is None:
            sea += 1
            continue
        cache[did] = build_record(tmin, tmax, prec, srad, lat, lon)
        ok += 1

    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"[wc] done: {ok} sampled, {sea} no-land-pixel, {miss} no-coords "
          f"-> {CACHE}")


if __name__ == "__main__":
    main()
