"""Ship the credit for every POI thumbnail the app shows.

The layer galleries (beaches, lakes, mountains, trails, the dossier
slides) all carry author and licence per image and render them. The POI
grid does not: items_full[].img is a bare URL, and the ledger row for
Commons POI thumbnails has read MISSING since it was written. The data
has been harvested all along (cache/poi_image_licenses.json, 28k files);
this export puts it where the app can reach it.

    python pipeline/photos/export_poi_credits.py
        -> continent-app/public/poi_credits.json

Format, compact on purpose (the app loads it lazily, first time a credit
is actually shown):

    {"v": 1, "files": {"<Commons filename>": ["author", "licence"]}}

The filename is the join key because it survives every thumbnail width:
continent-app/src/lib/imageCredit.js derives it from any upload.wikimedia
URL and looks it up here. Files whose gate check failed (NC/ND) are not
exported: they should not be shipping at all, and audit_quality.py is
the process that hunts them.

ASCII clean, no em dashes, per project convention.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "poi_image_licenses.json"
OUT = ROOT / "continent-app" / "public" / "poi_credits.json"


def main():
    if not CACHE.exists():
        raise SystemExit("no cache/poi_image_licenses.json; run "
                         "pipeline/harvest_image_licenses.py first")
    cache = json.loads(CACHE.read_text(encoding="utf-8"))
    files = {}
    skipped = 0
    for name, row in cache.items():
        if not isinstance(row, dict) or not row.get("ok"):
            skipped += 1
            continue
        author = (row.get("author") or row.get("credit") or "").strip()
        licence = (row.get("license") or "").strip()
        if not licence:
            skipped += 1
            continue
        files[name] = [author, licence]
    payload = {"v": 1, "files": files}
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)
    size_kb = OUT.stat().st_size // 1024
    print(f"{len(files)} credits -> {OUT.name} ({size_kb} KB, "
          f"{skipped} skipped)")


if __name__ == "__main__":
    main()
