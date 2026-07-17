"""
harvest_flight_times.py - add departure/arrival TIMES to the fares table.

The fare harvesters (reharvest_flights.py, harvest_all_origins.py) call Ryanair's
farefinder `cheapestPerDay` endpoint and keep only the price - but the very same
response carries `departureDate` / `arrivalDate` (local times) for the cheapest
flight of each day. This script re-fetches those legs and stores the times in a
separate cache, then patches them into the existing deduplicated fares table:

    data["fares"][anchor][origin] = {
        "out":   {day: eur, ...},           # (already there)
        "ret":   {day: eur, ...},           # (already there)
        "out_t": {day: "HH:MM/HH:MM", ...}, # dep/arr local times, origin->anchor
        "ret_t": {day: "HH:MM/HH:MM", ...}, # dep/arr local times, anchor->origin
    }

The time always belongs to the SAME flight the stored fare priced (the cheapest
of that day), so what the UI shows is the flight the total is built on.

Scope control: the full table is ~4.8k (anchor, origin) pairs (~48k calls, ~16h).
Times are a display nicety, so you can harvest per origin and grow coverage over
time - the frontend simply omits the hour where it isn't stored yet.

Caches (idempotent / resumable):
  cache/flight_times.json   {"frm|to|month": {day_iso: "HH:MM/HH:MM"}}

Run:
  python harvest_flight_times.py harvest CRL,BRU   # times for legs touching these origins
  python harvest_flight_times.py harvest           # ALL priced pairs (overnight)
  python harvest_flight_times.py patch             # write out_t/ret_t into app_data.json
  python harvest_flight_times.py all CRL,BRU       # harvest + patch

Tuning via env (same knobs as harvest_all_origins.py):
  HARVEST_DELAY   base delay between calls, seconds (default 1.2)
  HARVEST_WORKERS parallel fetchers (default 1)
"""
import json, os, sys, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent
CACHE_DIR = ROOT / "cache"
TIMES_CACHE = CACHE_DIR / "flight_times.json"
APP_DATA = ROOT / "app_data" / "app_data.json"

CURRENCY = "EUR"
FARE_ENDPOINT = ("https://www.ryanair.com/api/farfnd/v4/oneWayFares/"
                 "{frm}/{to}/cheapestPerDay?outboundMonthOfDate={month}&currency=" + CURRENCY)

DELAY_S = float(os.environ.get("HARVEST_DELAY", "1.2"))
WORKERS = int(os.environ.get("HARVEST_WORKERS", "1"))
BACKOFFS = [30, 60, 120]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-GB,en;q=0.9",
}


def _get_json(url, timeout=40):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


def months_in_window(start_iso, end_iso):
    sy, sm = int(start_iso[:4]), int(start_iso[5:7])
    ey, em = int(end_iso[:4]), int(end_iso[5:7])
    out, y, m = [], sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}-01")
        m += 1
        if m == 13:
            m = 1; y += 1
    return out


def priced_pairs(data, origins_filter=None):
    """(origin, anchor) pairs that actually carry fares in the shipped table -
    the only legs worth fetching times for. Optionally restricted to a set of
    origin IATA codes (grow coverage origin by origin)."""
    pairs = []
    for anchor, by_origin in (data.get("fares") or {}).items():
        for origin, rec in by_origin.items():
            if origins_filter and origin not in origins_filter:
                continue
            if rec.get("out") or rec.get("ret"):
                pairs.append((origin, anchor))
    return sorted(pairs)


def _hhmm(iso_ts):
    """'2026-09-18T19:45:00' -> '19:45' (already local to the departure airport)."""
    return iso_ts[11:16] if iso_ts and len(iso_ts) >= 16 else None


def fetch_month_times(frm, to, month):
    """{day_iso: 'HH:MM/HH:MM'} (dep/arr) for bookable days only."""
    payload = _get_json(FARE_ENDPOINT.format(frm=frm, to=to, month=month))
    fares = (payload.get("outbound") or {}).get("fares") or []
    out = {}
    for f in fares:
        if f.get("unavailable") or f.get("soldOut"):
            continue
        dep, arr = _hhmm(f.get("departureDate")), _hhmm(f.get("arrivalDate"))
        if not dep:
            continue
        out[f["day"]] = f"{dep}/{arr}" if arr else dep
    return out


