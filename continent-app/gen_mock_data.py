"""Generate a flights-only mock app_data.json so the app is testable without
running the full Ryanair pipeline. Schema matches SCHEMA.md (v6)."""

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

# car_layer.py lives in the repo root (parent of continent-app/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import car_layer  # noqa: E402

random.seed(7)

# iata, city, country, iso2, lat, lon, base_fare (one-way EUR baseline)
DESTINATIONS = [
    ("LIS", "Lisbon", "Portugal", "PT", 38.7223, -9.1393, 65),
    ("OPO", "Porto", "Portugal", "PT", 41.1579, -8.6291, 55),
    ("MAD", "Madrid", "Spain", "ES", 40.4168, -3.7038, 70),
    ("BCN", "Barcelona", "Spain", "ES", 41.3851, 2.1734, 75),
    ("AGP", "Malaga", "Spain", "ES", 36.7213, -4.4214, 60),
    ("VLC", "Valencia", "Spain", "ES", 39.4699, -0.3763, 55),
    ("PMI", "Palma de Mallorca", "Spain", "ES", 39.5696, 2.6502, 70),
    ("ALC", "Alicante", "Spain", "ES", 38.3452, -0.4810, 50),
    ("FCO", "Rome", "Italy", "IT", 41.9028, 12.4964, 90),
    ("MXP", "Milan", "Italy", "IT", 45.4642, 9.1900, 95),
    ("VCE", "Venice", "Italy", "IT", 45.4408, 12.3155, 85),
    ("NAP", "Naples", "Italy", "IT", 40.8518, 14.2681, 80),
    ("CTA", "Catania", "Italy", "IT", 37.5079, 15.0830, 75),
    ("ATH", "Athens", "Greece", "GR", 37.9838, 23.7275, 110),
    ("JTR", "Santorini", "Greece", "GR", 36.4118, 25.4798, 145),
    ("HER", "Heraklion", "Greece", "GR", 35.3387, 25.1442, 130),
    ("BUD", "Budapest", "Hungary", "HU", 47.4979, 19.0402, 65),
    ("KRK", "Krakow", "Poland", "PL", 50.0647, 19.9450, 50),
    ("WAW", "Warsaw", "Poland", "PL", 52.2297, 21.0122, 60),
    ("PRG", "Prague", "Czechia", "CZ", 50.0755, 14.4378, 70),
    ("VIE", "Vienna", "Austria", "AT", 48.2082, 16.3738, 90),
    ("BER", "Berlin", "Germany", "DE", 52.5200, 13.4050, 95),
    ("CGN", "Cologne", "Germany", "DE", 50.9375, 6.9603, 75),
    ("CDG", "Paris", "France", "FR", 48.8566, 2.3522, 110),
    ("MRS", "Marseille", "France", "FR", 43.2965, 5.3698, 80),
    ("NCE", "Nice", "France", "FR", 43.7102, 7.2620, 95),
    ("DUB", "Dublin", "Ireland", "IE", 53.3498, -6.2603, 90),
    ("EDI", "Edinburgh", "United Kingdom", "GB", 55.9533, -3.1883, 100),
    ("STN", "London", "United Kingdom", "GB", 51.5074, -0.1278, 95),
    ("CPH", "Copenhagen", "Denmark", "DK", 55.6761, 12.5683, 110),
    ("ARN", "Stockholm", "Sweden", "SE", 59.3293, 18.0686, 105),
    ("HEL", "Helsinki", "Finland", "FI", 60.1699, 24.9384, 130),
    ("OSL", "Oslo", "Norway", "NO", 59.9139, 10.7522, 130),
    ("KEF", "Reykjavik", "Iceland", "IS", 64.1466, -21.9426, 240),
    ("RIX", "Riga", "Latvia", "LV", 56.9496, 24.1052, 95),
    ("VNO", "Vilnius", "Lithuania", "LT", 54.6872, 25.2797, 100),
    ("TLL", "Tallinn", "Estonia", "EE", 59.4370, 24.7536, 105),
    ("OTP", "Bucharest", "Romania", "RO", 44.4268, 26.1025, 70),
    ("SOF", "Sofia", "Bulgaria", "BG", 42.6977, 23.3219, 80),
    ("SPU", "Split", "Croatia", "HR", 43.5081, 16.4402, 110),
    ("DBV", "Dubrovnik", "Croatia", "HR", 42.6507, 18.0944, 130),
    ("TIA", "Tirana", "Albania", "AL", 41.3275, 19.8189, 95),
    ("FNC", "Funchal", "Portugal", "PT", 32.6669, -16.9241, 130),
    ("TFS", "Tenerife", "Spain", "ES", 28.0444, -16.5725, 150),
    ("LPA", "Gran Canaria", "Spain", "ES", 27.9202, -15.5474, 145),
]

