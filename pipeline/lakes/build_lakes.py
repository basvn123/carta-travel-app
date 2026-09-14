"""Build the whole lake layer, from nothing to shipped wire, in one command.

    python pipeline/lakes/build_lakes.py

That is the reproducible path. Five stages run in order, each idempotent and
each caching its own answer, so the command can be interrupted and repeated
and it picks up rather than starts over:

    climate   CHELSA V2.1 monthly normals, cropped to Europe once
                                           ->  cache/lakes/chelsa/
    osm       every named water body in the Geofabrik extract of a country,
              with what is on its shore    ->  cache/lakes/osm_CC.json
    harvest   Wikidata + OSM + the curated seed
                                           ->  cache/lakes/raw_CC.json
    enrich    EEA bathing water, protected areas, the climate sample, our own
              trails wire, Commons photographs, Wikipedia facts, Overpass
              shore truth                  ->  cache/lakes/rich_CC.json
    export    score, gate, fill the region and country floors, validate
                                           ->  continent-app/public/lakes/

The first two are new in v2 and both are offline: the climate crop is one
download and then a local raster, and the OSM sweep reads extracts that
data/raw/geofabrik already holds. Neither asks a public API a country sized
question.

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

Time: a cold build is a day, and most of it is two things: the OSM extract
filter (CPU, offline, about an hour a gigabyte of extract) and Wikimedia
photographs (network, paced, about fifteen requests a lake). A warm re-run is
seconds. Run it cold after a Bathing Water
Directive season lands, or when the seed changes.

Options:
    --countries SI,HR     only these
    --refresh             re-query even where a cache exists
    --skip-climate        the CHELSA crop is already on disk
    --skip-osm            the extract sweep is already on disk
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

# Windows consoles and redirected pipes default to cp1252, which cannot encode
# a Latvian, Icelandic or Polish lake name. A print of one then raises
# UnicodeEncodeError and takes the stage down; the lake export died on
# "Lielais Baltezers" halfway through a logged run. The data was never the
# problem, the terminal was, so say so once here.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


import harvest_lakes  # noqa: E402
import enrich_lakes  # noqa: E402
import lake_climate  # noqa: E402
import osm_water  # noqa: E402
import export_lakes  # noqa: E402
from water_sources import load_cache  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-climate", action="store_true")
    parser.add_argument("--skip-osm", action="store_true")
    parser.add_argument("--skip-harvest", action="store_true")
    parser.add_argument("--skip-enrich", action="store_true")
    parser.add_argument("--no-context", action="store_true")
    parser.add_argument("--shortlist", type=int, default=enrich_lakes.SHORTLIST)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or harvest_lakes.COUNTRIES
    started = time.time()

    if not args.skip_climate:
        print("[1/5] climate: CHELSA normals for Europe")
        try:
            lake_climate.fetch(refresh=args.refresh)
        except Exception as exc:
            print(f"  climate crop failed ({exc}); the swimming season will "
                  f"be skipped for lakes with no cached sample")

    if not args.skip_osm:
        print(f"[2/5] osm: {len(countries)} countries")
        for cc in countries:
            try:
                osm_water.sweep_country(cc, refresh=args.refresh)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"  {cc}: osm sweep failed ({exc})")

    if not args.skip_harvest:
        print(f"[3/5] harvest: {len(countries)} countries")
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
        print(f"[4/5] enrich: {len(countries)} countries")
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

    print("[5/5] export")
    argv = ["export_lakes.py"]
    if wanted:
        argv += ["--countries", ",".join(wanted)]
    argv += ["--dry-run", "--verbose"] if args.dry_run else ["--verbose"]
    sys.argv = argv
    export_lakes.main()

    print(f"[lakes] done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
