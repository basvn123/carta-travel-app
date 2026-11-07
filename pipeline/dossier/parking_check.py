"""Fact-check "where to park" against the web, one destination at a time.

Tier: Manual

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

Provider: through pipeline/ai_gateway.py (T1137, feature "parking"): Gemini
with google_search grounding (GEMINI_API_KEY), with the gateway's model
chain, rate floor, retries and output check (AI_PARKING_MODELS or --model
switch the model; grounding needs a provider with live search, so Gemini). Grounded requests are billed separately from
tokens once the monthly free allowance is spent (register row T041-c). The
Claude provider was removed in T264: CLAUDE.md forbids the Claude API.

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
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import (  # noqa: E402
    DCACHE, PUB, atomic_write_json, load_json, strip_dashes,
)
from env_local import load_env  # noqa: E402
from ai_gateway import AIRefusal, Gateway  # noqa: E402
from prompt_registry import prompt  # noqa: E402

OUT = os.path.join(DCACHE, "parking_web.json")

# The prompt text is the registry's "parking" prompt (prompts/parking, T1140).
PROMPT = prompt("parking")
SYSTEM = PROMPT.text("system")


def prompt_for(dest):
    city = re.sub(r"\s*\([^)]*\)\s*$", "", dest.get("city") or "")
    return PROMPT.text("user", city=city, country=dest.get("country"),
                       lat=f"{dest.get('city_lat', dest.get('lat')):.4f}",
                       lon=f"{dest.get('city_lon', dest.get('lon')):.4f}")


class Client:
    """The parking job's model access, through pipeline/ai_gateway.py (T1137)."""

    def __init__(self, model):
        try:
            self.gw = Gateway("parking", models=[model] if model else None)
        except AIRefusal as exc:
            raise SystemExit(f"parking_check: {exc}") from None
        self.name = self.gw.provider
        self.searches = 0

    @property
    def model(self):
        return self.gw.model

    @property
    def tokens_in(self):
        return self.gw.tokens_in

    @property
    def tokens_out(self):
        return self.gw.tokens_out

    def ask(self, dest):
        res = self.gw.call(prompt_for(dest), system=SYSTEM, search=True, temperature=0.1, max_tokens=4096,
                           screen=[str(dest.get("city") or ""), str(dest.get("country") or "")])
        self.searches += 1
        return res.text, res.sources


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
    # Gemini is the only provider: CLAUDE.md forbids the Claude API (T264).
    # The flag stays so existing `--provider gemini` commands keep working.
    ap.add_argument("--provider", choices=("gemini",), default="gemini")
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

    client = Client(args.model)
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