# Category tags per destination - used by the trip-kind filter chips.
CATEGORIES_BY_IATA = {
    "LIS": ["city", "coast", "unesco", "food", "historic"],
    "OPO": ["city", "coast", "wine", "unesco", "historic"],
    "MAD": ["city", "art", "food", "nightlife"],
    "BCN": ["city", "coast", "beach", "art", "unesco", "nightlife"],
    "AGP": ["city", "beach", "coast"],
    "VLC": ["city", "beach", "coast", "food"],
    "PMI": ["island", "beach", "coast"],
    "ALC": ["city", "beach", "coast"],
    "FCO": ["city", "unesco", "roman", "historic", "art", "iconic"],
    "MXP": ["city", "art", "food"],
    "VCE": ["city", "unesco", "iconic", "romantic", "historic"],
    "NAP": ["city", "coast", "food", "unesco", "historic"],
    "CTA": ["city", "coast", "beach", "historic"],
    "ATH": ["city", "ruins", "unesco", "historic", "iconic"],
    "JTR": ["island", "coast", "iconic", "romantic"],
    "HER": ["island", "coast", "beach", "historic"],
    "BUD": ["city", "spa", "thermal", "historic", "nightlife"],
    "KRK": ["city", "medieval", "unesco", "historic"],
    "WAW": ["city", "historic"],
    "PRG": ["city", "medieval", "unesco", "historic", "iconic"],
    "VIE": ["city", "art", "music", "baroque", "historic"],
    "BER": ["city", "art", "nightlife", "historic", "modern"],
    "CGN": ["city", "historic", "cathedral"],
    "CDG": ["city", "art", "iconic", "romantic", "food"],
    "MRS": ["city", "coast", "beach"],
    "NCE": ["city", "coast", "beach", "luxury", "cote-azur"],
    "DUB": ["city", "music", "nightlife", "historic"],
    "EDI": ["city", "castle", "historic", "scotland"],
    "STN": ["city", "art", "historic", "iconic"],
    "CPH": ["city", "modern"],
    "ARN": ["city", "modern", "historic"],
    "HEL": ["city", "modern"],
    "OSL": ["city", "fjord", "nature", "modern"],
    "KEF": ["nature", "wilderness", "iconic", "adventure", "northern-lights"],
    "RIX": ["city", "medieval", "unesco", "historic"],
    "VNO": ["city", "medieval", "historic"],
    "TLL": ["city", "medieval", "unesco", "historic"],
    "OTP": ["city", "historic", "nightlife"],
    "SOF": ["city", "historic", "mountains"],
    "SPU": ["city", "coast", "beach", "historic", "unesco"],
    "DBV": ["city", "coast", "beach", "unesco", "iconic", "medieval"],
    "TIA": ["city", "historic", "affordable"],
    "FNC": ["island", "nature", "coast"],
    "TFS": ["island", "beach", "coast", "nature", "volcanic"],
    "LPA": ["island", "beach", "coast"],
}

# Monthly fare multiplier - fares peak in summer.
SEASONAL = {1: 0.90, 2: 0.90, 3: 1.00, 4: 1.10, 5: 1.20, 6: 1.40,
            7: 1.70, 8: 1.70, 9: 1.30, 10: 1.10, 11: 0.95, 12: 1.10}

