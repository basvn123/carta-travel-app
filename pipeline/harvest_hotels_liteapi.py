"""LiteAPI (Nuitee) hotel-price anchors, the 3-star and 4/5-star stay tiers.

Why: with hostels (harvest_hostelworld.py) covering the cheap end, this covers
the comfortable end: what a 3-star and a 4/5-star double room cost per city,
so the stay-tier picker spans backpacker to boutique.

Source: LiteAPI v3 (docs.liteapi.travel), chosen after Amadeus Self-Service was
decommissioned (2026-07-17) and Booking.com was rejected long ago (no public
API, ToS). LiteAPI is self-service (free key at liteapi.travel), monetised via
booking margin, and its static /data/hotels endpoint carries star ratings.

Method, same convention as the other stay harvesters (stored nightly = ANNUAL
median, runtime scales by month):
  - per city: page the whole hotel list, then STRIDE-sample each star bucket
    (3 / 4 / 5) separately, because the listing order front-loads upmarket
    properties (see the sampling note below)
  - probe rates in SAMPLE_MONTHS for a 2-adult double; per hotel take the
    cheapest all-in rate (its entry price, incl. taxes billed at the desk)
  - median per star bucket per probe, de-seasoned by the global curve, then
    averaged into one annual figure per bucket

The stored figure is therefore "the typical ENTRY price of a hotel at this
star level in this city", the cheapest bookable room (usually non-refundable,
room only), not the average room. Measured 2026-07-28, a property's median
rate runs about 1.3x its entry rate, and that ratio is near-constant across
3/4/5 star, so comparisons between the tiers stay honest.

Credentials: LITEAPI_KEY (X-API-Key header), from the environment or the
repo-root .env (see env_local.py; NOT continent-app/.env, that one is Vite's).
Without it the script prints how to get one and exits cleanly, so pipeline
runs never fail on a missing key.
--fixtures runs the same aggregation from cache/fixtures/liteapi_fixture.json
(dev data, marked src="fixture", refused by apply_stay_tiers.py unless
--allow-fixtures).

Output: cache/hotel_city_anchors.json
  [{city, country, lat, lon, hotel3_night_eur, hotel4_night_eur,
    hotel5_night_eur, n_hotels, samples, src, captured}]

BILLING (checked 2026-07-28, docs.liteapi.travel/reference/api-pricing-usage-costs):
this harvester calls ONLY two endpoints, both in LiteAPI's free tier:
    GET  /data/hotels    hotel content/search
    POST /hotels/rates   the Rates step of the core booking workflow
Do NOT reach for these without pricing it first, they are metered per call:
    GET  /data/places, /data/places/{id}   $0.01 each
    GET  /pricing/index                    $0.05 each
That is why the coordinate search uses /data/hotels with latitude+longitude,
not the (billed) places lookup. Real money only moves when a BOOKING is made,
and Carta never books: it links out to the operator instead.

A full sweep is ~665 cities and roughly 15 hours, so it CHECKPOINTS: each city
lands in the anchor file as it finishes and a re-run resumes where it stopped
(--refresh re-harvests instead). Real and test prices are never merged into
one file; see resume_cache.py.

Usage:
    python pipeline/harvest_hotels_liteapi.py               # full sweep (resumes)
    python pipeline/harvest_hotels_liteapi.py --fixtures    # recorded fixtures
    python pipeline/harvest_hotels_liteapi.py --limit 20
    python pipeline/harvest_hotels_liteapi.py --refresh     # ignore the cache
"""

import argparse
import datetime as dt
import json
import os
import statistics
import sys
import time
import urllib.parse
import urllib.request

from pathlib import Path

from env_local import load_env
from resume_cache import ResumeCache

load_env()

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "cache" / "hotel_city_anchors.json"
FIXTURE = ROOT / "cache" / "fixtures" / "liteapi_fixture.json"

BASE = "https://api.liteapi.travel/v3.0"

SEASONALITY = {1: 0.82, 2: 0.82, 3: 0.90, 4: 0.98, 5: 1.08, 6: 1.15,
               7: 1.25, 8: 1.25, 9: 1.12, 10: 1.00, 11: 0.85, 12: 0.92}
