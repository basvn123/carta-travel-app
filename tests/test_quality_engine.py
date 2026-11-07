"""scripts/quality/engine.py: rules, the must-see drop gate and the trend (T1142, ROADMAP D2)."""
from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 6, 18, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def eng():
    spec = importlib.util.spec_from_file_location("quality_engine", ROOT / "scripts/quality/engine.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["quality_engine"] = mod
    spec.loader.exec_module(mod)
    return mod


def place(i, **extra):
    base = {"id": i, "tier": "gem", "city": i.title(), "country": "Belgium", "iso2": "BE",
            "lat": 50.8, "lon": 4.4, "categories": ["city"], "tags": [], "blurb": "A town."}
    return {**base, **extra}


def make_public(tmp: Path, n=100, no_blurb=0) -> Path:
    tmp.mkdir(parents=True, exist_ok=True)
    stamp = "2026-11-01T00:00:00+00:00"
    dests = {f"p{i:03d}": place(f"p{i:03d}", blurb="" if i < no_blurb else "A town.") for i in range(n)}
    (tmp / "app_data.json").write_text(json.dumps({"meta": {"generated_at": stamp}, "destinations": dests}))
    return tmp


def soft_rules(eng, tmp: Path, **override) -> Path:
    """Every measured field as a soft rule with floor 0, except the overrides."""
    rules = [{"id": f"{lay}.{f}", "layer": lay, "field": f, "level": "must_have", "kind": "soft", "min": 0.0}
             for lay, f in sorted(eng.measured_fields())]
    for r in rules:
        r.update(override.get(r["id"], {}))
    p = tmp / "rules.yaml"
    p.write_text(yaml.safe_dump({"version": 1, "gate": {"must_see_drop_points": 2, "trend_days": 90},
                                 "rules": rules}))
    return p


def history(out: Path, at: str, fields: dict, gate_ok=True):
    out.mkdir(parents=True, exist_ok=True)
    with (out / "quality_history.jsonl").open("a") as fh:
        fh.write(json.dumps({"generated_at": at, "gate_ok": gate_ok,
                             "layers": {"core": {"score": 0.9, "fields": fields}}}) + "\n")


def test_shipped_rules_cover_every_scorecard_field(eng):
    cfg = eng.load_rules()
    assert eng.coverage_problems(cfg["rules"]) == []
    assert len(cfg["rules"]) == len(eng.measured_fields())
    assert cfg["drop_points"] == 2 and cfg["trend_days"] == 90
    assert any(r["level"] == "must_see" for r in cfg["rules"])
    assert all(r["kind"] == "hard" for r in cfg["rules"] if r["level"] == "must_see")


def test_a_missing_rule_is_a_config_error(eng, tmp_path):
    p = soft_rules(eng, tmp_path)
    d = yaml.safe_load(p.read_text())
    d["rules"] = [r for r in d["rules"] if r["id"] != "core.blurb"]
    p.write_text(yaml.safe_dump(d))
    rc, data = eng.run(make_public(tmp_path / "pub"), NOW, tmp_path / "out", p, snapshot=None)
    assert rc == 2 and "no rule for core.blurb" in data["config_errors"]


def test_a_seeded_three_point_drop_on_a_must_see_field_fails(eng, tmp_path):
    rules = soft_rules(eng, tmp_path, **{"core.blurb": {"level": "must_see", "kind": "hard", "min": 0.5}})
    out = tmp_path / "out"
    history(out, "2026-11-05T12:00:00Z", {"blurb": 1.0})
    rc, data = eng.run(make_public(tmp_path / "pub", no_blurb=3), NOW, out, rules, snapshot=None)
    assert rc == 1
    (f,) = data["gate"]["failures"]
    assert f["id"] == "core.blurb" and f["delta_points"] == -3.0 and "fell 3.0 points" in f["why"]


def test_a_two_point_drop_passes_and_a_soft_field_only_warns(eng, tmp_path):
    rules = soft_rules(eng, tmp_path, **{"core.blurb": {"level": "must_see", "kind": "hard", "min": 0.5},
                                         "core.tags": {"min": 0.5}})
    out = tmp_path / "out"
    history(out, "2026-11-05T12:00:00Z", {"blurb": 1.0, "tags": 1.0})
    # An empty validation folder: this test is about the fixture, not the repo's
    # live D23 scorecard (whose soft checks may warn, for example T1193's cycling
    # metrics that wait on owner data).
    (tmp_path / "novalid").mkdir()
    rc, data = eng.run(make_public(tmp_path / "pub", no_blurb=2), NOW, out, rules, snapshot=None,
                       validation=tmp_path / "novalid")
    assert rc == 0
    assert data["gate"]["failures"] == []
    core = [w for w in data["gate"]["warnings"] if w["layer"] == "core"]
    assert [w["id"] for w in core] == ["core.tags"]  # 0% under a soft 50% floor
    # The fixture has no shard wires: their soft rules warn "not measured", never fail.
    assert {w["why"] for w in data["gate"]["warnings"] if w["layer"] != "core"} == {"not measured"}


def test_a_hard_floor_fails_without_history(eng, tmp_path):
    rules = soft_rules(eng, tmp_path, **{"core.blurb": {"level": "must_see", "kind": "hard", "min": 0.99}})
    rc, data = eng.run(make_public(tmp_path / "pub", no_blurb=5), NOW, tmp_path / "out", rules, snapshot=None)
    assert rc == 1 and data["gate"]["baseline_at"] is None
    assert "under the floor 99%" in data["gate"]["failures"][0]["why"]


def test_a_failed_run_is_never_the_baseline(eng, tmp_path):
    rules = soft_rules(eng, tmp_path, **{"core.blurb": {"level": "must_see", "kind": "hard", "min": 0.5}})
    out = tmp_path / "out"
    history(out, "2026-11-05T12:00:00Z", {"blurb": 1.0})
    pub = make_public(tmp_path / "pub", no_blurb=3)
    assert eng.run(pub, NOW, out, rules, write=True, snapshot=None)[0] == 1
    later = datetime(2026, 11, 6, 20, tzinfo=timezone.utc)
    rc, data = eng.run(pub, later, out, rules, snapshot=None)
    assert rc == 1 and data["gate"]["baseline_at"] == "2026-11-05T12:00:00Z"


def test_write_keeps_a_ninety_day_trend_and_the_snapshot(eng, tmp_path):
    rules = soft_rules(eng, tmp_path)
    out, snap = tmp_path / "out", tmp_path / "app" / "dataHealth.json"
    history(out, "2026-07-01T00:00:00Z", {"blurb": 1.0})   # 128 days back: out of the window
    history(out, "2026-10-01T00:00:00Z", {"blurb": 1.0})
    rc, data = eng.run(make_public(tmp_path / "pub"), NOW, out, rules, write=True, snapshot=snap)
    assert rc == 0
    assert [p["at"][:10] for p in data["trend"]["points"]] == ["2026-10-01", "2026-11-06"]
    assert data["trend"]["days"] == 90
    assert json.loads(snap.read_text()) == json.loads((out / "panel.json").read_text()) == data
    card = json.loads((out / "2026-11-06.json").read_text())
    assert card["gate"]["ok"] is True
    last = json.loads((out / "quality_history.jsonl").read_text().splitlines()[-1])
    assert last["gate_ok"] is True and last["layers"]["core"]["fields"]["blurb"] == 1.0


def test_the_first_card_without_field_history_is_a_baseline(eng, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "2026-11-05.json").write_text(json.dumps({
        "generated_at": "2026-11-05T12:00:00Z", "layers": [{"layer": "core", "fields": {"blurb": 0.9}}]}))
    (out / "quality_history.jsonl").write_text(json.dumps(
        {"generated_at": "2026-11-05T12:00:00Z", "layers": {"core": {"score": 0.9}}}) + "\n")
    prev, at = eng.previous_fields(out, "2026-11-06T00:00:00Z")
    assert at == "2026-11-05T12:00:00Z" and prev["core"]["blurb"] == 0.9


def link_snap(tmp_path, checked, share):
    p = tmp_path / "linkHealth.json"
    p.write_text(json.dumps({"totals": {"checked": checked, "broken_share": share}}))
    return p


def test_link_health_share_is_a_soft_then_hard_rule(eng, tmp_path):
    cfg = eng.load_rules()
    assert cfg["links"]["id"] == "links.broken_share"
    assert eng._links_gate(cfg, None) == ([], [])
    assert eng._links_gate(cfg, tmp_path / "missing.json") == ([], [])
    # Too few results: nothing was measured, so nothing warns.
    assert eng._links_gate(cfg, link_snap(tmp_path, 100, 0.5)) == ([], [])
    assert eng._links_gate(cfg, link_snap(tmp_path, 5000, 0.01)) == ([], [])
    fail, warn = eng._links_gate(cfg, link_snap(tmp_path, 5000, 0.05))
    assert fail == [] and warn[0]["id"] == "links.broken_share" and "5.0%" in warn[0]["why"]
    fail, warn = eng._links_gate(cfg, link_snap(tmp_path, 5000, 0.2))
    assert warn == [] and fail[0]["kind"] == "hard"


def test_link_rule_thresholds_are_validated(eng, tmp_path):
    bad = tmp_path / "r.yaml"
    bad.write_text("version: 1\nlinks: {id: x, max_broken_share: 0.5, hard_broken_share: 0.1, min_checked: 1}\nrules: []\n")
    with pytest.raises(ValueError, match="max_broken_share"):
        eng.load_rules(bad)


# --- T1201 (T1179-c): text checks on the trail summaries -------------------

PUBLIC = ROOT / "continent-app" / "public"


def _summaries(tmp: Path, items: dict) -> Path:
    p = tmp / "summaries.json"
    p.write_text(json.dumps({"items": items}))
    return p


TEXT_CHECKS = [
    {"id": "t.dash", "source": "trails_summaries", "check": "dash", "kind": "hard"},
    {"id": "t.banned", "source": "trails_summaries", "check": "banned", "kind": "hard"},
    {"id": "t.facts", "source": "trails_summaries", "check": "facts", "kind": "soft"},
    {"id": "t.length", "source": "trails_summaries", "check": "length", "kind": "soft"},
]


@pytest.mark.skipif(not (PUBLIC / "trails" / "AT.json").is_file(), reason="needs the trail wire")
def test_text_gate_rechecks_summaries_against_the_wire(eng, tmp_path):
    good = ("Stage 15 of the BergeSeen Trail. A 16.4 km walk with 985 m of climbing, "
            "about 7 h 50 min of walking.")
    p = _summaries(tmp_path, {"20050": {"cc": "AT", "text": good}})
    assert eng.text_gate(TEXT_CHECKS, PUBLIC, p) == ([], [])
    dashed = good.replace("Trail. A", "Trail — a")
    fails, warns = eng.text_gate(TEXT_CHECKS, PUBLIC, _summaries(tmp_path, {"20050": {"cc": "AT", "text": dashed}}))
    assert [f["id"] for f in fails] == ["t.dash"]
    wrong = good.replace("985 m", "1,985 m")
    fails, warns = eng.text_gate(TEXT_CHECKS, PUBLIC, _summaries(tmp_path, {"20050": {"cc": "AT", "text": wrong}}))
    assert not fails and [w["id"] for w in warns] == ["t.facts"]


def test_text_gate_on_a_walk_not_on_the_wire(eng, tmp_path):
    p = _summaries(tmp_path, {"1": {"cc": "ZZ", "text": "Too short – really."}})
    fails, warns = eng.text_gate(TEXT_CHECKS, tmp_path, p)
    assert [f["id"] for f in fails] == ["t.dash"]
    assert {w["id"] for w in warns} == {"t.length", "trails_summaries.stale"}
    assert eng.text_gate(TEXT_CHECKS, tmp_path, tmp_path / "missing.json") == ([], [])
    assert eng.text_gate([], tmp_path, p) == ([], [])


def test_text_checks_are_validated(eng, tmp_path):
    p = soft_rules(eng, tmp_path)
    d = yaml.safe_load(p.read_text())
    d["text_checks"] = [{"id": "x", "source": "nope", "check": "dash", "kind": "hard"}]
    p.write_text(yaml.safe_dump(d))
    with pytest.raises(ValueError):
        eng.load_rules(p)


def test_repo_rules_name_the_summary_checks(eng):
    cfg = eng.load_rules()
    kinds = {c["check"]: c["kind"] for c in cfg["texts"]}
    assert kinds == {"dash": "hard", "banned": "hard", "facts": "soft", "length": "soft"}
