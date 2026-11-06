"""Short custom intros for every destination, written by a model as a REWRITER.

Tier: Manual

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

Provider: through pipeline/ai_gateway.py (T1137, feature "intros"): Gemini
by default, GEMINI_API_KEY (repo-root .env or env), ten destinations per
call, with the gateway's model chain, rate floor, retries and output check
(--model to pin one; AI_INTROS_PROVIDER and AI_INTROS_MODELS switch it). A
Wikivoyage extract that carries instruction-shaped text is dropped from the
prompt before the call. The Claude provider was removed in T264: CLAUDE.md
forbids the Claude API in this project.

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

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import (  # noqa: E402
    CACHE, DCACHE, PUB, atomic_write_json, dossier_file_base, load_json, norm_name,
)
from env_local import load_env  # noqa: E402
from ai_gateway import AIRefusal, Gateway, scan_injection  # noqa: E402
from prompt_registry import prompt  # noqa: E402

OUT = os.path.join(DCACHE, "intros_llm.json")
BATCH = 10
MAX_CHARS = 260
SHINGLE = 6
BANNED = re.compile(r"\b(seamless|unlock|effortless|elevate|leverage|empower|"
                    r"curated|simply|nestled|hidden gem|must-see|breathtaking|"
                    r"stunning|vibrant|boasts?|you will love|you'll love)\b", re.I)

# The prompt text is the registry's "intros" prompt (prompts/intros, T1140).
PROMPT = prompt("intros")
SYSTEM = PROMPT.text("system")


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
        parts.append(PROMPT.text("user.entry", id=dest["id"], facts=facts_block(dest, dossier),
                                 context=extract[:900] if extract else PROMPT.text("user.noContext")))
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


class Client:
    """The intros job's model access, through pipeline/ai_gateway.py (T1137)."""

    def __init__(self, model):
        try:
            self.gw = Gateway("intros", models=[model] if model else None)
        except AIRefusal as exc:
            raise SystemExit(f"rewrite_intros: {exc}") from None
        self.name = self.gw.provider

    @property
    def model(self):
        return self.gw.model

    @property
    def tokens_in(self):
        return self.gw.tokens_in

    @property
    def tokens_out(self):
        return self.gw.tokens_out

    def complete(self, user, screen):
        return self.gw.call(user, system=SYSTEM, json=True, temperature=0.2, max_tokens=8192,
                            screen=screen).text


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
    # The provider is the gateway's config (AI_INTROS_PROVIDER); never the
    # Claude API (T264). The flag stays so `--provider gemini` commands work.
    ap.add_argument("--provider", choices=("gemini",), default="gemini")
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
        # Harvested text is data: an extract with instruction-shaped text in
        # its first 900 characters (what the prompt shows) is left out (T1137).
        if extract and scan_injection(extract[:900])["hit"]:
            print(f"  {did}: extract left out, it reads as an instruction")
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

    client = Client(args.model)
    print(f"provider {client.name}, model {client.model}")

    stats = {"ok": 0, "guard": 0, "missing": 0}
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        try:
            raw = client.complete(user_block(batch), screen=[e[:900] for _, _, e in batch])
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
