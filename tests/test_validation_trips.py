"""T1195 (ROADMAP D23, Trips): the trips layer on the shared runner.

A two-trip library, a tiny GTFS zip and a fake OSRM on tmp_path: leg
collection (day trips included), fastest direct and one-change times, the
departure window, station and service refusals, the bands, the gaps and the
committed reference.

    python -m pytest tests/test_validation_trips.py -q
"""
from __future__ import annotations

import csv
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_trips as lt
import runner as vr
import trips_timetables as tt

A = {"dest": "AAA", "city": "Aville", "iso2": "XA", "lat": 50.0, "lon": 10.0}
B = {"dest": "BBB", "city": "Btown", "iso2": "XA", "lat": 50.5, "lon": 10.5}
C = {"dest": "CCC", "city": "Cburg", "iso2": "XA", "lat": 51.0, "lon": 11.0}
D = {"dest": "DDD", "city": "Dorf", "iso2": "XA", "lat": 49.0, "lon": 9.0}


def library(tmp_path):
    d = tmp_path / "trips"
    d.mkdir()
    t1 = {"stops": [A, B], "legs": [{"from": "AAA", "to": "BBB", "mode": "train", "km": 60, "minutes": 50}],
          "daytrips": [dict(C, minutes=95, mode="train", km=120)],
          "plan": [{"d": 1, "stop": 0, "daytrip": None}, {"d": 2, "stop": 1, "daytrip": "CCC"}]}
    t2 = {"stops": [A, B, D], "legs": [{"from": "AAA", "to": "BBB", "mode": "train", "km": 60, "minutes": 50},
                                       {"from": "BBB", "to": "DDD", "mode": "car", "km": 150, "minutes": 120}],
          "daytrips": [], "plan": []}
    (d / "t1.json").write_text(json.dumps(t1), encoding="utf-8")
    (d / "t2.json").write_text(json.dumps(t2), encoding="utf-8")
    return d