def _fetch_with_backoff(frm, to, month):
    attempt = 0
    while True:
        try:
            return fetch_month_times(frm, to, month)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            if e.code in (429, 503) and attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}
        except Exception:
            if attempt < len(BACKOFFS):
                time.sleep(BACKOFFS[attempt]); attempt += 1; continue
            return {}


def harvest(origins_filter=None):
    data = load_app_data()
    meta = data["meta"]
    months = months_in_window(meta["start_date"], meta["end_date"])
    pairs = priced_pairs(data, origins_filter)

    cache = json.loads(TIMES_CACHE.read_text(encoding="utf-8")) if TIMES_CACHE.exists() else {}
    lock = threading.Lock()

    jobs = []
    for origin, anchor in pairs:
        for month in months:
            jobs.append((f"{origin}|{anchor}|{month}", origin, anchor, month))  # out
            jobs.append((f"{anchor}|{origin}|{month}", anchor, origin, month))  # ret
    seen, uniq = set(), []
    for key, frm, to, month in jobs:
        if key not in seen:
            seen.add(key); uniq.append((key, frm, to, month))
    todo = [j for j in uniq if j[0] not in cache]
    scope = ",".join(sorted(origins_filter)) if origins_filter else "ALL origins"
    print(f"[{scope}] {len(pairs)} priced pairs x {len(months)} months -> {len(uniq)} legs; "
          f"{len(uniq) - len(todo)} cached, {len(todo)} to fetch "
          f"(workers={WORKERS}, delay={DELAY_S}s, ~{len(todo) * DELAY_S / max(1, WORKERS) / 60:.0f} min)")

    done = [0]

    def run(job):
        key, frm, to, month = job
        result = _fetch_with_backoff(frm, to, month)
        with lock:
            cache[key] = result
            done[0] += 1
            if done[0] % 50 == 0:
                TIMES_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
                print(f"  ...{done[0]}/{len(todo)} fetched, flushed")
        time.sleep(DELAY_S)

    if WORKERS <= 1:
        for job in todo:
            run(job)
    else:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = [ex.submit(run, job) for job in todo]
            for _ in as_completed(futs):
                pass

    TIMES_CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    print(f"harvest complete: {len(cache)} leg-months in times cache")


def _merge_months(cache, frm, to, months, start_iso, end_iso):
    times = {}
    for month in months:
        for day, t in (cache.get(f"{frm}|{to}|{month}") or {}).items():
            if start_iso <= day <= end_iso:
                times[day] = t
    return dict(sorted(times.items()))


def patch():
    """Write out_t/ret_t next to out/ret for every pair the cache covers.
    Re-reads app_data.json fresh (other harvesters may have written it since
    harvest started) and only touches the fares table + a meta note."""
    if not TIMES_CACHE.exists():
        sys.exit("no times cache; run harvest first")
    cache = json.loads(TIMES_CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    meta = data["meta"]
    start_iso, end_iso = meta["start_date"], meta["end_date"]
    months = months_in_window(start_iso, end_iso)

    n_pairs = n_days = 0
    for anchor, by_origin in (data.get("fares") or {}).items():
        for origin, rec in by_origin.items():
            out_t = _merge_months(cache, origin, anchor, months, start_iso, end_iso)
            ret_t = _merge_months(cache, anchor, origin, months, start_iso, end_iso)
            if not out_t and not ret_t:
                continue
            if out_t:
                rec["out_t"] = out_t
            if ret_t:
                rec["ret_t"] = ret_t
            n_pairs += 1
            n_days += len(out_t) + len(ret_t)

    fm = meta.setdefault("fares_model", {})
    fm["times"] = {
        "method": ("dep/arr local times of each day's cheapest flight, from the same "
                   "farefinder cheapestPerDay responses the fares came from; stored as "
                   "'HH:MM/HH:MM' in fares[anchor][origin].out_t/ret_t. Partial coverage "
                   "is fine - the UI omits the hour where no time is stored."),
        "n_pairs_with_times": n_pairs,
        "harvested_from": date.today().isoformat(),
    }

    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    size_mb = APP_DATA.stat().st_size / 1e6
    print(f"patched times: {n_pairs} (anchor,origin) pairs, {n_days} day-times")
    print(f"app_data.json is now {size_mb:.1f} MB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    origins = set(sys.argv[2].split(",")) if len(sys.argv) > 2 and sys.argv[2] else None
    if cmd == "harvest":
        harvest(origins)
    elif cmd == "patch":
        patch()
    elif cmd == "all":
        harvest(origins)
        patch()
    else:
        sys.exit(f"unknown command: {cmd}\n" + __doc__)
