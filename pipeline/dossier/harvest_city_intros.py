"""City descriptions for the 260 airport-tier destinations.

An airport record carries the AIRPORT's article, so the dossier for CDG opened
with "Paris Charles de Gaulle Airport is the main hub of ..." on a page whose
whole job is to tell you what Paris is like. The same is true of every gateway
record: Rome (Fiumicino), Venice (Marco Polo), Milan (Bergamo).

This pass resolves the base city name to its own Wikivoyage article (falling
back to Wikipedia) and caches the extract per destination id, so
build_dossier can prefer a city description over an airport one without any
runtime lookup.

  python pipeline/dossier/harvest_city_intros.py [--limit N] [--refresh]

Keyless, paced, resumable: a cached id is never refetched.
Cache: cache/dossier/city_intros.json
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import DCACHE, PUB, atomic_write_json, load_json  # noqa: E402

OUT = os.path.join(DCACHE, "city_intros.json")
WV_API = "https://en.wikivoyage.org/w/api.php"
WP_API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "CartaDossier/1.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)"}
PACE_S = 0.4
PAREN_RE = re.compile(r"\s*\([^)]*\)\s*$")
AIRPORTY = re.compile(r"\bairport\b|\baerodrome\b|\bairfield\b", re.I)


def base_city(name):
    return PAREN_RE.sub("", name or "").strip()


def api(url, params):
    q = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(q, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        import json
        return json.load(r)


def extract_for(api_url, title):
    """Lead extract for an exact title, or None."""
    d = api(api_url, {
        "action": "query", "format": "json", "prop": "extracts",
        "exintro": 1, "explaintext": 1, "redirects": 1, "titles": title,
    })
    for page in (d.get("query", {}).get("pages", {}) or {}).values():
        if "missing" in page:
            return None
        text = (page.get("extract") or "").strip()
        if text and not AIRPORTY.search(text[:200]):
            return {"title": page.get("title"), "extract": text}
    return None


def search_title(api_url, city, country):
    d = api(api_url, {
        "action": "query", "format": "json", "list": "search",
        "srsearch": f"{city} {country}", "srlimit": 3,
    })
    for hit in d.get("query", {}).get("search", []):
        t = hit.get("title") or ""
        if not AIRPORTY.search(t):
            return t
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    dests = (load_json(os.path.join(PUB, "app_data.json")) or {}).get(
        "destinations", {})
    cache = {} if args.refresh else (load_json(OUT, {}) or {})

    todo = [(k, d) for k, d in dests.items()
            if d.get("tier") == "airport" and k not in cache]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[intros] {len(todo)} airport records to resolve "
          f"({len(cache)} cached)")

    ok = miss = 0
    for n, (did, d) in enumerate(todo):
        city = base_city(d.get("city"))
        country = d.get("country") or ""
        rec = None
        for api_url, source in ((WV_API, "wikivoyage"), (WP_API, "wikipedia")):
            try:
                rec = extract_for(api_url, city)
                if not rec:
                    t = search_title(api_url, city, country)
                    if t:
                        rec = extract_for(api_url, t)
                time.sleep(PACE_S)
            except Exception as e:  # noqa: BLE001 - resumable, retry next run
                print(f"  {did}: {e}")
                time.sleep(2)
                continue
            if rec:
                rec["source"] = source
                rec["url"] = (
                    f"https://en.{'wikivoyage' if source == 'wikivoyage' else 'wikipedia'}"
                    f".org/wiki/{urllib.parse.quote(rec['title'].replace(' ', '_'))}")
                break
        if rec:
            cache[did] = rec
            ok += 1
        else:
            cache[did] = {"extract": None}
            miss += 1
        if (n + 1) % 25 == 0:
            atomic_write_json(OUT, cache)
            print(f"  {n + 1}/{len(todo)} ({ok} resolved, {miss} none)",
                  flush=True)

    atomic_write_json(OUT, cache)
    print(f"[intros] done: {ok} resolved, {miss} without a city article "
          f"-> {OUT}")


if __name__ == "__main__":
    main()
