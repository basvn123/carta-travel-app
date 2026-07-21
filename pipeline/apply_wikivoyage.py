"""Fold the Wikivoyage guide blurbs harvested by harvest_wikivoyage.py into
app_data.json.

Adds, for every destination with a cached hit:
  - dest.guide                 { text, title, url, source: "wikivoyage" }
  - meta.data_sources.wikivoyage  attribution entry (CC BY-SA)

Confirmed misses ({"miss": true}) are skipped. The blurb is a short intro
paragraph, so it ships straight to the app (sync-data.mjs passes unknown
destination fields through untouched). Idempotent: re-running refreshes from the
cache and clears the guide from any dest no longer in it.

Pipeline order:
    harvest_wikivoyage  ->  apply_wikivoyage  ->  sync-data (npm run data)

Usage:
    python apply_wikivoyage.py                 # patches the master dataset
    python apply_wikivoyage.py path/to/app_data.json [more.json ...]
"""
import json
import sys
from pathlib import Path

from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "wikivoyage.json"
DEFAULT_TARGETS = [ROOT / "app_data" / "app_data.json"]

DATA_SOURCE = {
    "provider": "Wikivoyage (the free worldwide travel guide)",
    "license": "CC BY-SA 3.0",
    "used_for": "short narrative 'why go here' intro blurb per destination",
}


def _load(path):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def patch(path, cache):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})

    applied = 0
    for did, dest in dests.items():
        rec = cache.get(did)
        if rec is None:
            continue                         # not in this cache run: leave existing guide
        if rec.get("miss") or not rec.get("extract"):
            dest.pop("guide", None)          # confirmed no guide: clear it (idempotent)
            continue
        dest["guide"] = {
            "text": rec["extract"],
            "title": rec["title"],
            "url": rec["url"],
            "source": "wikivoyage",
        }
        applied += 1

    data.setdefault("meta", {}).setdefault("data_sources", {})["wikivoyage"] = DATA_SOURCE
    atomic_write_json(path, data)
    print(f"  {path.name}: guide blurb on {applied}/{len(dests)} dests")


def main():
    cache = _load(CACHE)
    if not cache:
        print("No cache/wikivoyage.json - run harvest_wikivoyage.py first.")
        return
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    hits = sum(1 for v in cache.values() if not v.get("miss"))
    print(f"Applying Wikivoyage guide layer from {hits} cached blurbs "
          f"({len(cache)} resolved):")
    for t in targets:
        patch(t, cache)
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
