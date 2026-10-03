#!/usr/bin/env python3
"""Generate one trip in three passes with three different jobs (T144, spec K2).

    python pipeline/generate_trip.py run BRIEF.json [--out DIR] [--model M] [--no-reuse]
    python pipeline/generate_trip.py run BRIEF.json --stub DIR      replay recorded answers
    python pipeline/generate_trip.py pass-schema 1|2|3              what each pass is asked
    python pipeline/generate_trip.py cost [--ledger FILE]           spend per trip and pass
    python pipeline/generate_trip.py self-test                       no network

One prompt asked for a whole trip gives confident, uneven output. So a trip is
built in three narrow passes, each with its own prompt (pipeline/prompts/k2-*.md),
its own slice of the v2.1 contract (schema/trip.generated.schema.json, T143) and
its own mechanical check before the next pass may start:

  pass 1, the SKELETON   route, days, bases, named places. The only pass that
                         uses judgement. No figures allowed.
  pass 2, the PROSE      Morning, Afternoon, Evening, summary, tips, packing,
                         risks, from the skeleton and nothing else. Hard word
                         caps (spec D4) and no figure with a unit or a currency.
  pass 3, the NUMBERS    costs, distances, ascent, times, prices, surface split,
                         booking windows. Run with Google Search grounding, and
                         forbidden from inventing a figure it cannot source: a
                         figure needs an evidence row whose URL matches a page
                         the grounding metadata says was read; otherwise the
                         figure is withheld (null plus a verifyFlag) or, for
                         the budget rows that may not be null, the trip fails.

Only pass three touches grounded search, the surface that costs money
(CARTA_UNIT_ECONOMICS.md 2.2). The three answers are merged, derive() from
generation_gate.py fills the arithmetic fields, and generation_gate.admit()
decides whether the record is written. Nothing is repaired on the way.

Every call's token counts and search counts go to a ledger (ledger.jsonl in the
output folder), priced from the table below, so the cost per trip is recorded
rather than estimated. Runtime and pipeline AI is Gemini only (CLAUDE.md); the
Claude API is never called.
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import generation_gate as G  # noqa: E402

ROOT = G.ROOT
PROMPT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts")
DEFAULT_OUT = os.path.join(ROOT, "data", "generated")
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# The chain pipeline/dossier/rewrite_intros.py uses; each model has its own quota.
MODEL_CHAIN = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

# Word caps from carta-trips-enhancement-spec.md D4: summary under 120 words,
# each Morning/Afternoon/Evening under 45, each pro tip under 35.
SUMMARY_WORDS, DAY_WORDS, TIP_WORDS = 120, 45, 35

# USD list prices from https://ai.google.dev/gemini-api/docs/pricing, read
# 2026-10-03: (input per 1M tokens, output per 1M tokens including thinking,
# search price per 1,000, what the search price counts). Gemini 2.5 bills
# grounding per grounded prompt after 1,500 free a day; Gemini 3.x bills per
# search request after 5,000 free a month. Matched on the longest prefix of
# the modelVersion the API reports; an unknown model prices as None and the
# ledger says so rather than guessing. Free quotas are not subtracted: the
# ledger is the worst case.
PRICES = {
    "gemini-2.5-flash": (0.30, 2.50, 35.0, "prompt"),
    "gemini-3.5-flash": (1.50, 9.00, 14.0, "query"),
    "gemini-3.6-flash": (0.75, 3.75, 14.0, "query"),
    "gemini-3.7-flash": (0.75, 3.75, 14.0, "query"),
    "gemini-3.8-flash": (0.75, 3.75, 14.0, "query"),
}

# ── what each pass fills ─────────────────────────────────────────────────────
# Dotted paths into the model-filled part of the v2.1 record; [] is "each
# item". A path names a whole subtree. Keys that identify a list item (day,
# rank, code) are asked in every pass so the answers can be aligned.

PASS_PATHS = {
    1: [
        "title", "country", "countries", "subRegion", "basecamps",
        "gateways[].code", "gateways[].name", "gateways[].transferTo", "gateways[].note",
        "tags", "profile", "bestPeriod", "budgetTier", "budgetTierRaw", "languages",
        "currency", "emergencyNumber",
        "itinerary[].day", "itinerary[].title", "itinerary[].dayStats.mode",
        "itinerary[].sleep", "itinerary[].sleepRef",
        "accommodationStrategy[].rank", "accommodationStrategy[].name",
        "accommodationStrategy[].style", "accommodationStrategy[].location",
        "accommodationStrategy[].booking", "accommodationStrategy[].alternativeTo",
        "typeSpecific.surface", "typeSpecific.technicalRating", "typeSpecific.transitPass",
        "typeSpecific.hutBooking", "typeSpecific.liftNetwork", "typeSpecific.snowReliability",
        "typeSpecific.windConditions", "typeSpecific.gpxReady", "typeSpecific.audience",
    ],
    2: [
        "summary", "hook",
        "itinerary[].day", "itinerary[].morning", "itinerary[].afternoon", "itinerary[].evening",
        "accommodationStrategy[].rank", "accommodationStrategy[].description",
        "logistics.connectivity", "logistics.emergency", "logistics.weather", "logistics.money",
        "logistics.transportRules", "logistics.permits", "logistics.health",
        "logistics.gettingThere", "logistics.other",
        "proTips", "packingNotes", "whatCouldGoWrong",
    ],
    3: [
        "budget.totalNote", "budget.breakdown", "currencyNote", "eurRate",
        "gateways[].code", "gateways[].transferMin",
        "itinerary[].day", "itinerary[].dayStats.distanceKm", "itinerary[].dayStats.ascentM",
        "itinerary[].dayStats.descentM", "itinerary[].dayStats.timeMin",
        "itinerary[].dayStats.spendEur", "itinerary[].dayStats.note",
        "accommodationStrategy[].rank", "accommodationStrategy[].priceEur",
        "accommodationStrategy[].priceUnit", "accommodationStrategy[].priceNote",
        "typeSpecific.surfaceMix", "typeSpecific.distanceKm", "typeSpecific.elevationM",
        "typeSpecific.verticalM", "typeSpecific.bookingTimeline",
        "logistics.bookingWindows", "sources", "verifyFlags",
    ],
}

# Fields a pass answers that are not in the record: pass 1's route name and
# the named places pass 2 is confined to; pass 3's evidence rows.
PASS_EXTRAS = {
    1: {
        "nameSlug": {"type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+){1,3}$", "maxLength": 50,
                     "description": "Two to four lowercase words joined by hyphens naming the route."},
        "itinerary[]": {
            "places": {"type": "array", "minItems": 2, "maxItems": 6,
                       "items": {"type": "string", "minLength": 2, "maxLength": 80,
                                 "pattern": "^[^\u2014\u2013\u00b7]*$"},
                       "description": "The real named places this day visits. Pass two may only write about these."},
        },
    },
    3: {
        "evidence": {
            "type": "array", "maxItems": 120,
            "items": {"type": "object", "additionalProperties": False,
                      "required": ["path", "url", "basis"],
                      "properties": {
                          "path": {"type": "string", "maxLength": 80},
                          "url": {"type": "string", "pattern": "^https?://", "maxLength": 400},
                          "basis": {"type": "string", "minLength": 5, "maxLength": 240},
                      }},
            "description": "One row per figure: its dotted path, the page it came from, how the page gives it.",
        },
    },
}

# The figures pass 3 must source. Each is (path pattern, required). A required
# figure with no accepted evidence fails the trip; an optional one is nulled
# and flagged. The budget rows are per-row figures: one evidence row covers
# lowEur and highEur together.
FIGURES = [
    ("budget.breakdown.accommodation", True), ("budget.breakdown.food", True),
    ("budget.breakdown.transport", True), ("budget.breakdown.activities", True),
    ("eurRate", False), ("gateways[].transferMin", False),
    ("itinerary[].dayStats.distanceKm", False), ("itinerary[].dayStats.ascentM", False),
    ("itinerary[].dayStats.descentM", False), ("itinerary[].dayStats.timeMin", False),
    ("itinerary[].dayStats.spendEur", False), ("accommodationStrategy[].priceEur", False),
    ("typeSpecific.surfaceMix", False), ("typeSpecific.distanceKm", False),
    ("typeSpecific.elevationM", False), ("typeSpecific.verticalM", False),
]

# Which fact class (Execution/P2/T041-per-fact-grounding-design.md,
# public.fact_classes) a sourced figure belongs to, for the evidence sidecar
# T147 will load. Geography does not expire; it gets "static", a class T041
# does not define (register row T144-d).
FIGURE_CLASS = {
    "budget.breakdown": "range", "eurRate": "range", "priceEur": "range",
    "spendEur": "price", "transferMin": "transport",
}

CODE_RE = re.compile(r"^(?:€{1,3}(?: to €{1,3})?|[A-Z]{3})$")
EURO_RE = re.compile(r"€|\bEUR\b|\d\s?(?:eur|euros?)\b", re.I)
UNIT_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s?(?:km|m|min|minutes?|metres?|meters?|kilomet(?:re|er)s?"
                     r"|hours?|percent|%)(?![a-z])", re.I)


# ── prompts ──────────────────────────────────────────────────────────────────

def load_prompt(n):
    """The pass's prompt file: a header of 'key: value' lines, a blank line,
    the body. Returns (header dict, body)."""
    name = {1: "k2-skeleton.md", 2: "k2-prose.md", 3: "k2-numbers.md"}[n]
    with open(os.path.join(PROMPT_DIR, name), encoding="utf-8") as fh:
        text = fh.read()
    head, _, body = text.partition("\n\n")
    meta = {}
    for line in head.splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    meta["version"] = int(meta["version"])
    meta["temperature"] = float(meta.get("temperature", 0.3))
    meta["grounding"] = meta.get("grounding", "false") == "true"
    return meta, body.strip() + "\n"


def prompt_version():
    """k2-{v1}.{v2}.{v3}, written into provenance.promptVersion."""
    return "k2-" + ".".join(str(load_prompt(n)[0]["version"]) for n in (1, 2, 3))


def fill(template, values):
    out = template
    for k, v in values.items():
        out = out.replace("{{" + k + "}}", v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=1))
    left = re.findall(r"\{\{(\w+)\}\}", out)
    if left:
        raise ValueError(f"prompt placeholders not filled: {left}")
    return out


# ── the slice of the contract each pass answers ──────────────────────────────

def _split(path):
    return [p for p in re.split(r"\.|(\[\])", path) if p]


def _prune(node, paths):
    """node is a $ref-free JSON Schema; paths a list of key lists. Keeps only
    the properties some path enters, whole where a path ends there."""
    if "anyOf" in node:
        return {**node, "anyOf": [_prune(b, paths) for b in node["anyOf"]]}
    if node.get("type") == "object" and "properties" in node:
        keep = {}
        for k, v in node["properties"].items():
            sub = [p[1:] for p in paths if p and p[0] == k]
            if not sub:
                continue
            keep[k] = v if any(not p for p in sub) else _prune(v, sub)
        return {**node, "properties": keep,
                "required": [k for k in node.get("required", []) if k in keep]}
    if node.get("type") == "array" and "items" in node:
        sub = [p[1:] for p in paths if p and p[0] == "[]"]
        return {**node, "items": _prune(node["items"], sub)}
    return node


def _add_extras(schema, extras):
    for key, spec in extras.items():
        if key.endswith("[]"):
            items = schema["properties"][key[:-2]]["items"]
            for k, v in spec.items():
                items["properties"][k] = v
                items["required"].append(k)
        else:
            schema["properties"][key] = spec
            schema["required"].append(key)
    return schema


def pass_schema(n):
    """JSON Schema (draft 2020-12) of what pass n must answer."""
    full = G.model_schema()
    out = _prune(full, [_split(p) for p in PASS_PATHS[n]])
    out["title"] = f"Carta trip generation, pass {n}"
    return _add_extras(out, PASS_EXTRAS.get(n, {}))


def pass_gemini_schema(n):
    """The same slice in Gemini's responseSchema dialect."""
    return G._to_gemini(pass_schema(n))


