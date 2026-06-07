"""Patch fact-checked GEM trip-type categories into app_data.json, in place.

Companion to `apply_airport_categories.py` (which handles the airport tier). This
applies the curated overrides in `gem_category_overrides.py` to gem-tier
destinations only. Idempotent: re-running just refreshes the values. Also unions
any newly used tags into meta.categories so the controlled vocab stays complete.

Usage:
    python apply_gem_categories.py                      # patches the default targets
    python apply_gem_categories.py path/to/app_data.json [more.json ...]
"""

import json
import sys
from pathlib import Path

import gem_category_overrides

ROOT = Path(__file__).resolve().parent
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

    n_changed = 0
    missing = []
    used_tags = set()
    overrides = dict(gem_category_overrides.GEM_CATEGORIES)
    seen_ids = set()
    for dest_id, dest in data.get("destinations", {}).items():
        # collect existing vocab from every dest (display only)
        for t in dest.get("categories") or []:
            used_tags.add(t)
        new = overrides.get(dest_id)
        if new is None:
            continue
        seen_ids.add(dest_id)
        before = list(dest.get("categories") or [])
        # de-dupe while preserving order
        out, seen = [], set()
        for t in new:
            if t not in seen:
                seen.add(t)
                out.append(t)
        dest["categories"] = out
        used_tags.update(out)
        if before != out:
            n_changed += 1

    missing = sorted(set(overrides) - seen_ids)

    vocab = set(meta.get("categories") or [])
    vocab.update(used_tags)
    meta["categories"] = sorted(vocab)

    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"  {path.name}: {len(overrides)} gem overrides, {n_changed} updated"
          + (f"; NOT FOUND: {missing}" if missing else ""))


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying gem categories:")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
