"""Car layer (schema v8) - shared by gen_mock_data.py (mock) and

Tier: Library

apply_car_layer.py (real app_data).

Two independent things live here:

1. meta.car_model  - the parameters the React runtime uses to price *driving to
   the destination* (fuel + tolls) so the app can compare car vs plane. Fuel is
   computed at runtime from home->dest coordinates; this module only supplies the
   constants (consumption, per-country petrol price, detour factor, toll rate,
   car capacity, drive-distance cap, and per-country rental day-rates).

2. dest.local_transport - per destination, whether a rental car is *needed at the
   destination* (is everything close / is transit good), a short reason, a transit
   quality grade, and the economy rental day-rate for that country. This is a
   category-based estimate (no per-city transit dataset exists for 450 places),
   with a curated override list for well-known exceptions.

Provenance (researched June 2026; fact-checked + corrected 2026-06-07):
  - Petrol EUR/L  : EU-27 taken EUR-native from the EC Weekly Oil Bulletin
    (01-Jun-2026, via mappr.co) - no FX needed. Non-EU (GB/CH/NO/IS/TR + Balkans)
    from globalpetrolprices.com (01-Jun-2026, USD) x 0.862 USD->EUR.
    EU-27 average petrol ~EUR 1.81/L.
  - Rental EUR/day: tripbudgetcalculator.com + Rick Steves (2026), economy/
    compact midpoints x 0.862 USD->EUR.
  - FX            : EUR/USD ~ 1.16 on 01-Jun-2026 (tradingeconomics), i.e.
    1 USD = ~0.862 EUR. (An earlier 0.92 factor inflated every figure ~7%; the
    worst cases NL/PL/CZ were +11-14% vs the official EC Oil Bulletin.)
  - Consumption   : ODYSSEE-MURE - new EU thermal cars ~5.6 L/100km; we use 6.5
    as a real-world mixed-driving figure for a compact with luggage.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pricing_config import int_keys, rule  # noqa: E402

# T693: every number here comes from continent-app/config/pricing.json
# (car.model, car.fuel_by_country, car.rental_by_country), the file the app reads.
_CAR = rule("car.model")

# ---------------------------------------------------------------------------
# Fuel: petrol price EUR/L by destination country (ISO2). Fallback = EU avg.
# EU-27: EC Weekly Oil Bulletin 01-Jun-2026 (EUR-native). Non-EU: globalpetrol
# prices.com 01-Jun-2026 USD x 0.862.
# ---------------------------------------------------------------------------
FUEL_EUR_PER_L = rule("car.fuel_by_country")
FUEL_EUR_PER_L_DEFAULT = _CAR["fuel_price_eur_per_l"]  # EU-27 average petrol

# ---------------------------------------------------------------------------
# Rental: economy/compact EUR per day by country (ISO2). Fallback = EU avg.
# (tripbudgetcalculator.com / Rick Steves 2026 midpoints x 0.862)
# ---------------------------------------------------------------------------
RENTAL_EUR_PER_DAY = rule("car.rental_by_country")
RENTAL_EUR_PER_DAY_DEFAULT = _CAR["rental_eur_per_day_default"]

# ---------------------------------------------------------------------------
# Rental seasonality: the day-rates above are annual midpoints, but this app
# prices summer trips (flights are harvested Jun-Sep; accommodation already
# applies its own summer uplift). Car-rental rates swing the same way - peak
# (Jul/Aug) sits near the TOP of each annual range, low season near the bottom.
# Applied multiplicatively to the day-rate by the depart month. A gentler curve
# than accommodation's (peak x1.25 vs x1.35): the documented ranges already
# embed part of the seasonal spread, so x1.25 lands Jul/Aug near each range's
# top (e.g. ES EUR 30 x 1.25 = 37.5 ~ range top 38.8; IS EUR 82 x 1.25 = 102.5
# vs real Aug ~108). Source: rentcarla.com seasonal-pricing study + Blue Car
# Rental Iceland 2026 (peak ~+60% vs low season).
# ---------------------------------------------------------------------------
RENTAL_SEASONALITY = int_keys(_CAR["rental_seasonality"])

CAR_MODEL = {
    "consumption_l_per_100km": _CAR["consumption_l_per_100km"],  # compact car, mixed driving, with luggage
    "fuel_price_eur_per_l": FUEL_EUR_PER_L_DEFAULT,
    "fuel_price_by_iso2": FUEL_EUR_PER_L,
    "road_detour_factor": _CAR["road_detour_factor"],  # road km / straight-line km (typical)
    "toll_eur_per_100km": _CAR["toll_eur_per_100km"],  # motorway toll / vignette allowance
    "avg_speed_kmh": _CAR["avg_speed_kmh"],  # for the drive-time estimate
    "car_capacity": _CAR["car_capacity"],  # seats used per car (fuel & rental split)
    "max_drive_km": _CAR["max_drive_km"],  # offer the car option to any road-connected European destination
    "rental_eur_per_day_by_iso2": RENTAL_EUR_PER_DAY,
    "rental_eur_per_day_default": RENTAL_EUR_PER_DAY_DEFAULT,
    "rental_weekly_discount_pct": _CAR["rental_weekly_discount_pct"],  # rentals of 7+ days
    "rental_seasonality": RENTAL_SEASONALITY,  # multiplier on the day-rate by depart month
    "notes": ("Fuel computed at runtime from home->dest haversine x detour. "
              "Petrol EUR/L: EU-27 from EC Oil Bulletin (Jun 2026, EUR), non-EU "
              "from globalpetrolprices.com x 0.862; rental EUR/day from "
              "tripbudgetcalculator.com (2026) x 0.862 (annual midpoints; a "
              "depart-month seasonality x0.85-1.25 is applied at runtime so "
              "summer trips price near each range's top). Estimates."),
}

# Countries/areas not reachable from Brussels by road without a ferry/long sea
# crossing - the car option is hidden for these regardless of distance.
NON_ROAD_ISO2 = {"GB", "IE", "IS", "MT", "CY"}

# ---------------------------------------------------------------------------
# "Is a car needed at the destination?" - category-based estimate.
# ---------------------------------------------------------------------------
# Strong rural / dispersed signals -> a car is genuinely useful/needed.
RURAL_STRONG = {
    "national-park", "hiking", "wilderness", "mountains", "alps", "carpathians",
    "fjord", "lake", "valley", "remote", "countryside", "country", "village",
    "wachau", "salzkammergut", "provence", "tuscany", "puglia", "lavender",
    "vineyards", "wine", "sailing", "diving", "surf", "arctic", "skiing",
    "summer-only", "adventure", "fall-foliage", "brittany", "normandy",
    "cornwall", "andalusia", "cote-azur",
}
# Resort/coast signals -> car helpful when it is not a proper city.
COAST_SIGNAL = {"beach", "coast"}
# Signals that the place is walkable + rail-served on its own.
WALKABLE_SIGNAL = {
    "city", "town", "medieval", "baroque", "renaissance", "gothic", "historic",
    "university", "art", "nightlife", "modern", "party", "music", "spa",
    "thermal", "unesco",
}

# Curated overrides keyed by city name. (car_needed, transit_quality, reason)
CAR_OVERRIDES = {
    # No-car / pedestrian or world-class transit
    "Venice": (False, "excellent", "Car-free old town; move by vaporetto and on foot."),
    "Amsterdam": (False, "excellent", "Dense, bike/tram/metro city - a car is a liability."),
    "Copenhagen": (False, "excellent", "Metro, S-trains and bikes cover everything."),
    "Paris": (False, "excellent", "World-class metro and RER; driving/parking is painful."),
    "London": (False, "excellent", "Tube, buses and rail blanket the city."),
    "Vienna": (False, "excellent", "U-Bahn and trams reach every district."),
    "Berlin": (False, "excellent", "U-/S-Bahn and trams everywhere."),
    "Prague": (False, "excellent", "Metro and trams; historic core is pedestrian."),
    "Bruges": (False, "good", "Compact UNESCO core; walk it, train in from Brussels."),
    "Brussels": (False, "excellent", "Metro, trams and trains across the city."),
    # Famously car-free or rail-first - a rental is the wrong call here.
    "Zermatt": (False, "good", "Car-free Alpine village - park in Tasch and take the train; cogwheel railways and lifts do the rest."),
    "Cinque Terre": (False, "good", "Don't bring a car - the five villages are car-restricted and linked by frequent local trains."),
    "Lauterbrunnen": (False, "good", "Jungfrau valley railways and cable cars reach every village (Wengen and Murren are car-free)."),
    "Grindelwald": (False, "good", "Reached and explored by mountain railway and cable car; a car just sits in the garage."),
    "Interlaken": (False, "good", "Rail hub between the lakes; trains and cable cars cover the whole Jungfrau region."),
    "Lucerne": (False, "excellent", "Walkable lakefront city with trains and lake steamers."),
    "Montreux": (False, "good", "On the lakeshore rail line; promenade and GoldenPass train - no car needed."),
    "St. Moritz": (False, "good", "Reached by the Glacier and Bernina Express; a walkable resort with local buses."),
    "Monaco": (False, "excellent", "Tiny and dense, with public lifts, buses and a train station - never rent a car here."),
    "Giethoorn": (False, "good", "Car-free canal village - explore on foot or by boat; park at the edge."),
    "Jurmala": (False, "good", "A short commuter train from Riga runs right along the beach."),
    "Jūrmala": (False, "good", "A short commuter train from Riga runs right along the beach."),
    "Aran Islands (Inishmore)": (False, "limited", "Arrive by ferry; explore by bike, pony-trap or on foot - there are no rental cars."),
    "St Ives": (False, "good", "Take the branch-line train from St Erth; the town is walkable and parking is the real headache."),
    "Kinderdijk": (False, "good", "Day-trip from Rotterdam by water-bus or bus; walk or cycle the dyke."),
    "Zaanse Schans": (False, "good", "Easy train and short walk from Amsterdam; the windmill site is pedestrian."),
    # Car strongly recommended despite being 'known'
    "Santorini": (True, "limited", "Cliff villages are spread out; buses are infrequent in season."),
    "Palma de Mallorca": (True, "limited", "Island beaches and coves need wheels beyond the city."),
    "Tenerife": (True, "limited", "Volcano, north and south coasts are far apart."),
    "Gran Canaria": (True, "limited", "Dunes, mountains and beaches are dispersed."),
    "Funchal": (True, "limited", "Madeira's miradouros and north coast need a car."),
    "Dubrovnik": (False, "good", "Walled old town is pedestrian; day-trips by bus/boat."),
}

# Some destinations carry airport-qualified names in the dataset (e.g. "Paris
# (CDG)", "Tenerife South"). Alias those to the canonical override so the tailored
# advisory text fires for them too. (car_needed itself is already correct via the
# category heuristic - this only upgrades the reason string.)
for _base, _aliases in {
    "Venice":   ["Venice (Marco Polo)", "Venice (Treviso)"],
    "Paris":    ["Paris (CDG)", "Paris (Orly)", "Paris (Beauvais)"],
    "London":   ["London (Stansted)", "London (Luton)", "London (Gatwick)", "London (Heathrow)"],
    "Tenerife": ["Tenerife South", "Tenerife North"],
    "Funchal":  ["Funchal (Madeira)"],
}.items():
    for _alias in _aliases:
        CAR_OVERRIDES[_alias] = CAR_OVERRIDES[_base]

# These reason strings are APPENDED to the transit verdict the app already
# prints ("Poor public transport.", "Excellent public transport."), so they
# must not restate it. They used to: the rural line rendered as "Poor public
# transport. Sights are spread out with limited public transport - rent a
# car." - the same fact twice, with a hyphen standing in for a dash. Each one
# now adds only what the verdict does not carry.
CITY_NO_CAR = "Compact enough to cross on foot. Skip the car."
TOWN_NO_CAR = "Walkable centre with rail links. A car is not needed."
ISLAND_CAR = "Island with dispersed villages and beaches; buses are sparse."
RURAL_CAR = "Sights are spread out. A car saves a lot of time."
COAST_CAR = "Beaches and coves are spread out; a car helps a lot."


def car_needed_for(city, iso2, tier, categories):
    """Return (car_needed: bool, transit_quality: str, reason: str)."""
    if city in CAR_OVERRIDES:
        return CAR_OVERRIDES[city]
    cats = set(categories or [])

    # Anything tagged a city -> walkable + transit/rail served, no car. (Gem-tier
    # cities like Granada or Avignon also count, not just major-airport metros -
    # otherwise a regional tag such as 'andalusia'/'provence' wrongly flags them.)
    if "city" in cats:
        return (False, "excellent" if tier == "airport" else "good", CITY_NO_CAR)

    if "island" in cats:
        return (True, "limited", ISLAND_CAR)

    if cats & RURAL_STRONG:
        return (True, "poor", RURAL_CAR)

    # Coast/beach that is not a real city -> resort sprawl, car helps.
    if (cats & COAST_SIGNAL) and "city" not in cats:
        return (True, "limited", COAST_CAR)

    # Walkable historic town / small city gem (e.g. Bruges-like).
    if cats & WALKABLE_SIGNAL:
        return (False, "good", TOWN_NO_CAR)

    # Unknown / untagged -> default to no car but only "limited" confidence.
    return (False, "limited", TOWN_NO_CAR)


# T642-k: places whose category says "car" only because the surroundings are
# rural. With rail or ferry service on the doorstep the car is optional there.
# Genuinely remote categories stay car-needed whatever lines exist.
REMOTE_STRONG = {
    "remote", "wilderness", "national-park", "fjord", "arctic", "adventure",
    "hiking", "carpathians", "surf", "diving",
}
# What a car is still useful for when it is not needed (the "car useful for" note).
USEFUL_FOR = (
    ({"mountains", "alps", "valley", "hiking", "national-park", "carpathians", "skiing"},
     "Remote valleys and trailheads that no line reaches."),
    ({"lake", "fjord"}, "Villages round the lake that lines skip, and viewpoints above it."),
    ({"countryside", "country", "village", "wine", "vineyards", "provence", "tuscany",
      "puglia", "wachau", "salzkammergut", "andalusia", "normandy", "brittany", "cornwall"},
     "Villages and vineyards off the main line."),
)
# T650: the same groups as codes, in USEFUL_FOR order, for dest.local_transport.mobility.car_useful_for.
USEFUL_FOR_CODES = ("trailheads", "lake_villages", "countryside")
CAR_FREE_RANK = {"hard": 0, "ok": 1, "good": 2}
MOBILITY_MODE_ORDER = ("train", "bus", "ferry")
PARKING_HARD_MAX_SPOTS = 2  # fewer public lots than this within 1.5 km of the centre


def _lines(transit, key):
    v = (transit or {}).get(key)
    return [x for x in v if isinstance(x, dict) or x] if isinstance(v, list) else []


def transit_service(transit):
    """('none'|'thin'|'served', modes) from practical.transit.train/bus/ferry lists."""
    if not transit:
        return None, []
    modes = [m for m in ("train", "ferry", "bus") if _lines(transit, m)]
    rail_or_ferry = [m for m in modes if m in ("train", "ferry")]
    if rail_or_ferry and ("bus" in modes or len(rail_or_ferry) == 2 or len(_lines(transit, rail_or_ferry[0])) >= 2):
        return "served", modes
    if modes:
        return "thin", modes
    return "none", modes


def car_useful_for(categories):
    cats = set(categories or [])
    for keys, text in USEFUL_FOR:
        if cats & keys:
            return text
    return None


def car_useful_codes(categories):
    """Every USEFUL_FOR group the categories match, as codes, in USEFUL_FOR order."""
    cats = set(categories or [])
    return [code for (keys, _t), code in zip(USEFUL_FOR, USEFUL_FOR_CODES) if cats & keys]


def _line_sources(transit, modes):
    """Short names of who runs the lines the mobility value rests on."""
    names = []
    for m in modes:
        for leg in _lines(transit, m):
            n = (leg.get("operator") or "").strip() if isinstance(leg, dict) else ""
            if not n and isinstance(leg, dict):
                n = "OSM ferries" if m == "ferry" else (leg.get("source") or "").split(",")[0].split(" (")[0].strip()
            if n and n not in names:
                names.append(n)
    return ", ".join(names[:3])


def mobility_for(city, categories, needed, quality, transit=None, parking=None):
    """dest.local_transport.mobility (T650). car_needed stays; this is the car-free grade.

    good: rail or ferry plus a second mode (T642 'served'); ok: one mode ('thin');
    hard: a remote category, an island without a ferry line, or a place the
    category rule says needs a car and no line contradicts. With no practical.transit
    the value comes from the category rule alone (basis 'category'): a compact
    'city' or an excellent transit_quality is good, any other place the rule
    does not send to a car is ok, a place it sends to a car is hard. No line is
    ever invented, so modes is [] on that basis.
    """
    cats = set(categories or [])
    curated = city in CAR_OVERRIDES
    level, found = transit_service(transit)
    modes = [m for m in MOBILITY_MODE_ORDER if m in found]
    if not needed:
        cv = "good" if (quality == "excellent" or "city" in cats) else "ok"
    else:
        cv = "hard"
    lv = {"served": "good", "thin": "ok"}.get(level)
    if lv and (cv == "hard" or CAR_FREE_RANK[lv] >= CAR_FREE_RANK[cv] or not curated):
        value, basis = lv, "transit_lines"
    else:
        value, basis = cv, "category"
    if not curated:
        if cats & REMOTE_STRONG and "city" not in cats:   # a city on a fjord (Bergen) is not remote
            value = "hard"
        elif "island" in cats and "ferry" not in modes:
            value = "hard"
    out = {
        "car_free": value,
        "modes": modes if basis == "transit_lines" else [],
        "basis": basis,
        "source": ("practical.transit (" + (_line_sources(transit, modes) or "lines") + ") + categories")
        if basis == "transit_lines" else "categories (no transit lines for this place)",
    }
    codes = car_useful_codes(categories)
    if codes:
        out["car_useful_for"] = codes
    ph = parking_is_hard(parking)
    if ph is not None:
        out["parking_hard"] = ph
    return out


def parking_is_hard(spots):
    """True when the centre has almost no public parking, None with no harvest."""
    if spots is None:
        return None
    public = [s for s in spots if not s.get("pr")]
    return len(public) < PARKING_HARD_MAX_SPOTS


def local_transport_for(city, iso2, tier, categories, transit=None, parking=None):
    """Build the dest.local_transport block.

    transit: optional {train: [...], bus: [...], ferry: [...]} (practical.transit,
    T641). parking: optional list of raw OSM spots for the destination
    (cache/parking_osm.json). Both absent: the category rule, as before.
    """
    needed, quality, reason = car_needed_for(city, iso2, tier, categories)
    cats = set(categories or [])
    basis = "category"
    level, modes = transit_service(transit)
    # The RURAL_STRONG branch (lake, alps, village ...) put every such place at
    # "car needed" without looking at lines. With rail or ferry plus a second
    # mode, and nothing remote about it, the car becomes optional.
    if (city not in CAR_OVERRIDES and needed and quality == "poor"
            and cats & RURAL_STRONG and not cats & REMOTE_STRONG and "island" not in cats):
        if level == "served":
            needed, quality = False, ("good" if "train" in modes else "limited")
            reason = "Reached by " + " and ".join(m for m in modes if m != "bus" or len(modes) == 1) + "; a car is optional."
            basis = "transit_lines"
        elif level == "none":
            basis = "transit_lines"
    out = {
        "car_needed": needed,
        "transit_quality": quality,
        "reason": reason,
        "rental_eur_per_day": RENTAL_EUR_PER_DAY.get(iso2, RENTAL_EUR_PER_DAY_DEFAULT),
        "road_connected": iso2 not in NON_ROAD_ISO2 and "island" not in cats,
        "car_basis": basis,
    }
    useful = car_useful_for(categories)
    if useful:
        out["car_useful_for"] = useful
    ph = parking_is_hard(parking)
    if ph is not None:
        out["parking_hard"] = ph
    out["mobility"] = mobility_for(city, categories, needed, quality, transit, parking)
    return out