def pass_errors(n, fragment):
    """Why the pass's answer may not be used: shape, then the pass's own rules."""
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import best_match
    if not isinstance(fragment, dict):
        return ["not-an-object: the answer is not a JSON object"]
    errs = []
    for e in Draft202012Validator(pass_schema(n)).iter_errors(fragment):
        msg = e.message
        if e.validator == "anyOf" and e.context:
            inner = best_match(e.context)
            msg = f"{inner.validator}: {inner.message}"
        errs.append(f"schema/{e.validator}: {G._path(e.absolute_path)}: {msg[:160]}")
    errs = sorted(set(errs))
    if errs:
        return errs
    if n == 1:
        errs += _no_figures(fragment, "pass1")
        errs += _skeleton_rules(fragment)
    elif n == 2:
        errs += _no_figures(fragment, "pass2")
        errs += _word_caps(fragment)
    return errs


def _strings(x, path=()):
    if isinstance(x, str):
        yield path, x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _strings(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _strings(v, path + (i,))


def _no_figures(fragment, label):
    """Passes 1 and 2 write words. A euro amount or a number with a unit is
    pass 3's job, and here it is a figure nobody sourced."""
    out = []
    for path, s in _strings(fragment):
        if CODE_RE.match(s):
            continue       # a tier mark or an ISO code, not an amount
        m = EURO_RE.search(s) or UNIT_RE.search(s)
        if m:
            out.append(f"{label}-figure: {G._path(path)}: {m.group(0)!r} is a figure; "
                       "only pass three gives figures")
    return out


def _word_caps(fragment):
    out = []
    n = len((fragment.get("summary") or "").split())
    if n > SUMMARY_WORDS:
        out.append(f"word-cap: summary: {n} words, cap {SUMMARY_WORDS}")
    for i, d in enumerate(fragment.get("itinerary") or []):
        for block in ("morning", "afternoon", "evening"):
            n = len((d.get(block) or "").split())
            if n > DAY_WORDS:
                out.append(f"word-cap: itinerary[{i}].{block}: {n} words, cap {DAY_WORDS}")
    for i, tip in enumerate(fragment.get("proTips") or []):
        n = len(tip.split())
        if n > TIP_WORDS:
            out.append(f"word-cap: proTips[{i}]: {n} words, cap {TIP_WORDS}")
    return out


def _skeleton_rules(fragment):
    """The figures pass one must not give (dayStats beyond mode, transferMin)
    are not in its schema at all, so the shape check rejects them as extra
    keys. What is left is the day order."""
    days = fragment.get("itinerary") or []
    if [d.get("day") for d in days] != list(range(1, 8)):
        return ["skeleton: itinerary: days are not 1 to 7"]
    return []


# ── aligning and merging the three answers ───────────────────────────────────

ALIGN_KEY = {"itinerary": "day", "accommodationStrategy": "rank", "gateways": "code"}


def align_errors(base, fragment):
    """Passes 2 and 3 answer about the skeleton's lists; the lists must match
    item for item."""
    out = []
    for lst, key in ALIGN_KEY.items():
        if lst not in fragment:
            continue
        want = [x.get(key) for x in base.get(lst) or []]
        got = [x.get(key) for x in fragment.get(lst) or []]
        if want != got:
            out.append(f"align: {lst}: the skeleton has {want}, the answer {got}")
    return out


def merge(dst, src):
    """Deep merge: objects by key, lists of objects by position, scalars from
    src. A key src sets to null stays null (pass 3 may withhold)."""
    out = copy.deepcopy(dst)
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        elif (isinstance(v, list) and isinstance(out.get(k), list) and len(v) == len(out[k])
              and all(isinstance(a, dict) and isinstance(b, dict) for a, b in zip(v, out[k]))):
            out[k] = [merge(a, b) for a, b in zip(out[k], v)]
        else:
            out[k] = copy.deepcopy(v)
    return out


def strip_extras(n, fragment):
    out = copy.deepcopy(fragment)
    for key in PASS_EXTRAS.get(n, {}):
        if key.endswith("[]"):
            for item in out.get(key[:-2]) or []:
                for k in PASS_EXTRAS[n][key]:
                    item.pop(k, None)
        else:
            out.pop(key, None)
    return out


# ── evidence: a figure without a read page is not a figure ───────────────────

def _host(url):
    try:
        h = urllib.parse.urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return h.lower().removeprefix("www.")


def grounding_chunks(response):
    """(uri, title) of every page the grounding metadata says was read."""
    out = []
    for cand in response.get("candidates") or []:
        gm = cand.get("groundingMetadata") or {}
        for ch in gm.get("groundingChunks") or []:
            web = ch.get("web") or {}
            if web.get("uri"):
                out.append((web["uri"], web.get("title") or ""))
    return out


def search_queries(response):
    n = 0
    for cand in response.get("candidates") or []:
        n += len((cand.get("groundingMetadata") or {}).get("webSearchQueries") or [])
    return n


def url_was_read(url, chunks):
    """Gemini returns redirect URIs in groundingChunks and the page's host or
    title in web.title, so an exact match is the strong case and a host match
    against the title or the URI is the fallback. No chunks, nothing read."""
    host = _host(url)
    for uri, title in chunks:
        if uri == url:
            return True
        if host and (host == title.lower().removeprefix("www.") or host in uri.lower()):
            return True
    return False


def _instances(fields, pattern):
    """Every concrete path of a figure pattern in the merged fields, with its
    parent and key, e.g. itinerary[].dayStats.ascentM -> 7 instances."""
    parts = _split(pattern)

    def walk(node, i, path):
        if i == len(parts):
            yield path
            return
        p = parts[i]
        if p == "[]":
            for j, item in enumerate(node or []):
                yield from walk(item, i + 1, path + (j,))
        elif isinstance(node, dict) and p in node:
            yield from walk(node[p], i + 1, path + (p,))
    return list(walk(fields, 0, ()))


def _get(node, path):
    for p in path:
        node = node[p]
    return node


def _set(node, path, value):
    for p in path[:-1]:
        node = node[p]
    node[path[-1]] = value


def apply_evidence(fields, evidence, chunks, today):
    """Enforce pass three's one rule. Returns (fields, sidecar rows, fatal
    errors). A budget row is a figure when either bound is set."""
    fields = copy.deepcopy(fields)
    by_path = {}
    for row in evidence or []:
        by_path.setdefault(row["path"], row)
    rows, fatal = [], []
    flags = list(fields.get("verifyFlags") or [])
    for pattern, required in FIGURES:
        for path in _instances(fields, pattern):
            value = _get(fields, path)
            if value is None:
                continue
            if pattern.startswith("budget.breakdown") and isinstance(value, dict):
                figure = {k: value.get(k) for k in ("lowEur", "highEur")}
                if figure["lowEur"] is None and figure["highEur"] is None:
                    continue
            else:
                figure = value
            dotted = G._path(path)
            row = by_path.get(dotted)
            ok = bool(row) and url_was_read(row["url"], chunks)
            cls = next((c for k, c in FIGURE_CLASS.items() if k in dotted), "static")
            rows.append({"path": dotted, "value": figure, "class": cls,
                         "sourceUrl": row["url"] if ok else None,
                         "basis": row["basis"] if row else None,
                         "status": "sourced" if ok else ("unread-url" if row else "unsourced"),
                         "fetchedAt": today if ok else None})
            if ok:
                continue
            why = f"{dotted}: {'its source was not among the pages read' if row else 'no source given'}"
            if required:
                fatal.append(f"unsourced-required: {why}")
            else:
                _set(fields, path, None)
                flags.append(f"Withheld {why}")
    fields["verifyFlags"] = flags[:40]
    return fields, rows, fatal


def set_totals(fields):
    """budget.totalEur is the sum of the sourced rows: arithmetic, not a claim."""
    b = fields.get("budget") or {}
    rows = (b.get("breakdown") or {}).values()
    try:
        b["totalEur"] = {"low": sum(r["lowEur"] for r in rows), "high": sum(r["highEur"] for r in rows)}
    except (KeyError, TypeError):
        return
    fields["budget"] = b


# ── clients ──────────────────────────────────────────────────────────────────

class GeminiClient:
    """The AI Studio REST API, as pipeline/dossier/rewrite_intros.py and the
    plan-day Edge Function call it. One method, no SDK, no dependency."""

    def __init__(self, models=None, key=None, pause=6.5):
        self.key = key or os.environ.get("GEMINI_API_KEY")
        if not self.key:
            raise SystemExit("GEMINI_API_KEY is not set (repo-root .env or the environment)")
        self.models = list(models or MODEL_CHAIN)
        self.pause = pause
        self._last = 0.0

    def generate(self, label, user, *, response_schema=None, grounding=False,
                 temperature=0.3, max_tokens=16384):
        body = {
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if response_schema is not None:
            body["generationConfig"]["responseMimeType"] = "application/json"
            body["generationConfig"]["responseSchema"] = response_schema
        if grounding:
            # Search grounding and a response schema are not combined here:
            # the JSON shape of pass three is checked locally instead.
            body["tools"] = [{"google_search": {}}]
        last = None
        for model in self.models:
            for attempt in (1, 2):
                wait = self._last + self.pause - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._last = time.monotonic()
                req = urllib.request.Request(
                    API.format(model=model), data=json.dumps(body).encode("utf-8"),
                    headers={"Content-Type": "application/json", "x-goog-api-key": self.key},
                    method="POST")
                t0 = time.monotonic()
                try:
                    with urllib.request.urlopen(req, timeout=300) as r:
                        data = json.loads(r.read().decode("utf-8"))
                    data["_requested"] = model
                    data["_elapsedS"] = round(time.monotonic() - t0, 1)
                    return data
                except urllib.error.HTTPError as exc:
                    last = exc.code
                    if exc.code == 429 and attempt == 1:
                        time.sleep(30)
                        continue
                    break
        raise RuntimeError(f"every Gemini model failed on {label} (last status {last})")


class StubClient:
    """Replays recorded response bodies: a dict {label: [body, ...]} or a
    folder of {label}.json files. Used by the tests, the self-test and
    `run --stub`, and it is how a pass can be re-run offline."""

    def __init__(self, source):
        self.calls = []
        if isinstance(source, dict):
            self.bodies = {k: list(v) if isinstance(v, list) else [v] for k, v in source.items()}
        else:
            self.bodies = {}
            for name in sorted(os.listdir(source)):
                if name.endswith(".json"):
                    with open(os.path.join(source, name), encoding="utf-8") as fh:
                        self.bodies[name[:-5]] = [json.load(fh)]

    def generate(self, label, user, **kw):
        self.calls.append((label, user, kw))
        queue = self.bodies.get(label) or []
        if not queue:
            raise RuntimeError(f"no stub answer for {label}")
        body = copy.deepcopy(queue.pop(0) if len(queue) > 1 else queue[0])
        body.setdefault("_requested", "gemini-fixture")
        body.setdefault("_elapsedS", 0)
        return body


def response_text(body):
    parts = ((body.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts if not p.get("thought"))


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text), None
    except ValueError as e:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0)), None
            except ValueError:
                pass
        return None, f"not-json: {e}"


