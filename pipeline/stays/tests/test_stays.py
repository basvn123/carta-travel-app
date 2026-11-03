"""Unit tests for the stay layer: parsers, dates and the scrape-only model (T1021).

Run:  python -m pytest pipeline/stays/tests -q
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_stays as B  # noqa: E402
from booking.page import classify, parse_money, prop_key, search_dropped  # noqa: E402
from booking.urls import search_url  # noqa: E402
from common import journal  # noqa: E402
from hostelworld.page import city_url, parse_card  # noqa: E402
from common import easter, peak_days, probe_day  # noqa: E402
from scrape_booking import probe_dates  # noqa: E402


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


def test_dropped_search_is_a_block():
    u = search_url("Munich, Germany", "2027-01-12", "2027-01-13")
    assert not search_dropped(u)
    assert search_dropped("https://www.booking.com/searchresults.en-gb.html")
    assert not search_dropped("https://www.booking.com/hotel/de/platzl.en-gb.html")


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
    probes = probe_dates(start, full=True)
    assert len([p for p in probes if p[0] == "month"]) == 12
    assert len([p for p in probes if p[0] == "weekend"]) == 4


def test_lean_plan_is_six_dates_and_skips_empty_towns():
    from scrape_booking import bookable, LEAN_MONTHS
    lean = probe_dates(date(2026, 10, 21))
    assert len(lean) == 6
    assert sorted(d.month for w, d in lean if w == "month") == sorted(LEAN_MONTHS)
    assert [d.weekday() for w, d in lean if w == "weekend"] == [4]
    assert bookable({"id": "X"}, {}) == (True, True)            # unknown: search it
    assert bookable({"id": "X"}, {"X": {"hotel": 0, "hostel": 0}}) == (False, False)
    assert bookable({"id": "X"}, {"X": {"hotel": 3, "hostel": 0}}) == (True, False)


def test_nearest_fill_takes_the_closest_scraped_month():
    # The scrape's months: Jan, Mar, May, Aug, Oct.
    measured = [0.8, None, 1.0, None, 1.2, None, None, 1.6, None, 1.0, None, None]
    curve, flags = B.nearest_fill(measured)
    assert flags.count(True) == 5
    # Feb -> Jan and Apr -> Mar (ties go to the earlier month), Jun -> May,
    # Jul -> Aug, Sep -> Aug (tie), Nov and Dec -> Oct (never next January).
    assert curve == [0.8, 0.8, 1.0, 1.0, 1.2, 1.2, 1.6, 1.6, 1.6, 1.0, 1.0, 1.0]
    assert B.nearest_fill([None] * 12) == ([None] * 12, [False] * 12)


def _dest(i, lat, lon, pop=300_000, cc="ES"):
    return {"id": i, "city": i, "country": "Spain", "iso2": cc, "lat": lat, "lon": lon,
            "pop": pop, "settlement": "city", "cls": None, "tier": "gem"}


def _obs(dest, key, kind, bed, day, price, stars=None, adults=2, src="booking"):
    return {"src": src, "dest": dest, "key": key, "kind": kind, "stars": stars,
            "bed": bed, "adults": adults, "day": day, "price": price,
            "cap": date(2026, 10, 25)}


def _season(m):
    # Mallorca-like: August twice January.
    return {1: .6, 3: .7, 5: 1, 8: 1.7, 10: .9}[m]


SCRAPE_DAYS = [date(2027, 1, 12), date(2027, 3, 16), date(2027, 5, 18), date(2027, 8, 17),
               date(2027, 10, 12)]


def _scraped_obs(dest="PMI"):
    obs = []
    for day in SCRAPE_DAYS:
        f = _season(day.month)
        for j, (base, stars) in enumerate([(80, 3), (90, 3), (140, 4), (150, 4)]):
            obs.append(_obs(dest, f"h{j}", "hotel", "room", day, base * f, stars))
        obs.append(_obs(dest, "a0", "apartment", "home", day, 120 * f))
        obs.append(_obs(dest, "hs", "hostel", "dorm", day, 25 * f, adults=1, src="hostelworld"))
    # The weekend probe: the Friday of the May week, two pairs.
    fri = date(2027, 5, 21)
    obs.append(_obs(dest, "h0", "hotel", "room", fri, 80 * 1.2, 3))
    obs.append(_obs(dest, "h1", "hotel", "room", fri, 90 * 1.2, 3))
    return obs


def test_model_season_weekend_and_stars():
    rec = B.build([_dest("PMI", 39.57, 2.65)], _scraped_obs())["PMI"]
    h3 = rec["month"]["hotel3"]
    assert h3[7] > 2 * h3[0]                          # August vs January
    assert h3[6] == h3[7] and h3[11] == h3[9]         # Jul takes Aug, Dec takes Oct
    assert rec["season_q"] == "mfmfmffmfmff"
    assert rec["src"]["hotel3"] == {"q": "measured", "n": 2}
    assert rec["beds"]["hotel4"] > rec["beds"]["hotel3"]
    assert "hotel5" not in rec["beds"] and "hotel2" not in rec["beds"]   # never scaled in
    assert rec["weekend"] > 1.1
    assert rec["peak"] == {}
    assert rec["month"]["dorm"][7] > rec["month"]["dorm"][0]
    assert rec["q"] == "measured" and rec["supply"]["hotel5"] is False


def test_apartments_are_the_place_for_two():
    rec = B.build([_dest("PMI", 39.57, 2.65)], _scraped_obs())["PMI"]
    assert set(rec["beds"]["bnb_home"]) == {"2"}
    assert rec["month"]["bnb_home"][7] > rec["month"]["bnb_home"][0]
    assert "bnb_room" not in rec["beds"]


def test_an_unscraped_place_has_no_record():
    dests = [_dest("PMI", 39.57, 2.65), _dest("ALC", 39.62, 2.70)]     # ~7 km away
    recs = B.build(dests, _scraped_obs())
    assert "PMI" in recs and "ALC" not in recs


def test_one_hotel_is_not_a_star_class():
    obs = [o for o in _scraped_obs() if o["key"] != "h1"]
    rec = B.build([_dest("PMI", 39.57, 2.65)], obs)["PMI"]
    assert "hotel3" not in rec["beds"] and "hotel4" in rec["beds"]


def test_only_scrape_rows_are_read(tmp_path):
    con = journal(tmp_path / "j.sqlite")
    for src in ("fixture", "xotelo", "booking"):
        con.execute("insert into obs values (?,'PMI','k','hotel',3,'room',2,'2027-02-16',1,99,null,?)",
                    (src, date.today().isoformat() + "T00:00:00Z"))
    obs = B.load_obs(con, {"PMI": "ES"}, None)
    assert [o["src"] for o in obs] == ["booking"]


def test_outlier_rate_stays_out_of_the_curve():
    obs = _scraped_obs()
    # One absurd OTA rate (a suite, a typo) in October must not reach the curve.
    obs.append(_obs("PMI", "h0", "hotel", "room", date(2027, 10, 12), 80 * 25, 3))
    h3 = B.build([_dest("PMI", 39.57, 2.65)], obs)["PMI"]["month"]["hotel3"]
    assert max(h3) < 3 * min(h3)
