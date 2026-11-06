"""T1137 (ROADMAP E3): pipeline/ai_gateway.py, the pipeline's one way to call a model.

No network and no key: a fake opener stands in for urllib, a fake clock for
time. Covers the config (defaults, env switch, the Claude API refused), the
failure rules (the same as aiModels.mjs, with batch timings), the input
screen and output check over the pipeline attacks of
evals/injection/attacks.json, and the four jobs that now call through it.

    python -m pytest tests/test_ai_gateway.py -q
"""

import io
import json
import socket
import sys
import urllib.error
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import ai_gateway as G  # noqa: E402

SET = json.loads((ROOT / "evals" / "injection" / "attacks.json").read_text(encoding="utf-8"))
ENV = {"GEMINI_API_KEY": "k"}


class Clock:
    def __init__(self):
        self.t = 0.0
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def gem(text, sources=()):
    return {"candidates": [{"content": {"parts": [{"text": text}]},
                            "groundingMetadata": {"groundingChunks": [{"web": {"uri": u}} for u in sources]}}],
            "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 3}, "modelVersion": "m"}


def opener(replies, calls):
    """replies: dicts (a JSON answer), ints (an HTTP status) or exceptions."""
    def fn(req, timeout=None):
        calls.append({"url": req.full_url, "body": json.loads(req.data), "headers": dict(req.header_items()), "timeout": timeout})
        r = replies.pop(0)
        if isinstance(r, BaseException):
            raise r
        if isinstance(r, int):
            raise urllib.error.HTTPError(req.full_url, r, "x", {}, None)
        return _Resp(json.dumps(r).encode())
    return fn


def gw(feature="intros", replies=(), env=None, **kw):
    calls = []
    c = Clock()
    g = G.Gateway(feature, env=env if env is not None else ENV, opener=opener(list(replies), calls),
                  clock=c.now, sleep=c.sleep, **kw)
    return g, calls, c


# ---- config ----

def test_defaults_and_switch_by_env():
    assert G.resolve_config("intros", {})["provider"] == "gemini"
    assert G.resolve_config("lexicon", {})["provider"] == "ollama"
    c = G.resolve_config("intros", {"AI_INTROS_PROVIDER": "openai", "AI_INTROS_MODELS": "qwen3-30b",
                                    "AI_INTROS_BASE_URL": "http://localhost:8080/v1"})
    assert (c["provider"], c["models"], c["base_url"], c["error"]) == ("openai", ["qwen3-30b"], "http://localhost:8080/v1", None)
    assert G.resolve_config("intros", {}, models=["a", "a", "b"])["models"] == ["a", "b"]
    assert G.resolve_config("nope", {})["error"] == "unknown_feature"


@pytest.mark.parametrize("env", [
    {"AI_INTROS_PROVIDER": "anthropic"},
    {"AI_INTROS_MODELS": "claude-opus-5-5"},
    {"AI_INTROS_PROVIDER": "openai", "AI_INTROS_MODELS": "m", "AI_INTROS_BASE_URL": "https://api.anthropic.com/v1"},
])
def test_the_claude_api_is_refused(env):
    assert G.resolve_config("intros", env)["error"] == "claude_api_forbidden"
    with pytest.raises(G.AIRefusal) as e:
        G.Gateway("intros", env={**ENV, **env})
    assert e.value.code == "config"


def test_bad_config_and_missing_key():
    assert G.resolve_config("intros", {"AI_INTROS_PROVIDER": "openai", "AI_INTROS_MODELS": "m",
                                       "AI_INTROS_BASE_URL": "http://remote.example/v1"})["error"] == "no_base_url"
    with pytest.raises(G.AIRefusal) as e:
        G.Gateway("intros", env={})
    assert e.value.code == "no_ai"


# ---- the failure rules ----

def test_one_call_carries_system_json_and_key():
    g, calls, _ = gw(replies=[gem('{"intros":[]}')])
    r = g.call("U", system="S", json=True)
    assert r.text == '{"intros":[]}' and r.model == "gemini-flash-latest" and not r.fell_back
    b = calls[0]["body"]
    assert b["systemInstruction"] == {"parts": [{"text": "S"}]}
    assert b["generationConfig"]["responseMimeType"] == "application/json"
    assert calls[0]["headers"]["X-goog-api-key"] == "k"
    assert calls[0]["timeout"] == 120
    assert (g.tokens_in, g.tokens_out) == (7, 3)


def test_429_waits_once_then_falls_over_404_falls_over_5xx_retried_once():
    g, calls, c = gw(replies=[429, 429, 404, gem("ok")])
    r = g.call("U")
    assert r.model == G.GEMINI_CHAIN[2] and r.fell_back
    assert 30 in c.slept
    g, _, _ = gw(replies=[503, gem("ok")])
    assert g.call("U").model == G.GEMINI_CHAIN[0]
    g, calls, _ = gw(replies=[URLError_reset(), gem("ok")])
    assert g.call("U").model == G.GEMINI_CHAIN[0]


def URLError_reset():
    return urllib.error.URLError(ConnectionResetError("reset"))


def test_refusals():
    g, _, _ = gw(replies=[429, 429, 429, 429, 429, 429])
    with pytest.raises(G.AIRefusal) as e:
        g.call("U")
    assert (e.value.code, e.value.status) == ("global_cap", 429)
    g, calls, _ = gw(replies=[400, gem("never")])
    with pytest.raises(G.AIRefusal) as e:
        g.call("U")
    assert (e.value.code, e.value.upstream, len(calls)) == ("ai_error", 400, 1)
    g, _, _ = gw(replies=[socket.timeout("t"), TimeoutError("t"), urllib.error.URLError(socket.timeout("t"))])
    with pytest.raises(G.AIRefusal) as e:
        g.call("U")
    assert e.value.code == "ai_timeout"
    g, _, _ = gw(replies=[gem("x" * 200_001)])
    with pytest.raises(G.AIRefusal) as e:
        g.call("U")
    assert (e.value.code, e.value.reason) == ("ai_bad_output", "too_long")
    g, _, _ = gw(feature="parking")
    with pytest.raises(G.AIRefusal) as e:
        g.call("x" * 20_001)
    assert e.value.code == "too_big"


def test_rate_floor_between_calls():
    g, _, c = gw(replies=[gem("a"), gem("b")])
    g.call("U")
    g.call("U")
    assert c.slept and abs(c.slept[0] - 6.5) < 1e-9


def test_openai_compatible_and_ollama_requests():
    env = {"AI_INTROS_PROVIDER": "openai", "AI_INTROS_MODELS": "qwen", "AI_INTROS_BASE_URL": "http://localhost:8080/v1"}
    g, calls, _ = gw(env=env, replies=[{"choices": [{"message": {"content": "hi"}}], "usage": {"prompt_tokens": 2}}])
    assert g.call("U", system="S", json=True).text == "hi"
    assert calls[0]["url"] == "http://localhost:8080/v1/chat/completions"
    assert calls[0]["body"]["messages"] == [{"role": "system", "content": "S"}, {"role": "user", "content": "U"}]
    g, calls, _ = gw(feature="lexicon", env={}, replies=[{"response": '["a"]'}])
    assert g.call("U", json=True).text == '["a"]'
    assert calls[0]["url"] == "http://localhost:11434/api/generate" and calls[0]["body"]["format"] == "json"
    with pytest.raises(G.AIRefusal) as e:
        gw(env=env)[0].call("U", search=True)
    assert e.value.reason == "search_unsupported"


def test_grounded_call_returns_sources():
    g, calls, _ = gw(feature="parking", replies=[gem("{}", ["https://comune.example/parking"])])
    r = g.call("Rome", search=True)
    assert r.sources == ["https://comune.example/parking"]
    assert calls[0]["body"]["tools"] == [{"google_search": {}}]
    assert "responseSchema" not in calls[0]["body"]["generationConfig"]


# ---- the pipeline attacks ----

PIPE = [a for a in SET["attacks"] if a["surface"] == "pipeline"]


def test_the_set_has_pipeline_attacks():
    assert len(PIPE) >= 8


SYSTEMS = {"parking": "You verify parking facts for a European travel guide. Use web search to find what the city publishes.",
           "intros": "You rewrite destination intros for a travel guide."}


@pytest.mark.parametrize("a", PIPE, ids=[a["id"] for a in PIPE])
def test_pipeline_attack(a):
    feat = a["input"]["feature"]
    g, calls, _ = gw(feature=feat, replies=[gem(a["recorded"])])
    data = [a["input"]["extract"]] if "extract" in a["input"] else [a["input"]["city"], a["input"]["country"]]
    with pytest.raises(G.AIRefusal) as e:
        g.call("FACTS: ...\n" + "\n".join(data), system=SYSTEMS[feat], screen=data)
    if a["expect"] == "refused":
        assert e.value.code == "unsafe"
        assert calls == [], "the model was called"
    else:
        assert e.value.code == "ai_bad_output" and e.value.reason.startswith("unsafe_output")


def test_benign_harvested_text_passes():
    texts = [s for s in SET["benign"].get("askAnswer", [])][:40] + [
        "Lisbon is the capital of Portugal, spread over seven hills above the Tagus.",
        "Ignore the touts at the station; the tram stop is two minutes away.",
    ]
    for t in texts:
        assert not G.scan_injection(t)["hit"], t
    g, _, _ = gw(replies=[gem('{"intros":[{"id":"lis","text":"Seven hills above the Tagus."}]}')])
    assert g.call("U", system=SYSTEMS["intros"], screen=texts).text.startswith('{"intros"')


# ---- the jobs call through the gateway ----

def test_trip_chain_matches_the_gateway():
    sys.path.insert(0, str(ROOT / "Trips" / "carta-unified" / "carta-unified" / "pipeline"))
    import generate_trip as T
    # golden_set.py hashes T.MODEL_CHAIN; the gateway must run the same chain.
    assert T.MODEL_CHAIN == G.FEATURES["trips"]["models"]



@pytest.mark.parametrize("path,feature", [
    ("pipeline/dossier/rewrite_intros.py", "intros"),
    ("pipeline/dossier/parking_check.py", "parking"),
    ("pipeline/ask_lexicon.py", "lexicon"),
    ("Trips/carta-unified/carta-unified/pipeline/generate_trip.py", "trips"),
])
def test_jobs_use_the_gateway(path, feature):
    src = (ROOT / path).read_text(encoding="utf-8")
    assert f'Gateway("{feature}"' in src
    assert "generativelanguage.googleapis.com" not in src and "urlopen(" not in src


def test_trip_client_returns_a_gemini_shaped_body_for_any_provider(monkeypatch):
    sys.path.insert(0, str(ROOT / "Trips" / "carta-unified" / "carta-unified" / "pipeline"))
    import generate_trip as T

    def fake_call(self, user, **kw):
        return G.AIResult(text='{"a":1}', model="qwen", provider="openai", fell_back=False,
                          sources=["https://s.example"], usage={"in": 4, "out": 2}, attempts=[{"s": 1.5}])

    monkeypatch.setattr(G.Gateway, "call", fake_call)
    monkeypatch.setenv("AI_TRIPS_PROVIDER", "openai")
    monkeypatch.setenv("AI_TRIPS_MODELS", "qwen")
    monkeypatch.setenv("AI_TRIPS_BASE_URL", "http://localhost:8080/v1")
    client = T.GeminiClient()
    assert client.models == ["qwen"], "AI_TRIPS_MODELS switches the chain"
    body = client.generate("pass1", "U")
    assert body["candidates"][0]["content"]["parts"][0]["text"] == '{"a":1}'
    assert body["usageMetadata"] == {"promptTokenCount": 4, "candidatesTokenCount": 2}
    assert body["_requested"] == "qwen" and body["_elapsedS"] == 1.5


# ---- T1139 (E4): one privacy safe event per call ----

def test_every_call_leaves_one_event_without_text(tmp_path):
    out = tmp_path / "ev.jsonl"
    g, _, _ = gw(replies=[gem("SECRET-ANSWER"), 400], env={**ENV, "AI_EVENTS_JSONL": str(out)})
    g.call("SECRET-PROMPT", system="sys")
    with pytest.raises(G.AIRefusal):
        g.call("SECRET-PROMPT")
    assert [e["outcome"] for e in g.events] == ["ok", "failed"]
    assert g.events[0]["tokens_in"] == 7 and g.events[0]["tokens_out"] == 3
    assert g.events[1]["code"] == "ai_error"
    raw = out.read_text(encoding="utf-8")
    assert len(raw.strip().splitlines()) == 2
    assert "SECRET" not in raw and "SECRET" not in json.dumps(g.events)


def test_a_refused_call_still_leaves_an_event():
    g, _, _ = gw(replies=[])
    with pytest.raises(G.AIRefusal):
        g.call("x" * 300_000)
    assert g.events[0]["outcome"] == "refused" and g.events[0]["code"] == "too_big"
