"""T1193 (ROADMAP D23, Cycling): the cycling layer on the shared runner, on a tmp wire and reference."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_cycling as lc
import runner as vr


def route(i, cc, name, ref, km, line, net="icn", rated=False):
    r = {"id": i, "cc": cc, "name": name, "ref": ref, "net": net, "km": km,
         "geometry": {"type": "MultiLineString", "coordinates": [line]}}
    if rated:
        r["score"] = 7.0
    return r


def setup(tmp_path, wire_rows, ev_csv, country_csv=None, geom=None):
    w = tmp_path / "wire"
    w.mkdir()
    by = {}
    for r in wire_rows:
        by.setdefault(r["cc"], []).append(r)
    for cc, rs in by.items():
        (w / f"{cc}.json").write_text(json.dumps({"country": cc, "generated_at": "2026-10-23", "routes": [],
                                                   "listed": rs}), encoding="utf-8")
    d = tmp_path / "ref"
    (d / "geom").mkdir(parents=True)
    (d / "eurovelo.csv").write_text(ev_csv, encoding="utf-8")
    if country_csv:
        (d / "eurovelo_countries.csv").write_text(country_csv, encoding="utf-8")
    for name, coords in (geom or {}).items():
        (d / "geom" / name).write_text(json.dumps({"type": "LineString", "coordinates": coords}), encoding="utf-8")
    return {"wire": w, "reference_dir": d}


LINE = [[14.0, 48.0], [14.05, 48.0], [14.1, 48.0]]
EV = "ev,name,total_km,countries,verified\nEV6,Rivers,3650,AT;HU,yes\nEV9,Amber,1930,AT,yes\n"


def test_ev_number():
    assert lc.ev_number({"ref": "EV 13", "name": ""}) == 13
    assert lc.ev_number({"ref": "", "name": "Eurovelo 9 (proponowana)"}) == 9
    assert lc.ev_number({"ref": "R10", "name": "Radweg"}) is None


def test_coverage_length_and_gaps(tmp_path):
    ctx = setup(tmp_path, [route(1, "AT", "EuroVelo 6, part Austria", "EV6", 190.0, LINE)], EV,
                "ev,cc,km\nEV6,AT,200\nEV6,HU,300\nEV9,AT,100\n")
    res = vr.run(lc, ctx, share=1.0)
    m = res["metrics"]
    assert m["coverage"]["k"] == 1 and m["coverage"]["n"] == 3
    assert m["fact.length"]["value"] == 1.0
    ids = {g["id"]: g for g in res["gaps"]}
    assert ids["EV6:HU"]["status"] == "missing" and ids["EV9:AT"]["status"] == "missing"
    assert all(c["kind"] == "soft" for c in res["checks"])
    assert res["reference"]["source"].endswith("(verified)")


def test_too_short_and_fragments(tmp_path):
    rows = [route(i, "AT", "EV6 piece", "EV6", 2.0, LINE) for i in range(14)]
    ctx = setup(tmp_path, rows, EV, "ev,cc,km\nEV6,AT,200\n")
    res = vr.run(lc, ctx, share=1.0)
    r = next(x for x in res["results"] if x["id"] == "EV6:AT")
    assert r["facts"]["length"] is False and r["flags"]["nonfrag"] is False


def test_geometry_agreement(tmp_path):
    near = [[14.0, 48.0008], [14.1, 48.0008]]       # about 90 m off
    far = [[14.0, 48.05], [14.1, 48.05]]            # about 5.5 km off
    ctx = setup(tmp_path, [route(1, "AT", "EV6", "EV6", 50.0, LINE)], EV, None,
                {"EV6-AT.geojson": near})
    res = vr.run(lc, ctx, share=1.0)
    assert next(x for x in res["results"] if x["id"] == "EV6:AT")["facts"]["geometry"] is True
    ctx = setup(tmp_path / "b", [route(1, "AT", "EV6", "EV6", 50.0, LINE)], EV, None,
                {"EV6-AT.geojson": far}) if (tmp_path / "b").mkdir() is None else None
    res = vr.run(lc, ctx, share=1.0)
    assert next(x for x in res["results"] if x["id"] == "EV6:AT")["facts"]["geometry"] is False


def test_national_by_ref(tmp_path):
    ctx = setup(tmp_path, [route(5, "DE", "D-Route 3", "D3", 300.0, LINE, net="ncn")], EV)
    (ctx["reference_dir"] / "national.csv").write_text("id,name,cc,ref,net,km\nD3,Mittellandroute,DE,D3,ncn,300\n",
                                                       encoding="utf-8")
    res = vr.run(lc, ctx, share=1.0)
    r = next(x for x in res["results"] if x["id"] == "nat:D3")
    assert r["flags"]["matched"] and r["facts"]["length"] is True


def test_shipped_wire_runs():
    if not (lc.WIRE_DIR / "AT.json").exists():
        return
    res = vr.run(lc, {}, share=1.0)
    assert res["reference"]["n"] > 50 and res["metrics"]["coverage"]["n"] > 50
