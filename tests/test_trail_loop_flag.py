"""T1201 (rows T1184-d, T1185-d, T1181-g): the loop flag, the route type and
the loop reason agree with the line, not with a wrong roundtrip tag.

    python -m pytest tests/test_trail_loop_flag.py -q
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import attributes  # noqa: E402
import curate  # noqa: E402
import rate  # noqa: E402


def shape(gap, roundtrip=None, retrace=0.0, simple=True, pieces=1):
    return attributes.route_type_of({
        "end_gap_m": gap, "retrace": retrace, "simple": simple,
        "pieces": pieces, "roundtrip": roundtrip})[0]


def test_tag_on_an_a_to_b_stage_is_ignored():
    # BergeSeen Trail 15: tagged roundtrip=yes, ends 9.9 km apart.
    assert shape(9900, "yes") == "point"


def test_tag_still_lifts_a_near_loop():
    assert shape(400, "yes") == "loop"
    assert shape(attributes.TAG_LOOP_MAX_M, "yes") == "loop"


def test_closed_line_is_a_loop_without_a_tag():
    assert shape(50) == "loop"
    assert shape(500) == "point"


def test_out_and_back_still_wins():
    assert shape(20, "yes", retrace=0.9) == "out_back"


def test_one_bound_for_tag_and_flag():
    assert curate.TAG_LOOP_MAX_M == attributes.TAG_LOOP_MAX_M == 1000


def test_flag_sql_vetoes_the_tag_on_far_ends():
    sql = curate.MARK_LOOPS_SQL
    assert sql.count("%(tag_max)s") == 2
    assert "ST_LineMerge" in sql


def test_loop_reason_follows_the_route_type():
    assert rate.says_loop({"route_type": "out_back", "is_loop": True}) is False
    assert rate.says_loop({"route_type": "point", "is_loop": True}) is False
    assert rate.says_loop({"route_type": "loop", "is_loop": False}) is True
    assert rate.says_loop({"route_type": "figure8"}) is True
    assert rate.says_loop({"route_type": None, "is_loop": True}) is True
    assert rate.says_loop({}) is False
