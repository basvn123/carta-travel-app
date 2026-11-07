"""T1183 (ROADMAP D24): the routed continuity repair, on fixtures.

No lab and no BRouter: plan_route takes a router callable, so every limit
and every refusal reason is exercised with synthetic routes shaped like the
T1181-b misses (an Irish Way with two short real breaks, an Offa's Dyke
style missing stage, parts listed out of order) and one recorded BRouter
answer in tests/fixtures/trail_route_bridge/.

    python -m pytest tests/test_trail_route_bridge.py -q
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import route_bridge as rb

FIX = ROOT / "tests" / "fixtures" / "trail_route_bridge"
LAT = 51.96
M_PER_DEG_LON = rb.dist_m((0.0, LAT), (1.0, LAT))


def lon_at(m, lon0=-9.70):
    return lon0 + m / M_PER_DEG_LON


def part(m0, m1, step=100.0, z=100.0):
    """A straight east-going part from metre m0 to m1 along the parallel."""
    n = max(1, round((m1 - m0) / step))
    return [[lon_at(m0 + (m1 - m0) * k / n), LAT, z] for k in range(n + 1)]


def answer(a, b, factor=1.0, tags="highway=path", snap_off_m=0.0, n=8,
           with_tags=True):
    """A fake BRouter answer from a to b, `factor` times the straight line."""
    gap = rb.dist_m(a, b)
    lon_a = a[0] + snap_off_m / M_PER_DEG_LON
    coords = [[lon_a + (b[0] - lon_a) * k / n, LAT] for k in range(n + 1)]
    track = max(gap * factor, 1.0)
    segs = [(track, rb.parse_tags(tags))] if with_tags else []
    return {"coords": coords, "segments": segs, "track_m": track,
            "ascend_m": 0.0}


def router_of(**kw):
    calls = []

    def route(a, b):
        calls.append((a, b))
        if kw.get("fail"):
            return None, "target island detected"
        return answer(a, b, **kw), None
    route.calls = calls
    return route


# --- the happy path -------------------------------------------------------

def test_irish_way_two_short_breaks_become_one_line():
    # 30 km of Way with a 600 m and a 1,200 m break: the T1181-b pattern.
    parts = [part(0, 10000), part(10600, 20000), part(21200, 30000)]
    r = router_of(factor=1.3)
    plan, why, _detail = rb.plan_route(parts, 30000, r)
    assert why is None
    assert plan["routed"] == 2 and plan["bridges"] == 2
    assert len(r.calls) == 2
    line = plan["line"]
    # start, end and order kept
    assert line[0][:2] == parts[0][0][:2] and line[-1][:2] == parts[-1][-1][:2]
    assert rb.keeps_order(line, parts)
    assert rb.max_step_m(line) <= rb.SPLICE_M
    assert all(len(p) == 3 for p in line)
    assert plan["bridged_m"] == pytest.approx(1.3 * 1800, rel=0.01)


def test_part_stored_backwards_is_flipped_not_moved():
    parts = [part(0, 5000), list(reversed(part(5500, 10000)))]
    plan, why, _ = rb.plan_route(parts, 10000, router_of())
    assert why is None
    assert plan["line"][-1][:2] == parts[1][0][:2]


def test_touching_parts_need_no_routing():
    parts = [part(0, 5000), part(5010, 10000)]
    r = router_of(fail=True)
    plan, why, _ = rb.plan_route(parts, 10000, r)
    assert why is None and plan["bridges"] == 0 and not r.calls


# --- every refusal reason -------------------------------------------------

def test_single_part():
    assert rb.plan_route([part(0, 5000)], 5000, router_of())[1] == "single_part"


def test_too_many_parts():
    parts = [part(i * 110, i * 110 + 100) for i in range(rb.MAX_PARTS + 1)]
    assert rb.plan_route(parts, 5000, router_of())[1] == "too_many_parts"


def test_too_many_breaks():
    parts = [part(i * 2000, i * 2000 + 1600) for i in range(rb.MAX_BRIDGES + 2)]
    assert rb.plan_route(parts, 20000, router_of())[1] == "too_many_breaks"


def test_offas_dyke_missing_stage_is_never_routed():
    parts = [part(0, 40000, step=500), part(229000, 285000, step=500)]
    r = router_of()
    _plan, why, detail = rb.plan_route(parts, 285000, r)
    assert why == "gap_too_long" and not r.calls
    assert detail["max_gap_m"] > 180000


def test_parts_out_of_order_are_refused_not_reordered():
    parts = [part(0, 5000), part(12000, 15000), part(5500, 11500)]
    assert rb.plan_route(parts, 15000, router_of())[1] == "gap_too_long"


def test_unroutable_long_break():
    parts = [part(0, 10000), part(10800, 20000)]
    _plan, why, detail = rb.plan_route(parts, 20000, router_of(fail=True))
    assert why == "unroutable" and detail["failed_gap"]["gap_m"] > 700


def test_snap_too_far():
    parts = [part(0, 10000), part(10800, 20000)]
    assert rb.plan_route(parts, 20000, router_of(snap_off_m=120))[1] == "snap_too_far"


def test_detour():
    parts = [part(0, 10000), part(10800, 20000)]
    assert rb.plan_route(parts, 20000, router_of(factor=3.5))[1] == "detour"


def test_bridge_over_absolute_cap_is_a_detour():
    # 1.9 km break, routed 1.7x = 3.2 km: inside the factor, over MAX_BRIDGE_M.
    parts = [part(0, 30000), part(31900, 60000)]
    assert rb.plan_route(parts, 60000, router_of(factor=1.7))[1] == "detour"


def test_trunk_road_and_ferry_are_forbidden():
    parts = [part(0, 10000), part(10800, 20000)]
    assert rb.plan_route(parts, 20000, router_of(tags="highway=trunk"))[1] == "forbidden_way"
    assert rb.plan_route(parts, 20000, router_of(tags="route=ferry"))[1] == "forbidden_way"


def test_road_walking_is_off_path():
    parts = [part(0, 10000), part(10800, 20000)]
    assert rb.plan_route(parts, 20000, router_of(tags="highway=secondary"))[1] == "off_path"


def test_answer_without_tags_cannot_be_checked():
    parts = [part(0, 10000), part(10800, 20000)]
    assert rb.plan_route(parts, 20000, router_of(with_tags=False))[1] == "no_way_tags"


def test_short_break_falls_back_to_a_straight_connector():
    parts = [part(0, 10000), part(10200, 20000)]
    plan, why, _ = rb.plan_route(parts, 20000, router_of(fail=True))
    assert why is None
    assert plan["bridges"] == 1 and plan["routed"] == 0
    assert plan["bridges"] and plan["straight_m"] == pytest.approx(200, abs=2)


def test_too_much_straight():
    parts = [part(i * 2280, i * 2280 + 2000) for i in range(4)]
    assert rb.plan_route(parts, 9000, router_of(fail=True))[1] == "too_much_straight"


def test_too_much_bridged():
    parts = [part(i * 11800, i * 11800 + 10000, step=250) for i in range(4)]
    assert rb.plan_route(parts, 45000, router_of(factor=1.0))[1] == "too_much_bridged"


def test_bridged_share_on_a_short_walk():
    parts = [part(0, 2000), part(2600, 4000)]
    assert rb.plan_route(parts, 4000, router_of())[1] == "bridged_share"


def test_every_refusal_name_is_declared():
    assert len(set(rb.REFUSALS)) == len(rb.REFUSALS)


# --- the recorded BRouter answer ------------------------------------------

def test_recorded_brouter_answer_parses_and_passes():
    body = (FIX / "brouter_answer.json").read_text(encoding="utf-8")
    got, err = rb.parse_brouter(body)
    assert err is None
    assert got["track_m"] == 640 and got["ascend_m"] == 12
    assert [round(m) for m, _t in got["segments"]] == [420, 160, 60]
    mix = rb.way_mix(got["segments"])
    assert mix["path_m"] == 580 and mix["forbidden_m"] == 0
    a, b = [-9.601, 51.96, 38.0], [-9.5917, 51.96, 49.0]
    assert rb.judge_bridge(a, b, rb.dist_m(a, b), got) is None
    pts = rb.bridge_points(a, b, got["coords"])
    assert [p[2] for p in pts][:2] == [40.0, 45.0]


def test_brouter_plain_text_error():
    got, err = rb.parse_brouter("target island detected for section 0\n")
    assert got is None and err.startswith("target island")


def test_bridge_points_interpolate_missing_elevation():
    a, b = [0.0, LAT, 100.0], [0.01, LAT, 200.0]
    pts = rb.bridge_points(a, b, [[0.0, LAT], [0.005, LAT], [0.01, LAT]])
    assert [round(p[2]) for p in pts] == [100, 150, 200]


# --- the report -----------------------------------------------------------

def test_summary_counts_every_route_once():
    res = [{"id": 1, "country": "IE", "reason": None},
           {"id": 2, "country": "IE", "reason": "gap_too_long"},
           {"id": 3, "country": "GB", "reason": "gap_too_long"},
           {"id": 4, "country": "DE", "reason": "off_path"}]
    s = rb.summarise(res)
    assert s["candidates"] == 4 and s["repaired"] == 1
    assert s["refused"] == {"gap_too_long": 2, "off_path": 1}
    assert s["repaired_by_country"] == {"IE": 1}
    assert sum(s["refused"].values()) + s["repaired"] == s["candidates"]
    json.dumps(s)


# --- T1201: the per-bridge figures survive, and reach the wire ------------

def test_plan_keeps_each_bridge_and_its_climb():
    # T1183-b and T1183-c: `bridges` is the count, so the list rides apart.
    parts = [part(0, 10000), part(10600, 20000), part(21200, 30000)]
    plan, why, _ = rb.plan_route(parts, 30000, router_of(factor=1.3))
    assert why is None and plan["bridges"] == 2
    assert len(plan["bridge_list"]) == 2
    assert all(b["mode"] == "routed" for b in plan["bridge_list"])
    assert plan["bridge_ascend_m"] == sum(b["ascend_m"] for b in plan["bridge_list"])
    assert plan["max_bridge_m"] == max(b["bridge_m"] for b in plan["bridge_list"])


def test_export_ships_routed_bridges():
    import export_wire
    info = {"method": "routed-bridge", "bridges": 2, "bridged_m": 900.0,
            "routed": 1, "max_bridge_m": 600.0,
            "bridge_list": [{"bridge_m": 600.0, "mode": "routed"},
                            {"bridge_m": 300.0, "mode": "straight"}]}
    assert export_wire.bridges_of(info) == {
        "n": 2, "max_m": 600.0, "total_m": 900.0, "routed": 1}
    straight = {"method": "straight-splice", "bridges": 1,
                "max_bridge_m": 40, "total_bridge_m": 40}
    assert export_wire.bridges_of(straight) == {"n": 1, "max_m": 40, "total_m": 40}
    assert export_wire.bridges_of({"method": "routed-bridge", "bridges": 0}) is None


def test_ascent_sync_adds_the_bridge_climb_once():
    import splice
    sql = splice.SYNC_ASCENT_SQL
    assert "'routed-bridge'" in sql and "bridge_ascend_m" in sql
    # the mark that keeps a rerun from adding the climb twice
    assert "? 'bridge_ascend_m'" in sql