START = date(2026, 5, 12)
END   = date(2026, 8, 31)
ORIGINS = ["BRU", "CRL"]

# CRL (Charleroi) is Ryanair's Brussels hub, typically a touch cheaper than BRU.
ORIGIN_FACTOR = {"BRU": 1.05, "CRL": 0.95}

# On-the-ground lifestyle basket (EUR per person). Mirrors notebook 03_costs:
# meal_mid, meal_cheap, drink_out, coffee, grocery_day. Real Numbeo anchors where
# available, estimates elsewhere (the real pipeline scales these via Eurostat PLI).
COUNTRY_COSTS = {
    "PT": (22.5, 12.0, 2.50, 1.85, 11.5, "numbeo_direct"),
    "ES": (25.0, 15.0, 3.00, 2.11, 11.6, "numbeo_direct"),
    "IT": (35.0, 17.0, 5.00, 1.76, 13.0, "numbeo_direct"),
    "GR": (25.0, 15.0, 4.80, 3.48, 11.5, "numbeo_direct"),
    "PL": (23.8,  9.52, 3.58, 3.38,  9.4, "numbeo_direct"),
    "HU": (22.0,  9.0, 2.50, 2.50,  9.0, "pli_scaled"),
    "CZ": (24.0, 10.0, 2.40, 2.80, 10.0, "pli_scaled"),
    "AT": (38.0, 16.0, 4.50, 3.60, 14.0, "pli_scaled"),
    "DE": (36.0, 14.0, 4.20, 3.20, 14.0, "pli_scaled"),
    "FR": (37.0, 18.5, 4.53, 3.42, 12.6, "pli_scaled"),
    "IE": (45.0, 20.0, 7.00, 4.32, 15.0, "pli_scaled"),
    "GB": (50.0, 25.0, 8.00, 4.50, 14.0, "pli_scaled"),
    "DK": (53.0, 19.0, 8.00, 6.00, 16.0, "pli_scaled"),
    "SE": (45.0, 16.0, 7.00, 4.50, 15.0, "pli_scaled"),
    "FI": (48.0, 16.0, 7.50, 4.60, 15.0, "pli_scaled"),
    "NO": (49.2, 24.6, 6.02, 4.55, 17.6, "pli_scaled"),
    "IS": (55.0, 28.0, 11.6, 5.65, 18.0, "pli_scaled"),
    "LV": (30.0, 11.0, 4.00, 3.00, 10.0, "pli_scaled"),
    "LT": (28.0, 10.0, 3.50, 2.80, 10.0, "pli_scaled"),
    "EE": (32.0, 12.0, 5.00, 3.20, 11.0, "pli_scaled"),
    "RO": (19.7,  9.8, 2.41, 1.82,  8.9, "pli_scaled"),
    "BG": (18.0,  8.0, 2.00, 1.80,  8.0, "pli_scaled"),
    "HR": (30.0, 12.0, 3.50, 2.50, 11.0, "pli_scaled"),
    "AL": (16.0,  7.0, 1.50, 1.20,  6.0, "pli_scaled"),
}
# City overrides (dining only; groceries borrow the country level).
CITY_COSTS = {
    "Paris":      (35.0, 15.0,  7.00, 4.52),
    "London":     (50.6, 25.3,  8.87, 5.22),
    "Barcelona":  (30.0, 16.0,  4.00, 2.69),
    "Rome":       (30.0, 15.0,  5.00, 1.96),
    "Copenhagen": (53.3, 19.3,  8.00, 6.03),
    "Reykjavik":  (42.5, 24.4, 11.64, 5.65),
    "Dublin":     (45.0, 20.0,  7.00, 4.32),
}

def _basket(mid, cheap, drink, coffee, grocery, level, source):
    # fast food, cocktail and club entry are derived (mock only); the real
    # pipeline (03_costs) uses Numbeo McMeal + imported beer x2.4 + a PLI estimate.
    return {
        "meal_mid_eur": mid, "meal_cheap_eur": cheap,
        "fastfood_eur": round(cheap * 0.6, 2),
        "drink_out_eur": drink,
        "cocktail_eur": round(drink * 2.2, 2),
        "coffee_eur": coffee, "grocery_day_eur": grocery,
        "club_entry_eur": round(grocery * 0.9, 2),
        "level": level, "price_source": source,
    }

