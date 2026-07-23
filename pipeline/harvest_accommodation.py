"""Real Inside Airbnb anchors for accommodation - maximal specificity (schema v16).

Why: the previous pass measured ~11 cities and hand-typed the rest, so most
"city-level" rates were actually a neighbour's number copied over, and EVERY
destination shared one global July x1.35 seasonality curve. This rebuilds the
accommodation layer to be as specific as the open data allows, on three axes:

  WHERE  every Inside Airbnb city/region snapshot currently published
         (insideairbnb.com/get-the-data, CC BY 4.0) - a real listing-level
         median per city/island, not a country blur.
  WHEN   a per-CITY seasonality curve derived from that city's review history
         (reviews.csv: a review lands after a real stay, so monthly review
         counts trace real demand seasonality - and, unlike the forward
         calendar, are not biased by the booking curve). Inside Airbnb dropped
         forward prices from calendar.csv, so this is the honest signal left:
         the SHAPE (which months peak) is real and city-specific; the amplitude
         is damped (demand swings harder than price) into a price-like curve.
         So Santorini's steep summer peak and Berlin's flat one each differ.
  WHAT   per-CAPACITY medians (2/4/6/8 sleepers) and per-NEIGHBOURHOOD medians
         from listings.csv, so a couple vs a group of seven, and the centro
         storico vs the periphery, each get an OBSERVED price.

Booking.com was considered and rejected (no public API, ToS forbids scraping,
actively blocked). Inside Airbnb is the same source the original 32 anchors
used; the June 2026 snapshots are current.

Output: cache/accommodation_city_anchors.json - a list of rich anchor records
consumed by apply_accommodation_anchors.py, which proximity-assigns each to the
catalogue (measured when a destination sits on the city, regional when it only
sits near one) and writes the seasonality/capacity/neighbourhood fields the
runtime now reads (runtime_pricing.js).

Convention: the stored nightly is an ANNUAL median that the runtime scales by
month; the seasonality curve here is normalised so its 12 values average ~1.0,
which keeps that contract intact.

Usage:  python harvest_accommodation.py            # all datasets
        python harvest_accommodation.py --no-calendar   # skip the WHEN axis
"""

import csv
import gzip
import json
import math
import statistics
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CACHE_DIR = ROOT / "cache" / "iab"
OUT = ROOT / "cache" / "accommodation_city_anchors.json"

# Local list-price currency -> units per EUR (July 2026). Inside Airbnb's `price`
# is whatever currency the host set for that market; non-euro markets need this.
FX = {"EUR": 1.0, "GBP": 0.85, "CZK": 24.8, "DKK": 7.46,
      "HUF": 395.0, "CHF": 0.96, "USD": 1.08}

BASE = "https://data.insideairbnb.com"

