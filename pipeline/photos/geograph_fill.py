"""Fill the listed-tier photo gap in GB and IE from Geograph.

The gap this closes is not the scored rows: those are at 100 per cent
already. It is the `listed` tier, the rows verified to exist and named but
never scored, which ship as map cards carrying
`{"k": "no_photo_map_card"}`. 3,745 of them had no photograph, and a live
probe of Commons put the honestly recoverable share of that at about 18
per cent, because most of what Commons holds near those coordinates
asserts nothing about the subject.

Geograph is the exception, and only for GB and IE: a twenty-year project
to photograph every OS grid square, with contributors who title the
square's SUBJECT. On the GB/IE beach gap it name-matches 64 per cent
against Commons' 20.

The evidence rule is the one the rest of the pipeline already uses, not a
new one. A candidate whose title names the beach, lake or mountain is
`name`, which may lead a card. Everything else is `geo`, which
`relevance.NEVER_HERO` bars from leading, so this module simply does not
take it: a listed row has no score to argue with, and a photograph of the
next cove is then the whole of what the card claims.

No API key. `CARTA_GEOGRAPH_KEY` is documented in geograph.py but the
syndicator answers unauthenticated, and discovery here comes from the
local sqlite anyway (8.36M rows, built by `geograph.py ingest`).

    python pipeline/photos/geograph_fill.py --layer beaches --dry-run
    python pipeline/photos/geograph_fill.py --layer beaches --apply

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import geograph  # noqa: E402

# Geograph covers Britain and Ireland and nothing else. Asking it about a
# Norwegian beach is not an error, it is just always empty, so the country
# list is a guard against wasted work rather than against a wrong answer.
COUNTRIES = ("GB", "IE", "IM", "JE", "GG")

LAYERS = {
    "beaches": {"rich_key": "beaches", "wire_key": "beaches"},
    "lakes": {"rich_key": "lakes", "wire_key": "lakes"},
    "mountains": {"rich_key": "peaks", "wire_key": "mountains"},
}

# How far from the row's coordinate a photograph may have been taken. The
# beach spot-check landed almost everything inside 600 m; 2 km is generous
# enough for a long strand or a big lake without reaching the next valley.
RADIUS_KM = 2.0

# A short name matches too much. "Sand", "Hov" and "Ayre" are real row
# names in the store and each of them appears inside dozens of unrelated
# Geograph titles, so anything under this length is refused rather than
# guessed at.
MIN_NAME_CHARS = 5

# Geograph titles are prefixed with the grid square ("SO8001 : Woodchester
# Mansion"). The prefix is a coordinate, never a subject claim, so it is
# stripped before the name test to stop a grid reference matching a name.
GRID_PREFIX_RE = re.compile(r"^\s*[A-Z]{1,2}\d{2,6}\s*:\s*")

# Titles that describe a document or a sign rather than a view. The same
# refusal the Commons path makes: a photograph of an information board
# about a beach is not a photograph of the beach.
BAD_TITLE = ("map of", "plan of", "diagram", "information board",
             "notice board", "sign for", "signpost", "coat of arms",
             "logo", "memorial plaque", "datestone")

LICENCE = "CC BY-SA 2.0"
LICENCE_URL = "https://creativecommons.org/licenses/by-sa/2.0/"

# The syndicator hands back a 120x120 thumb. Dropping the size suffix
# gives the full-size original, which 200s on every shard; _213x160 also
# exists, while _640x480 and _1024x768 are 404.
THUMB_SUFFIX_RE = re.compile(r"_(\d+x\d+)(\.[a-zA-Z]+)$")


def fold(text):
    """Lowercase, strip accents, drop everything but letters and digits.

    NFKD leaves o-slash, ae and l-stroke undecomposed, which is why the
    explicit table is here and not left to unicodedata alone.
    """
    text = (text or "").lower()
    for a, b in (("ø", "o"), ("æ", "ae"), ("å", "a"),
                 ("ł", "l"), ("ß", "ss"), ("ð", "d"),
                 ("þ", "th")):
        text = text.replace(a, b)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", text)


def strip_grid(title):
    return GRID_PREFIX_RE.sub("", title or "").strip()


def names_of(row):
    """Every name the row is known by, longest first.

    A row often carries a local name as well as the English one, and
    Geograph contributors use either. Both are legitimate subject claims.
    """
    out = []
    for key in ("name", "name_local", "nameLocal"):
        val = row.get(key)
        if isinstance(val, str) and val.strip():
            out.append(val.strip())
    for val in (row.get("names") or []):
        if isinstance(val, str) and val.strip():
            out.append(val.strip())
    seen, uniq = set(), []
    for val in sorted(out, key=len, reverse=True):
        folded = fold(val)
        if len(folded) >= MIN_NAME_CHARS and folded not in seen:
            seen.add(folded)
            uniq.append(val)
    return uniq


def title_names_subject(title, names):
    """True when the title makes a claim about THIS place.

    The grid prefix is stripped first so a grid reference can never be the
    thing that matches.
    """
    body = strip_grid(title)
    low = body.lower()
    if any(bad in low for bad in BAD_TITLE):
        return False
    folded = fold(body)
    return any(fold(n) in folded for n in names)


def full_size(thumb_url):
    """The original behind a sized thumbnail URL, or the input unchanged."""
    if not thumb_url:
        return ""
    return THUMB_SUFFIX_RE.sub(r"\2", thumb_url)


# Newer uploads carry a 1024 px rendition, older ones do not and 404. The
# unsuffixed original is always present but is often only 640 px on the
# long edge, so the large size is tried first and verified rather than
# assumed: shipping a 404 into the wire would print a broken card.
LARGE_SUFFIX = "_1024x1024"


def _head_ok(url, timeout=20):
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": geograph.UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def photo_url(gid, thumb_url="", probe=True):
    """The best available rendition for this photo.

    Prefer rewriting the syndicator's thumb: it carries the content hash,
    which cannot be reconstructed from the id alone.
    """
    base = full_size(thumb_url)
    if not base:
        return ""
    if not probe:
        return base
    stem, dot, ext = base.rpartition(".")
    large = f"{stem}{LARGE_SUFFIX}{dot}{ext}" if dot else ""
    if large and _head_ok(large):
        return large
    return base


def candidates_for(row, radius_km=RADIUS_KM):
    """Geograph rows near this place whose title names it, nearest first.

    Discovery is the local sqlite, so this costs no network call and can
    be run over the whole store. The syndicator is only asked about the
    rows that matched, in `resolve`.
    """
    names = names_of(row)
    if not names:
        return []
    lat, lon = row.get("lat"), row.get("lon")
    if lat is None or lon is None:
        return []
    hits = []
    for cand in geograph.near(lat, lon, radius_km):
        if title_names_subject(cand.get("title", ""), names):
            hits.append(cand)
    return hits


# The photo page carries the same three facts as the syndicator, in RDFa
# that Geograph publishes precisely so the attribution can be read
# correctly: the image URL, the photographer, and the licence.
PAGE_IMG_RE = re.compile(
    r"https://s\d\.geograph\.org\.uk/(?:geo)?photos/[^\"'\s]+?\.jpg")
PAGE_AUTHOR_RE = re.compile(
    r'property="cc:attributionName"[^>]*>([^<]+)<')
PAGE_TITLE_RE = re.compile(r"<title>(.*?)\s*&copy;", re.S)


def resolve_by_id(gid, timeout=25):
    """One photo's URL, title and author, read from its own page.

    The syndicator answers "what is near this point" and caps at 100
    results, so a photograph that names the place but sits behind 100
    nearer ones is invisible to it. That is not a rare case on a
    well-photographed coast, and the page is the authoritative fallback.
    """
    url = f"https://www.geograph.org.uk/photo/{gid}"
    req = urllib.request.Request(url, headers={"User-Agent": geograph.UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", "replace")
    except Exception:
        return None
    urls = PAGE_IMG_RE.findall(html)
    if not urls:
        return None
    # Prefer the largest rendition the page itself offers, which saves the
    # extra HEAD probe for these.
    best = next((u for u in urls if "_1024x1024" in u), "")
    if not best:
        best = next((u for u in urls if "_800x800" in u), urls[0])
    author = PAGE_AUTHOR_RE.search(html)
    title = PAGE_TITLE_RE.search(html)
    return {
        "id": str(gid),
        "title": (title.group(1).strip() if title else ""),
        "thumb": "",
        "url": best,
        "author": (author.group(1).strip() if author else ""),
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "link": url,
    }


def resolve(lat, lon, want_ids, radius_km=RADIUS_KM):
    """Thumbnail URLs, authors and licences for `want_ids`, from the
    syndicator, falling back to each photo's own page for the ids the
    syndicator's 100-result window did not reach. Returns {id: item}.
    Unauthenticated throughout; an empty answer means "Geograph told us
    nothing", never an error."""
    found = {}
    for item in geograph.syndicate(lat, lon, km=radius_km) or []:
        try:
            gid = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if gid in want_ids:
            found[gid] = item
    for gid in want_ids:
        if gid not in found:
            item = resolve_by_id(gid)
            if item:
                found[gid] = item
    return found


