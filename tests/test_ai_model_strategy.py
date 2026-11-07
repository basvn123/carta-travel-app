"""T1138 (ROADMAP E7): the model strategy config and the box provider.

No network and no key. Checks that continent-app/config/ai_models.json holds
three or more options per AI feature with a cost that the stated formula
reproduces and a quality that is either measured or an owner run with a
command; that the switch triggers are complete; that the gateway's box
provider only serves a batch job that passed its eval (BOX_PASSED), never a
grounded job and never a live feature; and that no default moved.

    python -m pytest tests/test_ai_model_strategy.py -q
"""

import io
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import ai_gateway as G  # noqa: E402

CFG_PATH = ROOT / "continent-app" / "config" / "ai_models.json"
DOC_PATH = ROOT / "docs" / "ai" / "model-strategy.md"
CFG = json.loads(CFG_PATH.read_text(encoding="utf-8"))
LIVE = ("ask", "plan-day", "suggest-city", "parse-booking")
BATCH = ("intros", "tagging", "summaries", "blog")
BOX = {"AI_INTROS_PROVIDER": "box"}


def expected_cost(opt, tin, tout):
    p = CFG["options"][opt]
    if p["provider"] == "none":
        return 0.0
    if p["provider"] == "box":
        c = CFG["box_cpu"]
        s = tin / (c["prompt_tok_s"] * c["parallel_slots_speedup"]) + tout / (c["gen_tok_s"] * c["parallel_slots_speedup"])
        return round(1000 * s / 3600 * c["eur_per_month"] / c["hours_per_month"], 2)
    fx = CFG["fx_eur_per_usd"] if p["currency"] == "USD" else 1
    return round((tin * p["in_per_m"] + (tout + p["extra_out_tokens"]) * p["out_per_m"]) / 1000 * fx, 2)


# ---- the cost and quality table ----

def test_every_ai_feature_has_three_options():
    assert set(LIVE + BATCH) <= set(CFG["features"])
    for fid, f in CFG["features"].items():
        assert len(f["options"]) >= 3, fid
        assert f["kind"] == ("live" if fid in LIVE else "batch")
        for o in f["options"]:
            assert o["option"] in CFG["options"], (fid, o["option"])


@pytest.mark.parametrize("fid", sorted(CFG["features"]))
def test_costs_follow_the_formula(fid):
    f = CFG["features"][fid]
    tin, tout = f["tokens_per_call"]["input"], f["tokens_per_call"]["output"]
    for o in f["options"]:
        assert o["cost_eur_per_1000_calls"] == expected_cost(o["option"], tin, tout), (fid, o["option"])


def test_costs_match_the_research():
    """E-R3 section 5 (Ask, plan-day) and the batch table (intros, tagging on the box)."""
    cost = {(fid, o["option"]): o["cost_eur_per_1000_calls"] for fid, f in CFG["features"].items() for o in f["options"]}
    assert cost[("ask", "gemini-3.5-flash-lite")] == 1.04
    assert cost[("ask", "workers-qwen3-30b")] == 0.15
    assert cost[("plan-day", "gemini-3.5-flash-lite")] == 3.13
    assert cost[("parse-booking", "scaleway-gemma-4-26b")] == 1.5
    assert round(cost[("intros", "box-qwen3-30b-cpu")] * 390 / 1000, 2) == 0.31
    assert round(cost[("tagging", "box-qwen3-30b-cpu")] * 20, 1) == 0.8


def test_quality_is_measured_or_an_owner_run():
    for fid, f in CFG["features"].items():
        for o in f["options"]:
            q = o["quality"]
            assert q["status"] in ("measured", "owner_run"), (fid, o["option"])
            if q["status"] == "measured":
                assert isinstance(q["value"], (int, float)) and 0 <= q["value"] <= 1
                assert q["metric"] and q["eval"] and q["source"]
            else:
                assert q["value"] is None and q["command"], (fid, o["option"])


def test_the_measured_scores_are_the_recorded_ones():
    q = {(fid, o["option"]): o["quality"].get("value") for fid, f in CFG["features"].items() for o in f["options"]}
    assert q[("ask", "workers-qwen3-30b")] == 0.887      # T563 v3, 619 of 698 sentences kept
    assert q[("plan-day", "no-model")] == 1.0            # reference planner, 20 of 20
    assert q[("summaries", "no-model")] == 1.0           # templates, 2,089 of 2,089


# ---- the switch triggers ----

def test_triggers_are_complete():
    s = CFG["switch"]
    metrics = {t["metric"] for t in s["triggers"]}
    assert {"mau", "cost_eur_per_day", "quality_drop_points"} <= metrics
    ids = [t["id"] for t in s["triggers"]]
    assert len(ids) == len(set(ids))
    for t in s["triggers"]:
        assert t["action"] and t["owner"] and t["op"] in (">=", ">", "any")
    gpu = s["gpu"]
    # the GPU trigger is 1.5 times a GEX45 a month, per day
    gpu_day = round(gpu["eur_per_month"] * gpu["multiple"] / 30.5, 1)
    assert next(t for t in s["triggers"] if t["id"] == "gpu")["value"] == gpu_day
    assert s["quality_drop_points"] == 2.0


