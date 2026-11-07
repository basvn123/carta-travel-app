"""T1188 (ROADMAP D23, D4): the text judge, its calibration and the runner's text layer.

No network and no key: the Gemini path runs on a fake opener with recorded
answers (pipeline/judge/fixtures), the session path on files in tmp_path.

    python -m pytest tests/test_judge.py -q
"""
from __future__ import annotations

import importlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT, ROOT / "scripts" / "validation"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from pipeline.judge import backends, core
from pipeline.judge import calibrate as cal
from pipeline.judge.__main__ import main as cli
from pipeline.judge.__main__ import run_fixtures, seed_labels

# pipeline/ is on sys.path once core is imported; the gateway is the module the judge uses.
G = importlib.import_module("ai_gateway")

NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
FIX_ITEMS = ROOT / "pipeline" / "judge" / "fixtures" / "fixture-items.json"


@pytest.fixture(autouse=True)
def _gateway_features(monkeypatch):
    # The judge adds its gateway feature on first use; keep other tests' view of FEATURES unchanged.
    monkeypatch.setattr(G, "FEATURES", dict(G.FEATURES))


# ---- the prompt ----

def test_prompt_is_the_registry_prompt_for_every_kind():
    p = core.judge_prompt()
    reg = json.loads((ROOT / "prompts" / "registry.json").read_text(encoding="utf-8"))["prompts"]["judge-text"]
    assert p.id == "judge-text" and p.version == reg["version"] and p.sha256 == reg["sha256"]
    for kind in core.KINDS:
        item = {"text_id": "x", "kind": kind, "subject": "S", "text": "T", "source": {"text": "src"}}
        text = core.build_prompt(item, p)
        assert p.text("rubric").strip() in text
        assert p.text(f"source.{kind}").strip() in text
        assert '"text": "T"' in text and "{{" not in text
    assert core.kind_of({"kind": "place_intro"}) == "place_blurb"
    with pytest.raises(ValueError):
        core.kind_of({"kind": "poem"})


def test_no_prompt_text_in_the_judge_code():
    rubric = core.judge_prompt().text("rubric")
    words = rubric.split()
    runs = {" ".join(words[i:i + 8]) for i in range(len(words) - 8)}
    for f in (ROOT / "pipeline" / "judge").glob("*.py"):
        code = " ".join(f.read_text(encoding="utf-8").split())
        assert not any(r in code for r in runs), f


# ---- verdicts ----

def test_normalise_raises_a_verdict_milder_than_its_claims():
    v = core.normalise_verdict({"verdict": "Supported", "claims": [{"claim": "a", "verdict": "contradicted"}]})
    assert v["verdict"] == "contradicted" and v["raised_from"] == "supported"
    assert core.normalise_verdict({"verdict": "maybe"}) is None
    assert core.normalise_verdict("x") is None
    assert core.binary("unsupported") == "not" and core.binary("supported") == "supported" and core.binary(None) is None


def test_majority_ties_go_to_the_stricter_verdict():
    s, u = {"verdict": "supported", "claims": []}, {"verdict": "unsupported", "claims": []}
    assert core.majority([s, u])["verdict"] == "unsupported"
    assert core.majority([s, s, u])["verdict"] == "supported"
    assert core.majority([None]) is None


# ---- kappa ----

def test_kappa_matches_the_js_formula_and_known_values():
    # 20 items: 15 agree (10 s/s, 5 n/n), 5 disagree. po 0.75, pe 0.53 -> kappa 0.4681
    # (the same numbers as continent-app/scripts/eval/lib/kappa.mjs cohenKappa on these pairs).
    pairs = [("s", "s")] * 10 + [("n", "n")] * 5 + [("s", "n")] * 3 + [("n", "s")] * 2
    k = cal.cohen_kappa(pairs + [(None, "s")])
    assert k["n"] == 20 and k["missing"] == 1 and k["po"] == 0.75
    assert k["pe"] == 0.53 and k["kappa"] == 0.4681
    assert k["band"] == "moderate" and k["ci95"][0] < 0.4681 < k["ci95"][1]
    one = cal.cohen_kappa([("s", "s")] * 5)
    assert one["kappa"] is None and "undefined" in one["note"]
    assert cal.gwet_ac1([("s", "s")] * 10 + [("n", "n")] * 10) == 1.0


