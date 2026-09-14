"""Build the whole trip layer, from nothing to shipped wire, in one command.

    python pipeline/trips/build_trips.py

That is the reproducible path. Three stages run in order, each idempotent and
each caching its own answer, so the command can be interrupted and repeated
and it picks up rather than starts over:

    harvest   Wikivoyage guides, the Go next graph, the Get in modes and the
              itinerary articles          ->  cache/trips/routes.json
                                              (and it EXTENDS cache/wikivoyage.json)
    compose   eligible bases, day trips, chains, loops, day by day plans
                                          ->  cache/trips/composed.json
    export    validate, gate, publish     ->  continent-app/public/trips/

What makes a rebuild reproducible rather than merely repeatable, the same
contract the lake and mountain layers ship under:

  the caches are the snapshot.  Re-running with cache/trips/routes.json in
  place composes from the same editorial graph and produces the same wire,
  because nothing reads the clock except the generated_at stamp. Delete the
  cache to re-query Wikivoyage, and only Wikivoyage.
  every stage is deterministic.  The beam search sorts by score then id, the
  shortlists cut on a documented threshold, and ties break on a name.
  the model is versioned.  trip_sources.MODEL_VERSION rides in index.json, so
  a wire file can always be matched to the model that composed it.
  nothing ships unchecked.  export_trips.py runs every hard check in
  validate_trips.py first and prints what it dropped and why. A failure leaves
  the previous wire standing.

Time: a cold build is about five minutes, most of it the Wikivoyage harvest
(around 1,800 guides plus 580 itinerary articles, politely paced). A warm
re-run is about three minutes and almost all of that is the composer. Run it
after the catalogue's ratings, accommodation anchors or POI shortlists change,
which in practice means monthly.

Options:
    --countries AT,CH     compose and publish only these
    --refresh             re-query Wikivoyage even where a cache exists
    --skip-harvest        start from cache/trips/routes.json
    --skip-compose        re-validate and re-export the existing candidates
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


def run(args, label):
    print("\n=== %s ===" % label)
    t0 = time.time()
    proc = subprocess.run([PY] + args, cwd=str(ROOT))
    took = (time.time() - t0) / 60
    if proc.returncode != 0:
        raise SystemExit("%s failed (exit %s) after %.1f min"
                         % (label, proc.returncode, took))
    print("--- %s done in %.1f min" % (label, took))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--skip-harvest", action="store_true")
    ap.add_argument("--skip-compose", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    t0 = time.time()

    if not args.skip_harvest:
        harvest = ["pipeline/trips/harvest_routes.py"]
        if args.countries:
            harvest += ["--countries", args.countries]
        if args.refresh:
            harvest += ["--refresh"]
        run(harvest, "harvest: Wikivoyage routes")

    if not args.skip_compose:
        compose = ["pipeline/trips/compose_trips.py"]
        if args.countries:
            compose += ["--countries", args.countries]
        run(compose, "compose: bases, day trips, chains, loops")

    export = ["pipeline/trips/export_trips.py"]
    if args.countries:
        export += ["--countries", args.countries]
    if args.dry_run:
        export += ["--dry-run"]
    run(export, "export: validate and publish")

    print("\ntrip layer built in %.1f min" % ((time.time() - t0) / 60))


if __name__ == "__main__":
    main()
