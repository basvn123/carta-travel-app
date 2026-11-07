"""Fixture tests for the lake water and mountain route up fill steps (T1186)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


fw = _load("fill_water", "pipeline/lakes/fill_water.py")
fr = _load("fill_route_up", "pipeline/mountains/fill_route_up.py")


def _lake(i, name, swim="unknown", water=None):
    r = {"id": i, "name": name, "lat": 47.0, "lon": 11.0, "swim": {"rule": swim}}
    if water:
        r["water"] = water
    return r


def _wire(tmp_path, key, rows):
    (tmp_path / "AT.json").write_text(json.dumps({key: rows, "listed": []}))
    return tmp_path


def test_water_second_pass_needs_a_shared_name_word(tmp_path):
    wire = _wire(tmp_path, "lakes", [_lake("a", "Lake Weissensee"), _lake("b", "Other")])
    eea = [{"name": "Weissensee Nord", "lat": 47.03, "lon": 11.0, "q": "Excellent",
            "type": "Lake"}]
    fills, st = fw.fill(wire, eea, [], {}, asof="2026-11-07")
    assert fills["a"]["water"]["class"] == "Excellent"
    assert fills["a"]["water"]["_src"] == "eea" and fills["a"]["water"]["_asof"]
    assert fills["a"]["swim"]["rule"] == "yes"
    assert "b" not in fills
    assert st["water_before"] == 0 and st["water_after"] == 1
    assert st["unknown_after"] == 1


def test_poor_class_is_limited_and_a_ban_wins(tmp_path):
    wire = _wire(tmp_path, "lakes", [_lake("a", "Seeblick"), _lake("b", "Seeblick Ost")])
    eea = [{"name": "Seeblick", "lat": 47.0, "lon": 11.0, "q": "Poor", "type": "Lake"}]
    fills, _ = fw.fill(wire, eea, [], {"b": {"ban": 1, "place": 2}})
    assert fills["a"]["swim"]["rule"] == "limited"
    assert fills["b"]["swim"]["rule"] == "no"


def test_existing_verdict_never_changes(tmp_path):
    wire = _wire(tmp_path, "lakes", [_lake("a", "Seeblick", swim="no")])
    fills, _ = fw.fill(wire, [{"name": "Seeblick", "lat": 47.0, "lon": 11.0,
                               "q": "Excellent"}], [], {})
    assert "swim" not in fills.get("a", {})


def test_apply_patches_only_unknown(tmp_path):
    wire = _wire(tmp_path, "lakes", [_lake("a", "Seeblick")])
    fills, _ = fw.fill(wire, [{"name": "Seeblick", "lat": 47.0, "lon": 11.0,
                               "q": "Good"}], [], {})
    fw.apply(fills, wire)
    row = json.loads((wire / "AT.json").read_text())["lakes"][0]
    assert row["water"]["class"] == "Good" and row["swim"]["rule"] == "yes"
    assert row["swim"]["src"] == "eea"


def test_tag_classifier_and_national_classes(tmp_path):
    els = [{"tags": {"swimming": "no"}}, {"tags": {"leisure": "swimming_area"}}]
    assert fw.classify_swim_tags(els) == {"ban": 1, "place": 1}
    (tmp_path / "DE.csv").write_text("name,lat,lon,class\nSee,47.0,11.0,Ausgezeichnet\n")
    assert fw.load_national(tmp_path)[0]["q"] == "Excellent"


def _way(i, hw, pts, **tags):
    return {"id": i, "tags": {"highway": hw, **tags},
            "geometry": [{"lat": a, "lon": b} for a, b in pts]}


def test_route_up_kinds():
    path = _way(1, "path", [(47.0005, 11.0), (47.002, 11.0)], sac_scale="alpine_hiking",
                name="Gipfelweg")
    b = fr.route_up(47.0, 11.0, [path], asof="2026-11-07")
    assert b["kind"] == "path" and b["sac"] == "alpine_hiking" and b["names"] == ["Gipfelweg"]
    assert b["_src"] == "osm" and b["_asof"] == "2026-11-07"
    assert fr.route_up(47.0, 11.0, [path], hiking_ids={1})["kind"] == "marked"
    track = _way(2, "track", [(47.001, 11.0), (47.002, 11.0)])
    assert fr.route_up(47.0, 11.0, [track])["kind"] == "track"
    far = _way(3, "path", [(47.02, 11.0), (47.03, 11.0)])
    assert fr.route_up(47.0, 11.0, [far])["kind"] == "none"
    assert fr.route_up(47.0, 11.0, [])["ways"] == 0


def test_route_up_fill_and_apply(tmp_path):
    rows = [{"id": "m1", "lat": 47.0, "lon": 11.0},
            {"id": "m2", "lat": 47.0, "lon": 11.0, "routes": [{"id": 1}]}]
    (tmp_path / "AT.json").write_text(json.dumps({"mountains": rows, "listed": []}))
    ways = {"m1": [_way(1, "path", [(47.0005, 11.0), (47.002, 11.0)])]}
    fills, st = fr.fill(tmp_path, ways, asof="2026-11-07")
    assert st["with_route_before"] == 1 and st["with_route_after"] == 2
    assert fr.apply(fills, tmp_path) == 1
    out = json.loads((tmp_path / "AT.json").read_text())["mountains"]
    assert out[0]["routeUp"]["kind"] == "path" and "routeUp" not in out[1]
