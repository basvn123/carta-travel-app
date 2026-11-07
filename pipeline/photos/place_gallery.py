"""Gallery pass for places below the gallery target (T1096, D9).

Tier: Scheduled (owner run; needs Wikimedia Commons)

A dossier gallery should hold GALLERY_TARGET photos (5) when Commons has
them. In GB, RO, FR and IT most places are below that. This pass finds the
shortfall from the shipped dossiers, asks Commons for photographs taken
near each short place (one geosearch request per place, with licence and
author metadata in the same answer), keeps only licensed ones and writes
them to cache/dossier/place_gallery.json. build_dossier.compose_gallery
appends them after its own candidates, behind the same licence gate and
the same not-a-photograph check, so nothing here can bypass the gates.

Owner decision: licensed photography only. A file ships only when
  - its licence allows reuse with credit (CC0, CC BY, CC BY-SA, public
    domain; pipeline/trails/photo_licence.reusable), and
  - it names an author when the licence owes one (photos/credit.owes_credit),
and the record keeps both, plus the licence URL and the file page.
Nothing is generated, nothing is scraped from outside Commons.

Usage, from the repo root:
    python pipeline/photos/place_gallery.py --report            # coverage, no network
    python pipeline/photos/place_gallery.py                     # the run (owner box)
    python pipeline/photos/place_gallery.py --fixtures DIR      # offline test run

Resumable: a finished place (even one with no result) is not asked again
unless --refresh. ASCII only, no em dashes.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_DOSSIER = os.path.join(ROOT, "pipeline", "dossier")
if _DOSSIER not in sys.path:
    sys.path.insert(0, _DOSSIER)


def _load(name, path):
    """Sibling modules by path: pipeline/photos and pipeline/trails hold
    names (derive, credit) that must not join sys.path of the dossier build."""
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


credit = _load("pg_credit", os.path.join(HERE, "credit.py"))
photo_licence = _load("pg_photo_licence", os.path.join(
    ROOT, "pipeline", "trails", "photo_licence.py"))
from common import (DCACHE, PUB, atomic_write_json, commons_filename,  # noqa: E402
                    file_page_url, load_json, norm_name)

OUT = os.path.join(DCACHE, "place_gallery.json")
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "CartaGallery/1.0 (https://carta-europetravel.com; "
                    "data@carta-europetravel.com)"}
PACE_S = 1.0

COUNTRIES = ("GB", "RO", "FR", "IT")
GALLERY_TARGET = 5          # "at least 5 when available" (HANDBOOK, Photo gallery)
STORE_MAX = 6               # candidates kept per place; compose_gallery caps at 8
MIN_EDGE = 500              # short edge, the gallery floor (GALLERY_MIN_EDGE)
MIN_LONG = 800
MAX_PER_AUTHOR = 2
GEO_LIMIT = 50
# Search radius in metres by place class. The API ceiling is 10000.
RADIUS_M = {"metro": 4000, "city": 3500, "town": 2500, "village": 2000,
            "area": 8000}
DEFAULT_RADIUS_M = 3000

JUNK_RE = re.compile(
    r"\b(map|mapa|carte|karte|logo|flag|coat[ _]of[ _]arms|blason|stemma|"
    r"locator|diagram|plan|panel|sign|signpost|plaque|poster|screenshot|"
    r"scan|document|stamp|banknote|coin|invoice|menu|ticket|cv|portrait)\b"
    r"|\.(svg|pdf|tif|tiff|gif|webm|ogv|ogg|djvu)$",
    re.I)
PHOTO_EXT_RE = re.compile(r"\.(jpe?g|png|webp)$", re.I)


# ------------------------------------------------------------- coverage

def load_places(dossier_dir=None, countries=COUNTRIES):
    """Every dossier of the countries as {id, name, iso2, class, lat, lon,
    files, n}. `files` are the Commons file names already in the gallery."""
    d = dossier_dir or os.path.join(PUB, "dossier")
    out = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        doc = load_json(os.path.join(d, fn), None)
        if not isinstance(doc, dict) or "place" not in doc:
            continue
        p = doc["place"]
        if p.get("iso2") not in countries:
            continue
        gal = doc.get("gallery") or []
        out.append({
            "id": doc.get("id") or fn[:-5], "name": p.get("name"),
            "iso2": p["iso2"], "class": p.get("class"),
            "lat": p.get("lat"), "lon": p.get("lon"),
            "files": {norm_name(commons_filename(g.get("url")) or "")
                      for g in gal if g.get("url")},
            "n": len(gal),
        })
    return out


def coverage(places, extra=None, target=GALLERY_TARGET):
    """Per country: places, how many reach the target, the average, with
    the stored extras counted in when `extra` ({id: [records]}) is given."""
    rows = {}
    for p in places:
        n = p["n"]
        if extra:
            have = p["files"]
            n += min(len([r for r in (extra.get(p["id"]) or {}).get("photos", [])
                          if norm_name(r["file"]) not in have]),
                     max(0, 8 - n))
        r = rows.setdefault(p["iso2"], {"places": 0, "at_target": 0, "photos": 0,
                                        "empty": 0})
        r["places"] += 1
        r["photos"] += n
        r["at_target"] += n >= target
        r["empty"] += n == 0
    for r in rows.values():
        r["pct"] = round(100 * r["at_target"] / max(1, r["places"]), 1)
        r["avg"] = round(r["photos"] / max(1, r["places"]), 2)
    return rows


def select_targets(places, target=GALLERY_TARGET):
    """Places below the target, emptiest first, then by id (deterministic)."""
    short = [p for p in places if p["n"] < target
             and isinstance(p.get("lat"), (int, float))
             and isinstance(p.get("lon"), (int, float))]
    return sorted(short, key=lambda p: (p["n"], p["iso2"], p["id"]))


# ------------------------------------------------------------- candidates

def geosearch_params(place):
    return {
        "action": "query", "format": "json", "formatversion": 2,
        "generator": "geosearch", "ggscoord": f"{place['lat']}|{place['lon']}",
        "ggsradius": min(10000, RADIUS_M.get(place.get("class"), DEFAULT_RADIUS_M)),
        "ggsnamespace": 6, "ggslimit": GEO_LIMIT, "ggsprimary": "all",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": 960,
        "iiextmetadatafilter": credit.EXTMETA_CREDIT + "|ImageDescription",
        "maxlag": 5,
    }


def http_fetch(params):
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params),
                                 headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _meta_value(meta, key):
    return (meta or {}).get(key, {}).get("value", "")


def to_record(page, place):
    """One Commons page -> a gallery record, or (None, reason)."""
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        return None, "no_imageinfo"
    title = page.get("title") or ""
    name = title[5:] if title.startswith("File:") else title
    if not PHOTO_EXT_RE.search(name) or JUNK_RE.search(name):
        return None, "not_a_photograph"
    if info.get("mime") not in (None, "image/jpeg", "image/png", "image/webp"):
        return None, "not_a_photograph"
    w, h = info.get("width") or 0, info.get("height") or 0
    if min(w, h) < MIN_EDGE or max(w, h) < MIN_LONG:
        return None, "too_small"
    meta = info.get("extmetadata") or {}
    lic = credit.clean(_meta_value(meta, "LicenseShortName"))
    if not photo_licence.reusable(lic):
        return None, "licence"
    rec = {
        "file": name.replace("_", " "),
        "url": info.get("thumburl") or info.get("url"),
        "w": w, "h": h,
        "author": credit.author_of(meta),
        "licence": lic,
        "licence_url": credit.clean(_meta_value(meta, "LicenseUrl")) or None,
        "page": info.get("descriptionurl") or file_page_url(name),
        "caption": place["name"],
    }
    if credit.attribution_required(meta) is False:
        rec["no_attribution_required"] = True
    if credit.owes_credit({"license": lic, "author": rec["author"],
                           "no_attribution_required":
                               rec.get("no_attribution_required")}):
        return None, "no_author"
    return rec, None


def score(rec, place):
    """Higher is better. Name in the file name is the strongest signal that
    a photograph shows the place; resolution and a landscape frame follow."""
    s = 0.0
    if norm_name(place["name"]) and norm_name(place["name"]) in norm_name(rec["file"]):
        s += 3.0
    long_edge = max(rec["w"], rec["h"])
    s += min(long_edge, 4000) / 4000.0
    if rec["w"] >= rec["h"]:
        s += 0.5
    return s


def pick(records, place, existing=(), store_max=STORE_MAX):
    """Best distinct photographs: not already in the gallery, at most
    MAX_PER_AUTHOR from one author, best first."""
    seen = set(existing)
    per_author, out = {}, []
    for rec in sorted(records, key=lambda r: (-score(r, place), r["file"])):
        key = norm_name(rec["file"])
        if key in seen:
            continue
        seen.add(key)
        a = rec.get("author") or ""
        if a and per_author.get(a, 0) >= MAX_PER_AUTHOR:
            continue
        per_author[a] = per_author.get(a, 0) + 1
        out.append(rec)
        if len(out) >= store_max:
            break
    return out


def harvest_place(place, fetch=http_fetch):
    """-> {status, photos, seen, dropped{reason: n}} for one place."""
    data = fetch(geosearch_params(place))
    pages = (data.get("query") or {}).get("pages") or []
    if isinstance(pages, dict):
        pages = list(pages.values())
    recs, dropped = [], {}
    for pg in pages:
        rec, why = to_record(pg, place)
        if rec:
            recs.append(rec)
        else:
            dropped[why] = dropped.get(why, 0) + 1
    need = max(0, 8 - place["n"])
    photos = pick(recs, place, place["files"], min(STORE_MAX, max(need, 1)))
    return {"status": "ok" if photos else "empty", "photos": photos,
            "seen": len(pages), "dropped": dropped}


# ------------------------------------------------------------- merge hook

def extras_for(store, dest_id):
    """What build_dossier.compose_gallery appends for one place: the stored
    records as candidate dicts carrying their own metadata."""
    rec = (store or {}).get(dest_id) or {}
    return [{"url": p["url"], "caption": p.get("caption"), "role": "commons_pass",
             "meta": {k: p[k] for k in ("author", "licence", "licence_url",
                                        "page", "w", "h") if p.get(k)}}
            for p in rec.get("photos", [])]


# ------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", default=",".join(COUNTRIES))
    ap.add_argument("--dossiers", help="dossier dir (default: shipped)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--max-minutes", type=float, default=0)
    ap.add_argument("--fixtures", help="offline: dir with {place id}.json answers")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    cc = tuple(args.countries.split(","))
    places = load_places(args.dossiers, cc)
    store = {} if args.refresh else (load_json(args.out, {}) or {})

    def show(label, rows):
        print(f"[place-gallery] {label}")
        for k in cc:
            r = rows.get(k)
            if r:
                print(f"  {k}: {r['at_target']}/{r['places']} at {GALLERY_TARGET}+ "
                      f"({r['pct']}%), avg {r['avg']}, empty {r['empty']}")

    show("gallery coverage now (shipped dossiers)", coverage(places))
    if args.report:
        if store:
            show("with the stored pass merged", coverage(places, store))
        return

    if args.fixtures:
        def fetch(params):
            pid = args._current
            return load_json(os.path.join(args.fixtures, f"{pid}.json"), {}) or {}
        pace = 0
    else:
        fetch, pace = http_fetch, PACE_S

    todo = [p for p in select_targets(places) if p["id"] not in store]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[place-gallery] {len(todo)} places to ask ({len(store)} stored)")
    t0 = time.time()
    for n, p in enumerate(todo):
        if args.max_minutes and (time.time() - t0) / 60 > args.max_minutes:
            print("[place-gallery] time budget reached, resumable")
            break
        args._current = p["id"]
        try:
            store[p["id"]] = harvest_place(p, fetch)
        except Exception as e:  # noqa: BLE001 - resumable, retried next run
            print(f"  {p['id']}: {e}")
            time.sleep(3)
            continue
        if pace:
            time.sleep(pace)
        if (n + 1) % 25 == 0:
            atomic_write_json(args.out, store)
            print(f"  {n + 1}/{len(todo)}", flush=True)
    atomic_write_json(args.out, store)
    show("gallery coverage with the pass merged", coverage(places, store))
    print(f"[place-gallery] -> {args.out}")


if __name__ == "__main__":
    main()
