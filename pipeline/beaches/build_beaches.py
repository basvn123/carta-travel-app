"""Build the whole beach layer, from nothing to shipped wire, in one command.

Tier: Scheduled (run_pipeline task beaches)

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
    --shortlist N         beaches per country to enrich; default: sized from
                          the country's region quotas, as enrich_beaches.py
    --no-context          skip the Overpass ground truth (beach_context fills it)
    --max-hours H         start no country's enrich after H hours; the export
                          still runs, from the caches as they stand
    --dry-run             say what would ship, write nothing

D25 i (2026-11-23): --shortlist used to default to the flat floor of 170, so
every rebuild through this command undid the quota sizing enrich_beaches.py
applies (Greece and Norway want 2,600, France 1,896) and cut the rich caches
back to 170 rows, which is why the box's export came out at about 3,200 rows
against 6,619 live. The task runs it with --no-context and --max-hours, so the
photographs for the larger shortlists come in without waiting on Overpass, and
a slow day cannot hold the box's queue for days; the publish gate judges what
the export makes of it.
"""

import argparse
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# Same guard build_lakes.py carries: a cp1252 console cannot encode the Greek
# and Cyrillic beach names this layer now deliberately harvests, and a print
# of one would take the stage down mid-run for a terminal problem.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

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
    # None: enrich_beaches.shortlist_size picks it from the region quotas.
    parser.add_argument("--shortlist", type=int, default=None)
    parser.add_argument("--no-context", action="store_true")
    parser.add_argument("--max-hours", type=float, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    deadline = None
    if args.max_hours:
        deadline = time.monotonic() + args.max_hours * 3600
        # The same clock stops enrich_beaches' Overpass batches mid country.
        enrich_beaches.DEADLINE = deadline

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
        aspect_reader, protection_reader = enrich_beaches.make_readers()
        left = []
        for cc in countries:
            if load_cache("raw", cc) is None:
                continue
            if deadline is not None and time.monotonic() > deadline:
                left.append(cc)
                continue
            try:
                enrich_beaches.enrich_country(
                    cc, shortlist_n=args.shortlist, refresh=args.refresh,
                    bathing=bathing, protected=protected, dests=dests,
                    context=not args.no_context,
                    aspect_reader=aspect_reader,
                    protection_reader=protection_reader)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: enrich failed ({exc})")
        if left:
            print(f"  --max-hours {args.max_hours:g} reached; not enriched this run: "
                  f"{', '.join(left)} (their caches stand as they are)")

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
