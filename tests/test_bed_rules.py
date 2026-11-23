"""Bed rules (D10, wave 1 item 0.1): the one predicate for a measured bed price."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline" / "stays"))

from bed_rules import (bed_stats, clean_all, clean_beds, clean_many, country_medians,  # noqa: E402
                       dorm_above_hotel3, is_measured, order_violations, under_floor)

# The Brussels block in the box master of 2026-11-10: q says measured, but
# nothing dated it (pre-T1021 writer).
BRUSSELS_LEGACY = {"q": "measured", "captured": None,
                   "beds": {"dorm": 34, "hotel3": 216, "bnb_room": 80, "bnb_home": {"2": 150}}}
FRESH = {"q": "measured", "captured": "2026-10-30", "beds": {"dorm": 30, "hotel3": 129}}


def test_legacy_block_is_not_measured():
    assert not is_measured(BRUSSELS_LEGACY)
    assert not is_measured({"q": "modelled", "captured": "2026-10-30", "beds": {"hotel3": 1}})
    assert not is_measured({"q": "measured", "captured": "2026-10-30", "beds": {}})
    assert not is_measured(None)
    assert is_measured(FRESH)


def test_dorm_above_hotel3_flagged_and_cleaned():
    beds = {"dorm": 200, "hotel3": 100, "hotel4": 150}
    month = {"dorm": [200] * 12, "hotel3": [100] * 12}
    assert dorm_above_hotel3(beds)
    b, m, dropped = clean_beds(beds, month)
    assert dropped == ["dorm"]
    assert "dorm" not in b and b["hotel3"] == 100 and b["hotel4"] == 150
    assert "dorm" not in m and m["hotel3"] == [100] * 12
    assert beds["dorm"] == 200  # the input is not changed


def test_clean_keeps_sane_or_partial_beds():
    for beds in ({"dorm": 30, "hotel3": 129}, {"dorm": 300}, {"hotel3": 50}, {"dorm": 100, "hotel3": 100}):
        assert clean_beds(beds) == (beds, None, [])
    assert not dorm_above_hotel3({"dorm": True, "hotel3": 0})


def test_bed_stats_skips_gateways():
    dests = {
        "a": {"accommodation": FRESH},
        "b": {"accommodation": BRUSSELS_LEGACY},
        "c": {"accommodation": {"q": "measured", "captured": "2026-11-01", "beds": {"dorm": 200, "hotel3": 100}}},
        "d": {},
        "gw": {"gateway_of": "a", "accommodation": FRESH},
    }
    s = bed_stats(dests)
    assert s == {"places": 4, "measured": 2, "measured_share": 0.5, "dorm_above_hotel3": 1, "legacy": 1,
                 "out_of_order": 1, "under_floor": 0}
    assert bed_stats({})["measured_share"] == 0.0


# D10 (wave 2, 1.4): tier order, the floor, thin samples, country outliers.
def test_stars_out_of_order_drop_both_tiers_of_the_pair():
    beds = {"hotel2": 150, "hotel3": 100, "hotel4": 130, "hotel5": 200}
    month = {"hotel2": [150] * 12, "hotel3": [100] * 12}
    cleaned, dropped = clean_all({"beds": beds, "month": month, "src": {"hotel2": {"n": 5}, "hotel3": {"n": 5}}})
    assert cleaned["beds"] == {"hotel4": 130, "hotel5": 200}
    assert sorted(dropped) == [("hotel2", "order"), ("hotel3", "order")]
    assert "hotel2" not in cleaned["month"] and "hotel3" not in cleaned["src"]
    assert beds["hotel2"] == 150                      # the input is not changed


def test_a_dorm_dearer_than_a_private_room_or_hotel3_drops_the_dorm_only():
    assert clean_all({"dorm": 90, "private": 60, "hotel3": 120}) == ({"private": 60, "hotel3": 120}, [("dorm", "order")])
    assert order_violations({"dorm": 90, "private": 60, "hotel3": 80}) == [("dorm", "private"), ("dorm", "hotel3")]
    # A private room under a 2-star is a room for two, not an error; equal is in order.
    assert order_violations({"private": 70, "hotel2": 90, "hotel3": 90, "bnb_home": {"2": 40}}) == []


def test_a_figure_under_the_floor_is_dropped_bnb_home_too():
    assert under_floor({"dorm": 9, "hotel3": 10, "bnb_home": {"2": 5}}) == ["dorm", "bnb_home"]
    beds, dropped = clean_all({"dorm": 9, "hotel3": 100, "bnb_home": {"2": 5}})
    assert beds == {"hotel3": 100} and {t for t, _ in dropped} == {"dorm", "bnb_home"}


def test_a_thin_tier_is_dropped_from_a_record_that_knows_its_sample():
    rec = {"beds": {"hotel3": 100, "hotel4": 140},
           "src": {"hotel3": {"q": "measured", "n": 2}, "hotel4": {"q": "measured", "n": 3}}}
    cleaned, dropped = clean_all(rec)
    assert cleaned["beds"] == {"hotel4": 140} and dropped == [("hotel3", "thin")]
    # A bare beds dict (the master block) has no sample size: nothing is guessed.
    assert clean_all({"hotel3": 100}) == ({"hotel3": 100}, [])


def _country(prices, tier="hotel3"):
    return {f"p{i}": {"beds": {tier: v}} for i, v in enumerate(prices)}


def test_a_country_outlier_needs_five_places_and_three_times_the_median():
    six = _country([100, 105, 110, 95, 100, 310])           # 3.1x the median (102.5)
    cleaned, why = clean_many(six, {k: "PT" for k in six})
    assert cleaned["p5"]["beds"] == {} and why["p5"] == [("hotel3", "country_x3")]
    assert all(cleaned[k]["beds"] for k in ("p0", "p1", "p2", "p3", "p4"))
    four = _country([100, 105, 110, 310])                   # four places: no median, kept
    cleaned, why = clean_many(four, {k: "PT" for k in four})
    assert cleaned["p3"]["beds"] == {"hotel3": 310} and not why
    assert country_medians({k: v["beds"] for k, v in four.items()}, {k: "PT" for k in four}) == {}
    edge = _country([100, 100, 100, 100, 100, 300])          # exactly 3x: kept
    assert not clean_many(edge, {k: "PT" for k in edge})[1]


def test_cleaning_twice_changes_nothing():
    recs = _country([100, 105, 110, 95, 100, 310])
    recs["p0"] = {"beds": {"hotel2": 150, "hotel3": 100, "dorm": 8}, "src": {"hotel2": {"n": 1}}}
    country = {k: "PT" for k in recs}
    once, _ = clean_many(recs, country)
    twice, why = clean_many(once, country)
    assert twice == once and not why


def test_apply_build_cleans_with_the_same_rules_as_the_build():
    import apply_stays
    recs = {f"p{i}": {"beds": {"hotel3": 100 + i}, "q": "measured", "captured": "2026-11-01"} for i in range(6)}
    recs["p5"] = {"beds": {"hotel3": 900}, "q": "measured", "captured": "2026-11-01"}      # country outlier
    recs["p6"] = {"beds": {"hotel2": 200, "hotel3": 100}, "q": "measured", "captured": "2026-11-01"}
    data = {"destinations": {k: {"iso2": "PT"} for k in recs}, "meta": {}}
    n, before, after = apply_stays.apply_build(data, recs, {"built": "x", "build": "y"})
    assert "accommodation" not in data["destinations"]["p5"]      # 9x the country median
    assert "accommodation" not in data["destinations"]["p6"]      # both tiers of the broken pair went
    assert data["destinations"]["p0"]["accommodation"]["beds"] == {"hotel3": 100}
    assert n == 5 and after["out_of_order"] == 0


def test_a_fully_reversed_star_chain_leaves_no_pair_out_of_order():
    """hotel2 > hotel3 > hotel4 > hotel5: every broken pair drops both tiers
    (nothing says which is right) and what is left is in order."""
    beds = {"hotel2": 400, "hotel3": 300, "hotel4": 200, "hotel5": 100}
    cleaned, dropped = clean_all(beds)
    assert order_violations(cleaned) == []
    assert {t for t, _w in dropped} >= {"hotel2", "hotel3"}
    mixed = {"hotel2": 80, "hotel3": 120, "hotel4": 100, "hotel5": 300}
    cleaned, dropped = clean_all(mixed)
    assert cleaned == {"hotel2": 80, "hotel5": 300} and order_violations(cleaned) == []
