"""The five user-visible trail data bugs (T108, spec 6.8), one regression each.

The rows are the two Mount Korab routes as the published wire carried them on
2026-09-13 (AL.json, ids 63428 and 63433), cut down to the fields each pass
reads. Pure functions only: no lab, no network.

The fifth bug, the "comfortable day out" sentence, is copy and lives in the
app; its test is continent-app/tests/trailStory.test.mjs. Its pipeline half,
the watch that counts it on every published row, is tested here.

Runs under pytest from the repo root:
    python -m pytest tests/test_trail_data_bugs.py -q
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import attributes  # noqa: E402
import names  # noqa: E402
import regionize  # noqa: E402
import regression  # noqa: E402

# Mount Korab (9): drawn summit to village. +7 m on a line dropping 1,423 m.
KORAB_9 = {
    "id": 63428, "country": "AL", "network": "lwn",
    "distance_m": 7941, "ascent_m": 7, "descent_m": 1423,
    "elevation": {"status": "ok", "ele_max_m": 2679.3, "max_grade_pct": 38.5,
                  "ele_start_m": 2677.5, "ele_end_m": 1261.3},
    "way_tags": {"cover": {"sac_scale": 1.0}, "sac_worst": "mountain_hiking",
                 "sac_worst_share": 1.0},
}
# Mount Korab (9/1): Radomire up to the summit, the right way round.
KORAB_9_1 = {
    "id": 63433, "country": "AL", "network": "lwn",
    "distance_m": 12143, "ascent_m": 1568, "descent_m": 116,
    "duration_min": 419,
    "elevation": {"status": "ok", "ele_max_m": 2728.8, "max_grade_pct": 36.0},
}


# -- 1. +7 m on a line dropping 1,400 m --------------------------------------

def test_korab_9_is_read_uphill():
    walk = attributes.uphill(KORAB_9)
    assert walk == {"climb_m": 1423, "drop_m": 7, "stored_downhill": True}


def test_an_uphill_or_closed_route_keeps_its_direction():
    assert not attributes.uphill(KORAB_9_1)["stored_downhill"]
    # A loop loses no net height, so it can never qualify.
    loop = {"ascent_m": 900, "descent_m": 905}
    assert attributes.uphill(loop) == {"climb_m": 900, "drop_m": 905,
                                       "stored_downhill": False}
    # A long traverse that loses some height overall stays as drawn.
    traverse = {"ascent_m": 2000, "descent_m": 2400}
    assert not attributes.uphill(traverse)["stored_downhill"]


def test_korab_9_grade_and_suitability_read_the_climb():
    # Before: graded on the stored 7 m, an easy effort and a beginner chip.
    stored_grade, _src, stored_parts = attributes.grade_of(KORAB_9)
    assert stored_parts["effort"] == "easy"
    assert "beginner" in attributes.suitability_of(
        KORAB_9, stored_grade, None)["derived"]
    # After: the 1,423 m a walker climbs from the village.
    up = attributes.oriented(KORAB_9)
    grade, _src, parts = attributes.grade_of(up)
    assert parts["effort"] == "hard"
    assert grade == "hard"
    assert "beginner" not in attributes.suitability_of(up, grade, None)["derived"]
    # The stored row is never changed.
    assert KORAB_9["ascent_m"] == 7


# -- 2. difficulty: moderate beside f.g: very_hard ----------------------------

def test_two_grades_on_one_row_are_counted():
    row = {"difficulty": "moderate", "grade": "very_hard"}
    assert "two_grades" in regression.display_bugs(row)
    assert "two_grades" not in regression.display_bugs(
        {"difficulty": "hard", "grade": "hard"})
    # A row attributes.py has not reached has one grade and no conflict.
    assert "two_grades" not in regression.display_bugs({"difficulty": "easy"})


# -- 3. the trailhead is in Albania, the page said North Macedonia ------------

def _endpoints(row, start, end):
    return {**row, "start_lon": start[0], "start_lat": start[1],
            "end_lon": end[0], "end_lat": end[1]}


RADOMIRE = (20.48876, 41.81407)
SUMMIT = (20.54686, 41.79034)


def test_trailhead_is_the_start_of_an_uphill_line():
    row = _endpoints(KORAB_9_1, RADOMIRE, SUMMIT)
    assert regionize.trailhead(row) == RADOMIRE


def test_trailhead_is_the_end_of_a_line_drawn_downhill():
    # Korab (9) is drawn from the summit, so the walk starts at its end.
    row = _endpoints(KORAB_9, (20.54701, 41.78798), RADOMIRE)
    assert regionize.trailhead(row) == RADOMIRE


def test_trailhead_block_names_only_what_differs():
    row = {"country": "AL"}
    assert regionize.trailhead_block(row, "AL011", "AL011", "AL") == {}
    assert regionize.trailhead_block(row, "MK006", "AL011", "AL") == {"s3": "AL011"}
    # A row filed under North Macedonia whose trailhead is Albanian.
    assert regionize.trailhead_block({"country": "MK"}, "MK006", "AL011", "AL") \
        == {"s3": "AL011", "sc": "AL"}
    assert regionize.trailhead_block(row, "AL011", None, None) == {}


# -- 4. highlights in Macedonian Cyrillic beside name:en and name:sq ----------

LAKE_TAGS = {"name": "Големо Корабско Езеро", "name:en": "Great Korab Lake",
             "name:sq": "Liqeni i Madh i Korabit"}


def test_name_en_wins():
    assert names.display_name(LAKE_TAGS, "AL") == "Great Korab Lake"


def test_local_latin_before_other_scripts():
    tags = {k: v for k, v in LAKE_TAGS.items() if k != "name:en"}
    assert names.display_name(tags, "AL") == "Liqeni i Madh i Korabit"
    # Even with no country, any Latin name beats the Cyrillic one.
    assert names.display_name(tags) == "Liqeni i Madh i Korabit"


def test_local_language_beats_another_latin_name():
    tags = {"name": "Голем Кораб", "name:de": "Großer Korab",
            "name:sq": "Maja e Korabit"}
    assert names.display_name(tags, "AL") == "Maja e Korabit"


def test_other_scripts_only_when_nothing_else():
    assert names.display_name({"name": "Голем Кораб"}, "MK") == "Голем Кораб"
    assert names.display_name({}, "MK") is None


def test_feature_name_reads_tags_when_the_harvest_kept_them():
    feat = {"kind": "lake", "name": LAKE_TAGS["name"], "tags": LAKE_TAGS}
    assert names.feature_name(feat, "AL") == "Great Korab Lake"
    assert names.feature_name({"name": "Kodra Rakut"}) == "Kodra Rakut"


def test_non_latin_highlight_is_counted():
    row = {"highlights": {"features": [{"kind": "peak", "name": "Голем Кораб"}]}}
    assert "non_latin_name" in regression.display_bugs(row)
    ok = {"highlights": {"features": [{"kind": "peak", "name": "Maja e Korabit"}]}}
    assert "non_latin_name" not in regression.display_bugs(ok)


# -- 5. "12.1 km, a comfortable day out" next to 1,568 m of climb -------------

def test_comfortable_day_beside_a_big_climb_is_counted():
    row = {**KORAB_9_1,
           "rating_parts": {"reasons": [{"code": "bigClimb", "m": 1568},
                                        {"code": "dayOut", "km": 12.1}]}}
    assert "comfortable_climb" in regression.display_bugs(row)
    # The downhill-drawn Korab (9) is the same day, read the other way.
    row9 = {**KORAB_9, "rating_parts": {"reasons": [{"code": "dayOut", "km": 7.9}]}}
    assert "comfortable_climb" in regression.display_bugs(row9)
    easy = {"ascent_m": 300, "descent_m": 300,
            "rating_parts": {"reasons": [{"code": "dayOut", "km": 9.0}]}}
    assert "comfortable_climb" not in regression.display_bugs(easy)


def test_graded_downhill_clears_once_attributes_has_run():
    assert "graded_downhill" in regression.display_bugs(KORAB_9)
    fixed = {**KORAB_9, "grade_parts": {"stored_downhill": True}}
    assert "graded_downhill" not in regression.display_bugs(fixed)


def test_the_rule_is_the_same_in_all_three_passes():
    for a, d in ((7, 1423), (1568, 116), (100, 400), (100, 399), (300, 700)):
        row = {"ascent_m": a, "descent_m": d,
               "start_lon": 1, "start_lat": 1, "end_lon": 2, "end_lat": 2}
        down = attributes.uphill(row)["stored_downhill"]
        assert (regionize.trailhead(row) == (2.0, 2.0)) == down
        assert ("graded_downhill" in regression.display_bugs(row)) == down