SAMPLE_MONTHS = [2, 5, 8, 10]
NUM_NIGHTS = 2
LEAD_DAYS_MIN = 21
MIN_POP = 15000
# Sampling. /data/hotels returns a city in a fixed (prominence-like) order, so
# the first N hotels are NOT a random slice: measured 2026-07-28, Prague's real
# mix is 45% 3-star but its first 100 entries were 6% 3-star, and Barcelona's
# 48% showed up as 18%. Taking the head therefore both starved the 3-star
# sample and skewed it to prominent (pricier) properties, squeezing the gap
# between the tiers from below. Fix: page the whole city, then STRIDE-sample
# each star bucket separately so every bucket gets an even spread of the list.
HOTELS_PAGE = 1000           # /data/hotels page size
HOTELS_MAX_PAGES = 3         # 3k hotels is every European city we cover
# Hotels this far from the destination centre still count as "staying here".
# Deliberately tighter than the 20 km at which apply_stay_tiers assigns an
# anchor, so the two radii don't compound into a 40 km price blur.
SEARCH_RADIUS_M = 15000
SAMPLE_PER_BUCKET = 40       # hotels priced per star bucket (median needs far less)
MIN_HOTELS_PER_BUCKET = 4    # fewer priced hotels than this is noise, not a rate
CALL_GAP_S = 0.5

# The ONLY endpoints this harvester may ever call. Both sit in LiteAPI's free
# tier (docs.liteapi.travel/reference/api-pricing-usage-costs, re-checked
# 2026-08-14: hotel content and the Rates step are free, coordinate search
# included). /data/places and /pricing/index are METERED, so any new endpoint
# must be priced first and added here deliberately, not slipped in by accident.
FREE_ENDPOINTS = {("GET", "/data/hotels"), ("POST", "/hotels/rates")}


def api(method, path, key, params=None, body=None):
    if (method, path) not in FREE_ENDPOINTS:
        raise RuntimeError(
            f"refusing {method} {path}: not in FREE_ENDPOINTS. LiteAPI meters "
            "some endpoints per request; price it and allowlist it explicitly.")
    url = f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "X-API-Key": key, "Content-Type": "application/json",
        "User-Agent": "carta-pipeline/1.0",
    })
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def probe_date(month, today=None):
    """A bookable date in `month`, at least LEAD_DAYS_MIN out. Prefers a LATER
    day in the same month over rolling a whole year forward: suppliers load
    little inventory 12 months ahead, and an August probe made in late July
    used to jump to next August and come back nearly empty."""
    today = today or dt.date.today()
    for day in (15, 22, 27):
        d = dt.date(today.year, month, day)
        if (d - today).days >= LEAD_DAYS_MIN:
            return d
    return dt.date(today.year + 1, month, 15)


def star_bucket(stars):
    """3 | 4 | 5, or None below three stars. Ratings come rounded to the
    nearest half, so a 3.5 belongs with the threes."""
    if stars >= 5.0:
        return 5
    if stars >= 4.0:
        return 4
    if stars >= 3.0:
        return 3
    return None


def stride_sample(rows, n):
    """Up to `n` items spread EVENLY across an ordered list, not its head. The
    list arrives in prominence order, so a head slice would sample only the
    best-known (and priciest) properties in the bucket."""
    if len(rows) <= n:
        return rows
    step = len(rows) / n
    return [rows[int(i * step)] for i in range(n)]


def city_hotels(c, key):
    """A star-STRATIFIED sample of the hotels AROUND a destination's centre:
    [{id, stars, bucket}].

    Searched by COORDINATES, not by city name. Measured 2026-07-28, every one
    of Carta's 79 qualified names ("Paris (Orly)", "Hunedoara (Corvin
    Castle)") returned zero hotels by name, and stripping the qualifier is a
    trap: "Oslo (Torp)" is Sandefjord, 110 km from Oslo, so the name lookup
    would have priced it as Oslo. Coordinates give each destination its own
    market (Torp: 22 hotels of its own) and match the lat/lon rule the rest of
    the pipeline already uses. It also drops the ISO-code dependency, so
    Andorra, Monaco and the Faroes stop being unreachable.

    Then stride-samples each star bucket separately, so a listing order that
    front-loads upmarket properties still yields a representative 3-star
    sample (see the sampling note above)."""
    lat, lon = c.get("lat"), c.get("lon")
    if lat is None or lon is None:
        return []
    by_bucket = {3: [], 4: [], 5: []}
    for page in range(HOTELS_MAX_PAGES):
        resp = api("GET", "/data/hotels", key, params={
            "latitude": lat, "longitude": lon, "radius": SEARCH_RADIUS_M,
            "limit": HOTELS_PAGE, "offset": page * HOTELS_PAGE})
        rows = resp.get("data") or []
        for h in rows:
            stars = h.get("stars") or h.get("starRating")
            hid = h.get("id") or h.get("hotelId")
            b = star_bucket(float(stars)) if (hid and stars) else None
            if b:
                by_bucket[b].append({"id": hid, "stars": float(stars), "bucket": b})
        if len(rows) < HOTELS_PAGE:
            break
    out = []
    for b in (3, 4, 5):
        out += stride_sample(by_bucket[b], SAMPLE_PER_BUCKET)
    return out


