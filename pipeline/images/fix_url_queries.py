"""Strip tracking query strings off every stored Commons image URL.

The Commons imageinfo API hands back thumbnails with ?utm_source=... stapled
on. Harmless in a browser, poison anywhere the URL is treated as a path: the
srcset builder splices widths into these strings and the query rides along
into every variant, and the hero image audit once produced a 404 exactly this
way, which is why pipeline/beaches/sources.py clean_url() exists. The beach,
lake, mountain and trail exporters already strip; 1219 destination heroes
harvested earlier did not get the same wash. This repairs them in place, in
the master and the served wire both, so the audit stops flagging them and the
srcset stays a pure path edit.

Touches image.url and image.hires on destinations, items_full[].img in the
master (the POI pool trips borrow their highlight photographs from), the
already published trips wire, whose cards and detail pages baked the dirty
URLs in at compose time, AND cache/wiki_images.json: the hero audit's patch
phase rewrites every dest.image from that cache, so a wash that skips it is
undone at the next monthly hero_audit run. The query string carries no
information: dropping it serves the identical bytes.

Usage, from the repo root:
    python pipeline/images/fix_url_queries.py --dry-run
    python pipeline/images/fix_url_queries.py
"""

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

TRIPS_DIR = ROOT / "continent-app" / "public" / "trips"
IMG_CACHE = ROOT / "cache" / "wiki_images.json"
# The composed trips, which the wire is written FROM. Washing only the wire
# leaves the rot upstream, and the next export puts it straight back.
TRIP_CACHE_DIR = ROOT / "cache" / "trips"


def wash(url):
    return str(url).split("?", 1)[0]


def repair(path, dry):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    heroes = pois = 0
    for d in data.get("destinations", {}).values():
        img = d.get("image")
        if img:
            for key in ("url", "hires"):
                val = img.get(key)
                if val and "?" in val:
                    img[key] = wash(val)
                    heroes += 1
        for poi in (d.get("activities") or {}).get("items_full") or []:
            val = poi.get("img")
            if val and "?" in val:
                poi["img"] = wash(val)
                pois += 1
    print("%-60s heroes %4d  poi imgs %4d%s"
          % (path.name + " (" + path.parent.name + ")", heroes, pois,
             "  [dry run]" if dry else ""))
    if not dry and (heroes or pois):
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        tmp.replace(path)
    return heroes + pois


def _wash_deep(node):
    """Wash every image URL field in a trips wire structure, whatever its
    nesting: img dicts use url, stops and highlights carry bare strings."""
    n = 0
    if isinstance(node, dict):
        for key, val in node.items():
            if key in ("url", "img", "cover", "hero_url") \
                    and isinstance(val, str) and "?" in val \
                    and "wikimedia.org" in val:
                node[key] = wash(val)
                n += 1
            else:
                n += _wash_deep(val)
    elif isinstance(node, list):
        for item in node:
            n += _wash_deep(item)
    return n


def repair_trips(dry):
    total = 0
    files = sorted(TRIPS_DIR.glob("*.json")) \
        + sorted((TRIPS_DIR / "trip").glob("*.json")) \
        + sorted(TRIP_CACHE_DIR.glob("*.json"))
    touched = 0
    for path in files:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        n = _wash_deep(data)
        if n:
            touched += 1
            total += n
            if not dry:
                tmp = path.with_suffix(".tmp")
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(data, fh, ensure_ascii=False,
                              separators=(",", ":"))
                tmp.replace(path)
    print("%-60s urls %6d in %d files%s"
          % ("trips wire", total, touched, "  [dry run]" if dry else ""))
    return total


def repair_cache(dry):
    if not IMG_CACHE.exists():
        return 0
    with open(IMG_CACHE, encoding="utf-8") as fh:
        data = json.load(fh)
    n = 0
    for entry in data.values():
        if not isinstance(entry, dict):
            continue
        for key in ("thumb", "original"):
            val = entry.get(key)
            if val and "?" in val:
                entry[key] = wash(val)
                n += 1
    print("%-60s urls %6d%s"
          % ("cache/wiki_images.json", n, "  [dry run]" if dry else ""))
    if not dry and n:
        tmp = IMG_CACHE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        tmp.replace(IMG_CACHE)
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    total = 0
    for path in TARGETS:
        if path.exists():
            total += repair(path, args.dry_run)
        else:
            print("missing: %s" % path)
    total += repair_trips(args.dry_run)
    total += repair_cache(args.dry_run)
    print("total washed: %d" % total)


if __name__ == "__main__":
    main()
