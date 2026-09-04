"""Named forests as AREAS, from the extracts, because Overpass is the wrong door.

The tenth highlight code. Nine of the ten (`summit`, `lake`, `castle`,
`viewpoint`, `gorge`, `hut`, `coast`, `waterfall`, and `village` when the next
sweep lands) are points, and points come from scenic.py's per-cell Overpass
sweep. Forests are not points, and trying to fetch them the same way was a
measured mistake worth recording rather than repeating:

    features per cell   2,215  ->  12,246
    time per cell       seconds -> 1.8 minutes
    Europe              an hour -> 13 hours
    the mirrors         fine    -> both live ones returning 504

A 1.5 degree grid cell is roughly the size of Belgium, and asking a free
shared Overpass mirror for every named wood inside one is not a targeted
sweep. It breaks scenic.py's own rule, stated in its header: extracts are the
bulk channel and Overpass is for targeted sweeps.

So this reads the Geofabrik extracts, which are already on disk for
ingest_osm_routes.py and way_tags.py (30 GB, no re-download), cost nobody
else anything, and can run whenever those files are refreshed.

WHY AN AREA AND NOT A CENTROID. A forest is the one highlight where the
question is "does the route go THROUGH it", not "does it pass NEAR a point".
The Black Forest's centroid is 30 km from most walks inside it, so a centroid
would report the wrong answer in both directions: silent on routes that spend
all day under its trees, and positive for a route that passes near the middle
without entering. Areas are stored as polygons in their own table and joined
by distance-to-the-polygon, which is zero when the route is inside it.

WHY NAMED ONLY. The same rule the peaks and the lakes follow. The Forest of
Dean is a reason to walk somewhere; an unnamed patch of trees is scenery
everybody already assumed, and there are millions of them.

WHY IT SCORES NOTHING. `KINDS["forest"]` is 0.0 in scenic.py, the same
decision as `village`. It earns a chip, because "through the Bois de
Vincennes" is a different day from "round a reservoir", and it earns no
weight in the scenery signal, because a large share of European walks pass
through woodland and letting each one carry even 0.2 would make the densest
walk in the catalogue a stroll through a plantation.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/forests.py                  # every curated country
    python pipeline/trails/forests.py --countries CH,AT --verbose
    python pipeline/trails/forests.py --refresh        # re-read done countries
"""

import argparse
import sys
import time
from pathlib import Path

import osmium
import osmium.geom

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402
from ingest_osm_routes import COUNTRIES, cached_extract  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "08_forests.sql"

# What counts as a forest. Both tags mean the same thing on the ground and
# mappers disagree about which to use, so a layer that read only one would be
# systematically blind in whichever countries prefer the other.
FOREST_TAGS = (("natural", "wood"), ("landuse", "forest"))

# Below this a "forest" is a copse, and a copse with a name is usually a field
# boundary somebody labelled. 5 hectares is about seven football pitches.
MIN_AREA_M2 = 50_000

# Above this it is a region rather than a place. A handful of national and
# provincial forest administrative areas span whole counties, and a route
# "passing through" one of those says nothing a reader can use.
#
# 2,000 km2 is deliberately well BELOW the size of the famous named massifs
# (the Black Forest is about 6,000 km2), and that is safe because OSM does not
# map them as single polygons: the Black Forest is its constituent woods, each
# comfortably inside this bound, and each of them is the thing a walk actually
# goes through. If a future extract does carry one giant polygon for a massif,
# this bound will drop it and the symptom will be a famous forest missing from
# every route in it.
MAX_AREA_M2 = 2_000_000_000

# Above this extract size the node index goes to DISK instead of RAM.
# `sparse_file_array` trades speed for a flat memory profile; the index file
# is deleted after each country, so the cost is transient disk rather than
# resident memory.
DISK_INDEX_BYTES = 1_500_000_000
INDEX_DIR = ROOT / "cache" / "trails" / "nodeidx"