# ── cost ─────────────────────────────────────────────────────────────────────

def usage_of(body):
    u = body.get("usageMetadata") or {}
    return {
        "model": body.get("modelVersion") or body.get("_requested"),
        "tokensIn": u.get("promptTokenCount", 0),
        "tokensOut": u.get("candidatesTokenCount", 0),
        "tokensThought": u.get("thoughtsTokenCount", 0),
        "tokensTool": u.get("toolUsePromptTokenCount", 0),
        "searches": search_queries(body),
        "grounded": any("groundingMetadata" in c for c in body.get("candidates") or []),
        "elapsedS": body.get("_elapsedS", 0),
    }


def price_usd(usage):
    """None when the model is not in the price table: no guess."""
    model = usage["model"] or ""
    key = max((k for k in PRICES if model.startswith(k)), key=len, default=None)
    if key is None:
        return None
    p_in, p_out, p_search, unit = PRICES[key]
    cost = (usage["tokensIn"] + usage["tokensTool"]) * p_in / 1e6
    cost += (usage["tokensOut"] + usage["tokensThought"]) * p_out / 1e6
    if usage["grounded"]:
        units = usage["searches"] if unit == "query" else 1
        cost += units * p_search / 1000
    return round(cost, 5)


def ledger_append(path, row):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def cost_report(ledger_path):
    """Per trip and per pass: calls, tokens, searches, USD. Unpriced models
    are counted and named, never summed as zero."""
    trips = {}
    unpriced = set()
    if os.path.exists(ledger_path):
        with open(ledger_path, encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                row = json.loads(line)
                t = trips.setdefault(row["trip"], {"passes": {}, "usd": 0.0, "calls": 0})
                p = t["passes"].setdefault(row["pass"], {"calls": 0, "tokensIn": 0, "tokensOut": 0,
                                                         "searches": 0, "usd": 0.0})
                p["calls"] += 1
                t["calls"] += 1
                p["tokensIn"] += row["usage"]["tokensIn"] + row["usage"]["tokensTool"]
                p["tokensOut"] += row["usage"]["tokensOut"] + row["usage"]["tokensThought"]
                p["searches"] += row["usage"]["searches"]
                if row["usd"] is None:
                    unpriced.add(row["usage"]["model"])
                else:
                    p["usd"] += row["usd"]
                    t["usd"] += row["usd"]
    return trips, unpriced


def print_cost(ledger_path):
    trips, unpriced = cost_report(ledger_path)
    if not trips:
        print(f"no calls recorded in {ledger_path}")
        return
    total = 0.0
    for tid, t in trips.items():
        print(f"{tid}: {t['calls']} calls, USD {t['usd']:.4f}")
        for n in sorted(t["passes"]):
            p = t["passes"][n]
            print(f"  pass {n}: {p['calls']} call(s), {p['tokensIn']} in, {p['tokensOut']} out, "
                  f"{p['searches']} searches, USD {p['usd']:.4f}")
        total += t["usd"]
    print(f"{len(trips)} trip(s), USD {total:.4f}, mean USD {total / len(trips):.4f} per trip")
    if unpriced:
        print(f"unpriced calls from {sorted(unpriced)}: add them to PRICES before trusting the total")


# ── the run ──────────────────────────────────────────────────────────────────

class PassFailed(Exception):
    def __init__(self, n, errors, raw):
        super().__init__(f"pass {n} failed: {errors[:3]}")
        self.n, self.errors, self.raw = n, errors, raw


def _cache_path(out_dir, key, n):
    return os.path.join(out_dir, "passes", key, f"pass{n}.json")


def run_pass(n, user, *, client, key, out_dir, ledger, trip_label, reuse=True,
             extra_check=None, today=None):
    """One pass: call (or replay), parse, check, retry once with the errors
    in the prompt, cache the accepted answer keyed on the exact prompt text.
    Returns (fragment, response body)."""
    meta, _ = load_prompt(n)
    digest = hashlib.sha1(user.encode("utf-8")).hexdigest()
    cpath = _cache_path(out_dir, key, n)
    if reuse and os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as fh:
            cached = json.load(fh)
        if cached.get("promptSha1") == digest:
            frag, _ = parse_json(response_text(cached["response"]))
            return frag, cached["response"]
    schema = None if meta["grounding"] else pass_gemini_schema(n)
    prompt, raw_text, errs, body = user, "", [], None
    for attempt in (1, 2):
        body = client.generate(f"pass{n}", prompt, response_schema=schema,
                               grounding=meta["grounding"], temperature=meta["temperature"])
        usage = usage_of(body)
        ledger_append(ledger, {"at": today or _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
                               "trip": trip_label, "pass": n, "attempt": attempt,
                               "promptVersion": meta["version"], "usage": usage, "usd": price_usd(usage)})
        raw_text = response_text(body)
        frag, perr = parse_json(raw_text)
        errs = [perr] if perr else pass_errors(n, frag)
        if not errs and extra_check:
            errs = extra_check(frag, body)
        if not errs:
            os.makedirs(os.path.dirname(cpath), exist_ok=True)
            G._write_atomic(cpath, json.dumps({"pass": n, "promptVersion": meta["version"], "promptSha1": digest,
                                        "attempt": attempt, "response": body}, ensure_ascii=False, indent=1) + "\n")
            return frag, body
        prompt = (user + "\n\nYour previous answer failed these checks. Answer again, fixing every one:\n"
                  + "\n".join(f"- {e}" for e in errs[:30]) + "\n")
    raise PassFailed(n, errs, raw_text)


def load_brief(path):
    with open(path, encoding="utf-8") as fh:
        brief = json.load(fh)
    for k in ("countryCode", "tripTypeSlug", "idea"):
        if not brief.get(k):
            raise SystemExit(f"brief {path} lacks {k}")
    if brief["tripTypeSlug"] not in {s for _, _, s in C.TRIP_TYPES}:
        raise SystemExit(f"brief {path}: unknown tripTypeSlug {brief['tripTypeSlug']!r}")
    if brief["countryCode"] not in C.COUNTRY_CODES.values():
        raise SystemExit(f"brief {path}: unknown countryCode {brief['countryCode']!r}")
    brief.setdefault("key", os.path.splitext(os.path.basename(path))[0])
    return brief


def generate(brief, client, out_dir=DEFAULT_OUT, *, reuse=True, today=None):
    """The three passes, the merge, the gate. Returns a result dict; writes
    the record (or the reject), the evidence sidecar and the ledger."""
    today = today or _dt.date.today().isoformat()
    key = re.sub(r"[^a-z0-9-]", "-", brief["key"].lower())
    ledger = os.path.join(out_dir, "ledger.jsonl")
    dest, rejects = os.path.join(out_dir, "admitted"), os.path.join(out_dir, "rejected")
    cc, slug = brief["countryCode"], brief["tripTypeSlug"]
    tname = next(n for _, n, s in C.TRIP_TYPES if s == slug)
    cname = next(n for n, c in C.COUNTRY_CODES.items() if c == cc)
    brief_text = json.dumps({k: v for k, v in brief.items() if k != "key"}, ensure_ascii=False, indent=1)
    passes = {}
    try:
        _, body1 = load_prompt(1)
        p1, r1 = run_pass(1, fill(body1, {"brief": brief_text, "country": cname, "tripType": tname,
                                          "countryCode": cc.lower(), "tripTypeSlug": slug}),
                          client=client, key=key, out_dir=out_dir, ledger=ledger, trip_label=key,
                          reuse=reuse, today=today)
        passes[1] = usage_of(r1)
        skeleton = {"countryCode": cc, "tripTypeSlug": slug, **p1}
        tid = f"{cc.lower()}-{slug}-{C.slugify(p1['nameSlug'], 50)}"

        _, body2 = load_prompt(2)
        p2, r2 = run_pass(2, fill(body2, {"skeleton": skeleton, "dayWords": str(DAY_WORDS),
                                          "summaryWords": str(SUMMARY_WORDS), "tipWords": str(TIP_WORDS)}),
                          client=client, key=key, out_dir=out_dir, ledger=ledger, trip_label=key,
                          reuse=reuse, today=today,
                          extra_check=lambda f, _b: align_errors(skeleton, f))
        passes[2] = usage_of(r2)
        so_far = merge({"id": tid, **strip_extras(1, skeleton)}, p2)

        _, body3 = load_prompt(3)
        p3, r3 = run_pass(3, fill(body3, {"trip": so_far, "schema": pass_schema(3)}),
                          client=client, key=key, out_dir=out_dir, ledger=ledger, trip_label=key,
                          reuse=reuse, today=today,
                          extra_check=lambda f, _b: align_errors(skeleton, f))
        passes[3] = usage_of(r3)
    except PassFailed as pf:
        os.makedirs(rejects, exist_ok=True)
        stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        base = os.path.join(rejects, f"{stamp}-{key}.pass{pf.n}")
        G._write_atomic(base + ".txt", pf.raw)
        G._write_atomic(base + ".errors.txt", "\n".join(pf.errors) + "\n")
        return {"ok": False, "stage": f"pass{pf.n}", "errors": pf.errors, "path": base + ".txt",
                "passes": passes}

    chunks = grounding_chunks(r3)
    fields = merge(so_far, strip_extras(3, p3))
    fields, rows, fatal = apply_evidence(fields, p3.get("evidence"), chunks, today)
    set_totals(fields)
    model = passes[1]["model"] or "gemini-unknown"
    rec = G.derive(fields, batch=brief.get("batch", "generated"), model=model,
                   prompt_version=prompt_version(), today=today)
    errors = list(fatal)
    if not errors:
        ok, errors, path = G.admit(rec, dest, rejects, name=key)
    else:
        ok, path = False, None
        os.makedirs(rejects, exist_ok=True)
        stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = os.path.join(rejects, f"{stamp}-{key}.json")
        G._write_atomic(path, json.dumps(rec, ensure_ascii=False, indent=1) + "\n")
        G._write_atomic(path[:-5] + ".errors.txt", "\n".join(errors) + "\n")
    sidecar = {"id": rec["id"], "entityKey": f"trip:{rec['id']}", "promptVersion": prompt_version(),
               "models": {str(n): u["model"] for n, u in passes.items()}, "fetchedAt": today,
               "pagesRead": [{"uri": u, "title": t} for u, t in chunks], "figures": rows}
    G._write_atomic(os.path.join(dest if ok else rejects, f"{rec['id']}.evidence.json"),
                    json.dumps(sidecar, ensure_ascii=False, indent=1) + "\n")
    trips, _ = cost_report(ledger)
    return {"ok": ok, "stage": "gate", "errors": errors, "path": path, "id": rec["id"],
            "passes": passes, "usd": trips.get(key, {}).get("usd"),
            "figures": {"sourced": sum(r["status"] == "sourced" for r in rows),
                        "withheld": sum(r["status"] != "sourced" for r in rows)}}


# ── fixtures: the T143 example split into three answers ──────────────────────

def _project(rec, paths):
    """The part of rec the paths name."""
    out = {}
    for path in paths:
        parts = _split(path)

        def put(src, dst, i):
            if i == len(parts):
                return
            p = parts[i]
            if p == "[]":
                for j, item in enumerate(src):
                    while len(dst) <= j:
                        dst.append({})
                    put(item, dst[j], i + 1)
            elif p in src:
                if i == len(parts) - 1:
                    dst[p] = copy.deepcopy(src[p])
                else:
                    dst.setdefault(p, [] if parts[i + 1] == "[]" else {})
                    put(src[p], dst[p], i + 1)
        put(rec, out, 0)
    return out


def squeeze(text):
    """Fixture prose: the example was written in v2.0 style, with euro figures
    and long blocks. Strip the figures and cut to the cap so the stub obeys
    pass two's rules. Test-only; never applied to a model answer."""
    if text is None:
        return None
    t = re.sub(r"\(?\b(?:approx\.?|about|roughly)?\s?€\s?\d[\d.,]*(?:\s?(?:to|-)\s?\d[\d.,]*)?[^.,;)]*\)?",
               "a small fee", text)
    t = EURO_RE.sub("", t)
    t = UNIT_RE.sub("a stretch", t)
    words = t.split()
    if len(words) > DAY_WORDS:
        t = " ".join(words[:DAY_WORDS]).rstrip(",;:") + "."
    return t


def fixture_bodies(example=None):
    """{label: response body} for the three passes, made from the example
    record, with grounding chunks that match every figure's evidence row.
    Token counts are zero: a fixture measures nothing."""
    if example is None:
        with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
            example = json.load(fh)
    p1 = _project(example, PASS_PATHS[1])
    for path in G.DERIVED:
        if len(path) == 2 and path[0] in p1:
            p1[path[0]].pop(path[1], None)
    p1["nameSlug"] = "donauradweg-wachau-example"
    for d, src in zip(p1["itinerary"], example["itinerary"]):
        d["dayStats"] = {"mode": src["dayStats"]["mode"]}
        d["places"] = [src["sleep"] or "Vienna", src["title"]]
    for k, v in p1["typeSpecific"].items():
        p1["typeSpecific"][k] = squeeze(v) if isinstance(v, str) else v
    p2 = _project(example, PASS_PATHS[2])
    p2["summary"] = squeeze(p2["summary"])
    p2["hook"] = squeeze(p2["hook"])
    for d in p2["itinerary"]:
        for k in ("morning", "afternoon", "evening"):
            d[k] = squeeze(d[k])
    for s in p2["accommodationStrategy"]:
        s["description"] = squeeze(s["description"])
    p2["logistics"] = {k: (squeeze(v) if isinstance(v, str) else v) for k, v in p2["logistics"].items()}
    p2["logistics"]["other"] = [{"label": o["label"], "text": squeeze(o["text"])} for o in p2["logistics"]["other"]]
    p2["proTips"] = [squeeze(t) for t in p2["proTips"]]
    for n in p2["packingNotes"]:
        n["whyThisTrip"] = squeeze(n["whyThisTrip"])
    for w in p2["whatCouldGoWrong"]:
        for k in ("trigger", "consequence", "whatToDo"):
            w[k] = squeeze(w[k])
    p3 = _project(example, PASS_PATHS[3])
    p3["evidence"] = []
    chunks = []
    for pattern, _ in FIGURES:
        for path in _instances(p3, pattern):
            if _get(p3, path) is None:
                continue
            dotted = G._path(path)
            url = f"https://example.org/fixture/{dotted}"
            p3["evidence"].append({"path": dotted, "url": url, "basis": "fixture page states it"})
            chunks.append({"web": {"uri": url, "title": "example.org"}})

    def body(frag, grounded=False):
        cand = {"content": {"parts": [{"text": json.dumps(frag, ensure_ascii=False)}]}}
        if grounded:
            cand["groundingMetadata"] = {"groundingChunks": chunks,
                                         "webSearchQueries": ["fixture query"] * 3}
        return {"candidates": [cand], "modelVersion": "gemini-fixture",
                "usageMetadata": {"promptTokenCount": 0, "candidatesTokenCount": 0}}
    return {"pass1": body(p1), "pass2": body(p2), "pass3": body(p3, grounded=True)}


FIXTURE_BRIEF = {"key": "fixture-donauradweg", "countryCode": "AT", "tripTypeSlug": "cycling",
                 "idea": "Passau to Vienna on the Donauradweg with two days in the Wachau",
                 "batch": "fixture"}


# ── self-test ────────────────────────────────────────────────────────────────

def self_test():
    import shutil
    import tempfile
    fails = []
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        example = json.load(fh)

    # 1. The three slices cover the model-filled contract exactly once.
    covered = set()
    for n in (1, 2, 3):
        for p in PASS_PATHS[n]:
            key = p.replace("[]", "")
            if key not in ("itinerary.day", "accommodationStrategy.rank", "gateways.code"):
                covered.add(p)
    model_fields = G.model_schema()["properties"]
    for k in model_fields:
        if k in ("id", "countryCode", "tripTypeSlug"):
            continue       # from the brief
        if not any(p == k or p.startswith(k + ".") or p.startswith(k + "[]") for p in covered):
            fails.append(f"model field {k} is asked of no pass")
    for n in (1, 2, 3):
        sch = json.dumps(pass_gemini_schema(n))
        for word in ('"$ref"', '"const"', '"not"', '"additionalProperties"', '"pattern"'):
            if word in sch:
                fails.append(f"pass {n} Gemini schema carries {word}")

    # 2. The fixture passes each pass's checks, and the stubbed run is admitted.
    bodies = fixture_bodies(example)
    for n in (1, 2, 3):
        frag, _ = parse_json(response_text(bodies[f"pass{n}"]))
        errs = pass_errors(n, frag)
        if errs:
            fails.append(f"fixture pass {n} fails its own checks: {errs[:3]}")
    tmp = tempfile.mkdtemp(prefix="t144-")
    try:
        res = generate(FIXTURE_BRIEF, StubClient(bodies), tmp, today=example["provenance"]["ingestedAt"])
        if not res["ok"]:
            fails.append(f"stubbed run rejected at {res['stage']}: {res['errors'][:3]}")
        else:
            with open(res["path"], encoding="utf-8") as fh:
                rec = json.load(fh)
            if rec["budget"]["totalEur"] != example["budget"]["totalEur"]:
                fails.append("totalEur is not the sum of the breakdown")
            if rec["itinerary"][0]["dayStats"]["ascentM"] != 160 or rec["gateways"][0]["transferMin"] != 210:
                fails.append("a sourced figure did not survive the merge")
            if res["figures"]["withheld"]:
                fails.append(f"{res['figures']['withheld']} fixture figures were withheld")
            if rec["provenance"]["promptVersion"] != prompt_version():
                fails.append("promptVersion is not the prompts' version")
            # 3. A rerun replays the cache and makes no call.
            client = StubClient({})
            res2 = generate(FIXTURE_BRIEF, client, tmp, today=example["provenance"]["ingestedAt"])
            if not res2["ok"] or client.calls:
                fails.append("a rerun with unchanged prompts called the model again")

        # 4. Pass three cannot invent: an evidence URL the grounding never read
        # withholds an optional figure and fails a required one.
        bad = copy.deepcopy(bodies)
        frag, _ = parse_json(response_text(bad["pass3"]))
        for row in frag["evidence"]:
            if row["path"] == "itinerary[0].dayStats.ascentM":
                row["url"] = "https://made-up.example/never-read"
        bad["pass3"]["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
        res3 = generate({**FIXTURE_BRIEF, "key": "fixture-withheld"}, StubClient(bad), tmp,
                        today=example["provenance"]["ingestedAt"])
        if not res3["ok"]:
            fails.append(f"withholding an optional figure should still admit: {res3['errors'][:3]}")
        else:
            with open(res3["path"], encoding="utf-8") as fh:
                rec3 = json.load(fh)
            if rec3["itinerary"][0]["dayStats"]["ascentM"] is not None or not rec3["verifyFlags"]:
                fails.append("an unread source did not withhold the figure and flag it")
        frag["evidence"] = [r for r in frag["evidence"] if r["path"] != "budget.breakdown.food"]
        bad["pass3"]["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(frag)
        res4 = generate({**FIXTURE_BRIEF, "key": "fixture-fatal"}, StubClient(bad), tmp,
                        today=example["provenance"]["ingestedAt"])
        if res4["ok"] or not any(e.startswith("unsourced-required") for e in res4["errors"]):
            fails.append("an unsourced budget row was admitted")
        nogr = copy.deepcopy(bodies)
        nogr["pass3"]["candidates"][0].pop("groundingMetadata")
        res5 = generate({**FIXTURE_BRIEF, "key": "fixture-nogrounding"}, StubClient(nogr), tmp,
                        today=example["provenance"]["ingestedAt"])
        if res5["ok"]:
            fails.append("a pass three that ran no search was admitted")

        # 5. Pass two is words only, and the caps bite; one retry, then reject.
        p2, _ = parse_json(response_text(bodies["pass2"]))
        wordy = copy.deepcopy(p2)
        wordy["itinerary"][2]["morning"] = "word " * (DAY_WORDS + 1)
        wordy["proTips"][0] = "Ride early, the ferry costs €3 with a bike."
        errs = pass_errors(2, wordy)
        if not any(e.startswith("word-cap: itinerary[2].morning") for e in errs):
            fails.append("the day word cap did not bite")
        if not any(e.startswith("pass2-figure: proTips[0]") for e in errs):
            fails.append("a euro figure in prose was not caught")
        if not any(e.startswith("pass2-figure") for e in pass_errors(2, {**p2, "summary": "A gentle 52 km a day along the river, with the Wachau terraces in the middle of the week."})):
            fails.append("a distance in prose was not caught")
        twice = copy.deepcopy(bodies)
        twice["pass2"]["candidates"][0]["content"]["parts"][0]["text"] = json.dumps(wordy)
        client = StubClient({"pass1": bodies["pass1"], "pass2": [twice["pass2"], twice["pass2"]]})
        res6 = generate({**FIXTURE_BRIEF, "key": "fixture-wordy"}, client, tmp)
        if res6["ok"] or res6["stage"] != "pass2" or sum(c[0] == "pass2" for c in client.calls) != 2:
            fails.append("a failing pass was not retried exactly once with its errors, then rejected")
        elif "failed these checks" not in client.calls[-1][1]:
            fails.append("the retry prompt does not carry the errors")

        # 6. Pass one keeps figures out of the skeleton.
        p1, _ = parse_json(response_text(bodies["pass1"]))
        p1b = copy.deepcopy(p1)
        p1b["itinerary"][0]["dayStats"]["distanceKm"] = 52
        errs = pass_errors(1, p1b)
        if not any(e.startswith("schema/additionalProperties: itinerary[0].dayStats") for e in errs):
            fails.append(f"a figure in the skeleton's dayStats was accepted: {errs[:2]}")
        p1c = copy.deepcopy(p1)
        p1c["itinerary"][1]["title"] = "Linz, 63 km downstream"
        if not any(e.startswith("pass1-figure") for e in pass_errors(1, p1c)):
            fails.append("a distance in a skeleton title was accepted")

        # 7. Alignment: pass two must answer about the skeleton's seven days.
        short = copy.deepcopy(p2)
        short["itinerary"].pop()
        if not align_errors(p1, short):
            fails.append("a six-day prose answer aligned with a seven-day skeleton")

        # 8. Pricing: the table prices a known model and refuses an unknown one.
        u = {"model": "gemini-2.5-flash", "tokensIn": 1_000_000, "tokensOut": 1_000_000,
             "tokensThought": 0, "tokensTool": 0, "searches": 4, "grounded": True}
        if price_usd(u) != round(0.30 + 2.50 + 0.035, 5):
            fails.append(f"gemini-2.5-flash priced at {price_usd(u)}")
        u3 = {**u, "model": "gemini-3.5-flash-001"}
        if price_usd(u3) != round(1.50 + 9.00 + 4 * 0.014, 5):
            fails.append(f"gemini-3.5-flash priced at {price_usd(u3)}")
        if price_usd({**u, "model": "gemini-fixture"}) is not None:
            fails.append("an unknown model was priced")
        trips, unpriced = cost_report(os.path.join(tmp, "ledger.jsonl"))
        if "gemini-fixture" not in unpriced or not trips:
            fails.append("the ledger did not record the fixture calls as unpriced")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    for f in fails:
        print(f"SELF-TEST FAIL: {f}")
    if not fails:
        print("SELF-TEST OK: three slices cover the contract, fixture admitted through the gate, "
              "rerun replays the cache, unread sources withheld, unsourced budget rejected, "
              "word caps and figure bans bite, retry once, prices known")
    return 1 if fails else 0


# ── cli ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="generate one trip from a brief")
    r.add_argument("brief")
    r.add_argument("--out", default=DEFAULT_OUT)
    r.add_argument("--model", action="append", help="pin the model chain (repeatable)")
    r.add_argument("--stub", help="folder of pass1.json, pass2.json, pass3.json response bodies")
    r.add_argument("--no-reuse", action="store_true", help="ignore cached pass answers")
    s = sub.add_parser("pass-schema")
    s.add_argument("n", type=int, choices=(1, 2, 3))
    s.add_argument("--gemini", action="store_true", help="in the responseSchema dialect")
    c = sub.add_parser("cost")
    c.add_argument("--ledger", default=os.path.join(DEFAULT_OUT, "ledger.jsonl"))
    sub.add_parser("self-test")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if args.cmd == "self-test":
        return self_test()
    if args.cmd == "pass-schema":
        print(json.dumps(pass_gemini_schema(args.n) if args.gemini else pass_schema(args.n),
                         ensure_ascii=False, indent=1))
        return 0
    if args.cmd == "cost":
        print_cost(args.ledger)
        return 0
    brief = load_brief(args.brief)
    if args.stub:
        client = StubClient(args.stub)
    else:
        sys.path.insert(0, os.path.join(ROOT, "..", "..", "..", "pipeline"))
        try:
            from env_local import load_env  # repo-root .env, the sanctioned paste spot
            load_env()
        except ImportError:
            pass
        client = GeminiClient(args.model)
    res = generate(brief, client, args.out, reuse=not args.no_reuse)
    print(f"{'ADMIT ' if res['ok'] else 'REJECT'} {res.get('id', brief['key'])} -> {res['path']}")
    for e in res["errors"][:25]:
        print(f"  {e}")
    if res.get("figures"):
        print(f"  figures: {res['figures']['sourced']} sourced, {res['figures']['withheld']} withheld")
    for n, u in res["passes"].items():
        print(f"  pass {n}: {u['model']}, {u['tokensIn']} in, {u['tokensOut'] + u['tokensThought']} out, "
              f"{u['searches']} searches, {u['elapsedS']} s")
    if res.get("usd") is not None:
        print(f"  cost so far for this trip: USD {res['usd']:.4f} (see `cost`)")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
