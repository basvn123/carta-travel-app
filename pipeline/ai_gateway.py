"""The pipeline's one way to call a language model (T1137, ROADMAP E3).

The Python twin of supabase/functions/_shared/aiModels.mjs (model access) and
the input and output rules of aiGuard.mjs (T1117), for the batch jobs that
call a model: pipeline/dossier/rewrite_intros.py, pipeline/dossier/
parking_check.py, pipeline/ask_lexicon.py (--ollama) and the trip generator
Trips/carta-unified/carta-unified/pipeline/generate_trip.py. Nothing else may
name a provider endpoint; continent-app/tests/aiGateway.test.mjs greps the
repository and fails on any direct call.

Config. Each job is a feature in FEATURES. The environment overrides it, so a
switch of provider or model is a config change:

    AI_<FEATURE>_PROVIDER   gemini | workers-ai | openai | ollama
    AI_<FEATURE>_MODELS     comma-separated chain, first model first
    AI_<FEATURE>_BASE_URL   openai and ollama: the server (llama.cpp on the
                            build box, Scaleway, OVHcloud, Mistral, Ollama)

Keys: GEMINI_API_KEY; CF_ACCOUNT_ID and CF_AI_TOKEN for Workers AI;
AI_OPENAI_API_KEY for an OpenAI-compatible server that needs one. A job's
own --model flag pins the chain (Gateway(models=[...])). The Claude API is
refused as a config error (CLAUDE.md: never the Claude API).

Rules, the same as the Edge Functions (aiModels.mjs), with batch timings:
  input   the prompt is capped (max_prompt_chars, too_big); the harvested
          data a job passes as `screen` (or the whole user turn) is scanned
          for instruction-shaped text with aiGuard's rule families, and a hit
          refuses the call (unsafe): a batch job skips that item and logs it.
  output  an answer over max_output_chars is ai_bad_output; a prompt leak,
          chat-template tokens or a turned model (aiGuard's severe issues) is
          ai_bad_output too. The job's own schema check stays in the job.
  failure one time budget per call, a larger first attempt; 429 waits
          retry_429_s once and retries the model, then falls over; 404 falls
          over; 5xx or a dropped connection retries once, then falls over; a
          timeout falls over; any other 4xx stops. Refusals raise AIRefusal
          with one of AI_CODES.

Standard library only, so every job and test can import it.
"""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

AI_GATEWAY_VERSION = 1

PROVIDERS = ("gemini", "workers-ai", "openai", "ollama")

AI_CODES = {
    "no_ai": 503, "config": 503, "unsafe": 400, "too_big": 400,
    "ai_timeout": 504, "ai_error": 502, "global_cap": 429, "ai_bad_output": 502,
}

GEMINI_CHAIN = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

# Batch timings: no traveller waits, so the budget is long and a 429 waits.
FEATURES = {
    "intros": dict(provider="gemini", models=GEMINI_CHAIN, budget_s=600, first_s=120, later_s=120,
                   min_s=10, retry_429_s=30, min_interval_s=6.5,
                   max_prompt_chars=200_000, max_output_chars=200_000),
    "parking": dict(provider="gemini", models=GEMINI_CHAIN, budget_s=600, first_s=120, later_s=120,
                    min_s=10, retry_429_s=30, min_interval_s=6.5,
                    max_prompt_chars=20_000, max_output_chars=100_000),
    "trips": dict(provider="gemini", models=GEMINI_CHAIN, budget_s=1500, first_s=300, later_s=300,
                  min_s=20, retry_429_s=30, min_interval_s=6.5,
                  max_prompt_chars=600_000, max_output_chars=600_000),
    "lexicon": dict(provider="ollama", models=["qwen3:4b"], budget_s=600, first_s=300, later_s=300,
                    min_s=10, retry_429_s=0, min_interval_s=0,
                    max_prompt_chars=4_000, max_output_chars=20_000,
                    base_url="http://localhost:11434"),
}

