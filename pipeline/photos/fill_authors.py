"""A credit reading "CC BY-SA 3.0" with nobody named is not a credit.

The published layers carry a hundred photographs with a licence and no
author (13 beaches, 38 lakes, 49 mountains at the 2026-08-29 count). The
Artist field was empty when they were harvested, and Artist is not the
only place Commons keeps a name: Attribution is the field a photographer
explicitly asks to be credited by, and Credit carries "Own work" style
provenance. AttributionRequired, meanwhile, says whether a credit is owed
at all, which for public domain and CC0 files it is not.

The same pass repairs a missing licence URL from the LicenseUrl field,
because a licence link a reader cannot follow is half a credit.

So, per image with a licence and no author, in order:

  1. re-ask imageinfo for Artist | Attribution | Credit |
     AttributionRequired
  2. author := Attribution, else Artist, else Credit (HTML stripped,
     truncated sanely)
  3. AttributionRequired false -> no credit owed; the empty author is
     recorded as fine (`no_attribution_required`) and the file ships
  4. still nothing and a credit IS owed -> the file stops shipping,
     always, however few photographs the row has left. A row is allowed
     to fall: under its layer's rated gate it publishes as `listed`, and
     with no photographs at all it publishes as a map card. Both are
     honest and neither deletes the row, so there is nothing to trade
     the licence obligation against. The run reports how many rows moved
     each way, because that number ticks the published count DOWN and is
     better predicted than explained afterwards.

Writes the RICH caches, so the fix persists through every later export
(the cache is the snapshot). Run any export after it to publish.

    python pipeline/photos/fill_authors.py            # all three layers
    python pipeline/photos/fill_authors.py --dry-run

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Windows consoles and redirected pipes default to cp1252, which cannot
# encode half the landforms in Europe. This pass names the rows it acts
# on, so a mountain called Kroficka took the whole run down with a
# UnicodeEncodeError before it reached its first write: the repair was
# fine and the REPORT killed it. A progress line must never be the thing
# that fails a licence fix, the same lesson the takedown scrub learned
# from a path it could not make relative.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

ROOT = Path(__file__).resolve().parents[2]
API = "https://commons.wikimedia.org/w/api.php"
UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")
PACE_S = 0.4
BATCH = 50
TAG_RE = re.compile(r"<[^>]+>")

LAYERS = {
    "beaches": ("beaches", "beaches"),
    "lakes": ("lakes", "lakes"),
    "mountains": ("mountains", "peaks"),
}

_last = [0.0]


def api_get(params):
    wait = _last[0] + PACE_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    query = urllib.parse.urlencode({**params, "format": "json",
                                    "maxlag": 5})
    req = urllib.request.Request(f"{API}?{query}",
                                 headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception:
            time.sleep(2 ** attempt)
    return None


def clean(value):
    text = TAG_RE.sub("", str(value or "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:120]


def lookup(titles):
    """{title: {author, required}} for up to BATCH file titles."""
    res = api_get({
        "action": "query", "titles": "|".join(titles),
        "prop": "imageinfo", "iiprop": "extmetadata",
        "iiextmetadatafilter":
            "Artist|Attribution|Credit|AttributionRequired|LicenseUrl",
        "redirects": 1,
    }) or {}
    out = {}
    normalized = {}
    for n in (res.get("query") or {}).get("normalized") or []:
        normalized[n["to"]] = n["from"]
    for page in ((res.get("query") or {}).get("pages") or {}).values():
        title = page.get("title") or ""
        meta = ((page.get("imageinfo") or [{}])[0]
                .get("extmetadata")) or {}
        author = (clean((meta.get("Attribution") or {}).get("value"))
                  or clean((meta.get("Artist") or {}).get("value"))
                  or clean((meta.get("Credit") or {}).get("value")))
        required = str((meta.get("AttributionRequired") or {})
                       .get("value", "true")).lower() != "false"
        out[normalized.get(title, title)] = {
            "author": author, "required": required,
            "license_url": clean((meta.get("LicenseUrl") or {})
                                 .get("value"))}
    return out


def rated_gate(layer):
    """How many photographs this layer's RATED tier asks for, read off the
    wire's own model block so the report follows a gate change instead of
    guessing at one. None when the layer has not published a gate."""
    path = (ROOT / "continent-app" / "public" / LAYERS[layer][0]
            / "index.json")
    try:
        model = json.loads(path.read_text(encoding="utf-8")).get("model")
        return (model or {}).get("min_images")
    except (OSError, ValueError):
        return None


def repair_layer(layer, dry_run=False):
    cache_dir, row_key = LAYERS[layer]
    filled = waived = dropped = demoted = emptied = 0
    gate = rated_gate(layer)
    for path in sorted((ROOT / "cache" / cache_dir).glob("rich_??.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data.get(row_key) or []
        todo = {}
        for row in rows:
            for img in row.get("images") or []:
                incomplete = (not (img.get("author") or "").strip()
                              or not (img.get("license_url")
                                      or "").strip())
                if img.get("license") and incomplete and img.get("file"):
                    todo.setdefault(img["file"], []).append(img)
        if not todo:
            continue
        titles = sorted(todo)
        found = {}
        for i in range(0, len(titles), BATCH):
            found.update(lookup(titles[i:i + BATCH]))
        changed = False
        for title, imgs in todo.items():
            info = found.get(title) or {"author": "", "required": True,
                                        "license_url": ""}
            for img in imgs:
                if (info.get("license_url")
                        and not (img.get("license_url") or "").strip()):
                    img["license_url"] = info["license_url"]
                if (img.get("author") or "").strip():
                    changed = True
                    continue
                if info["author"]:
                    img["author"] = info["author"]
                    filled += 1
                elif not info["required"]:
                    img["no_attribution_required"] = True
                    waived += 1
                else:
                    img["drop_no_author"] = True
                changed = True
        if changed:
            for row in rows:
                imgs = row.get("images") or []
                doomed = [i for i in imgs if i.get("drop_no_author")]
                clean_imgs = [i for i in imgs
                              if not i.get("drop_no_author")]
                if doomed:
                    # An uncreditable photograph ALWAYS goes, however few
                    # remain. There used to be a floor here: keep the file
                    # rather than let a row fall under two photographs.
                    # That floor was written before the listed tier and
                    # the map card existed, when dropping meant deleting
                    # the row, and it had the effect of preserving a
                    # coverage number by continuing to publish exactly the
                    # files whose credit we cannot honour. It kept the
                    # violation on the rows that had the most of it.
                    #
                    # A row is now allowed to fall: to the listed tier
                    # with fewer photographs, or to a map card with none.
                    # Both are honest, and neither is deleted. The
                    # licence obligation is not a thing to trade against
                    # a row count.
                    row["images"] = clean_imgs
                    dropped += len(doomed)
                    if not clean_imgs:
                        emptied += 1
                    elif gate and len(clean_imgs) < gate:
                        demoted += 1
            if not dry_run:
                tmp = path.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(data, ensure_ascii=False,
                                          indent=1), encoding="utf-8")
                tmp.replace(path)
    print(f"  {layer}: {filled} authors filled, {waived} waived "
          f"(no attribution required), {dropped} dropped")
    if demoted or emptied:
        print(f"  {layer}: {demoted} rows now under the rated gate "
              f"of {gate} and will publish as listed, {emptied} rows "
              f"left with no photograph and will publish as a map card")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--layers", default="beaches,lakes,mountains")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for layer in args.layers.split(","):
        layer = layer.strip()
        if layer in LAYERS:
            repair_layer(layer, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