def rate_total_eur(rate):
    """What the traveller actually pays for the stay: retailRate.total plus any
    tax or fee flagged included=false (city tax is billed at the desk and is
    NOT in the total). Matches the app's all-in convention elsewhere."""
    rr = rate.get("retailRate") or {}
    total = (rr.get("total") or [{}])[0].get("amount")
    if total is None:
        return None
    extra = sum(t.get("amount") or 0 for t in (rr.get("taxesAndFees") or [])
                if not t.get("included"))
    return total + extra


def probe_rates(hotels, date, key):
    """Cheapest 2-adult all-in total per night per hotel -> [{stars, night_eur}].
    Also returns whether the API served SANDBOX (test) rates."""
    checkout = date + dt.timedelta(days=NUM_NIGHTS)
    resp = api("POST", "/hotels/rates", key, body={
        "hotelIds": [h["id"] for h in hotels],
        "checkin": date.isoformat(),
        "checkout": checkout.isoformat(),
        "occupancies": [{"adults": 2}],
        "currency": "EUR",
        "guestNationality": "BE",
    })
    bucket_by_id = {h["id"]: h["bucket"] for h in hotels}
    out = []
    for h in resp.get("data") or []:
        hid = h.get("hotelId")
        best = None
        for rt in h.get("roomTypes") or []:
            for rate in rt.get("rates") or []:
                amount = rate_total_eur(rate)
                if amount is not None and (best is None or amount < best):
                    best = amount
        if hid in bucket_by_id and best:
            out.append({"bucket": bucket_by_id[hid], "night_eur": round(best / NUM_NIGHTS, 2)})
    return out, bool(resp.get("sandbox"))


def aggregate(city_probes):
    """[{month, hotels:[{bucket, night_eur}]}] -> annual medians per star tier.

    3, 4 and 5 star are kept SEPARATE. A bundled "4-5 star" figure measured
    neither: a city's 4-star hotels outnumber its 5-star ones roughly 3 to 1,
    so the blended median landed on the 4-star number and the luxury signal
    (about +45% on 4-star) vanished into the count."""
    annuals = {3: [], 4: [], 5: []}
    n_rated = 0
    for probe in city_probes:
        season = SEASONALITY.get(probe["month"], 1.0)
        n_rated = max(n_rated, len(probe["hotels"]))
        for b in (3, 4, 5):
            xs = [h["night_eur"] for h in probe["hotels"] if h["bucket"] == b]
            # A median over one or two hotels is noise, not a city rate (a
            # single 822-a-night outlier once WAS Brussels' 3-star median).
            if len(xs) >= MIN_HOTELS_PER_BUCKET:
                annuals[b].append(statistics.median(xs) / season)
    if not any(annuals.values()):
        return None
    out = {}
    for b in (3, 4, 5):
        out[f"hotel{b}_night_eur"] = (round(statistics.mean(annuals[b]), 2)
                                      if annuals[b] else None)
    out["n_hotels"] = n_rated      # hotels that actually returned a rate
    out["samples"] = len(city_probes)
    return out


def target_cities(dests, limit=None, only=None):
    seen, out = set(), []
    for d in dests.values():
        city, country = d.get("city"), d.get("country")
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if not city or not country or lat is None:
            continue
        pop = (d.get("geonames") or {}).get("population")
        if pop is not None and pop < MIN_POP:
            continue
        k = (city.lower(), country.lower())
        if k in seen:
            continue
        seen.add(k)
        if only and city.lower() not in only:
            continue
        out.append({"city": city, "country": country, "lat": lat, "lon": lon})
    out.sort(key=lambda c: (c["country"], c["city"]))
    return out[:limit] if limit else out