DEFAULT_MODELS = {
    "gemini": GEMINI_CHAIN,
    "workers-ai": ["@cf/qwen/qwen3-30b-a3b-fp8"],
    "openai": [],
    "ollama": ["qwen3:4b"],
}
MAX_CHAIN = 6
FORBIDDEN = re.compile(r"anthropic|claude", re.I)


class AIRefusal(Exception):
    """A refused or failed call: code is one of AI_CODES, status its HTTP status."""

    def __init__(self, code, reason="", attempts=None, upstream=0):
        super().__init__(f"{code}{': ' + reason if reason else ''}")
        self.code = code
        self.status = AI_CODES.get(code, 502)
        self.reason = reason
        self.upstream = upstream
        self.attempts = attempts or []


@dataclass
class AIResult:
    text: str
    model: str
    provider: str
    fell_back: bool
    sources: list = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)
    attempts: list = field(default_factory=list)


def _env_name(feature):
    return "AI_" + re.sub(r"[^A-Z0-9]", "_", feature.upper())


def _list(s):
    return [m.strip() for m in str(s or "").split(",") if m.strip()]


def _dedupe(items):
    return list(dict.fromkeys(items))[:MAX_CHAIN]


def resolve_config(feature, env=None, models=None):
    """The resolved config for a feature, with cfg["error"] set when it may not run."""
    env = os.environ if env is None else env
    base = FEATURES.get(feature)
    if not base:
        return {"feature": feature, "provider": "", "models": [], "error": "unknown_feature"}
    pre = _env_name(feature)
    provider = str(env.get(f"{pre}_PROVIDER") or base["provider"]).strip().lower()
    if models:
        chain = _dedupe(models)
    elif _list(env.get(f"{pre}_MODELS")):
        chain = _dedupe(_list(env.get(f"{pre}_MODELS")))
    elif provider == base["provider"]:
        chain = list(base["models"])
    else:
        chain = list(DEFAULT_MODELS.get(provider, []))
    base_url = str(env.get(f"{pre}_BASE_URL") or (base.get("base_url") if provider == base["provider"] else "")
                   or env.get("AI_OPENAI_BASE_URL") or "").strip().rstrip("/")
    cfg = {**base, "feature": feature, "provider": provider, "models": chain, "base_url": base_url, "error": None}
    if provider not in PROVIDERS:
        cfg["error"] = "unknown_provider"
    elif not chain:
        cfg["error"] = "no_models"
    elif provider in ("openai", "ollama") and not re.match(r"^https?://[^/\s]+", base_url):
        cfg["error"] = "no_base_url"
    elif provider == "openai" and base_url.startswith("http://") and not re.match(r"^http://(localhost|127\.0\.0\.1)[:/]", base_url):
        cfg["error"] = "no_base_url"  # plain http only to a server on this machine
    if FORBIDDEN.search(provider) or any(FORBIDDEN.search(m) for m in chain) or FORBIDDEN.search(base_url):
        cfg["error"] = "claude_api_forbidden"
    return cfg


def should_fall_over(status):
    return status in (429, 404) or status >= 500


def attempt_timeout_s(index, elapsed_s, cfg):
    left = cfg["budget_s"] - max(0.0, elapsed_s or 0.0)
    if left < cfg["min_s"]:
        return 0
    return min(cfg["first_s"] if index == 0 else cfg["later_s"], left)


def parse_model_json(text, loose=False):
    """A model's JSON answer, or None. loose also takes a fenced block or the outermost {...}."""
    s = str(text or "")
    try:
        return json.loads(s.strip())
    except ValueError:
        if not loose:
            return None
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", s, re.I)
    if m:
        try:
            return json.loads(m.group(1))
        except ValueError:
            pass
    a, b = s.find("{"), s.rfind("}")
    if a >= 0 and b > a:
        try:
            return json.loads(s[a:b + 1])
        except ValueError:
            return None
    return None