def wire_image(cand, item):
    """One image record in the shape the layers already ship.

    Author and licence are per image and never omitted: CC BY-SA is
    share-alike and attribution-required, so a row without a name is not
    publishable. `credit.stamp` is not called because Geograph never
    supplies the "nothing is owed" case that flag exists to record.
    """
    # The syndicator gives a sized thumb to rewrite; the page resolver has
    # already picked the largest rendition and hands back a ready URL.
    url = item.get("url") or photo_url(cand["id"], item.get("thumb") or "")
    author = (item.get("author") or cand.get("realname") or "").strip()
    if not url or not author:
        return None
    return {
        "file": strip_grid(item.get("title") or cand.get("title") or ""),
        "url": url,
        "full": url,
        "license": LICENCE,
        "license_url": LICENCE_URL,
        "author": author,
        "caption": strip_grid(item.get("title") or "")[:200],
        "evidence": "name",
        "source": "geograph",
        "km": cand.get("km"),
        "page": item.get("link")
                or f"https://www.geograph.org.uk/photo/{cand['id']}",
    }


def gap_rows(layer, cc):
    """The listed rows of this country that ship with no photograph,
    paired with their record in the enrichment cache (which is where the
    coordinate and the local name live)."""
    spec = LAYERS[layer]
    rich_path = ROOT / "cache" / layer / f"rich_{cc}.json"
    wire_path = ROOT / "continent-app" / "public" / spec["wire_key"] / f"{cc}.json"
    if not (rich_path.exists() and wire_path.exists()):
        return []
    rich = json.loads(rich_path.read_text(encoding="utf-8"))
    wire = json.loads(wire_path.read_text(encoding="utf-8"))
    gap = {(r.get("name"), round(r.get("lat") or 0, 4))
           for r in wire.get("listed", []) if not r.get("images")}
    out = []
    for row in rich.get(spec["rich_key"], []):
        key = (row.get("name"), round(row.get("lat") or 0, 4))
        if key in gap and not (row.get("images") or []):
            out.append(row)
    return out


