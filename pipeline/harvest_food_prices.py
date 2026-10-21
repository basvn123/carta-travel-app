"""Harvest the inputs of the food and drink price model (T513).

Tier: Scheduled (run_pipeline task food, monthly)

Writes cache/food_price_inputs.json, everything apply_food_prices.py needs and
nothing else, so the apply step runs offline and in seconds:

  {
    "harvested": "2026-10-21",
    "pli":   {"A0111": {"BE": {"value": 124.2, "year": 2024}, ...}, ...},
    "hicp":  {"CP111": {"BE": {"2024-01": 98.1, ...}}, "CP011": {...}},
    "fx":    {"PLN": {"2024-01": 4.36, ...}, ...},            # units per euro
    "gdp":   {"BE100": {"value": 214.0, "year": 2024}, ...},  # PPS per head, NUTS 0-3
    "receipts": {"index": [[lat, lon, cc, ratio, n], ...],    # one row per shop
                 "country": {"FR": {"index": 0.98, "n": 812}, ...},
                 "dump": "2026-10-20", "window_months": 24}
  }

Sources (no keys, one request per table, all open licences):
  Eurostat prc_ppp_ind      price level indices, EU27_2020 = 100 (yearly)
  Eurostat prc_hicp_minr    HICP, ECOICOP 2, monthly index 2025 = 100
  Eurostat ert_bil_eur_m    euro exchange rates, monthly average
  Eurostat nama_10r_3gdp    GDP per head in PPS, NUTS 3 (income tilt)
  Open Food Facts Open Prices daily dump (ODbL): prices + locations

The receipts index is a MATCHED-PRODUCT index: a shelf price is compared only
with the same barcode (or the same loose product per kg) elsewhere in the same
country, so a shop that sells organic quinoa does not read as dear next to one
that sells potatoes. Each shop row is the median of its prices divided by each
product's national median; apply_food_prices.py takes the weighted median of
the shops near a place.

Usage:
    python pipeline/harvest_food_prices.py            # fetch what is stale (> 20 days)
    python pipeline/harvest_food_prices.py --refresh  # fetch everything again
"""

import argparse
import datetime as dt
import gzip
import json
import statistics
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
OUT = CACHE / "food_price_inputs.json"
DUMP_DIR = CACHE / "open_prices"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
OP_DUMP = "https://prices.openfoodfacts.org/data/"
STALE_DAYS = 20

# Price level categories (prc_ppp_ind ppp_cat) the model reads.
PLI_CATS = {
    "A0111": "restaurants and hotels",
    "A010101": "food",
    "A010102": "non-alcoholic beverages",
    "A010201": "alcoholic beverages",
}
# HICP categories (ECOICOP 2): food and beverage serving services, and food.
HICP_CATS = ("CP111", "CP011")
# Currencies of the catalogue's non-euro countries. Pegged ones (BAM to the
# euro since 1998) and countries that use the euro without issuing it (ME, XK,
# AD, MC, SM, VA) are absent on purpose: their euro price is their price.
CURRENCIES = ("GBP", "CHF", "NOK", "SEK", "DKK", "ISK", "PLN", "CZK", "HUF",
              "RON", "RSD", "MKD", "ALL", "TRY", "MDL")
GEO_TO_ISO2 = {"EL": "GR", "UK": "GB"}
RECEIPT_MONTHS = 24
MIN_PRODUCT_OBS = 3       # national observations of one product before it counts
MAX_RATIO = 3.0           # a price 3x its national median is a typo or a unit mix-up