# The filter that decides what is even a CANDIDATE for area assembly, applied
# in the FIRST pass, before any multipolygon is built.
#
# This is the whole memory story. Germany's extract holds millions of
# multipolygons (every building outline, every field, every administrative
# boundary), and assembling all of them to keep the 0.1% that are named woods
# cost 4.9 GB and took host free memory to a few hundred megabytes with four
# other sessions running. Filtering first means the assembler only ever sees
# wood and forest relations, and never allocates for the rest.
#
# TagFilter matches key AND value, which is what is wanted here: `natural` on
# its own would readmit every coastline, scrub and water body in the country.
AREA_FILTER = osmium.filter.TagFilter(("natural", "wood"), ("landuse", "forest"))


def scan(pbf_path, verbose=False):
    """Every named forest area in one extract, in bounded memory.

    Two things keep this flat on a 5 GB file, and both matter:

      the FILTER above, so only wood and forest relations are assembled at
      all rather than every multipolygon in the country;
      a DISK node index on big extracts, because location caching for a whole
      country is gigabytes on its own.

    A pass that finishes by starving its neighbours has not finished: this
    machine runs four or five pipeline sessions at once, and taking host free
    memory to a few hundred megabytes is what wedges the WSL VM and drops the
    lab for everybody.
    """
    wkbfab = osmium.geom.WKBFactory()
    rows, broken = [], 0

    big = pbf_path.stat().st_size > DISK_INDEX_BYTES
    idx_file = None
    fp = osmium.FileProcessor(str(pbf_path))
    if big:
        INDEX_DIR.mkdir(parents=True, exist_ok=True)
        idx_file = INDEX_DIR / f"{pbf_path.stem}.nodes"
        idx_file.unlink(missing_ok=True)
        fp = fp.with_locations(f"sparse_file_array,{idx_file}")
        if verbose:
            print(f"    node index on disk ({idx_file.name}), extract is over "
                  f"{DISK_INDEX_BYTES / 1e9:.1f} GB", flush=True)
    fp = fp.with_areas(AREA_FILTER)

    try:
        for obj in fp:
            if not isinstance(obj, osmium.osm.Area):
                continue
            name = (obj.tags.get("name") or "").strip()
            if not name:
                continue
            if not any(obj.tags.get(k) == v for k, v in FOREST_TAGS):
                continue
            try:
                wkb = wkbfab.create_multipolygon(obj)
            except Exception:
                # An unclosed or self-intersecting multipolygon. OSM has
                # plenty; they are somebody else's repair job, not this
                # pass's.
                broken += 1
                continue
            if not wkb:
                continue
            # from_way() tells a closed way from an assembled relation, and
            # the osm_ref has to distinguish them or a way and a relation with
            # the same id would collide on the unique index.
            rows.append((f"{'w' if obj.from_way() else 'r'}{obj.orig_id()}",
                         name, wkb))
    finally:
        if idx_file is not None:
            idx_file.unlink(missing_ok=True)

    if verbose:
        print(f"    {len(rows):,} named forest area(s), "
              f"{broken:,} unassemblable", flush=True)
    return rows


# Simplified before storing, and the tolerance is the reason it is safe.
#
# The only question ever asked of this geometry is "is the route within
# HIGHLIGHT_M (250 m) of this forest", so a boundary detailed to the metre is
# storing three orders of magnitude more precision than the answer can use. A
# full-resolution OSM forest multipolygon runs to thousands of vertices, and
# there are tens of thousands of them; on a machine that ran out of disk while
# this was being written, that is not a free choice.
#
# 0.0002 degrees is about 22 m at European latitudes: an order of magnitude
# inside the 250 m test, so no route changes its answer, and it typically
# drops the vertex count by 80 to 95 per cent. PreserveTopology rather than
# plain ST_Simplify, because a plain simplify can collapse a narrow strip of
# woodland to nothing and silently lose the forest rather than coarsen it.
SIMPLIFY_DEG = 0.0002

INSERT_SQL = """
    INSERT INTO scenic_areas (osm_ref, kind, name, geom, area_m2)
    SELECT %s, 'forest', %s,
           ST_Multi(ST_CollectionExtract(
               ST_MakeValid(ST_SimplifyPreserveTopology(g, %s)), 3)),
           ST_Area(g::geography)
    FROM (SELECT ST_MakeValid(
              ST_SetSRID(ST_GeomFromWKB(%s::bytea), 4326)) AS g) s
    WHERE ST_Area(g::geography) BETWEEN %s AND %s
    ON CONFLICT (osm_ref) DO NOTHING
"""