def run(layer, apply_changes=False, countries=COUNTRIES, limit=0):
    if not geograph.DB.exists():
        print("no geograph sqlite; run: python pipeline/photos/geograph.py "
              "ingest cache/photos/dumps/gridimage_base.tsv.gz")
        return 1
    report = {"layer": layer, "countries": {}, "filled": 0, "examined": 0}
    for cc in countries:
        rows = gap_rows(layer, cc)
        if not rows:
            continue
        filled, matched = [], 0
        for row in rows:
            if limit and matched >= limit:
                break
            cands = candidates_for(row)
            if not cands:
                continue
            matched += 1
            want = {c["id"] for c in cands[:12]}
            items = resolve(row["lat"], row["lon"], want)
            images = []
            for cand in cands:
                item = items.get(cand["id"])
                if not item:
                    continue
                img = wire_image(cand, item)
                if img:
                    images.append(img)
                if len(images) >= 4:
                    break
            if images:
                filled.append((row, images))
        report["countries"][cc] = {"gap": len(rows),
                                   "name_matched": matched,
                                   "resolved": len(filled)}
        report["examined"] += len(rows)
        report["filled"] += len(filled)
        print(f"{layer:10s} {cc}  gap={len(rows):4d}  "
              f"name-matched={matched:4d}  with pixels={len(filled):4d}",
              flush=True)
        if apply_changes and filled:
            write_back(layer, cc, filled)
    out = ROOT / "data" / "reports" / f"geograph_fill_{layer}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"report -> {out}")
    return 0


def write_back(layer, cc, filled):
    """Put the images on the enrichment cache, not on the wire.

    The wire is generated by the layer's own export, which owns the
    evidence gate, the per-row caps and the `no_photo_map_card` reason. If
    this wrote the wire directly, the next export would silently drop
    everything it did. So the cache is the write target and the export is
    re-run afterwards.
    """
    spec = LAYERS[layer]
    path = ROOT / "cache" / layer / f"rich_{cc}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    index = {}
    for row in data.get(spec["rich_key"], []):
        index[(row.get("name"), round(row.get("lat") or 0, 4))] = row
    n = 0
    for row, images in filled:
        target = index.get((row.get("name"), round(row.get("lat") or 0, 4)))
        if target is None or (target.get("images") or []):
            continue
        target["images"] = images
        n += 1
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    tmp.replace(path)
    print(f"  wrote {n} rows -> {path.name}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--layer", choices=sorted(LAYERS), required=True)
    ap.add_argument("--countries", nargs="*", default=list(COUNTRIES))
    ap.add_argument("--limit", type=int, default=0,
                    help="stop after N name-matched rows per country")
    ap.add_argument("--apply", action="store_true",
                    help="write the images onto the enrichment cache")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    return run(args.layer, apply_changes=args.apply,
               countries=[c.upper() for c in args.countries],
               limit=args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
