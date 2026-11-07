"""T1192 (ROADMAP D23, Lakes and Mountains): both layers on the shared runner, on tiny fixtures.

    python -m pytest tests/test_validation_lakes_mountains.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_lakes as ll
import layer_mountains as lm
import runner as vr


def lake_wire(tmp_path, lakes):
    d = tmp_path / "lw"
    d.mkdir()
    (d / "DE.json").write_text(json.dumps({"country": "DE", "generated_at": "x", "lakes": lakes, "listed": []}))
    return d


def lake(i, name, lat, lon, cls, rule="yes", area=2.0, score=7.0):
    b = {"id": i, "name": name, "cc": "DE", "lat": lat, "lon": lon, "score": score,
         "size": {"areaKm2": area}, "swim": {"rule": rule}}
    if cls:
        b["water"] = {"class": cls, "site": name}
    return b


def site(i, name, lat, lon, q, typ="Lake"):
    return {"bwid": i, "name": name, "iso2": "DE", "type": typ, "lat": lat, "lon": lon, "q": q, "q1": q}


def run_lakes(tmp_path, lakes, sites):
    reg = tmp_path / "reg.json"
    reg.write_text(json.dumps(sites))
    return vr.run(ll, {"reference": reg, "wire": lake_wire(tmp_path, lakes), "national": tmp_path / "none"})


def test_lakes_only_lake_sites_and_match(tmp_path):
    res = run_lakes(tmp_path,
                    [lake("a", "Starnberger See", 47.9, 11.3, "Excellent"),
                     lake("b", "Beetzsee", 52.4, 12.5, "Good"),
                     lake("c", "Poolsee", 50.0, 9.0, "Excellent")],
                    [site("1", "STARNBERGER SEE TUTZING", 47.91, 11.31, "Excellent"),
                     site("2", "BEETZSEE", 52.41, 12.51, "Excellent"),
                     site("3", "POOLSEE", 50.0, 9.0, "Poor"),
                     site("4", "SOME RIVER", 51.0, 10.0, "Excellent", "River"),
                     site("5", "NIRGENDSEE", 53.9, 9.0, "Excellent")])
    m = res["metrics"]
    assert res["reference"]["n"] == 4            # the river site is not a lake
    assert m["coverage"]["k"] == 3 and m["coverage"]["n"] == 4
    assert m["fact.class"]["k"] == 1 and m["fact.class"]["n"] == 3   # Beetzsee and Poolsee differ
    assert m["fact.poor"]["value"] == 0.0        # Poor site, Carta says swim yes
    assert {g["status"] for g in res["gaps"]} == {"missing", "wrong"}


def test_lake_banned_but_designated_clean(tmp_path):
    res = run_lakes(tmp_path, [lake("a", "Klarsee", 50.0, 9.0, "Excellent", rule="no")],
                    [site("1", "KLARSEE", 50.0, 9.0, "Excellent")])
    assert res["metrics"]["fact.swim"]["value"] == 0.0
    assert res["gaps"][0]["cause"] == "swim_banned_on_clean_designated_lake"


def test_lake_big_lake_shore_site(tmp_path):
    res = run_lakes(tmp_path, [lake("a", "Lake Balaton", 46.85, 17.72, "Good", area=592)],
                    [site("1", "BALATON ALMADI", 47.01, 18.0, "Good")])
    assert res["metrics"]["coverage"]["value"] == 1.0


def mt_wire(tmp_path, rows):
    d = tmp_path / "mw"
    d.mkdir()
    (d / "SE.json").write_text(json.dumps({"country": "SE", "generated_at": "x", "mountains": rows, "listed": []}))
    return d


def run_mountains(tmp_path, rows, csv_text):
    ref = tmp_path / "ref"
    ref.mkdir()
    (ref / "t.csv").write_text(csv_text, encoding="utf-8")
    return vr.run(lm, {"reference_dir": ref, "wire": mt_wire(tmp_path, rows)})


def test_mountains_height_position_route_and_gaps(tmp_path):
    rows = [{"id": "se-k", "name": "Kebnekaise", "cc": "SE", "lat": 67.883, "lon": 18.55, "ele": 2097, "prom": 1000,
             "score": 8.0, "routes": [{"id": 1}]},
            {"id": "se-s", "name": "Sarektjakko", "cc": "SE", "lat": 67.4, "lon": 17.7, "ele": 1900, "score": 7.0}]
    csv_text = ("id,name,lat,lon,cc,ele,prom,route,source\n"
                "Q1,Kebnekaise,67.9026,18.5136,SE,2097,1000,1,t\n"
                "Q2,Sarektjakko,67.4,17.7,SE,2089,,1,t\n"
                "Q3,Ghostberg,66.0,17.0,SE,1500,,,t\n")
    res = run_mountains(tmp_path, rows, csv_text)
    m = res["metrics"]
    assert m["coverage"]["k"] == 2 and m["coverage"]["n"] == 3
    assert m["fact.position"]["k"] == 1 and m["fact.position"]["n"] == 2   # Kebnekaise sits 3 km off
    assert m["fact.height"]["k"] == 1 and m["fact.height"]["n"] == 2       # 1900 against 2089
    assert m["fact.route"]["k"] == 1 and m["fact.route"]["n"] == 2
    causes = {g["name"]: g["cause"] for g in res["gaps"]}
    assert causes["Ghostberg"] == "not_published_or_name_differs"
    assert causes["Kebnekaise"] == "carta_coordinate_off_summit"


def test_committed_seed_runs():
    res = vr.run(lm, {})
    assert res["reference"]["n"] >= 20 and res["metrics"]["coverage"]["value"] >= 0.9
    assert not any(c["kind"] == "hard" for c in res["checks"]), "seed has no baseline: no hard check yet"


def test_both_registered():
    assert "lakes" in vr.LAYERS and "mountains" in vr.LAYERS
