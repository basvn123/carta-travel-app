"""D25 famous coverage: the mountains and lakes hand-off.

An item seeded in one run and found on the wire in the next stays in the
seed file while it is famous (judgement 1: without that it would leave the
file and drop off the wire the run after); a peak below the sea is never
seeded; the seed readers skip entries the hand seed already pins."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "famous"))

import coverage as cov  # noqa: E402


def ref(qid, name, tier="A", ele=2000.0, prom=1200.0, cc="CH"):
    return {"id": "wd:" + qid, "qid": qid, "name": name, "tier": tier,
            "countries": [cc], "lat": 46.5, "lon": 8.0, "elev_m": ele,
            "prom_m": prom, "sitelinks": 30, "classes": ["Q8502"]}


def res(refs, statuses):
    rows = []
    for r in refs:
        st = statuses[r["qid"]]
        rows.append({"id": r["id"], "tier": r["tier"], "status": st,
                     "reason": "not_in_wire" if st == "missing" else None})
    return {"rows": rows, "_refs": {r["id"]: r for r in refs},
            "_covered": {"CH"}}


def load(path):
    return {r["wd"] for r in json.loads(path.read_text(encoding="utf-8"))
            ["rows"]}


def test_seed_stays_once_it_is_on_the_wire(tmp_path):
    path = tmp_path / "seed_mountains.json"
    refs = [ref("Q1", "Weisshorn"), ref("Q2", "Schreckhorn")]
    cov.handoff("mountains", res(refs, {"Q1": "missing", "Q2": "missing"}),
                path)
    assert load(path) == {"Q1", "Q2"}
    # Next run: the seed worked, both are on the wire now.
    cov.handoff("mountains", res(refs, {"Q1": "in", "Q2": "in_listed"}),
                path)
    assert load(path) == {"Q1", "Q2"}


def test_seed_leaves_when_no_longer_famous(tmp_path):
    path = tmp_path / "seed_mountains.json"
    refs = [ref("Q1", "Weisshorn")]
    cov.handoff("mountains", res(refs, {"Q1": "missing"}), path)
    refs = [ref("Q1", "Weisshorn", tier="B")]
    cov.handoff("mountains", res(refs, {"Q1": "missing"}), path)
    assert load(path) == set()


def test_no_peak_below_the_sea_or_lower_than_its_prominence(tmp_path):
    path = tmp_path / "seed_mountains.json"
    refs = [ref("Q1", "Ferdinandea", ele=-8.0, prom=None),
            ref("Q2", "Odd", ele=500.0, prom=900.0),
            ref("Q3", "Weisshorn")]
    cov.handoff("mountains", res(refs, {q: "missing" for q in
                                        ("Q1", "Q2", "Q3")}), path)
    assert load(path) == {"Q3"}


def test_outside_covered_countries_is_not_seeded(tmp_path):
    path = tmp_path / "seed_lakes.json"
    refs = [ref("Q9", "Lake Van", cc="TR")]
    cov.handoff("lakes", res(refs, {"Q9": "missing"}), path)
    assert load(path) == set()


def test_seed_readers_skip_hand_seeded_ids():
    sys.path.insert(0, str(ROOT / "pipeline" / "mountains"))
    sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
    import seed_lakes
    import seed_peaks
    for mod in (seed_peaks, seed_lakes):
        hand = {e.get("wd") for e in mod.SEED if e.get("wd")}
        gen = mod.famous_entries()
        assert not ({e["wd"] for e in gen} & hand)
        assert all(e.get("why") == "famous" and e.get("cc") for e in gen)


def test_stage_reason_from_stored_stages(tmp_path, monkeypatch):
    for st, ids in (("raw", ["Q1", "Q2"]), ("rich", ["Q1"])):
        d = tmp_path / "lakes"
        d.mkdir(exist_ok=True)
        (d / f"{st}_CH.json").write_text(json.dumps(
            {"lakes": [{"wd": q} for q in ids]}), encoding="utf-8")
    monkeypatch.setattr(cov, "STAGE_DIR", tmp_path)
    cov._STAGES.clear()
    assert cov.stage_reason("lakes", ref("Q1", "a")) == "dropped_at_export"
    assert cov.stage_reason("lakes", ref("Q2", "b")) == "not_enriched"
    assert cov.stage_reason("lakes", ref("Q3", "c")) == "not_in_catalogue"
    assert cov.stage_reason("lakes", ref("Q4", "d", cc="AT")) is None
    cov._STAGES.clear()