# ---- the guard, ported from supabase/functions/_shared/aiGuard.mjs ----
# Same rule families over the same folded text; continent-app/tests/
# aiGateway.test.mjs runs both scanners over the attack set and fails when
# they disagree.

CANARY = "cg-k7q2-ward"
INVISIBLE = re.compile("[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\U000e0000-\U000e007f]")
HOMOGLYPH = {"\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y",
             "\u0445": "x", "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u0261": "g", "\u0131": "i"}
LEET = {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"}


def strip_invisible(s):
    return INVISIBLE.sub("", str(s or ""))


def fold_for_scan(s):
    t = unicodedata.normalize("NFKD", strip_invisible(s))
    t = re.sub("[\u0300-\u036f]", "", t).lower()
    t = re.sub("[\u0400-\u04ff\u0250-\u02af\u0131]", lambda m: HOMOGLYPH.get(m.group(0), m.group(0)), t)
    return re.sub(r"\s+", " ", t).strip()


def _de_leet(s):
    return re.sub(r"[013457@$]", lambda m: LEET[m.group(0)], s)


def _despace(s):
    return re.sub(r"\b(?:[a-z][ .\-_*]){3,}[a-z]\b", lambda m: re.sub(r"[ .\-_*]", "", m.group(0)), s)


_W = r"[^.!?\n]{0,40}"
INJECTION_RULES = [
    ("override", re.compile(rf"\b(ignore|disregard|forget|override|bypass|skip|drop)\b{_W}\b(previous|prior|above|earlier|preceding|all|any|your|these|those|system|original|carta'?s?)\b{_W}\b(instructions?|rules?|prompts?|directions?|guidelines?|constraints?|guardrails?)\b")),
    ("override_nl", re.compile(rf"\b(negeer|vergeet|omzeil)\b{_W}\b(instructies|regels|opdrachten|richtlijnen)\b")),
    ("override_de", re.compile(rf"\b(ignorier\w*|vergiss\w*|missachte\w*)\b{_W}\b(anweisungen|regeln|vorgaben|instruktionen)\b")),
    ("override_fr", re.compile(rf"\b(ignore[rz]?|oublie[rz]?)\b{_W}\b(instructions|regles|consignes)\b")),
    ("override_es", re.compile(rf"\b(ignora\w*|olvida\w*)\b{_W}\b(instrucciones|reglas|indicaciones)\b")),
    ("override_it", re.compile(rf"\b(ignora\w*|dimentica\w*)\b{_W}\b(istruzioni|regole|indicazioni)\b")),
    ("new_rules", re.compile(r"\b(new|updated|real|actual|true|additional|revised|override)\s+(system\s+)?(instructions?|rules|prompt|directives?|orders)\s*[:=]")),
    ("from_now", re.compile(r"\bfrom now on\b[^.!?\n]{0,40}\b(you|answer|respond|reply|only|always|never)\b")),
    ("role", re.compile(r"\byou are (now|no longer)\b|\b(act|behave|respond) as (an?\s+|the\s+)?(unfiltered|unrestricted|uncensored|different|new|evil|dan|developer|admin|root|system|jailbroken|hacker)\b|\bpretend (to be|you are|that you)\b|\broleplay as\b|\b(je bent nu|du bist jetzt|tu es maintenant|ahora eres|ora sei)\b")),
    ("jailbreak", re.compile(r"\b(jailbreak\w*|dan mode|developer mode|god mode|do anything now|unfiltered mode|no restrictions mode)\b")),
    ("reveal", re.compile(r"\b(reveal|print|show|repeat|output|tell me|display|leak|dump|recite|summari[sz]e)\b[^.!?\n]{0,30}\b(your|hidden|initial|original|secret|developer)\s+(system\s+)?(prompt|instructions|rules|configuration)\b|\bsystem (prompt|message|instructions)\b|\b(instructions|rules|prompt) (above|before this|you were given)\b")),
    ("template", re.compile(r"<\|?\s*(im_start|im_end|system|endoftext|start_of_turn|end_of_turn|eot_id|begin_of_text)\s*\|?>|\[/?inst\]|<</?sys>>|(^|\n)\s*(system|assistant|developer)\s*:|</?(system|instructions?|prompt)>|#{2,}\s*(system|instructions?|new rules)\b|\bbegin (system|new|hidden) (prompt|instructions)\b|<<<\s*(data|end)\b")),
    ("exfil", re.compile(r"\b(send|post|upload|forward|exfiltrate|e-?mail|transmit)\b[^.!?\n]{0,40}\b(to|at)\b[^.!?\n]{0,25}(https?:|www\.|@[a-z0-9-]+\.)|!\[[^\]]*\]\(\s*https?:")),
    ("social", re.compile(r"\b(mark|flag|label|report)\b[^.!?\n]{0,30}\b(as )?(cancel+ed|failed|urgent|invalid|fraud\w*|expired)\b|\btell the (traveller|traveler|user|reader|customer) (to|that)\b|\b(ai|assistant|model|chatbot|llm)\b[^.!?\n]{0,20}\b(must|should|shall|will) (now )?(say|write|tell|add|output|reply|answer)\b")),
    ("tooling", re.compile(r"\b(call|invoke|execute)\b[^.!?\n]{0,20}\b(tools?|functions?|commands?|shell|sql|api)\b")),
    ("output_ctrl", re.compile(r"\b(respond|reply|answer|output|say) (only )?with\b[^.!?\n]{0,30}\b(pwned|hacked|yes|ok|the word|exactly)\b|\b(add|include|insert)\b[^.!?\n]{0,30}\b(this|the following|a)\s+(link|url|warning|phone number|banner)\b")),
]
_RULES = dict(INJECTION_RULES)
HIJACK = re.compile(r"\bpwned\b|\bhacked\b|\bi (have been|was|am) (hacked|pwned|jailbroken|freed)\b|\bdeveloper mode (is )?(enabled|on|active)\b|\bdan mode\b|\bas an ai (language )?model\b|\bmy (system )?(prompt|instructions) (is|are|say|says)\b|\bi (will|shall|must) (now )?ignore\b")


def scan_injection(text):
    """{'hit': bool, 'rules': [ids]}: instruction-shaped text, on the folded text and with leetspeak and spacing undone."""
    f = fold_for_scan(text)
    if not f:
        return {"hit": False, "rules": []}
    variants = (f, _despace(_de_leet(f)))
    rules = [rid for rid, rx in INJECTION_RULES if any(rx.search(v) for v in variants)]
    return {"hit": bool(rules), "rules": rules}


def _words(s):
    return [w for w in re.sub(r"(?:[^\w ]|_)+", " ", fold_for_scan(s)).split(" ") if w]


def prompt_shingles(system_text, n=6):
    w = _words(system_text)
    return {" ".join(w[i:i + n]) for i in range(0, len(w) - n + 1)}


def scan_output_severe(text, shingles=None):
    """The severe output issues of aiGuard.scanOutput: canary, leak, template, hijack."""
    s = str(text or "")
    f = fold_for_scan(s)
    issues = []
    if CANARY in f:
        issues.append("canary")
    if shingles:
        w = _words(s)
        if any(" ".join(w[i:i + 6]) in shingles for i in range(0, len(w) - 5)):
            issues.append("leak")
    if _RULES["template"].search(f):
        issues.append("template")
    if HIJACK.search(f):
        issues.append("hijack")
    return issues


# ---- provider adapters ----

class _HttpStatus(Exception):
    def __init__(self, status):
        super().__init__(f"status {status}")
        self.status = status


def _post(url, body, headers, timeout_s, opener):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with opener(req, timeout=timeout_s) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise _HttpStatus(exc.code) from None


def _gemini(cfg, env, req, model, timeout_s, opener):
    key = env.get("GEMINI_API_KEY")
    body = {
        "contents": [{"role": "user", "parts": [{"text": req["user"]}]}],
        "generationConfig": {"temperature": req["temperature"], "maxOutputTokens": req["max_tokens"]},
    }
    if req["system"]:
        body["systemInstruction"] = {"parts": [{"text": req["system"]}]}
    if req["search"]:
        body["tools"] = [{"google_search": {}}]
    elif req["json"]:
        body["generationConfig"]["responseMimeType"] = "application/json"
        if req["schema"] is not None:
            body["generationConfig"]["responseSchema"] = req["schema"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:generateContent"
    data = _post(url, body, {"x-goog-api-key": key}, timeout_s, opener)
    cand = (data.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []))
    gm = cand.get("groundingMetadata") or {}
    sources = [c.get("web", {}).get("uri") for c in gm.get("groundingChunks", []) if c.get("web", {}).get("uri")]
    u = data.get("usageMetadata") or {}
    return text, sources, {"in": u.get("promptTokenCount", 0), "out": u.get("candidatesTokenCount", 0)}, data


def _chat(url, key, req, model, timeout_s, opener):
    msgs = ([{"role": "system", "content": req["system"]}] if req["system"] else []) + \
        [{"role": "user", "content": req["user"]}]
    body = {"model": model, "messages": msgs, "temperature": req["temperature"], "max_tokens": req["max_tokens"]}
    if req["json"]:
        body["response_format"] = {"type": "json_object"}
    data = _post(url, body, {"Authorization": f"Bearer {key}"} if key else {}, timeout_s, opener)
    text = str(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    u = data.get("usage") or {}
    return text, [], {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0)}, data


def _workers(cfg, env, req, model, timeout_s, opener):
    acct = urllib.parse.quote(str(env.get("CF_ACCOUNT_ID") or ""))
    return _chat(f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/v1/chat/completions",
                 env.get("CF_AI_TOKEN"), req, model, timeout_s, opener)


def _openai(cfg, env, req, model, timeout_s, opener):
    return _chat(f"{cfg['base_url']}/chat/completions", env.get("AI_OPENAI_API_KEY"), req, model, timeout_s, opener)


def _ollama(cfg, env, req, model, timeout_s, opener):
    body = {"model": model, "prompt": req["user"], "stream": False, "options": {"temperature": req["temperature"]}}
    if req["system"]:
        body["system"] = req["system"]
    if req["json"]:
        body["format"] = "json"
    data = _post(f"{cfg['base_url']}/api/generate", body, {}, timeout_s, opener)
    return str(data.get("response") or ""), [], {"in": data.get("prompt_eval_count", 0), "out": data.get("eval_count", 0)}, data


ADAPTERS = {"gemini": _gemini, "workers-ai": _workers, "openai": _openai, "ollama": _ollama}
READY = {
    "gemini": lambda env: bool(env.get("GEMINI_API_KEY")),
    "workers-ai": lambda env: bool(env.get("CF_ACCOUNT_ID") and env.get("CF_AI_TOKEN")),
    "openai": lambda env: True,  # a local llama.cpp server needs no key
    "ollama": lambda env: True,
}


class Gateway:
    """One job's model access: its config, the rate floor between calls and token counters.

    gw = Gateway("intros", models=[args.model] if args.model else None)
    res = gw.call(user, system=SYSTEM, json=True, screen=[extract, ...])
    """

    def __init__(self, feature, models=None, env=None, opener=None, clock=None, sleep=None, min_interval_s=None):
        self.env = os.environ if env is None else env
        self.cfg = resolve_config(feature, self.env, models)
        if self.cfg["error"]:
            raise AIRefusal("config", self.cfg["error"])
        if not READY[self.cfg["provider"]](self.env):
            raise AIRefusal("no_ai", f"{self.cfg['provider']} is not configured (key or account id missing)")
        self.feature = feature
        self.provider = self.cfg["provider"]
        self.models = self.cfg["models"]
        self.model = self.models[0]
        self.tokens_in = self.tokens_out = 0
        self.min_interval_s = self.cfg["min_interval_s"] if min_interval_s is None else min_interval_s
        self._opener = opener or urllib.request.urlopen
        self._clock = clock or time.monotonic
        self._sleep = sleep or time.sleep
        self._last = None

    def _pace(self):
        if self._last is not None:
            wait = self._last + self.min_interval_s - self._clock()
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()

    def call(self, user, *, system="", json=False, schema=None, search=False, temperature=0.2,
             max_tokens=8192, screen=None):
        """One call under the rules in the module docstring. Returns AIResult or raises AIRefusal."""
        cfg = self.cfg
        if search and self.provider != "gemini":
            raise AIRefusal("ai_error", "search_unsupported")
        if len(system or "") + len(user or "") > cfg["max_prompt_chars"]:
            raise AIRefusal("too_big", "prompt")
        for item in ([user] if screen is None else screen):
            hit = scan_injection(item)
            if hit["hit"]:
                raise AIRefusal("unsafe", ",".join(hit["rules"]))
        req = {"user": user, "system": system, "json": json, "schema": schema, "search": search,
               "temperature": temperature, "max_tokens": max_tokens}
        adapter = ADAPTERS[self.provider]
        attempts = []
        start = self._clock()
        last_status = 0
        timed_out = False
        i = 0
        for model in self.models:
            tries = 0
            waited = False
            while True:
                t = attempt_timeout_s(i, self._clock() - start, cfg)
                if not t:
                    break
                self._pace()
                t0 = self._clock()
                try:
                    text, sources, usage, raw = adapter(cfg, self.env, req, model, t, self._opener)
                except _HttpStatus as exc:
                    i += 1
                    last_status = exc.status
                    attempts.append({"model": model, "status": exc.status})
                    if exc.status == 429 and cfg["retry_429_s"] and not waited and \
                            self._clock() - start + cfg["retry_429_s"] + cfg["min_s"] < cfg["budget_s"]:
                        waited = True
                        print(f"  note: {model} rate limited, waiting {cfg['retry_429_s']}s")
                        self._sleep(cfg["retry_429_s"])
                        continue
                    if exc.status >= 500 and tries == 0:
                        tries += 1
                        continue
                    if should_fall_over(exc.status):
                        print(f"  note: {model} returned {exc.status}, trying the next model")
                        break
                    raise AIRefusal("ai_error", f"{model} returned {exc.status}", attempts, exc.status) from None
                except TimeoutError as exc:
                    i += 1
                    attempts.append({"model": model, "status": 0, "error": "timeout"})
                    timed_out = True
                    print(f"  note: {model} timed out ({exc}), trying the next model")
                    break
                except (urllib.error.URLError, ConnectionError, OSError, ValueError) as exc:
                    i += 1
                    reason = getattr(exc, "reason", None)
                    if isinstance(reason, TimeoutError):
                        attempts.append({"model": model, "status": 0, "error": "timeout"})
                        timed_out = True
                        break
                    attempts.append({"model": model, "status": 0, "error": "network"})
                    if tries == 0:
                        tries += 1
                        continue
                    break
                attempts.append({"model": model, "status": 200, "s": round(self._clock() - t0, 1)})
                if len(text) > cfg["max_output_chars"]:
                    raise AIRefusal("ai_bad_output", "too_long", attempts)
                severe = scan_output_severe(text, prompt_shingles(system) if system else None)
                if severe:
                    raise AIRefusal("ai_bad_output", "unsafe_output:" + ",".join(severe), attempts)
                self.model = model
                self.tokens_in += usage.get("in", 0) or 0
                self.tokens_out += usage.get("out", 0) or 0
                return AIResult(text=text, model=model, provider=self.provider, fell_back=model != self.models[0],
                                sources=sources, usage=usage, raw=raw, attempts=attempts)
        if timed_out and last_status != 429:
            raise AIRefusal("ai_timeout", "", attempts)
        if last_status == 429:
            raise AIRefusal("global_cap", "every model is rate limited", attempts, 429)
        raise AIRefusal("ai_error", f"every model failed (last {last_status})", attempts, last_status)
