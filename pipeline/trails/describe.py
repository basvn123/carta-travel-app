"""Grounded trip descriptions: the Claude API used strictly as a rewriter.

The model never researches anything. Per staged trip we assemble a FACTS block
from data we already hold (title and OSM tags, computed distance/ascent/
duration, difficulty, network, portal agreement from crosscheck_portals.py,
catalogue anchor entities from popularity.py) and ask Claude to turn only those
fields into two summary sentences plus one short paragraph.

Two passes, because "use only these facts" is a request, not a guarantee:

  write   one call per trip, facts in, prose out. House style is enforced in
          the prompt and again in code (no em or en dashes, no headings, no
          markdown emphasis, no second person marketing).
  verify  we split our own output into numbered sentences and ask the model to
          map each one to exactly one FACTS field. Sentences that map to
          nothing, map to a field we did not supply, or come back ungrounded
          are DROPPED, not rewritten. What survives is what gets stored.

Wikivoyage (CC BY-SA) is passed as CONTEXT, never as source material: the
prompt forbids quoting or paraphrasing it, it is not a mappable field in the
verification pass, and any sentence sharing a six word run with the snippet is
dropped in code regardless of what the model says about it. So the stored text
stays our own and carries no share-alike obligation.

Writes description_md and described_at on trips (columns added idempotently
from tools/trailslab/initdb/03_trip_descriptions.sql), plus one append-only
validation_runs row per trip (check_name='description_grounding', score = the
percentage of sentences that survived) so the review UI can see the drift
evidence next to the text.

Two backends, same two passes, chosen with --provider (default: whichever key
is present, Claude first). Keys come through the pipeline/env_local.py pattern
(repo-root .env, real environment variables win):

  claude  claude-opus-5 through the anthropic SDK, ANTHROPIC_API_KEY. Costs
          roughly half a euro for a 15 trip shortlist.
  gemini  the free AI Studio tier over the REST API, GEMINI_API_KEY, with the
          same model chain and fall-over rules as the plan-day Edge Function.
          Free tier prompts may be used by Google to improve their products,
          which is acceptable here because the facts block is open data. Note
          the EEA paid-services rule that put plan-day on a billed key applies
          to API clients offered to users, not to a local batch script.

A weaker writer is safe in this design: it loses sentences to the verification
pass rather than smuggling inventions past it. Refusals, safety blocks and
Gemini's own RECITATION guard are surfaced per trip and the run continues.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/describe.py --countries CH        # seed shortlist
    python pipeline/trails/describe.py --countries CH --dry-run   # no API calls
    python pipeline/trails/describe.py --ids 9473 --verbose
    python pipeline/trails/describe.py --countries CH --provider gemini
    python pipeline/trails/describe.py --countries CH,AT --top 5 --redescribe
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from env_local import load_env  # noqa: E402
import harvest_wikivoyage as wv  # noqa: E402  (shared MediaWiki client + cache shape)

DESCRIPTIONS_DDL = ROOT / "tools" / "trailslab" / "initdb" / "03_trip_descriptions.sql"
SEED_DIR = ROOT / "data" / "reports" / "trails_seed"
WV_CACHE = ROOT / "cache" / "trail_wikivoyage.json"

PILOT_COUNTRIES = "CH,FR,NO,AT"

MODEL = "claude-opus-5"
EFFORT = "low"              # rewriting a fixed fact list, not reasoning work
MAX_TOKENS_WRITE = 4000     # thinking is on by default and shares this budget
MAX_TOKENS_VERIFY = 8000
FALLBACK_BETA = "server-side-fallback-2026-07-01"
CALL_DELAY_S = 0.3

# Gemini: same chain and fall-over rules as supabase/functions/plan-day, so a
# model retired or rate limited out from under us drops to the next one instead
# of failing the run. These are thinking models whose thoughts spend the output
# budget, hence the generous floor; headroom itself costs nothing.
GEMINI_API = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "{model}:generateContent")
GEMINI_CHAIN = ["gemini-flash-latest", "gemini-3.5-flash",
                "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
GEMINI_MIN_OUTPUT = 8192
GEMINI_TIMEOUT_S = 90
# The free tier meters requests per minute, and this script fires two calls per
# trip back to back. Pace them instead of discovering the limit: a 429 that
# walks the whole chain costs more wall clock than waiting did, and it lands
# the run on a weaker model for no reason.
GEMINI_MIN_INTERVAL_S = 6.5   # about 9 requests a minute, under the free floor
GEMINI_RETRY_S = 20.0

MIN_SENTENCES = 3           # 2 summary + at least 1 paragraph sentence
MAX_SENTENCES = 6
SHINGLE_N = 6               # word run that counts as lifted from Wikivoyage

COUNTRY_NAMES = {"CH": "Switzerland", "FR": "France", "NO": "Norway",
                 "AT": "Austria", "DE": "Germany", "IT": "Italy",
                 "ES": "Spain", "SE": "Sweden", "FI": "Finland"}

NETWORK_LABELS = {
    "iwn": "international waymarked hiking network",
    "nwn": "national waymarked hiking network",
    "rwn": "regional waymarked hiking network",
    "lwn": "local waymarked hiking network",
}

ROUTE_LABELS = {"hiking": "waymarked hiking route", "foot": "walking route",
                "walking": "walking route"}

DIFFICULTY_LABELS = {
    "easy": "easy",
    "moderate": "moderate",
    "hard": "hard",
}

SAC_LABELS = {
    "hiking": "marked paths, no scrambling (SAC T1)",
    "mountain_hiking": "mountain paths with some exposure (SAC T2)",
    "demanding_mountain_hiking": "demanding mountain hiking (SAC T3)",
    "alpine_hiking": "alpine hiking, sure footing required (SAC T4)",
    "demanding_alpine_hiking": "demanding alpine terrain (SAC T5)",
    "difficult_alpine_hiking": "difficult alpine terrain (SAC T6)",
}


class DescribeError(Exception):
    """One trip failed; the run continues with the others."""


class CredentialError(Exception):
    """The backend rejected our key; every trip would fail the same way."""


# ---------------------------------------------------------------------------
# House style: the repo ships no em or en dashes anywhere
# ---------------------------------------------------------------------------

def strip_dashes(text):
    """Python port of continent-app/src/lib/format.js stripDashes.

    Numeric ranges and tight word joins become a plain hyphen, spaced prose
    dashes become a comma pause. Belt and braces: the prompt also forbids
    them, but a model slip must never reach the DB."""
    text = re.sub(r"(\d)\s*[—–]\s*(\d)", r"\1-\2", text)
    text = re.sub(r"(\w)[—–](\w)", r"\1-\2", text)
    return re.sub(r"\s*[—–]\s*", ", ", text)


def clean_text(text):
    """Normalise model output to plain prose: no dashes, no markdown, no
    smart quotes, single spaces, blank line between the two blocks."""
    text = unicodedata.normalize("NFKC", text or "").strip()
    text = strip_dashes(text)
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.M)      # stray headings
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.M)  # stray bullets
    text = re.sub(r"\*\*?([^*]+)\*\*?", r"\1", text)           # stray emphasis
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


# Abbreviations that end in a period without ending a sentence. Kept short on
# purpose: the generated prose is plain, and a missed split only costs us a
# coarser verification unit, never a wrong fact.
_ABBREV = {"st", "mt", "mts", "nr", "no", "approx", "vs", "e.g", "i.e"}


_PROTECT = "\x00"


def split_sentences(text, protect=()):
    """[(block_index, sentence)] over the whole description.

    Splits on sentence punctuation followed by a capital or digit, then merges
    back the false positives: decimals ("15.2 km"), initials and the
    abbreviations above.

    protect holds the fact values, whose internal periods are masked first. A
    route really can be called 'ehem. VA-R103', and no abbreviation list will
    ever cover every language we ingest, but the exact strings we put IN the
    prompt are knowable. Splitting one of them in half produces two fragments
    that the verification pass then drops, losing a perfectly good sentence."""
    for value in sorted(protect, key=len, reverse=True):
        if "." in value and value in text:
            text = text.replace(value, value.replace(".", _PROTECT))
    out = []
    for block_index, block in enumerate(
            [b for b in re.split(r"\n\s*\n", text) if b.strip()]):
        pieces = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", block.strip())
        merged = []
        for piece in pieces:
            if merged:
                prev = merged[-1]
                tail = prev.rstrip()
                last = re.split(r"[\s(]", tail)[-1].rstrip(".").lower()
                if tail.endswith(".") and (last in _ABBREV or len(last) <= 1
                                           or re.fullmatch(r"\d+", last)):
                    merged[-1] = prev + " " + piece
                    continue
            merged.append(piece)
        out.extend((block_index, s.strip().replace(_PROTECT, "."))
                   for s in merged if s.strip())
    return out


def leaked_field_names(sentence, facts):
    """Field names the sentence wrote out verbatim ("the distance_km is 27.6
    km"). Single word field names are skipped: they double as ordinary
    English, so only the underscored ones are unambiguous leaks."""
    return [f for f in facts if "_" in f
            and re.search(rf"\b{re.escape(f)}\b", sentence)]


def fold_name(name):
    """Accent-folded lowercase, for spotting the same anchor twice. Deliberately
    local and tiny: importing popularity.py's fold() would drag the activities
    harvesters and their caches into a script that needs neither."""
    text = unicodedata.normalize("NFKD", (name or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def shingles(text, n=SHINGLE_N):
    """Set of lowercase n word runs, used for the Wikivoyage overlap guard."""
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


# ---------------------------------------------------------------------------
# Facts: every field here is something we already hold and can point at
# ---------------------------------------------------------------------------

def build_facts(trip):
    """{field name: value string} for the prompt and the verification map.

    Order matters only for readability. Absent data is omitted rather than
    sent as 'unknown', so the model cannot narrate a gap."""
    tags = trip["raw_tags"] or {}
    facts = {}

    facts["name"] = trip["title"]
    if tags.get("ref"):
        facts["signpost_code"] = f"signposted as {tags['ref']}"
    facts["route_type"] = ROUTE_LABELS.get((tags.get("route") or "").strip(),
                                           "waymarked hiking route")
    facts["country"] = COUNTRY_NAMES.get(trip["country"], trip["country"])

    if trip["distance_m"]:
        facts["distance_km"] = f"{trip['distance_m'] / 1000:.1f} km"
    if trip["ascent_m"] is not None:
        facts["ascent_m"] = f"{int(trip['ascent_m'])} m of ascent"
    if trip["descent_m"] is not None:
        facts["descent_m"] = f"{int(trip['descent_m'])} m of descent"
    if trip["duration_min"]:
        hours = trip["duration_min"] / 60.0
        # A decimal on a 92 hour through hike is false precision; a decimal on
        # a 1.4 hour stroll is the useful part of the number.
        shown = f"{hours:.0f}" if hours >= 10 else f"{hours:.1f}"
        facts["walking_time"] = (f"about {shown} hours on the DIN 33466 "
                                 f"hiking time rule")
    if trip["difficulty"] in DIFFICULTY_LABELS:
        facts["difficulty"] = (f"{DIFFICULTY_LABELS[trip['difficulty']]}, "
                               f"derived from distance and ascent")
    sac = (trip["sac_scale"] or "").strip().lower().split(";")[0].strip()
    if sac in SAC_LABELS:
        facts["terrain_grade"] = SAC_LABELS[sac]
    if trip["network"] in NETWORK_LABELS:
        facts["network"] = NETWORK_LABELS[trip["network"]]
    if (tags.get("roundtrip") or "").lower() == "yes":
        facts["shape"] = "starts and finishes at the same place"

    portal = trip.get("portal") or {}
    if portal.get("passed"):
        source = (portal.get("details") or {}).get("source") or "a national portal"
        facts["official_route"] = (
            f"the line matches the official route published by {source}")

    # popularity.py returns the three highest-fame anchors, which for a city
    # is often the city plus two of its own landmarks under near-identical
    # names ("Lausanne, Lausanne, Lausanne"). Keep the nearest per name.
    nearest = {}
    for a in trip.get("anchors") or []:
        key = fold_name(a["name"])
        if key not in nearest or a["dist_m"] < nearest[key]["dist_m"]:
            nearest[key] = a
    anchors = sorted(nearest.values(), key=lambda a: a["dist_m"])
    if anchors:
        # Rounded to hundreds with a 100 m floor: the anchor point is a city
        # or POI centroid, so "within 1 m" would be false precision the model
        # would happily repeat. Phrased as shippable prose, not as our own
        # vocabulary: the model reuses this wording, and "catalogue places"
        # is an internal term no traveller should ever read.
        named = ", ".join(
            f"{a['name']} within {max(100, round(a['dist_m'] / 100) * 100)} m"
            for a in anchors[:3])
        facts["nearby_places"] = f"the route passes {named}"

    return facts


def facts_text(facts):
    # Titles, refs and anchor names originate in OSM tags anyone can edit.
    # One value per line, no control characters, bounded length: a tag that
    # tries to smuggle its own "- instruction:" lines or prompt text into the
    # FACTS block stays a single, visibly odd value instead.
    def clean(v):
        flat = re.sub(r"[\x00-\x1f\x7f]+", " ", str(v))
        return re.sub(r"\s{2,}", " ", flat).strip()[:300]
    return "\n".join(f"- {k}: {clean(v)}" for k, v in facts.items())


# ---------------------------------------------------------------------------
# Wikivoyage: signal only, cached per trip title
# ---------------------------------------------------------------------------

# Stage naming conventions across the pilot countries, mirroring the family
# folding in popularity.py. Long routes are mapped as stage relations and only
# the parent has a guide article, so 'Via Alpina Stage 58: Sucka - Sargans'
# has to fall back to 'Via Alpina'.
_STAGE_RE = re.compile(
    r"\s*[-,:(]*\s*\b(?:etappe|etapp|etape|stage|dagsetapp|abschnitt|leg"
    r"|section|tappa|troncon)\b.*$", re.I)


def route_name_candidates(title):
    """[full title, parent route name] with the stage suffix removed."""
    title = (title or "").strip()
    out = [title]
    base = _STAGE_RE.sub("", title).strip(" :-,;.")
    if len(base) >= 4 and base.lower() != title.lower():
        out.append(base)
    return out


def _lookup(name, coord):
    rec = wv.fetch_single(name, coord)
    if not rec:
        guess = wv.opensearch(name)
        if guess:
            rec = wv.fetch_single(guess, coord)
    return rec


def wikivoyage_snippet(title, coord, cache, offline):
    """Guide intro for a route name, or None. Reuses harvest_wikivoyage's
    MediaWiki client (retry, redirect resolution, coordinate sanity check) and
    caches confirmed misses so a rerun does not ask again. The hit may describe
    the parent long distance route rather than this stage, which is fine: it is
    signal about what matters on the route, never source material."""
    for name in route_name_candidates(title):
        key = name.lower()
        if key in cache:
            rec = cache[key]
            if not rec.get("miss"):
                return rec
            continue
        if offline:
            continue
        rec = _lookup(name, coord)
        cache[key] = rec or {"miss": True}
        time.sleep(1.0)   # shared IP rate limit, same courtesy as the harvester
        if rec:
            return rec
    return None


def save_wv_cache(cache):
    WV_CACHE.parent.mkdir(exist_ok=True)
    WV_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1),
                        encoding="utf-8")


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

WRITE_SYSTEM = """You write short factual blurbs for a hiking catalogue.

You are a rewriter, not a researcher. Every claim you make must come from the
FACTS block of the message. You have no other knowledge of this route: if a
fact is not listed, it does not exist for you.

Rules:
1. Use only the FACTS. Never introduce a number, place name, season, viewpoint,
   surface, transport option, price or historical claim that is not there.
2. Never restate a number differently. If the facts say 15.2 km, do not write
   "roughly 15 km" or "a half day".
3. The CONTEXT block, when present, is licensed third party prose. Do not quote
   it, paraphrase it, or borrow its phrasing, structure or adjectives. Use it
   only to judge which of the supplied facts a walker cares about most.
4. No em dashes and no en dashes. Plain sentences only: no headings, no bullet
   lists, no bold or italic markup, no emoji.
5. No second person, no marketing voice, no superlatives the facts do not
   support. Describe, do not sell.
6. The field names on the left of each fact are labels for you, not vocabulary
   for the reader. Never write one into a sentence: "the geometry matches the
   official route published by swisstopo", never "portal confirmation shows".
7. Output exactly two sentences summarising the route, then a blank line, then
   one paragraph of two to four sentences adding the remaining facts. Nothing
   else: no preamble, no title, no closing line."""

VERIFY_SYSTEM = """You audit a draft blurb against the facts it was built from.

You are given a FACTS block and the draft split into numbered sentences. For
each sentence, list every FACTS field it draws on and say whether all of its
claims are supported by those fields.

Rules:
1. fields lists the FACTS field names the sentence uses, in any order. A
   sentence usually combines several: list all of them, not just the main one.
   A sentence that uses no supplied field gets an empty list.
2. grounded is true only if EVERY claim in the sentence, including every number
   and every name, comes from the fields you listed. One unsupported detail in
   an otherwise fine sentence makes it false.
3. A sentence that is merely plausible, generic or atmospheric is not grounded.
   Neither is a rounded or reworded number.
4. The CONTEXT block is not a source. A sentence supported only by CONTEXT has
   an empty fields list and grounded false.
5. Judge, do not fix. Never rewrite a sentence."""

VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "sentences": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "fields": {"type": "array", "items": {"type": "string"}},
                    "grounded": {"type": "boolean"},
                    "note": {"type": "string"},
                },
                "required": ["index", "fields", "grounded", "note"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["sentences"],
    "additionalProperties": False,
}


def write_prompt(facts, snippet):
    parts = ["FACTS", facts_text(facts)]
    if snippet:
        parts += ["", "CONTEXT (signal only, never quote or paraphrase)",
                  snippet["extract"]]
    parts += ["", "Write the blurb now."]
    return "\n".join(parts)


def verify_prompt(facts, sentences, snippet):
    numbered = "\n".join(f"{i}. {s}" for i, (_, s) in enumerate(sentences))
    parts = ["FACTS", facts_text(facts),
             "", "FIELD NAMES", ", ".join(facts),
             "", "DRAFT SENTENCES", numbered]
    if snippet:
        parts += ["", "CONTEXT (not a source)", snippet["extract"]]
    parts += ["", "Map every sentence."]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# API plumbing
#
# Both backends expose the same surface: name, model, a message(system, user,
# max_tokens, schema) that returns text (JSON text when a schema is given),
# and call/token counters for the run summary. describe_trip() knows nothing
# else about them.
# ---------------------------------------------------------------------------

class Claude:
    """Thin wrapper: one model, one effort level, server side refusal
    fallbacks on by default (dropped for the rest of the run if this key has
    no access to the beta), plus usage accounting for the run summary."""

    name = "claude"

    def __init__(self, api_key=None, model=MODEL, effort=EFFORT):
        import anthropic
        self.anthropic = anthropic
        # api_key None is not "no credentials": the SDK then resolves
        # ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile on its own. It
        # only complains at request time though, so check here instead of
        # letting every trip fail one API call in.
        self.client = anthropic.Anthropic(api_key=api_key)
        if not (self.client.api_key or self.client.auth_token
                or getattr(self.client, "credentials", None)):
            raise CredentialError("no API key, auth token or CLI profile found")
        self.model = model
        self.settings = {"effort": effort}
        self.effort = effort
        self.fallbacks = True
        self.calls = 0
        self.tokens_in = 0
        self.tokens_out = 0

    def message(self, system, user, max_tokens, schema=None):
        output_config = {"effort": self.effort}
        if schema:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": output_config,
        }
        try:
            resp = self._send(kwargs)
        except (self.anthropic.AuthenticationError,
                self.anthropic.PermissionDeniedError) as exc:
            raise CredentialError(str(exc)) from exc
        except self.anthropic.BadRequestError as exc:
            if not (self.fallbacks and "fallback" in str(exc).lower()):
                raise
            print("  note: this key cannot use server side refusal fallbacks; "
                  "continuing without them")
            self.fallbacks = False
            resp = self._send(kwargs)

        self.calls += 1
        usage = resp.usage
        self.tokens_in += (usage.input_tokens or 0)
        self.tokens_out += (usage.output_tokens or 0)
        if resp.stop_reason == "refusal":
            category = getattr(resp.stop_details, "category", None)
            raise DescribeError(f"model refused the request ({category})")
        if resp.stop_reason == "max_tokens":
            raise DescribeError("response hit max_tokens before finishing")
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        if not text:
            raise DescribeError("empty response")
        return text

    def _send(self, kwargs):
        if self.fallbacks:
            return self.client.beta.messages.create(
                betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
        return self.client.messages.create(**kwargs)


def gemini_schema(schema):
    """JSON Schema -> the OpenAPI subset Gemini's responseSchema accepts.

    Types are uppercase there and additionalProperties is not supported, so it
    is dropped: our own code checks the field values anyway, and an extra key
    in the response is harmless."""
    if not isinstance(schema, dict):
        return schema
    out = {}
    for key, value in schema.items():
        if key == "additionalProperties":
            continue
        if key == "type":
            out["type"] = str(value).upper()
        elif key == "properties":
            out["properties"] = {k: gemini_schema(v) for k, v in value.items()}
        elif key == "items":
            out["items"] = gemini_schema(value)
        else:
            out[key] = value
    return out


class Gemini:
    """Free AI Studio tier over the REST API.

    Mirrors the Edge Function conventions: a model chain tried in order, with
    a fall-over on exactly the statuses that another model could survive (429
    budget spent, 404 model retired, 5xx overloaded). Anything else is our own
    bad request and would fail identically everywhere, so it stops."""

    name = "gemini"

    def __init__(self, api_key, chain=None, model=None):
        if not api_key:
            raise CredentialError("GEMINI_API_KEY is not set")
        self.api_key = api_key
        env_chain = os.environ.get("GEMINI_MODELS", "")
        listed = [m.strip() for m in env_chain.split(",") if m.strip()]
        pinned = [m for m in [model or os.environ.get("GEMINI_MODEL")] if m]
        self.chain = chain or listed or list(dict.fromkeys(pinned + GEMINI_CHAIN))
        self.model = self.chain[0]
        self.settings = {"chain": self.chain,
                         "min_interval_s": GEMINI_MIN_INTERVAL_S}
        self.calls = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self._last_call = 0.0

    def message(self, system, user, max_tokens, schema=None):
        config = {
            # Thinking models spend this budget on their thoughts before any
            # visible text, so keep a floor well above what the answer needs.
            "maxOutputTokens": max(max_tokens, GEMINI_MIN_OUTPUT),
            "temperature": 0.0 if schema else 0.3,
        }
        if schema:
            config["responseMimeType"] = "application/json"
            config["responseSchema"] = gemini_schema(schema)
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": config,
        }

        last = None
        for model in self.chain:
            for attempt in (1, 2):
                status, data = self._post(model, body)
                if status == 200:
                    if model != self.chain[0]:
                        # Stick with whatever answered. A free tier budget that
                        # is spent stays spent for a while, and re-testing the
                        # preferred model on every call costs a 429 plus the
                        # retry wait each time.
                        self.chain = ([model]
                                      + [m for m in self.chain if m != model])
                        self.settings["chain"] = self.chain
                    self.model = model
                    return self._text(data)
                last = f"HTTP {status}"
                if status in (401, 403):
                    raise CredentialError(
                        f"Gemini rejected the key (HTTP {status})")
                if not (status == 429 or status == 404 or status >= 500):
                    raise DescribeError(f"gemini rejected the request ({last}): "
                                        f"{str(data)[:200]}")
                # A per-minute limit clears on its own, so wait once before
                # giving up on this model. A retired or overloaded model will
                # not, hence only the one attempt.
                if status == 429 and attempt == 1:
                    print(f"  note: {model} is rate limited, waiting "
                          f"{GEMINI_RETRY_S:.0f}s")
                    time.sleep(GEMINI_RETRY_S)
                    continue
                break
            print(f"  note: {model} returned {last}, trying the next model")
        raise DescribeError(f"every model in the chain failed (last: {last})")

    def _post(self, model, body):
        wait = self._last_call + GEMINI_MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()
        req = urllib.request.Request(
            GEMINI_API.format(model=model),
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "x-goog-api-key": self.api_key},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_S) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                payload = json.loads(exc.read().decode("utf-8"))
            except Exception:
                payload = {}
            return exc.code, payload
        except (urllib.error.URLError, TimeoutError) as exc:
            raise DescribeError(f"gemini request failed: {exc}") from exc

    def _text(self, data):
        self.calls += 1
        usage = data.get("usageMetadata") or {}
        self.tokens_in += usage.get("promptTokenCount", 0)
        self.tokens_out += (usage.get("candidatesTokenCount", 0)
                            + usage.get("thoughtsTokenCount", 0))

        blocked = (data.get("promptFeedback") or {}).get("blockReason")
        if blocked:
            raise DescribeError(f"prompt blocked by Gemini ({blocked})")
        candidates = data.get("candidates") or []
        if not candidates:
            raise DescribeError("empty response")
        reason = candidates[0].get("finishReason")
        if reason == "MAX_TOKENS":
            raise DescribeError("response hit maxOutputTokens before finishing")
        # RECITATION is Gemini's own copy guard. It is a second net under the
        # Wikivoyage rule: if the draft was reciting the guide, we do not want
        # it either.
        if reason not in (None, "STOP"):
            raise DescribeError(f"model stopped with {reason}")
        text = "".join(p.get("text", "") for p in
                       (candidates[0].get("content") or {}).get("parts", []))
        text = text.strip()
        if not text:
            raise DescribeError("empty response")
        return text


def make_backend(provider):
    """'auto' picks whichever key is present, Claude first."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if provider == "auto":
        if anthropic_key:
            provider = "claude"
        elif gemini_key:
            provider = "gemini"
        else:
            provider = "claude"   # its own error message lists both options
    if provider == "gemini":
        return Gemini(gemini_key)
    try:
        return Claude(anthropic_key)
    except ImportError as exc:
        raise CredentialError("the anthropic SDK is missing; "
                              "pip install anthropic") from exc


# ---------------------------------------------------------------------------
# Write + verify one trip
# ---------------------------------------------------------------------------

def describe_trip(backend, facts, snippet, verbose=False):
    """(description, report). Raises DescribeError when nothing usable
    survives, so the caller can skip the trip without writing anything."""
    draft = clean_text(backend.message(WRITE_SYSTEM,
                                       write_prompt(facts, snippet),
                                       MAX_TOKENS_WRITE))
    sentences = split_sentences(draft, protect=facts.values())
    if not sentences:
        raise DescribeError("draft had no sentences")
    if len(sentences) > MAX_SENTENCES + 2:
        raise DescribeError(f"draft ran to {len(sentences)} sentences")

    raw = backend.message(VERIFY_SYSTEM,
                          verify_prompt(facts, sentences, snippet),
                          MAX_TOKENS_VERIFY, schema=VERIFY_SCHEMA)
    try:
        verdicts = {int(item["index"]): item
                    for item in json.loads(raw).get("sentences", [])}
    except (ValueError, KeyError, TypeError) as exc:
        # No second attempt: an unparseable audit means we cannot show the
        # sentence to field map, and storing unaudited prose is the one thing
        # this script exists to prevent.
        raise DescribeError(f"verification pass returned unusable JSON: {exc}")

    wv_shingles = shingles(snippet["extract"]) if snippet else set()
    kept, dropped, sentence_map = [], [], []
    for i, (block, sentence) in enumerate(sentences):
        v = verdicts.get(i)
        listed = [f for f in ((v or {}).get("fields") or []) if isinstance(f, str)]
        unknown = [f for f in listed if f not in facts]
        note = (v or {}).get("note", "")
        if v is None:
            reason = "verification pass did not map this sentence"
        elif not v.get("grounded"):
            reason = note or "not grounded in the supplied facts"
        elif not listed:
            reason = "maps to no fact we supplied"
        elif unknown:
            # An invented field name is the audit hallucinating its own source.
            reason = f"cites {', '.join(unknown)}, which we did not supply"
        elif leaked_field_names(sentence, facts):
            # Rule 6 asks the model not to write our field names; this enforces
            # it. Only names carrying an underscore are checked, because the
            # single word ones (name, country, difficulty, network) are also
            # ordinary English a sentence is allowed to use.
            reason = (f"writes the field name "
                      f"{', '.join(leaked_field_names(sentence, facts))} "
                      f"into the prose")
        elif wv_shingles and shingles(sentence) & wv_shingles:
            # Guard, not a judgement call: shared wording with CC BY-SA prose
            # is dropped whatever the model concluded about the facts.
            reason = "shares wording with the Wikivoyage context"
        else:
            reason = None

        entry = {"sentence": sentence, "fields": listed if reason is None else [],
                 "kept": reason is None}
        if reason:
            entry["reason"] = reason
            dropped.append(entry)
        else:
            kept.append((block, sentence))
        sentence_map.append(entry)
        if verbose:
            mark = "keep" if reason is None else "DROP"
            print(f"    [{mark}] {sentence[:80]}"
                  + (f"  <- {', '.join(listed)}" if reason is None
                     else f"  ({reason})"))

    if len(kept) < MIN_SENTENCES:
        raise DescribeError(
            f"only {len(kept)}/{len(sentences)} sentences survived verification")

    # Rebuild the two block shape from what survived: first two sentences are
    # the summary, the rest is the paragraph, regardless of which block they
    # came from (a drop can empty one of the original blocks).
    flat = [s for _, s in kept]
    description = " ".join(flat[:2]) + "\n\n" + " ".join(flat[2:])
    report = {
        "provider": backend.name,
        "model": backend.model,
        "settings": backend.settings,
        "fields_supplied": list(facts),
        "fields_used": sorted({f for e in sentence_map if e["kept"]
                               for f in e["fields"]}),
        "sentences_total": len(sentences),
        "sentences_kept": len(kept),
        "sentence_map": sentence_map,
        "dropped": [{"sentence": d["sentence"], "reason": d["reason"]}
                    for d in dropped],
        "wikivoyage_context": ({"title": snippet["title"], "url": snippet["url"]}
                               if snippet else None),
        "chars": len(description),
    }
    return clean_text(description), report


# ---------------------------------------------------------------------------
# DB in/out
# ---------------------------------------------------------------------------

FETCH_SQL = """
    SELECT t.id, t.country, t.category::text, t.title, t.network, t.sac_scale,
           t.difficulty, t.distance_m, t.ascent_m, t.descent_m, t.duration_min,
           t.status::text, t.quality_score, t.raw_tags, t.description_md,
           ST_Y(ST_PointOnSurface(ST_Force2D(t.geom))),
           ST_X(ST_PointOnSurface(ST_Force2D(t.geom)))
    FROM trips t
    WHERE t.id = ANY(%s)
    ORDER BY t.country, t.id
"""

COLUMNS = ("id", "country", "category", "title", "network", "sac_scale",
           "difficulty", "distance_m", "ascent_m", "descent_m", "duration_min",
           "status", "quality_score", "raw_tags", "description_md",
           "lat", "lon")

LATEST_CHECK_SQL = """
    SELECT DISTINCT ON (subject_id) subject_id, passed, details
    FROM validation_runs
    WHERE subject_type = 'trip' AND check_name = %s AND subject_id = ANY(%s)
    ORDER BY subject_id, run_at DESC, id DESC
"""

UPDATE_SQL = """
    UPDATE trips
    SET description_md = %s, described_at = now()
    WHERE id = %s
"""

INSERT_CHECK_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES ('trip', %s, 'description_grounding', %s, %s, %s)
"""


def load_trips(conn, ids):
    with conn.cursor() as cur:
        cur.execute(FETCH_SQL, (ids,))
        trips = [dict(zip(COLUMNS, row)) for row in cur.fetchall()]
        cur.execute(LATEST_CHECK_SQL, ("portal_agreement", ids))
        portal = {sid: {"passed": passed, "details": details}
                  for sid, passed, details in cur.fetchall()}
        cur.execute(LATEST_CHECK_SQL, ("popularity", ids))
        anchors = {sid: (details or {}).get("anchors") or []
                   for sid, _, details in cur.fetchall()}
    conn.commit()   # read only, but a lingering transaction blocks later DDL
    for t in trips:
        t["portal"] = portal.get(t["id"])
        t["anchors"] = anchors.get(t["id"], [])
    return trips


def seed_ids(country, top):
    """Trip ids from the popularity shortlist CSV, best first."""
    path = SEED_DIR / f"{country}.csv"
    if not path.exists():
        return None
    with path.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return [int(r["trip_id"]) for r in rows[:top] if r.get("trip_id")]


def ranked_ids(conn, country, top):
    """Fallback when the shortlist CSV is missing: the newest popularity rows
    for that country, highest curation_rank first."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT v.subject_id FROM (
                SELECT DISTINCT ON (subject_id) subject_id, score
                FROM validation_runs
                WHERE subject_type = 'trip' AND check_name = 'popularity'
                ORDER BY subject_id, run_at DESC, id DESC
            ) v
            JOIN trips t ON t.id = v.subject_id
            WHERE t.country = %s AND t.title NOT LIKE 'OSM route %%'
            ORDER BY v.score DESC NULLS LAST
            LIMIT %s""", (country, top))
        ids = [r[0] for r in cur.fetchall()]
    conn.commit()
    return ids


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main():
    # line_buffering so a redirected run (nohup, a log file, run_pipeline)
    # shows progress as it happens instead of dumping everything at exit.
    sys.stdout.reconfigure(errors="replace", line_buffering=True)
    parser = argparse.ArgumentParser(
        description="Generate grounded trip descriptions with a model used "
                    "strictly as a rewriter over a facts block, then verify "
                    "every sentence against those facts and store what "
                    "survives.")
    parser.add_argument("--countries", default="CH",
                        help="comma separated ISO codes (default: CH; the "
                             f"pilot set is {PILOT_COUNTRIES})")
    parser.add_argument("--ids", default="",
                        help="comma separated trip ids, bypasses the shortlist")
    parser.add_argument("--top", type=int, default=15,
                        help="shortlist rows per country (default: 15)")
    parser.add_argument("--provider", choices=("auto", "claude", "gemini"),
                        default="auto",
                        help="model backend (default: auto, whichever key is "
                             "set, ANTHROPIC_API_KEY first)")
    parser.add_argument("--redescribe", action="store_true",
                        help="overwrite trips that already have a description")
    parser.add_argument("--offline", action="store_true",
                        help="no Wikivoyage lookups; use the cache as it is")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the facts blocks only: no API calls, "
                             "no DB writes")
    parser.add_argument("--verbose", action="store_true",
                        help="print the per sentence verification verdicts")
    args = parser.parse_args()

    load_env()
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    conn = connect()
    with conn.cursor() as cur:
        cur.execute(DESCRIPTIONS_DDL.read_text())   # fresh labs and old volumes
    conn.commit()

    if args.ids:
        ids = [int(i) for i in args.ids.split(",") if i.strip()]
    else:
        ids = []
        for country in countries:
            picked = seed_ids(country, args.top)
            if picked is None:
                picked = ranked_ids(conn, country, args.top)
                print(f"[{country}] no seed shortlist CSV; using the top "
                      f"{len(picked)} popularity rows from the DB")
            else:
                print(f"[{country}] {len(picked)} trips from "
                      f"{SEED_DIR.name}/{country}.csv")
            ids.extend(picked)
    if not ids:
        conn.close()
        sys.exit("no trips selected; run popularity.py first or pass --ids")

    trips = load_trips(conn, ids)
    if not args.redescribe:
        skipped = [t for t in trips if t["description_md"]]
        trips = [t for t in trips if not t["description_md"]]
        if skipped:
            print(f"skipping {len(skipped)} trips that already have a "
                  f"description (use --redescribe to overwrite)")
    if not trips:
        conn.close()
        print("nothing to do")
        return

    wv_cache = wv._load(WV_CACHE)
    backend = None
    if not args.dry_run:
        try:
            backend = make_backend(args.provider)
        except CredentialError as exc:
            conn.close()
            sys.exit(f"no model credentials ({exc}); put ANTHROPIC_API_KEY or "
                     f"GEMINI_API_KEY in the repo root .env (see .env.example) "
                     f"and pick one with --provider, or run with --dry-run to "
                     f"build the facts blocks only")
        print(f"{len(trips)} trips to describe with {backend.name} "
              f"{backend.model} ({backend.settings})")
    else:
        print(f"{len(trips)} trips, dry run: facts blocks only")

    written, failures, wv_hits = 0, [], 0
    t0 = time.time()
    for n, trip in enumerate(trips, 1):
        facts = build_facts(trip)
        coord = ([trip["lat"], trip["lon"]]
                 if trip["lat"] is not None and trip["lon"] is not None else None)
        snippet = wikivoyage_snippet(trip["title"], coord, wv_cache, args.offline)
        if snippet:
            wv_hits += 1
        print(f"\n[{n}/{len(trips)}] {trip['id']} {trip['title'][:60]} "
              f"({trip['country']}, {len(facts)} facts"
              + (f", wikivoyage: {snippet['title']}" if snippet else "") + ")")

        if args.dry_run:
            print(facts_text(facts))
            continue

        try:
            description, report = describe_trip(backend, facts, snippet,
                                                args.verbose)
        except CredentialError as exc:
            conn.close()   # a bad key fails every trip: stop, do not grind on
            sys.exit(f"{backend.name} rejected the credentials: {exc}")
        except DescribeError as exc:
            failures.append(f"{trip['id']} {trip['title'][:40]}: {exc}")
            print(f"  SKIPPED: {exc}")
            continue
        except Exception as exc:      # one bad trip must not end the run
            failures.append(f"{trip['id']}: {type(exc).__name__}: {exc}")
            print(f"  SKIPPED: {type(exc).__name__}: {exc}")
            continue

        with conn.cursor() as cur:
            cur.execute(UPDATE_SQL, (description, trip["id"]))
            cur.execute(INSERT_CHECK_SQL,
                        (trip["id"], not report["dropped"],
                         round(100.0 * report["sentences_kept"]
                               / report["sentences_total"], 1),
                         Jsonb(report)))
        conn.commit()
        written += 1
        print(f"  kept {report['sentences_kept']}/{report['sentences_total']} "
              f"sentences, fields: {', '.join(report['fields_used'])}")
        print("  " + description.replace("\n\n", "\n  "))
        time.sleep(CALL_DELAY_S)

    save_wv_cache(wv_cache)
    conn.close()

    if args.dry_run:
        print(f"\ndry run: {len(trips)} facts blocks built, "
              f"{wv_hits} with a Wikivoyage snippet, nothing written")
        return
    print(f"\ndone in {time.time() - t0:.0f}s: {written} descriptions stored, "
          f"{len(failures)} skipped; {wv_hits} trips had Wikivoyage context")
    print(f"api: {backend.calls} calls to {backend.name} {backend.model}, "
          f"{backend.tokens_in} input tokens, {backend.tokens_out} output "
          f"tokens (thinking included)")
    for line in failures[:10]:
        print(f"  skipped {line}")


if __name__ == "__main__":
    main()
