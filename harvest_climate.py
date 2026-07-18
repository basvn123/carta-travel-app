"""Harvest per-destination climate normals from Open-Meteo - network only.

Source: Open-Meteo ERA5 reanalysis archive (https://open-meteo.com/, ERA5 by
Copernicus/ECMWF). Free, no API key, non-commercial + commercial use with
attribution. One request per destination pulls a 10-year daily window at the
destination's city centre (city_lat/city_lon, falling back to the airport
lat/lon) and aggregates it into a 12-month climate normal.

Per month we store:
    t_high    avg daily high (mean of daily max),           degC
    t_low     avg daily low  (mean of daily min),           degC
    t_mean    (t_high + t_low) / 2,                          degC
    precip_mm avg monthly rainfall total,                    mm
    rain_days avg number of wet days (>= 1 mm),              days
    sun_hours avg daily bright sunshine,                     hours
    comfort   0-100 tourist-comfort index (see COMFORT docs) index

Plus a summary block: the best months to visit (highest comfort), the
warmest and the wettest month. This is the real-data backbone for a
"best time to go, weather-wise" view alongside the existing fare seasonality.

Writes nothing into app_data.json - only cache/climate.json - so it is safe to
run alongside the apply_* layer scripts. Idempotent + resumable: destinations
already in the cache are skipped. apply_climate.py folds the cache into the
dataset later.

Usage:
    python harvest_climate.py               # every destination not yet cached
    python harvest_climate.py --limit 8     # pilot: first 8 uncached dests
    python harvest_climate.py --force       # refetch everything
"""

import argparse
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# Set when Open-Meteo reports the hourly request-weight cap. Workers short-
# circuit while it's set; the driver sleeps until the next hour, then clears it
# and resumes the leftover destinations. Lets a single background run patiently
# grind through all 1570 dests across however many hourly windows it takes.
HOURLY_LIMIT = threading.Event()

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "climate.json"

# 10 full calendar years - a stable normal. Heavy archive pulls exhaust Open-
# Meteo's free hourly request-weight cap fast, so the driver waits out each
# hourly reset and auto-resumes (see main); wall-clock is unattended anyway.
START_DATE = "2014-01-01"
END_DATE = "2023-12-31"
PERIOD = "2014-2023"
SOURCE = "Open-Meteo ERA5 reanalysis (Copernicus/ECMWF)"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = "temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration"

# The ERA5 archive endpoint pulls 10 years/request, so it rate-limits harder
# than a light lookup - keep concurrency low and throttled. Transient failures
# still happen under load, but the resumable cache mops them up on a re-run.
MAX_WORKERS = 3
ITEM_DELAY_S = 0.25
CHECKPOINT_EVERY = 40
TIMEOUT_S = 90
RETRIES = 3


