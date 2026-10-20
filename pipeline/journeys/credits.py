"""
Tier: Scheduled (run by build_wire.py after it writes the wire; also on its own)

Credit every photograph on the journeys wire with its author and licence.

The journeys harvest (build_wire.py) takes each trip's photographs from the
Wikipedia API: lead images, which come with a page and a place name but no
author and no licence. The trip page's gallery (PhotoGallery.jsx) prints the
credit line under each photograph from `author` and `licence` and links it to
`page`, as every other page in the app does, so 253 of the 316 photographs on
the 2026-10-15 wire showed a place name and nothing else (T435, row T435-b).

This step fills the two fields from what the repo already knows, through the
dossier's TaslStore (every licence cache the pipeline keeps, read only), and
asks the Commons API for the rest in batches of 50 titles. New answers go to
cache/journey_licences.json, keyed by file name; a file Commons does not know
is kept there as {"licence": null} and never asked again unless --refresh.
A credited photograph's `page` becomes its Commons file page, the source the
licence is read from. The place name in `credit` is the caption and stays.

Idempotent: a photograph that already carries both fields is left alone, and
a wire file is only rewritten when one of its photographs changed, in the
same JSON shape build_wire.py writes.

Usage:
  python pipeline/journeys/credits.py              # fill and rewrite the wire
  python pipeline/journeys/credits.py --no-fetch   # caches only, no network
  python pipeline/journeys/credits.py --check      # report, write nothing

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "dossier"))
from common import TaslStore, clean_author, commons_filename, file_page_url  # noqa: E402
from fill_licences import UA, strip_html  # noqa: E402

WIRE = ROOT / "continent-app" / "public" / "journeys"
CACHE = ROOT / "cache" / "journey_licences.json"
PACE_S = 0.6
# upload.wikimedia.org/wikipedia/<wiki>/...: "commons", or a language wiki's
# own upload (two of the 2026-10-15 heroes are English Wikipedia files).
WIKI_RE = re.compile(r"upload\.wikimedia\.org/wikipedia/([a-z-]+)/")


def wiki_of(url):
    m = WIKI_RE.search(url or "")
    return m.group(1) if m else "commons"


def api_for(wiki):
    return ("https://commons.wikimedia.org/w/api.php" if wiki == "commons"
            else f"https://{wiki}.wikipedia.org/w/api.php")


def file_page(wiki, name):
    if wiki == "commons":
        return file_page_url(name)
    return f"https://{wiki}.wikipedia.org/wiki/File:" + urllib.parse.quote(
        name.replace(" ", "_"), safe="()_,.-'!&")


def cache_key(wiki, name):
    return name if wiki == "commons" else f"{wiki}:{name}"


def fetch_batch(wiki, titles):
    """extmetadata for up to 50 file names on one wiki -> {name: record}."""
    params = {"action": "query", "format": "json", "prop": "imageinfo",
              "iiprop": "extmetadata", "titles": "|".join("File:" + t for t in titles)}
    req = urllib.request.Request(api_for(wiki) + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    out = {}
    for page in (data.get("query", {}).get("pages", {}) or {}).values():
        meta = ((page.get("imageinfo") or [{}])[0]).get("extmetadata") or {}

        def val(key):
            v = meta.get(key, {}).get("value")
            return strip_html(v) if isinstance(v, str) else None

        out[(page.get("title") or "")[5:]] = {
            "licence": val("LicenseShortName") or None,
            "licence_url": val("LicenseUrl") or None,
            "author": val("Artist") or None,
        }
    for t in titles:
        out.setdefault(t, {"licence": None})
    return out


def photos_in(doc):
    """Every photograph dict in one wire file: an index, a style's cards or
    a journey (hero, gallery, highlights and days)."""
    out = []

    def take(img):
        if isinstance(img, dict) and img.get("url"):
            out.append(img)

    for tp in doc.get("types") or []:          # index.json
        take(tp.get("hero"))
    for card in doc.get("trips") or []:        # type/<slug>.json
        take(card.get("hero"))
        for p in card.get("photos") or []:
            take(p)
    take(doc.get("hero"))                       # journey/<id>.json
    for p in doc.get("photos") or []:
        take(p)
    for h in doc.get("highlights") or []:
        take((h or {}).get("photo"))
    for d in doc.get("itinerary") or []:
        take((d or {}).get("photo"))
    return out


LICENCE_RE = re.compile(r"^cc[- ]by((?:-sa|-nd|-nc)*)[- ](\d\.\d)(?:[- ]([a-z]{2}))?$", re.I)


def tidy_licence(s):
    """Write a Creative Commons name the way Commons does ("CC BY-SA 3.0"):
    language wikis answer "Cc-by-sa-3.0" or "CC-BY-SA-4.0" for the same thing."""
    if not s:
        return s
    m = LICENCE_RE.match(s.strip())
    if not m:
        return s.strip()
    parts = "BY" + m.group(1).upper()
    return f"CC {parts} {m.group(2)}" + (f" {m.group(3).lower()}" if m.group(3) else "")


def tidy_author(s):
    """clean_author, then the wiki furniture a credit line does not need:
    a trailing "(talk)" and a "User:" prefix on a bare user name."""
    s = clean_author(s)
    if not s:
        return s or None
    s = re.sub(r"\s*\((?:talk|discussion|Diskussion|overleg)\)\s*$", "", s, flags=re.I)
    s = re.sub(r"^[Uu]ser:\s*", "", s)
    return s.strip() or None


def needs_credit(img):
    # The licence is what makes a photograph usable; an author is printed when
    # the file names one (a public-domain file often does not).
    return not img.get("licence")


def load_cache():
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True),
                     encoding="utf-8")


def resolve(img, store, cache):
    """-> {author, licence, page} for one photograph, or None."""
    wiki = wiki_of(img["url"])
    if wiki == "commons":
        rec = store.lookup(img["url"])
        if rec and rec.get("licence"):
            return {"author": rec.get("author"), "licence": rec["licence"], "page": rec.get("page")}
    name = commons_filename(img["url"])
    hit = cache.get(cache_key(wiki, name)) if name else None
    if hit and hit.get("licence"):
        return {"author": clean_author(hit.get("author")), "licence": hit["licence"],
                "page": file_page(wiki, name)}
    return None


def fetch_missing(wanted, cache, refresh=False):
    """wanted: {(wiki, name)}. Asks each wiki for the names it has not answered."""
    todo = sorted(w for w in wanted if refresh or cache_key(*w) not in cache)
    by_wiki = {}
    for wiki, name in todo:
        by_wiki.setdefault(wiki, []).append(name)
    for wiki, names in by_wiki.items():
        for i in range(0, len(names), 50):
            batch = names[i:i + 50]
            try:
                got = fetch_batch(wiki, batch)
            except Exception as e:  # noqa: BLE001 - keep the run alive; the next run retries
                print(f"  {wiki} batch {i // 50}: {e}", file=sys.stderr)
                time.sleep(5)
                continue
            for name, rec in got.items():
                cache[cache_key(wiki, name)] = rec
            time.sleep(PACE_S)
    return len(todo)


def credit_wire(out_dir=WIRE, allow_fetch=True, write=True, refresh=False):
    """Fill author and licence on every photograph under out_dir.
    Returns a summary dict."""
    out_dir = Path(out_dir)
    files = [out_dir / "index.json", *sorted((out_dir / "type").glob("*.json")),
             *sorted((out_dir / "journey").glob("*.json"))]
    docs = {}
    for f in files:
        if f.exists():
            docs[f] = json.loads(f.read_text(encoding="utf-8"))
    store = TaslStore()
    cache = load_cache()

    def unresolved():
        names = set()
        for doc in docs.values():
            for img in photos_in(doc):
                if needs_credit(img) and not resolve(img, store, cache):
                    name = commons_filename(img["url"])
                    if name:
                        names.add((wiki_of(img["url"]), name))
        return names

    asked = 0
    if allow_fetch:
        asked = fetch_missing(unresolved(), cache, refresh=refresh)
        if asked and write:
            save_cache(cache)

    total = credited = filled = changed_files = 0
    missing = []
    for f, doc in docs.items():
        changed = False
        for img in photos_in(doc):
            total += 1
            if needs_credit(img):
                rec = resolve(img, store, cache)
                if not rec:
                    missing.append(img["url"])
                    continue
                img["author"] = rec["author"] or img.get("author") or None
                img["licence"] = rec["licence"]
                if rec.get("page"):
                    img["page"] = rec["page"]
                filled += 1
                changed = True
            credited += 1
            # One spelling for every credit, the filled and the inherited alike.
            for key, tidy in (("author", tidy_author), ("licence", tidy_licence)):
                if img.get(key) and tidy(img[key]) != img[key]:
                    img[key] = tidy(img[key])
                    changed = True
        if changed:
            changed_files += 1
            if write:
                # build_wire.py writes json.dumps(..., ensure_ascii=False)
                f.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return {"photos": total, "credited": credited, "filled": filled,
            "files_rewritten": changed_files if write else 0,
            "asked_commons": asked, "missing": missing}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="a wire folder other than continent-app/public/journeys")
    ap.add_argument("--no-fetch", action="store_true", help="caches only; never touch the network")
    ap.add_argument("--check", action="store_true", help="report only; write nothing")
    ap.add_argument("--refresh", action="store_true", help="ask Commons again for every file name")
    args = ap.parse_args()
    s = credit_wire(Path(args.out) if args.out else WIRE, allow_fetch=not (args.no_fetch or args.check),
                    write=not args.check, refresh=args.refresh)
    print(f"{s['credited']}/{s['photos']} photographs credited "
          f"({s['filled']} filled now, {s['files_rewritten']} files rewritten, "
          f"{s['asked_commons']} file names asked of Commons)")
    for url in s["missing"][:20]:
        print(f"  ! no licence found: {url}")
    if len(s["missing"]) > 20:
        print(f"  ! and {len(s['missing']) - 20} more")
    return 1 if args.check and s["missing"] else 0


if __name__ == "__main__":
    sys.exit(main())
