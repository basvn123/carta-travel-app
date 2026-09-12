"""Short custom intros for every destination, written by a model as a REWRITER.

The page's "what this place is" used to be the Wikivoyage lead verbatim, and
build_dossier.compose_short now composes a fallback from our own facts (one
distilled opening line plus sights, time needed and best months). This script
upgrades that fallback: per destination it assembles a FACTS block from data
we hold, hands the model the Wikivoyage extract as CONTEXT only, and asks for
two or three plain sentences a traveller can act on.

Guards, in code, regardless of what the model says about itself:
  length     260 characters or fewer, at most three sentences
  copying    no run of six words shared with the Wikivoyage extract (same
             shingle rule as pipeline/trails/describe.py), so the text is our
             own and carries no share-alike obligation
  style      no em or en dashes, no middots, no exclamation marks, no
             second-person marketing ("you will love"), no banned words
  grounding  every proper noun in the answer must appear in the FACTS block
             or the extract; an invented sight is dropped with the sentence

Output: cache/dossier/intros_llm.json, {id: {text, model, at, src}}, written
atomically after every batch so a stopped run keeps what it had.
build_dossier.py reads it and prefers it over the composed fallback.

Providers, chosen with --provider (default: whichever key is present):
  claude  the anthropic SDK, ANTHROPIC_API_KEY (repo-root .env or env). Ten
          destinations per call; Sonnet by default because this is a
          constrained rewrite, not research (--model to change).
  gemini  the AI Studio REST API, GEMINI_API_KEY, same batch shape, with the
          model chain and rate floor pipeline/trails/describe.py uses.

Usage, from the repo root:
    python pipeline/dossier/rewrite_intros.py --dry-run --limit 5
    python pipeline/dossier/rewrite_intros.py --tier 2 --limit 200
    python pipeline/dossier/rewrite_intros.py --all
    python pipeline/dossier/build_dossier.py --all      # then merge

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import (  # noqa: E402
    CACHE, DCACHE, PUB, atomic_write_json, dossier_file_base, load_json, norm_name,
)
from env_local import load_env  # noqa: E402

OUT = os.path.join(DCACHE, "intros_llm.json")
BATCH = 10
MAX_CHARS = 260
SHINGLE = 6
BANNED = re.compile(r"\b(seamless|unlock|effortless|elevate|leverage|empower|"
                    r"curated|simply|nestled|hidden gem|must-see|breathtaking|"
                    r"stunning|vibrant|boasts?|you will love|you'll love)\b", re.I)

SYSTEM = """You write the opening paragraph of a destination page for Carta, a
European travel guide. You are a rewriter, not a researcher: use ONLY the
facts you are given for each place. Never add a fact, a date, a number or a
name that is not in the FACTS block. The CONTEXT text is background to help
you phrase things; do not quote or closely paraphrase it.

For each place return two or three short sentences, 260 characters at most in
total, plain English, present tense, third person. First sentence: what the
place is (kind of place, where, what it is known for). Then the one or two
things a visitor most needs: the sights that lead, how long to plan, when to
come. Specific beats general. No exclamation marks, no marketing adjectives,
no second person, no em dashes, no bullet points, no headings.

