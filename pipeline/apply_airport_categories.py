"""Give airport-tier destinations trip-type categories, in place.

Airport-tier destinations shipped with an empty `categories[]`, which made the
trip-type filter (City / Beach / Island / ...) hide every major city the moment
a chip was clicked - because matchesAnyKind() returns false for an empty list.
This patches each airport's `categories` from `airport_categories.py` (curated
where known, ["city"] otherwise) so the filter surfaces them. Gems are left
untouched - they already carry hand-written tags.

Idempotent: re-running just refreshes the values. Also unions any newly used
tags into meta.categories so the controlled vocab stays complete.

Usage:
    python apply_airport_categories.py                 # patches the default targets
    python apply_airport_categories.py path/to/app_data.json [more.json ...]
"""

import json
import sys
from pathlib import Path

import airport_categories
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                   # real dataset
    ROOT / "continent-app" / "public" / "app_data.json",   # what the dev app serves
]


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("meta", {})

    n_airports = 0
    n_changed = 0
    used_tags = set()
    for dest in data.get("destinations", {}).values():
        if dest.get("tier") != "airport":
            for t in dest.get("categories") or []:
                used_tags.add(t)
            continue
        n_airports += 1
        before = list(dest.get("categories") or [])
        cats = airport_categories.categories_for(
            dest.get("iata") or dest.get("id"),
            dest.get("city"),
            dest.get("country"),
            dest.get("iso2"),
        )
        dest["categories"] = cats
        used_tags.update(cats)
        if before != cats:
            n_changed += 1

    # Keep the controlled vocab complete (display only; the frontend filter has
    # its own kind->tag map in trip_kinds.js).
    vocab = set(meta.get("categories") or [])
    vocab.update(used_tags)
    meta["categories"] = sorted(vocab)

    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    n = len(data.get("destinations", {}))
    print(f"  {path.name}: {n} destinations, {n_airports} airports "
          f"({n_changed} updated)")


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying airport categories:")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
