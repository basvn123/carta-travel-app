"""Price food and drink for every destination (T513, food price model v2).

Tier: Scheduled (run_pipeline task food, monthly, after harvest_food_prices.py)

Until now every place carried one of 90 baskets: a national average (3,487
places) or a city basket copied onto towns up to 40 km away (381 places), all
captured once in June 2026. This writes a basket per place, rolled forward to
the latest month, in the same eight keys every reader already uses:

  "costs": {
    "meal_mid_eur": 31.4, "meal_cheap_eur": 15.9, "fastfood_eur": 10.2,
    "drink_out_eur": 4.1, "cocktail_eur": 10.9, "coffee_eur": 2.95,
    "grocery_day_eur": 12.6, "club_entry_eur": 11.2,
    "level": "region",                 # city | region | country
    "price_source": "carta_food_v2",
    "drivers": {"inc": 1.03, "tour": 1.04, "size": 1.03, "rcpt": 0.99},
    "n_rcpt": 312,                     # matched shop prices within 15 km
    "city": "Porto"                    # level city only: whose basket
  }

Per-place blocks stay small (they ride in the first-paint rank file): the
month and each country's anchor kind live once in meta.food_model.asof and
meta.food_country[cc].anchor; a driver equal to 1 is left out.

price = country base x local tilt.

COUNTRY BASE (per item, per month)
  anchor    measured: the June 2026 country basket (cache/costs.json, 24
            countries); modelled: Europe reference x Eurostat price level of
            the item's category; city-anchored: modelled, blended (geometric
            mean) with what the country's measured cities imply once their own
            local tilt is divided out; legacy: the June basket where Eurostat
            has no price level (microstates, Moldova).
  roll      x local-currency price index of the category (HICP, ECOICOP 2) from
            the anchor's period to the latest month, through the monthly
            exchange rate, so a moving currency moves the euro price.
  The Europe reference is calibrated from the measured countries: the median
  of anchor / (price level / 100), both brought to the price level's year.

LOCAL TILT (capped per factor, product capped to [0.80, 1.60])
  inc   (NUTS3 income per head / country income per head) ^ e, ratio clipped
        to [0.6, 2.0]; e = 0.15 eating out, 0.08 chains, 0.05 groceries
  tour  hand-set tourist premium (apply_tourist_premium.PREMIUM_TIERS) where
        set; else +8% eating out in the top 5% of NUTS3 regions by tourist
        nights per km2 and +4% in the top 15%
  size  eating out +6% at >= 1M people, +3% at >= 300k, -4% under 5k;
        groceries +3% under 5k (no discounter)
  rcpt  groceries only: weighted median of the Open Prices matched-product
        index within 15 km, shrunk toward 1 by n / (n + 80), needs n >= 40
A place within 15 km of one of the 22 measured cities takes that city's
basket, rolled forward, and no tilt (level city).

Idempotent: everything is computed from the caches, never from the values a
previous run wrote. The first real run keeps the blocks it replaces in
cache/food_prices_pre_v2.<folder>_<target>.json, and --restore puts them back exactly.

Usage:
    python pipeline/apply_food_prices.py                 # default targets
    python pipeline/apply_food_prices.py path/to.json    # explicit target(s)
    python pipeline/apply_food_prices.py --report        # print checks, write nothing
    python pipeline/apply_food_prices.py --restore       # back to the June 2026 baskets
"""

import argparse
import json
import math
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json  # noqa: E402
from pricing_config import rule  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
INPUTS = ROOT / "cache" / "food_price_inputs.json"
BASKETS = ROOT / "cache" / "costs.json"
NUTS_GEO = ROOT / "cache" / "nuts3_2021.geojson"
NIGHTS = ROOT / "cache" / "eurostat_nights_nuts3.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

VERSION = "carta_food_v2"
# The publish gate (T645): a country's median basket (the eight items summed)
# may move at most FOOD_JUMP against what the target holds now, unless the move
# is listed in pipeline/stays/gate_explain.json as {"key": "food:CC", "new": ...}.
# Moves to config/pricing.json in F3.
FOOD_JUMP = rule("gate.food")["jump"]            # T693: config/pricing.json gate.food
FOOD_TOLERANCE = rule("gate.food")["tolerance"]
EXPLAIN = ROOT / "pipeline" / "stays" / "gate_explain.json"
ITEMS = ("meal_mid_eur", "meal_cheap_eur", "fastfood_eur", "drink_out_eur",
         "cocktail_eur", "coffee_eur", "grocery_day_eur", "club_entry_eur")
