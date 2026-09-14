"""apply_new_gems.py - insert promoted gem specs into the master, at scale.

pipeline/oneoff/add_gems_from_json.py is the proven inserter and this reuses
its record builder verbatim (`build_record`), so every new destination has the
exact shape of the gems already shipping. What it does NOT reuse is that
script's `snap_coordinates` step.

Snapping asks Wikipedia for each place's coordinates and overwrites the spec
with what comes back. That is a sensible safety net when a human has hand
typed a dozen coordinates. It is a hazard for 1,468 machine-generated specs:
the coordinates here come from the GeoNames gazetteer and the POI centroid
that the coverage engine already measured and agreed on, while a Wikipedia
title lookup at this volume will silently match the wrong article somewhere
and move a destination to another country. The better data is already in hand,
so the network round trip is skipped.

Safety:
  - refuses to run while another python process might be writing the master
  - backs the master up before touching it
  - idempotent: a slug that already exists is skipped, so a partial run
    can simply be re-run
  - reports the bookable / browse-only split, because a gem whose anchor has
    no fares is browse-only and that is expected, not a failure

Usage:
    python pipeline/apply_new_gems.py app_data/new_gems_20260817.json
    python pipeline/apply_new_gems.py specs.json --dry-run
"""
import argparse
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "oneoff"))
from add_famous_small_gems import build_record          # noqa: E402

from pipeline_io import atomic_write_json, load_json    # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
BACKUPS = ROOT / "app_data" / "backups"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("specs")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    specs = load_json(args.specs)
    if not isinstance(specs, list) or not specs:
        raise SystemExit(f"no specs in {args.specs}")

    data = load_json(MASTER)
    if not data:
        raise SystemExit(f"cannot read {MASTER}")
    dests = data["destinations"]
    before = len(dests)
    home = data["meta"]["home"]
    max_drive_km = (data["meta"].get("car_model") or {}).get("max_drive_km", 3500)

    missing_anchor = [s["slug"] for s in specs if s["anchor"] not in dests]
    if missing_anchor:
        raise SystemExit(f"unknown anchor airports for: {missing_anchor[:10]}")

    todo = [s for s in specs if f"gem:{s['slug']}" not in dests]
    print(f"{len(specs)} specs, {len(todo)} new, {len(specs) - len(todo)} already present")
    if args.dry_run:
        print("--dry-run: nothing written")
        return

    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    backup = BACKUPS / f"app_data.pre_expansion_{stamp}.json"
    print(f"backing up the master -> {backup.name} ...")
    shutil.copy2(MASTER, backup)

    states = Counter()
    for n, spec in enumerate(todo, 1):
        rec = build_record(spec, dests, home, max_drive_km)
        dests[f"gem:{spec['slug']}"] = rec
        if rec["routes"] and not rec["no_ryanair_route"]:
            states["bookable"] += 1
        elif rec["no_ryanair_route"]:
            states["browse-only"] += 1
        else:
            states["drive/browse"] += 1
        if n % 250 == 0:
            print(f"  built {n}/{len(todo)}")

    data["meta"]["n_destinations"] = len(dests)
    atomic_write_json(MASTER, data)

    print(f"\n{before} -> {len(dests)} destinations (+{len(dests) - before})")
    for k, v in states.most_common():
        print(f"  {k:14s} {v}")
    print("\nthese arrive with no image, no POIs and no beauty score. Run the "
          "enrichment chain next, ONE AT A TIME (each writes the master):")
    print("  harvest_images -> harvest_activities -> harvest_geonames")
    print("  -> apply_beauty_layer -> apply_designations -> apply_place_layer")
    print("  -> apply_rating_layer -> npm run data")


if __name__ == "__main__":
    main()