def test_bootstrap_low_is_seeded_and_below_the_point():
    pairs = [("s", "s")] * 20 + [("n", "n")] * 20 + [("s", "n")] * 5 + [("n", "s")] * 5
    a, b = cal.bootstrap_low(pairs, 500, 7), cal.bootstrap_low(pairs, 500, 7)
    assert a == b and a < cal.cohen_kappa(pairs)["kappa"]


# ---- the threshold rule ----

def _sample(n_planted=20, n=50):
    items = [{"text_id": f"t{i:02d}", "kind": "trail_summary"} for i in range(1, n + 1)]
    key = {"planted": {f"t{i:02d}": ("fault" if i <= n_planted else None) for i in range(1, n + 1)}}
    return items, key


def _verdicts(judge, stale=False):
    return {"backend": "session", "model": "m", "prompt_sha": "x", "current_sha": "y" if stale else "x",
            "stale": stale, "verdicts": {k: {"verdict": v, "claims": []} for k, v in judge.items()}}


def test_a_good_judge_on_human_labels_counts():
    items, key = _sample()
    human = {it["text_id"]: ("unsupported" if i < 20 else "supported") for i, it in enumerate(items)}
    judge = dict(human)
    judge["t30"] = "unsupported"  # one disagreement
    c = cal.calibrate(items, key, human, _verdicts(judge), core.config())
    assert c["counts"], c["reasons"]
    assert c["kappa"]["kappa"] > 0.9 and c["planted"]["judge"]["share"] == 1.0


def test_the_rule_names_every_reason_it_does_not_count():
    items, key = _sample()
    human = {it["text_id"]: ("unsupported" if i < 20 else "supported") for i, it in enumerate(items)}
    c = cal.calibrate(items, key, human, _verdicts(dict(human)), core.config(), seeded=True)
    assert not c["counts"] and any("seeded" in r for r in c["reasons"])
    lazy = {k: "supported" for k in human}  # a judge that passes everything
    c = cal.calibrate(items, key, human, _verdicts(lazy), core.config())
    assert not c["counts"] and any("kappa" in r for r in c["reasons"]) and any("planted" in r for r in c["reasons"])
    c = cal.calibrate(items, key, human, _verdicts(dict(human), stale=True), core.config())
    assert not c["counts"] and any("prompt" in r for r in c["reasons"])
    few = {k: v for k, v in list(human.items())[:10]}
    c = cal.calibrate(items, key, few, _verdicts(dict(human)), core.config())
    assert any("labelled texts" in r for r in c["reasons"])
    assert not cal.calibrate(items, key, human, None, core.config())["counts"]


def test_threshold_lives_in_config():
    th = core.config()["threshold"]
    assert th["kappa_min"] == 0.7 and th["kappa_low95_min"] == 0.5 and th["planted_recall_min"] == 0.9
    assert th["accept_seeded"] is False


def test_seeded_labels_are_marked_and_respect_the_key():
    blob = seed_labels()
    assert blob["seeded"] is True and "NOT A HUMAN" in blob["note"]
    key = json.loads((ROOT / "evals" / "truth" / "judge" / "text-sample-key.json").read_text(encoding="utf-8"))
    for tid, fault in key["planted"].items():
        if fault:
            assert blob["labels"][tid] != "supported", tid
    on_disk = json.loads((ROOT / "pipeline" / "judge" / "calibration" / "seeded-labels.json").read_text(encoding="utf-8"))
    assert on_disk["labels"] == blob["labels"]


# ---- backends ----

