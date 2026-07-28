"""Hostelworld hostel-price anchors, the dorm + private-room stay tiers.

Why: accommodation is Airbnb-entire-home only, so the map quietly prices every
traveller as a whole-apartment renter. A backpacker pays a third of that. This
harvest measures, per city, what a dorm bed and a cheap private room actually
cost on Hostelworld, so the runtime can offer a "how expensive do you want to
stay" choice instead of one silent assumption.

Source: the Hostelworld Partner API (partner-api.hostelworld.com, affiliate
programme credentials required). Endpoint used: propertylocationsearch.json,
which returns, per property, its type (HOSTEL / HOTEL / GUESTHOUSE / CAMPSITE /
APARTMENT) and bedPrices.cheapestDorm / cheapestPrivate in EUR.

Method, mirroring the Inside Airbnb convention (stored nightly = ANNUAL median,
runtime scales by month):
  - probe each city in SAMPLE_MONTHS (spread over the year, NumNights=2)
  - per probe: median of per-property cheapest dorm across hostels, and median
    cheapest private across hostels + guesthouses
  - de-season each probe by the global curve (runtime_pricing DEFAULT), then
    average the probes back into one annual figure
Only cities we could plausibly cover are queried (population floor via
dest.geonames), because a village query is a wasted API call: no hostel there.

Credentials: HW_CONSUMER_KEY + HW_CONSUMER_SECRET, from the environment or the
repo-root .env (see env_local.py; NOT continent-app/.env, that one is Vite's).
Every request carries consumer_key + consumer_signature. NOTE the signature scheme below
(SIGNATURE_SCHEME) is the legacy documented one (md5 of url + secret); confirm
it against the welcome pack when the affiliate application is approved, it is
isolated in sign_url() on purpose.

No credentials?  --fixtures runs the whole aggregation path from
cache/fixtures/hostelworld_fixture.json (recorded-shape probe data) so the
downstream chain (apply_stay_tiers.py, runtime, UI) is buildable and testable
today. Fixture-built anchors are marked "src": "fixture" and
apply_stay_tiers.py refuses them without --allow-fixtures, so scheduled
pipeline runs can never ship fake prices.

Output: cache/hostel_city_anchors.json
  [{city, country, lat, lon, dorm_pp_night_eur, private_room_night_eur,
    hotel_night_eur, n_hostels, avg_rating, samples, src, captured}]

A full sweep is ~665 cities and several hours, so it CHECKPOINTS: each city
lands in the anchor file as it finishes and a re-run resumes where it stopped
(--refresh re-harvests instead). See resume_cache.py.

Usage:
    python pipeline/harvest_hostelworld.py               # full sweep (resumes)
    python pipeline/harvest_hostelworld.py --fixtures    # recorded fixtures
    python pipeline/harvest_hostelworld.py --limit 20    # first N cities only
"""

import argparse
import datetime as dt
import hashlib
import hmac
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
OUT = ROOT / "cache" / "hostel_city_anchors.json"
FIXTURE = ROOT / "cache" / "fixtures" / "hostelworld_fixture.json"

BASE = "https://partner-api.hostelworld.com"

# Legacy Hostelworld affiliate signing: md5(full_url + secret). Kept in one
# place because the welcome pack may specify an HMAC variant instead; flip
# SIGNATURE_SCHEME after confirming. Do NOT scatter signing logic.
SIGNATURE_SCHEME = "md5-concat"   # "md5-concat" | "hmac-sha256"

# Same shape as DEFAULT_ACCOM_MODEL.seasonality in runtime_pricing.js: the
# calibrated global curve. A probe in month m is divided by curve[m] so the
# stored figure is an annual median the runtime re-seasons.
SEASONALITY = {1: 0.82, 2: 0.82, 3: 0.90, 4: 0.98, 5: 1.08, 6: 1.15,
               7: 1.25, 8: 1.25, 9: 1.12, 10: 1.00, 11: 0.85, 12: 0.92}

# Four probes spread across the year: deep winter, shoulder, peak, autumn.
SAMPLE_MONTHS = [2, 5, 8, 10]
NUM_NIGHTS = 2
LEAD_DAYS_MIN = 21          # never probe closer than 3 weeks out (last-minute noise)
MIN_POP = 15000             # skip villages: no hostel market to measure
# Properties beyond this from the centre belong to another town's market.
# Tighter than the 20 km at which apply_stay_tiers assigns an anchor, so
# the two radii do not compound into a 40 km price blur.
SEARCH_RADIUS_KM = 15
# A median over one or two properties is noise, not a city rate.
MIN_PROPS = 3
CALL_GAP_S = 0.7            # be a polite affiliate

