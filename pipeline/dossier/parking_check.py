"""Fact-check "where to park" against the web, one destination at a time.

The parking section is ranked from cache/parking_osm.json: what OpenStreetMap
contributors tagged, which is sometimes a car park that closed in 2019, a fee
that changed, or a park-and-ride nobody uses. This script asks a model WITH
WEB SEARCH to find what the city itself says, and stores only what it can
cite:

  official_url     the municipal or operator parking page
  restricted       True when the centre is a limited-traffic or pedestrian
                   zone (ZTL, Umweltzone, zone pietonne), with a one-line note
  car_parks        up to six named car parks near the centre, each with a
                   short note (fee, hours, "closed") when the source says so
  park_ride_names  named park-and-ride sites
  advice           one sentence a driver needs ("Park at the P+R and take
                   tram 2; the centre is closed to cars 10-18")
  sources          the URLs the answer was grounded on
  checked          the date

build_dossier.py merges the record as parking.web, and the page marks OSM
spots whose name the city also uses as "confirmed". Nothing here replaces a
coordinate: the OSM rows keep their navigation links, the web block tells the
reader what is true.

Providers:
  claude  the anthropic SDK with the server-side web_search tool
          (ANTHROPIC_API_KEY). About one to three searches per place.
  gemini  the AI Studio REST API with google_search grounding
          (GEMINI_API_KEY), free tier permitting.

Cost is per place, so run the famous ones first (--tier 2), then widen.

Usage, from the repo root:
    python pipeline/dossier/parking_check.py --dry-run --limit 3
    python pipeline/dossier/parking_check.py --tier 2 --limit 50
    python pipeline/dossier/parking_check.py --only FCO
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
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import (  # noqa: E402
    DCACHE, PUB, atomic_write_json, load_json, strip_dashes,
)
from env_local import load_env  # noqa: E402

OUT = os.path.join(DCACHE, "parking_web.json")

SYSTEM = """You verify parking facts for a European travel guide. Use web search
to find what the city or the car park operator itself publishes about parking
near the centre of the place given. Prefer municipal sites, operator sites
and the official tourist office; ignore forums and aggregators.

