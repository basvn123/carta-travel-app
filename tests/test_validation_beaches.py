"""T1189 (ROADMAP D23, Beaches): the beaches layer on the shared runner.

A tiny wire and register on tmp_path: coverage, name and place matching,
class agreement, the Poor swim flag, the stale-season note, the inland flag,
gaps, and the Blue Flag loader. The last test runs the committed sample.

    python -m pytest tests/test_validation_beaches.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import layer_beaches as lb
import layer_beaches_blueflag as bf
import runner as vr


def beach(i, name, lat, lon, cls, inland=False, rated=True, score=7.0):
    b = {"id": i, "name": name, "cc": "ES", "lat": lat, "lon": lon, "score": score,
         "src": ["osm"], "inland": inland}
    if cls:
        b["water"] = {"class": cls, "site": name}
    return b, rated


def wire(tmp_path, items):
    d = tmp_path / "wire"
    d.mkdir()
    rated = [b for b, r in items if r]
    listed = [b for b, r in items if not r]
    (d / "ES.json").write_text(json.dumps({"country": "ES", "generated_at": "2026-10-29",
                                           "beaches": rated, "listed": listed}), encoding="utf-8")
    return d


def site(bwid, name, lat, lon, q, q1=None, typ="Coastal", iso="ES"):
    return {"bwid": bwid, "name": name, "iso2": iso, "type": typ, "lat": lat, "lon": lon, "q": q, "q1": q1}


def run_layer(tmp_path, items, sites, **ctx):
    reg = tmp_path / "reg.json"
    reg.write_text(json.dumps(sites), encoding="utf-8")
    ctx = {"reference": reg, "wire": wire(tmp_path, items), **ctx}
    return vr.run(lb, ctx, share=1.0, now=None), ctx


def test_names_and_aliases():
    assert lb.names_agree("PLAYA DE LA CONCHA PM1", "La Concha")
    assert not lb.names_agree("Playa Norte", "Cala Sur")
    assert lb.iso2("EL") == "GR" and lb.iso2("UK") == "GB"


def test_cyrillic_register_names_are_transliterated():
    """T1216 (T1189-g): BG names in Cyrillic pass the name test."""
    assert lb.tokens("ШКОРПИЛОВЦИ-ЦЕНТРАЛЕН ПЛАЖ") == {"shkorpilovtsi", "tsentralen"}
    assert lb.names_agree("ШКОРПИЛОВЦИ-ЦЕНТРАЛЕН ПЛАЖ", "Shkorpilovtsi Beach")
    assert lb.tokens("Слънчев бряг") == {"slanchev", "bryag"}
    assert not lb.names_agree("Слънчев бряг", "Golden Sands")


def test_gaps_only_keeps_metrics_and_drops_other_items():
    res = {"gaps": [{"id": "b"}], "results": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
           "metrics": {"coverage": {"value": 0.5}}}
    vr.keep_gap_results(res)
    assert [r["id"] for r in res["results"]] == ["b"]
    assert res["results_dropped"] == 2 and res["metrics"]["coverage"]["value"] == 0.5


def test_match_flags_facts_and_gaps(tmp_path):
    items = [
        beach("a", "Playa Uno", 40.0, 3.0, "Excellent"),
        beach("b", "Playa Dos", 41.0, 3.0, "Excellent"),            # register says Poor
        beach("c", "Playa Tres", 42.0, 3.0, "Good"),               # register moved this season
        beach("d", "Lago Azul", 43.0, 3.0, "Excellent", inland=False),  # register says Lake
    ]
    sites = [
        site("S1", "PLAYA UNO PM1", 40.001, 3.001, "Excellent"),
        site("S2", "PLAYA DOS", 41.0, 3.0, "Poor"),
        site("S3", "PLAYA TRES", 42.0, 3.0, "Excellent", q1="Good"),
        site("S4", "LAGO AZUL", 43.0, 3.0, "Excellent", typ="Lake"),
        site("S5", "CALA PERDIDA", 38.0, 2.0, "Excellent"),         # nothing near
        site("S6", "PUNTO", 40.002, 3.0, "Excellent"),              # near Uno, name differs, 0.22 km
    ]
    res, _ctx = run_layer(tmp_path, items, sites, inland=True)
    m = res["metrics"]
    assert m["coverage"]["k"] == 4 and m["coverage"]["n"] == 6
    assert m["near"]["k"] == 5
    assert m["fact.class"]["k"] == 2 and m["fact.class"]["n"] == 4
    assert m["fact.poor"]["value"] == 0.0 and m["fact.poor"]["n"] == 1
    assert m["fact.water"]["k"] == 3 and m["fact.water"]["n"] == 4   # the lake beach is not inland on the wire
    by = {r["id"]: r for r in res["results"]}
    assert by["S3"]["note"] == "stale_one_season"
    top = res["gaps"][0]
    assert top["id"] == "S5" and top["status"] == "missing" and top["cause"] == "not_published_cap_or_gate"
    assert {g["cause"] for g in res["gaps"]} >= {"nearest_site_class_joined", "register_moved_one_season"}


def test_inland_sites_left_out_by_default(tmp_path):
    items = [beach("a", "Playa Uno", 40.0, 3.0, "Excellent")]
    sites = [site("S1", "PLAYA UNO", 40.0, 3.0, "Excellent"), site("S2", "LAGO", 43, 3, "Good", typ="Lake")]
    res, _ = run_layer(tmp_path, items, sites)
    assert res["reference"]["n"] == 1


def test_unfetched_lfs_pointer_falls_back_to_the_sample(tmp_path):
    ptr = tmp_path / "ptr.json"
    ptr.write_text("version https://git-lfs.github.com/spec/v1\n", encoding="utf-8")
    ctx = {"reference": ptr}
    assert len(lb.references(ctx)) > 100 and ctx["_ref_path"] == lb.SAMPLE


def test_blueflag_csv(tmp_path):
    csv_path = tmp_path / "bf.csv"
    csv_path.write_text("id,name,lat,lon,cc\nQ1,Playa Uno,40.0,3.0,ES\nQ2,Nowhere,10.0,10.0,ES\nbad,x,,,ES\n",
                        encoding="utf-8")
    ctx = {"reference": csv_path, "wire": wire(tmp_path, [beach("a", "Playa Uno", 40.0, 3.0, "Excellent")])}
    res = vr.run(bf, ctx)
    assert res["metrics"]["coverage"]["k"] == 1 and res["metrics"]["coverage"]["n"] == 2
    assert bf.references({"reference": tmp_path / "missing.csv"}) == []


def test_committed_sample_runs_on_the_shipped_wire():
    if not lb.WIRE_DIR.exists():
        return
    res = vr.run(lb, {"reference": lb.SAMPLE})
    assert res["sample"]["n"] > 200 and res["metrics"]["coverage"]["n"] == res["sample"]["n"]
    assert res["metrics"]["fact.class"]["value"] > 0.9
