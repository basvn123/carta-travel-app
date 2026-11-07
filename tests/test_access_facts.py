"""D21 accessibility facts: OSM wheelchair tags -> the destinfo `access` row.

Fixture elements only (Overpass is not reachable from CI). Run from the repo
root: pytest tests/test_access_facts.py -q
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))

import harvest_access as H  # noqa: E402
import export_destinfo as E  # noqa: E402

BATCH = [("a", 50.0, 4.0), ("b", 51.0, 5.0)]


def node(lat, lon, **tags):
    return {"type": "node", "lat": lat, "lon": lon, "tags": tags}


def test_classify_drops_untagged_and_free_text():
    assert H.classify({"railway": "station"})[0] is None
    assert H.classify({"railway": "station", "wheelchair": "maybe"})[0] is None
    assert H.classify({"railway": "station", "wheelchair": "Yes"})[:2] == ("station", "yes")
    assert H.classify({"amenity": "toilets", "wheelchair": "yes"})[0] == "toilets"
    assert H.classify({"shop": "bakery", "toilets:wheelchair": "yes"})[0] == "toilets_at"
    assert H.classify({"tourism": "museum"})[0] is None


def test_assign_goes_to_nearest_centre_and_respects_radius():
    els = [
        node(50.001, 4.0, railway="station", wheelchair="yes", name="Centraal"),
        node(51.001, 5.0, amenity="toilets", wheelchair="yes"),
        node(50.02, 4.0, amenity="toilets", wheelchair="yes"),   # ~2.2 km: out for toilets
        node(50.0, 4.0, tourism="museum"),                       # untagged: dropped
    ]
    per = H.assign(els, BATCH)
    assert [f["kind"] for f in per["a"]] == ["station"]
    assert per["a"][0]["name"] == "Centraal"
    assert [f["kind"] for f in per["b"]] == ["toilets"]


def test_pick_access_none_when_nothing_tagged():
    assert E.pick_access([], "2026-11-07T00:00:00Z") is None
    assert E.pick_access([{"kind": "toilets", "wc": "no", "dist_m": 10}], "2026-11-07") is None


def test_pick_access_row_keeps_source_and_date():
    feats = [
        {"kind": "station", "wc": "limited", "dist_m": 900, "name": "Far"},
        {"kind": "station", "wc": "yes", "dist_m": 300, "name": "Near"},
        {"kind": "toilets", "wc": "yes", "dist_m": 400},
        {"kind": "toilets_at", "wc": None, "tw": "yes", "dist_m": 200},
        {"kind": "place", "wc": "yes", "dist_m": 100, "name": "Museum A"},
        {"kind": "place", "wc": "limited", "dist_m": 150, "name": "Museum B"},
        {"kind": "place", "wc": "no", "dist_m": 160, "name": "Tower"},
    ]
    r = E.pick_access(feats, "2026-11-07T10:00:00Z")
    assert r["station"] == {"wc": "yes", "m": 300, "name": "Near"}
    assert r["toilets"] == {"n": 2, "m": 200}
    assert r["places"] == {"yes": 1, "limited": 1, "no": 1, "named": ["Museum A"]}
    assert r["_src"] == "openstreetmap" and r["_asof"] == "2026-11-07"
