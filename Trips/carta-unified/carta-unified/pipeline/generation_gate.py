#!/usr/bin/env python3
"""The gate every model-generated trip passes before it touches disk (T143, spec K1).

    python pipeline/generation_gate.py check FILE...           exit 1 if any file fails
    python pipeline/generation_gate.py admit FILE... --dest DIR --rejects DIR
    python pipeline/generation_gate.py gemini-schema [--out FILE]
    python pipeline/generation_gate.py survey [--data data/trips.master.json]
    python pipeline/generation_gate.py self-test

A generator never asks a model for "a description of the trip". It asks for
named fields with typed values, the ones in schema/trip.generated.schema.json:
budget.breakdown.food.lowEur as an integer, itinerary[3].dayStats.ascentM as
an integer, packingNotes[] as {icon, item, whyThisTrip}. gemini_response_schema()
turns that schema into the responseSchema a Gemini generateContent call takes,
minus the fields the pipeline derives itself (derive() fills those), so the
model is constrained to the shape at decoding time.

Then the answer is checked three ways, and a single failure rejects the file:

1. the JSON Schema (types, enums, lengths, required keys, no extra keys, no
   dash characters in display copy, no euro range inside a note whose number
   has a typed home);
2. the cross-field rules a schema cannot express (semantic_errors below: the
   id matches the country and type, low <= high on every pair, each night's
   sleepRef names a real strategy entry and every entry is slept in or
   declared an alternative, the derived fields agree with what they derive
   from, the model is a Gemini model);
3. the K5 mechanical checks in validate.py, run on the one record (budget sum,
   per-day, surface split, comma ranges, accommodation slept in).

The gate rejects; it never repairs. A repaired file is a file nobody wrote and
nobody checked, and "nearly valid" files are how half-valid trips enter a
catalogue. admit() writes a passing record atomically into --dest and a
failing one, byte for byte as received, into --rejects with its errors beside
it, so the failure can be read and the prompt fixed.

Runtime and pipeline AI is Gemini only (CLAUDE.md). This module makes no
network call at all; the generator that calls Gemini is T144's.
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - fail closed, never admit unchecked
    Draft202012Validator = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(ROOT, "schema", "trip.generated.schema.json")
EXAMPLE_PATH = os.path.join(ROOT, "schema", "examples", "generated-trip.example.json")
SCHEMA_VERSION = "2.1"

# Fields the pipeline fills, never the model. Each is a key path. They are
# left out of the Gemini response schema and written by derive(), so a model
# cannot get, say, perDayEur out of step with totalEur: it is never asked.
DERIVED = [
    ("schemaVersion",), ("sourceId",), ("slug",), ("summaryGenerated",),
    ("isMultiCountry",), ("region",), ("regionKey",),
    ("gatewayAirport",), ("gatewayAirportCode",), ("coordinates",),
    ("tripType",), ("tripTypeId",), ("durationDays",),
    ("bestPeriod", "monthNames"), ("bestPeriod", "raw"),
    ("budgetTierRange",), ("budget", "currency"), ("budget", "perDayEur"),
    ("profile", "fitnessLevel"),
    ("typeSpecific", "raw"), ("snapshot",),
    ("verifyFlagCount",), ("volatilePricing",), ("wordCount",),
    ("dataVintage",), ("provenance",), ("figures",),
]

# T146 (spec K3): the numeric fields that carry a confidence. A figure is a
# whole number-bearing field, not each bound of a pair: a budget row, a
# {low, high} range, the surface split and a plain number each get one row in
# record["figures"]. Left out on purpose, because they are identifiers,
# counters or ratings and not claims about the world: day, rank, sleepRef,
# durationDays, tripTypeId, profile.difficulty, bestPeriod months, the tier
# range, wordCount, dataVintage and verifyFlagCount.
FIGURE_PATTERNS = [
    "budget.breakdown.accommodation", "budget.breakdown.food",
    "budget.breakdown.transport", "budget.breakdown.activities",
    "budget.totalEur", "budget.perDayEur", "eurRate", "gateways[].transferMin",
    "itinerary[].dayStats.distanceKm", "itinerary[].dayStats.ascentM",
    "itinerary[].dayStats.descentM", "itinerary[].dayStats.timeMin",
    "itinerary[].dayStats.spendEur", "accommodationStrategy[].priceEur",
    "typeSpecific.surfaceMix", "typeSpecific.distanceKm",
    "typeSpecific.elevationM", "typeSpecific.verticalM",
]
# The pipeline computes these from other figures, so they are never "sourced".
COMPUTED_FIGURES = ("budget.totalEur", "budget.perDayEur")
# The only figures that may be "estimated", from general knowledge: a food
# budget and a riding time are fair estimates; a hotel price, a ticket price,
# an exchange rate or a measured distance are not.
ESTIMATE_OK = ("budget.breakdown.food", "itinerary[].dayStats.timeMin")
CONFIDENCE = ("sourced", "derived", "estimated")

# What Gemini's responseSchema (an OpenAPI 3.0 subset, the dialect the
# plan-day and parse-booking Edge Functions already use) is given. Anything
# else in the JSON Schema (patterns, lengths, uniqueness, "not") is enforced
# here after the answer arrives; a length limit is also written into the
# field's description so the model sees it.
GEMINI_KEEP = {"description", "enum", "minItems", "maxItems", "minimum", "maximum"}

_TYPES = {"string": "STRING", "integer": "INTEGER", "number": "NUMBER",
          "boolean": "BOOLEAN", "object": "OBJECT", "array": "ARRAY"}


# ── loading ──────────────────────────────────────────────────────────────────

def load_schema(path=SCHEMA_PATH):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


_VALIDATOR = None


def _validator():
    global _VALIDATOR
    if Draft202012Validator is None:
        raise SystemExit("jsonschema is not installed (pinned in constraints.txt); "
                         "the gate fails closed and admits nothing")
    if _VALIDATOR is None:
        schema = load_schema()
        Draft202012Validator.check_schema(schema)
        _VALIDATOR = Draft202012Validator(schema)
    return _VALIDATOR


# ── the three checks ─────────────────────────────────────────────────────────

def _path(parts):
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out or "<record>"


def schema_errors(rec):
    """JSON Schema violations as 'schema: path: message' strings, sorted by path."""
    from jsonschema.exceptions import best_match
    errs = []
    for e in _validator().iter_errors(rec):
        msg = e.message
        if e.validator == "anyOf" and e.context:
            # "not valid under any of the given schemas" says nothing; the
            # branch that came closest says what is wrong (a string where an
            # integer belongs, a euro range in a note).
            inner = best_match(e.context)
            msg = f"{inner.validator}: {inner.message}"
        if len(msg) > 160:
            msg = msg[:157] + "..."
        errs.append(f"schema/{e.validator}: {_path(e.absolute_path)}: {msg}")
    return sorted(set(errs))


def _pairs(x, path=()):
    """Every {low, high} and {lowEur, highEur} pair in the record."""
    if isinstance(x, dict):
        for lo, hi in (("low", "high"), ("lowEur", "highEur")):
            if lo in x and hi in x:
                yield path, x[lo], x[hi]
        for k, v in x.items():
            yield from _pairs(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _pairs(v, path + (i,))


def figure_pattern(path):
    """itinerary[2].dayStats.timeMin -> itinerary[].dayStats.timeMin"""
    return re.sub(r"\[\d+\]", "[]", path)


def figure_paths(rec):
    """Every concrete dotted path of a FIGURE_PATTERNS entry that holds a
    value in this record. A pair with both bounds null is not a figure."""
    out = []

    def has_value(v):
        if v is None:
            return False
        if isinstance(v, dict):
            return any(x is not None for x in v.values())
        if isinstance(v, list):
            return bool(v)
        return True

    def walk(node, parts, i, path):
        if i == len(parts):
            if has_value(node):
                out.append(_path(path))
            return
        p = parts[i]
        if p == "[]":
            for j, item in enumerate(node or []):
                walk(item, parts, i + 1, path + (j,))
        elif isinstance(node, dict) and p in node:
            walk(node[p], parts, i + 1, path + (p,))

    for pat in FIGURE_PATTERNS:
        parts = [x for seg in pat.split(".") for x in ([seg[:-2], "[]"] if seg.endswith("[]") else [seg])]
        walk(rec, parts, 0, ())
    return out


def figure_errors(rec):
    """The K3 rules: every figure has exactly one confidence row, a sourced
    one names its page, nothing is estimated that may not be, and a total
    built on an estimate is itself an estimate."""
    out = []
    rows = rec.get("figures") or []
    by_path = {}
    for r in rows:
        if r["path"] in by_path:
            out.append(f"figure-duplicate: figures: {r['path']} is listed twice")
        by_path[r["path"]] = r
    want = set(figure_paths(rec))
    for path in sorted(want - set(by_path)):
        out.append(f"figure-unlabelled: {path}: holds a value and has no confidence row")
    for path in sorted(set(by_path) - want):
        out.append(f"figure-orphan: {path}: a confidence row for a figure the record does not hold")
    for path, r in by_path.items():
        pat = figure_pattern(path)
        conf = r["confidence"]
        if conf == "sourced" and not r["sourceUrl"]:
            out.append(f"figure-no-url: {path}: sourced needs the page it came from")
        if conf != "sourced" and r["sourceUrl"]:
            out.append(f"figure-url-on-unsourced: {path}: only a sourced figure names a page")
        if conf == "estimated" and pat not in ESTIMATE_OK and pat not in COMPUTED_FIGURES:
            out.append(f"figure-estimate-barred: {path}: an estimate is not allowed for this figure")
        if conf == "sourced" and pat in COMPUTED_FIGURES:
            out.append(f"figure-computed-sourced: {path}: a computed figure is derived or estimated")
    rows_conf = [by_path.get(f"budget.breakdown.{k}", {}).get("confidence")
                 for k in ("accommodation", "food", "transport", "activities")]
    total = by_path.get("budget.totalEur")
    if total and total["confidence"] != ("estimated" if "estimated" in rows_conf else "derived"):
        out.append("figure-total-confidence: budget.totalEur: a total is derived from sourced rows "
                   "and estimated when any row is")
    return out


def semantic_errors(rec):
    """The cross-field rules. Runs only on a record the schema accepted, so
    every key is present and typed."""
    out = []

    def bad(code, where, msg):
        out.append(f"{code}: {where}: {msg}")

    tid, cc, slug = rec["id"], rec["countryCode"], rec["tripTypeSlug"]
    if rec["slug"] != tid:
        bad("slug-not-id", "slug", f"{rec['slug']!r} differs from id {tid!r}")
    if not tid.startswith(f"{cc.lower()}-{slug}-"):
        bad("id-prefix", "id", f"{tid!r} does not start with {cc.lower()}-{slug}-")
    canon = next(((i, n) for i, n, s in C.TRIP_TYPES if s == slug), None)
    if canon != (rec["tripTypeId"], rec["tripType"]):
        bad("trip-type-pair", "tripTypeId", f"{rec['tripTypeId']}/{rec['tripType']!r} is not "
            f"the canonical pair for {slug!r}")
    if rec["countries"][0]["code"] != cc:
        bad("primary-country", "countries[0]", "the first country is not countryCode")
    if rec["isMultiCountry"] != (len(rec["countries"]) > 1):
        bad("multi-country-flag", "isMultiCountry", "does not match countries[]")
    if C.COUNTRY_REGION.get(cc) != rec["regionKey"]:
        bad("region-key", "regionKey", f"{cc} belongs to {C.COUNTRY_REGION.get(cc)!r}")
    if C.REGIONS.get(rec["regionKey"]) != rec["region"]:
        bad("region-pair", "region", "region and regionKey disagree")

    for path, lo, hi in _pairs(rec):
        if isinstance(lo, (int, float)) and isinstance(hi, (int, float)) and lo > hi:
            bad("inverted-range", _path(path), f"low {lo} is above high {hi}")

    tier = C.TIER_ORDER[rec["budgetTier"]]
    r = rec["budgetTierRange"]
    if r[0] != tier or r[1] < r[0]:
        bad("tier-range", "budgetTierRange", f"{r} does not start at {rec['budgetTier']}")
    raw_ranks = [C.TIER_ORDER[t] for t in re.findall(r"€+", rec["budgetTierRaw"])]
    if [min(raw_ranks), max(raw_ranks)] != r:
        bad("tier-raw", "budgetTierRaw", f"{rec['budgetTierRaw']!r} disagrees with {r}")

    p = rec["profile"]
    if C.FITNESS_LEVELS[p["difficulty"] - 1] != p["difficultyLabel"]:
        bad("difficulty-label", "profile.difficultyLabel",
            f"{p['difficultyLabel']!r} is not the label of {p['difficulty']}/5")
    if p["fitnessLevel"] != p["difficultyLabel"]:
        bad("fitness-label", "profile.fitnessLevel", "differs from difficultyLabel")
    note = (p["difficultyNote"] or "").strip()
    if re.match(r"^\d\s*/\s*5\b", note):
        bad("difficulty-note-score", "profile.difficultyNote",
            "opens by repeating the score the meter already shows")

    bp = rec["bestPeriod"]
    if bp["monthNames"] != C.month_names(bp["months"]):
        bad("month-names", "bestPeriod.monthNames", "do not match months")
    if set(bp["avoidMonths"]) & set(bp["months"]):
        bad("avoid-overlap", "bestPeriod.avoidMonths",
            f"{sorted(set(bp['avoidMonths']) & set(bp['months']))} are both best and avoid")
    if bp["avoidMonths"] and not bp["avoid"]:
        bad("avoid-unexplained", "bestPeriod.avoid", "avoidMonths without the sentence why")

    if (rec["currency"] == "EUR") != (rec["eurRate"] is None):
        bad("eur-rate", "eurRate", "is null exactly when the currency is EUR")

    gws = rec["gateways"]
    want_code = gws[0]["code"] if gws else None
    want_name = f"{gws[0]['name']} ({gws[0]['code']})" if gws else None
    if rec["gatewayAirportCode"] != want_code or rec["gatewayAirport"] != want_name:
        bad("gateway-mirror", "gatewayAirport", "is not derived from gateways[0]")
    if len({g["code"] for g in gws}) != len(gws):
        bad("gateway-duplicate", "gateways", "an airport is listed twice")
    for i, g in enumerate(gws):
        if (g["transferMin"] is None) != (g["transferTo"] is None):
            bad("gateway-transfer", f"gateways[{i}]", "transferMin and transferTo come together")

    days = rec["itinerary"]
    if [d["day"] for d in days] != list(range(1, 8)):
        bad("day-order", "itinerary", f"days are {[d['day'] for d in days]}, not 1 to 7")
    stays = rec["accommodationStrategy"]
    ranks = [s["rank"] for s in stays]
    if ranks != list(range(1, len(stays) + 1)):
        bad("stay-ranks", "accommodationStrategy", f"ranks {ranks} are not 1..{len(stays)}")
    refs = set()
    for i, d in enumerate(days):
        if d["day"] < 7 and not d["sleep"]:
            bad("sleep-missing", f"itinerary[{i}].sleep", "every night but the last names its bed")
        if d["sleepRef"] is not None:
            refs.add(d["sleepRef"])
            if d["sleepRef"] not in ranks:
                bad("sleep-ref-unknown", f"itinerary[{i}].sleepRef",
                    f"rank {d['sleepRef']} is not in accommodationStrategy")
            if not d["sleep"]:
                bad("sleep-ref-without-text", f"itinerary[{i}].sleep",
                    "a referenced night still needs its sleep line on the page")
    for i, s in enumerate(stays):
        alt = s["alternativeTo"]
        if alt is None:
            if s["rank"] not in refs:
                bad("stay-not-slept", f"accommodationStrategy[{i}]",
                    f"{s['name']!r} is never slept in and is not declared an alternative")
        elif alt == s["rank"] or alt not in refs:
            bad("alternative-unknown", f"accommodationStrategy[{i}].alternativeTo",
                f"{alt} is not a slept-in entry this one could replace")
        if (s["priceEur"] is None) != (s["priceUnit"] is None):
            bad("price-unit", f"accommodationStrategy[{i}]", "priceEur and priceUnit come together")

    mix = rec["typeSpecific"]["surfaceMix"]
    if mix:
        total = sum(m["pct"] for m in mix)
        if abs(total - 100) > 2:
            bad("surface-mix-sum", "typeSpecific.surfaceMix", f"adds to {total}, not 100")

    if rec["verifyFlagCount"] != len(rec["verifyFlags"]):
        bad("verify-count", "verifyFlagCount", "differs from len(verifyFlags)")
    if rec["verifyFlags"] and not rec["volatilePricing"]:
        bad("volatile-flag", "volatilePricing", "a record with verify flags is volatile")
    out += figure_errors(rec)
    return out


def k5_errors(rec):
    """validate.py's mechanical checks (spec K5) on this one record. Imported
    late: validate.py is the catalogue's validator and this gate reuses it
    rather than keeping a second copy of the budget and range rules."""
    import validate as V
    issues = V.validate({"trips": [rec]}, wire=None, verify_urls=False, places=None)
    return sorted(f"k5/{i.code}: {i.detail}" for i in issues
                  if i.level == "ERROR" and i.trip == rec.get("id"))


# Word caps from carta-trips-enhancement-spec.md D4 (T152). One home: the
# generator's prompt fills its {{summaryWords}}, {{dayWords}} and {{tipWords}}
# from these, pipeline/validate.py checks the catalogue against them, and
# check() below rejects a generated record over them.
SUMMARY_WORDS, DAY_WORDS, TIP_WORDS = 120, 45, 35


def word_cap_errors(rec):
    """summary at most SUMMARY_WORDS words, each day's morning, afternoon and
    evening at most DAY_WORDS, each pro tip at most TIP_WORDS. Words are
    whitespace-separated, the count _words() uses for wordCount. Works on a
    full record or on pass two's fragment."""
    out = []
    n = len((rec.get("summary") or "").split())
    if n > SUMMARY_WORDS:
        out.append(f"word-cap: summary: {n} words, cap {SUMMARY_WORDS}")
    for i, d in enumerate(rec.get("itinerary") or []):
        for block in ("morning", "afternoon", "evening"):
            n = len((d.get(block) or "").split())
            if n > DAY_WORDS:
                out.append(f"word-cap: itinerary[{i}].{block}: {n} words, cap {DAY_WORDS}")
    for i, tip in enumerate(rec.get("proTips") or []):
        n = len((tip or "").split())
        if n > TIP_WORDS:
            out.append(f"word-cap: proTips[{i}]: {n} words, cap {TIP_WORDS}")
    return out


