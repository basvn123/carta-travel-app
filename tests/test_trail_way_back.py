"""T1185 (ROADMAP D24): the way back for one-way walks, on inline fixtures.

    python -m pytest tests/test_trail_way_back.py -q
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import way_back as wb  # noqa: E402

A, B = [10.0, 47.0], [10.2, 47.0]          # about 15.2 km apart
ASOF = "2026-11-06"


def item(i, start, end, km=20, mins=330, transit=None, **kw):
    d = {"id": i, "geometry": {"type": "LineString", "coordinates": [start, end]},
         "distance_m": km * 1000, "duration_min": mins}
    if transit:
        d["transit"] = transit
    d.update(kw)
    return d


def test_loop_has_no_record():
    assert wb.record(A, [10.001, 47.0], 5, 90, {}, {}, ASOF) is None
    assert wb.of_item(item(1, A, A), {}, ASOF) is None


def test_missing_ends_have_no_record():
    assert wb.record(None, B) is None
    assert wb.of_item({"id": 1, "geometry": None}, {}, ASOF) is None


def test_walk_taxi_and_stamps():
    r = wb.record(A, B, 20, 330, {"rail": True}, {"rail": True, "bus": True}, ASOF)
    assert r["km"] == 15.2
    assert r["walk"] == {"km": 20.0, "min": 330}
    assert r["taxi"]["est"] is True and r["taxi"]["km"] == 19.7
    assert r["taxi"]["min"] % 5 == 0 and r["taxi"]["min"] >= 24
    assert r["pt"] == {"s": ["rail"], "e": ["rail", "bus"], "both": ["rail"]}
    assert "min" not in r["pt"]                 # no timetable, no minutes
    assert r["_src"] == "osm" and r["_asof"] == ASOF


def test_transit_not_looked_up_is_unknown_not_none():
    r = wb.record(A, B, 20, 330, None, None, ASOF)
    assert "pt" not in r
    r = wb.record(A, B, 20, 330, {}, {}, ASOF)
    assert r["pt"] == {"s": [], "e": [], "both": []}


def test_taxi_left_out_beyond_limit():
    far = [14.0, 47.0]
    r = wb.record(A, far, 80, 1200, None, None, ASOF)
    assert "taxi" not in r and r["km"] > wb.TAXI_MAX_KM - 1 or "taxi" in r


def test_apply_row_and_trek():
    s1 = item(1, A, B, transit={"rail": True}, trek={"id": "t", "cc": "DE", "i": 1, "n": 2})
    s2 = item(2, B, [10.4, 47.0], mins=300, trek={"id": "t", "cc": "DE", "i": 2, "n": 2})
    solo = item(3, A, B)
    loop = item(4, A, A)
    listed = item(5, A, B, t="l")
    trek = {"id": "t", "km": 40.0, "min": 630, "stages": [{"id": 1}, {"id": 2}]}
    ends = {1: {}, 2: {"bus": True}, 3: {"rail": True}, 4: {}, 5: {}}
    out = wb.apply({"DE": [s1, s2, solo, loop, listed]}, [trek], ends, ASOF)
    assert "wb" not in s1 and "wb" not in s2      # a trek stage is not walked alone
    assert "wb" not in loop and "wb" not in listed
    assert solo["wb"]["pt"]["e"] == ["rail"]
    w = trek["wb"]
    assert w["km"] == 30.3 and w["walk"] == {"km": 40.0, "min": 630}
    assert w["pt"] == {"s": ["rail"], "e": ["bus"], "both": []}
    assert out == {"rows": 1, "treks": 1, "pt_unknown": 0}


def test_apply_without_transit_table():
    solo = item(3, A, B)
    out = wb.apply({"DE": [solo]}, [], {3: None}, ASOF)
    assert "pt" not in solo["wb"] and out["pt_unknown"] == 1
