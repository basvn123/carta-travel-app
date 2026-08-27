"""Re-derive every cached landmark's kind from its real Wikidata types.

harvest_landmarks.py classified each item as it arrived and kept only the
kind, so a bug in the classifier could not be corrected without re-running
3,000 geo queries. One did: matching ALLOW fragments with `in` rather than on
word boundaries made "villa" match "village", and 17,078 of 45,249 landmarks
(38 percent) came out as palaces. Every village in Europe became a stately
home, and they crowded the highlight lists.

This pass fetches P31 for the cached QIDs in batches of 200, stores the type
labels ON the cached record, and re-runs the fixed classifier. Storing the
types is the real repair: the cache becomes re-decidable, so the next
classifier change costs nothing at all, which is the convention the features
layer already follows with its `tried` and `rejects` fields.

  python pipeline/dossier/reclassify_landmarks.py [--limit N] [--types-only]

Landmarks that no longer classify as a place are dropped.
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import DCACHE, atomic_write_json, load_json  # noqa: E402

OUT = os.path.join(DCACHE, "landmarks.json")
TYPES = os.path.join(DCACHE, "landmark_types.json")
WDQS = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "CartaDossier/1.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)",
      "Accept": "application/sparql-results+json"}
BATCH = 200
PACE_S = 1.0

QUERY = """
SELECT ?item (GROUP_CONCAT(DISTINCT ?tLabel; separator="|") AS ?types) WHERE {
  VALUES ?item { %s }
  ?item wdt:P31 ?t .
  ?t rdfs:label ?tLabel . FILTER(LANG(?tLabel) = "en")
}
GROUP BY ?item
"""


def _load_harvester():
    path = os.path.join(os.path.dirname(__file__), "harvest_landmarks.py")
    spec = importlib.util.spec_from_file_location("carta_landmarks", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sparql(query, tries=3):
    url = WDQS + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=180) as r:
                return json.load(r)["results"]["bindings"]
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            time.sleep(10 * (attempt + 1) if e.code in (429, 503) else 4)
        except Exception as e:  # noqa: BLE001
            last = str(e)[:80]
            time.sleep(5)
    raise RuntimeError(last or "sparql failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--types-only", action="store_true",
                    help="fetch and cache types, do not rewrite kinds")
    args = ap.parse_args()

    lm = _load_harvester()
    cache = load_json(OUT, {}) or {}
    types = load_json(TYPES, {}) or {}

    qids = sorted({r["qid"] for rows in cache.values() for r in rows
                   if r.get("qid") and r["qid"] not in types})
    if args.limit:
        qids = qids[: args.limit]
    print(f"[reclass] {len(qids)} QIDs to type ({len(types)} already cached)")

    for i in range(0, len(qids), BATCH):
        batch = qids[i:i + BATCH]
        values = " ".join(f"wd:{q}" for q in batch)
        try:
            rows = sparql(QUERY % values)
        except Exception as e:  # noqa: BLE001 - resumable
            print(f"  batch {i // BATCH}: {e}", flush=True)
            continue
        got = {}
        for r in rows:
            got[r["item"]["value"].rsplit("/", 1)[-1]] = r["types"]["value"]
        for q in batch:
            types[q] = got.get(q, "")     # cache the miss too, never refetch
        time.sleep(PACE_S)
        if (i // BATCH) % 10 == 0:
            atomic_write_json(TYPES, types)
            print(f"  {min(i + BATCH, len(qids))}/{len(qids)}", flush=True)

    atomic_write_json(TYPES, types)
    if args.types_only:
        print(f"[reclass] cached {len(types)} type rows")
        return

    changed = dropped = kept = 0
    for did, rows in cache.items():
        out = []
        for r in rows:
            blob = types.get(r.get("qid") or "")
            if blob is None:
                out.append(r)             # never typed; leave as harvested
                kept += 1
                continue
            kind = lm.classify(blob)
            if not kind:
                dropped += 1
                continue
            if kind != r.get("kind"):
                changed += 1
            r["kind"] = kind
            r["types"] = blob[:200]
            out.append(r)
            kept += 1
        cache[did] = out

    atomic_write_json(OUT, cache)
    total = sum(len(v) for v in cache.values())
    print(f"[reclass] {kept} kept ({changed} retyped), {dropped} dropped as "
          f"not-a-place -> {total} landmarks remain")


if __name__ == "__main__":
    main()
