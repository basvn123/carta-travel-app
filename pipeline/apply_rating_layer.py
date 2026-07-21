"""Add the schema-v14 traveller rating to an existing app_data.json in place.

Adds:
  - meta.rating_model   (weights, tier cutoffs/labels, display curve, sources)
  - dest.rating         (score 0-10 / tier 0-3 / label / hidden_gem / fame /
                         components) - see rating_layer.py
  - bumps meta.schema_version to 14

Needs cache/dest_pageviews.json (run `python harvest_pageviews.py dests`
first); destinations missing from the cache just score fame 0.

The master dataset (app_data/app_data.json) holds activities.items_full,
which the things-to-do component reads. The served copy has items_full
stripped, so ratings are computed on the master and mirrored by id onto any
extra target. Idempotent: re-running refreshes the values.

Pipeline order (per project convention):
    apply_car_layer -> apply_airport_anchors -> apply_airport_categories
    -> apply_beauty_layer -> apply_rating_layer -> sync-data (build)

Usage:
    python apply_rating_layer.py          # patches master + served copy
    python apply_rating_layer.py a.json   # explicit targets (first = source)
"""

import json
import sys
from pathlib import Path

import rating_layer

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # master (has items_full)
    ROOT / "continent-app" / "public" / "app_data.json",  # served copy (mirror)
]


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying rating layer (schema v14):")

    master_path = targets[0]
    data = json.loads(master_path.read_text(encoding="utf-8"))
    dests = data.get("destinations", {})
    counts = rating_layer.compute_ratings(dests)
    data["meta"]["rating_model"] = rating_layer.RATING_MODEL
    data["meta"]["schema_version"] = max(
        data["meta"].get("schema_version", 0), 14)
    master_path.write_text(json.dumps(data, indent=1, ensure_ascii=False),
                           encoding="utf-8")
    print(f"  {master_path.name}: {len(dests)} dests | "
          f"3-star {counts[3]} | 2-star {counts[2]} | 1-star {counts[1]} | "
          f"unrated {counts[0]} | hidden gems {counts['hidden_gem']}")

    # Mirror rating blocks onto the other targets by destination id.
    for path in targets[1:]:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        served = json.loads(path.read_text(encoding="utf-8"))
        sdests = served.get("destinations", {})
        n = 0
        for did, d in sdests.items():
            src = dests.get(did)
            if src and "rating" in src:
                d["rating"] = src["rating"]
                n += 1
        served["meta"]["rating_model"] = rating_layer.RATING_MODEL
        served["meta"]["schema_version"] = max(
            served["meta"].get("schema_version", 0), 14)
        path.write_text(json.dumps(served, ensure_ascii=False),
                        encoding="utf-8")
        print(f"  {path.name}: mirrored rating onto {n} dests")


if __name__ == "__main__":
    main()