# Which group each item tilts with, and which Eurostat category prices it.
GROUP = {"meal_mid_eur": "eat", "meal_cheap_eur": "eat", "fastfood_eur": "chain",
         "drink_out_eur": "eat", "cocktail_eur": "eat", "coffee_eur": "eat",
         "grocery_day_eur": "shop", "club_entry_eur": "eat"}
PLI_CAT = {g: ("A010101" if g == "shop" else "A0111") for g in ("eat", "chain", "shop")}
# Spirits follow alcohol duty as much as bar wages: the cocktail's price level is
# the geometric mean of the restaurant and alcoholic beverage levels. Measured
# against the 24 countries this cut the cocktail error from 17.8% to 15.8%; on
# draught beer it made things worse (25.5% to 29.1%), so beer stays restaurant.
ITEM_PLI = {"cocktail_eur": ("A0111", "A010201")}
HICP_CAT = {g: ("CP011" if g == "shop" else "CP111") for g in ("eat", "chain", "shop")}
MEASURED_MONTH = "2026-06"       # when cache/costs.json was captured

# Three more measured cities, from pipeline/oneoff/fix_data.py (live Numbeo,
# June 2026). That script wrote them onto the whole of Austria, Croatia and
# Czechia; here they are what they are, city prices. Dining and drinks only:
# groceries and club entry come from the country base.
CITY_FIXES = {
    "Vienna": ("AT", 37.50, 18.00, 12.00, 5.50, 4.68),
    "Split": ("HR", 33.10, 15.00, 10.00, 4.25, 2.45),
    "Prague": ("CZ", 24.20, 9.68, 8.88, 2.62, 3.28),
}

CURRENCY = {"GB": "GBP", "CH": "CHF", "LI": "CHF", "NO": "NOK", "SE": "SEK",
            "DK": "DKK", "FO": "DKK", "IS": "ISK", "PL": "PLN", "CZ": "CZK",
            "HU": "HUF", "RO": "RON", "RS": "RSD", "MK": "MKD", "AL": "ALL",
            "TR": "TRY", "MD": "MDL"}
# Price index stand-ins where Eurostat publishes none: microstates follow the
# country they trade with; the UK and Bosnia (no HICP since 2020 / ever)
# follow the euro area, which over a few months is close enough and is flagged.
HICP_PROXY = {"AD": "ES", "MC": "FR", "SM": "IT", "VA": "IT", "LI": "CH",
              "FO": "DK", "GB": "EA20", "BA": "EA20", "MD": "EA20"}
NUTS_CC = {"GR": "EL", "GB": "UK"}

# Swept 0 to 0.3 against the 17 measured city baskets (T513 report): mean error
# 8.5% at 0, 9.0% at 0.15, 9.6% at 0.25. Those are all big cities, where size
# and tourism already push, so the sweep cannot see the rural end where income
# matters most; 0.15 sits between the sweep and the regional price literature.
ELASTICITY = {"eat": 0.15, "chain": 0.08, "shop": 0.05}
INC_CLIP = (0.6, 2.0)
TOUR_DENSITY = {"eat": (1.04, 1.08), "chain": (1.02, 1.04), "shop": (1.01, 1.02)}
SIZE = {"eat": {"big": 1.06, "large": 1.03, "small": 0.96},
        "chain": {"big": 1.0, "large": 1.0, "small": 1.0},
        "shop": {"big": 1.0, "large": 1.0, "small": 1.03}}