def harvest_real(cities, key, cache=None, probe_sandbox=False):
    anchors = []
    sandbox_seen = probe_sandbox
    t0 = time.time()
    done = 0
    for i, c in enumerate(cities):
        if cache is not None and cache.has(c):
            continue
        try:
            hotels = city_hotels(c, key)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {c['city']} hotel list: {e}")
            continue
        if not hotels:
            continue
        probes = []
        for month in SAMPLE_MONTHS:
            try:
                rated, sandbox = probe_rates(hotels, probe_date(month), key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {c['city']} rates: {e}")
                break
            sandbox_seen = sandbox_seen or sandbox
            probes.append({"month": month, "hotels": rated})
            time.sleep(CALL_GAP_S)
        agg = aggregate(probes) if probes else None
        if agg:
            # Sandbox rates are TEST data, not the market. Mark them so the
            # apply step refuses them exactly like dev fixtures.
            row = {**c, **agg,
                   "src": "liteapi_sandbox" if sandbox_seen else "liteapi",
                   "captured": dt.date.today().isoformat()}
            anchors.append(row)
            if cache is not None:
                cache.add(row)
            print(f"  {c['city']}: 3* {agg['hotel3_night_eur']} / 4* {agg['hotel4_night_eur']}"
                  f" / 5* {agg['hotel5_night_eur']} ({agg['n_hotels']} priced)")
        done += 1
        if done % 25 == 0:
            per = (time.time() - t0) / done
            left = (len(cities) - i - 1) * per / 3600
            print(f"  ... {i + 1}/{len(cities)} cities, {per:.0f}s each, ~{left:.1f}h left")
    if sandbox_seen:
        print("\n  WARNING: this key served SANDBOX rates (test data, not the real market).")
        print("  Anchors are marked src=liteapi_sandbox and apply_stay_tiers.py will refuse them.")
        print("  Switch to a production key in the LiteAPI dashboard for shippable prices.")
    return anchors


def harvest_fixtures():
    recorded = json.loads(FIXTURE.read_text(encoding="utf-8"))
    anchors = []
    for rec in recorded:
        agg = aggregate(rec["probes"])
        if not agg:
            continue
        anchors.append({"city": rec["city"], "country": rec["country"],
                        "lat": rec["lat"], "lon": rec["lon"], **agg,
                        "src": "fixture", "captured": dt.date.today().isoformat()})
    return anchors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", action="store_true",
                    help="build anchors from recorded fixtures (no credentials)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--cities", help="comma-separated city names to harvest")
    ap.add_argument("--refresh", action="store_true",
                    help="re-harvest cities already in the cache instead of resuming")
    args = ap.parse_args()

    if args.fixtures:
        anchors = harvest_fixtures()
    else:
        key = os.environ.get("LITEAPI_KEY")
        if not key:
            print("LITEAPI_KEY not set; nothing harvested.")
            print("(free self-service key at liteapi.travel, or run --fixtures for dev data)")
            return 0
        dests = json.loads(DATA.read_text(encoding="utf-8")).get("destinations", {})
        only = {c.strip().lower() for c in args.cities.split(",")} if args.cities else None
        cities = target_cities(dests, limit=args.limit, only=only)
        # A sand_* key can only ever produce test rates, so say so up front
        # rather than after a 15-hour sweep.
        sandbox_key = key.startswith("sand")
        if sandbox_key:
            print("NOTE: this is a SANDBOX key; the sweep will produce test prices "
                  "that apply_stay_tiers refuses. Use a prod_ key to ship.")
        cache = None if args.refresh else ResumeCache(
            OUT, kind="liteapi_sandbox" if sandbox_key else "liteapi")
        print(f"Probing {len(cities)} cities x {len(SAMPLE_MONTHS)} months on LiteAPI...")
        anchors = harvest_real(cities, key, cache=cache, probe_sandbox=sandbox_key)
        if cache is not None:
            cache.flush()
            # The cache file already holds this run plus everything resumed.
            n3 = sum(1 for a in cache.rows if a.get("hotel3_night_eur"))
            n5 = sum(1 for a in cache.rows if a.get("hotel5_night_eur"))
            print(f"Wrote {len(cache.rows)} hotel city anchors ({n3} with a 3-star, "
                  f"{n5} with a 5-star price) -> {OUT}")
            return 0

    # A run that measured nothing (bad key, API down) must not clobber a good
    # cache with an empty list; keep the last real harvest and say so.
    if not anchors and OUT.exists():
        print(f"0 anchors harvested; keeping the existing {OUT.name} untouched.")
        return 1
    OUT.write_text(json.dumps(anchors, indent=1, ensure_ascii=False), encoding="utf-8")
    n3 = sum(1 for a in anchors if a.get("hotel3_night_eur"))
    n5 = sum(1 for a in anchors if a.get("hotel5_night_eur"))
    print(f"Wrote {len(anchors)} hotel city anchors ({n3} with a 3-star, "
          f"{n5} with a 5-star price) -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
