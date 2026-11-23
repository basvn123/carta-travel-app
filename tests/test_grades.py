"""One grade vocabulary (D24, D7, wave 3): the SAC table, the derived cap and
the and-fix in attributes.dem_grade."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import grades  # noqa: E402
import nature_tiers as nt  # noqa: E402
import attributes  # noqa: E402


def dem(ascent, km, max_grade, top=600, bottom=0):
    return {"distance_m": km * 1000, "ascent_m": ascent,
            "elevation": {"status": "ok", "ele_min_m": bottom, "ele_max_m": top,
                          "max_grade_pct": max_grade}}


def test_one_sac_table_and_t3_is_hard_everywhere():
    assert attributes.SAC_GRADE is grades.SAC_GRADE
    assert nt.SAC_GRADE is grades.SAC_GRADE
    assert nt.MOUNTAIN_DIFFICULTY is grades.MOUNTAIN_DIFFICULTY
    lab = {"sac_worst": "demanding_mountain_hiking"}
    assert nt.facts_of("trails", {"distance_m": 5000}, lab)["difficulty"] == "hard"
    assert set(grades.SAC_GRADE.values()) <= set(grades.GRADES)
    assert set(grades.MOUNTAIN_DIFFICULTY.values()) <= set(grades.GRADES)


def test_facts_read_f_g_first():
    row = {"distance_m": 5000, "f": {"g": "very_hard"}}
    assert nt.facts_of("trails", row, {"sac_worst": "hiking"})["difficulty"] == "very_hard"
    assert nt.facts_of("trails", {"distance_m": 5000}, None)["difficulty"] is None


def test_cap_derived_needs_a_tag_for_alpine():
    assert grades.cap_derived("alpine") == "very_hard"
    assert grades.cap_derived("alpine", tagged=True) == "alpine"
    assert grades.cap_derived("alpine", ferrata=True) == "alpine"
    assert grades.cap_derived("hard") == "hard"


def test_a_flat_route_with_one_steep_span_is_not_hard():
    # 20 km, 200 m of climb (10 m/km), one 31 percent span: the old "or"
    # said very_hard, the documented rule needs both terms.
    flat = dem(200, 20, 31.0, top=900, bottom=0)
    assert attributes.dem_grade(flat)[0] == "easy"


def test_both_terms_still_grade_a_real_climb():
    steep = dem(1900, 10, 31.0, top=900, bottom=0)
    assert attributes.dem_grade(steep)[0] == "very_hard"


def test_derived_never_alpine_even_high_up():
    alp = dem(3000, 10, 45.0, top=2800, bottom=1000)
    g, parts = attributes.dem_grade(alp)
    assert g == "very_hard" and "alpine_capped" in parts


def test_a_tagged_t5_stays_alpine():
    row = {**dem(300, 10, 5.0), "way_tags": {
        "cover": {"sac_scale": 0.9}, "sac_worst": "demanding_alpine_hiking"}}
    assert attributes.grade_of(row)[:2] == ("alpine", "tagged")


def test_a_long_flat_day_keeps_its_effort_grade():
    # 28 km flat is about 7 h in one day: hard by effort, whatever the terrain.
    row = dem(60, 28, 3.0, top=80, bottom=20)
    grade, src, parts = attributes.grade_of(row)
    assert parts["effort"] == "hard" and grade == "hard"


def test_lead_contradicts_is_narrow():
    assert grades.lead_contradicts("An easy stroll by the river.", "hard")
    assert not grades.lead_contradicts("A moderate climb.", "hard")
    assert not grades.lead_contradicts("An easy stroll by the river.", "moderate")
    assert not grades.lead_contradicts(None, "alpine")
