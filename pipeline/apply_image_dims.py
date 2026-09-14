"""
apply_image_dims.py - the shape of every hero photograph, into the master.

Why this exists
---------------
A card crops its photograph. How much it loses is decided by two numbers, the
card's box and the photograph's own shape, and until now the app only knew the
first one. So the country index picked its cover by rating alone and handed a
4:1 strip a 4:3 close-up, which draws a band through the middle of a doorway.
With `image.w` and `image.h` in the wire, the app can prefer the photograph
that survives the box it is about to be poured into (see countryCover in
browse/DestinationsTab.jsx).

Where the numbers come from
---------------------------
cache/hero_image_meta.json already holds Commons metadata for 14k files,
written by audit_hero_images.py's check phase, and it carries width and height.
So the common case is a pure local join, no network at all. Anything missing
(a hero replaced since the last audit, a local-wiki upload) is fetched in
batches of 50 from the same API the audit uses.

A second, smaller job rides along, because it is the same lookup: heroes whose
URL is a commons.wikimedia.org "Special:FilePath" redirect rather than a real
upload.wikimedia.org thumbnail. Thirteen of them arrived that way from the
local-language image pass, and they are broken in three ways at once. The
served CSP allows img-src from upload.wikimedia.org and not from
commons.wikimedia.org, so those cards are BLANK in production while looking
perfect on a dev server that sends no CSP (Luxembourg, Monaco, San Marino,
Malta, Jersey, the Isle of Man). lib/heroImage.js cannot build a srcset from
them, so a phone downloads the 960px rendering for a 130px strip. And nothing
can read their size, so the cover picker has to guess their shape. Resolving
each one to its canonical thumb fixes all three.

Order matters: run this AFTER audit_hero_images.py patch, never before. That
phase rewrites every dest.image from cache/wiki_images.json, and although the
URL repair below now writes the cache too, the w/h are the master's alone.

Run from the repo root:
    python pipeline/apply_image_dims.py              # join, fetch what is missing
    python pipeline/apply_image_dims.py --offline    # local join only, no network
    python pipeline/apply_image_dims.py --report     # what would change, no writes

The two numbers cost about 50 KB across 3,000 destinations before compression,
which is the price of never cropping a portrait into a letterbox again.

Everything ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = ROOT / "app_data" / "app_data.json"
META_CACHE = ROOT / "cache" / "hero_image_meta.json"
IMG_CACHE = ROOT / "cache" / "wiki_images.json"   # what harvest_images.patch() writes from

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50
DELAY_S = 0.25
BACKOFFS = [5, 15, 30]
HEADERS = {
    "User-Agent": "CartaTravelApp/1.0 (portfolio project; contact data@carta-europetravel.com)",
    "Accept": "application/json",
}


# "en@File:Casa de la Vall 4.JPG": a hero uploaded to a language wiki rather
# than to Commons, tagged by file_title_from_url with the wiki it lives on.
LOCAL_TAG = re.compile(r"^([a-z][a-z0-9-]{1,11})@File:")


def file_title_from_url(url):
    """The Commons file behind a thumbnail or an original URL.

    Deliberately the same rules as audit_hero_images.file_title_from_url: the
    two scripts read the same cache, so they have to agree on the key. A local
    wiki upload comes back tagged 'en@File:...' and is skipped here rather than
    asked for on the wrong API.
    """
    if not url:
        return None
    path = urllib.parse.urlparse(url).path
    if "Special:FilePath" in path:
        name = urllib.parse.unquote(path.split("Special:FilePath/")[-1]).strip("/")
        return ("File:" + name.replace("_", " ")) if name else None
    parts = [p for p in path.split("/") if p]
    if "wikipedia" not in parts:
        return None
    i = parts.index("wikipedia")
    if len(parts) <= i + 1:
        return None
    project = parts[i + 1]
    rest = parts[i + 2:]
    if rest and rest[0] == "thumb":
        rest = rest[1:]
    if len(rest) < 3:
        return None
    name = urllib.parse.unquote(rest[2])
    title = "File:" + name.replace("_", " ")
    return title if project == "commons" else f"{project}@{title}"


def fetch(params, api=COMMONS_API):
    url = api + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            time.sleep(back)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if i == len(BACKOFFS):
                print(f"  give up: {e}")
                return None
    return None


def fetch_dims(titles, meta, api=COMMONS_API):
    """Fill `meta` with {width,height} for any of `titles` it does not hold."""
    todo = [t for t in titles if t not in meta or not meta[t].get("width")]
    if not todo:
        return 0
    got = 0
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        data = fetch({
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "size|mime",
            "titles": "|".join(chunk),
        }, api=api)
        time.sleep(DELAY_S)
        for page in ((data or {}).get("query") or {}).get("pages") or []:
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("width"):
                continue
            row = meta.setdefault(page.get("title"), {})
            row["width"] = info.get("width")
            row["height"] = info.get("height")
            row["mime"] = info.get("mime")
            got += 1
        print(f"  fetched {min(i + BATCH, len(todo))}/{len(todo)}")
    return got


def resolve_thumbs(titles, width=960):
    """{file title -> (thumb url, original url, w, h)} from the Commons API.

    iiurlwidth asks for the rendering the wire wants, and the reply carries the
    canonical upload.wikimedia.org path for it. The query string is stripped:
    Commons hangs a utm_source on these URLs, and splicing a thumb path around
    one of those produced 400s on 382 heroes the last time it went unnoticed.
    """
    out = {}
    for i in range(0, len(titles), BATCH):
        chunk = titles[i:i + BATCH]
        data = fetch({
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url|size",
            "iiurlwidth": str(width),
            "titles": "|".join(chunk),
        })
        time.sleep(DELAY_S)
        for page in ((data or {}).get("query") or {}).get("pages") or []:
            info = (page.get("imageinfo") or [{}])[0]
            thumb = (info.get("thumburl") or "").split("?")[0]
            full = (info.get("url") or "").split("?")[0]
            if thumb.startswith("https://upload.wikimedia.org/"):
                out[page.get("title")] = (thumb, full, info.get("width"), info.get("height"))
    return out


def repair_urls(dests, report_only=False):
    """Heroes pointing at a Special:FilePath redirect, rewritten to the thumb
    the app can actually load, resize and measure.

    Both the master AND cache/wiki_images.json, because the cache is what
    harvest_images.patch() rewrites the master FROM. Repairing only the master
    is undone by the next patch, which is exactly what happened the first time
    this ran: thirteen URLs fixed, one hero audit later, thirteen URLs back.
    """
    broken = {}
    for did, d in dests.items():
        url = (d.get("image") or {}).get("url") or ""
        if "upload.wikimedia.org" in url or not url:
            continue
        title = file_title_from_url(url)
        if title and not LOCAL_TAG.match(title):
            broken[did] = title
    if not broken:
        print("no hero points at a redirect")
        return 0
    print(f"{len(broken)} heroes point at a redirect the served CSP blocks")
    if report_only:
        for did, title in list(broken.items())[:20]:
            print(f"  {dests[did].get('city')} <- {title}")
        return 0
    resolved = resolve_thumbs(sorted(set(broken.values())))
    img_cache = load_json(IMG_CACHE, {}) if IMG_CACHE.exists() else {}
    fixed = 0
    cached = 0
    for did, title in broken.items():
        hit = resolved.get(title)
        if not hit:
            # A file Commons does not have: a rename, a deletion, or a local
            # upload on a language wiki. audit_hero_images.py fix --only <id>
            # is what re-photographs those; this pass leaves them alone rather
            # than guessing.
            print(f"  unresolved, needs a new photograph: {dests[did].get('city')} <- {title}")
            continue
        thumb, full, w, h = hit
        img = dests[did]["image"]
        img["url"] = thumb
        if full:
            img["hires"] = full
        if w and h:
            img["w"] = w
            img["h"] = h
        fixed += 1
        entry = img_cache.get(did)
        if isinstance(entry, dict) and "Special:FilePath" in (entry.get("thumb") or ""):
            entry["thumb"] = thumb
            if full:
                entry["original"] = full
            cached += 1
    if cached:
        atomic_write_json(IMG_CACHE, img_cache)
    print(f"rewrote {fixed} hero URLs to upload.wikimedia.org "
          f"({cached} of them in cache/wiki_images.json too, so a patch keeps them)")
    return fixed


def main(argv):
    offline = "--offline" in argv
    report_only = "--report" in argv

    data = load_json(PRIMARY)
    meta = load_json(META_CACHE) if META_CACHE.exists() else {}
    dests = data.get("destinations") or {}

    repaired = 0 if offline else repair_urls(dests, report_only=report_only)

    # Commons files, and the handful of heroes uploaded to a language wiki
    # instead (Casa de la Vall lives on en.wikipedia). Those are asked for on
    # their own wiki: Commons answers "missing" for a file it does not hold,
    # and an unmeasured hero makes the cover picker guess at its shape.
    wanted = {}
    local = {}
    for did, d in dests.items():
        img = d.get("image") or {}
        url = img.get("hires") or img.get("url")
        title = file_title_from_url(url)
        if not title:
            continue
        # The project tag is a prefix, not any old at-sign: Commons has files
        # with an @ in the NAME ("File:Village @ dusk.jpg"), and splitting on
        # those asked "https://Village .wikipedia.org" for their size.
        tag = LOCAL_TAG.match(title)
        if tag:
            local[did] = (tag.group(1), title[len(tag.group(1)) + 1:])
        else:
            wanted[did] = title

    missing = sorted({t for t in wanted.values()
                      if t not in meta or not meta[t].get("width")})
    print(f"{len(dests)} destinations, {len(wanted)} heroes resolvable to a Commons file")
    print(f"{len(missing)} of those have no cached size")
    if missing and not offline and not report_only:
        got = fetch_dims(missing, meta)
        print(f"fetched {got} sizes")
        atomic_write_json(META_CACHE, meta)

    # The local-wiki ones, one call per wiki, under a key that says where they
    # live so a later Commons pass cannot collide with them.
    if local and not offline and not report_only:
        by_lang = {}
        for did, (lang, bare) in local.items():
            by_lang.setdefault(lang, set()).add(bare)
        for lang, titles in by_lang.items():
            api = f"https://{lang}.wikipedia.org/w/api.php"
            local_meta = {}
            fetch_dims(sorted(titles), local_meta, api=api)
            for t, row in local_meta.items():
                meta[f"{lang}@{t}"] = row
            print(f"  {lang}.wikipedia: {len(local_meta)} of {len(titles)} sized")
        atomic_write_json(META_CACHE, meta)
    for did, (lang, bare) in local.items():
        wanted[did] = f"{lang}@{bare}"

    stats = Counter()
    changed = 0
    for did, title in wanted.items():
        row = meta.get(title) or {}
        w, h = row.get("width"), row.get("height")
        if not w or not h:
            stats["unknown"] += 1
            continue
        img = dests[did]["image"]
        if img.get("w") == w and img.get("h") == h:
            stats["already"] += 1
            continue
        if not report_only:
            img["w"] = w
            img["h"] = h
        changed += 1
        stats["written"] += 1

    # What the two card boxes would keep of each frame, so a re-run says
    # whether the catalogue got better or worse rather than only bigger.
    def visible(ratio, box):
        return min(ratio, box) / max(ratio, box)

    strip = []
    card = []
    for did, title in wanted.items():
        row = meta.get(title) or {}
        if not row.get("width") or not row.get("height"):
            continue
        ar = row["width"] / row["height"]
        strip.append(visible(ar, 4.0))       # the country index strip
        card.append(visible(ar, 2.4))        # a destination card
    if strip:
        print(f"\nof {len(strip)} measured heroes, the average frame that survives")
        print(f"  a 4:1 country strip:      {sum(strip) / len(strip) * 100:.1f}%")
        print(f"  a 2.4:1 destination card: {sum(card) / len(card) * 100:.1f}%")
        print(f"  wide enough for the strip (2:1 or wider): "
              f"{sum(1 for v in strip if v >= 0.5)}")

    print(f"\n{changed} destinations {'would get' if report_only else 'got'} w/h"
          f"  ({stats['already']} already had them, {stats['unknown']} unknown)")
    changed += repaired
    if not report_only and changed:
        atomic_write_json(PRIMARY, data)
        print(f"wrote {PRIMARY}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