Answer with JSON only, no prose around it:
{
  "official_url": "https://... or null",
  "restricted": true or false,
  "restricted_note": "one short sentence, or null",
  "car_parks": [{"name": "...", "note": "fee or hours or status, short, or null"}],
  "park_ride_names": ["..."],
  "advice": "one sentence a driver needs, or null",
  "confidence": "high" | "medium" | "low"
}
Rules: at most six car parks, named as the source names them. Only include a
fact you found in a source. If you found nothing reliable, return the JSON
with nulls and empty lists and confidence "low". No em dashes."""


def prompt_for(dest):
    city = re.sub(r"\s*\([^)]*\)\s*$", "", dest.get("city") or "")
    return (f"Place: {city}, {dest.get('country')}. Coordinates "
            f"{dest.get('city_lat', dest.get('lat')):.4f}, "
            f"{dest.get('city_lon', dest.get('lon')):.4f}. "
            f"Find official parking information for visitors arriving by car.")


class Claude:
    name = "claude"

    def __init__(self, model):
        import anthropic
        self.anthropic = anthropic
        self.client = anthropic.Anthropic()
        self.model = model or "claude-sonnet-5"
        self.tokens_in = self.tokens_out = 0
        self.searches = 0

    def ask(self, dest):
        resp = self.client.messages.create(
            model=self.model, max_tokens=4000, system=SYSTEM,
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 4}],
            messages=[{"role": "user", "content": prompt_for(dest)}],
            output_config={"effort": "low"},
        )
        self.tokens_in += resp.usage.input_tokens or 0
        self.tokens_out += resp.usage.output_tokens or 0
        srv = getattr(resp.usage, "server_tool_use", None)
        if srv is not None:
            self.searches += getattr(srv, "web_search_requests", 0) or 0
        if resp.stop_reason == "refusal":
            raise RuntimeError("model refused")
        text = ""
        sources = []
        for block in resp.content:
            if block.type == "text":
                text += block.text
                for c in getattr(block, "citations", None) or []:
                    url = getattr(c, "url", None)
                    if url:
                        sources.append(url)
            elif block.type == "web_search_tool_result":
                content = block.content
                if isinstance(content, list):
                    for r in content:
                        url = getattr(r, "url", None)
                        if url:
                            sources.append(url)
        return text, sources


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
        self.searches = 0
        self._last = 0.0

    def ask(self, dest):
        body = {
            "systemInstruction": {"parts": [{"text": SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": prompt_for(dest)}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.1},
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
                    cand = data["candidates"][0]
                    text = "".join(p.get("text", "") for p in cand["content"]["parts"])
                    gm = cand.get("groundingMetadata") or {}
                    sources = [c.get("web", {}).get("uri") for c in gm.get("groundingChunks", [])
                               if c.get("web", {}).get("uri")]
                    self.searches += 1
                    return text, sources
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
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        return json.loads(m.group(0)) if m else {}


def clean_record(data, sources):
    rec = {}
    url = data.get("official_url")
    if isinstance(url, str) and url.startswith("http"):
        rec["official_url"] = url
    rec["restricted"] = bool(data.get("restricted"))
    note = data.get("restricted_note")
    if isinstance(note, str) and note.strip():
        rec["restricted_note"] = strip_dashes(note.strip())[:200]
    parks = []
    for p in data.get("car_parks") or []:
        if isinstance(p, dict) and isinstance(p.get("name"), str) and p["name"].strip():
            row = {"name": strip_dashes(p["name"].strip())[:80]}
            if isinstance(p.get("note"), str) and p["note"].strip():
                row["note"] = strip_dashes(p["note"].strip())[:120]
            parks.append(row)
    if parks:
        rec["car_parks"] = parks[:6]
    prs = [strip_dashes(x.strip())[:80] for x in data.get("park_ride_names") or []
           if isinstance(x, str) and x.strip()]
    if prs:
        rec["park_ride_names"] = prs[:4]
    adv = data.get("advice")
    if isinstance(adv, str) and adv.strip():
        rec["advice"] = strip_dashes(adv.strip())[:240]
    rec["confidence"] = data.get("confidence") if data.get("confidence") in ("high", "medium", "low") else "low"
    seen, keep = set(), []
    for s in sources:
        dom = urlsplit(s).netloc
        if s not in seen and dom:
            seen.add(s)
            keep.append(s)
    if keep:
        rec["sources"] = keep[:6]
    return rec


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=("auto", "claude", "gemini"), default="auto")
    ap.add_argument("--model")
    ap.add_argument("--tier", type=int)
    ap.add_argument("--cc")
    ap.add_argument("--only")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dests = load_json(os.path.join(PUB, "app_data.json"))["destinations"]
    parking = (load_json(os.path.join("cache", "parking_osm.json"), {}) or {}).get("dests", {})
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
        # Villages with no OSM parking at all rarely have a municipal page;
        # cities and towns are where a driver needs the check.
        if (d.get("place") or {}).get("class") in ("village", "area") and not parking.get(did):
            continue
        todo.append(d)
    todo.sort(key=lambda d: -((d.get("rating") or {}).get("score") or 0))
    # Two gateway records for one city (FCO and CIA are both Rome) share one
    # check: the answer is about the city, and a second search is a second
    # bill for the same page.
    def city_key(d):
        return (re.sub(r"\s*\([^)]*\)\s*$", "", d.get("city") or "").strip().lower(),
                (d.get("country") or "").lower())
    twins = {}
    unique = []
    for d in todo:
        k = city_key(d)
        twins.setdefault(k, []).append(d["id"])
        if len(twins[k]) == 1:
            unique.append(d)
    todo = unique
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} destinations to check, {len(done)} already done")
    if not todo:
        return
    if args.dry_run:
        for d in todo[:3]:
            print(prompt_for(d))
        return

    provider = args.provider
    if provider == "auto":
        provider = "claude" if os.environ.get("ANTHROPIC_API_KEY") else "gemini"
    client = Claude(args.model) if provider == "claude" else Gemini(args.model)
    print(f"provider {client.name}, model {client.model}")

    ok = fail = 0
    for i, d in enumerate(todo):
        try:
            text, sources = client.ask(d)
            rec = clean_record(parse(text), sources)
        except Exception as exc:  # noqa: BLE001
            print(f"  {d['id']} failed: {str(exc)[:160]}")
            fail += 1
            time.sleep(3)
            continue
        rec["checked"] = time.strftime("%Y-%m-%d")
        rec["model"] = client.model
        for twin in twins.get(city_key(d), [d["id"]]):
            done[twin] = rec
        ok += 1
        if (i + 1) % 5 == 0 or i + 1 == len(todo):
            atomic_write_json(OUT, done)
            print(f"  {i + 1}/{len(todo)}  ok {ok}  failed {fail}  searches {client.searches}  "
                  f"tokens {client.tokens_in}/{client.tokens_out}")
    atomic_write_json(OUT, done)
    print(f"done: {ok} checked, {fail} failed -> {OUT}")
    print("now run: python pipeline/dossier/build_dossier.py --all")


if __name__ == "__main__":
    main()