def http_json(url, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # network blips: retry, then give up loudly
            if attempt == tries - 1:
                raise
            print(f"  retry {attempt + 1} after {e}")
            time.sleep(4 * (attempt + 1))


def jsonstat_rows(doc):
    """Flatten a Eurostat JSON-stat 2.0 document to (dims dict, value) rows."""
    ids = doc["id"]
    sizes = doc["size"]
    cats = []
    for dim in ids:
        idx = doc["dimension"][dim]["category"]["index"]
        inv = {v: k for k, v in idx.items()}
        cats.append(inv)
    for flat, val in doc["value"].items():
        flat = int(flat)
        pos = []
        for size in reversed(sizes):
            pos.append(flat % size)
            flat //= size
        pos.reverse()
        yield {dim: cats[i][p] for i, (dim, p) in enumerate(zip(ids, pos))}, val


def iso2(geo):
    return GEO_TO_ISO2.get(geo, geo)


def fetch_pli():
    out = {}
    for cat in PLI_CATS:
        doc = http_json(f"{EUROSTAT}prc_ppp_ind?format=JSON&lang=EN"
                        f"&na_item=PLI_EU27_2020&ppp_cat={cat}&sinceTimePeriod=2018")
        best = {}
        for dims, val in jsonstat_rows(doc):
            geo = dims["geo"]
            if len(geo) != 2 and geo != "EU27_2020":
                continue
            yr = int(dims["time"])
            if geo not in best or yr > best[geo]["year"]:
                best[geo] = {"value": val, "year": yr}
        out[cat] = {iso2(g): v for g, v in best.items()}
        print(f"  price levels {cat} ({PLI_CATS[cat]}): {len(out[cat])} geos")
    return out


def fetch_hicp():
    out = {}
    for cat in HICP_CATS:
        doc = http_json(f"{EUROSTAT}prc_hicp_minr?format=JSON&lang=EN"
                        f"&coicop18={cat}&unit=I25&sinceTimePeriod=2019-01")
        series = defaultdict(dict)
        for dims, val in jsonstat_rows(doc):
            series[iso2(dims["geo"])][dims["time"]] = val
        out[cat] = dict(series)
        last = max((m for s in series.values() for m in s), default=None)
        print(f"  HICP {cat}: {len(series)} geos, latest month {last}")
    return out


def fetch_fx():
    cur = "+".join(CURRENCIES)
    doc = http_json(f"{EUROSTAT}ert_bil_eur_m?format=JSON&lang=EN"
                    f"&statinfo=AVG&sinceTimePeriod=2019-01&" +
                    "&".join(f"currency={c}" for c in CURRENCIES))
    series = defaultdict(dict)
    for dims, val in jsonstat_rows(doc):
        series[dims["currency"]][dims["time"]] = val
    print(f"  exchange rates: {len(series)} currencies ({cur.count('+') + 1} asked)")
    return dict(series)


def fetch_gdp():
    doc = http_json(f"{EUROSTAT}nama_10r_3gdp?format=JSON&lang=EN"
                    "&unit=PPS_EU27_2020_HAB&sinceTimePeriod=2019")
    best = {}
    for dims, val in jsonstat_rows(doc):
        geo = dims["geo"]
        yr = int(dims["time"])
        if geo not in best or yr > best[geo]["year"]:
            best[geo] = {"value": val, "year": yr}
    print(f"  regional income: {len(best)} NUTS regions")
    return best


def download_dump(name, refresh):
    DUMP_DIR.mkdir(parents=True, exist_ok=True)
    path = DUMP_DIR / name
    fresh = path.exists() and (time.time() - path.stat().st_mtime) < STALE_DAYS * 86400
    if refresh or not fresh:
        print(f"  downloading Open Prices {name} ...")
        req = urllib.request.Request(OP_DUMP + name, headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r:
            tmp = path.with_suffix(".part")
            tmp.write_bytes(r.read())
            tmp.replace(path)
    return path


def latest_fx(fx):
    """Latest monthly rate per currency (units per euro)."""
    return {c: s[max(s)] for c, s in fx.items() if s}


def harvest_receipts(refresh, fx_now):
    """Matched-product shelf price index rows from the Open Prices dump."""
    loc_path = download_dump("locations.jsonl.gz", refresh)
    price_path = download_dump("prices.jsonl.gz", refresh)
    locs = {}
    with gzip.open(loc_path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if r.get("type") != "OSM" or r.get("osm_lat") is None:
                continue
            cc = (r.get("osm_address_country_code") or "").upper()
            if cc:
                locs[r["id"]] = (float(r["osm_lat"]), float(r["osm_lon"]), cc)
    since = (dt.date.today() - dt.timedelta(days=RECEIPT_MONTHS * 30.5)).isoformat()
    obs = defaultdict(list)          # (cc, product key) -> [(lat, lon, eur)]
    n_rows = 0
    with gzip.open(price_path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if (r.get("date") or "") < since or r.get("duplicate_of"):
                continue
            loc = locs.get(r.get("location_id"))
            if not loc:
                continue
            price = r.get("price_without_discount") if r.get("price_is_discounted") else r.get("price")
            if price in (None, "") or float(price) <= 0:
                continue
            cur = r.get("currency") or "EUR"
            rate = 1.0 if cur == "EUR" else fx_now.get(cur)
            if rate is None:
                continue
            if r.get("type") == "PRODUCT" and r.get("product_code"):
                key = "p:" + r["product_code"]
            elif r.get("category_tag") and r.get("price_per"):
                key = f"c:{r['category_tag']}:{r['price_per']}"
            else:
                continue
            obs[(loc[2], key)].append((loc[0], loc[1], float(price) / rate))
            n_rows += 1
    per_shop, by_cc = defaultdict(list), defaultdict(int)
    for (cc, _key), pts in obs.items():
        if len(pts) < MIN_PRODUCT_OBS or len({(p[0], p[1]) for p in pts}) < 2:
            continue
        med = statistics.median(p[2] for p in pts)
        for lat, lon, eur in pts:
            ratio = eur / med
            if 1 / MAX_RATIO <= ratio <= MAX_RATIO:
                per_shop[(round(lat, 4), round(lon, 4), cc)].append(ratio)
                by_cc[cc] += 1
    # One row per shop: its median ratio and how many matched prices it rests on.
    rows = [[lat, lon, cc, round(statistics.median(v), 4), len(v)]
            for (lat, lon, cc), v in per_shop.items()]
    country = {cc: {"n": n} for cc, n in by_cc.items()}
    print(f"  receipts: {n_rows} usable prices in the last {RECEIPT_MONTHS} months, "
          f"{sum(by_cc.values())} matched prices in {len(rows)} shops, {len(country)} countries")
    return {"index": rows, "country": country,
            "dump": dt.datetime.fromtimestamp(price_path.stat().st_mtime).date().isoformat(),
            "window_months": RECEIPT_MONTHS}


def cross_country_index(refresh, fx_now):
    """Country shelf price index from barcodes sold in at least three countries.

    Used only to validate the Eurostat food price level (it is too thin to set
    prices with): for each barcode the European median is 1.0, and a country's
    index is the median of its prices against those medians."""
    loc_path = DUMP_DIR / "locations.jsonl.gz"
    price_path = DUMP_DIR / "prices.jsonl.gz"
    locs = {}
    with gzip.open(loc_path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            cc = (r.get("osm_address_country_code") or "").upper()
            if cc:
                locs[r["id"]] = cc
    since = (dt.date.today() - dt.timedelta(days=RECEIPT_MONTHS * 30.5)).isoformat()
    per = defaultdict(lambda: defaultdict(list))     # code -> cc -> [eur]
    with gzip.open(price_path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if r.get("type") != "PRODUCT" or (r.get("date") or "") < since:
                continue
            cc = locs.get(r.get("location_id"))
            price = r.get("price_without_discount") if r.get("price_is_discounted") else r.get("price")
            cur = r.get("currency") or "EUR"
            rate = 1.0 if cur == "EUR" else fx_now.get(cur)
            if not cc or not price or rate is None or float(price) <= 0:
                continue
            per[r["product_code"]][cc].append(float(price) / rate)
    ratios = defaultdict(list)
    for code, by in per.items():
        if len(by) < 3:
            continue
        meds = {cc: statistics.median(v) for cc, v in by.items()}
        eu = statistics.median(meds.values())
        for cc, m in meds.items():
            ratios[cc].append(m / eu)
    return {cc: {"index": round(statistics.median(v), 3), "n": len(v)}
            for cc, v in ratios.items() if len(v) >= 15}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-fetch everything")
    args = ap.parse_args()
    t0 = time.time()
    if OUT.exists() and not args.refresh:
        age = (time.time() - OUT.stat().st_mtime) / 86400
        if age < STALE_DAYS:
            print(f"food price inputs are {age:.0f} days old (< {STALE_DAYS}); "
                  "nothing to fetch (pass --refresh to force)")
            return
    print("Harvesting food and drink price inputs:")
    out = {"harvested": dt.date.today().isoformat()}
    out["pli"] = fetch_pli()
    out["hicp"] = fetch_hicp()
    out["fx"] = fetch_fx()
    out["gdp"] = fetch_gdp()
    fx_now = latest_fx(out["fx"])
    out["receipts"] = harvest_receipts(args.refresh, fx_now)
    for cc, v in cross_country_index(False, fx_now).items():
        out["receipts"]["country"].setdefault(cc, {}).update(
            {"shelf_index": v["index"], "shelf_n": v["n"]})
    CACHE.mkdir(exist_ok=True)
    atomic_write_json(OUT, out, indent=None, separators=(",", ":"))
    kb = OUT.stat().st_size / 1024
    print(f"  wrote cache/{OUT.name} ({kb:.0f} KB) in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
