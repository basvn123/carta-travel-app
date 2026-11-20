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
