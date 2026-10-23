"""Weighting per source and minimum samples (T644).

Run:  python -m pytest pipeline/stays/tests -q
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_stays as B  # noqa: E402

TUE = date(2027, 1, 12)


def ob(src, key, price, day=TUE, **kw):
    o = {"src": src, "dest": "X", "key": f"{src}:{key}", "kind": "hotel", "stars": None,
         "bed": "room", "adults": 2, "day": day, "price": price, "cap": date(2026, 10, 23),
         "tax_included": 1, "from_or_discount": 0}
    o.update(kw)
    return o


def test_each_source_votes_once():
    obs = [ob("booking", i, 100) for i in range(30)] + [ob("xotelo", i, 200) for i in range(2)]
    level, _, n = B.curve_and_level(obs)
    assert level == 150 and n == 32          # was 100: thirty Booking cards outvoted Xotelo


def test_one_source_keeps_its_own_median():
    assert B.curve_and_level([ob("booking", i, 80 + i) for i in range(5)])[0] == 82


def dests():
    return [{"id": "X", "iso2": "PT", "city": "X", "country": "P", "lat": 38.7, "lon": -9.1,
             "pop": 500_000}]


def test_untaxed_and_discounted_prices_do_not_set_hotel_levels():
    obs = [ob("booking", i, 100) for i in range(3)] + \
          [ob("booking", f"t{i}", 50, tax_included=0) for i in range(5)] + \
          [ob("booking", f"d{i}", 40, from_or_discount=1) for i in range(5)]
    rec = B.build(dests(), obs, {}, {}, {})["X"]
    assert rec["src"]["hotel3"]["n"] == 3      # only the three taxed, plain prices


def test_a_peak_factor_needs_two_pairs():
    aug = date(2027, 8, 10)
    peak = date(2027, 8, 14)
    one = [ob("booking", "a", 100, aug), ob("booking", "a", 200, peak)]
    two = one + [ob("booking", "b", 100, aug), ob("booking", "b", 180, peak)]
    assert "aug15" not in B.build(dests(), one, {}, {}, {})["X"]["peak"]
    assert B.build(dests(), two, {}, {}, {})["X"]["peak"]["aug15"] == 1.9