def gtfs(tmp_path):
    """Trains: A->B direct 40 min (07:00) and 60 min (21:00, outside the
    window); B->C one ride; A->C only by changing at B. D has no stop."""
    files = {
        "routes.txt": "route_id,route_type\nR1,2\nR2,3\n",
        "calendar.txt": ("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                         "WK,1,1,1,1,1,0,0,20260101,20261231\n"),
        "calendar_dates.txt": "service_id,date,exception_type\n",
        "trips.txt": "route_id,service_id,trip_id\nR1,WK,t1\nR1,WK,t2\nR1,WK,t3\nR2,WK,bus1\n",
        "stops.txt": ("stop_id,stop_name,stop_lat,stop_lon,parent_station\n"
                      "SA,A,50.0,10.0,\nSA1,A platform,50.001,10.001,SA\nSB,B,50.5,10.5,\nSC,C,51.0,11.0,\n"),
        "stop_times.txt": ("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                           "t1,07:00:00,07:00:00,SA1,1\nt1,07:40:00,07:42:00,SB,2\n"
                           "t2,21:00:00,21:00:00,SA,1\nt2,22:00:00,22:00:00,SB,2\n"
                           "t3,07:50:00,07:50:00,SB,1\nt3,08:50:00,08:50:00,SC,2\n"
                           "bus1,09:00:00,09:00:00,SA,1\nbus1,10:30:00,10:30:00,SB,2\n"),
    }
    p = tmp_path / "feed.zip"
    with zipfile.ZipFile(p, "w") as z:
        for name, body in files.items():
            z.writestr(name, body)
    return p


def test_collect_legs_dedups_and_takes_day_trips(tmp_path):
    legs = tt.collect_legs(library(tmp_path))
    assert set(legs) == {"AAA>BBB>train", "BBB>CCC>train", "BBB>DDD>car"}
    assert legs["AAA>BBB>train"]["trips"] == 2
    assert legs["BBB>CCC>train"]["kind"] == "daytrip" and legs["BBB>CCC>train"]["minutes"] == 95
    p = tt.write_legs(legs, tmp_path / "legs.csv")
    back = tt.read_legs(p)
    assert back["BBB>DDD>car"]["to_lat"] == 49.0 and back["AAA>BBB>train"]["trips"] == 2


def test_gtfs_direct_change_window_and_refusals(tmp_path):
    legs = tt.collect_legs(library(tmp_path))
    legs["AAA>CCC>train"] = dict(legs["AAA>BBB>train"], id="AAA>CCC>train", to="CCC", to_lat=51.0, to_lon=11.0)
    legs["AAA>DDD>train"] = dict(legs["AAA>BBB>train"], id="AAA>DDD>train", to="DDD", to_lat=49.0, to_lon=9.0)
    legs["CCC>AAA>train"] = dict(legs["AAA>BBB>train"], id="CCC>AAA>train", **{
        "from": "CCC", "to": "AAA", "from_lat": 51.0, "from_lon": 11.0, "to_lat": 50.0, "to_lon": 10.0})
    feed = gtfs(tmp_path)
    rows = tt.gtfs_reference(legs, [(feed, {"XA"})], date(2026, 11, 17), read_on="2026-11-07")
    ab = rows["AAA>BBB>train"]
    assert ab["status"] == "ok" and ab["ref_minutes"] == 40 and ab["changes"] == 0
    assert ab["direct_departures"] == 1          # the 21:00 is outside the window
    ac = rows["AAA>CCC>train"]
    assert ac["status"] == "ok" and ac["ref_minutes"] == 110 and ac["changes"] == 1   # 07:00 to 08:50
    assert rows["AAA>DDD>train"]["status"] == "no_station"
    assert rows["CCC>AAA>train"]["status"] == "no_service"
    assert "BBB>DDD>car" not in rows
    # Saturday: no service at all.
    sat = tt.gtfs_reference(legs, [(feed, {"XA"})], date(2026, 11, 21))
    assert sat["AAA>BBB>train"]["status"] == "no_service"
    # A feed only judges legs inside its countries.
    assert tt.gtfs_reference(legs, [(feed, {"XB"})], date(2026, 11, 17)) == {}


def test_osrm_rows_and_merge(tmp_path):
    legs = tt.collect_legs(library(tmp_path))
    seen = []

    def fake(u):
        seen.append(u)
        return {"code": "Ok", "routes": [{"duration": 7260}]}

    rows = tt.osrm_reference(legs, "http://127.0.0.1:5000/", read_on="2026-11-07", fetch=fake)
    assert list(rows) == ["BBB>DDD>car"] and rows["BBB>DDD>car"]["ref_minutes"] == 121
    assert seen[0].startswith("http://127.0.0.1:5000/route/v1/driving/10.5,50.5;9.0,49.0")
    seed = {"AAA>BBB>train": {"id": "AAA>BBB>train", "source": "seed", "status": "ok", "ref_minutes": 45}}
    merged = tt.merge(seed, rows)
    p = tt.write_reference(merged, tmp_path / "ref.csv")
    back = tt.read_reference(p)
    assert set(back) == {"AAA>BBB>train", "BBB>DDD>car"} and back["AAA>BBB>train"]["source"] == "seed"


def test_bands():
    assert lt.band(100, 100) == "pass"
    assert lt.band(119, 100) == "pass"          # 20 min floor
    assert lt.band(130, 100) == "warn"          # within 45 min
    assert lt.band(150, 100) == "fail"
    assert lt.band(240, 200) == "pass"          # 20% of 200
    assert lt.band(270, 200) == "warn" and lt.band(271, 200) == "fail"


def test_layer_on_the_runner(tmp_path):
    legs = tt.collect_legs(library(tmp_path))
    lp = tt.write_legs(legs, tmp_path / "legs.csv")
    ref = {
        "AAA>BBB>train": {"id": "AAA>BBB>train", "status": "ok", "ref_minutes": "40", "source": "gtfs"},
        "BBB>CCC>train": {"id": "BBB>CCC>train", "status": "no_station", "source": "gtfs"},
        "BBB>DDD>car": {"id": "BBB>DDD>car", "status": "ok", "ref_minutes": "200", "source": "osrm"},
    }
    rp = tt.write_reference(ref, tmp_path / "ref.csv")
    res = vr.run(lt, {"legs": lp, "reference": rp}, now=None)
    m = res["metrics"]
    assert m["coverage"]["value"] == 1.0
    assert m["fact.mode_ok"]["k"] == 1 and m["fact.mode_ok"]["n"] == 2
    assert m["fact.within"]["k"] == 1 and m["fact.within"]["n"] == 2      # 50 vs 40 pass, 120 vs 200 fail
    assert res["carta"]["by_mode"]["car"]["fail"] == 1
    assert res["gaps"][0]["id"] == "BBB>CCC>train"                          # a mode that does not run first
    assert res["gaps"][1]["cause_code"] == "carta_faster"
    assert not res["gate"]["ok"]                                            # hard checks need a baseline


def test_committed_reference_is_well_formed():
    legs = tt.read_legs()
    assert len(legs) > 1000
    with tt.REFERENCE.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    assert rows and set(tt.REF_FIELDS) <= set(rows[0])
    for r in rows:
        assert r["id"] in legs, r["id"]
        assert r["status"] in {"ok", "no_station", "no_service", "no_route", "error"}
        if r["status"] == "ok":
            assert int(r["ref_minutes"]) > 0
    reviews = json.loads((tt.OUT_DIR / "gap_reviews.json").read_text(encoding="utf-8"))
    assert len(reviews["gaps"]) == 30
    assert all(g["verdict"] and g["cause"] and g["correction"] for g in reviews["gaps"] + reviews["other_fails"])
