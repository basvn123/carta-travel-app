"""Real Inside Airbnb city/island anchors for accommodation (schema v14).

Why: 476/524 destinations carried one nightly rate per COUNTRY, so Santorini
was priced as average Greece and Venice as average Italy. Booking.com was
considered as a source and rejected - it has no public data API, its ToS
forbid scraping, and it actively blocks it (Cloudflare + AWS WAF). Inside
Airbnb (insideairbnb.com, CC BY 4.0) publishes fresh listing-level snapshots
per city/region - the same source the notebook's original 32 anchors used -
and the June 2026 snapshots are current.

What this does, per configured dataset:
  1. Download listings.csv.gz into cache/iab/ (skipped when already there).
  2. Filter to Entire home/apt, accommodates 2-6, with a price.
  3. For multi-island regions (South Aegean, Crete) keep only listings within
     each destination's radius, so Santorini and Mykonos get their OWN median
     instead of one region blur; single-city datasets use the whole city.
  4. Trim the 1st/99th price percentile, take the median nightly and median
     capacity, convert to EUR where needed (Prague lists in CZK).
  5. Write cache/accommodation_city_anchors.json for
     apply_accommodation_anchors.py.

Convention note: the stored nightly is treated by the runtime as an ANNUAL
median that seasonality then scales (July x1.35) - identical to how the
notebook's June-captured anchors were treated, so these slot in consistently.

Usage:  python harvest_accommodation.py
"""

import csv
import gzip
import io
import json
import math
import statistics
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE_DIR = ROOT / "cache" / "iab"
OUT = ROOT / "cache" / "accommodation_city_anchors.json"

CZK_PER_EUR = 24.8   # July 2026

# dataset url -> how to slice it. "dests": destination id -> radius km
# (None radius = use the whole dataset for that destination).
DATASETS = [
    {
        "region": "south-aegean",
        "url": "https://data.insideairbnb.com/greece/south-aegean/south-aegean/2026-06-28/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"JTR": 20, "JMK": 20, "RHO": 25, "KGS": 20,
                  "gem:paros": 20, "gem:naxos": 25, "gem:milos": 20},
    },
    {
        "region": "crete",
        "url": "https://data.insideairbnb.com/greece/crete/crete/2026-06-29/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"CHQ": 30, "HER": 30},
    },
    {
        "region": "venice",
        "url": "https://data.insideairbnb.com/italy/veneto/venice/2026-06-15/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        # Historic centre only - the dataset includes mainland Mestre.
        "dests": {"VCE": 7, "TSF": 7},
    },
    {
        "region": "vienna",
        "url": "https://data.insideairbnb.com/austria/vienna/vienna/2026-06-20/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"VIE": None},
    },
    {
        "region": "prague",
        "url": "https://data.insideairbnb.com/czech-republic/prague/prague/2026-06-27/data/listings.csv.gz",
        "currency_per_eur": CZK_PER_EUR,
        "dests": {"PRG": None},
    },
    {
        "region": "munich",
        "url": "https://data.insideairbnb.com/germany/bv/munich/2026-06-29/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"MUC": None},
    },
    {
        "region": "malaga",
        "url": "https://data.insideairbnb.com/spain/andaluc%C3%ADa/malaga/2026-06-30/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"AGP": None},
    },
    {
        "region": "sevilla",
        "url": "https://data.insideairbnb.com/spain/andaluc%C3%ADa/sevilla/2026-06-30/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"SVQ": None},
    },
    {
        "region": "valencia",
        "url": "https://data.insideairbnb.com/spain/vc/valencia/2026-06-26/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"VLC": None},
    },
    {
        "region": "porto",
        "url": "https://data.insideairbnb.com/portugal/norte/porto/2026-06-23/data/listings.csv.gz",
        "currency_per_eur": 1.0,
        "dests": {"OPO": None},
    },
]

MIN_LISTINGS = 30
UA = {"User-Agent": "CartaTravelApp-accom/1.0 (contact: bas.vannieuwenhuyse123@gmail.com)"}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def download(url, region):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{region}.csv.gz"
    if path.exists() and path.stat().st_size > 100_000:
        print(f"  [{region}] cached ({path.stat().st_size/1e6:.1f} MB)")
        return path
    print(f"  [{region}] downloading...")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        path.write_bytes(r.read())
    print(f"  [{region}] {path.stat().st_size/1e6:.1f} MB")
    return path


def parse_listings(path):
    """-> [(lat, lon, accommodates, price_float)] for entire homes, 2-6 pax."""
    out = []
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("room_type") != "Entire home/apt":
                continue
            try:
                acc = int(float(row.get("accommodates") or 0))
                price_s = (row.get("price") or "").replace("$", "").replace(",", "")
                price = float(price_s)
                lat = float(row["latitude"])
                lon = float(row["longitude"])
            except (ValueError, KeyError):
                continue
            if not (2 <= acc <= 6) or price <= 0:
                continue
            out.append((lat, lon, acc, price))
    return out


def anchor_from(listings, per_eur):
    prices = sorted(p for _, _, _, p in listings)
    if len(prices) < MIN_LISTINGS:
        return None
    lo = prices[max(0, int(len(prices) * 0.01))]
    hi = prices[min(len(prices) - 1, int(len(prices) * 0.99))]
    kept = [(a, p) for _, _, a, p in listings if lo <= p <= hi]
    night = statistics.median(p for _, p in kept) / per_eur
    cap = int(round(statistics.median(a for a, _ in kept)))
    return {"entire_home_night_eur": round(night),
            "typical_capacity": max(2, cap),
            "n_listings": len(kept)}


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    dests = data["destinations"]
    anchors = {}
    print("Harvesting Inside Airbnb anchors:")
    for ds in DATASETS:
        try:
            path = download(ds["url"], ds["region"])
            listings = parse_listings(path)
        except Exception as e:
            print(f"  [{ds['region']}] FAILED: {e}")
            continue
        for did, radius in ds["dests"].items():
            d = dests.get(did)
            if not d:
                print(f"    {did}: not in dataset catalogue, skipped")
                continue
            if radius is None:
                subset = listings
            else:
                clat = d.get("city_lat", d.get("lat"))
                clon = d.get("city_lon", d.get("lon"))
                subset = [l for l in listings
                          if haversine_km(clat, clon, l[0], l[1]) <= radius]
            rec = anchor_from(subset, ds["currency_per_eur"])
            if not rec:
                print(f"    {did} ({d['city']}): only {len(subset)} listings, skipped")
                continue
            rec["source_region"] = ds["region"]
            rec["captured"] = ds["url"].split("/")[-3]
            anchors[did] = rec
            print(f"    {did} ({d['city']}): {rec['entire_home_night_eur']} EUR/night, "
                  f"cap {rec['typical_capacity']}, n={rec['n_listings']}")
    OUT.write_text(json.dumps(anchors, indent=1), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(anchors)} anchors")


if __name__ == "__main__":
    main()
