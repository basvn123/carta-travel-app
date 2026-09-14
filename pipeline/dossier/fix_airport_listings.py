"""Point the 260 gateway records at their CITY's Wikivoyage listings.

cache/wikivoyage_listings.json is keyed by destination id and resolved through
cache/wikivoyage.json, which for an airport record is the airport's article.
So CDG's "things a visitor should see in Paris" was sixteen airline lounges,
and the highlight ranker got no curation signal for Paris at all.

harvest_city_intros.py already resolved the right article title for every
airport record. This pass re-parses the See and Do listings from THAT title
and writes them back under the destination id, so the ranker and the
things-to-do derivation both see Paris rather than Terminal 2E.

  python pipeline/dossier/fix_airport_listings.py [--limit N] [--refresh]

Reuses the wikitext parser in pipeline/harvest_wikivoyage_listings.py rather
than forking it: one listing parser, one set of bugs.
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from common import CACHE, DCACHE, PUB, atomic_write_json, load_json  # noqa: E402

LISTINGS = os.path.join(CACHE, "wikivoyage_listings.json")
INTROS = os.path.join(DCACHE, "city_intros.json")


def _load_harvester():
    path = os.path.join(os.path.dirname(__file__), "..",
                        "harvest_wikivoyage_listings.py")
    pdir = os.path.dirname(os.path.abspath(path))
    if pdir not in sys.path:
        sys.path.insert(0, pdir)   # it imports pipeline_io as a flat module
    spec = importlib.util.spec_from_file_location("carta_wv_listings", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    wv = _load_harvester()
    dests = (load_json(os.path.join(PUB, "app_data.json")) or {}).get(
        "destinations", {})
    intros = load_json(INTROS, {}) or {}
    listings = load_json(LISTINGS, {}) or {}

    todo = []
    for did, d in dests.items():
        if d.get("tier") != "airport":
            continue
        rec = intros.get(did) or {}
        title = rec.get("title")
        if not title or rec.get("source") != "wikivoyage":
            continue
        if not args.refresh and (listings.get(did) or {}).get("city_sourced"):
            continue
        todo.append((did, title))
    if args.limit:
        todo = todo[: args.limit]
    print(f"[wv-city] {len(todo)} gateway records to re-point")

    ok = gone = fail = 0
    for i, (did, title) in enumerate(todo):
        res = wv.harvest_article(title)
        if res is None:
            fail += 1
        elif res == "gone":
            gone += 1
        else:
            res["title"] = title
            res["city_sourced"] = True
            listings[did] = res
            ok += 1
        time.sleep(0.6)
        if (i + 1) % 25 == 0:
            atomic_write_json(LISTINGS, listings)
            print(f"  {i + 1}/{len(todo)} ({ok} repointed)", flush=True)

    atomic_write_json(LISTINGS, listings)
    n = sum(len((listings.get(d) or {}).get("listings", [])) for d, _ in todo)
    print(f"[wv-city] done: {ok} repointed ({n} listings), {gone} gone, "
          f"{fail} failed")


if __name__ == "__main__":
    main()
