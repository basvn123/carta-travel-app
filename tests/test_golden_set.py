"""T153: the golden set (spec K8), with stubs and no network.

    python -m pytest tests/test_golden_set.py -q

Pins what makes the set a gate: ten trips across ten styles, a stamp that
moves when a prompt or the model chain does, a check that fails on that
movement and on a missing baseline, a diff that catches a systematic drift
and a shrunken comparison, and a bless that refuses a stub run.
"""

import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "Trips" / "carta-unified" / "carta-unified"
sys.path.insert(0, str(DATASET / "pipeline"))

import generate_trip as T  # noqa: E402
import golden_set as S  # noqa: E402


def test_self_test_passes():
    assert S.self_test() == 0


def test_the_set_is_ten_styles_with_truth():
    gset = S.load_set()
    assert len(gset["trips"]) == 10
    assert {t["style"] for t in gset["trips"]} == {s for _, _, s in T.C.TRIP_TYPES}
    master = json.loads((DATASET / "data" / "trips.master.json").read_text(encoding="utf-8"))["trips"]
    by_id = {t["id"]: t for t in master}
    for t in gset["trips"]:
        cur = by_id[t["curatedId"]]
        assert cur["tripTypeSlug"] == t["style"]
        assert t["truth"]["totalEur"]["low"] == cur["budget"]["totalEur"]["low"]
        text = json.dumps(t, ensure_ascii=False)
        assert "\u2014" not in text and "\u2013" not in text and "\u00b7" not in text


def test_stamp_moves_with_a_prompt_and_the_model_chain(tmp_path, monkeypatch):
    before = S.stamp()
    prompts = tmp_path / "prompts"
    shutil.copytree(T.PROMPT_DIR, prompts)
    monkeypatch.setattr(T, "PROMPT_DIR", str(prompts))
    assert S.stamp()["digest"] == before["digest"]
    numbers = prompts / "k2-numbers.md"
    numbers.write_text(numbers.read_text(encoding="utf-8") + "\nOne more sentence.\n", encoding="utf-8")
    after = S.stamp()
    assert after["digest"] != before["digest"]
    assert S.stamp_changes(before, after) == ["prompt changed: k2-numbers.md"]
    monkeypatch.setattr(T, "MODEL_CHAIN", ["gemini-other"])
    assert any(l.startswith("model chain changed") for l in S.stamp_changes(before, S.stamp()))


def test_check_fails_on_change_and_on_a_missing_baseline(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(S, "BASELINE_PATH", str(tmp_path / "baseline.json"))
    assert S.cmd_check(False) == 2
    assert S.cmd_check(True) == 0
    base = {"mode": "live", "stamp": S.stamp(), "trips": {}, "blessed": {"at": "2026-10-03", "note": "t"}}
    (tmp_path / "baseline.json").write_text(json.dumps(base), encoding="utf-8")
    assert S.cmd_check(False) == 0
    base["stamp"] = {**base["stamp"], "digest": "x", "modelChain": ["old"]}
    (tmp_path / "baseline.json").write_text(json.dumps(base), encoding="utf-8")
    assert S.cmd_check(False) == 1
    assert "model chain changed" in capsys.readouterr().out


def _runs(tmp_path, **kw):
    mini = S._mini_set(6)
    keys = [t["key"] for t in mini["trips"]]
    out = {}
    for name, food in (("a", 1.0), ("b", kw.get("food", 1.0))):
        S.make_stubs(str(tmp_path / name), keys, food=food)
        out[name] = S.run_set(mini, lambda e, n=name: T.StubClient(str(tmp_path / n / e["key"])),
                              str(tmp_path / f"out-{name}"), mode="stub", today="2026-10-03")
    return mini, out["a"], out["b"]


def test_a_twenty_percent_food_rise_is_a_failure(tmp_path):
    mini, a, b = _runs(tmp_path, food=1.2)
    d = S.diff_runs(a, b, mini)
    assert any("systematic drift: budget.food" in f for f in d["fail"])
    assert d["truth"]["groups"]["budget.food"]["meanDeviation"] > 0.1


def test_a_trip_that_stops_being_admitted_fails(tmp_path):
    mini, a, b = _runs(tmp_path)
    b["trips"]["mini-0"] = {**b["trips"]["mini-0"], "status": "rejected", "stage": "critic", "errors": ["x"]}
    assert any("was admitted, now rejected" in f for f in S.diff_runs(a, b, mini)["fail"])


def test_a_model_fall_over_is_reported(tmp_path):
    mini, a, b = _runs(tmp_path)
    b["trips"]["mini-1"]["models"]["pass3"] = "gemini-3.5-flash-lite"
    assert any("mini-1 pass3: model" in w for w in S.diff_runs(a, b, mini)["warn"])


def test_an_empty_comparison_does_not_pass(tmp_path):
    mini, a, _ = _runs(tmp_path)
    empty = {**a, "trips": {}}
    d = S.diff_runs(a, empty, mini)
    assert any("only 0 trips" in f for f in d["fail"])


def test_bless_refuses_a_stub_run(tmp_path, monkeypatch):
    mini, a, _ = _runs(tmp_path)
    monkeypatch.setattr(S, "BASELINE_PATH", str(tmp_path / "baseline.json"))
    monkeypatch.setattr(S, "load_set", lambda path=S.SET_PATH: mini)
    run_path = tmp_path / "run.json"
    run_path.write_text(json.dumps(a), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["golden_set", "bless", str(run_path), "--note", "t"])
    with pytest.raises(SystemExit, match="stub"):
        S.main()


def test_metrics_read_budget_and_critic_fields(example=None):
    rec = json.loads(Path(S.G.EXAMPLE_PATH).read_text(encoding="utf-8"))
    m = S.metrics_of(rec, 0)
    assert m["budget.food.low"] == rec["budget"]["breakdown"]["food"]["lowEur"]
    assert m["budget.total.high"] == rec["budget"]["totalEur"]["high"]
    assert m["flags"] == len(rec["verifyFlags"])
