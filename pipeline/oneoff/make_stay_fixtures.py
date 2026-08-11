"""Generate recorded-shape stay-tier fixtures for dev without API credentials.

Writes cache/fixtures/hostelworld_fixture.json and liteapi_fixture.json in the
probe shapes harvest_hostelworld.py / harvest_hotels_liteapi.py consume, so the
whole chain (harvest --fixtures -> apply_stay_tiers --allow-fixtures -> runtime
-> UI) runs end to end today. Prices are plausible July-2026 hand estimates,
NOT measurements; anchors built from these are marked src="fixture" and the
apply script refuses them without --allow-fixtures.

Deterministic on purpose (fixed per-property multipliers, no randomness): the
fixture diff stays stable across regenerations.

Usage: python pipeline/oneoff/make_stay_fixtures.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXDIR = ROOT / "cache" / "fixtures"

# Same curve as the harvesters de-season with; probes are seasoned by it so the
# round trip lands each city near its intended annual base.
SEASON = {2: 0.82, 5: 1.08, 8: 1.25, 10: 1.00}
MONTHS = [2, 5, 8, 10]

# city: (country, lat, lon, dorm, private, hotel3, hotel4, hotel5)
CITIES = {
    "Amsterdam": ("Netherlands", 52.373, 4.892, 42, 120, 140, 195, 330),
    "Barcelona": ("Spain", 41.387, 2.170, 33, 95, 120, 165, 285),
    "Berlin": ("Germany", 52.520, 13.405, 26, 75, 95, 130, 220),
    "Prague": ("Czechia", 50.087, 14.421, 17, 55, 75, 100, 175),
    "Lisbon": ("Portugal", 38.722, -9.139, 27, 70, 100, 140, 240),
    "Porto": ("Portugal", 41.158, -8.629, 21, 60, 85, 115, 195),
    "Krakow": ("Poland", 50.062, 19.937, 13, 45, 65, 88, 150),
    "Budapest": ("Hungary", 47.498, 19.040, 15, 50, 70, 95, 160),
    "Rome": ("Italy", 41.893, 12.483, 30, 85, 120, 170, 300),
    "Paris": ("France", 48.857, 2.352, 41, 110, 150, 215, 380),
    "Vienna": ("Austria", 48.208, 16.373, 27, 70, 105, 145, 245),
    "Dublin": ("Ireland", 53.349, -6.260, 36, 110, 130, 180, 295),
    "Brussels": ("Belgium", 50.847, 4.352, 28, 75, 100, 138, 230),
    "Seville": ("Spain", 37.389, -5.984, 22, 60, 90, 122, 205),
}

# Per-property price multipliers around the city base (median ~= base).
HOSTEL_MULT = [0.78, 0.86, 0.93, 1.00, 1.07, 1.16, 1.28, 1.42]
GUESTHOUSE_MULT = [0.95, 1.12]
HOTEL3_MULT = [0.82, 0.90, 1.00, 1.08, 1.20]
HOTEL4_MULT = [0.85, 0.94, 1.00, 1.09, 1.22]
HOTEL5_MULT = [0.88, 0.96, 1.00, 1.11, 1.28]
RATINGS = [7.4, 9.1, 8.2, 8.8, 7.9, 9.4, 8.5, 7.1]


def hw_city(city, country, lat, lon, dorm, private, hotel):
    probes = []
    for m in MONTHS:
        s = SEASON[m]
        props = []
        # Hostelworld also lists plain hotels: the FREE, unstarred hotel tier.
        for mult in HOTEL3_MULT:
            props.append({"type": "HOTEL", "dorm_eur": None,
                          "private_eur": round(hotel * mult * s, 2), "rating": 8.1})
        for i, mult in enumerate(HOSTEL_MULT):
            props.append({
                "type": "HOSTEL",
                "dorm_eur": round(dorm * mult * s, 2),
                "private_eur": round(private * mult * s, 2),
                "rating": RATINGS[i % len(RATINGS)],
            })
        for mult in GUESTHOUSE_MULT:
            props.append({
                "type": "GUESTHOUSE",
                "dorm_eur": None,
                "private_eur": round(private * mult * s, 2),
                "rating": 8.6,
            })
        probes.append({"month": m, "properties": props})
    return {"city": city, "country": country, "lat": lat, "lon": lon, "probes": probes}


def lite_city(city, country, lat, lon, h3, h4, h5):
    probes = []
    for m in MONTHS:
        s = SEASON[m]
        hotels = ([{"bucket": 3, "night_eur": round(h3 * mult * s, 2)} for mult in HOTEL3_MULT]
                  + [{"bucket": 4, "night_eur": round(h4 * mult * s, 2)} for mult in HOTEL4_MULT]
                  + [{"bucket": 5, "night_eur": round(h5 * mult * s, 2)} for mult in HOTEL5_MULT])
        probes.append({"month": m, "hotels": hotels})
    return {"city": city, "country": country, "lat": lat, "lon": lon, "probes": probes}


def main():
    FIXDIR.mkdir(parents=True, exist_ok=True)
    hw, lite = [], []
    for city, (country, lat, lon, dorm, private, h3, h4, h5) in CITIES.items():
        # the unstarred hotel tier sits a little under the 3-star one
        hw.append(hw_city(city, country, lat, lon, dorm, private, round(h3 * 0.85)))
        lite.append(lite_city(city, country, lat, lon, h3, h4, h5))
    (FIXDIR / "hostelworld_fixture.json").write_text(
        json.dumps(hw, indent=1), encoding="utf-8")
    (FIXDIR / "liteapi_fixture.json").write_text(
        json.dumps(lite, indent=1), encoding="utf-8")
    print(f"Wrote {len(hw)} cities into {FIXDIR / 'hostelworld_fixture.json'}")
    print(f"Wrote {len(lite)} cities into {FIXDIR / 'liteapi_fixture.json'}")


if __name__ == "__main__":
    main()
