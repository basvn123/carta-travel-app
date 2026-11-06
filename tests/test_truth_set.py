"""The truth set (T1144, ROADMAP D4): sampling, comparing, scoring, seeds.

The scorer reads the shipped wire (continent-app/public, in git). The small
cases build their own wire in a temporary folder; the last ones run on the
committed sample and sheet.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "evals"))
sys.path.insert(0, str(ROOT / "evals" / "truth"))
import build_sample as bs
import run_truth as rt

FIELDS = json.loads((ROOT / "evals" / "truth" / "fields.json").read_text(encoding="utf-8"))["fields"]


def test_wilson_interval_textbook_values():
    lo, hi = rt.wilson(90, 100)
    assert 0.82 < lo < 0.83 and 0.94 < hi < 0.95
    assert rt.wilson(0, 0) is None
    assert rt.wilson(10, 10)[1] == 1.0


@pytest.mark.parametrize("kind,field,current,answer,want", [
    ("trail", "distance_km", 16.4, "16.0", "right"),
    ("trail", "distance_km", 16.4, "12", "wrong"),
    ("trail", "ascent_m", 985, "940", "right"),
    ("trail", "ascent_m", 985, "700", "wrong"),
    ("trail", "loop", True, "yes", "right"),
    ("trail", "loop", False, "yes", "wrong"),
    ("trail", "difficulty", "very_hard", "very_hard", "right"),
    ("trail", "difficulty", "hard", "moderate", "wrong"),
    ("place", "country", "NL", "nl", "right"),
    ("place", "coords", [52.0116, 4.3571], "52.0110, 4.3600", "right"),
    ("place", "coords", [52.0116, 4.3571], "52.10, 4.36", "wrong"),
    ("place", "population", 95060, "103000", "right"),
    ("place", "population", 95060, "150000", "wrong"),
    ("place", "image_depicts", "https://x/y.jpg", "yes", "right"),
    ("place", "image_depicts", "https://x/y.jpg", "no", "wrong"),
    ("beach", "name", "Pasjača", "Pasjaca", "right"),
    ("lake", "water_quality", "excellent", "Excellent", "right"),
    ("place", "blurb", "Canal town", "supported", "right"),
    ("place", "blurb", "Canal town", "contradicted", "wrong"),
])
def test_compare_rules(kind, field, current, answer, want):
    sha = rt.text_sha(current) if FIELDS[kind][field]["compare"] == "verdict" else None
    assert rt.compare(FIELDS[kind][field], current, answer, sha)[0] == want


def test_text_verdict_goes_stale_when_the_text_changes():
    spec = FIELDS["trail"]["summary"]
    assert rt.compare(spec, "new text", "supported", rt.text_sha("old text"))[0] == "stale"


def test_missing_shipped_value_is_wrong():
    assert rt.compare(FIELDS["trail"]["ascent_m"], None, "300")[0] == "wrong"


def test_allocate_floor_and_total():
    a = bs.allocate({"a": 500, "b": 50, "c": 2, "d": 0}, 20, 3)
    assert sum(a.values()) == 20
    assert a["c"] == 2 and a["b"] >= 3 and "d" not in a
    assert a["a"] > a["b"]


def test_draw_is_reproducible_and_capped():
    pool = [{"key": f"x:{i}", "cc": "AT" if i % 2 else "DE", "_strat": ("s",)} for i in range(40)]
    one = bs.draw(pool, lambda it: "s", 4, 1, cap_per_country=2)
    two = bs.draw(list(reversed(pool)), lambda it: "s", 4, 1, cap_per_country=2)
    assert [x["key"] for x in one] == [x["key"] for x in two]
    assert sum(1 for x in one if x["cc"] == "AT") == 2


def _mini_wire(tmp_path):
    pub = tmp_path / "public"
    (pub / "trails" / "trip").mkdir(parents=True)
    (pub / "app_data.json").write_text(json.dumps({"meta": {"generated_at": "x"}, "destinations": {
        "gem:a": {"id": "gem:a", "city": "A", "iso2": "NL", "lat": 52.0, "lon": 4.0, "geonames": {"population": 1000}},
    }}), encoding="utf-8")
    (pub / "trails" / "AT.json").write_text(json.dumps({"trips": [
        {"id": 7, "name": "T", "category": "hike", "country": "AT", "distance_m": 10000, "ascent_m": 400, "is_loop": True, "difficulty": "hard"},
    ]}), encoding="utf-8")
    (pub / "trails" / "trip" / "7.json").write_text(json.dumps({"tags_raw": {"distance": "10.2 km", "roundtrip": "yes"}, "start": {"lat": 47, "lon": 13}}), encoding="utf-8")
    sample = {"version": "t", "seed": "s", "items": [
        {"item_id": "place:gem:a", "kind": "place", "ref": "gem:a", "cc": "NL", "name": "A", "weight": 1},
        {"item_id": "trail:7", "kind": "trail", "ref": "7", "cc": "AT", "name": "T", "weight": 1},
    ]}
    rows = [
        {"item_id": "place:gem:a", "field": "country", "verified_value": "NL", "status": "verified"},
        {"item_id": "place:gem:a", "field": "population", "verified_value": "1050", "status": "verified"},
        {"item_id": "trail:7", "field": "distance_km", "verified_value": "10.2", "status": "seeded"},
        {"item_id": "trail:7", "field": "loop", "verified_value": "yes", "status": "seeded"},
        {"item_id": "trail:7", "field": "ascent_m", "verified_value": "", "status": "unverified"},
    ]
    for r in rows:
        r["kind"] = "place" if r["item_id"].startswith("place") else "trail"
    return pub, sample, rows


def test_score_on_a_small_wire_and_a_seeded_wrong_value_lowers_it(tmp_path):
    pub, sample, rows = _mini_wire(tmp_path)
    good = rt.score(sample=sample, rows=rows, fields=FIELDS, wire=rt.Wire(pub), baseline={})
    assert good["metrics"]["scored_rows"] == 4
    assert good["metrics"]["accuracy"] == 1.0
    assert good["metrics"]["rows.unverified"] == 1
    bad = rt.score(sample=sample, rows=rows, fields=FIELDS, wire=rt.Wire(pub), seed_wrong=True, baseline={})
    assert bad["planted"]["item_id"] == "place:gem:a"
    assert bad["metrics"]["accuracy"] == 0.75
    assert bad["failures"][0]["key"] == "place:gem:a.country"


def test_gate_against_the_baseline(tmp_path):
    pub, sample, rows = _mini_wire(tmp_path)
    rows[1]["verified_value"] = "5000"  # the population answer no longer matches
    res = rt.score(sample=sample, rows=rows, fields=FIELDS, wire=rt.Wire(pub), baseline={"accuracy": 1.0, "ci95": [0.9, 1.0], "at": "x"})
    assert res["metrics"]["accuracy"] == 0.75
    assert not res["gate"]["ok"]


def test_osm_seeds_read_the_cited_tags(tmp_path):
    pub, sample, _ = _mini_wire(tmp_path)
    w = rt.Wire(pub)
    seeds = bs.seeds_for(sample["items"][1], w.record(sample["items"][1]), [])
    assert seeds["distance_km"][0] == "10.2"
    assert seeds["loop"][0] == "yes"
    assert "ascent_m" not in seeds


def test_country_seed_needs_the_point_well_inside_one_shape():
    square = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]
    shapes = [("AA", square)]
    assert bs.country_at(shapes, 5, 5) == "AA"
    assert bs.country_at(shapes, 0.01, 5) is None


# ---- the committed sample, sheet and text sample

SAMPLE = json.loads((ROOT / "evals" / "truth" / "sample.json").read_text(encoding="utf-8"))
SHEET = rt.read_sheet()


def test_committed_sample_has_the_planned_sizes():
    assert SAMPLE["counts"] == {"place": 100, "trail": 25, "beach": 13, "lake": 12}
    assert len({it["item_id"] for it in SAMPLE["items"]}) == 150


def test_every_item_has_its_rows_and_statuses_are_known():
    want = {(it["item_id"], f) for it in SAMPLE["items"] for f in bs.FIELDS[it["kind"]]}
    have = {(r["item_id"], r["field"]) for r in SHEET}
    assert want == have
    assert all(r["status"] in rt.STATUSES for r in SHEET)
    assert all(r["verified_value"] for r in SHEET if r["status"] in rt.SCORED)


def test_text_sample_is_balanced_and_blind():
    judge = ROOT / "evals" / "truth" / "judge"
    ts = json.loads((judge / "text-sample.json").read_text(encoding="utf-8"))
    key = json.loads((judge / "text-sample-key.json").read_text(encoding="utf-8"))
    assert ts["n"] == 50 and len(key["planted"]) == 50
    assert sum(1 for v in key["planted"].values() if v) == 20
    blob = json.dumps(ts)
    assert "planted" not in blob and "key" not in json.dumps([it.keys() for it in ts["items"]], default=list)
    assert all(it["text"] for it in ts["items"])


@pytest.mark.skipif(not (rt.PUBLIC / "app_data.json").exists(), reason="no shipped wire")
def test_real_score_and_seeded_drop_on_the_committed_sheet():
    good = rt.score()
    bad = rt.score(seed_wrong=True)
    assert good["metrics"]["scored_rows"] >= 50
    assert bad["planted"] is not None
    assert bad["metrics"]["accuracy"] < good["metrics"]["accuracy"]