def check(rec):
    """Every reason this record may not be written. Empty means admit."""
    if not isinstance(rec, dict):
        return ["not-an-object: <record>: the answer is not a JSON object"]
    errs = schema_errors(rec)
    if errs:
        return errs        # the cross-field rules assume the shape
    errs = semantic_errors(rec)
    return errs + word_cap_errors(rec) + k5_errors(rec)


# ── admission: write on pass, quarantine on fail ─────────────────────────────

def _write_atomic(path, text):
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


def admit(raw, dest_dir, reject_dir, name=None):
    """raw: the model's answer as text (or an already parsed object).
    Returns (ok, errors, path written). Nothing reaches dest_dir unless every
    check passed; a failure is kept verbatim in reject_dir with its errors."""
    text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
    try:
        rec = json.loads(text)
    except ValueError as e:
        rec, errs = None, [f"not-json: <record>: {e}"]
    else:
        errs = check(rec)
    rid = rec.get("id") if isinstance(rec, dict) and isinstance(rec.get("id"), str) else None
    safe = re.sub(r"[^a-z0-9-]", "-", (rid or name or "unnamed").lower())[:93]
    if not errs:
        os.makedirs(dest_dir, exist_ok=True)
        path = os.path.join(dest_dir, f"{safe}.json")
        _write_atomic(path, json.dumps(rec, ensure_ascii=False, indent=1) + "\n")
        return True, [], path
    os.makedirs(reject_dir, exist_ok=True)
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = os.path.join(reject_dir, f"{stamp}-{safe}.json")
    _write_atomic(path, text)
    _write_atomic(path[:-5] + ".errors.txt", "\n".join(errs) + "\n")
    return False, errs, path


