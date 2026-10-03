#!/usr/bin/env python3
"""Backfill packingNotes and whatCouldGoWrong on the catalogue (T150, spec K10 and D1).

    python pipeline/backfill_modules.py status [--trips DIR] [--backfill DIR]
    python pipeline/backfill_modules.py queue  [--trips DIR] [--backfill DIR]
    python pipeline/backfill_modules.py prompt ID [--trips DIR]
    python pipeline/backfill_modules.py run [--trips DIR] [--out DIR] [--only ID ...] [--limit N]
                                            [--model M] [--stub DIR] [--no-reuse] [--max-usd X]
    python pipeline/backfill_modules.py apply --dest DIR [--trips DIR] [--backfill DIR] [--write]
    python pipeline/backfill_modules.py cost [--out DIR]
    python pipeline/backfill_modules.py self-test                        no network

The two modules are the ones spec D1 says an LLM produces reliably and a human
writes slowly: {icon, item, whyThisTrip} and {severity, trigger, consequence,
whatToDo}. 153 of the 253 published trips have both as empty arrays and the
other 100 hold v2.0 prose (markdown bold, a "Fallback:" label, euro amounts
inside the sentences). This module writes the typed v2.1 shape for all 253.

It is a fill-mode pass, not a trip generator. The trip already exists; the
model is shown the finished record and asked for these two fields only, in one
ungrounded call (about 5k tokens in, 1k out), so the cost per trip is the
cheapest call in the pipeline. The shape comes from the T143 contract
(schema/trip.generated.schema.json, the packingNotes and whatCouldGoWrong
properties, read through generation_gate.model_schema), so a change to the
contract changes this module's schema with no edit here.

What is checked after the answer, never repaired (the gate's rule):

  shape       the contract: keys, enums, lengths, item counts, no dash characters
  numbers     no euro amount and no figure with a unit. A number in these
              modules would be a number nobody sourced; prices and distances
              are pass three's job (T144)
  specific    a reason that could sit on any trip is the defect spec A4 and C6
              describe. At least ANCHOR_SHARE of the reasons, and of the risks,
              must use a word from this trip's own record, after removing the
              words that a third of the catalogue also uses
  variety     at least MIN_ICONS different icon keys, "other" at most once, no
              item or trigger twice, at least two severities, and the icon
              keys the trip type cannot do without (TYPE_NEEDS)

A failing answer is sent back once with its errors; a second failure rejects
the trip into <out>/rejected/ with the raw text, and nothing is written for it.
An accepted answer is cached on the SHA-1 of its exact prompt so a rerun makes
no call. Every call goes to ledger.jsonl with tokens and USD, priced from the
generate_trip.PRICES table.

Output is one sidecar per trip, <out>/<id>.json: the two arrays plus a
provenance block. `apply` is the only step that touches trip files, it needs an
explicit --dest and does nothing without --write, and it replaces only those
two keys, keeping each file's bytes otherwise identical.

Runtime and pipeline AI is Gemini only (CLAUDE.md). The Claude API is never
called. generate_trip.GeminiClient is the one client.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402

ROOT = G.ROOT
TRIPS_DIR = os.path.join(ROOT, "data", "trips")
DEFAULT_OUT = os.path.join(ROOT, "data", "generated", "backfill")
PROMPT_FILE = "k10-packing-risk.md"
PROMPT_TAG = "k10"
LABEL = "backfill"

FIELDS = ("packingNotes", "whatCouldGoWrong")
ANCHOR_SHARE = 0.6        # share of reasons (and of risks) that must name something from the record
COMMON_SHARE = 1 / 3      # a word used by more than this share of trips is not an anchor
MIN_ICONS = 3
MIN_CORPUS = 30           # fewest trips a document frequency is trusted over
MIN_WORD = 5
# icon keys a trip type is not complete without; any one of the set is enough
TYPE_NEEDS = {
    "cycling": {"bike", "repair"},
    "trail-running": {"footwear"},
    "hiking": {"footwear"},
    "winter-sports": {"snow", "warmth"},
    "water-sports": {"swim", "sun"},
}
# words that say nothing about a place however often or rarely they appear
STOP = set("""about above after again against along also always another around because before behind below between
both bring carry could every first great where which while within without would their there these those through
under until using since should often other still thing things really maybe check keep take make bring pack
packing trip trips week days night nights each only into from with that this have will your""".split())


# ── the contract slice ───────────────────────────────────────────────────────

def module_schema():
    """JSON Schema of exactly the two modules, from the T143 contract."""
    full = G.model_schema()
    props = {k: copy.deepcopy(full["properties"][k]) for k in FIELDS}
    return {"type": "object", "additionalProperties": False, "required": list(FIELDS),
            "properties": props, "title": "Carta backfill: packing and risks"}


def module_gemini_schema():
    return G._to_gemini(module_schema())


def limits():
    p = module_schema()["properties"]
    return {"packMin": p["packingNotes"]["minItems"], "packMax": p["packingNotes"]["maxItems"],
            "riskMin": p["whatCouldGoWrong"]["minItems"], "riskMax": p["whatCouldGoWrong"]["maxItems"]}


def icon_keys():
    return list(G.load_schema()["$defs"]["packIcon"]["enum"])


# ── prompt ───────────────────────────────────────────────────────────────────

def load_prompt():
    with open(os.path.join(T.PROMPT_DIR, PROMPT_FILE), encoding="utf-8") as fh:
        text = fh.read()
    head, _, body = text.partition("\n\n")
    meta = {}
    for line in head.splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    meta["version"] = int(meta["version"])
    meta["temperature"] = float(meta.get("temperature", 0.3))
    return meta, body.strip() + "\n"


def prompt_version():
    return f"{PROMPT_TAG}-{load_prompt()[0]['version']}"


# what the model is shown: enough to be specific, nothing it could copy a price from
SHOWN_DAY = ("day", "title", "morning", "afternoon", "evening")


def _text(x):
    """Strip markdown bold and italics from v2.0 prose."""
    return re.sub(r"[*_]{1,3}", "", x) if isinstance(x, str) else x


def record_view(rec):
    stays = []
    for s in rec.get("accommodationStrategy") or []:
        stays.append({k: s.get(k) for k in ("name", "style", "location") if s.get(k)})
    view = {
        "title": rec.get("title"), "country": rec.get("country"), "region": rec.get("region"),
        "tripType": rec.get("tripType"), "tripTypeSlug": rec.get("tripTypeSlug"),
        "durationDays": rec.get("durationDays"),
        "bestMonths": (rec.get("bestPeriod") or {}).get("monthNames"),
        "bestPeriodNote": (rec.get("bestPeriod") or {}).get("note"),
        "avoid": (rec.get("bestPeriod") or {}).get("avoid"),
        "difficulty": (rec.get("profile") or {}).get("difficultyLabel"),
        "carRequired": (rec.get("profile") or {}).get("carRequired"),
        "summary": rec.get("summary"),
        "days": [{k: _text(d.get(k)) for k in SHOWN_DAY if k in d} for d in rec.get("itinerary") or []],
        "stays": stays,
        "tips": [_text(t) for t in rec.get("proTips") or []],
        "logistics": {k: _text(v) for k, v in (rec.get("logistics") or {}).items()
                      if isinstance(v, str) and v and k in ("weather", "transportRules", "permits", "health",
                                                          "gettingThere", "connectivity")},
        "tags": rec.get("tags"),
    }
    return json.loads(json.dumps(view, ensure_ascii=False))


def previous_block(rec):
    """The v2.0 notes, when there are any, as source material: facts to keep,
    not wording to copy. Prices are named as droppable."""
    old = {k: [_text(x) for x in rec.get(k) or [] if isinstance(x, str)] for k in FIELDS}
    if not any(old.values()):
        return ""
    return ("This trip already has older notes, written as plain sentences. Keep what is true and specific "
            "to this trip, put it into the fields, and drop any price or distance. Do not copy the wording.\n\n"
            + json.dumps(old, ensure_ascii=False, indent=1))


def build_prompt(rec):
    meta, body = load_prompt()
    lim = limits()
    return T.fill(body, {"record": record_view(rec), "previous": previous_block(rec),
                         "minIcons": str(MIN_ICONS), **{k: str(v) for k, v in lim.items()}})


# ── checks after the answer ──────────────────────────────────────────────────

def _words(s):
    return {w for w in re.findall(r"[a-zà-ÿ]+", (s or "").lower()) if len(w) >= MIN_WORD and w not in STOP}


def _context_text(rec):
    v = record_view(rec)
    parts = []

    def walk(x):
        if isinstance(x, str):
            parts.append(x)
        elif isinstance(x, list):
            for i in x:
                walk(i)
        elif isinstance(x, dict):
            for i in x.values():
                walk(i)
    walk(v)
    return " ".join(parts)


def document_frequency(recs):
    """word -> share of the given records whose own text uses it."""
    df, n = {}, 0
    for rec in recs:
        n += 1
        for w in _words(_context_text(rec)):
            df[w] = df.get(w, 0) + 1
    # a share over a handful of trips means nothing: every word would be "common"
    return {w: c / n for w, c in df.items()} if n >= MIN_CORPUS else {}


def anchor_words(rec, df=None):
    words = _words(_context_text(rec))
    if df:
        words = {w for w in words if df.get(w, 0) <= COMMON_SHARE}
    return words


def _share_anchored(texts, anchors):
    if not texts:
        return 1.0
    return sum(1 for t in texts if _words(t) & anchors) / len(texts)


def module_errors(fragment, rec, df=None):
    """Why this answer may not be written. Shape first, then the rules a schema
    cannot say."""
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import best_match
    if not isinstance(fragment, dict):
        return ["not-an-object: the answer is not a JSON object"]
    errs = []
    for e in Draft202012Validator(module_schema()).iter_errors(fragment):
        msg = e.message
        if e.validator in ("anyOf", "oneOf"):
            msg = best_match([e]).message
        where = ".".join(str(p) for p in e.absolute_path) or "(answer)"
        errs.append(f"shape {where}: {msg[:160]}")
    if errs:
        return errs[:20]
    pack, risks = fragment["packingNotes"], fragment["whatCouldGoWrong"]
    for label, rows in (("packingNotes", pack), ("whatCouldGoWrong", risks)):
        for i, row in enumerate(rows):
            for k, v in row.items():
                if T.EURO_RE.search(v) or T.UNIT_RE.search(v):
                    errs.append(f"figure {label}[{i}].{k}: a euro amount or a figure with a unit; "
                                "prices and distances are not asked here")
    icons = [r["icon"] for r in pack]
    if len(set(icons)) < MIN_ICONS:
        errs.append(f"variety packingNotes: {len(set(icons))} icon keys, at least {MIN_ICONS} wanted")
    if icons.count("other") > 1:
        errs.append("variety packingNotes: 'other' used more than once; pick the closest key")
    need = TYPE_NEEDS.get(rec.get("tripTypeSlug"))
    if need and not (need & set(icons)):
        errs.append(f"variety packingNotes: a {rec.get('tripTypeSlug')} trip needs one of {sorted(need)}")
    items = [re.sub(r"\W+", " ", r["item"].lower()).strip() for r in pack]
    for i, it in enumerate(items):
        if it in items[:i]:
            errs.append(f"duplicate packingNotes[{i}].item: '{pack[i]['item']}' appears twice")
    trig = [re.sub(r"\W+", " ", r["trigger"].lower()).strip() for r in risks]
    for i, it in enumerate(trig):
        if it in trig[:i]:
            errs.append(f"duplicate whatCouldGoWrong[{i}].trigger appears twice")
    if len({r["severity"] for r in risks}) < 2:
        errs.append("variety whatCouldGoWrong: every risk has the same severity; grade them")
    anchors = anchor_words(rec, df)
    s = _share_anchored([r["whyThisTrip"] for r in pack], anchors)
    if s < ANCHOR_SHARE:
        errs.append(f"generic packingNotes: only {s:.0%} of the reasons use a word from this trip's record, "
                    f"{ANCHOR_SHARE:.0%} wanted; name a place, surface, month or bed")
    s = _share_anchored([f"{r['trigger']} {r['consequence']} {r['whatToDo']}" for r in risks], anchors)
    if s < ANCHOR_SHARE:
        errs.append(f"generic whatCouldGoWrong: only {s:.0%} of the risks use a word from this trip's record, "
                    f"{ANCHOR_SHARE:.0%} wanted; tie each risk to a place, a day or a rule of this trip")
    return errs


# ── one trip ─────────────────────────────────────────────────────────────────

class Rejected(Exception):
    def __init__(self, errors, raw):
        super().__init__(f"rejected: {errors[:3]}")
        self.errors, self.raw = errors, raw


def _now():
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def backfill_one(rec, client, out_dir, *, df=None, reuse=True, today=None):
    """Returns the sidecar dict for the trip, writes it, or raises Rejected."""
    meta, _ = load_prompt()
    user = build_prompt(rec)
    # the schema is part of the question: a changed icon list or limit must not replay an old answer
    digest = hashlib.sha1((user + json.dumps(module_schema(), sort_keys=True)).encode("utf-8")).hexdigest()
    tid = rec["id"]
    cpath = os.path.join(out_dir, "passes", f"{tid}.json")
    ledger = os.path.join(out_dir, "ledger.jsonl")
    body, frag = None, None
    if reuse and os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as fh:
            cached = json.load(fh)
        if cached.get("promptSha1") == digest:
            body = cached["response"]
            frag, _ = T.parse_json(T.response_text(body))
    if body is None:
        prompt, raw, errs = user, "", []
        for attempt in (1, 2):
            body = client.generate(f"{LABEL}:{tid}", prompt, response_schema=module_gemini_schema(),
                                   grounding=False, temperature=meta["temperature"])
            usage = T.usage_of(body)
            T.ledger_append(ledger, {"at": today or _now(), "trip": tid, "pass": PROMPT_TAG, "attempt": attempt,
                                     "promptVersion": meta["version"], "usage": usage,
                                     "usd": T.price_usd(usage)})
            raw = T.response_text(body)
            frag, perr = T.parse_json(raw)
            errs = [perr] if perr else module_errors(frag, rec, df)
            if not errs:
                break
            prompt = (user + "\n\nYour previous answer failed these checks. Answer again, fixing every one:\n"
                      + "\n".join(f"- {e}" for e in errs[:30]) + "\n")
        else:
            rej = os.path.join(out_dir, "rejected")
            os.makedirs(rej, exist_ok=True)
            with open(os.path.join(rej, f"{tid}.raw.txt"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(raw)
            with open(os.path.join(rej, f"{tid}.errors.txt"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write("\n".join(errs) + "\n")
            raise Rejected(errs, raw)
        os.makedirs(os.path.dirname(cpath), exist_ok=True)
        G._write_atomic(cpath, json.dumps({"promptVersion": meta["version"], "promptSha1": digest,
                                           "response": body}, ensure_ascii=False, indent=1) + "\n")
    side = {"id": tid, "packingNotes": frag["packingNotes"], "whatCouldGoWrong": frag["whatCouldGoWrong"],
            "provenance": {"model": T.usage_of(body)["model"], "promptVersion": prompt_version(),
                           "generatedAt": today or _now(), "reviewedAt": None,
                           "hadOlderNotes": any(rec.get(k) for k in FIELDS)}}
    os.makedirs(out_dir, exist_ok=True)
    G._write_atomic(os.path.join(out_dir, f"{tid}.json"), json.dumps(side, ensure_ascii=False, indent=2) + "\n")
    return side


# ── reading and writing trips ────────────────────────────────────────────────

def load_trips(trips_dir):
    out = {}
    for name in sorted(os.listdir(trips_dir)):
        if name.endswith(".json"):
            with open(os.path.join(trips_dir, name), encoding="utf-8") as fh:
                rec = json.load(fh)
            out[rec["id"]] = rec
    return out


def is_typed(rec):
    """True when both modules already hold the v2.1 object shape."""
    return all(rec.get(k) and all(isinstance(x, dict) for x in rec[k]) for k in FIELDS)


def load_sidecars(folder):
    out = {}
    if os.path.isdir(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                with open(os.path.join(folder, name), encoding="utf-8") as fh:
                    d = json.load(fh)
                out[d["id"]] = d
    return out


def survey(trips, sidecars=None):
    """Counts the done condition is stated in. A trip is populated when each
    module is non-empty either in the trip file or in a sidecar; typed when
    the shape is the v2.1 object."""
    sidecars = sidecars or {}
    c = {"trips": len(trips), "emptyBoth": 0, "emptyPacking": 0, "emptyRisks": 0, "v20Prose": 0, "typed": 0,
         "sidecars": len(sidecars), "populatedWithSidecars": 0, "typedWithSidecars": 0}
    for tid, rec in trips.items():
        if not rec.get("packingNotes") and not rec.get("whatCouldGoWrong"):
            c["emptyBoth"] += 1
        c["emptyPacking"] += not rec.get("packingNotes")
        c["emptyRisks"] += not rec.get("whatCouldGoWrong")
        if (rec.get("packingNotes") or rec.get("whatCouldGoWrong")) and not is_typed(rec):
            c["v20Prose"] += 1
        c["typed"] += is_typed(rec)
        sc = sidecars.get(tid)
        have = {k: (sc or {}).get(k) or rec.get(k) for k in FIELDS}
        c["populatedWithSidecars"] += all(have.values())
        c["typedWithSidecars"] += bool(is_typed(rec) or sc)
    return c


def validate_sidecar(side, rec, df=None):
    """Re-check a stored sidecar against the current contract and record."""
    if side.get("id") != rec.get("id"):
        return ["id does not match the trip"]
    return module_errors({k: side.get(k) for k in FIELDS}, rec, df)


def apply_sidecars(trips_dir, backfill_dir, dest_dir, write=False):
    """Copy each trip file to dest with its two modules replaced by the sidecar's.
    Only those two keys change; a file's other bytes (CRLF, indent, key order,
    escaping) are kept. Returns (changed, skipped) lists. Nothing is written
    without write=True. dest must differ from the source folder unless the
    caller says so by passing the same path on purpose."""
    trips = load_trips(trips_dir)
    df = document_frequency(trips.values())
    changed, skipped = [], []
    for tid, side in load_sidecars(backfill_dir).items():
        rec = trips.get(tid)
        if rec is None:
            skipped.append((tid, "no such trip"))
            continue
        errs = validate_sidecar(side, rec, df)
        if errs:
            skipped.append((tid, errs[0]))
            continue
        changed.append(tid)
        if not write:
            continue
        src = os.path.join(trips_dir, f"{tid}.json")
        with open(src, encoding="utf-8", newline="") as fh:
            raw = fh.read()
        crlf = "\r\n" in raw
        obj = json.loads(raw)
        ascii_only = not any(ord(ch) > 127 for ch in raw)
        for k in FIELDS:
            obj[k] = side[k]
        text = json.dumps(obj, ensure_ascii=ascii_only, indent=2)
        if crlf:
            text = text.replace("\n", "\r\n")
        os.makedirs(dest_dir, exist_ok=True)
        with open(os.path.join(dest_dir, f"{tid}.json"), "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
    return changed, skipped


# ── fixtures and self-test ───────────────────────────────────────────────────

def fixture_modules():
    """A good answer for the T143 example record (Donauradweg week)."""
    return {
        "packingNotes": [
            {"icon": "bike", "item": "Two spare inner tubes", "whyThisTrip": "The Danube path has gravel stretches near Passau and a flat is likely over a week."},
            {"icon": "rain", "item": "Packable rain jacket", "whyThisTrip": "A cold front on the Danube turns the path to mud and nothing shelters you between villages."},
            {"icon": "sun", "item": "Sun cream and a cap", "whyThisTrip": "The river path has almost no shade between the Danube towns."},
            {"icon": "water", "item": "Two bottles", "whyThisTrip": "Some stretches of the Danube path run far from any village fountain."},
            {"icon": "navigation", "item": "Offline map of the path", "whyThisTrip": "Signs along the Danube thin out on the diversions around the larger towns."},
        ],
        "whatCouldGoWrong": [
            {"severity": "high", "trigger": "Heavy rain closes a stretch of the Danube path",
             "consequence": "The flood diversion adds a long day on a busy road with no verge.",
             "whatToDo": "Take the train between the two nearest Danube stations and resume the path the next morning."},
            {"severity": "medium", "trigger": "The ferry crossing is not running",
             "consequence": "You lose the bank you planned to ride and the bed on the other side.",
             "whatToDo": "Ask the hotel to check the Danube ferry the evening before and keep the bridge as the fallback."},
            {"severity": "low", "trigger": "A bike shop is shut on Sunday",
             "consequence": "A small repair waits until Monday and costs part of the morning.",
             "whatToDo": "Carry the repair kit and keep the Sunday stage short of the larger Danube towns."},
        ],
    }


def module_body(frag, model="gemini-fixture", usage=None):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(frag, ensure_ascii=False)}]}}],
            "usageMetadata": usage or {"promptTokenCount": 5000, "candidatesTokenCount": 900},
            "modelVersion": model}


def _fixture_record():
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        rec = json.load(fh)
    return rec


def _mutations(good):
    """Each: (name, mutate(fragment), substring the errors must contain)."""
    def m(fn):
        def run(f):
            f = copy.deepcopy(f)
            fn(f)
            return f
        return run
    return [
        ("euro amount in a risk", m(lambda f: f["whatCouldGoWrong"][0].update(consequence="A taxi back costs EUR 35 and a long wait for one.")), "figure"),
        ("figure with a unit", m(lambda f: f["packingNotes"][0].update(whyThisTrip="The Danube path has a 12 km gravel stretch near Passau where a flat is likely.")), "figure"),
        ("em dash", m(lambda f: f["packingNotes"][1].update(item="Rain jacket \u2014 packable")), "shape"),
        ("unknown icon key", m(lambda f: f["packingNotes"][2].update(icon="sunscreen")), "shape"),
        ("extra key", m(lambda f: f["packingNotes"][0].update(price=5)), "shape"),
        ("missing key", m(lambda f: f["whatCouldGoWrong"][1].pop("whatToDo")), "shape"),
        ("too few items", m(lambda f: f.update(packingNotes=f["packingNotes"][:2])), "shape"),
        ("too few risks", m(lambda f: f.update(whatCouldGoWrong=f["whatCouldGoWrong"][:1])), "shape"),
        ("bad severity", m(lambda f: f["whatCouldGoWrong"][0].update(severity="critical")), "shape"),
        ("one icon only", m(lambda f: [r.update(icon="bike") for r in f["packingNotes"]]), "variety"),
        ("two items named alike", m(lambda f: f["packingNotes"][3].update(item=f["packingNotes"][0]["item"])), "duplicate"),
        ("one severity", m(lambda f: [r.update(severity="medium") for r in f["whatCouldGoWrong"]]), "variety"),
        ("type need missing", m(lambda f: f["packingNotes"][0].update(icon="light")), "variety"),
        ("generic reasons", m(lambda f: [r.update(whyThisTrip="Handy to have with you whatever happens.") for r in f["packingNotes"]]), "generic packingNotes"),
        ("generic risks", m(lambda f: [r.update(trigger="Something goes wrong somewhere", consequence="Your plans may change for a while.", whatToDo="Stay calm and adapt your plans somehow.") for r in f["whatCouldGoWrong"]]), "generic whatCouldGoWrong"),
        ("not an object", lambda f: ["a list"], "not-an-object"),
    ]


def self_test():
    import tempfile
    fails = []
    rec = _fixture_record()
    good = fixture_modules()
    if module_errors(good, rec):
        fails.append(f"the fixture answer is rejected: {module_errors(good, rec)[:3]}")
    muts = _mutations(good)
    for name, fn, want in muts:
        errs = module_errors(fn(good), rec)
        if not errs:
            fails.append(f"mutation not rejected: {name}")
        elif not any(want in e for e in errs):
            fails.append(f"mutation '{name}' rejected for the wrong reason: {errs[:2]}")
    # schema keeps the contract's own limits and icon list
    lim = limits()
    if not (lim["packMin"] <= 5 <= lim["packMax"] and lim["riskMin"] <= 3 <= lim["riskMax"]):
        fails.append(f"fixture counts fall outside the contract limits {lim}")
    gs = json.dumps(module_gemini_schema())
    if '"$ref"' in gs or '"pattern"' in gs or "additionalProperties" in gs:
        fails.append("Gemini schema still carries keywords the API rejects")
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out")
        client = T.StubClient({f"{LABEL}:{rec['id']}": [module_body(good)]})
        side = backfill_one(rec, client, out, today="2026-10-03T00:00:00+00:00")
        if side["packingNotes"] != good["packingNotes"] or not os.path.exists(os.path.join(out, f"{rec['id']}.json")):
            fails.append("accepted answer was not written")
        before = len(client.calls)
        backfill_one(rec, client, out, today="2026-10-03T00:00:00+00:00")
        if len(client.calls) != before:
            fails.append("a rerun with an unchanged prompt made a call")
        # a bad answer then a good one: one retry, the errors are in the second prompt
        out2 = os.path.join(tmp, "out2")
        bad = _mutations(good)[0][1](good)
        client = T.StubClient({f"{LABEL}:{rec['id']}": [module_body(bad), module_body(good)]})
        backfill_one(rec, client, out2)
        if len(client.calls) != 2 or "failed these checks" not in client.calls[1][1]:
            fails.append("retry did not carry the errors")
        # two bad answers reject and write nothing
        out3 = os.path.join(tmp, "out3")
        client = T.StubClient({f"{LABEL}:{rec['id']}": [module_body(bad)]})
        try:
            backfill_one(rec, client, out3)
            fails.append("two bad answers were accepted")
        except Rejected:
            if os.path.exists(os.path.join(out3, f"{rec['id']}.json")) or not os.path.exists(
                    os.path.join(out3, "rejected", f"{rec['id']}.errors.txt")):
                fails.append("a rejected trip left a sidecar or no errors file")
    prompt = build_prompt(rec)
    if "{{" in prompt:
        fails.append("prompt placeholders left unfilled")
    for f in fails:
        print(f"SELF-TEST FAIL: {f}")
    if not fails:
        print(f"SELF-TEST OK: fixture accepted, {len(muts)} bad answers rejected, retry, reuse and reject paths hold")
    return 1 if fails else 0


# ── command line ─────────────────────────────────────────────────────────────

def _print_survey(c):
    print(f"trips                         {c['trips']}")
    print(f"both modules empty            {c['emptyBoth']}")
    print(f"packingNotes empty            {c['emptyPacking']}")
    print(f"whatCouldGoWrong empty        {c['emptyRisks']}")
    print(f"v2.0 prose (not typed)        {c['v20Prose']}")
    print(f"typed v2.1 in the trip file   {c['typed']}")
    print(f"sidecars written              {c['sidecars']}")
    print(f"populated with sidecars       {c['populatedWithSidecars']} of {c['trips']}")
    print(f"typed with sidecars           {c['typedWithSidecars']} of {c['trips']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("status", "queue", "prompt", "run", "apply", "cost"):
        p = sub.add_parser(name)
        p.add_argument("--trips", default=TRIPS_DIR)
        p.add_argument("--backfill", "--out", dest="out", default=DEFAULT_OUT)
        if name == "prompt":
            p.add_argument("id")
        if name == "run":
            p.add_argument("--only", nargs="*")
            p.add_argument("--limit", type=int)
            p.add_argument("--model", action="append")
            p.add_argument("--stub")
            p.add_argument("--no-reuse", action="store_true")
            p.add_argument("--max-usd", type=float, help="stop once the ledger total passes this")
        if name == "apply":
            p.add_argument("--dest", required=True)
            p.add_argument("--write", action="store_true")
    sub.add_parser("self-test")
    a = ap.parse_args(argv)

    if a.cmd == "self-test":
        return self_test()
    if a.cmd == "cost":
        T.print_cost(os.path.join(a.out, "ledger.jsonl"))
        return 0
    trips = load_trips(a.trips)
    if a.cmd == "status":
        _print_survey(survey(trips, load_sidecars(a.out)))
        return 0
    side = load_sidecars(a.out)
    todo = [t for t in trips if t not in side and not is_typed(trips[t])]
    if a.cmd == "queue":
        print("\n".join(todo))
        print(f"{len(todo)} of {len(trips)} trips still need a sidecar", file=sys.stderr)
        return 0
    if a.cmd == "prompt":
        print(build_prompt(trips[a.id]))
        return 0
    if a.cmd == "apply":
        changed, skipped = apply_sidecars(a.trips, a.out, a.dest, write=a.write)
        verb = "wrote" if a.write else "would write"
        print(f"{verb} {len(changed)} trip file(s) into {a.dest}; skipped {len(skipped)}")
        for tid, why in skipped:
            print(f"  skipped {tid}: {why}")
        return 1 if skipped else 0
    # run
    if a.stub:
        client = T.StubClient(a.stub)
    else:
        client = T.GeminiClient(a.model)
    ids = a.only or todo
    if a.limit:
        ids = ids[:a.limit]
    df = document_frequency(trips.values())
    ledger = os.path.join(a.out, "ledger.jsonl")
    done = rejected = 0
    for tid in ids:
        if a.max_usd is not None:
            _, _unpriced = T.cost_report(ledger)
            spent = sum(t["usd"] for t in T.cost_report(ledger)[0].values())
            if spent >= a.max_usd:
                print(f"stopped: ledger total USD {spent:.4f} reached --max-usd {a.max_usd}")
                break
        try:
            backfill_one(trips[tid], client, a.out, df=df, reuse=not a.no_reuse)
            done += 1
            print(f"ok       {tid}")
        except Rejected as exc:
            rejected += 1
            print(f"rejected {tid}: {exc.errors[0]}")
    print(f"{done} written, {rejected} rejected, into {a.out}")
    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(main())