# region -> {path, date, currency, places}. `places` is [{name,lat,lon,radius}]:
# radius None uses the whole (already city-scoped) dataset; a radius carves a
# sub-place out of a multi-island/region dump so each island gets its own median.
DATASETS = [
    # ---- single-city snapshots (whole dataset = the city) ----
    {"region": "amsterdam",  "path": "the-netherlands/north-holland/amsterdam/2026-06-15", "cur": "EUR",
     "places": [{"name": "Amsterdam", "lat": 52.373, "lon": 4.892, "radius": None}]},
    {"region": "antwerp",    "path": "belgium/vlg/antwerp/2026-06-29", "cur": "EUR",
     "places": [{"name": "Antwerp", "lat": 51.219, "lon": 4.402, "radius": None}]},
    {"region": "athens",     "path": "greece/attica/athens/2026-06-28", "cur": "EUR",
     "places": [{"name": "Athens", "lat": 37.983, "lon": 23.727, "radius": 25}]},
    {"region": "barcelona",  "path": "spain/catalonia/barcelona/2026-06-24", "cur": "EUR",
     "places": [{"name": "Barcelona", "lat": 41.387, "lon": 2.170, "radius": None}]},
    {"region": "bergamo",    "path": "italy/lombardia/bergamo/2026-06-30", "cur": "EUR",
     "places": [{"name": "Bergamo", "lat": 45.694, "lon": 9.670, "radius": None}]},
    {"region": "berlin",     "path": "germany/be/berlin/2026-06-26", "cur": "EUR",
     "places": [{"name": "Berlin", "lat": 52.520, "lon": 13.405, "radius": None}]},
    {"region": "bologna",    "path": "italy/emilia-romagna/bologna/2026-06-26", "cur": "EUR",
     "places": [{"name": "Bologna", "lat": 44.494, "lon": 11.343, "radius": None}]},
    {"region": "bordeaux",   "path": "france/nouvelle-aquitaine/bordeaux/2026-06-22", "cur": "EUR",
     "places": [{"name": "Bordeaux", "lat": 44.838, "lon": -0.579, "radius": None}]},
    {"region": "bristol",    "path": "united-kingdom/england/bristol/2026-06-29", "cur": "GBP",
     "places": [{"name": "Bristol", "lat": 51.454, "lon": -2.588, "radius": None}]},
    {"region": "brussels",   "path": "belgium/bru/brussels/2026-06-27", "cur": "EUR",
     "places": [{"name": "Brussels", "lat": 50.846, "lon": 4.352, "radius": None}]},
    {"region": "budapest",   "path": "hungary/k%C3%B6z%C3%A9p-magyarorsz%C3%A1g/budapest/2026-06-28", "cur": "HUF",
     "places": [{"name": "Budapest", "lat": 47.497, "lon": 19.040, "radius": None}]},
    {"region": "copenhagen", "path": "denmark/hovedstaden/copenhagen/2026-06-30", "cur": "DKK",
     "places": [{"name": "Copenhagen", "lat": 55.677, "lon": 12.568, "radius": None}]},
    {"region": "dublin",     "path": "ireland/leinster/dublin/2026-06-21", "cur": "EUR",
     "places": [{"name": "Dublin", "lat": 53.350, "lon": -6.260, "radius": None}]},
    {"region": "edinburgh",  "path": "united-kingdom/scotland/edinburgh/2026-06-23", "cur": "GBP",
     "places": [{"name": "Edinburgh", "lat": 55.953, "lon": -3.188, "radius": None}]},
    {"region": "florence",   "path": "italy/toscana/florence/2026-06-26", "cur": "EUR",
     "places": [{"name": "Florence", "lat": 43.771, "lon": 11.254, "radius": None}]},
    {"region": "geneva",     "path": "switzerland/geneva/geneva/2026-06-29", "cur": "CHF",
     "places": [{"name": "Geneva", "lat": 46.204, "lon": 6.143, "radius": None}]},
    {"region": "ghent",      "path": "belgium/vlg/ghent/2026-06-29", "cur": "EUR",
     "places": [{"name": "Ghent", "lat": 51.054, "lon": 3.725, "radius": None}]},
    {"region": "girona",     "path": "spain/catalonia/girona/2026-06-30", "cur": "EUR",
     "places": [{"name": "Girona", "lat": 41.984, "lon": 2.824, "radius": None}]},
    {"region": "manchester", "path": "united-kingdom/england/greater-manchester/2026-06-28", "cur": "GBP",
     "places": [{"name": "Manchester", "lat": 53.480, "lon": -2.242, "radius": None}]},
    {"region": "istanbul",   "path": "turkey/marmara/istanbul/2026-06-30", "cur": "USD",
     "places": [{"name": "Istanbul", "lat": 41.008, "lon": 28.978, "radius": None}]},
    {"region": "lisbon",     "path": "portugal/lisbon/lisbon/2026-06-23", "cur": "EUR",
     "places": [{"name": "Lisbon", "lat": 38.722, "lon": -9.139, "radius": None}]},
    {"region": "london",     "path": "united-kingdom/england/london/2026-06-19", "cur": "GBP",
     "places": [{"name": "London", "lat": 51.507, "lon": -0.128, "radius": None}]},
    {"region": "lyon",       "path": "france/auvergne-rhone-alpes/lyon/2026-06-22", "cur": "EUR",
     "places": [{"name": "Lyon", "lat": 45.764, "lon": 4.836, "radius": None}]},
    {"region": "madrid",     "path": "spain/comunidad-de-madrid/madrid/2026-06-20", "cur": "EUR",
     "places": [{"name": "Madrid", "lat": 40.417, "lon": -3.703, "radius": None}]},
    {"region": "malaga",     "path": "spain/andaluc%C3%ADa/malaga/2026-06-30", "cur": "EUR",
     "places": [{"name": "Malaga", "lat": 36.721, "lon": -4.421, "radius": None}]},
    {"region": "milan",      "path": "italy/lombardy/milan/2026-06-25", "cur": "EUR",
     "places": [{"name": "Milan", "lat": 45.464, "lon": 9.190, "radius": None}]},
    {"region": "naples",     "path": "italy/campania/naples/2026-06-25", "cur": "EUR",
     "places": [{"name": "Naples", "lat": 40.852, "lon": 14.268, "radius": None}]},
    {"region": "munich",     "path": "germany/bv/munich/2026-06-29", "cur": "EUR",
     "places": [{"name": "Munich", "lat": 48.137, "lon": 11.575, "radius": None}]},
    {"region": "sevilla",    "path": "spain/andaluc%C3%ADa/sevilla/2026-06-30", "cur": "EUR",
     "places": [{"name": "Sevilla", "lat": 37.389, "lon": -5.994, "radius": None}]},
    {"region": "valencia",   "path": "spain/vc/valencia/2026-06-26", "cur": "EUR",
     "places": [{"name": "Valencia", "lat": 39.470, "lon": -0.376, "radius": None}]},
    {"region": "porto",      "path": "portugal/norte/porto/2026-06-23", "cur": "EUR",
     "places": [{"name": "Porto", "lat": 41.158, "lon": -8.629, "radius": None}]},
    {"region": "prague",     "path": "czech-republic/prague/prague/2026-06-27", "cur": "CZK",
     "places": [{"name": "Prague", "lat": 50.088, "lon": 14.420, "radius": None}]},
    {"region": "vienna",     "path": "austria/vienna/vienna/2026-06-20", "cur": "EUR",
     "places": [{"name": "Vienna", "lat": 48.209, "lon": 16.373, "radius": None}]},
    # ---- multi-place snapshots: one median per island/sub-city ----
    {"region": "crete",      "path": "greece/crete/crete/2026-06-29", "cur": "EUR",
     "places": [{"name": "Heraklion", "lat": 35.339, "lon": 25.133, "radius": 30},
                {"name": "Chania",    "lat": 35.512, "lon": 24.018, "radius": 30}]},
    {"region": "south-aegean", "path": "greece/south-aegean/south-aegean/2026-06-28", "cur": "EUR",
     "places": [{"name": "Santorini", "lat": 36.414, "lon": 25.432, "radius": 20},
                {"name": "Mykonos",   "lat": 37.446, "lon": 25.329, "radius": 20},
                {"name": "Naxos",     "lat": 37.104, "lon": 25.376, "radius": 25},
                {"name": "Paros",     "lat": 37.084, "lon": 25.152, "radius": 20},
                {"name": "Milos",     "lat": 36.744, "lon": 24.427, "radius": 20},
                {"name": "Rhodes",    "lat": 36.434, "lon": 28.218, "radius": 25},
                {"name": "Kos",       "lat": 36.893, "lon": 27.288, "radius": 20}]},
    {"region": "mallorca",   "path": "spain/islas-baleares/mallorca/2026-06-23", "cur": "EUR",
     "places": [{"name": "Mallorca", "lat": 39.571, "lon": 2.650, "radius": None}]},
    {"region": "menorca",    "path": "spain/islas-baleares/menorca/2026-06-30", "cur": "EUR",
     "places": [{"name": "Menorca", "lat": 39.887, "lon": 4.262, "radius": None}]},
    {"region": "euskadi",    "path": "spain/pv/euskadi/2026-06-30", "cur": "EUR",
     "places": [{"name": "Bilbao",         "lat": 43.263, "lon": -2.935, "radius": 25},
                {"name": "San Sebastian",  "lat": 43.318, "lon": -1.981, "radius": 20}]},
    {"region": "venice",     "path": "italy/veneto/venice/2026-06-15", "cur": "EUR",
     "places": [{"name": "Venice", "lat": 45.438, "lon": 12.336, "radius": 7}]},
]

