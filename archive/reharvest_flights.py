"""
reharvest_flights.py - replace interpolated monthly-cheapest fares with REAL
per-day Ryanair fares.

Background (2026-06-07 fact-check): the old 02_flights harvest used
get_cheapest_flights, which returns only the single cheapest fare for a whole
month. fix_data.py then interpolated a daily calendar between those sparse
monthly minima - so every day showed ~the monthly floor (e.g. Dublin Jun 10-14
read EUR 39 round trip) AND fares were invented for days the route does not even
operate (CRL->DUB does not fly Sundays, yet Jun 14 had a fare).

This harvester instead calls Ryanair's farefinder `cheapestPerDay` endpoint,
which returns a real price for EVERY day of a month plus soldOut / unavailable
flags. We keep only days that are actually bookable. Same call budget as before
(~one call per origin x anchor x direction x month), but real data.

Two phases (idempotent, resumable):
  harvest()  -> fills cache/fare_cheapest_per_day.json (one entry per route/month)
  patch()    -> writes real outbound_fare/return_fare into app_data/app_data.json

Run:  python reharvest_flights.py            # harvest then patch (resumes cache)
      python reharvest_flights.py harvest    # harvest only
      python reharvest_flights.py patch       # patch only (from existing cache)
      python reharvest_flights.py refresh     # <-- the one for scheduled re-runs:
            # rolls the window to [today .. today+HORIZON_DAYS], DROPS the stale
            # cache so every fare is re-fetched live, then harvests + patches.
            # Run `npm run build` in continent-app afterwards to ship it.
"""
import json, sys, time, urllib.request, urllib.error
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / "cache" / "fare_cheapest_per_day.json"
APP_DATA = ROOT / "app_data" / "app_data.json"
CURRENCY = "EUR"
ENDPOINT = ("https://www.ryanair.com/api/farfnd/v4/oneWayFares/"
            "{frm}/{to}/cheapestPerDay?outboundMonthOfDate={month}&currency=" + CURRENCY)

DELAY_S = 1.2          # polite base delay between calls
BACKOFFS = [30, 60, 120]
FARE_MODEL = "ryanair_cheapestPerDay_live"
HORIZON_DAYS = 150     # refresh keeps a rolling [today .. today+HORIZON_DAYS] window (~5 months ahead)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-GB,en;q=0.9",
}


def load_app_data():
    return json.loads(APP_DATA.read_text(encoding="utf-8"))


def months_in_window(start_iso, end_iso):
    """First-of-month ISO dates covering [start, end]."""
    sy, sm = int(start_iso[:4]), int(start_iso[5:7])
    ey, em = int(end_iso[:4]), int(end_iso[5:7])
    out = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}-01")
        m += 1
        if m == 13:
            m = 1; y += 1
    return out


def route_pairs(data):
    """Distinct (origin, anchor_airport) pairs present in the catalogue."""
    pairs = set()
    for x in data["destinations"].values():
        for o, rt in (x.get("routes") or {}).items():
            anc = rt.get("anchor_airport") or x.get("iata")
            if anc:
                pairs.add((o, anc))
    return sorted(pairs)


def fetch_month(frm, to, month):
    """Return {day_iso: price} for bookable days only, or {} if none.
    Raises on transport errors so the caller can back off."""
    url = ENDPOINT.format(frm=frm, to=to, month=month)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=40) as r:
        payload = json.load(r)
    fares = (payload.get("outbound") or {}).get("fares") or []
    out = {}
    for f in fares:
        if f.get("unavailable") or f.get("soldOut"):
            continue
        price = f.get("price")
        if not price or price.get("value") is None:
            continue
        out[f["day"]] = round(float(price["value"]), 2)
    return out


