"""Build the whole cycling layer, from nothing to shipped wire, in one command.

    python pipeline/cycling/build_cycling.py

Nine stages, in order, each idempotent and each keeping its own answer, so
the command can be interrupted and repeated and it picks up rather than
starts over:

    reference   Natura 2000, Emerald and the EEA coastline into the lab
    harvest     route=bicycle relations out of the cached Geofabrik extracts
                (and the NL/BE junction graph)      -> cycle_routes
    splice      short mapping breaks bridged, thresholds imported from the
                trails layer                        -> cycle_repairs
    enrich      regions, elevation, surface, safety, services, near, scenic
    photos      Commons and Geograph, anchored on the line
    crosscheck  EuroVelo GPX and the national portals, as an agreement
                percentage per route
    rate        the published rating, ranked at home first
    tours       the stage planner, composing at build time only
    export      validate, gate, publish             -> public/cycling/

What makes a rebuild reproducible rather than merely repeatable:

  the caches are the snapshot. A warm re-run reads data/raw/geofabrik,
  data/raw/dem, data/raw/eurovelo and cache/cycling and touches the network
  for nothing, producing the same wire apart from generated_at.
  every stage is deterministic. Percentiles sort by value then id, the split
  cuts on documented thresholds, and ties break on a name.
  the model is versioned. cycle_index.MODEL_VERSION and
  stage_planner.MODEL_VERSION ride in index.json, so a wire file can always
  be matched to the model that produced it.
  nothing ships unchecked. export runs all ten hard checks first and prints
  what it dropped and why. A failure leaves the previous wire standing.

Time: a cold build is dominated by the harvest (about two hours over 44
cached extracts, most of it Germany and France) and the photo pass (Commons
is politely paced). Elevation is fast where the DEM tiles are already local.
A warm re-run with --skip-harvest --skip-photos is a few minutes.

Options:
    --countries GB,NL     do only these (ISO2)
    --refresh             recompute even where a value is stored
    --skip-reference      the protected-area and coastline mirror
    --skip-harvest        start from what is already in cycle_routes
    --skip-enrich         re-rate and re-export what is already enriched
    --skip-photos         no Commons calls at all
    --skip-crosscheck     no EuroVelo or portal downloads
    --skip-tours          leave the composed tours as they are
    --dry-run             say what would ship, write no wire
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PY = sys.executable or "python"


def run(args, label, optional=False):
    print("\n=== %s ===" % label, flush=True)
    t0 = time.time()
    proc = subprocess.run([PY] + args, cwd=str(ROOT))
    took = (time.time() - t0) / 60
    if proc.returncode != 0:
        if optional:
            # A cross-check that cannot reach its portal is a missing
            # reading, not a broken build. The agreement percentage is
            # simply absent for that country and the run says so.
            print("--- %s unavailable (exit %s) after %.1f min, continuing"
                  % (label, proc.returncode, took))
            return
        raise SystemExit("%s failed (exit %s) after %.1f min"
                         % (label, proc.returncode, took))
    print("--- %s done in %.1f min" % (label, took), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--skip-reference", action="store_true")
    ap.add_argument("--skip-harvest", action="store_true")
    ap.add_argument("--skip-splice", action="store_true")
    ap.add_argument("--skip-enrich", action="store_true")
    ap.add_argument("--skip-photos", action="store_true")
    ap.add_argument("--skip-crosscheck", action="store_true")
    ap.add_argument("--skip-rate", action="store_true")
    ap.add_argument("--skip-tours", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cc = ["--countries", args.countries] if args.countries else []
    # The harvest speaks Geofabrik slugs, every other stage speaks ISO2, so a
    # --countries in ISO2 simply does not reach the harvest. Saying that out
    # loud beats silently harvesting all of Europe for a one-country rebuild.
    t0 = time.time()

    if not args.skip_reference:
        run(["pipeline/cycling/cycle_sources.py", "--reference"],
            "reference: protected sites and the coastline", optional=True)

    if not args.skip_harvest:
        if args.countries:
            print("\nnote: --countries is ISO2 and the harvest takes "
                  "Geofabrik slugs. Skipping the harvest for this run; "
                  "run harvest_cycling.py --countries <slug> yourself, or "
                  "drop --countries to harvest everything.")
        else:
            run(["pipeline/cycling/harvest_cycling.py"],
                "harvest: route=bicycle out of the cached extracts")

    if not args.skip_splice:
        run(["pipeline/cycling/splice_cycling.py"] + cc,
            "splice: bridge the short mapping breaks")

    if not args.skip_enrich:
        enrich = ["pipeline/cycling/enrich_cycling.py"] + cc
        if args.refresh:
            enrich += ["--refresh"]
        run(enrich, "enrich: regions, elevation, surface, safety, services, "
                    "near, scenic")
        # The elevation pass measures the ORIGINAL geometry, so a spliced
        # route's stated distance and its span coordinates have to come back
        # into line with the line that ships.
        run(["pipeline/cycling/splice_cycling.py", "--sync-only"],
            "splice: bring stated distances back in line")

    if not args.skip_photos:
        photos = ["pipeline/cycling/cycle_images.py"] + cc
        if args.refresh:
            photos += ["--refresh"]
        run(photos, "photos: Commons and Geograph, anchored on the line",
            optional=True)

    if not args.skip_crosscheck:
        run(["pipeline/cycling/harvest_cycling.py", "--crosscheck"] + cc,
            "crosscheck: EuroVelo GPX and the national portals",
            optional=True)

    run(["pipeline/cycling/seed_bike_rail.py"], "seed: bike on trains")

    if not args.skip_rate:
        run(["pipeline/cycling/cycle_index.py"] + cc,
            "rate: the published rating, ranked at home first")

    if not args.skip_tours:
        run(["pipeline/cycling/stage_planner.py"] + cc,
            "tours: compose at build time")
        run(["pipeline/cycling/validate_cycling.py"] + cc,
            "validate: the ten hard checks")

    export = ["pipeline/cycling/export_cycling.py"] + cc
    if args.dry_run:
        export += ["--dry-run"]
    run(export, "export: gate and publish")

    print("\ncycling layer built in %.1f min" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