BATCH = 500


def store(conn, rows, verbose=False):
    """Insert, letting PostGIS decide the area and reject the outliers.

    ST_MakeValid before simplifying, because an OSM multipolygon that
    assembled without raising can still be self-intersecting, and an invalid
    geometry makes every later ST_DWithin against it throw rather than return
    false. The area test reads the UNsimplified outline, so a forest sitting
    near the 5 hectare floor cannot be simplified under it and vanish.
    """
    written = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH):
            chunk = [(ref, name, SIMPLIFY_DEG, bytes.fromhex(wkb),
                      MIN_AREA_M2, MAX_AREA_M2)
                     for ref, name, wkb in rows[i:i + BATCH]]
            cur.executemany(INSERT_SQL, chunk)
            written += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        conn.commit()
    return written


def done_countries(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT country FROM scenic_areas "
                    "WHERE country IS NOT NULL")
        return {r[0] for r in cur.fetchall()}


def curated_countries(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT country FROM trips
            WHERE category = 'hike' AND status IN ('approved', 'published')
              AND country IS NOT NULL
            ORDER BY 1
        """)
        return [r[0] for r in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="", help="comma separated ISO2")
    ap.add_argument("--refresh", action="store_true",
                    help="re-read countries that already have forests stored")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    # A node index left behind by a killed run. The `finally` in scan() covers
    # a normal exit and an exception, but not a SIGKILL, and this pass was
    # killed twice while its memory profile was being worked out: France left
    # 8.4 GB sitting in the cache on a machine that had just run out of disk.
    # Cheap to check, and the alternative is a silent multi-GB leak.
    if INDEX_DIR.exists():
        stale = list(INDEX_DIR.glob("*.nodes"))
        if stale:
            freed = sum(f.stat().st_size for f in stale)
            for f in stale:
                f.unlink(missing_ok=True)
            print(f"cleared {len(stale)} stale node index file(s), "
                  f"{freed / 1e9:.1f} GB")

    conn = connect()
    ensure(conn, SCHEMA_SQL, verbose=args.verbose)

    wanted = {c.strip().upper() for c in args.countries.split(",") if c.strip()}
    if not wanted:
        wanted = set(curated_countries(conn))
    already = set() if args.refresh else done_countries(conn)

    # Slug order by extract size ascending, so a run that is interrupted has
    # finished the most countries it could rather than the fewest.
    todo = [(slug, cc) for slug, cc in COUNTRIES.items()
            if cc in wanted and cc not in already]
    sized = []
    for slug, cc in todo:
        pbf = cached_extract(slug)
        if pbf is None:
            print(f"[{slug}] no extract on disk, skipped "
                  f"(run ingest_osm_routes.py first)")
            continue
        sized.append((pbf.stat().st_size, slug, cc, pbf))
    sized.sort()

    if already:
        print(f"{len(already)} country(ies) already have forests, skipping "
              f"(use --refresh to re-read)")
    print(f"{len(sized)} extract(s) to scan\n")

    started = time.time()
    total = 0
    for n, (size, slug, cc, pbf) in enumerate(sized, 1):
        t0 = time.time()
        print(f"[{slug}] scanning {size / 1e9:.1f} GB ...", flush=True)
        rows = scan(pbf, verbose=args.verbose)
        written = store(conn, rows, verbose=args.verbose)
        with conn.cursor() as cur:
            # The country column records which scan found it, the same
            # convention scenic_pois uses: a forest straddling a border is
            # found once and the join that matters is spatial.
            cur.execute("UPDATE scenic_areas SET country = %s "
                        "WHERE country IS NULL", (cc,))
        conn.commit()
        total += written
        print(f"[{slug}] {written:,} forest(s) stored of {len(rows):,} found "
              f"({time.time() - t0:.0f}s, {n}/{len(sized)})", flush=True)

    print("\n" + "=" * 58)
    print(f"{total:,} named forest area(s) stored in "
          f"{(time.time() - started) / 60:.1f} min")
    print("run pipeline/trails/scenic.py --link-only next, so the routes pick "
          "them up")
    conn.close()


if __name__ == "__main__":
    main()