MIN_LISTINGS = 30          # minimum to trust a median
MIN_BUCKET   = 12          # minimum listings for a per-capacity bucket
MIN_HOOD     = 25          # minimum listings for a neighbourhood median
UA = {"User-Agent": "CartaTravelApp-accom/2.0 (contact: bas.vannieuwenhuyse123@gmail.com)"}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# kind -> (cache suffix, url path, gzipped). 'reviews' uses the small
# visualisations summary (dates only, no comment text) - far smaller than the
# detailed data/reviews.csv.gz, and all we need for a monthly review histogram.
KINDS = {
    "listings": (".csv.gz", "data/listings.csv.gz", True),
    "reviews":  (".rev.csv", "visualisations/reviews.csv", False),
}


def download(kind, region, path):
    """Cached by region+kind, skipped if already present."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    suffix, rel, _ = KINDS[kind]
    fp = CACHE_DIR / f"{region}{suffix}"
    if fp.exists() and fp.stat().st_size > 40_000:
        print(f"  [{region}/{kind}] cached ({fp.stat().st_size/1e6:.1f} MB)")
        return fp
    url = f"{BASE}/{path}/{rel}"
    print(f"  [{region}/{kind}] downloading {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r:
        fp.write_bytes(r.read())
    print(f"  [{region}/{kind}] {fp.stat().st_size/1e6:.1f} MB")
    return fp


def clean_price(s):
    try:
        return float((s or "").replace("$", "").replace(",", "").replace("€", "").strip())
    except ValueError:
        return None


def parse_listings(path):
    """-> [(lat, lon, accommodates, price, neighbourhood)] for entire homes, 2-6 pax."""
    out = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("room_type") != "Entire home/apt":
                continue
            price = clean_price(row.get("price"))
            if price is None or price <= 0:
                continue
            try:
                acc = int(float(row.get("accommodates") or 0))
                lat = float(row["latitude"])
                lon = float(row["longitude"])
            except (ValueError, KeyError):
                continue
            if not (2 <= acc <= 8):
                continue
            hood = (row.get("neighbourhood_cleansed") or row.get("neighbourhood") or "").strip()
            out.append((lat, lon, acc, price, hood))
    return out


SEASON_GAMMA = 0.4     # damps demand (review) amplitude toward price amplitude
SEASON_CLAMP = (0.6, 1.85)
SEASON_MIN_REVIEWS = 800


def parse_reviews_seasonality(path):
    """12 monthly price multipliers (index 0=Jan..11=Dec) from a reviews file, or
    None. A review follows a real stay, so the monthly review histogram traces
    demand seasonality (the reviews.csv summary is dates only). Demand swings far
    harder than price, so the raw month share is damped by SEASON_GAMMA, then
    normalised so the 12 values average 1.0 and clamped."""
    counts = [0] * 12
    total = 0
    try:
        with open(path, "rt", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                d = row.get("date") or ""
                if len(d) < 7 or d[4] != "-":
                    continue
                try:
                    m = int(d[5:7])
                except ValueError:
                    continue
                if 1 <= m <= 12:
                    counts[m - 1] += 1
                    total += 1
    except OSError:
        return None
    present = sum(1 for c in counts if c > 0)
    if total < SEASON_MIN_REVIEWS or present < 8:
        return None
    mean = total / 12.0
    lo, hi = SEASON_CLAMP
    # (share / mean_share) ** gamma, with a small floor so a zero month isn't 0.
    raw = [max(counts[i], mean * 0.05) / mean for i in range(12)]
    damped = [r ** SEASON_GAMMA for r in raw]
    g = sum(damped) / 12.0
    clamped = [min(hi, max(lo, x / g)) for x in damped]
    # Re-normalise so the 12 values average exactly 1.0 - the stored nightly is
    # an annual median, and the runtime multiplies it by this curve.
    mc = sum(clamped) / 12.0
    return [round(x / mc, 3) for x in clamped]


def median_or_none(vals):
    return statistics.median(vals) if vals else None


def anchor_for_place(listings, place, per_eur, region, captured, seasonality):
    """Rich anchor for one place: overall median + capacity buckets + neighbourhoods."""
    if place["radius"] is None:
        subset = listings
    else:
        subset = [l for l in listings
                  if haversine_km(place["lat"], place["lon"], l[0], l[1]) <= place["radius"]]
    prices = sorted(p for _, _, _, p, _ in subset)
    if len(prices) < MIN_LISTINGS:
        return None
    lo = prices[max(0, int(len(prices) * 0.01))]
    hi = prices[min(len(prices) - 1, int(len(prices) * 0.99))]
    kept = [(a, p, h) for _, _, a, p, h in subset if lo <= p <= hi]

    # Deflate the snapshot to an ANNUAL-median basis. listings.csv `price` is a
    # near-scrape-date (here late-June) nightly; the stored value must be the
    # annual median so the runtime can re-apply the month curve without
    # double-counting summer. Dividing by this city's own capture-month
    # multiplier makes it round-trip exactly: price(June) == the snapshot.
    defl = 1.0
    if seasonality:
        try:
            cm = int(captured[5:7])
            if 1 <= cm <= 12 and seasonality[cm - 1]:
                defl = seasonality[cm - 1]
        except (ValueError, IndexError):
            defl = 1.0
    unit = per_eur * defl                     # local->EUR and summer->annual in one

    night = median_or_none([p for _, p, _ in kept]) / unit
    cap = int(round(median_or_none([a for a, _, _ in kept])))

    # Capacity buckets: observed median whole-home nightly for each group size.
    buckets = {}
    by_cap = defaultdict(list)
    for a, p, _ in kept:
        by_cap[a].append(p)
    for c in (2, 3, 4, 5, 6, 7, 8):
        vals = by_cap.get(c, [])
        if len(vals) >= MIN_BUCKET:
            buckets[str(c)] = round(statistics.median(vals) / unit)

    # Neighbourhood medians (only meaningful for a whole-city dataset).
    hoods = []
    if place["radius"] is None:
        by_hood = defaultdict(list)
        for _, _, a, p, h in subset:              # use full (untrimmed) for centroids
            if h and lo <= p <= hi:
                by_hood[h].append((a, p))
        for h, rows in by_hood.items():
            if len(rows) < MIN_HOOD:
                continue
            hoods.append({
                "name": h,
                "night_eur": round(statistics.median(p for _, p in rows) / unit),
                "cap": int(round(statistics.median(a for a, _ in rows))),
                "n": len(rows),
            })
        hoods.sort(key=lambda x: -x["n"])
        hoods = hoods[:20]

    return {
        "name": place["name"],
        "lat": place["lat"],
        "lon": place["lon"],
        "entire_home_night_eur": round(night),
        "typical_capacity": max(2, cap),
        "capacity_buckets": buckets,
        "neighbourhoods": hoods,
        "seasonality": seasonality,           # per-city monthly curve or None
        "n_listings": len(kept),
        "region": region,
        "captured": captured,
    }


def main():
    want_season = "--no-seasonality" not in sys.argv
    anchors = []
    print(f"Harvesting Inside Airbnb anchors ({len(DATASETS)} datasets, "
          f"seasonality={'on' if want_season else 'off'}):")
    for ds in DATASETS:
        region, path, cur = ds["region"], ds["path"], ds["cur"]
        captured = path.rstrip("/").split("/")[-1]
        per_eur = FX[cur]
        try:
            lp = download("listings", region, path)
            listings = parse_listings(lp)
        except Exception as e:
            print(f"  [{region}] listings FAILED: {e}")
            continue

        seasonality = None
        if want_season:
            try:
                rp = download("reviews", region, path)
                seasonality = parse_reviews_seasonality(rp)
                tag = "curve" if seasonality else "flat/sparse"
                print(f"  [{region}] seasonality {tag}")
            except Exception as e:
                print(f"  [{region}] reviews skipped: {e}")

        for place in ds["places"]:
            rec = anchor_for_place(listings, place, per_eur, region, captured, seasonality)
            if not rec:
                print(f"    {place['name']}: too few listings, skipped")
                continue
            anchors.append(rec)
            peak = max(seasonality) if seasonality else None
            print(f"    {place['name']}: {rec['entire_home_night_eur']} EUR/night "
                  f"cap {rec['typical_capacity']} buckets={list(rec['capacity_buckets'])} "
                  f"hoods={len(rec['neighbourhoods'])} n={rec['n_listings']}"
                  + (f" peak x{peak}" if peak else ""))

    OUT.write_text(json.dumps(anchors, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {OUT.name}: {len(anchors)} anchors from {len(DATASETS)} datasets")


if __name__ == "__main__":
    main()
