"""D25 b (2026-11-24): the beach export logs why each enriched beach with a
Wikidata item missed the wire, and the famous coverage report names that
gate instead of "dropped_at_export"."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
sys.path.insert(0, str(ROOT / "pipeline" / "famous"))

import coverage as cov  # noqa: E402
import export_beaches as eb  # noqa: E402
import export_lakes as el  # noqa: E402
import pipeline_io as pio  # noqa: E402


def beach(key, qid, name="Playa Grande Norte", lat=36.5, lon=-6.3, photo=True):
    return {"key": key, "wd": qid, "name": name, "lat": lat, "lon": lon,
            "_photo": photo}


def test_each_dropped_beach_gets_its_gate(monkeypatch):
    monkeypatch.setattr(eb.bi, "unique_beach_id", lambda b: b["key"])
    monkeypatch.setattr(eb, "photo_gate", lambda b: b["_photo"])
    scored = [
        (beach("kept", "Q1"), {}, 8.0),
        (beach("unnamed", "Q2", name="Playa"), {}, 8.0),
        (beach("aruba", "Q3", lat=12.5, lon=-70.0), {}, 8.0),
        (beach("twin", "Q4"), {}, 8.0),          # rated candidate, deduped
        (beach("capped", "Q5"), {}, 8.0),        # survived dedupe, cut by quota
        (beach("low", "Q6"), {}, 2.0),
        (beach("nopic", "Q7", photo=False), {}, 8.0),
        (beach("quiet", "Q8"), {}, 8.0),         # passed both, no reason line
        (beach("noqid", None), {}, 2.0),
        (beach("listed", "Q9"), {}, 2.0),
    ]
    got = eb.drop_reasons(scored, gated={"kept", "twin", "capped"},
                          deduped={"kept", "capped"},
                          rows=[{"id": "kept"}], listed=[{"id": "listed"}],
                          min_score=4.0)
    assert got == {"Q2": "no_name", "Q3": "outside_europe", "Q4": "dedupe",
                   "Q5": "quota_cap", "Q6": "score:not_listed",
                   "Q7": "photo:not_listed", "Q8": "no_reason:not_listed"}


def test_a_countries_run_merges_into_the_last_log(tmp_path):
    path = str(tmp_path / "beaches.json")
    pio.write_export_drops("beaches", {"Q1": "score:not_listed"}, "t0", path=path)
    pio.write_export_drops("beaches", {"Q2": "dedupe"}, "t1", merge=True, path=path)
    assert json.loads(Path(path).read_text(encoding="utf-8"))["drops"] == {
        "Q1": "score:not_listed", "Q2": "dedupe"}
    # a full run replaces the log
    pio.write_export_drops("beaches", {"Q3": "dedupe"}, "t2", path=path)
    assert json.loads(Path(path).read_text(encoding="utf-8"))["drops"] == {"Q3": "dedupe"}


def test_each_dropped_lake_gets_its_gate(monkeypatch):
    monkeypatch.setattr(el.li, "lake_id", lambda lk: lk["key"])
    monkeypatch.setattr(el, "publishable", lambda lk: lk.get("pic", True))
    monkeypatch.setattr(el.li, "reasons_for", lambda lk, c: lk.get("why", ["x"]))

    def lake(key, qid, **kw):
        return {"key": key, "wd": qid, "name": "Lago di Prova",
                "lat": 46.0, "lon": 10.0, **kw}
    scored = [
        (lake("kept", "Q1"), {}, 8.0),
        (lake("far", "Q2", lat=-21.0, lon=55.5), {}, 8.0),
        (lake("twin", "Q3"), {}, 8.0),
        (lake("capped", "Q4"), {}, 8.0),
        (lake("unnamed", "Q5", name="Lago"), {}, 8.0),
        (lake("nopic", "Q6", pic=False), {}, 8.0),
        (lake("quiet", "Q7", why=[]), {}, 8.0),
        (lake("low", "Q8"), {}, 2.0),
        (lake("midway", "Q9"), {}, 5.0),
    ]
    got = el.drop_reasons(scored, gated={"kept", "twin", "capped"},
                          deduped={"kept", "capped"}, rows=[{"id": "kept"}],
                          listed=[], min_score=6.0)
    assert got == {"Q2": "outside_europe", "Q3": "dedupe", "Q4": "quota_cap",
                   "Q5": "no_name", "Q6": "photo:not_listed",
                   "Q7": "no_reason:not_listed", "Q8": "score:under_floor",
                   "Q9": "score:not_in_floor"}


def test_coverage_names_the_gate_and_still_hands_off(monkeypatch, tmp_path):
    (tmp_path / "beaches.json").write_text(json.dumps(
        {"drops": {"Q7": "photo:not_listed"}}), encoding="utf-8")
    monkeypatch.setattr(cov, "DROPS_DIR", tmp_path)
    monkeypatch.setattr(cov, "_DROPS", {})
    ref = {"id": "wd:Q7", "qid": "Q7", "countries": ["ES"]}
    assert cov.stage_reason("beaches", ref) == "dropped_at_export:photo:not_listed"
    assert "dropped_at_export:photo:not_listed".split(":")[0] in cov.HANDOFF_REASONS