def costs_for(city, iso2):
    country = COUNTRY_COSTS.get(iso2)
    if not country:
        return None
    grocery = country[4]
    if city in CITY_COSTS:
        mid, cheap, drink, coffee = CITY_COSTS[city]
        return _basket(mid, cheap, drink, coffee, grocery, "city", "numbeo_city")
    mid, cheap, drink, coffee, _grocery, source = country
    return _basket(mid, cheap, drink, coffee, grocery, "country", source)


# Accommodation (Airbnb entire-home median nightly EUR, capacity). Mirrors notebook
# 03b. (whole_home_night, typical_capacity, source)
ACCOM_COUNTRY = {
    "PT": (125, 4, "inside_airbnb_country"), "ES": (122, 4, "inside_airbnb_country"),
    "IT": (125, 4, "inside_airbnb_country"), "GR": (90, 4, "inside_airbnb_country"),
    "HU": (90, 4, "inside_airbnb_country"),  "CZ": (81, 4, "airbnb_pli_scaled"),
    "AT": (115, 4, "inside_airbnb_country"), "DE": (125, 4, "inside_airbnb_country"),
    "FR": (130, 4, "inside_airbnb_country"), "IE": (165, 4, "inside_airbnb_country"),
    "GB": (150, 4, "inside_airbnb_country"), "DK": (165, 4, "inside_airbnb_country"),
    "SE": (110, 4, "airbnb_pli_scaled"),     "FI": (131, 4, "airbnb_pli_scaled"),
    "NO": (138, 4, "airbnb_pli_scaled"),     "IS": (166, 4, "airbnb_pli_scaled"),
    "LV": (84, 4, "airbnb_pli_scaled"),      "LT": (75, 4, "airbnb_pli_scaled"),
    "EE": (93, 4, "airbnb_pli_scaled"),      "RO": (55, 4, "airbnb_pli_scaled"),
    "BG": (59, 4, "airbnb_pli_scaled"),      "HR": (81, 4, "airbnb_pli_scaled"),
    "AL": (52, 4, "airbnb_pli_scaled"),      "PL": (61, 4, "airbnb_pli_scaled"),
}
ACCOM_CITY = {
    "Amsterdam": (185, 4), "Barcelona": (130, 4), "Berlin": (115, 4),
    "Budapest": (90, 4),   "Copenhagen": (165, 4), "Dublin": (165, 4),
    "Edinburgh": (150, 4), "Lisbon": (125, 4),     "London": (175, 4),
    "Madrid": (120, 4),    "Malaga": (110, 4),     "Milan": (135, 4),
    "Naples": (95, 4),     "Paris": (160, 4),      "Rome": (130, 4),
    "Vienna": (115, 4),
}
CLEAN_FRAC = 0.5  # cleaning fee per booking ~= half of one whole-home night

def accom_for(city, iso2):
    if city in ACCOM_CITY:
        night, cap = ACCOM_CITY[city]
        source, level = "inside_airbnb_city", "city"
    elif iso2 in ACCOM_COUNTRY:
        night, cap, source = ACCOM_COUNTRY[iso2]
        level = "country"
    else:
        return None
    ppn = round(night / cap, 2)
    return {"per_person_night_eur": ppn, "cleaning_per_person_eur": round(CLEAN_FRAC * ppn, 2),
            "entire_home_night_eur": night, "typical_capacity": cap,
            "level": level, "price_source": source}


def daily_fares(base_fare, origin_factor):
    """One cheapest price per calendar day across the window."""
    fares = {}
    d = START
    while d <= END:
        season = SEASONAL.get(d.month, 1.0)
        price = base_fare * season * origin_factor * random.uniform(0.85, 1.15)
        fares[d.isoformat()] = round(price, 2)
        d += timedelta(days=1)
    return fares