DORM_TYPES = {"HOSTEL"}
PRIVATE_TYPES = {"HOSTEL", "GUESTHOUSE"}
# Hostelworld also lists plain hotels, which gives a real, FREE hotel tier for
# anyone who never gets a LiteAPI key. It carries no star classification (the
# API exposes guest ratings, not stars), so this is an honest unstarred
# "hotel" price, NOT a 3-star one: the star tiers stay LiteAPI's job.
HOTEL_TYPES = {"HOTEL"}
QUERY_TYPES = DORM_TYPES | PRIVATE_TYPES | HOTEL_TYPES


def sign_url(url, secret):
    if SIGNATURE_SCHEME == "hmac-sha256":
        return hmac.new(secret.encode(), url.encode(), hashlib.sha256).hexdigest()
    return hashlib.md5((url + secret).encode()).hexdigest()


def api_get(path, params, key, secret):
    """One signed GET. Returns the parsed 'result' or raises on API errors."""
    q = dict(params)
    q["consumer_key"] = key
    url = f"{BASE}/{path}?{urllib.parse.urlencode(q)}"
    full = url + "&consumer_signature=" + sign_url(url, secret)
    req = urllib.request.Request(full, headers={"User-Agent": "carta-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read().decode("utf-8"))
    errors = (payload.get("result") or {}).get("errors")
    if errors:
        raise RuntimeError(f"HW API error for {path}: {errors}")
    return payload.get("result") or {}


def probe_date(month, today=None):
    """A bookable date in `month`, at least LEAD_DAYS_MIN out. Prefers a LATER
    day in the same month over rolling a whole year forward: properties load
    little inventory 12 months ahead, so a near-month probe would come back
    empty rather than cheap."""
    today = today or dt.date.today()
    for day in (15, 22, 27):
        d = dt.date(today.year, month, day)
        if (d - today).days >= LEAD_DAYS_MIN:
            return d
    return dt.date(today.year + 1, month, 15)


def parse_probe(result, max_km=None):
    """Real API response -> the recorded probe shape the aggregator eats.
    A coordinate search returns properties by distance, so anything beyond
    `max_km` is another town's market and is dropped rather than blended in."""
    props = []
    for p in result.get("Properties") or []:
        if max_km is not None:
            km = (p.get("distance") or {}).get("value")
            unit = ((p.get("distance") or {}).get("unit") or "km").lower()
            if km is not None:
                km = float(km) * (1.609 if unit.startswith("mi") else 1.0)
                if km > max_km:
                    continue
        bed = p.get("bedPrices") or {}
        props.append({
            "type": (p.get("type") or "").upper(),
            "dorm_eur": _eur(bed.get("cheapestDorm")),
            "private_eur": _eur(bed.get("cheapestPrivate")),
            "rating": p.get("avgRating"),
        })
    return props


def _eur(prices):
    if not isinstance(prices, dict):
        return None
    v = prices.get("EUR")
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def aggregate(city_probes):
    """[{month, properties:[{type, dorm_eur, private_eur, rating}]}] -> anchor
    numbers. Median per probe, de-seasoned, then averaged across probes."""
    dorm_annuals, priv_annuals, hotel_annuals, ratings = [], [], [], []
    n_hostels = n_hotels = 0
    for probe in city_probes:
        season = SEASONALITY.get(probe["month"], 1.0)
        dorms = [p["dorm_eur"] for p in probe["properties"]
                 if p["type"] in DORM_TYPES and p.get("dorm_eur")]
        privs = [p["private_eur"] for p in probe["properties"]
                 if p["type"] in PRIVATE_TYPES and p.get("private_eur")]
        hotels = [p["private_eur"] for p in probe["properties"]
                  if p["type"] in HOTEL_TYPES and p.get("private_eur")]
        n_hotels = max(n_hotels, len(hotels))
        if len(hotels) >= MIN_PROPS:
            hotel_annuals.append(statistics.median(hotels) / season)
        n_hostels = max(n_hostels, sum(1 for p in probe["properties"] if p["type"] in DORM_TYPES))
        ratings += [p["rating"] for p in probe["properties"]
                    if p["type"] in DORM_TYPES and p.get("rating")]
        if dorms:
            dorm_annuals.append(statistics.median(dorms) / season)
        if privs:
            priv_annuals.append(statistics.median(privs) / season)
    if not dorm_annuals and not priv_annuals and not hotel_annuals:
        return None
    return {
        "dorm_pp_night_eur": round(statistics.mean(dorm_annuals), 2) if dorm_annuals else None,
        "private_room_night_eur": round(statistics.mean(priv_annuals), 2) if priv_annuals else None,
        "hotel_night_eur": round(statistics.mean(hotel_annuals), 2) if hotel_annuals else None,
        "n_hostels": n_hostels,
        "n_hw_hotels": n_hotels,
        "avg_rating": round(statistics.mean(ratings), 2) if ratings else None,
        "samples": len(city_probes),
    }


def target_cities(dests, limit=None, only=None):
    """Unique (city, country) worth querying: has coords and is town-sized.
    city_lat/city_lon FIRST (downtown, not the airport)."""
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


def harvest_real(cities, key, secret, cache=None):
    anchors = []
    t0 = time.time()
    done = 0
    for i, c in enumerate(cities):
        if cache is not None and cache.has(c):
            continue
        probes = []
        for month in SAMPLE_MONTHS:
            date = probe_date(month)
            try:
                # Searched by COORDINATES, not City/Country: Carta's 79
                # qualified names ("Oslo (Torp)", "Paris (Orly)") match no
                # hotel database, and stripping the qualifier would price
                # Torp as Oslo, 110 km away. Same rule the rest of the
                # pipeline uses. See harvest_hotels_liteapi.city_hotels.
                result = api_get("propertylocationsearch.json", {
                    "latitude": c["lat"],
                    "longitude": c["lon"],
                    "DateStart": date.isoformat(),
                    "NumNights": NUM_NIGHTS,
                    "Currency": "EUR",
                    "PropertyTypes": ",".join(sorted(QUERY_TYPES)),
                }, key, secret)
            except Exception as e:  # noqa: BLE001 - a bad city must not kill the run
                print(f"  ! {c['city']}: {e}")
                break
            probes.append({"month": month,
                           "properties": parse_probe(result, SEARCH_RADIUS_KM)})
            time.sleep(CALL_GAP_S)
        agg = aggregate(probes) if probes else None
        if agg:
            row = {**c, **agg, "src": "hostelworld",
                   "captured": dt.date.today().isoformat()}
            anchors.append(row)
            if cache is not None:
                cache.add(row)
            print(f"  {c['city']}: dorm {agg['dorm_pp_night_eur']} / private {agg['private_room_night_eur']} ({agg['n_hostels']} hostels)")
        done += 1
        if done % 25 == 0:
            per = (time.time() - t0) / done
            left = (len(cities) - i - 1) * per / 3600
            print(f"  ... {i + 1}/{len(cities)} cities, {per:.0f}s each, ~{left:.1f}h left")
    return anchors


def harvest_fixtures():
    """Recorded probe data through the SAME aggregate() path as the real API."""
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
    ap.add_argument("--limit", type=int, help="only the first N cities")
    ap.add_argument("--cities", help="comma-separated city names to harvest")
    ap.add_argument("--refresh", action="store_true",
                    help="re-harvest cities already in the cache instead of resuming")
    args = ap.parse_args()

    if args.fixtures:
        anchors = harvest_fixtures()
    else:
        key = os.environ.get("HW_CONSUMER_KEY")
        secret = os.environ.get("HW_CONSUMER_SECRET")
        if not key or not secret:
            print("HW_CONSUMER_KEY / HW_CONSUMER_SECRET not set; nothing harvested.")
            print("(apply for credentials at partners.hostelworld.com, or run --fixtures for dev data)")
            return 0
        dests = json.loads(DATA.read_text(encoding="utf-8")).get("destinations", {})
        only = {c.strip().lower() for c in args.cities.split(",")} if args.cities else None
        cities = target_cities(dests, limit=args.limit, only=only)
        cache = None if args.refresh else ResumeCache(OUT, kind="hostelworld")
        print(f"Probing {len(cities)} cities x {len(SAMPLE_MONTHS)} months on Hostelworld...")
        anchors = harvest_real(cities, key, secret, cache=cache)
        if cache is not None:
            cache.flush()
            n_dorm = sum(1 for a in cache.rows if a.get("dorm_pp_night_eur"))
            print(f"Wrote {len(cache.rows)} hostel city anchors ({n_dorm} with a dorm price) -> {OUT}")
            return 0

    # A run that measured nothing (bad key, API down) must not clobber a good
    # cache with an empty list; keep the last real harvest and say so.
    if not anchors and OUT.exists():
        print(f"0 anchors harvested; keeping the existing {OUT.name} untouched.")
        return 1
    OUT.write_text(json.dumps(anchors, indent=1, ensure_ascii=False), encoding="utf-8")
    n_dorm = sum(1 for a in anchors if a.get("dorm_pp_night_eur"))
    print(f"Wrote {len(anchors)} hostel city anchors ({n_dorm} with a dorm price) -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
