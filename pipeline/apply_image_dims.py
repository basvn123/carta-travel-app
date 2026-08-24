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

Run from the repo root:
    python pipeline/apply_image_dims.py              # join, fetch what is missing
    python pipeline/apply_image_dims.py --offline    # local join only, no network
    python pipeline/apply_image_dims.py --report     # what would change, no writes

The two numbers cost about 40 KB across 3,000 destinations before compression,
which is the price of never cropping a portrait into a letterbox again.

Everything ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
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

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50
DELAY_S = 0.25
BACKOFFS = [5, 15, 30]
HEADERS = {
    "User-Agent": "CartaTravelApp/1.0 (portfolio project; contact data@carta-europetravel.com)",
    "Accept": "application/json",
}


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


def fetch(params):
    url = COMMONS_API + "?" + urllib.parse.urlencode(params)
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


def fetch_dims(titles, meta):
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
        })
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


def main(argv):
    offline = "--offline" in argv
    report_only = "--report" in argv

    data = load_json(PRIMARY)
    meta = load_json(META_CACHE) if META_CACHE.exists() else {}
    dests = data.get("destinations") or {}

    wanted = {}
    for did, d in dests.items():
        img = d.get("image") or {}
        url = img.get("hires") or img.get("url")
        title = file_title_from_url(url)
        if title and "@" not in title:
            wanted[did] = title

    missing = sorted({t for t in wanted.values()
                      if t not in meta or not meta[t].get("width")})
    print(f"{len(dests)} destinations, {len(wanted)} heroes resolvable to a Commons file")
    print(f"{len(missing)} of those have no cached size")
    if missing and not offline and not report_only:
        got = fetch_dims(missing, meta)
        print(f"fetched {got} sizes")
        atomic_write_json(META_CACHE, meta)

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
    if not report_only and changed:
        atomic_write_json(PRIMARY, data)
        print(f"wrote {PRIMARY}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