destinations = {}
for iata, city, country, iso2, lat, lon, base_fare in DESTINATIONS:
    routes = {}
    for origin in ORIGINS:
        f = ORIGIN_FACTOR[origin]
        routes[origin] = {
            "anchor_airport": iata,
            "ground_transport_one_way_eur": 0,
            "ground_transport_minutes": 0,
            "outbound_fare": daily_fares(base_fare, f),
            "return_fare":   daily_fares(base_fare, f),
        }

    destinations[iata] = {
        "id": iata,
        "tier": "airport",
        "iata": iata,
        "city": city,
        "country": country,
        "iso2": iso2,
        "lat": lat,
        "lon": lon,
        "categories": CATEGORIES_BY_IATA.get(iata, []),
        "tags": [],
        "blurb": None,
        "no_ryanair_route": False,
        "anchor_airport": iata,
        "transfer": None,
        "routes": routes,
        "costs": costs_for(city, iso2),
        "accommodation": accom_for(city, iso2),
        "local_transport": car_layer.local_transport_for(
            city, iso2, "airport", CATEGORIES_BY_IATA.get(iata, [])),
    }


payload = {
    "meta": {
        "generated_at": "2026-05-12T12:00:00Z",
        "schema_version": 8,
        "currency": "EUR",
        "origins": ORIGINS,
        "home_city": "Brussels",
        "home": {"lat": 50.8466, "lon": 4.3528},
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "categories": sorted({c for cats in CATEGORIES_BY_IATA.values() for c in cats}),
        "defaults": {
            "group_size": 7,
            "trip_length_days": 7,
            "baggage": "priority_10kg",
            "lifestyle": {
                "dinners_per_week": 5,
                "lunches_per_week": 4,
                "fastfood_per_week": 2,
                "drinks_per_week": 7,
                "club_nights_per_week": 1,
                "coffees_per_day": 1,
                "self_catered_days_per_week": 2,
            },
        },
        "baggage_options": {
            "small":         {"label": "Small cabin (free)", "per_direction_eur": 0.0},
            "priority_10kg": {"label": "10 kg priority",      "per_direction_eur": 25.0},
            "checked_20kg":  {"label": "20 kg checked",       "per_direction_eur": 42.0},
        },
        "cost_basket": {
            "meal_mid_eur":    "mid-range restaurant meal, per person",
            "meal_cheap_eur":  "inexpensive restaurant meal, per person",
            "fastfood_eur":    "fast food / street meal (McMeal combo)",
            "drink_out_eur":   "domestic draught beer 0.5L at a bar",
            "cocktail_eur":    "club / premium drink (~imported beer x 2.4)",
            "coffee_eur":      "cappuccino",
            "grocery_day_eur": "one person, one day of self-catering groceries",
            "club_entry_eur":  "nightclub cover charge (estimate)",
        },
        "accommodation_model": {
            "service_fee_pct": 14.0,
            "cleaning_fee_frac_of_night": 0.5,
            "weekly_discount_pct": 8.0,
            "min_nights_for_weekly": 7,
            "seasonality": {"1": 0.82, "2": 0.82, "3": 0.90, "4": 0.98, "5": 1.08,
                            "6": 1.22, "7": 1.35, "8": 1.35, "9": 1.15, "10": 1.00,
                            "11": 0.85, "12": 0.92},
            "assumptions": ("entire home/apt; stored value is the annual median base "
                            "nightly per person; runtime adds season, weekly discount, "
                            "cleaning + service fee."),
        },
        "car_model": car_layer.CAR_MODEL,
        "n_destinations": len(destinations),
        "is_mock": True,
    },
    "destinations": destinations,
}

out = Path(__file__).resolve().parent / "public" / "app_data.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(payload, indent=1), encoding="utf-8")
print(f"Wrote {out}  ({out.stat().st_size / 1024 / 1024:.2f} MB)")
print(f"  {len(destinations)} destinations, {(END - START).days + 1} days per route")