Return JSON only: {"intros": [{"id": "...", "text": "..."}, ...]}, one entry
per place, in the order given."""


def facts_block(dest, dossier):
    place = dossier.get("place") or {}
    intro = dossier.get("intro") or {}
    hl = [h["name"] for h in sorted(dossier.get("highlights") or [],
                                    key=lambda x: -(x.get("rank_score") or 0))[:5]]
    when = dossier.get("when") or {}
    months = ["January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December"]
    best = [months[m - 1] for m in when.get("best") or [] if 1 <= m <= 12]
    verdict = dossier.get("verdict") or {}
    # "Rome (Fiumicino)" is a gateway record; the paragraph is about Rome.
    name = re.sub(r"\s*\([^)]*\)\s*$", "", place.get("name") or "").strip()
    lines = [
        f"name: {name}",
        f"country: {place.get('country')}",
        f"kind: {place.get('class')}",
        f"categories: {', '.join(place.get('categories') or [])}",
    ]
    desigs = [g.get("name") or g.get("kind") for g in place.get("designations") or []]
    if desigs:
        lines.append(f"designations: {', '.join(desigs)}")
    if hl:
        lines.append(f"top sights, best first: {', '.join(hl)}")
    if place.get("visit_h"):
        lines.append(f"hours of sights: {round(place['visit_h'])}")
    if best:
        lines.append(f"best months: {', '.join(best)}")
    if verdict.get("label"):
        lines.append(f"rating: {verdict.get('score')} of 10, {verdict['label']}")
    if (intro.get("facts") or {}).get("population"):
        lines.append(f"population: {intro['facts']['population']}")
    nature = (dest.get("nature") or {}).get("nearest") or {}
    if nature.get("name"):
        lines.append(f"nearest nature: {nature['name']}, {nature.get('dist_km')} km")
    near = dossier.get("nearby") or {}
    for layer in ("beaches", "lakes", "mountains"):
        names = [f["name"] for f in near.get(layer) or []][:2]
        if names:
            lines.append(f"{layer} close by: {', '.join(names)}")
    getting = (dossier.get("practical") or {}).get("getting_there") or {}
    if getting.get("transit"):
        lines.append(f"public transport: {getting['transit']}")
    return "\n".join(lines)


def user_block(items):
    parts = []
    for dest, dossier, extract in items:
        parts.append(f"### id: {dest['id']}\nFACTS:\n{facts_block(dest, dossier)}\n"
                     f"CONTEXT (do not copy): {extract[:900] if extract else '(none)'}\n")
    return "\n".join(parts)


def shingles(text, n=SHINGLE):
    toks = re.findall(r"[a-z0-9']+", (text or "").lower())
    return {" ".join(toks[i:i + n]) for i in range(max(0, len(toks) - n + 1))}


def proper_nouns(text):
    return {w for w in re.findall(r"\b[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*", text or "")}


def guard(text, dest, dossier, extract):
    """The rewrite, or None with a reason when it fails a rule."""
    if not text:
        return None, "empty"
    t = re.sub(r"\s+", " ", text).strip()
    t = re.sub(r"\s*[—–]\s*", ", ", t).replace("·", ",")
    if "!" in t or BANNED.search(t):
        return None, "style"
    sents = [s for s in re.split(r"(?<=[.?])\s+", t) if s]
    if len(sents) > 3 or len(t) > MAX_CHARS + 20:
        return None, "length"
    if extract and shingles(t) & shingles(extract):
        return None, "copied"
    allowed = facts_block(dest, dossier) + " " + (extract or "")
    allowed_norm = norm_name(allowed)
    kept = []
    for s in sents:
        bad = [pn for pn in proper_nouns(s)
               if len(pn) > 3 and norm_name(pn) not in allowed_norm]
        if bad:
            continue
        kept.append(s)
    if not kept:
        return None, "ungrounded"
    out = " ".join(kept)
    if len(out) > MAX_CHARS + 20:
        out = " ".join(kept[:2])
    return out, None


class Claude:
    name = "claude"

    def __init__(self, model):
        import anthropic
        self.anthropic = anthropic
        self.client = anthropic.Anthropic()
        self.model = model or "claude-sonnet-5"
        self.tokens_in = self.tokens_out = 0

    def complete(self, user):
        resp = self.client.messages.create(
            model=self.model, max_tokens=4000, system=SYSTEM,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low"},
        )
        self.tokens_in += resp.usage.input_tokens or 0
        self.tokens_out += resp.usage.output_tokens or 0
        if resp.stop_reason == "refusal":
            raise RuntimeError("model refused")
        return "".join(b.text for b in resp.content if b.type == "text")


class Gemini:
    name = "gemini"
    API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    CHAIN = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

    def __init__(self, model):
        self.key = os.environ.get("GEMINI_API_KEY")
        if not self.key:
            raise SystemExit("GEMINI_API_KEY is not set")
        self.chain = [model] if model else list(self.CHAIN)
        self.model = self.chain[0]
        self.tokens_in = self.tokens_out = 0
        self._last = 0.0

    def complete(self, user):
        body = {
            "systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": 8192, "temperature": 0.2,
                                 "responseMimeType": "application/json"},
        }
        last = None
        for model in self.chain:
            for attempt in (1, 2):
                wait = self._last + 6.5 - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self._last = time.monotonic()
                req = urllib.request.Request(
                    self.API.format(model=model), data=json.dumps(body).encode("utf-8"),
                    headers={"Content-Type": "application/json", "x-goog-api-key": self.key},
                    method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=120) as r:
                        data = json.loads(r.read().decode("utf-8"))
                    self.model = model
                    usage = data.get("usageMetadata") or {}
                    self.tokens_in += usage.get("promptTokenCount", 0)
                    self.tokens_out += usage.get("candidatesTokenCount", 0)
                    return data["candidates"][0]["content"]["parts"][-1]["text"]
                except urllib.error.HTTPError as exc:
                    last = exc.code
                    if exc.code == 429 and attempt == 1:
                        print(f"  note: {model} rate limited, waiting 30s")
                        time.sleep(30)
                        continue
                    break
            print(f"  note: {model} returned {last}, trying the next model")
        raise RuntimeError(f"every Gemini model failed (last {last})")


def parse(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        data = json.loads(m.group(0)) if m else {}
    return {str(x.get("id")): x.get("text") for x in data.get("intros", []) if x.get("id")}


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=("auto", "claude", "gemini"), default="auto")
    ap.add_argument("--model")
    ap.add_argument("--tier", type=int, help="rating tier at or above")
    ap.add_argument("--cc")
    ap.add_argument("--only")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--redo", action="store_true", help="rewrite places already done")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    app = load_json(os.path.join(PUB, "app_data.json"))
    dests = app["destinations"]
    wv = load_json(os.path.join(CACHE, "wikivoyage.json"), {}) or {}
    city_intros = load_json(os.path.join(DCACHE, "city_intros.json"), {}) or {}
    done = load_json(OUT, {}) or {}

    todo = []
    for did, d in dests.items():
        if args.only and did != args.only:
            continue
        if args.cc and d.get("iso2") != args.cc.upper():
            continue
        if args.tier is not None and ((d.get("rating") or {}).get("tier") or 0) < args.tier:
            continue
        if not (args.only or args.cc or args.tier is not None or args.all):
            continue
        if did in done and not args.redo:
            continue
        dossier = load_json(os.path.join(PUB, "dossier", dossier_file_base(did) + ".json"))
        if not dossier:
            continue
        rec = city_intros.get(did) or wv.get(did) or {}
        extract = rec.get("extract") if isinstance(rec, dict) else ""
        if extract and re.search(r"\bairport\b", extract[:200], re.I):
            extract = ""
        todo.append((d, dossier, extract or ""))
    if args.limit:
        todo = todo[: args.limit]
    todo.sort(key=lambda t: -((t[0].get("rating") or {}).get("score") or 0))
    print(f"{len(todo)} destinations to write, {len(done)} already done")
    if not todo:
        return

    if args.dry_run:
        print(user_block(todo[:2]))
        return

    provider = args.provider
    if provider == "auto":
        provider = "claude" if os.environ.get("ANTHROPIC_API_KEY") else "gemini"
    client = Claude(args.model) if provider == "claude" else Gemini(args.model)
    print(f"provider {client.name}, model {client.model}")

    stats = {"ok": 0, "guard": 0, "missing": 0}
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        try:
            raw = client.complete(user_block(batch))
            answers = parse(raw)
        except Exception as exc:  # noqa: BLE001
            print(f"  batch {i // BATCH + 1} failed: {str(exc)[:160]}")
            time.sleep(5)
            continue
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for dest, dossier, extract in batch:
            text = answers.get(dest["id"])
            if text is None:
                stats["missing"] += 1
                continue
            kept, why = guard(text, dest, dossier, extract)
            if not kept:
                stats["guard"] += 1
                done[dest["id"]] = {"text": None, "why": why, "raw": text[:300],
                                    "model": client.model, "at": now}
                continue
            stats["ok"] += 1
            done[dest["id"]] = {"text": kept, "model": client.model, "at": now,
                                "src": "rewrite"}
        atomic_write_json(OUT, done)
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}  ok {stats['ok']}  "
              f"guarded {stats['guard']}  missing {stats['missing']}  "
              f"tokens {client.tokens_in}/{client.tokens_out}")
    print("done:", stats, "->", OUT)
    print("now run: python pipeline/dossier/build_dossier.py --all")


if __name__ == "__main__":
    main()
