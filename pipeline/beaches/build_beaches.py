"""Build the whole beach layer, from nothing to shipped wire, in one command.

    python pipeline/beaches/build_beaches.py

That is the reproducible path. Three stages run in order, each idempotent and
each caching its own answer, so the command can be interrupted and repeated
and it will pick up rather than start over:

    harvest   Wikidata + OpenStreetMap  ->  cache/beaches/raw_CC.json
    enrich    EEA water, protected areas, the catalogue, Commons photographs,
              Wikipedia facts, Overpass ground truth
                                        ->  cache/beaches/rich_CC.json
    export    score, gate, validate      ->  continent-app/public/beaches/

What makes a rebuild reproducible rather than merely repeatable:

  the caches are the snapshot.  Re-running with the caches in place produces
  byte identical wire files, because every stage reads them and nothing reads
  the clock except the generated_at stamp. Delete a cache to re-query that
  source, and only that source.
  every stage is deterministic.  Sorting is by score then id, never by dict
  order; the shortlist is cut by a documented pre score; ties break on the id.
  the model is versioned.  beauty_index.MODEL_VERSION and the weights ride in
  index.json, so a wire file can always be matched to the model that scored it.
  the inputs are dated.  index.json carries the harvest and enrich timestamp
  per country and the mtime of the EEA cache, which is what tells you whether
  a difference between two builds came from the code or from the world.

Time: a cold build is a few hours, nearly all of it Overpass being polite to
(one country query per country, then one context query per 30 beaches). A warm
re-run is seconds. Run it cold after a Bathing Water Directive season lands, or
when a country's beach coverage in OSM has visibly moved.

Options:
    --countries GR,HR     only these
    --refresh             re-query even where a cache exists
    --skip-harvest        start from the raw caches (they are the slow part)
    --skip-enrich         re-score and re-export from the rich caches only
    --dry-run             say what would ship, write nothing
"""

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import harvest_beaches  # noqa: E402
import enrich_beaches  # noqa: E402
import export_beaches  # noqa: E402
from sources import load_cache  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-harvest", action="store_true")
    parser.add_argument("--skip-enrich", action="store_true")
    parser.add_argument("--shortlist", type=int, default=enrich_beaches.SHORTLIST)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or harvest_beaches.COUNTRIES
    started = time.time()

    if not args.skip_harvest:
        print(f"[1/3] harvest: {len(countries)} countries")
        for cc in countries:
            try:
                harvest_beaches.harvest_country(cc, refresh=args.refresh)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: harvest failed ({exc})")

    if not args.skip_enrich:
        print(f"[2/3] enrich: {len(countries)} countries")
        bathing = enrich_beaches.load_bathing()
        protected = enrich_beaches.load_protected()
        dests = enrich_beaches.NearIndex(enrich_beaches.build_dest_index())
        for cc in countries:
            if load_cache("raw", cc) is None:
                continue
            try:
                enrich_beaches.enrich_country(
                    cc, shortlist_n=args.shortlist, refresh=args.refresh,
                    bathing=bathing, protected=protected, dests=dests)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: enrich failed ({exc})")

    print("[3/3] export")
    argv = ["export_beaches.py"]
    if wanted:
        argv += ["--countries", ",".join(wanted)]
    if args.dry_run:
        argv += ["--dry-run", "--verbose"]
    else:
        argv += ["--verbose"]
    sys.argv = argv
    export_beaches.main()

    print(f"[beaches] done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