def test_gemini_backend_on_fixtures():
    out, expected = run_fixtures()
    assert out["backend"] == "gemini" and out["model"] == "fixture-model" and out["prompt"] == "judge-text"
    assert {k: v["verdict"] for k, v in out["verdicts"].items()} == expected
    assert "judge" in G.FEATURES and G.FEATURES["judge"]["provider"] == "gemini"


def test_gemini_backend_refuses_the_claude_api():
    with pytest.raises(G.AIRefusal):
        backends.GeminiJudge(env={"GEMINI_API_KEY": "k"}, models=["claude-sonnet"])


def test_gemini_backend_without_a_key_is_off(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert cli(["gemini", "--items", str(FIX_ITEMS), "--out", "x.json"]) == 2


def test_session_backend_round_trip(tmp_path):
    items = core.load_items(FIX_ITEMS)
    man = backends.write_prompts(items, tmp_path / "p", "fixtures")
    assert sorted(man["ids"]) == ["f1", "f2", "f3", "f4", "f5"]
    assert (tmp_path / "p" / "f3.txt").read_text(encoding="utf-8") == core.build_prompt(items[2])
    vf = core.verdicts_file("session", "session judge", {"f1": {"verdict": "supported", "claims": []}}, "fixtures")
    path = core.write_json(str(tmp_path / "v.json"), vf)
    _, problems = backends.read_session(path, str(tmp_path / "p" / "manifest.json"))
    assert len(problems) == 4 and all("no usable verdict" in p for p in problems)
    vf["prompt_sha"] = "000000000000"
    core.write_json(path, vf)
    v, problems = backends.read_session(path)
    assert v["stale"] and any("made on prompt" in p for p in problems)


# ---- the runner's text layer ----

def _layer():
    import layer_texts
    return layer_texts


def test_texts_layer_is_registered_in_the_runner():
    import runner as vr
    assert vr.LAYERS["texts"] == "layer_texts" and vr.plugin("texts").NAME == "texts"


def test_texts_layer_keeps_an_uncalibrated_judge_out_of_the_gate(tmp_path):
    import runner as vr
    out, _ = run_fixtures()
    vpath = core.write_json(str(tmp_path / "v.json"), out)
    lt = _layer()
    ctx = {"items": str(FIX_ITEMS), "verdicts": vpath}
    res = vr.run(lt, ctx, now=NOW)
    m = res["metrics"]
    assert m["coverage"]["value"] == 1.0 and m["judged_supported"]["k"] == 2
    assert m["supported"]["value"] is None  # the calibration does not count: seeded labels
    assert res["carta"]["calibration"]["counts"] is False
    assert {g["id"] for g in res["gaps"]} == {"f2", "f3", "f5"} and res["gaps"][0]["verdict"] == "contradicted"
    assert set(res["by_country"]) == {"place_blurb", "trail_summary", "trip_text", "ask_answer", "translation"}


def test_texts_layer_gates_once_the_judge_counts(tmp_path):
    import runner as vr
    lt = _layer()
    out, _ = run_fixtures()
    v = core.read_verdicts(core.write_json(str(tmp_path / "v.json"), out))
    refs = lt.references({"items": str(FIX_ITEMS)})
    good = lt.match(refs, {"verdicts": v, "calibration": {"counts": True}})
    m, _ = vr.measure(good, {r["country"]: (1, 1) for r in good})
    assert m["supported"]["value"] == 0.4 and m["contradicted"]["value"] == 0.4
    base = {"metrics": {"supported": 0.6, "contradicted": 0.2, "coverage": 1.0}}
    g = vr.evaluate_gate(m, [dict(c, min_n=1) for c in lt.CHECKS], base, False)
    assert not g["ok"] and g["failures"][0]["metric"] == "supported"
    stale = dict(v, stale=True)
    none = lt.match(refs, {"verdicts": stale, "calibration": {"counts": True}})
    assert not any(r["flags"]["matched"] for r in none)
