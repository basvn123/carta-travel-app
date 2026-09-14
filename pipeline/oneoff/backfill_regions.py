"""One off: stamp region ids onto every existing cached layer row.

Usage, from the repo root:

    python pipeline/oneoff/backfill_regions.py
    python pipeline/oneoff/backfill_regions.py --layers beaches,lakes

The region contract says assignment is stored in the layer's cache during
enrich and read back at export, never recomputed at export time. The enrich
scripts now stamp new rows as they pass; this script brings every row that
was enriched BEFORE the region spine existed up to the same contract, so
the first v2 export does not depend on a 40 minute re-enrich.

Each row gains one key:

    "rg": {"n3": "ES618", "n2": "ES61", "co": "COAST:ES-LUZ-CADIZ",
           "bg": "MED", "h4": "84..."}

Rows that already carry `rg` are left alone (delete the key to force a
re-stamp), so the script is idempotent and cheap to re-run. Both raw and
rich caches are stamped: rich is what export reads, raw is what a future
re-enrich starts from.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))
sys.path.insert(0, str(ROOT / "pipeline"))

import assign  # noqa: E402
from pipeline_io import atomic_write_json, load_json  # noqa: E402

CACHE = ROOT / "cache"

LAYERS = {
    "beaches": "beaches",
    "lakes": "lakes",
    "mountains": "peaks",
}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--layers", default=",".join(LAYERS))
    ap.add_argument("--force", action="store_true",
                    help="re-stamp rows that already carry rg")
    args = ap.parse_args()

    wanted = [x.strip() for x in args.layers.split(",") if x.strip()]
    for layer in wanted:
        key = LAYERS[layer]
        stamped = kept = 0
        for path in sorted((CACHE / layer).glob("r*_??.json")):
            if not (path.name.startswith("raw_") or path.name.startswith("rich_")):
                continue
            data = load_json(path)
            rows = (data or {}).get(key) or []
            changed = False
            for row in rows:
                if row.get("rg") and not args.force:
                    kept += 1
                    continue
                lat, lon = row.get("lat"), row.get("lon")
                if lat is None or lon is None:
                    continue
                try:
                    row["rg"] = assign.wire_rg(assign.assign_point(lat, lon))
                except ValueError:
                    continue
                stamped += 1
                changed = True
            if changed:
                atomic_write_json(path, data)
        print(f"[regions] {layer}: stamped {stamped} rows, "
              f"{kept} already carried rg")


if __name__ == "__main__":
    main()
