"""Harvest Wikipedia pageviews as a fame signal - network only, no data writes.

Two targets, both cached, both resumable:

  A. Destination fame  - every destination's own Wikipedia article
     (dest.image.page, present on all 524) -> avg daily views over the last
     12 full months -> cache/dest_pageviews.json  { "<dest id>": int }
     Consumed by rating_layer.py (schema v14 rating.components.fame).

  B. POI pop           - every items_full POI with a wiki URL (direct or via
     the enrich resolve cache) -> fills the existing 'pop' dict inside
     app_data/enrich_cache.json, exactly like enrich_activities pass 4.
     Applied to the dataset later via `python enrich_activities.py apply`
     (that step is offline and idempotent).

Neither part writes app_data.json, so it is safe to run concurrently with
the apply_* layer scripts.

Usage:
    python harvest_pageviews.py            # both parts
    python harvest_pageviews.py dests      # only destination fame (fast, ~524 calls)
    python harvest_pageviews.py pois       # only POI pop (~6-7k calls)
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import enrich_activities as ea
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
DEST_CACHE = ROOT / "cache" / "dest_pageviews.json"

MAX_WORKERS = 8
ITEM_DELAY_S = 0.05

# A few destinations' image.page resolves to the AIRPORT's article, which
# would poison the fame signal (an airport's pageviews are not the place's
# draw). Fame uses these overrides instead.
FAME_ARTICLE_OVERRIDES = {
    "TFS": "https://en.wikipedia.org/wiki/Tenerife",
    "HHN": "https://en.wikipedia.org/wiki/Frankfurt",
    "CGN": "https://en.wikipedia.org/wiki/Cologne",
    "FKB": "https://en.wikipedia.org/wiki/Baden-Baden",
    "LBA": "https://en.wikipedia.org/wiki/Leeds",
    # image.page had resolved to the United Kingdom article, giving the small
    # cathedral city 18,823 views/day (more than London) and a flag hero.
    "gem:wells-somerset": "https://en.wikipedia.org/wiki/Wells,_Somerset",
    # These dests' HERO images now come from a city/capital article (see
    # oneoff/fix_flag_hero_images.py), but their fame should stay the
    # country/territory article the destination actually is.
    "LUX": "https://en.wikipedia.org/wiki/Luxembourg",
    "gem:monaco-mc": "https://en.wikipedia.org/wiki/Monaco",
    "gem:aland": "https://en.wikipedia.org/wiki/%C3%85land",
    "GCI": "https://en.wikipedia.org/wiki/Guernsey",
    "OVD": "https://en.wikipedia.org/wiki/Asturias",
}


def _load(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def harvest_dests(data):
    cache = _load(DEST_CACHE)
    # Fallback articles for destinations with no photograph. `image.page` is a
    # by-product of the image harvest, so a place that has no picture had no
    # article either and was skipped outright - not measured as obscure, just
    # never asked. resolve_dest_articles.py finds those by geosearch.
    articles = _load(ROOT / "cache" / "dest_articles.json")
    todo = []
    skipped_no_url = 0
    for did, d in data["destinations"].items():
        page = (d.get("image") or {}).get("page")
        if page and (".wikipedia.org/wiki/" not in page
                     or "commons.wikimedia.org" in page):
            page = None      # a Commons File: page is a photo, not an article
        url = (FAME_ARTICLE_OVERRIDES.get(did) or page
               or (articles.get(did) or {}).get("url"))
        if not url:
            skipped_no_url += 1
            continue
        if did in cache and did not in FAME_ARTICLE_OVERRIDES:
            continue
        if did in FAME_ARTICLE_OVERRIDES and cache.get(f"_ovr_{did}"):
            continue
        todo.append((did, url))
    print(f"[dests] {len(todo)} articles to fetch ({len(cache)} cached), "
          f"window {ea.PV_START}..{ea.PV_END}")
    if skipped_no_url:
        print(f"[dests] {skipped_no_url} destinations have no article at all; "
              f"run resolve_dest_articles.py to give them one")

    def work(pair):
        did, url = pair
        time.sleep(ITEM_DELAY_S)
        return did, ea.pageviews_avg(url)

    done = fails = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(work, p) for p in todo]
        for f in as_completed(futs):
            did, v = f.result()
            if v is None:
                fails += 1
            else:
                cache[did] = v
                if did in FAME_ARTICLE_OVERRIDES:
                    cache[f"_ovr_{did}"] = True
            done += 1
            if done % 100 == 0:
                atomic_write_json(DEST_CACHE, cache)
                print(f"    {done}/{len(todo)} ({fails} failures)")
    atomic_write_json(DEST_CACHE, cache)
    print(f"[dests] done: {len(cache)} cached, {fails} failed")


def harvest_pois(data):
    _, cache = ea.load_all()
    ea.pass4_pageviews(data, cache)
    ea.save_cache(cache, force=True)


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    data = json.loads(DATA.read_text(encoding="utf-8"))
    if what in ("all", "dests"):
        harvest_dests(data)
    if what in ("all", "pois"):
        harvest_pois(data)


if __name__ == "__main__":
    main()
