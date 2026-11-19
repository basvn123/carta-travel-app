"""Bed rules (D10, wave 1 item 0.1): the one predicate for a measured bed price."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline" / "stays"))

from bed_rules import bed_stats, clean_beds, dorm_above_hotel3, is_measured  # noqa: E402

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
    assert s == {"places": 4, "measured": 2, "measured_share": 0.5, "dorm_above_hotel3": 1, "legacy": 1}
    assert bed_stats({})["measured_share"] == 0.0