TILT_CAP = (0.80, 1.60)
CITY_KM = 15.0
RCPT_KM = 15.0
RCPT_MIN = 40
RCPT_PRIOR = 80
RCPT_CLIP = (0.85, 1.20)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def city_coords(d):
    return (d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon")))


def clip(x, lo, hi):
    return max(lo, min(hi, x))


def weighted_median(pairs):
    """pairs = [(value, weight)]"""
    pairs = sorted(pairs)
    half = sum(w for _, w in pairs) / 2
    acc = 0
    for v, w in pairs:
        acc += w
        if acc >= half:
            return v
    return pairs[-1][0]


def round_price(item, eur):
    if item in ("meal_mid_eur", "meal_cheap_eur", "fastfood_eur", "grocery_day_eur",
                "club_entry_eur", "cocktail_eur"):
        return round(eur, 1)
    return round(eur, 2)


# --------------------------------------------------------------------------- #
# country base: anchor, Europe reference, roll forward
# --------------------------------------------------------------------------- #
class Roller:
    """Moves a euro price between periods through local inflation and FX."""

    def __init__(self, inputs):
        self.hicp = inputs["hicp"]
        self.fx = inputs["fx"]
        self.now = max(max(s) for s in self.hicp["CP111"].values() if s)
        self.flags = defaultdict(set)

    def _mean(self, series, period):
        if period is None or not series:
            return None
        if len(period) == 4:                       # a year: average its months
            vals = [v for m, v in series.items() if m.startswith(period)]
            return sum(vals) / len(vals) if vals else None
        return series.get(period)

    def _latest(self, series):
        return series[max(series)] if series else None

    def index(self, cc, cat, period):
        geo = cc if cc in self.hicp[cat] else HICP_PROXY.get(cc, "EA20")
        if geo != cc:
            self.flags[cc].add(f"hicp~{geo}")
        s = self.hicp[cat].get(geo, {})
        return self._mean(s, period), (self._latest(s) if period == "now" else None)

    def roll(self, eur, cc, group, frm, to="now"):
        cat = HICP_CAT[group]
        h_from, _ = self.index(cc, cat, frm)
        if to == "now":
            _, h_to = self.index(cc, cat, "now")
        else:
            h_to, _ = self.index(cc, cat, to)
        drift = (h_to / h_from) if (h_from and h_to) else 1.0
        if not (h_from and h_to):
            self.flags[cc].add(f"no-hicp-{frm}")
        cur = CURRENCY.get(cc)
        fx_from = fx_to = 1.0
        if cur:
            s = self.fx.get(cur, {})
            fx_from = self._mean(s, frm) or self._latest(s) or 1.0
            fx_to = (self._latest(s) if to == "now" else self._mean(s, to)) or fx_from
        return eur * fx_from * drift / fx_to


def build_country_bases(inputs, baskets, roller, city_implied=None):
    """Country basket per item at the latest month, plus validation numbers.

    city_implied {cc: {item: [eur]}}: what each measured city in a country
    without a measured national basket says the country base is (its price
    divided by its own local tilt). Blended with the model by geometric mean,
    so neither one city nor the price level alone sets a whole country."""
    city_implied = city_implied or {}
    pli = inputs["pli"]
    countries = baskets["countries"]
    measured = {cc: b for cc, b in countries.items() if b.get("source") == "numbeo_direct"}

    def pli_of(cc, group, item=None):
        cats = ITEM_PLI.get(item) or (PLI_CAT[group],)
        recs = [pli[c].get(cc) for c in cats]
        if not all(recs):
            return None, None
        lvl = math.prod(r["value"] / 100 for r in recs) ** (1 / len(recs))
        return lvl, str(recs[0]["year"])

    def ref_from(sample):
        ref = {}
        for item in ITEMS:
            g = GROUP[item]
            vals = []
            for cc, b in sample.items():
                lvl, yr = pli_of(cc, g, item)
                if lvl and b.get(item):
                    vals.append(roller.roll(b[item], cc, g, MEASURED_MONTH, yr) / lvl)
            ref[item] = statistics.median(vals)
        return ref

    ref = ref_from(measured)

    def modelled(cc, ref_):
        out = {}
        for item in ITEMS:
            g = GROUP[item]
            lvl, yr = pli_of(cc, g, item)
            if not lvl:
                return None
            out[item] = roller.roll(ref_[item] * lvl, cc, g, yr)
        return out

    # Leave one measured country out: how far is the model from what was
    # measured there (both at the June 2026 capture)?
    errs = defaultdict(list)
    for cc in measured:
        rest = {k: v for k, v in measured.items() if k != cc}
        ref_ = ref_from(rest)
        for item in ITEMS:
            g = GROUP[item]
            lvl, yr = pli_of(cc, g, item)
            if not lvl:
                continue
            model_june = roller.roll(ref_[item] * lvl, cc, g, yr, MEASURED_MONTH)
            errs[item].append(abs(model_june / measured[cc][item] - 1))
    loo = {item: round(100 * statistics.mean(v), 1) for item, v in errs.items() if v}

    bases, kinds = {}, {}
    for cc, b in countries.items():
        if cc in measured:
            bases[cc] = {i: roller.roll(b[i], cc, GROUP[i], MEASURED_MONTH) for i in ITEMS}
            kinds[cc] = "measured"
            continue
        m = modelled(cc, ref)
        if m and city_implied.get(cc):
            for item, vals in city_implied[cc].items():
                m[item] = math.sqrt(m[item] * statistics.median(vals))
            bases[cc], kinds[cc] = m, "city-anchored"
        elif m:
            bases[cc], kinds[cc] = m, "modelled"
        else:
            bases[cc] = {i: roller.roll(b[i], cc, GROUP[i], MEASURED_MONTH) for i in ITEMS}
            kinds[cc] = "legacy"
    return bases, kinds, ref, loo


# --------------------------------------------------------------------------- #
# local tilt
# --------------------------------------------------------------------------- #
class Regions:
    """NUTS3 lookup with income ratio and tourism density per region."""

    def __init__(self, inputs):
        from shapely.geometry import shape, Point
        from shapely.strtree import STRtree
        from harvest_tourism_density import polygon_area_km2
        self.Point = Point
        geo = json.loads(NUTS_GEO.read_text(encoding="utf-8"))
        nights = json.loads(NIGHTS.read_text(encoding="utf-8")) if NIGHTS.exists() else {}
        self.codes, geoms, dens = [], [], {}
        for f in geo["features"]:
            code = f["properties"].get("NUTS_ID") or f["properties"].get("id")
            self.codes.append(code)
            geoms.append(shape(f["geometry"]))
            rec = nights.get(code)
            if rec:
                area = polygon_area_km2(f["geometry"])
                if area > 0:
                    dens[code] = rec["nights"] / area
        self.geoms = geoms
        self.tree = STRtree(geoms)
        ranked = sorted(dens.values())
        self.cut15 = ranked[int(len(ranked) * 0.85)] if ranked else float("inf")
        self.cut5 = ranked[int(len(ranked) * 0.95)] if ranked else float("inf")
        self.density = dens
        self.gdp = {k: v["value"] for k, v in inputs["gdp"].items()}

    def locate(self, lat, lon):
        pt = self.Point(lon, lat)
        for i in self.tree.query(pt):
            if self.geoms[int(i)].contains(pt):
                return self.codes[int(i)]
        j = int(self.tree.nearest(pt))
        if self.geoms[j].distance(pt) < 0.07:        # coastal point, ~8 km
            return self.codes[j]
        return None

    def income_ratio(self, code):
        if not code:
            return None
        country = self.gdp.get(code[:2])
        for c in (code, code[:4], code[:3]):         # NUTS 2024 renames: walk up
            if c in self.gdp and country:
                return self.gdp[c] / country
        return None

    def tourism_rank(self, code):
        d = self.density.get(code)
        if d is None:
            return None
        return "top5" if d >= self.cut5 else "top15" if d >= self.cut15 else None


class Receipts:
    def __init__(self, rows):
        self.grid = defaultdict(list)
        for r in rows:
            self.grid[(int(r[0] * 4), int(r[1] * 4))].append(r)

    def near(self, lat, lon, cc, km):
        out = []
        gy, gx = int(lat * 4), int(lon * 4)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for r in self.grid.get((gy + dy, gx + dx), ()):
                    if r[2] == cc and haversine_km(lat, lon, r[0], r[1]) <= km:
                        out.append(r)
        return out


def tilt_for(d, regions, receipts, premium):
    """Per-group multipliers and the drivers behind them."""
    from apply_tourist_premium import MULTIPLIERS, PREMIUM_TIERS
    lat, lon = city_coords(d)
    cc = d.get("iso2")
    code = regions.locate(lat, lon) if lat is not None else None
    drivers, groups = {}, {}

    ratio = regions.income_ratio(code)
    tier = PREMIUM_TIERS.get(d["id"]) if premium else None
    rank = regions.tourism_rank(code)
    pop = (d.get("geonames") or {}).get("population")
    size = None
    if pop:
        size = "big" if pop >= 1_000_000 else "large" if pop >= 300_000 else "small" if pop < 5_000 else None

    rc = receipts.near(lat, lon, cc, RCPT_KM) if lat is not None else []
    n_rcpt = sum(r[4] for r in rc)
    rcpt = None
    if n_rcpt >= RCPT_MIN:
        wm = weighted_median([(r[3], r[4]) for r in rc])
        rcpt = clip(1 + (wm - 1) * n_rcpt / (n_rcpt + RCPT_PRIOR), *RCPT_CLIP)

    for g in ("eat", "chain", "shop"):
        inc = clip(ratio, *INC_CLIP) ** ELASTICITY[g] if ratio else 1.0
        if tier:
            dining, grocery, _club, _acc = MULTIPLIERS[tier]
            tour = {"eat": dining, "chain": dining ** 0.5, "shop": grocery}[g]
        elif rank:
            tour = TOUR_DENSITY[g][1 if rank == "top5" else 0]
        else:
            tour = 1.0
        sz = SIZE[g].get(size, 1.0) if size else 1.0
        rp = rcpt if (g == "shop" and rcpt) else 1.0
        groups[g] = clip(inc * tour * sz * rp, *TILT_CAP)
        if g == "eat":
            drivers.update({"inc": inc, "tour": tour, "size": sz})
        if g == "shop" and rcpt:
            drivers["rcpt"] = rp
    drivers = {k: round(v, 3) for k, v in drivers.items() if abs(v - 1) >= 0.005}
    return groups, drivers, code, n_rcpt


# --------------------------------------------------------------------------- #
# the run
# --------------------------------------------------------------------------- #
def measured_cities(baskets, dests):
    """The 22 measured city baskets with coordinates from the catalogue."""
    out = []
    fixes = {name: {"meal_mid_eur": v[1], "meal_cheap_eur": v[2], "fastfood_eur": v[3],
                    "drink_out_eur": v[4], "coffee_eur": v[5], "cocktail_eur": round(v[4] * 2.4, 2)}
             for name, v in CITY_FIXES.items()}
    for name, basket in {**baskets["cities"], **fixes}.items():
        hits = [d for d in dests.values() if (d.get("city") or "").lower() == name.lower()]
        hits.sort(key=lambda d: d.get("tier") != "airport")
        if hits:
            lat, lon = city_coords(hits[0])
            out.append({"name": name, "cc": hits[0]["iso2"], "lat": lat, "lon": lon,
                        "id": hits[0]["id"], "basket": basket,
                        "geonames": next((h.get("geonames") for h in hits if h.get("geonames")), None)})
    return out


def price_all(dests, inputs, baskets):
    roller = Roller(inputs)
    regions = Regions(inputs)
    receipts = Receipts(inputs["receipts"]["index"])
    cities = measured_cities(baskets, dests)
    asof = roller.now
    out, city_checks = {}, []
    measured_cc = {cc for cc, b in baskets["countries"].items() if b.get("source") == "numbeo_direct"}

    city_implied = defaultdict(lambda: defaultdict(list))
    for c in cities:
        probe = {"id": c["id"], "iso2": c["cc"], "lat": c["lat"], "lon": c["lon"],
                 "geonames": c["geonames"]}
        groups, _, _, _ = tilt_for(probe, regions, receipts, premium=True)
        if c["cc"] not in measured_cc:
            for i, v in c["basket"].items():
                if i in ITEMS:
                    city_implied[c["cc"]][i].append(
                        roller.roll(v, c["cc"], GROUP[i], MEASURED_MONTH) / groups[GROUP[i]])
            continue
        # how good is the tilt where we can see? (no curated premium: the
        # measured city/country ratio is what the tilt has to find on its own)
        plain, _, _, _ = tilt_for(probe, regions, receipts, premium=False)
        cbase = baskets["countries"][c["cc"]]
        seen = statistics.mean(c["basket"][i] / cbase[i] for i in
                               ("meal_mid_eur", "meal_cheap_eur", "coffee_eur", "drink_out_eur"))
        city_checks.append((c["name"], round(seen, 3), round(plain["eat"], 3)))

    bases, kinds, ref, loo = build_country_bases(inputs, baskets, roller, city_implied)

    for did, d in dests.items():
        cc = d.get("iso2")
        base = bases.get(cc)
        lat, lon = city_coords(d)
        city = None
        if lat is not None:
            near = [(haversine_km(lat, lon, c["lat"], c["lon"]), c) for c in cities if c["cc"] == cc]
            near = [x for x in near if x[0] <= CITY_KM]
            city = min(near, key=lambda x: x[0])[1] if near else None
        if city and base is not None:
            # the city's own prices; items it never measured come from its country
            groups, _, _, _ = tilt_for(d, regions, receipts, premium=True)
            block = {i: round_price(i, roller.roll(city["basket"][i], cc, GROUP[i], MEASURED_MONTH)
                                    if i in city["basket"] else base[i] * groups[GROUP[i]])
                     for i in ITEMS}
            block.update({"level": "city", "price_source": VERSION, "city": city["name"]})
            out[did] = block
            continue
        if base is None:
            continue                       # no country basket at all: leave as is
        groups, drivers, code, n_rcpt = tilt_for(d, regions, receipts, premium=True)
        block = {i: round_price(i, base[i] * groups[GROUP[i]]) for i in ITEMS}
        tilted = bool(drivers)
        block.update({"level": "region" if tilted else "country", "price_source": VERSION})
        if drivers:
            block["drivers"] = drivers
        if n_rcpt:
            block["n_rcpt"] = n_rcpt
        out[did] = block

    model = {
        "version": VERSION,
        "asof": asof,
        "harvested": inputs.get("harvested"),
        "items": list(ITEMS),
        "europe_reference_eur": {k: round(v, 2) for k, v in ref.items()},
        "anchors": {k: sorted(cc for cc, v in kinds.items() if v == k)
                    for k in ("measured", "city-anchored", "modelled", "legacy")},
        "measured_cities": sorted(c["name"] for c in cities),
        "elasticity": ELASTICITY,
        "tilt_cap": list(TILT_CAP),
        "validation": {"leave_one_country_out_mae_pct": loo,
                       "city_eat_tilt_measured_vs_model": city_checks},
        "sources": [
            "Eurostat prc_ppp_ind price level indices (EU27_2020 = 100)",
            "Eurostat prc_hicp_minr HICP ECOICOP 2, monthly",
            "Eurostat ert_bil_eur_m exchange rates, monthly",
            "Eurostat nama_10r_3gdp GDP per head in PPS, NUTS 3",
            "Eurostat tour_occ_nin3 nights in tourist accommodation, NUTS 3",
            "Open Food Facts Open Prices (ODbL), matched shop prices",
            "Country and city baskets captured June 2026 (cache/costs.json)",
        ],
        "flags": {cc: sorted(v) for cc, v in roller.flags.items()},
    }
    country = {cc: {i: round_price(i, b[i]) for i in ITEMS} | {"anchor": kinds[cc]}
               for cc, b in bases.items()}
    return out, model, country


def snapshot_path(target):
    # both default targets are called app_data.json: name the snapshot by folder too
    return ROOT / "cache" / f"food_prices_pre_v2.{target.parent.name}_{target.stem}.json"


def save_snapshot(target, dests):
    """Keep the blocks v2 replaces, once, so --restore is exact."""
    snap = snapshot_path(target)
    if snap.exists():
        return
    old = {did: d["costs"] for did, d in dests.items()
           if (d.get("costs") or {}).get("price_source") != VERSION}
    if old:
        atomic_write_json(snap, old, indent=None, separators=(",", ":"))
        print(f"  saved {len(old)} pre-v2 blocks to cache/{snap.name}")


def summarise(dests, out, model):
    from collections import Counter
    lv = Counter(b["level"] for b in out.values())
    distinct = len({tuple(b[i] for i in ITEMS) for b in out.values()})
    before = len({tuple((d.get("costs") or {}).get(i) for i in ITEMS) for d in dests.values()})
    print(f"  baskets: {before} distinct before, {distinct} after; levels {dict(lv)}")
    print(f"  prices as of {model['asof']}; anchors {[(k, len(v)) for k, v in model['anchors'].items()]}")
    print(f"  leave-one-country-out error (% per item): {model['validation']['leave_one_country_out_mae_pct']}")
    checks = model["validation"]["city_eat_tilt_measured_vs_model"]
    if checks:
        mae = statistics.mean(abs(m / s - 1) for _, s, m in checks)
        flat = statistics.mean(abs(1 / s - 1) for _, s, _ in checks)
        print(f"  measured cities: eating-out tilt error {100 * mae:.1f}% "
              f"(country average alone: {100 * flat:.1f}%) over {len(checks)} cities")
    rc = sum(1 for b in out.values() if (b.get("drivers") or {}).get("rcpt"))
    print(f"  shop receipts moved groceries at {rc} places")


def basket(block):
    vals = [(block or {}).get(i) for i in ITEMS]
    return sum(v for v in vals if v) if any(vals) else None


def food_gate(dests, out, explain=()):
    """Blocking lines: countries whose median basket moves more than FOOD_JUMP."""
    old_by, new_by = defaultdict(list), defaultdict(list)
    for did, block in out.items():
        d = dests.get(did) or {}
        cc, o, n = d.get("iso2"), basket(d.get("costs")), basket(block)
        if cc and o and n:
            old_by[cc].append(o)
            new_by[cc].append(n)
    fails = []
    for cc in sorted(old_by):
        o, n = statistics.median(old_by[cc]), statistics.median(new_by[cc])
        mv = n / o - 1
        ok = any(e.get("key") == f"food:{cc}" and abs((e.get("new") or 0) - n) <= FOOD_TOLERANCE * n
                 for e in explain)
        if abs(mv) > FOOD_JUMP and not ok:
            fails.append(f"food {cc}: basket {o:.1f} -> {n:.1f} ({mv:+.0%})")
    return fails


def patch(path, inputs, baskets, report_only=False):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    t0 = time.time()
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    out, model, country = price_all(dests, inputs, baskets)
    summarise(dests, out, model)
    explain = json.loads(EXPLAIN.read_text(encoding="utf-8")) if EXPLAIN.exists() else []
    fails = food_gate(dests, out, explain)
    for f in fails:
        print("  GATE:", f)
    if report_only:
        return
    if fails:
        raise SystemExit(f"food gate failed on {len(fails)} countries: {path.name} not written "
                         f"(explain a right move in {EXPLAIN.relative_to(ROOT)})")
    save_snapshot(path, dests)
    for did, block in out.items():
        dests[did]["costs"] = block
    meta = data.setdefault("meta", {})
    meta["food_model"] = model
    meta["food_country"] = country
    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    print(f"  {path.name}: food prices on {len(out)} of {len(dests)} destinations "
          f"in {time.time() - t0:.1f} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="print the checks, write nothing")
    ap.add_argument("--restore", action="store_true", help="put the June 2026 baskets back")
    ap.add_argument("targets", nargs="*")
    args = ap.parse_args()
    targets = [Path(t) for t in args.targets] or DEFAULT_TARGETS
    baskets = json.loads(BASKETS.read_text(encoding="utf-8"))
    if args.restore:
        for t in targets:
            snap = snapshot_path(t)
            if not t.exists() or not snap.exists():
                print(f"  skip {t.name}: no target or no snapshot at cache/{snap.name}")
                continue
            old = json.loads(snap.read_text(encoding="utf-8"))
            data = json.loads(t.read_text(encoding="utf-8"))
            n = 0
            for did, block in old.items():
                if did in data["destinations"]:
                    data["destinations"][did]["costs"] = block
                    n += 1
            data.get("meta", {}).pop("food_model", None)
            data.get("meta", {}).pop("food_country", None)
            atomic_write_json(t, data, indent=1, ensure_ascii=False)
            print(f"  {t.name}: restored {n} pre-v2 blocks from cache/{snap.name}")
        return
    if not INPUTS.exists():
        raise SystemExit("no cache/food_price_inputs.json: run harvest_food_prices.py first")
    inputs = json.loads(INPUTS.read_text(encoding="utf-8"))
    print(f"Applying food price model {VERSION}:")
    for t in targets:
        patch(t, inputs, baskets, report_only=args.report)


if __name__ == "__main__":
    main()