def _load(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _coords(dest):
    """City centre if we have it, else the airport anchor."""
    lat = dest.get("city_lat")
    lon = dest.get("city_lon")
    if lat is None or lon is None:
        lat, lon = dest.get("lat"), dest.get("lon")
    return lat, lon


# --- tourist comfort index -------------------------------------------------
# A transparent 0-100 blend of the three things that decide whether a month is
# pleasant to travel in: daytime warmth, dryness, and sunshine. Weighted toward
# temperature because it dominates the felt experience.
COMFORT_W = {"temp": 0.60, "dry": 0.25, "sun": 0.15}


def _temp_score(t_high):
    # Full marks in the 20-27 degC band; linear falloff to 0 at 6 (too cold)
    # and 38 (too hot). Warm-but-not-scorching is the tourist sweet spot.
    if 20 <= t_high <= 27:
        return 100.0
    if t_high < 20:
        return max(0.0, 100.0 - (20 - t_high) * (100.0 / 14.0))  # 0 at 6 degC
    return max(0.0, 100.0 - (t_high - 27) * (100.0 / 11.0))       # 0 at 38 degC


def _dry_score(rain_days):
    # 100 with no wet days, 0 once about 18 days a month see rain.
    return max(0.0, 100.0 - rain_days * (100.0 / 18.0))


def _sun_score(sun_hours):
    # 0 at 2 h/day of sunshine, 100 at 10 h/day.
    return max(0.0, min(100.0, (sun_hours - 2) * (100.0 / 8.0)))


def _comfort(t_high, rain_days, sun_hours):
    s = (COMFORT_W["temp"] * _temp_score(t_high)
         + COMFORT_W["dry"] * _dry_score(rain_days)
         + COMFORT_W["sun"] * _sun_score(sun_hours))
    return round(s)


def _aggregate(daily):
    """Fold a daily archive series into 12 monthly normals."""
    times = daily["time"]
    tmax = daily["temperature_2m_max"]
    tmin = daily["temperature_2m_min"]
    prcp = daily["precipitation_sum"]
    sun = daily["sunshine_duration"]

    # Per month accumulate day-level values and per (year,month) totals.
    hi = {m: [] for m in range(1, 13)}
    lo = {m: [] for m in range(1, 13)}
    day_sun = {m: [] for m in range(1, 13)}
    month_precip = {}   # (y, m) -> mm total
    month_wet = {}      # (y, m) -> wet-day count

    for i, iso in enumerate(times):
        y = int(iso[0:4])
        m = int(iso[5:7])
        if tmax[i] is not None:
            hi[m].append(tmax[i])
        if tmin[i] is not None:
            lo[m].append(tmin[i])
        if sun[i] is not None:
            day_sun[m].append(sun[i] / 3600.0)  # seconds -> hours
        p = prcp[i] or 0.0
        month_precip[(y, m)] = month_precip.get((y, m), 0.0) + p
        if p >= 1.0:
            month_wet[(y, m)] = month_wet.get((y, m), 0) + 1

    def mean(xs):
        return sum(xs) / len(xs) if xs else None

    months = []
    for m in range(1, 13):
        precip_totals = [v for (yy, mm), v in month_precip.items() if mm == m]
        wet_counts = [month_wet.get((yy, m), 0)
                      for (yy, mm) in month_precip if mm == m]
        t_high = mean(hi[m])
        t_low = mean(lo[m])
        rain_days = mean(wet_counts) or 0.0
        sun_hours = mean(day_sun[m]) or 0.0
        t_mean = (t_high + t_low) / 2 if (t_high is not None and t_low is not None) else None
        rec = {
            "t_high": round(t_high, 1) if t_high is not None else None,
            "t_low": round(t_low, 1) if t_low is not None else None,
            "t_mean": round(t_mean, 1) if t_mean is not None else None,
            "precip_mm": round(mean(precip_totals) or 0.0),
            "rain_days": round(rain_days, 1),
            "sun_hours": round(sun_hours, 1),
        }
        rec["comfort"] = _comfort(t_high if t_high is not None else -50,
                                  rain_days, sun_hours)
        months.append(rec)

    best = max(r["comfort"] for r in months)
    best_months = [i + 1 for i, r in enumerate(months) if r["comfort"] >= best - 8]
    warmest = max(range(12), key=lambda i: months[i]["t_high"] if months[i]["t_high"] is not None else -99) + 1
    wettest = max(range(12), key=lambda i: months[i]["precip_mm"]) + 1
    summary = {"best_months": best_months, "peak_comfort": best,
               "warmest": warmest, "wettest": wettest}
    return months, summary


def fetch_one(dest):
    if HOURLY_LIMIT.is_set():
        return None
    lat, lon = _coords(dest)
    if lat is None or lon is None:
        return None
    qs = (f"?latitude={lat:.4f}&longitude={lon:.4f}"
          f"&start_date={START_DATE}&end_date={END_DATE}"
          f"&daily={DAILY_VARS}&timezone=auto")
    url = ARCHIVE_URL + qs
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_S) as resp:
                r = json.loads(resp.read().decode("utf-8"))
            months, summary = _aggregate(r["daily"])
            return {
                "source": SOURCE, "period": PERIOD,
                "lat": round(lat, 4), "lon": round(lon, 4),
                "months": months, "summary": summary,
            }
        except urllib.error.HTTPError as e:
            if e.code == 429:
                body = ""
                try:
                    body = e.read().decode("utf-8")
                except Exception:
                    pass
                if "hourly" in body.lower():
                    # Weight cap for the hour - no point retrying; signal the
                    # driver to wait for the reset.
                    HOURLY_LIMIT.set()
                    return None
                time.sleep(2 + attempt * 3)  # minute/second burst - back off
                continue
            return None
        except Exception:
            if HOURLY_LIMIT.is_set():
                return None
            if attempt < RETRIES - 1:
                time.sleep(1 + attempt)
                continue
            return None
    return None


def _seconds_to_next_hour():
    now = datetime.now(timezone.utc)
    secs_into_hour = now.minute * 60 + now.second
    return max(60, 3600 - secs_into_hour) + 90  # + buffer past the reset


def _run_round(todo, cache):
    """One pass over `todo`; returns (fetched, hit_limit)."""
    fetched = 0
    done = 0

    def work(pair):
        did, d = pair
        if HOURLY_LIMIT.is_set():
            return did, None
        time.sleep(ITEM_DELAY_S)
        return did, fetch_one(d)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(work, p) for p in todo]
        for f in as_completed(futs):
            did, rec = f.result()
            if rec is not None:
                cache[did] = rec
                fetched += 1
            done += 1
            if done % CHECKPOINT_EVERY == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
                print(f"    {fetched} new this round ({len(cache)} total cached)")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return fetched, HOURLY_LIMIT.is_set()


def _todo(data, cache, limit):
    todo = []
    for did, d in data["destinations"].items():
        if did in cache:
            continue
        lat, lon = _coords(d)
        if lat is None or lon is None:
            continue
        todo.append((did, d))
    return todo[:limit] if limit else todo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only N uncached dests (pilot)")
    ap.add_argument("--force", action="store_true", help="refetch even if cached")
    ap.add_argument("--once", action="store_true",
                    help="single pass; do NOT wait out the hourly limit")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    cache = {} if args.force else _load(CACHE)

    todo = _todo(data, cache, args.limit)
    print(f"[climate] {len(todo)} destinations to fetch "
          f"({len(cache)} already cached), window {PERIOD}")

    round_no = 0
    while todo:
        round_no += 1
        HOURLY_LIMIT.clear()
        print(f"[climate] round {round_no}: {len(todo)} to go")
        fetched, hit = _run_round(todo, cache)
        print(f"[climate] round {round_no} done: +{fetched} ({len(cache)} cached)")

        todo = _todo(data, cache, args.limit)
        if not todo:
            break
        if hit and not args.once:
            wait = _seconds_to_next_hour()
            print(f"[climate] hourly limit reached; sleeping {wait}s until the "
                  f"quota resets, then resuming {len(todo)} dests...")
            time.sleep(wait)
        elif args.once:
            print(f"[climate] --once: stopping with {len(todo)} still uncached")
            break
        # If we didn't hit the hourly cap but still have work (transient net
        # errors), loop straight into another round.

    print(f"[climate] finished: {len(cache)} cached total, "
          f"{len(_todo(data, cache, 0))} still missing")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