# ── what the model is asked for ──────────────────────────────────────────────

def _resolve(node, defs):
    """Inline every $ref, merging the referring node's own keywords on top."""
    if isinstance(node, list):
        return [_resolve(v, defs) for v in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        target = copy.deepcopy(defs[node["$ref"].rsplit("/", 1)[-1]])
        extra = {k: v for k, v in node.items() if k != "$ref"}
        merged = _resolve(target, defs)
        if "anyOf" in merged and extra:
            merged["anyOf"] = [_resolve({**b, **extra}, defs) if b.get("type") != "null" else b
                               for b in merged["anyOf"]]
            return merged
        merged.update(_resolve(extra, defs))
        return merged
    return {k: _resolve(v, defs) for k, v in node.items()}


def _drop(schema, path):
    node = schema
    for key in path[:-1]:
        node = node["properties"][key]
    node.get("properties", {}).pop(path[-1], None)
    if "required" in node:
        node["required"] = [k for k in node["required"] if k != path[-1]]


def _generic_descriptions():
    defs = load_schema()["$defs"]
    return {defs[k].get("description") for k in ("text", "qualifier")}


def _to_gemini(node):
    nullable = False
    if "anyOf" in node:
        branches = [b for b in node["anyOf"] if b.get("type") != "null"]
        nullable = len(branches) < len(node["anyOf"])
        if len(branches) == 1:
            base = {k: v for k, v in node.items() if k != "anyOf"}
            node = {**branches[0], **{k: v for k, v in base.items() if k == "description"}}
        else:
            out = {"anyOf": [_to_gemini(b) for b in branches]}
            if nullable:
                out["nullable"] = True
            return out
    t = node.get("type")
    if isinstance(t, list):
        nullable = nullable or "null" in t
        t = next(x for x in t if x != "null")
    out = {}
    if "const" in node:
        node = {**node, "enum": [node["const"]]}
    if "enum" in node:
        vals = [v for v in node["enum"] if v is not None]
        nullable = nullable or len(vals) < len(node["enum"])
        t = t or ("string" if all(isinstance(v, str) for v in vals) else "integer")
        node = {**node, "enum": [str(v) for v in vals]}
    if t:
        out["type"] = _TYPES[t]
    for k in GEMINI_KEEP:
        if k in node:
            out[k] = node[k]
    if "exclusiveMinimum" in node and "minimum" not in out:
        out["minimum"] = node["exclusiveMinimum"]
    # The text and qualifier definitions carry one long description each,
    # which every prose field inherits; for the model that is the same
    # paragraph two hundred times. They become one short rule per field.
    if out.get("description") in _generic_descriptions():
        out.pop("description")
    limits = []
    if "maxLength" in node:
        limits.append(f"At most {node['maxLength']} characters.")
    if "pattern" in node and "\u2014" in node["pattern"]:
        limits.append("No dash characters; write 'to' between two numbers.")
    if "not" in node:
        limits.append("No euro figures here; the number has its own field.")
    if limits:
        out["description"] = " ".join(filter(None, [out.get("description"), *limits]))
    if t == "object" and "properties" in node:
        out["properties"] = {k: _to_gemini(v) for k, v in node["properties"].items()}
        out["required"] = [k for k in node.get("required", []) if k in out["properties"]]
        out["propertyOrdering"] = list(node["properties"])
    if t == "array" and "items" in node:
        out["items"] = _to_gemini(node["items"])
    if nullable:
        out["nullable"] = True
    return out


def model_schema():
    """The JSON Schema of what the model fills: the record minus DERIVED."""
    schema = load_schema()
    full = _resolve({k: v for k, v in schema.items() if k != "$defs"}, schema["$defs"])
    for path in DERIVED:
        _drop(full, path)
    for k in ("$schema", "$id"):
        full.pop(k, None)
    return full


def gemini_response_schema():
    """generationConfig.responseSchema for a Gemini generateContent call."""
    return _to_gemini(model_schema())


def _words(x):
    if isinstance(x, str):
        return len(x.split())
    if isinstance(x, list):
        return sum(_words(v) for v in x)
    if isinstance(x, dict):
        return sum(_words(v) for v in x.values())
    return 0


def derive(fields, *, batch, model, prompt_version, today=None):
    """The model's answer plus every DERIVED field, as a full v2.1 record.
    Pure arithmetic and lookups: nothing here guesses."""
    rec = copy.deepcopy(fields)
    today = today or _dt.date.today().isoformat()
    slug = rec.get("tripTypeSlug")
    tid, tname = next(((i, n) for i, n, s in C.TRIP_TYPES if s == slug), (None, None))
    cc = rec.get("countryCode")
    total = (rec.get("budget") or {}).get("totalEur") or {}
    gws = rec.get("gateways") or []
    flags = rec.get("verifyFlags") or []
    rec.update({
        "schemaVersion": SCHEMA_VERSION, "sourceId": None, "slug": rec.get("id"),
        "summaryGenerated": False,
        "isMultiCountry": len(rec.get("countries") or []) > 1,
        "regionKey": C.COUNTRY_REGION.get(cc), "region": C.REGIONS.get(C.COUNTRY_REGION.get(cc)),
        "gatewayAirport": f"{gws[0]['name']} ({gws[0]['code']})" if gws else None,
        "gatewayAirportCode": gws[0]["code"] if gws else None,
        "coordinates": None, "tripType": tname, "tripTypeId": tid, "durationDays": 7,
        "snapshot": {}, "verifyFlagCount": len(flags), "volatilePricing": bool(flags),
        "dataVintage": int(today[:4]),
        "provenance": {"batch": batch, "sourceFile": None, "sourceFormat": "generated",
                       "sourceId": None, "ingestedAt": today, "synthesized": True,
                       "model": model, "promptVersion": prompt_version, "reviewedAt": None},
    })
    ranks = [C.TIER_ORDER[t] for t in re.findall(r"€+", rec.get("budgetTierRaw") or "")
             if t in C.TIER_ORDER]
    rec["budgetTierRange"] = [min(ranks), max(ranks)] if ranks else None
    bp = rec.setdefault("bestPeriod", {})
    bp["monthNames"] = C.month_names(bp.get("months") or [])
    bp["raw"] = None
    b = rec.setdefault("budget", {})
    b["currency"] = "EUR"
    if total.get("low") is not None and total.get("high") is not None:
        b["perDayEur"] = {"low": round(total["low"] / 7), "high": round(total["high"] / 7)}
    prof = rec.setdefault("profile", {})
    prof["fitnessLevel"] = prof.get("difficultyLabel")
    rec.setdefault("typeSpecific", {})["raw"] = {}
    rec["wordCount"] = 0
    rec["wordCount"] = _words({k: v for k, v in rec.items()
                               if k in ("summary", "hook", "itinerary", "accommodationStrategy",
                                        "logistics", "proTips", "packingNotes",
                                        "whatCouldGoWrong")})
    order = list(load_schema()["required"])
    return {k: rec[k] for k in order if k in rec} | {k: v for k, v in rec.items() if k not in order}


# ── survey: how far the published catalogue is from the contract ─────────────

def survey(master_path):
    with open(master_path, encoding="utf-8") as fh:
        trips = json.load(fh)["trips"]
    by_field, passed = {}, 0
    for t in trips:
        errs = schema_errors(t)
        if not errs:
            passed += 1
        seen = set()
        for e in errs:
            where = e.split(": ", 2)[1]
            key = re.split(r"[.\[]", where)[0]
            if key not in seen:
                seen.add(key)
                by_field[key] = by_field.get(key, 0) + 1
    print(f"{passed}/{len(trips)} published v2.0 records meet the v2.1 generation contract")
    for key, n in sorted(by_field.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d} trips fail at {key}")
    return passed, by_field


# ── self-test: every class of malformed answer is rejected ───────────────────

def _fig(rec, path, **change):
    for f in rec["figures"]:
        if f["path"] == path:
            f.update(change)


def _mutations():
    """(label, expected code prefix, function that breaks a good record)."""
    def setp(path, value):
        def f(r):
            node = r
            for k in path[:-1]:
                node = node[k]
            node[path[-1]] = value
        return f

    def delp(path):
        def f(r):
            node = r
            for k in path[:-1]:
                node = node[k]
            del node[path[-1]]
        return f

    return [
        ("summary over the word cap", "word-cap: summary",
         setp(["summary"], "word " * (SUMMARY_WORDS + 1))),
        ("day block over the word cap", "word-cap: itinerary[1].evening",
         setp(["itinerary", 1, "evening"], "word " * (DAY_WORDS + 1))),
        ("pro tip over the word cap", "word-cap: proTips[0]",
         setp(["proTips", 0], "word " * (TIP_WORDS + 1))),
        ("ascent as a string", "schema/", setp(["itinerary", 3, "dayStats", "ascentM"], "160")),
        ("ascent as a float", "schema/", setp(["itinerary", 3, "dayStats", "ascentM"], 160.5)),
        ("food low as text", "schema/", setp(["budget", "breakdown", "food", "lowEur"], "250")),
        ("dayStats as prose", "schema/", setp(["itinerary", 0, "dayStats"], "52 km, +160 m")),
        ("packing note as prose", "schema/", setp(["packingNotes", 0], "Two pairs of padded shorts.")),
        ("packing note without its reason", "schema/", delp(["packingNotes", 0, "whyThisTrip"])),
        ("unknown packing icon", "schema/", setp(["packingNotes", 0, "icon"], "unicorn")),
        ("risk as prose", "schema/", setp(["whatCouldGoWrong", 0], "High water closes the ferries.")),
        ("an extra key", "schema/", setp(["description"], "A lovely week by the river.")),
        ("a missing section", "schema/", delp(["accommodationStrategy"])),
        ("six days", "schema/", lambda r: r["itinerary"].pop()),
        ("an em dash in a title", "schema/", setp(["title"], "Passau \u2014 Vienna by bike")),
        ("a euro range in a price note", "schema/",
         setp(["accommodationStrategy", 0, "priceNote"], "€95 to €150 per night for two")),
        ("a euro range in a budget note", "schema/",
         setp(["budget", "breakdown", "food", "note"], "€15-25 a day")),
        ("a gateway as one string", "schema/", setp(["gateways"], "Vienna (VIE), 3 h 30 to Passau")),
        ("written by another model", "schema/", setp(["provenance", "model"], "claude-opus")),
        ("inverted total", "inverted-range", setp(["budget", "totalEur", "low"], 2000)),
        ("night pointing at no stay", "sleep-ref-unknown", lambda r: r["accommodationStrategy"].pop()),
        ("a stay nobody sleeps in", "stay-not-slept",
         lambda r: [d.__setitem__("sleepRef", None) for d in r["itinerary"] if d["sleepRef"] == 3]),
        ("an undeclared night", "sleep-missing", setp(["itinerary", 2, "sleep"], None)),
        ("wrong trip type id", "trip-type-pair", setp(["tripTypeId"], 6)),
        ("id from another country", "id-prefix", setp(["id"], "de-cycling-donauradweg-wachau")),
        ("best and avoid overlap", "avoid-overlap", setp(["bestPeriod", "avoidMonths"], [5])),
        ("surface mix not 100", "surface-mix-sum",
         setp(["typeSpecific", "surfaceMix"], [{"surface": "asphalt", "pct": 60},
                                                {"surface": "gravel", "pct": 30}])),
        ("breakdown off the total", "k5/budget-sum-mismatch",
         setp(["budget", "breakdown", "food", "highEur"], 900)),
        ("a figure with no confidence row", "figure-unlabelled",
         lambda r: r["figures"].pop(next(i for i, f in enumerate(r["figures"])
                                         if f["path"] == "budget.breakdown.food"))),
        ("a confidence row for a null figure", "figure-orphan",
         setp(["itinerary", 1, "dayStats", "spendEur"], None) if False else
         lambda r: r["figures"].append({"path": "itinerary[1].dayStats.spendEur", "confidence": "sourced",
                                        "sourceUrl": "https://example.org/x", "checkedAt": "2026-10-03"})),
        ("a sourced figure with no page", "figure-no-url", lambda r: _fig(r, "budget.breakdown.food", sourceUrl=None)),
        ("an estimated hotel price", "figure-estimate-barred",
         lambda r: _fig(r, "accommodationStrategy[0].priceEur", confidence="estimated", sourceUrl=None)),
        ("a derived total over an estimated row", "figure-total-confidence",
         lambda r: _fig(r, "budget.breakdown.food", confidence="estimated", sourceUrl=None)),
    ]


def self_test():
    import shutil
    import tempfile
    with open(EXAMPLE_PATH, encoding="utf-8") as fh:
        good = json.load(fh)
    fails = []
    errs = check(good)
    if errs:
        fails.append(f"the example record is rejected: {errs[:3]}")
    for label, want, mutate in _mutations():
        bad = copy.deepcopy(good)
        mutate(bad)
        got = check(bad)
        if not any(e.startswith(want) for e in got):
            fails.append(f"{label}: expected {want}, got {got[:2] or 'admitted'}")

    tmp = tempfile.mkdtemp(prefix="t143-gate-")
    try:
        dest, rej = os.path.join(tmp, "trips"), os.path.join(tmp, "rejected")
        ok, _, _ = admit(json.dumps(good, ensure_ascii=False), dest, rej)
        broken = copy.deepcopy(good)
        broken["itinerary"][3]["dayStats"]["ascentM"] = "160"
        ok2, _, p2 = admit(json.dumps(broken), dest, rej)
        ok3, e3, _ = admit('{"id": "at-cycling-x", "title": "cut off mid', dest, rej, name="cut")
        written = sorted(os.listdir(dest)) if os.path.isdir(dest) else []
        if not ok or written != [f"{good['id']}.json"]:
            fails.append(f"admit wrote {written} for one good and two bad answers")
        if ok2 or not os.path.exists(p2[:-5] + ".errors.txt"):
            fails.append("a schema failure was not quarantined with its errors")
        if ok3 or not e3[0].startswith("not-json"):
            fails.append("a truncated answer was not rejected as not-json")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    gem = json.dumps(gemini_response_schema())
    for word in ('"$ref"', '"const"', '"not"', '"additionalProperties"', '"pattern"', '"null"'):
        if word in gem:
            fails.append(f"the Gemini schema still carries {word}")
    for path in DERIVED:
        node = model_schema()
        for k in path[:-1]:
            node = node["properties"][k]
        if path[-1] in node.get("properties", {}):
            fails.append(f"derived field {'.'.join(path)} is still asked of the model")
    # figures is DERIVED (the model is never asked) but derive() does not
    # compute it: the generator writes it from the evidence rows (T146).
    rebuilt = derive({k: v for k, v in good.items() if (k,) not in DERIVED or k == "figures"},
                     batch=good["provenance"]["batch"], model=good["provenance"]["model"],
                     prompt_version=good["provenance"]["promptVersion"],
                     today=good["provenance"]["ingestedAt"])
    if check(rebuilt):
        fails.append(f"derive() output is rejected: {check(rebuilt)[:3]}")

    n = len(_mutations())
    for f in fails:
        print(f"SELF-TEST FAIL: {f}")
    if not fails:
        print(f"SELF-TEST OK: example admitted, {n} malformed answers rejected, "
              "admit quarantines, Gemini schema clean, derive() round-trips")
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("files", nargs="+")
    a = sub.add_parser("admit")
    a.add_argument("files", nargs="+")
    a.add_argument("--dest", required=True)
    a.add_argument("--rejects", required=True)
    g = sub.add_parser("gemini-schema")
    g.add_argument("--out")
    s = sub.add_parser("survey")
    s.add_argument("--data", default=os.path.join(ROOT, "data", "trips.master.json"))
    sub.add_parser("self-test")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "self-test":
        return self_test()
    if args.cmd == "survey":
        survey(args.data)
        return 0
    if args.cmd == "gemini-schema":
        text = json.dumps(gemini_response_schema(), ensure_ascii=False, indent=1)
        if args.out:
            _write_atomic(args.out, text + "\n")
        else:
            print(text)
        return 0
    failed = 0
    for path in args.files:
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        if args.cmd == "check":
            try:
                errs = check(json.loads(raw))
            except ValueError as e:
                errs = [f"not-json: <record>: {e}"]
        else:
            _, errs, written = admit(raw, args.dest, args.rejects,
                                     name=os.path.splitext(os.path.basename(path))[0])
            print(f"{'ADMIT ' if not errs else 'REJECT'} {path} -> {written}")
        if errs:
            failed += 1
            print(f"REJECT {path}: {len(errs)} error(s)")
            for e in errs[:25]:
                print(f"  {e}")
        elif args.cmd == "check":
            print(f"OK     {path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
