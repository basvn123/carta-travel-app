"""T513: the food price model's pure parts, with stub inputs and no network.

Runs from the repo root:

    python -m pytest tests/test_food_prices.py -q

The NUTS3 lookup is replaced by a stub, so shapely and the 2.5 MB boundary
file are not needed here; apply_food_prices.py --report exercises them on the
real catalogue.
"""

import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import apply_food_prices as F  # noqa: E402


def months(year, value):
    return {f"{year}-{m:02d}": value for m in range(1, 13)}


@pytest.fixture()
def inputs():
    """Two euro countries and one zloty country, flat prices except where set."""
    hicp = {cat: {cc: {**months("2024", 100.0), **months("2025", 100.0),
                       "2026-06": 100.0, "2026-09": 100.0}
                  for cc in ("BE", "FR", "PL", "EA20")}
            for cat in ("CP111", "CP011")}
    hicp["CP111"]["FR"]["2026-09"] = 103.0           # 3% restaurant inflation since June
    fx = {"PLN": {**months("2024", 4.0), "2026-06": 4.0, "2026-09": 4.4}}
    pli = {cat: {"BE": {"value": 120.0, "year": 2024}, "FR": {"value": 110.0, "year": 2024},
                 "PL": {"value": 60.0, "year": 2024}, "DE": {"value": 100.0, "year": 2024}}
           for cat in set(F.PLI_CAT.values()) | {"A010201"}}
    return {"hicp": hicp, "fx": fx, "pli": pli, "gdp": {},
            "receipts": {"index": [], "country": {}}}


def basket(scale, source="numbeo_direct"):
    b = {i: round(10.0 * scale, 2) for i in F.ITEMS}
    b["source"] = source
    return b


@pytest.fixture()
def baskets():
    return {"countries": {"BE": basket(1.2), "FR": basket(1.1), "PL": basket(0.6),
                          "DE": basket(1.0, "pli_scaled"), "AD": basket(1.0, "pli_scaled")},
            "cities": {}}


def test_roll_follows_inflation_and_currency(inputs):
    r = F.Roller(inputs)
    assert r.now == "2026-09"
    assert r.roll(10.0, "BE", "eat", "2026-06") == pytest.approx(10.0)
    assert r.roll(10.0, "FR", "eat", "2026-06") == pytest.approx(10.3)
    # 40 zloty in June at 4.0 is 10 euro; the same 40 zloty at 4.4 is 9.09 euro
    assert r.roll(10.0, "PL", "eat", "2026-06") == pytest.approx(10.0 * 4.0 / 4.4)


def test_missing_index_uses_a_flagged_stand_in(inputs):
    r = F.Roller(inputs)
    r.roll(10.0, "AD", "eat", "2026-06")
    assert any(f.startswith("hicp~") for f in r.flags["AD"])


def test_country_bases_measured_modelled_legacy(inputs, baskets):
    r = F.Roller(inputs)
    bases, kinds, ref, loo = F.build_country_bases(inputs, baskets, r)
    assert kinds == {"BE": "measured", "FR": "measured", "PL": "measured",
                     "DE": "modelled", "AD": "legacy"}
    # Every measured basket is exactly ten euro per price-level point, so the
    # Europe reference is 10 and Germany (level 100) models at 10.
    assert ref["meal_mid_eur"] == pytest.approx(10.0)
    assert bases["DE"]["meal_mid_eur"] == pytest.approx(10.0)
    assert loo["meal_mid_eur"] == pytest.approx(0.0, abs=0.01)


def test_weighted_median():
    assert F.weighted_median([(1.0, 1), (2.0, 10), (3.0, 1)]) == 2.0
    assert F.weighted_median([(0.9, 100), (1.5, 1)]) == 0.9


class StubRegions:
    def __init__(self, ratio=None, rank=None):
        self.ratio, self.rank = ratio, rank

    def locate(self, lat, lon):
        return "XX123"

    def income_ratio(self, code):
        return self.ratio

    def tourism_rank(self, code):
        return self.rank


def dest(pop=50_000, did="x"):
    return {"id": did, "iso2": "FR", "lat": 48.0, "lon": 2.0, "geonames": {"population": pop}}


def test_tilt_neutral_place_is_one():
    groups, drivers, _, n = F.tilt_for(dest(), StubRegions(), F.Receipts([]), premium=True)
    assert groups == {"eat": 1.0, "chain": 1.0, "shop": 1.0}
    assert drivers == {} and n == 0


def test_tilt_income_size_and_tourism():
    groups, drivers, _, _ = F.tilt_for(dest(pop=2_000_000), StubRegions(ratio=1.5, rank="top5"),
                                       F.Receipts([]), premium=True)
    expect = 1.5 ** F.ELASTICITY["eat"] * 1.08 * 1.06
    assert groups["eat"] == pytest.approx(expect)
    assert set(drivers) == {"inc", "tour", "size"}


def test_tilt_is_capped():
    groups, _, _, _ = F.tilt_for(dest(pop=2_000_000, did="VCE"), StubRegions(ratio=50.0, rank="top5"),
                                 F.Receipts([]), premium=True)
    assert groups["eat"] <= F.TILT_CAP[1]


def test_curated_premium_wins_over_density():
    groups, drivers, _, _ = F.tilt_for(dest(did="JTR"), StubRegions(rank="top15"),
                                       F.Receipts([]), premium=True)
    assert drivers["tour"] == pytest.approx(1.40)       # Santorini is "extreme"


def test_receipts_need_enough_prices_and_shrink():
    few = F.Receipts([[48.0, 2.0, "FR", 1.5, 10]])
    _, drivers, _, n = F.tilt_for(dest(), StubRegions(), few, premium=True)
    assert n == 10 and "rcpt" not in drivers
    many = F.Receipts([[48.0, 2.0, "FR", 1.1, 80]])
    groups, drivers, _, n = F.tilt_for(dest(), StubRegions(), many, premium=True)
    assert drivers["rcpt"] == pytest.approx(1 + 0.1 * 80 / 160, abs=0.001)
    assert groups["eat"] == 1.0                          # receipts move groceries only
    other = F.Receipts([[48.0, 2.0, "BE", 1.1, 500]])    # another country's shop
    _, _, _, n = F.tilt_for(dest(), StubRegions(), other, premium=True)
    assert n == 0


def test_price_all_is_idempotent(inputs, baskets, monkeypatch):
    monkeypatch.setattr(F, "Regions", lambda _inputs: StubRegions(ratio=1.2))
    dests = {"a": {**dest(), "id": "a", "costs": {"meal_mid_eur": 99}},
             "b": {**dest(pop=1_000), "id": "b", "iso2": "PL", "costs": {}}}
    out1, model1, _ = F.price_all(copy.deepcopy(dests), inputs, baskets)
    applied = copy.deepcopy(dests)
    for k, v in out1.items():
        applied[k]["costs"] = v
    out2, model2, _ = F.price_all(applied, inputs, baskets)
    assert out1 == out2
    assert out1["a"]["level"] == "region" and out1["a"]["price_source"] == F.VERSION
    assert model1["asof"] == "2026-09"