def harvest():
    data = load_app_data()
    meta = data["meta"]
    months = months_in_window(meta["start_date"], meta["end_date"])
    pairs = route_pairs(data)

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    # Build work queue: each (origin, anchor) needs OUT (origin->anchor) and
    # RET (anchor->origin) for every month.
    jobs = []
    for origin, anchor in pairs:
        for month in months:
            jobs.append((f"{origin}|{anchor}|out|{month}", origin, anchor, month))
            jobs.append((f"{anchor}|{origin}|ret|{month}", anchor, origin, month))

    todo = [j for j in jobs if j[0] not in cache]
    print(f"{len(pairs)} route-pairs x {len(months)} months -> {len(jobs)} calls; "
          f"{len(cache)} cached, {len(todo)} to fetch")

    done = 0
    for key, frm, to, month in todo:
        attempt = 0
        while True:
            try:
                cache[key] = fetch_month(frm, to, month)
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:           # route genuinely absent that month
                    cache[key] = {}
                    break
                if e.code in (429, 503) and attempt < len(BACKOFFS):
                    wait = BACKOFFS[attempt]; attempt += 1
                    print(f"  {e.code} on {key}; backoff {wait}s")
                    time.sleep(wait); continue
                print(f"  HTTP {e.code} on {key}; skipping"); cache[key] = {}
                break
            except Exception as e:
                if attempt < len(BACKOFFS):
                    wait = BACKOFFS[attempt]; attempt += 1
                    print(f"  {type(e).__name__} on {key}; backoff {wait}s")
                    time.sleep(wait); continue
                print(f"  {type(e).__name__} on {key}; skipping"); cache[key] = {}
                break
        done += 1
        if done % 20 == 0:
            CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
            print(f"  ...{done}/{len(todo)} fetched, flushed cache")
        time.sleep(DELAY_S)

    CACHE.write_text(json.dumps(cache, indent=0), encoding="utf-8")
    print(f"harvest complete: {len(cache)} route-months in cache")


def _merge_months(cache, frm, to, direction, months, start_iso, end_iso):
    """Collapse per-month caches into one {day: price} dict within the window."""
    fares = {}
    for month in months:
        key = f"{frm}|{to}|{direction}|{month}"
        for day, price in (cache.get(key) or {}).items():
            if start_iso <= day <= end_iso:
                fares[day] = price
    return dict(sorted(fares.items()))


def patch():
    if not CACHE.exists():
        sys.exit("no cache; run harvest first")
    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    data = load_app_data()
    meta = data["meta"]
    start_iso, end_iso = meta["start_date"], meta["end_date"]
    months = months_in_window(start_iso, end_iso)

    n_routes = 0
    n_dropped = 0
    for x in data["destinations"].values():
        for origin, rt in (x.get("routes") or {}).items():
            anchor = rt.get("anchor_airport") or x.get("iata")
            if not anchor:
                continue
            out = _merge_months(cache, origin, anchor, "out", months, start_iso, end_iso)
            ret = _merge_months(cache, anchor, origin, "ret", months, start_iso, end_iso)
            rt["outbound_fare"] = out
            rt["return_fare"] = ret
            rt["fare_model"] = FARE_MODEL
            n_routes += 1
            if not out or not ret:
                n_dropped += 1

    meta["flight_model"] = {
        "method": ("real per-day Ryanair fares from the farefinder cheapestPerDay "
                   "endpoint; only days that are actually bookable are kept "
                   "(soldOut/unavailable days are omitted, so a route that does "
                   "not operate on a date simply has no fare and won't be priced)."),
        "anchor_source": "ryanair_api_cheapest_per_day",
        "currency": CURRENCY,
        "window": f"{start_iso}..{end_iso}",
        "harvested_from": date.today().isoformat(),
    }

    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"patched {n_routes} routes; {n_dropped} have an empty leg in-window "
          f"(real gaps - those dates simply won't price)")


def refresh():
    """Scheduled-run entry point: roll the window forward to [today ..
    today+HORIZON_DAYS], throw away the cached fares so everything is re-fetched
    live (prices climb over time, so a stale cache would under-quote), then
    harvest + patch. Caller should `npm run build` afterwards to ship it."""
    today = date.today()
    start = today.isoformat()
    end = (today + timedelta(days=HORIZON_DAYS)).isoformat()

    data = load_app_data()
    data["meta"]["start_date"] = start
    data["meta"]["end_date"] = end
    APP_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"refresh: window rolled to {start} .. {end}")

    if CACHE.exists():
        CACHE.unlink()           # force live re-fetch of every route-month
        print("refresh: cleared stale fare cache")

    harvest()
    patch()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "refresh":
        refresh()
    else:
        if cmd in ("harvest", "all"):
            harvest()
        if cmd in ("patch", "all"):
            patch()
