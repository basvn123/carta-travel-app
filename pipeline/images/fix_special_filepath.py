"""Rewrite Special:FilePath image URLs into real upload.wikimedia thumbs.

A commons.wikimedia.org/wiki/Special:FilePath/... URL is broken three ways in
this app at once: the served CSP only allows images from upload.wikimedia.org
so the card renders BLANK in production, lib/heroImage.js cannot splice a
srcset width into it, and it carries no dimensions for the crop pickers to
reason about. pipeline/apply_image_dims.py already repairs destination heroes
that arrived in this shape; this sweeps the two places the hero repair does
not reach, the POI pool (activities.items_full[].img in the master, which the
trip composer copies photographs out of) and the already published trips wire.

Resolution goes through the Commons imageinfo API rather than local path
hashing, the same way apply_image_dims does it, because the API answers with
the canonical thumb for local wiki files and odd formats too, and hands back
dimensions we would otherwise not have.

Usage, from the repo root:
    python pipeline/images/fix_special_filepath.py --dry-run
    python pipeline/images/fix_special_filepath.py
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import apply_image_dims as aid  # noqa: E402

MASTERS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
TRIPS_DIR = ROOT / "continent-app" / "public" / "trips"


def is_special(url):
    return isinstance(url, str) and "Special:FilePath" in url


def collect_titles(node, titles):
    if isinstance(node, dict):
        for val in node.values():
            if is_special(val):
                t = aid.file_title_from_url(val)
                if t:
                    titles.add(t)
            else:
                collect_titles(val, titles)
    elif isinstance(node, list):
        for item in node:
            collect_titles(item, titles)


def rewrite(node, resolved):
    """Swap every Special:FilePath string whose file resolved; count both the
    swapped and the unresolvable so nothing fails silently."""
    fixed = stuck = 0
    if isinstance(node, dict):
        for key, val in list(node.items()):
            if is_special(val):
                t = aid.file_title_from_url(val)
                hit = resolved.get(t)
                if hit:
                    node[key] = hit[0]
                    fixed += 1
                else:
                    stuck += 1
            else:
                f, s = rewrite(val, resolved)
                fixed += f
                stuck += s
    elif isinstance(node, list):
        for item in node:
            f, s = rewrite(item, resolved)
            fixed += f
            stuck += s
    return fixed, stuck


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = [p for p in MASTERS if p.exists()] \
        + sorted(TRIPS_DIR.glob("*.json")) \
        + sorted((TRIPS_DIR / "trip").glob("*.json")) \
        + sorted((ROOT / "cache" / "trips").glob("*.json"))

    loaded = []
    titles = set()
    for path in files:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        if "Special:FilePath" not in text:
            continue
        data = json.loads(text)
        collect_titles(data, titles)
        loaded.append((path, data))
    print("%d files carry Special:FilePath URLs, %d distinct files to resolve"
          % (len(loaded), len(titles)))
    if not titles:
        return
    if args.dry_run:
        for t in sorted(titles)[:20]:
            print("  " + t)
        return

    resolved = aid.resolve_thumbs(sorted(titles))
    print("resolved %d of %d" % (len(resolved), len(titles)))
    total_fixed = total_stuck = 0
    for path, data in loaded:
        fixed, stuck = rewrite(data, resolved)
        total_fixed += fixed
        total_stuck += stuck
        if fixed:
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False,
                          separators=(",", ":"))
            tmp.replace(path)
    print("rewrote %d URLs, %d unresolvable left in place"
          % (total_fixed, total_stuck))


if __name__ == "__main__":
    main()
