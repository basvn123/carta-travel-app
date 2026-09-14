"""Contact sheets, so a reviewer judges sixteen photographs in one look.

Labelling is the bottleneck in front of every threshold in this package,
and labelling one URL at a time is the slowest possible way to do it. A
picture editor does not open files one by one, they lay a contact sheet
on the table. This builds that sheet: a numbered grid of the candidates,
plus a JSON index mapping each number back to its row, so the labels can
be written back without ambiguity.

    python pipeline/photos/contact_sheet.py --strata veto --limit 16
    python pipeline/photos/contact_sheet.py --strata random --category beach

Three strata, because a random sample of published heroes is mostly good
and would measure precision well and recall badly:

  random   heroes straight off the manifest. The base rate, and what the
           rejector's precision in the wild is measured against.
  veto     images the rejector currently vetoes. Judging these IS the
           precision-on-rejects measurement the brief sets a 95 per cent
           bar for.
  worst    the lowest-beauty images in the caches. Enriched for bad, so
           the known-bad set has something in it to recall.

Writes the sheet and its index to the scratchpad, prints both paths.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import glob
import io
import json
import os
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MANIFEST = HERE / "evalset" / "manifest.json"
OUT_DIR = Path(os.environ.get("CARTA_SHEET_DIR")
               or (ROOT / "cache" / "photos" / "sheets"))

CELL = 320
COLS = 4
PAD = 6
LABEL_H = 22
UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")

LAYER_CACHE = {"beach": ("beaches", "beaches"), "lake": ("lakes", "lakes"),
               "mountain": ("mountains", "peaks")}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read()
    except Exception:
        return None


def small(url):
    import re
    if url and "/thumb/" in url:
        return re.sub(r"/\d+px-", "/500px-", url, count=1)
    return url


def from_manifest(category=None, limit=16, offset=0):
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = [r for r in rows if not r.get("label")
            and (not category or r["category"] == category)]
    # An even stride, so one sheet spans the catalogue rather than four
    # beaches on the same coast.
    step = max(1, len(rows) // max(1, limit))
    return rows[offset::step][:limit]


def from_caches(category, kind, limit=16):
    """Candidates straight out of the rich caches: the vetoed ones, or
    the lowest scoring ones. Both are image level rather than hero level,
    because that is the population the rejector actually judges."""
    cache_dir, row_key = LAYER_CACHE[category]
    found = []
    for path in sorted(glob.glob(str(ROOT / "cache" / cache_dir
                                     / "rich_??.json"))):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        for row in data.get(row_key) or []:
            for img in row.get("images") or []:
                url = img.get("url") or img.get("full") or ""
                if not url:
                    continue
                if kind == "veto" and not img.get("vetoed"):
                    continue
                # `worst` is the FALSE NEGATIVE hunting ground, so it
                # excludes what the rejector already caught: the question
                # it answers is "what bad photographs got through", and
                # the vetoed ones by definition did not.
                if kind == "worst" and (img.get("beauty") is None
                                        or img.get("vetoed")):
                    continue
                found.append({
                    "category": category, "row": row.get("key")
                    or row.get("wd") or "", "name": row.get("name") or "",
                    "img": url, "beauty": img.get("beauty"),
                    "vetoed": img.get("vetoed") or "",
                })
    if kind == "worst":
        found.sort(key=lambda r: r["beauty"])
    step = max(1, len(found) // max(1, limit))
    return found[::step][:limit]


def build(rows, name):
    from PIL import Image, ImageDraw
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cols = min(COLS, max(1, len(rows)))
    n_rows = (len(rows) + cols - 1) // cols
    sheet = Image.new("RGB",
                      (cols * (CELL + PAD) + PAD,
                       n_rows * (CELL + LABEL_H + PAD) + PAD),
                      (244, 245, 247))
    draw = ImageDraw.Draw(sheet)
    index = []
    for i, row in enumerate(rows):
        data = fetch(small(row["img"]))
        time.sleep(0.25)
        x = PAD + (i % cols) * (CELL + PAD)
        y = PAD + (i // cols) * (CELL + LABEL_H + PAD)
        if data:
            try:
                img = Image.open(io.BytesIO(data)).convert("RGB")
                img.thumbnail((CELL, CELL))
                sheet.paste(img, (x + (CELL - img.width) // 2,
                                  y + (CELL - img.height) // 2))
            except Exception:
                draw.text((x + 8, y + 8), "unreadable", fill=(160, 40, 40))
        else:
            draw.text((x + 8, y + 8), "fetch failed", fill=(160, 40, 40))
        caption = f"{i + 1}. {row.get('name', '')[:34]}"
        draw.rectangle([x, y + CELL, x + CELL, y + CELL + LABEL_H],
                       fill=(14, 17, 22))
        draw.text((x + 5, y + CELL + 5), caption, fill=(255, 255, 255))
        index.append({"n": i + 1, **row})
    sheet_path = OUT_DIR / f"{name}.png"
    index_path = OUT_DIR / f"{name}.json"
    sheet.save(sheet_path)
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1),
                          encoding="utf-8")
    print(sheet_path)
    print(index_path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--strata", choices=("random", "veto", "worst"),
                    default="random")
    ap.add_argument("--category", choices=sorted(LAYER_CACHE),
                    default="beach")
    ap.add_argument("--limit", type=int, default=16)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--name")
    args = ap.parse_args()

    if args.strata == "random":
        rows = from_manifest(args.category, args.limit, args.offset)
    else:
        rows = from_caches(args.category, args.strata, args.limit)
    if not rows:
        raise SystemExit("nothing to sheet")
    build(rows, args.name or f"{args.category}_{args.strata}")


if __name__ == "__main__":
    main()
