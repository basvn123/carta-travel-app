"""Add the schema-v9 beauty layer to an existing app_data.json in place.

Adds:
  - meta.beauty_model              (weights + component definitions + sources;
                                     see beauty_layer.BEAUTY_MODEL)
  - meta.beauty_model.gem_cutoffs  (score01 boundaries used for the 1-5 gem map)
  - dest.beauty                    (score / gems / unesco / top_beach / components)
  - bumps meta.schema_version to 9

The composite beauty score is computed per destination from real signals
(UNESCO World Heritage proximity, Blue Flag beach density, scenic tags, a curated
iconic boost); gems (1-5) are then assigned dataset-wide by quantile so the
catalogue spreads well. Idempotent: re-running just refreshes the values.

Pipeline order (per project convention):
    apply_car_layer -> apply_airport_anchors -> apply_airport_categories
    -> apply_beauty_layer -> sync-data (build)

Usage:
    python apply_beauty_layer.py                      # patches the default targets
    python apply_beauty_layer.py path/to/app_data.json [more.json ...]
"""

import json
import sys
from pathlib import Path

import beauty_layer
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # real dataset
    ROOT / "continent-app" / "public" / "app_data.json",  # what the dev app serves
]


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.get("meta", {})
    dests = data.get("destinations", {})

    # First pass: compute every destination's raw score.
    for dest in dests.values():
        dest["beauty"] = beauty_layer.compute_beauty(dest)

    # Multi-airport cities (Paris CDG/Orly/Beauvais, London x4, ...) keep one
    # record per airport; unify each city's beauty onto its primary airport so it
    # ranks once, consistently, instead of several times with conflicting gems.
    unified = beauty_layer.dedupe_multi_airport_cities(dests)

    # Second pass: assign 1-5 gems by dataset quantile over the (now unified)
    # blocks, then drop the internal score01 helper (cutoffs live in meta).
    blocks = [d["beauty"] for d in dests.values()]
    cutoffs = beauty_layer.assign_gems(blocks)
    for b in blocks:
        b.pop("score01", None)

    model = dict(beauty_layer.BEAUTY_MODEL)
    model["gem_cutoffs"] = {k: round(v, 4) for k, v in cutoffs.items()}
    model["unesco_sites_indexed"] = len(beauty_layer.load_unesco())
    meta["beauty_model"] = model
    # Never downgrade: the images layer (=10) may already have run.
    meta["schema_version"] = max(meta.get("schema_version", 0), 9)

    atomic_write_json(path, data, indent=1, ensure_ascii=False)

    n = len(dests)
    n_unesco = sum(1 for d in dests.values() if d["beauty"]["unesco"])
    n_beach = sum(1 for d in dests.values() if d["beauty"]["top_beach"])
    import collections
    gd = collections.Counter(d["beauty"]["gems"] for d in dests.values())
    dist = " ".join(f"{g}g:{gd.get(g, 0)}" for g in (5, 4, 3, 2, 1))
    print(f"  {path.name}: {n} dests | UNESCO {n_unesco} | top-beach {n_beach} | "
          f"gems [{dist}] ({path.stat().st_size / 1024 / 1024:.2f} MB)")
    if unified:
        print(f"    unified {len(unified)} multi-airport cities:")
        for base, primary, sibs in sorted(unified):
            print(f"      {base}: {primary} <- {', '.join(sibs)}")


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying beauty layer (schema v9):")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
