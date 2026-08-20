"""Build the whole lake layer, from nothing to shipped wire, in one command.

    python pipeline/lakes/build_lakes.py

That is the reproducible path. Three stages run in order, each idempotent and
each caching its own answer, so the command can be interrupted and repeated
and it picks up rather than starts over:

    harvest   Wikidata + the curated seed  ->  cache/lakes/raw_CC.json
    enrich    EEA bathing water, protected areas, WorldClim, our own trails
              wire, Commons photographs, Wikipedia facts, Overpass shore truth
                                           ->  cache/lakes/rich_CC.json
    export    score, gate, fill the country floor, validate
                                           ->  continent-app/public/lakes/

What makes a rebuild reproducible rather than merely repeatable:

  the caches are the snapshot.  Re-running with the caches in place produces
  byte identical wire files, because every stage reads them and nothing reads
  the clock except the generated_at stamp. Delete a cache to re-query that
  source, and only that source.
  every stage is deterministic.  Sorting is by score then name, never by dict
  order; the shortlist is cut by a documented pre score; ties break on a name.
  the model is versioned.  lake_index.MODEL_VERSION and the weights ride in
  index.json, so a wire file can always be matched to the model that scored it.
  the inputs are dated.  index.json carries the harvest and enrich timestamp
  per country and the mtime of the EEA cache, which is what tells you whether
  a difference between two builds came from the code or from the world.

Time: a cold build is a few hours, and unlike the beach layer most of it is
Wikimedia rather than Overpass, because this layer never sweeps a country for
geometry. A warm re-run is seconds. Run it cold after a Bathing Water
Directive season lands, or when the seed changes.

Options:
    --countries SI,HR     only these
    --refresh             re-query even where a cache exists
    --skip-harvest        start from the raw caches
    --skip-enrich         re-score and re-export from the rich caches only
    --no-context          leave Overpass alone (it can run alongside another
                          layer's harvest that way)
    --dry-run             say what would ship, write nothing
"""

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import harvest_lakes  # noqa: E402
import enrich_lakes  # noqa: E402
import export_lakes  # noqa: E402
from water_sources import load_cache  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-harvest", action="store_true")
    parser.add_argument("--skip-enrich", action="store_true")
    parser.add_argument("--no-context", action="store_true")
    parser.add_argument("--shortlist", type=int, default=enrich_lakes.SHORTLIST)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or harvest_lakes.COUNTRIES
    started = time.time()

    if not args.skip_harvest:
        print(f"[1/3] harvest: {len(countries)} countries")
        classes = harvest_lakes.lake_classes()
        for cc in countries:
            try:
                harvest_lakes.harvest_country(cc, refresh=args.refresh,
                                              classes=classes)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: harvest failed ({exc})")

    if not args.skip_enrich:
        print(f"[2/3] enrich: {len(countries)} countries")
        bathing = enrich_lakes.load_bathing()
        protected = enrich_lakes.load_protected()
        dests = enrich_lakes.NearIndex(enrich_lakes.build_dest_index())
        for cc in countries:
            if load_cache("raw", cc) is None:
                continue
            try:
                enrich_lakes.enrich_country(
                    cc, shortlist_n=args.shortlist, refresh=args.refresh,
                    bathing=bathing, protected=protected, dests=dests,
                    context=not args.no_context)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: enrich failed ({exc})")

    print("[3/3] export")
    argv = ["export_lakes.py"]
    if wanted:
        argv += ["--countries", ",".join(wanted)]
    argv += ["--dry-run", "--verbose"] if args.dry_run else ["--verbose"]
    sys.argv = argv
    export_lakes.main()

    print(f"[lakes] done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
