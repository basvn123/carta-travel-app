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


# --- T1201 (T1179-f): the retired describe.py lead stays off the wire ------

def test_retired_lead_is_not_shipped():
    import export_wire
    lead = ("Kelduleid is a 9.3 km walking route in IS. This easy path "
            "features 68 m of ascent and 35 m of descent.")
    assert export_wire.wire_summary({"description": lead, "category": "hike"}) is None
    based = "Based on its distance and ascent, this route is classified as easy."
    assert export_wire.wire_summary({"description": based, "category": "hike"}) is None
    city = "A one day city sightseeing walk past 6 sightseeing stops."
    assert export_wire.wire_summary({"description": city, "category": "citytrip"}) == city
    assert export_wire.wire_summary({"description": None, "category": "hike"}) is None


def test_t1179_summary_wins_on_the_wire(monkeypatch):
    # Owner decision T1179-a: the English T1179 text ships as `summary`.
    import export_wire
    text = "A 12 km walk with 300 m of climbing, about 4 h 00 min of walking."
    lead = {"c": "lead", "km": "12", "climb_m": 300, "minutes": 240}
    monkeypatch.setattr(export_wire, "_t1179", {"42": (text, lead)})
    row = {"id": 42, "description": None, "category": "hike",
           "distance_m": 12010, "ascent_m": 304, "duration_min": 240}
    assert export_wire.wire_summary(row) == text
    # The row moved since the summary was built: the old figures stay off the wire.
    assert export_wire.wire_summary({**row, "distance_m": 13500}) is None
    assert export_wire.wire_summary({**row, "ascent_m": 420}) is None
    assert export_wire.wire_summary({**row, "duration_min": 260}) is None
    city = "A one day city sightseeing walk past 6 sightseeing stops."
    assert export_wire.wire_summary({"id": 7, "description": city, "category": "citytrip"}) == city


# --- T1201 (T1179-d, T1181-f): what a highlight is ------------------------

def test_only_a_lake_is_a_lake():
    import scenic
    assert scenic.classify({"natural": "water"}) == "lake"
    assert scenic.classify({"natural": "water", "water": "reservoir"}) == "lake"
    assert scenic.classify({"natural": "water", "water": "stream_pool"}) == "lake"
    for w in ("fountain", "harbour", "basin", "wastewater", "reflecting_pool", "canal"):
        assert scenic.classify({"natural": "water", "water": w}) is None, w
    assert scenic.classify({"natural": "water", "water": "river"}) == "water"


def test_landform_kinds_are_highlights_with_a_chip():
    import scenic
    assert scenic.classify({"natural": "stone"}) == "rock"
    assert scenic.classify({"natural": "rock"}) == "rock"
    assert scenic.classify({"natural": "arete"}) == "ridge"
    assert scenic.classify({"natural": "ridge"}) == "ridge"
    assert scenic.classify({"natural": "cape"}) == "cape"
    for k in ("rock", "ridge", "saddle", "cape", "bay"):
        assert scenic.KINDS[k] > 0
        assert k in attributes.HIGHLIGHT_CODE
    sel = " ".join(scenic.SELECTORS)
    assert "rock|stone|ridge|arete|saddle|cape|bay" in sel
