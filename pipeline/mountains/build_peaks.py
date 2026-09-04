"""Build the whole mountain layer, from nothing to shipped wire, in one command.

    python pipeline/mountains/build_peaks.py

That is the reproducible path. Three stages run in order, each idempotent and
each caching its own answer, so the command can be interrupted and repeated
and it picks up rather than starts over:

    harvest   the already harvested Wikidata spine, the P610 high points of
              every country and region, a bounded hill pass for the flat
              countries, and the curated seed resolved by name
                                           ->  cache/mountains/raw_CC.json
    enrich    Wikidata detail with units, Commons photographs, Wikipedia
              facts and pageviews, the Overpass access sweep, the nearest
              priced town                  ->  cache/mountains/rich_CC.json
    export    score, gate, fill the country floor, validate
                                           ->  continent-app/public/mountains/

What makes a rebuild reproducible rather than merely repeatable:

  the caches are the snapshot.  Re-running with the caches in place produces
  byte identical wire files, because every stage reads them and nothing reads
  the clock except the generated_at stamp. Delete a cache to re-query that
  source, and only that source.
  every stage is deterministic.  Sorting is by score then name, never by dict
  order; the shortlist is cut by a documented pre score; ties break on a name.
  the model is versioned.  peak_index.MODEL_VERSION and the weights ride in
  index.json, so a wire file can always be matched to the model that scored it.
  the inputs are dated.  index.json carries the harvest and enrich timestamp
  per country, which is what tells you whether a difference between two builds
  came from the code or from the world.

Time: a cold build is a few hours, most of it Commons and Overpass. A warm
re-run is seconds.

Overpass is the one source here that is regularly unreachable: during the
first build the public instance refused every connection for an hour and both
mirrors answered a bare 500, while Wikidata, Commons and Wikipedia were fine
throughout. So it is separable on purpose:

    python pipeline/mountains/build_peaks.py --no-context     # ship without it
    python pipeline/mountains/enrich_peaks.py --context-only  # fill it in later
    python pipeline/mountains/export_peaks.py                 # republish

A mountain with no OSM sweep says nothing about lifts unless the seed or the
Wikipedia article says something, which is the honest answer rather than a
guess.

Options:
    --countries CH,AT     only these
    --refresh             re-query even where a cache exists
    --skip-harvest        start from the raw caches
    --skip-enrich         re-score and re-export from the rich caches only
    --no-context          leave Overpass alone
    --no-images           leave Commons alone (for a fast structural re-run)
    --dry-run             say what would ship, write nothing
    --skip-export         stop after enrich, for the orchestrator's order
                          (harvest -> enrich -> terrain -> season -> export)

ASCII clean, no em dashes, per project convention.
"""

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import harvest_peaks  # noqa: E402
import enrich_peaks  # noqa: E402
import export_peaks  # noqa: E402
from peak_sources import load_cache  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-harvest", action="store_true")
    parser.add_argument("--skip-enrich", action="store_true")
    parser.add_argument("--no-context", action="store_true")
    parser.add_argument("--no-images", action="store_true")
    parser.add_argument("--shortlist", type=int, default=harvest_peaks.SHORTLIST)
    parser.add_argument("--top", type=int, default=enrich_peaks.ENRICH_TOP)
    parser.add_argument("--dry-run", action="store_true")
    # Stop after enrich. v2 puts two measurement passes between enrich and
    # export (terrain.py and season.py), and the orchestrator runs them in
    # that order rather than exporting twice.
    parser.add_argument("--skip-export", action="store_true")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or harvest_peaks.COUNTRIES
    started = time.time()

    if not args.skip_harvest:
        print(f"[1/3] harvest: {len(countries)} countries")
        for cc in countries:
            try:
                harvest_peaks.harvest_country(cc, refresh=args.refresh,
                                              shortlist_n=args.shortlist)
            except KeyboardInterrupt:
                raise
            except Exception as exc:                  # noqa: BLE001
                print(f"  {cc}: harvest failed ({exc})")

    if not args.skip_enrich:
        print(f"[2/3] enrich: {len(countries)} countries")
        dests = enrich_peaks.NearIndex(enrich_peaks.build_dest_index())
        for cc in countries:
            if load_cache("raw", cc) is None:
                continue
            try:
                enrich_peaks.enrich_country(
                    cc, refresh=args.refresh, dests=dests,
                    images=not args.no_images,
                    context=not args.no_context, top=args.top)
            except KeyboardInterrupt:
                raise
            except Exception as exc:                  # noqa: BLE001
                print(f"  {cc}: enrich failed ({exc})")

    if args.skip_export:
        print(f"[mountains] harvest and enrich done in "
              f"{(time.time() - started) / 60:.1f} min, export skipped")
        return

    print("[3/3] export")
    argv = ["export_peaks.py"]
    if wanted:
        argv += ["--countries", ",".join(wanted)]
    argv += ["--dry-run", "--verbose"] if args.dry_run else ["--verbose"]
    sys.argv = argv
    export_peaks.main()

    print(f"[mountains] done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
