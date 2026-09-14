"""The 40-source web sweep as a batch job: whole catalogue, one API key.

This is the same S4 pass the research agents run by hand, written so it can
run unattended over all 3,038 destinations. It needs a search API key, and
that is the ONLY thing it needs: extraction is constrained matching against a
candidate vocabulary we build ourselves, not open-ended generation, so there
is no model call and no per-destination cost beyond the searches.

  set CARTA_SEARCH_PROVIDER=serper        (or brave, or google)
  set CARTA_SEARCH_KEY=...
  python pipeline/dossier/web_sweep.py --tier 1          famous first
  python pipeline/dossier/web_sweep.py --all --limit 200

Where to get a key, cheapest first for a one-off sweep of the catalogue
(~8 queries x 3,038 destinations = ~24,300 searches):

  serper.dev    Google results via API. 2,500 free credits, then about
                $50 per 50,000. The full catalogue costs roughly $25.
  Brave Search API (api.search.brave.com)  Independent index, self-serve.
                2,000 queries/month free at 1 query/sec; the paid tier is
                about $5 per 1,000, so the catalogue is roughly $120.
  Google Programmable Search JSON API      100 queries/day free, then $5
                per 1,000 capped at 10,000/day, so the catalogue is about
                $120 spread over three days. Needs a Cloud project plus a
                Programmable Search Engine id (cx) set to search the web.

The corroboration gate is unchanged and is the whole point: an item ships
only when at least three DISTINCT REGISTRABLE DOMAINS name it. The web
decides which things matter and in what order; it never supplies the words.
We store a name, a count, and up to three source URLs. Every sentence we
print is composed from our own data.

Output is byte-compatible with the agent-written files, so the two can be
mixed freely and research_do.py validates both.

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
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    BLOCKED_DOMAINS, DCACHE, PUB, atomic_write_json, dossier_file_base, fold,
    is_blocked, load_json, norm_name, registrable,
)
from derive_do import usable_name  # noqa: E402

RESEARCH_DIR = os.path.join(DCACHE, "research")
PROGRESS = os.path.join(DCACHE, "web_sweep_state.json")
UA = "CartaDossier/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"

MIN_DOMAINS = 3
MAX_ITEMS = 8
PACE_S = 1.1

# Generic activities worth shipping when the web keeps naming them, phrased as
# our own label rather than anyone's headline.
TAXONOMY = {
    "wine tasting": ("experience", ["wine tasting", "winery", "vineyard tour"]),
    "sea kayaking": ("activity", ["kayak", "kayaking", "sea kayak"]),
    "boat trip": ("activity", ["boat trip", "boat tour", "sailing trip"]),
    "food tour": ("experience", ["food tour", "street food tour", "tapas tour"]),
    "thermal baths": ("experience", ["thermal bath", "thermal spa", "hot spring"]),
    "cable car": ("activity", ["cable car", "funicular", "gondola lift"]),
    "cycling route": ("activity", ["bike ride", "cycling route", "bike tour"]),
    "diving": ("activity", ["scuba diving", "dive site", "snorkeling", "snorkelling"]),
    "cooking class": ("experience", ["cooking class", "cookery class"]),
    "market morning": ("experience", ["farmers market", "morning market", "flea market"]),
}

QUERIES = [
    "best things to do in {city}",
    "{city} {country} hidden gems",
    "what to do in {city} {country}",
    "{city} festivals and events",
    "{city} day hikes viewpoints",
    "{city} local food specialities",
    "{city} itinerary what locals do",
    "unusual things to do {city} {country}",
]

# What counts as a publisher lives in common.py, so the validator that judges
# this file's output applies the same rule the harvester applied.
BLOCKED = BLOCKED_DOMAINS


# ------------------------------------------------------------------ providers


def _post_json(url, payload, headers):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": UA, **headers})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def _get_json(url, headers):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **headers})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def search_serper(q, key):
    d = _post_json("https://google.serper.dev/search", {"q": q, "num": 20},
                   {"X-API-KEY": key})
    return [(x.get("title", ""), x.get("snippet", ""), x.get("link", ""))
            for x in d.get("organic", [])]


def search_brave(q, key):
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode(
        {"q": q, "count": 20})
    d = _get_json(url, {"Accept": "application/json", "X-Subscription-Token": key})
    return [(x.get("title", ""), x.get("description", ""), x.get("url", ""))
            for x in (d.get("web", {}) or {}).get("results", [])]


def search_google(q, key):
    cx = os.environ.get("CARTA_SEARCH_CX", "")
    url = "https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(
        {"q": q, "key": key, "cx": cx, "num": 10})
    d = _get_json(url, {})
    return [(x.get("title", ""), x.get("snippet", ""), x.get("link", ""))
            for x in d.get("items", [])]


PROVIDERS = {"serper": search_serper, "brave": search_brave, "google": search_google}


# ------------------------------------------------------------------ vocabulary


def build_vocabulary(dest, items, nearby, events):
    """Named things we already know are here, plus the generic taxonomy.

    Extraction is matching against THIS set. That is what keeps invented
    attractions out: the web can only vote for something we can already point
    at on a map or in a layer file.
    """
    vocab = []

    def add(name, typ, detail=None, ref=None, season=None):
        if not usable_name(name):
            return
        vocab.append({"name": name, "type": typ, "detail": detail,
                      "ref": ref, "season": season,
                      "match": norm_name(name)})

    for it in items or []:
        kind = it.get("kind") or ""
        typ = ("swim" if kind in ("Swimming", "Water park", "Diving")
               else "experience" if kind == "Sauna & baths" else "activity")
        add(it.get("name"), typ, it.get("desc"))

    for tr in (nearby or {}).get("trails", []):
        bits = []
        if tr.get("km_len"):
            bits.append(f"{tr['km_len']:.0f} km")
        if tr.get("duration_min"):
            h = tr["duration_min"] / 60
            bits.append(f"about {h:.0f} h" if h >= 1.5 else "under 90 min")
        add(tr.get("name"), "trail", ", ".join(bits) or None,
            {"layer": "trails", "cc": tr["cc"], "id": tr["id"]})
    for layer in ("beaches", "lakes"):
        for f in (nearby or {}).get(layer, []):
            add(f.get("name"), "swim", f"{f['km']:.0f} km away",
                {"layer": layer, "cc": f["cc"], "id": f["id"]})
    for f in (nearby or {}).get("mountains", []):
        d = f"{f['km']:.0f} km away"
        if f.get("elev_m"):
            d = f"{f['elev_m']} m summit, {d}"
        add(f.get("name"), "activity", d,
            {"layer": "mountains", "cc": f["cc"], "id": f["id"]})
    for ev in events or []:
        add(ev.get("name"), "festival", ev.get("desc"), None,
            ev.get("months") or None)
    return vocab


def extract(vocab, pages, city):
    """Per page, which vocabulary entries does it name? Titles and snippets
    only, and only pages that are actually about this destination."""
    city_n = norm_name(city)
    hits = {}
    usable = 0
    generic = {}
    for title, snippet, url in pages:
        host = registrable(urllib.parse.urlparse(url).netloc)
        if not host or is_blocked(host):
            continue
        blob = norm_name(f"{title} {snippet}")
        if city_n and city_n not in blob and city_n not in norm_name(url):
            continue          # a page about somewhere else does not get a vote
        usable += 1
        for v in vocab:
            if v["match"] and v["match"] in blob:
                hits.setdefault(v["name"], {"v": v, "domains": {}, "urls": []})
                hits[v["name"]]["domains"].setdefault(host, url)
        low = fold(f"{title} {snippet}").lower()
        for label, (typ, phrases) in TAXONOMY.items():
            if any(p in low for p in phrases):
                generic.setdefault(label, {"type": typ, "domains": {}})
                generic[label]["domains"].setdefault(host, url)
    return hits, generic, usable


def compose(dest, hits, generic, usable, n_pages):
    city = dest.get("city") or ""
    out = []
    for name, rec in hits.items():
        doms = rec["domains"]
        if len(doms) < MIN_DOMAINS:
            continue
        v = rec["v"]
        item = {"name": name, "type": v["type"]}
        if v.get("detail"):
            item["detail"] = v["detail"]
        if v.get("season"):
            item["season"] = v["season"]
        if v.get("ref"):
            item["ref"] = v["ref"]
        item["evidence"] = {"method": "web", "n_sources": len(doms),
                            "of": n_pages, "urls": list(doms.values())[:3]}
        out.append(item)
    for label, rec in generic.items():
        doms = rec["domains"]
        if len(doms) < MIN_DOMAINS:
            continue
        out.append({
            "name": label[:1].upper() + label[1:],
            "type": rec["type"],
            "detail": f"Named by guides writing about {city}.",
            "evidence": {"method": "web", "n_sources": len(doms),
                         "of": n_pages, "urls": list(doms.values())[:3]},
        })
    out.sort(key=lambda e: -e["evidence"]["n_sources"])
    return out[:MAX_ITEMS]


def sweep_one(dest, vocab, provider, key, n_queries=8):
    pages, seen = [], set()
    city = dest.get("city") or ""
    country = dest.get("country") or ""
    for q in QUERIES[:n_queries]:
        query = q.format(city=city, country=country)
        for attempt in range(3):
            try:
                for row in PROVIDERS[provider](query, key):
                    if row[2] and row[2] not in seen:
                        seen.add(row[2])
                        pages.append(row)
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 503):
                    time.sleep(8 * (attempt + 1))
                    continue
                raise
            except Exception:  # noqa: BLE001 - one bad query must not kill a run
                time.sleep(3)
        time.sleep(PACE_S)
    hits, generic, usable = extract(vocab, pages, city)
    return hits, generic, usable, len(pages)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", type=int, default=1)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--queries", type=int, default=8)
    ap.add_argument("--if-configured", action="store_true",
                    help="no key set is a no-op, not an error; for the pipeline, "
                         "where an unconfigured stage must not fail the task")
    args = ap.parse_args()

    provider = os.environ.get("CARTA_SEARCH_PROVIDER", "").lower()
    key = os.environ.get("CARTA_SEARCH_KEY", "")
    if provider not in PROVIDERS or not key:
        # Run by hand: tell the operator what is missing and fail, because they
        # asked for a sweep and are not getting one. Run from the pipeline with
        # --if-configured: succeed and say nothing happened, because a key is
        # optional here and the open-data tier covers the catalogue without it.
        # Either way the message names what to set, so neither exit is a puzzle.
        print("No search credential: set CARTA_SEARCH_PROVIDER (serper|brave|"
              "google) and CARTA_SEARCH_KEY. See this file's header for where "
              "to get one." + (" Skipping the web sweep." if args.if_configured
                               else ""))
        sys.exit(0 if args.if_configured else 2)

    app = load_json(os.path.join(PUB, "app_data.json")) or {}
    dests = app.get("destinations", {})
    acts = load_json(os.path.join(PUB, "activities_full.json"), {}) or {}
    dossier_dir = os.path.join(PUB, "dossier")

    os.makedirs(RESEARCH_DIR, exist_ok=True)
    have = {f[:-5] for f in os.listdir(RESEARCH_DIR) if f.endswith(".json")}

    todo = []
    for did, d in dests.items():
        if not args.all and (d.get("rating") or {}).get("tier", 0) < args.tier:
            continue
        if dossier_file_base(did) in have:
            continue
        todo.append((-(d.get("rating") or {}).get("score", 0), did))
    todo.sort()
    if args.limit:
        todo = todo[: args.limit]
    print(f"[sweep] {len(todo)} destinations, provider {provider}, "
          f"{args.queries} queries each = ~{len(todo) * args.queries} searches")

    written = thin = 0
    for n, (_, did) in enumerate(todo):
        dest = dests[did]
        base = dossier_file_base(did)
        # The dossier already holds the joined nearby features and events, so
        # the vocabulary costs nothing to assemble.
        dj = load_json(os.path.join(dossier_dir, base + ".json"), {}) or {}
        vocab = build_vocabulary(dest, acts.get(did) or [],
                                 dj.get("nearby"), (dj.get("when") or {}).get("events"))
        hits, generic, usable, n_pages = sweep_one(
            dest, vocab, provider, key, args.queries)
        items = compose(dest, hits, generic, usable, n_pages)
        if not items:
            thin += 1
            continue
        atomic_write_json(os.path.join(RESEARCH_DIR, base + ".json"), {
            "id": did,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": "web_sweep_v1",
            "n_usable_sources": usable,
            "of": n_pages,
            "do": items,
            "sources": [u for r in hits.values() for u in r["domains"].values()][:40],
        })
        written += 1
        if (n + 1) % 25 == 0:
            print(f"  {n + 1}/{len(todo)} ({written} written, {thin} too thin)",
                  flush=True)
    print(f"[sweep] done: {written} written, {thin} produced nothing above the "
          f"{MIN_DOMAINS}-domain gate")


if __name__ == "__main__":
    main()
