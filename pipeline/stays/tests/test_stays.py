"""Unit tests for the stay layer: parsers, dates, drift and the model.

Run:  python -m pytest pipeline/stays/tests -q
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_stays as B  # noqa: E402
from booking.page import classify, parse_money, prop_key  # noqa: E402
from booking.urls import search_url  # noqa: E402
from common import journal  # noqa: E402
from hostelworld.page import city_url, parse_card  # noqa: E402
from price_xotelo import easter, peak_days, probe_day  # noqa: E402
from scrape_booking import probe_dates  # noqa: E402
from xotelo import parse_property, rate_median  # noqa: E402


def test_parse_money_formats():
    assert parse_money("€1,234") == 1234.0
    assert parse_money("€ 1.234") == 1234.0
    assert parse_money("€1.234,50") == 1234.5
    assert parse_money("EUR 98") == 98.0
    assert parse_money("€ 98.40") == 98.4
    assert parse_money(None) is None


def test_booking_card_classify_and_key():
    assert prop_key("https://www.booking.com/hotel/it/david.en-gb.html?x=1") == "it/david"
    assert classify({"unit": "Bed in 6-Bed Mixed Dormitory Room"}, "hostel")[1] == "dorm"
    kind, bed, stars = classify({"unit": "Double Room", "stars": 4, "starKind": "stars"})
    assert (kind, bed, stars) == ("hotel", "room", 4)
    assert classify({"unit": "Studio", "stars": 3, "starKind": "squares"})[2] is None


def test_search_url_filters():
    u = search_url("Florence, Italy", "2027-02-16", "2027-02-17", kind="hostel", stars=4)
    assert "nflt=ht_id%3D203%3Bclass%3D4" in u and "selected_currency=EUR" in u


def test_hostelworld_card_and_url():
    c = parse_card({"href": "/hostels/p/12345/plus-florence/",
                    "text": "Plus Florence\nHostel\nDorms From\n€24.50\nPrivates From\n€81"})
    assert c["key"] == "12345" and c["dorm"] == 24.5 and c["private"] == 81.0
    assert city_url("Málaga", "Spain", "2027-02-16", "2027-02-17").startswith(
        "https://www.hostelworld.com/hostels/europe/spain/malaga/?from=2027-02-16")


def test_probe_days_are_tuesdays_and_peaks_in_range():
    start = date(2026, 10, 21)
    for k in range(1, 13):
        d = probe_day(start, k)
        assert d.weekday() == 1 and abs(d.day - 15) <= 3
    assert easter(2027) == date(2027, 3, 28)
    assert all(timedelta(days=7) < p - start <= timedelta(days=365) for p in peak_days(start))
    probes = probe_dates(start)
    assert len([p for p in probes if p[0] == "month"]) == 12
    assert len([p for p in probes if p[0] == "weekend"]) == 4


def test_xotelo_helpers():
    p = parse_property({"key": "g187768-d1", "name": "X", "accommodation_type": "Hostel",
                        "url": "https://www.tripadvisor.com/Hotel_Review-g194729-d567471-Reviews-Hotel_Schiller-Cervia_Province.html",
                        "geo": {"latitude": 44.2, "longitude": 12.3}})
    assert p["town_geo"] == "g194729" and p["kind"] == "hostel"
    assert rate_median({"rates": [{"rate": 100, "code": "A"}, {"rate": 120, "code": "B"},
                                  {"rate": 0, "code": "C"}]})[0] == 110.0


def test_drift_is_year_on_year():
    hicp = {"IT": {"2025-09": 100.0, "2026-09": 110.0, "2026-08": 140.0}}
    assert B.drift(hicp, "IT", date(2026, 9, 1)) == 1.0
    assert abs(B.drift(hicp, "IT", date(2025, 9, 1)) - 1.10) < 1e-9
    assert abs(B.drift(hicp, "IT", date(2026, 3, 1)) - 1.10 ** 0.5) < 1e-9


def _dest(i, lat, lon, pop=300_000, cc="ES"):
    return {"id": i, "city": i, "country": "Spain", "iso2": cc, "lat": lat, "lon": lon,
            "pop": pop, "settlement": "city", "cls": None, "tier": "gem"}


def _obs(dest, key, kind, bed, day, price, stars=None, adults=2):
    return {"src": "xotelo", "dest": dest, "key": key, "kind": kind, "stars": stars,
            "bed": bed, "adults": adults, "day": day, "price": price,
            "cap": date(2026, 10, 1)}


def _season(m):
    # Mallorca-like: August twice November.
    return {1: .6, 2: .6, 3: .7, 4: .85, 5: 1, 6: 1.3, 7: 1.6, 8: 1.7, 9: 1.3, 10: .9, 11: .6, 12: .65}[m]


def _seasonal_obs(dest="PMI"):
    obs = []
    for m in range(1, 13):
        y = 2027 if m < 10 else 2026
        day = probe_day(date(y, m, 1), 0)          # the Tuesday near the 15th
        for j, (base, stars) in enumerate([(80, 3), (90, 3), (140, 4), (150, 4)]):
            obs.append(_obs(dest, f"h{j}", "hotel", "room", day, base * _season(m), stars))
        obs.append(_obs(dest, "hs", "hostel", "dorm", day, 25 * _season(m), adults=1))
    fri = date(2027, 2, 19)
    obs.append(_obs(dest, "h0", "hotel", "room", fri, 80 * _season(2) * 1.2, 3))
    obs.append(_obs(dest, "h0", "hotel", "room", date(2027, 8, 14), 80 * _season(8) * 1.3, 3))
    return obs


def test_model_season_weekend_peak_and_stars():
    dests = [_dest("PMI", 39.57, 2.65)]
    rec = B.build(dests, _seasonal_obs(), {}, {}, {})["PMI"]
    h3 = rec["month"]["hotel3"]
    assert h3[7] > 1.4 * h3[10]                       # August vs November
    assert rec["src"]["hotel3"]["q"] == "measured"
    assert rec["beds"]["hotel4"] > rec["beds"]["hotel3"]
    assert rec["src"]["hotel5"].get("scaled")          # no 5-star measured
    assert rec["weekend"] is None or rec["weekend"] > 1.1
    assert rec["peak"]["aug15"] > 1.2
    assert rec["season_q"] == "m" * 12
    assert "dorm" in rec["beds"] and rec["month"]["dorm"][7] > rec["month"]["dorm"][0]


def test_nearby_ladder_and_modelled():
    dests = [_dest("PMI", 39.57, 2.65), _dest("ALC", 39.62, 2.70),     # ~7 km
             _dest("FAR", 41.0, 1.0, pop=300_000)]
    recs = B.build(dests, _seasonal_obs(), {}, {}, {})
    near = recs["ALC"]["src"]["hotel3"]
    assert near["q"] == "nearby" and near["from"] == "PMI" and near["km"] <= 10
    assert recs["FAR"]["src"]["hotel3"]["q"] == "modelled"
    assert recs["FAR"]["q"] == "modelled"


def test_iab_homes_and_room():
    dests = [_dest("PMI", 39.57, 2.65)]
    iab = {"PMI": {"n": 900, "home": {"2": 120, "4": 160, "6": 230}, "room": 70,
                   "snapshot": "2026-09-19"}}
    rec = B.build(dests, _seasonal_obs(), iab, {}, {})["PMI"]
    assert rec["beds"]["bnb_home"]["4"] == 160 and rec["beds"]["bnb_home"]["8"] > 230
    assert rec["beds"]["bnb_room"] == 70
    assert rec["month"]["bnb_home"][7] > rec["month"]["bnb_home"][10]


def test_fixture_rows_refused(tmp_path):
    con = journal(tmp_path / "j.sqlite")
    con.execute("insert into obs values ('fixture','PMI','k','hotel',3,'room',2,'2027-02-16',1,99,null,?)",
                (date.today().isoformat() + "T00:00:00Z",))
    con.execute("insert into obs values ('xotelo','PMI','k','hotel',3,'room',2,'2027-02-16',1,99,null,?)",
                (date.today().isoformat() + "T00:00:00Z",))
    obs = B.load_obs(con, {}, {"PMI": "ES"}, None)
    assert [o["src"] for o in obs] == ["xotelo"]