def test_no_dashes_and_no_claude_in_the_config_and_doc():
    for p in (CFG_PATH, DOC_PATH):
        text = p.read_text(encoding="utf-8")
        assert "\u2013" not in text and "\u2014" not in text, p
    for o in CFG["options"].values():
        assert not G.FORBIDDEN.search(json.dumps(o)), o


# ---- the box provider in the gateway ----

def test_box_mirrors_the_config():
    assert CFG["box_passed"] == G.BOX_PASSED
    assert CFG["options"]["box-qwen3-30b-cpu"]["model"] == G.BOX_MODEL
    for job in G.BOX_PASSED:
        assert job in G.FEATURES and job not in G.BOX_NEVER


def test_live_features_are_not_in_the_pipeline_gateway():
    for fid in LIVE:
        assert fid not in G.FEATURES
        assert G.resolve_config(fid, {"AI_" + fid.upper().replace("-", "_") + "_PROVIDER": "box"})["error"] == "unknown_feature"


def test_defaults_did_not_move():
    for job in ("intros", "parking", "trips", "tagging", "summaries", "blog"):
        assert G.resolve_config(job, {})["provider"] == "gemini"
    assert G.resolve_config("lexicon", {})["provider"] == "ollama"


def test_box_needs_a_passed_eval():
    assert G.resolve_config("intros", BOX)["error"] == "box_not_passed"
    c = G.resolve_config("intros", {**BOX, "AI_BOX_EVAL_RUN": "1"})
    assert c["error"] is None
    assert (c["provider"], c["models"], c["base_url"]) == ("box", [G.BOX_MODEL], G.BOX_BASE_URL)
    with pytest.raises(G.AIRefusal) as e:
        G.Gateway("intros", env=BOX)
    assert e.value.code == "config" and "box_not_passed" in str(e.value)


def test_a_passed_job_selects_the_box(monkeypatch):
    monkeypatch.setitem(G.BOX_PASSED, "intros", {"eval": "intros", "score": 0.9, "threshold": 0.88,
                                                 "model": G.BOX_MODEL, "date": "2026-11-06"})
    c = G.resolve_config("intros", BOX)
    assert c["error"] is None and c["provider"] == "box"
    # CPU timings: long waits, no rate floor, no 429 wait
    assert c["min_interval_s"] == 0 and c["retry_429_s"] == 0 and c["first_s"] >= 1200
    # another job is still refused
    assert G.resolve_config("tagging", {"AI_TAGGING_PROVIDER": "box"})["error"] == "box_not_passed"


def test_grounded_jobs_never_run_on_the_box(monkeypatch):
    monkeypatch.setitem(G.BOX_PASSED, "parking", {"eval": "x"})
    assert G.resolve_config("parking", {"AI_PARKING_PROVIDER": "box", "AI_BOX_EVAL_RUN": "1"})["error"] == "box_unsupported"


@pytest.mark.parametrize("url,error", [
    ("http://localhost:9000/v1", None),
    ("https://box.example.eu/v1", None),
    ("http://box.example.eu/v1", "no_base_url"),
    ("ftp://box", "no_base_url"),
])
def test_box_base_url(url, error):
    env = {**BOX, "AI_BOX_EVAL_RUN": "1", "AI_BOX_BASE_URL": url}
    assert G.resolve_config("intros", env)["error"] == error
    # the job's own base URL wins over the shared one
    env2 = {**env, "AI_INTROS_BASE_URL": "http://127.0.0.1:8081/v1"}
    assert G.resolve_config("intros", env2)["base_url"] == "http://127.0.0.1:8081/v1"


def test_box_refuses_the_claude_api():
    env = {**BOX, "AI_BOX_EVAL_RUN": "1", "AI_INTROS_MODELS": "claude-haiku"}
    assert G.resolve_config("intros", env)["error"] == "claude_api_forbidden"


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_box_call_is_an_openai_compatible_request_without_a_key():
    calls = []

    def opener(req, timeout=None):
        calls.append({"url": req.full_url, "body": json.loads(req.data), "headers": dict(req.header_items())})
        return _Resp(json.dumps({"choices": [{"message": {"content": '{"ok": 1}'}}],
                                 "usage": {"prompt_tokens": 5, "completion_tokens": 2}}).encode())

    g = G.Gateway("intros", env={**BOX, "AI_BOX_EVAL_RUN": "1"}, opener=opener, sleep=lambda s: None)
    r = g.call("U", system="S", json=True)
    assert (r.text, r.provider, r.model) == ('{"ok": 1}', "box", G.BOX_MODEL)
    assert calls[0]["url"] == G.BOX_BASE_URL + "/chat/completions"
    assert calls[0]["body"]["response_format"] == {"type": "json_object"}
    assert "Authorization" not in calls[0]["headers"]
    assert (g.tokens_in, g.tokens_out) == (5, 2)
