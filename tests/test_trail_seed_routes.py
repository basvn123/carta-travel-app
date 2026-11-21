"""D24 famous coverage: the gates a routed seed walk must pass.

Canned BRouter answers, no network: a seed is kept only when it is on
paths, snaps to its points, has a sane length and does not double back."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import seed_routes as sr  # noqa: E402

A = (7.000, 46.000)
B = (7.000, 46.040)          # about 4.4 km north


def line(a, b, n=40):
    return [[a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 0]
            for i in range(n + 1)]


def leg(a, b, highway="path", ferry=False):
    coords = line(a, b)
    m = sr.dist_m(a, b)
    tags = {"route": "ferry"} if ferry else {"highway": highway}
    return {"coords": coords, "segments": [(m, tags)], "track_m": m,
            "ascend_m": 300}


def ref(**kw):
    r = {"qid": "Q1", "name": "Test Walk", "countries": ["CH"],
         "start": "Q2", "end": "Q3", "lat": None, "lon": None,
         "length_km": None}
    r.update(kw)
    return r


def test_good_path_walk_is_kept():
    assert sr.judge(ref(), [A, B], [leg(A, B)]) is None


def test_road_walk_is_off_path():
    assert sr.judge(ref(), [A, B], [leg(A, B, "secondary")]) == "off_path"


def test_residential_only_is_off_path():
    # path-like for a bridge, but no real trail ways at all
    assert sr.judge(ref(), [A, B], [leg(A, B, "residential")]) == "off_path"


def test_ferry_is_forbidden():
    assert sr.judge(ref(), [A, B], [leg(A, B, ferry=True)]) == "forbidden_way"


def test_far_snap_is_refused():
    far = (7.010, 46.000)    # BRouter started 760 m away from the point
    assert sr.judge(ref(), [A, B], [leg(far, B)]) == "snap"


def test_length_against_wikidata():
    assert sr.judge(ref(length_km=12), [A, B], [leg(A, B)]) == "length"
    assert sr.judge(ref(length_km=4.5), [A, B], [leg(A, B)]) is None


def test_too_short_is_refused():
    near = (7.000, 46.010)   # 1.1 km
    assert sr.judge(ref(), [A, near], [leg(A, near)]) == "length"


def test_doubling_back_is_refused_for_a_to_b():
    out = line(A, B)
    back = list(reversed(out))[1:]
    back = back[:-9]          # back down to 1 km short of the start
    coords = out + back
    m = sum(sr.dist_m(a, b) for a, b in zip(coords, coords[1:]))
    end = tuple(coords[-1][:2])
    bad = {"coords": coords, "segments": [(m, {"highway": "path"})],
           "track_m": m, "ascend_m": 0}
    # ends 1 km apart: an A-to-B walk that went out and came most of the way back
    assert sr.judge(ref(), [A, end], [bad]) in ("retrace", "detour")


def test_plan_needs_start_and_end():
    assert sr.plan_points(ref(start=None), {})[1] == "no_start_end"
    assert sr.plan_points(ref(), {"Q2": A})[1] == "start_end_unlocated"
    pts, why = sr.plan_points(ref(lat=46.02, lon=7.03), {"Q2": A, "Q3": B})
    assert why is None and len(pts) == 3      # via the named place


def test_unroutable_and_brouter_down():
    def none_router(a, b):
        return None, "no route"

    def down_router(a, b):
        raise SystemExit("brouter unreachable")
    places = {"Q2": A, "Q3": B}
    assert sr.route_ref(ref(), places, none_router)["gate"] == "unroutable"
    assert sr.route_ref(ref(), places, down_router)["gate"] == "brouter_down"


# ---------------------------------------------------------------------------
# D25 a: trailhead and landmark (plan 2)
# ---------------------------------------------------------------------------

T = (7.01, 46.01)            # a D24 trailhead, two decimals
L = (7.01, 46.037)           # the summit, about 3.0 km north
EAST = (7.022, 46.0235)      # a different way down, about 0.9 km east


def path(*pts, highway="path"):
    coords = []
    for a, b in zip(pts, pts[1:]):
        seg = line(a, b)
        coords += seg if not coords else seg[1:]
    m = sum(sr.dist_m(a, b) for a, b in zip(coords, coords[1:]))
    return {"coords": coords, "segments": [(m, {"highway": highway})],
            "track_m": m, "ascend_m": 600}


def walk(**kw):
    r = {"id": "wd:Q9", "qid": "Q9", "name": "Pen y Fan from Pont ar Daf",
         "countries": ["GB"], "length_km": 6, "trail_kind": "day",
         "trailhead": {"lat": T[1], "lon": T[0]}}
    r.update(kw)
    return r


MARK = {"point": L, "qid": "Q10", "by": "label", "label": "Pen y Fan"}


def canned(start=T, end=L, back=None, highway="path"):
    """A BRouter stand-in: the way up from `start`, BRouter's best way down
    retraces it, and alternative 1 is `back` (a list of points) if given."""
    def router(a, b, alt=0):
        if sr.dist_m(a, T) < 1:            # going up
            return path(start, end, highway=highway), None
        if alt == 0:
            return path(end, start, highway=highway), None
        if alt == 1 and back:
            return path(*back, highway=highway), None
        return None, "no alternative"
    return router


def test_landmark_spans_lead_then_contained():
    spans = sr.landmark_spans("Pen y Fan from Pont ar Daf")
    assert spans.index("Pen y Fan") < spans.index("Pont ar Daf")
    assert "from Pont" not in spans and "Pen y Fan from" not in spans
    assert sr.landmark_spans("Tre Cime di Lavaredo circuit")[0] == \
        "Tre Cime di Lavaredo"
    # a bare landform noun names no place
    assert "Hill" not in sr.landmark_spans("Diamond Hill")
    assert "Seceda" in sr.landmark_spans("Seceda ridge")


def test_pick_landmark_by_label_within_reach():
    hits = {"Pont ar Daf": [["Q11", 3, (T[1] + 0.001, T[0]), ["GB"]]],
            "Pen y Fan": [["Q12", 40, (46.41, 7.01), ["GB"]],   # 44 km away
                          ["Q10", 30, (L[1], L[0]), ["GB"]]]}
    got = sr.pick_landmark(walk(qid=None), None, hits)
    assert got["qid"] == "Q10" and got["by"] == "label"
    # only the trailhead's own village matches: no landmark
    assert sr.pick_landmark(walk(qid=None), None,
                            {"Pont ar Daf": hits["Pont ar Daf"]}) is None


def test_pick_landmark_prefers_the_walks_own_coordinate():
    got = sr.pick_landmark(walk(), L, {})
    assert got["by"] == "own" and got["qid"] == "Q9"
    # an own coordinate on the trailhead is not a landmark
    assert sr.pick_landmark(walk(), T, {}) is None


def test_trailhead_snap_follows_its_rounding():
    assert 600 < sr.snap_radius_m((-3.43, 51.88)) < 700
    assert sr.snap_radius_m((-3.43712, 51.88412)) == sr.SNAP_M
    # 46.60 reads 46.6 in JSON: the other axis gives the precision
    assert sr.snap_radius_m((11.72, 46.6)) < 700
    assert sr.snap_radius_m((7.6, 46.5)) == sr.TRAILHEAD_SNAP_MAX_M


def test_out_and_back_is_kept_from_a_rounded_trailhead():
    assert 600 < sr.snap_radius_m(T) < 700
    near = (7.014, 46.010)   # BRouter starts 310 m from the rounded point
    res = sr.route_ref(walk(), {}, canned(start=near), MARK)
    assert res["verdict"] == "kept", res.get("gate")
    assert res["plan"] == "trailhead" and res["shape"] == "out_and_back"
    assert len(res["points"]) == 3 and res["points"][0] == res["points"][2]


def test_out_and_back_length_has_35_percent():
    # about 6.0 km routed
    assert sr.route_ref(walk(length_km=9), {}, canned(), MARK)["verdict"] \
        == "kept"
    res = sr.route_ref(walk(length_km=10), {}, canned(), MARK)
    assert (res["verdict"], res["gate"]) == ("refused", "length")


def test_landmark_keeps_the_tight_snap():
    short = (7.01, 46.0345)  # the way up stops 280 m below the summit
    res = sr.route_ref(walk(), {}, canned(end=short), MARK)
    assert (res["verdict"], res["gate"]) == ("refused", "snap")


def test_trailhead_plan_keeps_the_path_gate():
    res = sr.route_ref(walk(), {}, canned(highway="secondary"), MARK)
    assert (res["verdict"], res["gate"]) == ("refused", "off_path")


def test_circuit_comes_back_another_way_when_brouter_offers_one():
    w = walk(name="Tre Cime di Lavaredo circuit", length_km=7)
    res = sr.route_ref(w, {}, canned(back=[L, EAST, T]), MARK)
    assert res["verdict"] == "kept", res.get("gate")
    assert res["shape"] == "loop"
    # no alternative: out and back
    res = sr.route_ref(w, {}, canned(), MARK)
    assert res["shape"] == "out_and_back"
    # a walk not called a circuit never asks for one
    res = sr.route_ref(walk(length_km=7), {}, canned(back=[L, EAST, T]), MARK)
    assert res["shape"] == "out_and_back"


def test_circuit_alternative_that_retraces_is_not_a_loop():
    w = walk(name="Tre Cime di Lavaredo circuit")
    res = sr.route_ref(w, {}, canned(back=[L, T]), MARK)
    assert res["shape"] == "out_and_back"


def test_trailhead_plan_skips():
    r = sr.route_ref(walk(), {}, canned(), None)
    assert (r["verdict"], r["gate"]) == ("skipped", "no_landmark")
    r = sr.route_ref(walk(length_km=66, trail_kind="multi-day"), {},
                     canned(), MARK)
    assert (r["verdict"], r["gate"]) == ("skipped", "not_a_day_walk")
    r = sr.route_ref(walk(trailhead=None), {}, canned(), MARK)
    assert (r["verdict"], r["gate"]) == ("skipped", "no_start_end")


def test_start_and_end_plan_still_comes_first():
    places = {"Q2": A, "Q3": B}
    w = walk(start="Q2", end="Q3", length_km=None)
    res = sr.route_ref(w, places, lambda a, b: (leg(a, b), None), MARK)
    assert res["plan"] == "start_end" and res["verdict"] == "kept"


def test_seed_without_a_qid_keys_on_its_reference_id():
    r = {"id": "ref:hoellentalklamm", "qid": None, "name": "Höllentalklamm",
         "points": [], "plan": "trailhead", "shape": "out_and_back"}
    assert sr.source_ref_of(r) == "ref:hoellentalklamm"
    assert "wikidata" not in sr.raw_tags_of(r)
    assert sr.raw_tags_of(dict(r, qid="Q9"))["wikidata"] == "Q9"
