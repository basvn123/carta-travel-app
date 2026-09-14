"""
Resolve TASL for dossier images that none of the existing licence caches know.

Scans every built dossier under continent-app/public/dossier/ for images that
carry no licence (gallery entries, highlight photos, nearby thumbs), asks the
Commons API for extmetadata in batches of 50 titles, and writes the answers to
cache/dossier/licences.json keyed by plain filename. Re-running
build_dossier.py afterwards picks the fills up through TaslStore and flips
ok_print on everything that resolved to a redistribution-safe licence.

Resumable: known filenames (even failed lookups, kept as {"licence": null})
are never asked again unless --refresh. Paced politely; identifies itself
with a contact address per Wikimedia API etiquette.

Usage: python pipeline/dossier/fill_licences.py [--limit N] [--refresh]
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    DCACHE, PUB, atomic_write_json, commons_filename, load_json,
)

API = "https://commons.wikimedia.org/w/api.php"
UA = "CartaDossier/1.0 (https://carta-europetravel.com; bas.vannieuwenhuyse123@gmail.com)"
PACE_S = 0.6
FILL_PATH = os.path.join(DCACHE, "licences.json")

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(s):
    return html.unescape(TAG_RE.sub("", s or "")).strip()


def wanted_filenames():
    out_dir = os.path.join(PUB, "dossier")
    names = set()
    if not os.path.isdir(out_dir):
        return names

    def visit(img):
        if isinstance(img, dict) and img.get("url") and not img.get("licence"):
            name = commons_filename(img["url"])
            if name:
                names.add(name)

    for fn in os.listdir(out_dir):
        if not fn.endswith(".json") or fn == "index.json":
            continue
        d = load_json(os.path.join(out_dir, fn), {})
        for g in d.get("gallery", []):
            visit(g)
        for h in d.get("highlights", []):
            visit(h.get("image"))
        for rows in (d.get("nearby") or {}).values():
            for f in rows:
                if f.get("thumb") and not f.get("thumb_ok_print"):
                    name = commons_filename(f["thumb"])
                    if name:
                        names.add(name)
        for t in d.get("trips", []):
            visit(t.get("image"))
    return names


def fetch_batch(titles):
    params = {
        "action": "query", "format": "json",
        "prop": "imageinfo", "iiprop": "extmetadata|size",
        "titles": "|".join("File:" + t for t in titles),
    }
    req = urllib.request.Request(
        API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    out = {}
    for page in (data.get("query", {}).get("pages", {}) or {}).values():
        title = (page.get("title") or "")[5:]
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}

        def val(key):
            v = meta.get(key, {}).get("value")
            return strip_html(v) if isinstance(v, str) else None

        rec = {
            "licence": val("LicenseShortName") or None,
            "licence_url": val("LicenseUrl") or None,
            "author": val("Artist") or None,
            "credit": val("Credit") or None,
            "width": info.get("width"), "height": info.get("height"),
        }
        restrictions = val("Restrictions")
        if restrictions:
            rec["restrictions"] = restrictions
        out[title] = rec
    # anything the API did not return stays recorded as a miss
    for t in titles:
        out.setdefault(t, {"licence": None})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    fill = {} if args.refresh else (load_json(FILL_PATH, {}) or {})
    todo = sorted(n for n in wanted_filenames() if n not in fill)
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} filenames to resolve ({len(fill)} already cached)")

    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        try:
            fill.update(fetch_batch(batch))
        except Exception as e:  # noqa: BLE001 - keep the run alive, retry next run
            print(f"  batch {i // 50}: {e}")
            time.sleep(5)
            continue
        if (i // 50) % 5 == 0:
            atomic_write_json(FILL_PATH, fill)
            print(f"  {i + len(batch)}/{len(todo)}")
        time.sleep(PACE_S)

    atomic_write_json(FILL_PATH, fill)
    ok = sum(1 for v in fill.values() if v.get("licence"))
    print(f"done: {len(fill)} cached, {ok} with a licence")


if __name__ == "__main__":
    main()
