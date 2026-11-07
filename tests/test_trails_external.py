"""T1181 (ROADMAP D23, D24): the trails external check and its gate.

A tiny wire (two country files, three detail files), a tiny registry and
coverage report and a three-trail reference list, written to tmp_path. The
last test runs the real check on the shipped wire and the committed
reference list, and is skipped where the wire is absent.

    python -m pytest tests/test_trails_external.py -q
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "validation"))

import trails_external as te  # noqa: E402


def line(lat, lon, lat2, lon2):
    return {"type": "MultiLineString",
            "coordinates": [[[lon, lat], [lon2, lat2]]]}


def row(i, name, cc, band, score, geom, **extra):
    r = {"id": i, "name": name, "category": "hike", "country": cc,
         "distance_m": 10000, "geometry": geom, "osm": extra.pop("osm", None),
         "v5": {"band": band, "score": score} if score is not None else None}
    r.update(extra)
    return r


@pytest.fixture
def world(tmp_path):
    wire = tmp_path / "trails"
    (wire / "trip").mkdir(parents=True)
    gb = [
        row(1, "West Highland Way (Drymen to Rowardennan)", "GB", "excellent", 8.7,
            line(56.06, -4.45, 56.12, -4.60), h={"of": "West Highland Way"}),
        row(2, "Liaison to the West Highland Way", "GB", "pleasant", 6.2,
            line(56.0, -4.4, 56.01, -4.41)),
        row(3, "Ben Nevis Mountain Track", "GB", "very_good", 7.9,
            line(56.80, -5.07, 56.79, -5.00), osm=777),
    ]
    gr = [row(4, "Φαράγγι Σαμαριάς", "GR", None, 5.5, line(35.30, 23.96, 35.23, 23.97))]
    (wire / "GB.json").write_text(json.dumps({"generated_at": "2026-09-13", "trips": gb}), encoding="utf-8")
    (wire / "GR.json").write_text(json.dumps({"generated_at": "2026-09-13", "trips": gr}), encoding="utf-8")
    (wire / "trip" / "3.json").write_text(json.dumps({"tags_raw": {"wikidata": "Q1"},
                                                      "rating_parts": {"relief": 0.9, "photos": 0.2, "shape": 0.3}}), encoding="utf-8")
    reg = {"rows": [
        {"id": "gb-ben-nevis", "name": "Ben Nevis Mountain Track", "country": "GB",
         "evidence": {"osm": {"relation_id": 777}, "wikidata": "Q1",
                      "wikipedia": {"pageviews_avg": 100}}, "fame_score": 0.8},
        {"id": "pl-orla-perc", "name": "Orla Perc", "country": "PL",
         "evidence": {"osm": None}, "fame_score": 0.7},
    ]}
    cov = {"rows": [{"id": "gb-ben-nevis", "reason": "matched"},
                    {"id": "pl-orla-perc", "reason": "way_only_not_derived"}]}
    (tmp_path / "reg.json").write_text(json.dumps(reg), encoding="utf-8")
    (tmp_path / "cov.json").write_text(json.dumps(cov), encoding="utf-8")
    refs = {"sources": [{"id": "x"}], "trails": [
        {"id": "whw", "name": "West Highland Way", "aliases": ["WHW"], "countries": ["GB"],
         "kind": "multi-day", "labels": ["national_trail"], "length_km": 154},
        {"id": "ben", "name": "Ben Nevis Pony Track", "aliases": ["Ben Nevis Mountain Track"],
         "countries": ["GB"], "kind": "day", "labels": ["famous_day"]},
        {"id": "samaria", "name": "Samaria Gorge", "aliases": ["Φαράγγι Σαμαριάς"],
         "countries": ["GR"], "kind": "day", "labels": ["famous_day"],
         "start": {"lat": 35.30, "lon": 23.96}},
        {"id": "orla", "name": "Orla Perc", "countries": ["PL"], "kind": "day",
         "labels": ["famous_day"]},
    ]}
    (tmp_path / "ref.json").write_text(json.dumps(refs, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def run(world, baseline=None):
    bp = world / "base.json"
    if baseline is not None:
        bp.write_text(json.dumps(baseline), encoding="utf-8")
    return te.run(world / "ref.json", world / "trails", world / "reg.json",
                  world / "cov.json", bp)


def by_id(p):
    return {r["id"]: r for r in p["results"]}


def test_fold_keeps_greek_and_joins_codes():
    assert te.fold("Φαράγγι Σαμαριάς") == te.fold("ΦΑΡΑΓΓΙ ΣΑΜΑΡΙΑΣ") == "φαραγγι σαμαριασ"
    assert te.fold("GR 20") == "gr20" == te.fold("GR20")
    assert te.fold("E 4 Crete") == "e4 crete"


def test_usable_key_refuses_short_words():
    assert not te.usable_key("whw")
    assert te.usable_key("gr20")
    assert te.usable_key("west highland way")
    assert not te.usable_key("trail")


def test_stage_matches_and_representative_prefers_strong_match(world):
    r = by_id(run(world))["whw"]
    assert r["status"] == "matched"
    # The stage carries the parent name exactly; the link path only contains it.
    assert r["best"]["id"] == 1 and r["in_top"]
    assert r["methods"] == {"name exact": 1, "side trail": 1}


def test_ids_from_registry_match_and_low_rank_has_a_cause(world):
    r = by_id(run(world))["ben"]
    assert r["status"] == "matched" and r["methods"].get("osm id") == 1
    assert not r["in_top"] and r["cause_code"] == "rated_low"
    assert "photos 0.20" in r["cause"]


def test_greek_name_and_below_pleasant(world):
    r = by_id(run(world))["samaria"]
    assert r["status"] == "matched" and r["best"]["band"] == "below_pleasant"


def test_missing_takes_the_coverage_reason(world):
    r = by_id(run(world))["orla"]
    assert r["status"] == "missing" and r["cause_code"] == "way_only_not_derived"


def test_summary_and_gate(world):
    p = run(world)
    s = p["summary"]
    assert (s["n"], s["matched"], s["in_top"]) == (4, 3, 1)
    assert not p["gate"]["ok"]  # no baseline yet
    ok = run(world, {"coverage": 0.75, "top_share": 0.25})
    assert ok["gate"]["ok"]
    bad = run(world, {"coverage": 1.0, "top_share": 0.25})
    assert not bad["gate"]["ok"] and "coverage fell" in bad["gate"]["failures"][0]
    assert p["gaps"][0]["id"] in ("orla", "samaria")


def test_markdown_has_no_dashes(world):
    md = te.render_md(run(world, {"coverage": 0.75, "top_share": 0.25}))
    assert "–" not in md and "—" not in md


def test_module_has_no_dashes():
    text = (ROOT / "scripts" / "validation" / "trails_external.py").read_text(encoding="utf-8")
    assert "–" not in text and "—" not in text


@pytest.mark.skipif(not (te.WIRE_DIR / "index.json").exists() or not te.REFERENCE.exists()
                    or not te.BASELINE.exists(), reason="shipped wire or reference list absent")
def test_gate_passes_on_shipped_data():
    p = te.run()
    assert p["summary"]["n"] >= 100
    assert p["gate"]["ok"], p["gate"]["failures"]


def test_t1181_seeds_are_new_ascii_and_placed():
    sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
    fr = pytest.importorskip("famous_registry")
    assert "Causeway Coast Way" in fr.SEEDS["GB"]
    assert "Causeway Coast Way" not in fr.SEEDS["IE"]
    for cc, names in fr.SEEDS_T1181.items():
        blind = {fr.squash(fr.base_name(n)) for n in fr.SEEDS_BLIND.get(cc, [])}
        for n in names:
            assert n.isascii(), n
            assert fr.SEEDS[cc].count(n) == 1, (cc, n)
            assert fr.squash(fr.base_name(n)) not in blind, (cc, n)


# --- T1201 (T1181-k): a day walk on a longer published row ----------------

def test_line_near_is_metres_to_the_segment():
    ln = [(50.0, 0.0), (50.0, 0.1)]                 # about 7.2 km east-west
    assert te.line_near_m(50.0, 0.05, ln) < 1
    assert 1050 < te.line_near_m(50.01, 0.05, ln) < 1170   # 0.01 deg north
    assert te.line_near_m(50.0, 0.0, []) == float("inf")


def test_day_walk_found_on_a_longer_row_that_names_it(tmp_path):
    wire = tmp_path / "trails"
    (wire / "trip").mkdir(parents=True)
    coast = row(10, "Coast Path: Portland to Lulworth", "GB", "excellent", 8.6,
                line(50.60, -2.30, 50.62, -2.20), distance_m=30000)
    lake = row(11, "Lakeside Way", "GB", "exceptional", 9.1,
               line(54.50, -2.95, 54.50, -2.85), distance_m=30000)
    (wire / "GB.json").write_text(json.dumps({"generated_at": "x", "trips": [coast, lake]}))
    (wire / "trip" / "10.json").write_text(json.dumps({"highlights": [{"name": "Durdle Door"}]}))
    (wire / "trip" / "11.json").write_text(json.dumps({"highlights": [{"name": "Aira Force"}]}))
    refs = {"sources": [], "trails": [
        {"id": "dd", "name": "Lulworth Cove to Durdle Door", "countries": ["GB"], "kind": "day",
         "length_km": 3, "start": {"lat": 50.61, "lon": -2.25}},
        {"id": "hv", "name": "Helvellyn via Striding Edge", "countries": ["GB"], "kind": "day",
         "length_km": 13, "start": {"lat": 54.50, "lon": -2.90}},
    ]}
    (tmp_path / "ref.json").write_text(json.dumps(refs))
    (tmp_path / "reg.json").write_text(json.dumps({"rows": []}))
    (tmp_path / "cov.json").write_text(json.dumps({"rows": []}))
    p = te.run(tmp_path / "ref.json", wire, tmp_path / "reg.json", tmp_path / "cov.json",
               tmp_path / "base.json")
    res = by_id(p)
    assert res["dd"]["status"] == "matched"
    assert res["dd"]["methods"] == {"on a longer route": 1}
    assert res["dd"]["in_top"] is True
    # the lakeside row passes the Helvellyn start but names no Helvellyn sight
    assert res["hv"]["status"] == "missing"
