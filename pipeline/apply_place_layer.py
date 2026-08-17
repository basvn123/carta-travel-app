"""Write dest.place (schema v16) into app_data.json, in place.

Adds:
  - meta.place_model   (classes, thresholds, field meanings)
  - dest.place         (class / base / visit_h / depth) - see place_layer.py

Idempotent: re-running just refreshes the values. Run it after the POI and
GeoNames layers, because depth reads activities.items_full and the class reads
geonames.population:

    harvest_geonames -> harvest_activities -> apply_place_layer -> apply_rating_layer

The master holds items_full; the served copy has it stripped, so the block is
computed on the master and mirrored by id onto any extra target (same shape as
apply_rating_layer.py).

Usage:
    python apply_place_layer.py           # patches master + served copy
    python apply_place_layer.py a.json    # explicit targets (first = source)
"""
import json
import sys
from collections import Counter
from pathlib import Path

import place_layer
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

# A class layer that silently collapses is invisible in the app (everything
# just becomes a village), so the obvious wrongness is asserted here instead.
EXPECT_CLASS = {
    "CIA": "metro",           # Rome
    "BVA": "metro",           # Paris
    "gem:bruges": "city",
    "gem:hallstatt": "village",
}
MIN_SHARE = 0.02   # no class may vanish below this share of the catalogue


def validate(dests):
    problems = []
    counts = Counter((d.get("place") or {}).get("class") for d in dests.values())
    for did, want in EXPECT_CLASS.items():
        got = ((dests.get(did) or {}).get("place") or {}).get("class")
        if did in dests and got != want:
            problems.append(f"{did} classed {got}, expected {want}")
    n = max(1, len(dests))
    for cls in ("metro", "city", "town", "village"):
        if counts.get(cls, 0) / n < MIN_SHARE:
            problems.append(
                f"class '{cls}' is only {counts.get(cls, 0)} of {n} destinations "
                f"({counts.get(cls, 0) / n:.1%}) - the split has collapsed")
    missing = sum(1 for d in dests.values() if not d.get("place"))
    if missing:
        problems.append(f"{missing} destinations have no place block")
    return problems, counts


def main():
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Applying place layer (schema v16):")

    master_path = targets[0]
    data = load_json(master_path)
    if not data:
        raise SystemExit(f"cannot read {master_path}")
    dests = data.get("destinations") or {}
    for d in dests.values():
        d["place"] = place_layer.compute_place(d)

    problems, counts = validate(dests)
    if problems:
        print("  PLACE VALIDATION FAILED - nothing written:")
        for p in problems[:20]:
            print(f"    - {p}")
        sys.exit(1)

    data["meta"]["place_model"] = place_layer.PLACE_MODEL
    data["meta"]["schema_version"] = max(data["meta"].get("schema_version", 0), 16)
    atomic_write_json(master_path, data)

    bases = sum(1 for d in dests.values() if (d.get("place") or {}).get("base", 0) >= 0.6)
    print(f"  {master_path.name}: {len(dests)} dests | "
          + " | ".join(f"{k} {counts.get(k, 0)}"
                       for k in ("metro", "city", "town", "village", "area"))
          + f" | {bases} work as a base")

    for path in targets[1:]:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        served = load_json(path)
        sdests = served.get("destinations") or {}
        n = 0
        for did, d in sdests.items():
            src = dests.get(did)
            if src and "place" in src:
                d["place"] = src["place"]
                n += 1
        served["meta"]["place_model"] = place_layer.PLACE_MODEL
        served["meta"]["schema_version"] = max(
            served["meta"].get("schema_version", 0), 16)
        path.write_text(json.dumps(served, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: mirrored place onto {n} dests")


if __name__ == "__main__":
    main()
