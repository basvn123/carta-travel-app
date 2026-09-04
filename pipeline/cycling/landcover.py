"""The scenic score's missing input: what kind of country a route rides through.

THE HOLE THIS FILLS. Brief 07 specifies the scenic composite with a
"forest/water fraction from ESA WorldCover (CC BY 4.0, 10 m) or Corine", and
the layer shipped without it because WorldCover at 10 m is roughly 100 GB for
Europe. Under invariant 6 the component simply dropped and the remaining four
renormalised, which is correct behaviour and still left nothing measuring that
one route crosses moorland and another passes a retail park. It is the
component that ties the Highlands with a canal towpath.

WHY OSM RATHER THAN THE TWO SOURCES THE BRIEF NAMES. Both are cleared and
either would work. OSM wins on three counts that matter here and none of them
is quality:

  the extracts are ALREADY ON DISK. The cycling harvest reads the same 44
  per-country .osm.pbf files, so this costs no download and no new licence
  row: ODbL, already the backbone of this layer.
  it is vector, so the measurement is an intersection rather than a raster
  sample, and PostGIS already holds the route geometry in EPSG:3035.
  it carries the distinction a rider cares about. WorldCover says "tree
  cover"; OSM says `landuse=forest` against `natural=wood`, `natural=water`
  against `landuse=reservoir`, and `natural=scrub` against `natural=heath`.

The cost is that OSM land cover is uneven, which is exactly why `known_share`
ships beside the fraction and why a route whose corridor is mostly untagged
reads as UNMEASURED rather than as built-up. Same discipline as the surface
and safety metrics.

THREE CLASSES, not one. "Forest/water fraction" is the brief's phrase but it
buries a distinction: an open moor is not scenically the same as a retail
park, and calling both "not forest" would rank the Cairngorms with Slough.

  wild    forest, wood, heath, moor, scrub, grassland, fell, glacier, wetland
  water   water, reservoir, bay, strait, and riverbanks
  built   residential, industrial, retail, commercial, quarry, landfill

`built` is measured and then SUBTRACTED, so the component reads "how much of
this ride is through open country and how little through a business park".

WHAT THIS TABLE IS, for anyone joining against it from another layer. ONE ROW
IS ONE MAPPED OSM FEATURE, not a dissolved union: 151,815 rows carry 151,764
distinct `osm_ref` values (`w<id>` for a closed way, `r<id>` for a
multipolygon relation), and `name` is carried where OSM has one. What it is
NOT is a catalogue of Europe's forests. It is a CORRIDOR SAMPLE, bounded to
the grid cells a cycle route passes through, so a named wood with no cycle
route near it is simply absent and always will be. That bound is the reason a
layer wanting named natural features needs its own table rather than deriving
one from this.

BOUNDED BY THE CORRIDOR. Germany alone has millions of landuse polygons and
we need only what a rider can see. Every pass is filtered to the grid cells a
cycle route actually passes through, the same trick enrich_cycling.py uses for
service towns, which turns a country-sized problem into a route-sized one.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/landcover.py --countries GB
    python pipeline/cycling/landcover.py --countries GB --measure-only
    python pipeline/cycling/landcover.py --status
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
import osmium

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

connect = S.lab_connect

# The corridor a rider can see, and the grid the extraction is bounded to.
# 500 m each side: wide enough that a road along the edge of a forest counts
# as riding through it, narrow enough that the next valley does not.
CORRIDOR_M = 500
GRID_DEG = 0.05                     # about 5.5 km, the services grid
# Below this an area is somebody's garden or a village pond, and a million of
# them would swamp the measurement without moving it.
MIN_AREA_M2 = 20_000                # 2 hectares

# WILD is wilderness. FARM is green and worked. The split is not pedantry:
# measured over Luxembourg, `landuse=meadow` alone covers 423 km2 against
# forest's 953, so folding managed grassland into "wild" would have read most
# of lowland Europe as wilderness and flattened the very distinction this
# component exists to draw. Riding through vineyards is lovely and it is not
# the Cairngorms, so FARM counts at half weight rather than not at all.
#
# `leisure=nature_reserve` is deliberately absent from both: it is a
# DESIGNATION rather than a cover type, and the scenic score already has a
# `protected` component reading Natura 2000 and Emerald. Counting it here too
# would pay the same fact twice.
WILD = {
    ("landuse", "forest"), ("natural", "wood"), ("natural", "heath"),
    ("natural", "moor"), ("natural", "scrub"), ("natural", "grassland"),
    ("natural", "fell"), ("natural", "glacier"), ("natural", "wetland"),
    ("natural", "shingle"), ("natural", "sand"), ("natural", "beach"),
}
FARM = {
    ("landuse", "meadow"), ("landuse", "orchard"), ("landuse", "vineyard"),
    ("landuse", "allotments"),
}
FARM_WEIGHT = 0.5
WATER = {
    ("natural", "water"), ("landuse", "reservoir"), ("natural", "bay"),
    ("natural", "strait"), ("waterway", "riverbank"), ("landuse", "basin"),
}
BUILT = {
    ("landuse", "residential"), ("landuse", "industrial"),
    ("landuse", "retail"), ("landuse", "commercial"),
    ("landuse", "quarry"), ("landuse", "landfill"),
    ("landuse", "construction"), ("landuse", "garages"),
    ("landuse", "brownfield"), ("landuse", "military"),
    ("aeroway", "aerodrome"),
}
KIND_OF = {}
for _pair in WILD:
    KIND_OF[_pair] = "wild"
for _pair in FARM:
    KIND_OF[_pair] = "farm"
for _pair in WATER:
    KIND_OF[_pair] = "water"
for _pair in BUILT:
    KIND_OF[_pair] = "built"

KEYS = ("landuse", "natural", "waterway", "leisure", "aeroway")

# STORED SIMPLIFIED, AND IN ONE PROJECTION ONLY. The first version of this
# table kept full-resolution outlines in both 4326 and 3035 and reached 14 GB
# across 34 countries, two thirds of the whole lab and enough to fill the
# machine's disk. Every vertex of it was waste: the only question ever asked
# of these polygons is what fraction of a 500 m corridor they cover, the
# corridor test has a 500 m tolerance, and nothing in this layer reads the
# 4326 column because every measurement is planar. 50 m simplification is two
# orders of magnitude finer than the question and about a tenth of the size.
SIMPLIFY_M = 50.0

DDL = """
CREATE TABLE IF NOT EXISTS cycle_landcover (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country    text NOT NULL,
    kind       text NOT NULL,            -- wild / water / farm / built
    tag        text NOT NULL,            -- landuse=forest, natural=wood, ...
    name       text,                     -- the OSM name, where it has one
    osm_ref    text,
    area_m2    double precision,
    geom_3035  geometry(Geometry, 3035)
);
CREATE INDEX IF NOT EXISTS cycle_landcover_3035_gist
    ON cycle_landcover USING gist (geom_3035);
CREATE INDEX IF NOT EXISTS cycle_landcover_cc_idx
    ON cycle_landcover (country, kind);
"""


def log(msg):
    print(f"[cycling] {msg}", flush=True)


def _grid_key(lat, lon):
    return (int(lat / GRID_DEG), int(lon / GRID_DEG))


def _corridor_cells(conn, cc):
    """Every grid cell a cycle route in this country passes through."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ST_AsText(ST_Simplify(ST_Force2D(geom), 0.01))
            FROM cycle_routes WHERE country = %s AND distance_m >= 1000
        """, (cc,))
        rows = cur.fetchall()
    import re
    pt = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")
    cells = set()
    for (wkt,) in rows:
        for lo, la in pt.findall(wkt or ""):
            la, lo = float(la), float(lo)
            # The cell plus its ring, so a polygon whose centroid is one cell
            # over from the line is still collected.
            k = _grid_key(la, lo)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    cells.add((k[0] + dy, k[1] + dx))
    return cells


def _kind_of(tags):
    for key in KEYS:
        val = tags.get(key)
        if val and (key, val) in KIND_OF:
            return KIND_OF[(key, val)], f"{key}={val}"
    return None, None


def extract(conn, cc, slug, verbose=False):
    """Land-cover polygons within the cycle corridor of one country."""
    pbf = S.extract_for(slug, False)
    cells = _corridor_cells(conn, cc)
    if not cells:
        log(f"landcover [{cc}]: no routes, nothing to bound the scan to")
        return 0
    log(f"landcover [{cc}]: {len(cells)} corridor cell(s)")

    wkt = osmium.geom.WKTFactory()
    t0 = time.time()
    rows, seen, kinds = [], 0, Counter()
    # AREA gives closed ways and multipolygon relations already assembled,
    # which is the whole reason to use pyosmium's area support rather than
    # stitching rings by hand as the route harvest has to.
    # AREA alone is not a readable entity set: assembling a multipolygon needs
    # the nodes for geometry, the ways for the rings and the relations for the
    # membership, so all four go in the mask and the loop keeps only the areas
    # that come out of it. Asking for AREA by itself raises "Nodes not read
    # from file", which is the same entity-mask trap the amenity scan hit.
    # THE FILTERS ARE THE DIFFERENCE BETWEEN 3.6 SECONDS AND NOT FINISHING.
    # with_areas() assembles every closed way that looks like an area, which
    # in a European extract means every building in the country. Passing the
    # key filter into with_areas() limits the first-pass relation candidates,
    # and the stream filter drops the rest before assembly. Measured over
    # Luxembourg: 141,779 candidate areas in 3.6 s filtered, against a pass
    # that had produced nothing after two minutes unfiltered.
    fp = osmium.FileProcessor(
        str(pbf),
        osmium.osm.NODE | osmium.osm.WAY | osmium.osm.RELATION | osmium.osm.AREA,
    ).with_areas(osmium.filter.KeyFilter(*KEYS))      .with_filter(osmium.filter.KeyFilter(*KEYS))
    for area in fp:
        if not isinstance(area, osmium.osm.Area):
            continue
        seen += 1
        kind, tag = _kind_of(area.tags)
        if not kind:
            continue
        # Locate BEFORE building geometry. An Area has no .envelope, and the
        # WKT factory is the expensive call in this loop, so the corridor test
        # runs against the first vertex of the first outer ring and only the
        # survivors are ever turned into a polygon.
        loc = None
        try:
            for ring in area.outer_rings():
                for node in ring:
                    if node.location.valid():
                        loc = node.location
                        break
                break
        except (RuntimeError, osmium.InvalidLocationError):
            continue
        if loc is None or _grid_key(loc.lat, loc.lon) not in cells:
            continue
        try:
            geom_wkt = wkt.create_multipolygon(area)
        except (RuntimeError, osmium.InvalidLocationError):
            continue
        if not geom_wkt:
            continue
        rows.append((cc, kind, tag, area.tags.get("name"),
                     f"{'w' if area.from_way() else 'r'}{area.orig_id()}",
                     geom_wkt))
        kinds[kind] += 1
        if len(rows) >= FLUSH_ROWS:
            _store(conn, rows)
            rows = []
    if rows:
        _store(conn, rows)
    total = sum(kinds.values())
    log(f"landcover [{cc}]: {total} polygon(s) kept of {seen} area(s) "
        f"({dict(kinds)}) in {time.time() - t0:.0f}s")
    return total


INSERT = """
    INSERT INTO cycle_landcover (country, kind, tag, name, osm_ref, area_m2,
                                 geom_3035)
    SELECT %s, %s, %s, %s, %s, ST_Area(p),
           -- MakeValid AFTER the simplify, not only before it. Despite the
           -- name, ST_SimplifyPreserveTopology can still emit a ring whose
           -- hole lies outside its shell, and GEOS then throws on the first
           -- intersection against it, which surfaces as a failed measurement
           -- for a whole country rather than as a bad row.
           ST_MakeValid(ST_SimplifyPreserveTopology(p, %s))
    FROM (SELECT ST_MakeValid(ST_Transform(
                     ST_MakeValid(ST_GeomFromText(%s, 4326)), 3035)) AS p) q
    WHERE GeometryType(p) IN ('POLYGON', 'MULTIPOLYGON')
      AND ST_Area(p) >= %s
"""


def _store(conn, rows):
    """Batched, because one round trip per polygon is the other bottleneck.

    executemany in psycopg3 pipelines the statements, which matters when a
    country contributes tens of thousands of them. A malformed polygon is
    rare and expensive to let poison a batch, so a failed batch falls back to
    one-by-one and drops only the row that is actually bad.
    """
    params = [(cc, kind, tag, name, ref, SIMPLIFY_M, geom_wkt, MIN_AREA_M2)
              for cc, kind, tag, name, ref, geom_wkt in rows]
    with conn.cursor() as cur:
        try:
            cur.executemany(INSERT, params)
            conn.commit()
            return
        except Exception:                                  # noqa: BLE001
            conn.rollback()
    with conn.cursor() as cur:
        for one in params:
            try:
                cur.execute(INSERT, one)
            except Exception:                              # noqa: BLE001
                conn.rollback()
                continue
    conn.commit()


# ---------------------------------------------------------------------------
# The measurement
# ---------------------------------------------------------------------------

MEASURE_SQL = """
    WITH r AS MATERIALIZED (
        -- quad_segs=2 gives the corridor eight segments per end cap instead
        -- of the default thirty-two. The band is a 500 m smear along a line
        -- whose own simplification is 20 m, so the extra vertices buy nothing
        -- and cost real time in the intersection against every polygon they
        -- touch.
        SELECT ST_Buffer(
                   ST_Transform(ST_Simplify(ST_Force2D(
                       coalesce(cr.geom, c.geom)), 0.0002), 3035),
                   %(corridor)s, 'quad_segs=2') AS band
        FROM cycle_routes c
        LEFT JOIN cycle_repairs cr
               ON cr.route_id = c.id AND cr.repaired
              AND cr.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(c.geom)))
        WHERE c.id = %(id)s
    ), hit AS (
        SELECT l.kind,
               ST_Union(ST_Intersection(r.band, l.geom_3035)) AS g
        FROM r, cycle_landcover l
        WHERE l.country = %(cc)s
          AND l.geom_3035 && r.band
          AND ST_Intersects(l.geom_3035, r.band)
        GROUP BY l.kind
    )
    SELECT (SELECT ST_Area(band) FROM r) AS band_m2,
           coalesce((SELECT ST_Area(g) FROM hit WHERE kind = 'wild'), 0),
           coalesce((SELECT ST_Area(g) FROM hit WHERE kind = 'water'), 0),
           coalesce((SELECT ST_Area(g) FROM hit WHERE kind = 'farm'), 0),
           coalesce((SELECT ST_Area(g) FROM hit WHERE kind = 'built'), 0)
"""


def repair_invalid(conn):
    """Fix any stored polygon GEOS will refuse to intersect.

    Cheap to run, and idempotent: rows written before the MakeValid moved
    after the simplify can carry a hole outside its shell.
    """
    with conn.cursor() as cur:
        cur.execute("""UPDATE cycle_landcover
                       SET geom_3035 = ST_MakeValid(geom_3035)
                       WHERE geom_3035 IS NOT NULL
                         AND NOT ST_IsValid(geom_3035)""")
        n = cur.rowcount
    conn.commit()
    if n:
        log(f"landcover: repaired {n} invalid polygon(s)")
    return n


def measure_one(conn, route_id, cc):
    """The land-cover reading for one route, or None when nothing is mapped.

    Returns {natural, wild, water, built, known_share}. `natural` is what the
    scenic score consumes: wild plus water, less the built share, clamped.

    known_share is the fraction of the corridor that carries ANY land-cover
    tag. Where OSM has mapped nothing the reading is absent, not zero: an
    unmapped corridor is not a built-up one, and this layer has been bitten
    once already by treating an empty table as a measurement.
    """
    try:
        with conn.cursor() as cur:
            cur.execute(MEASURE_SQL, {"id": route_id, "cc": cc,
                                      "corridor": CORRIDOR_M})
            got = cur.fetchone()
    except Exception as exc:                               # noqa: BLE001
        # One unrepairable polygon must not cost a country its land-cover
        # component. No reading is not a bad reading (invariant 6).
        conn.rollback()
        if str(exc).startswith(("GEOS", "lwgeom")):
            log(f"  route {route_id}: land cover unusable "
                f"({type(exc).__name__}), component dropped")
        return None
    if not got or not got[0]:
        return None
    band, wild, water, farm, built = (float(x or 0) for x in got)
    if band <= 0:
        return None
    known = (wild + water + farm + built) / band
    if known < 0.05:
        return None
    natural = max(0.0, (wild + water + FARM_WEIGHT * farm - built) / band)
    return {
        "natural": round(min(1.0, natural), 4),
        "wild": round(wild / band, 4),
        "water": round(water / band, 4),
        "farm": round(farm / band, 4),
        "built": round(built / band, 4),
        "known_share": round(min(1.0, known), 4),
        "corridor_m": CORRIDOR_M,
    }


# A wedged INSERT is worse than a failed one. psycopg3's executemany runs in
# pipeline mode, and a large batch can end up with the server waiting on the
# client while the client waits on the server: observed here as an INSERT
# sitting in ClientRead for 66 minutes on a 0.14 GB country. A statement
# timeout turns that into an exception the batch fallback can handle.
STATEMENT_TIMEOUT_S = 180
# Smaller batches for the same reason. 2,000 rows of polygon WKT is megabytes
# in one pipeline; 400 keeps each flush small enough to fail fast and cheap
# enough to retry row by row.
FLUSH_ROWS = 400


def ensure_schema(conn):
    """Create the table, and MIGRATE one that already exists.

    CREATE TABLE IF NOT EXISTS does nothing to a table that is already there,
    so a new column in DDL above reaches a fresh lab and silently misses every
    existing one, and the next INSERT fails on a column that the schema says
    exists. The explicit ADD COLUMN is what makes the DDL true of both.
    """
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = '{STATEMENT_TIMEOUT_S}s'")
        cur.execute(DDL)
        # ORDER MATTERS: the column has to exist before anything indexes it.
        # Putting the index in DDL above put it BEFORE this ALTER, so a lab
        # with the old table failed on "column name does not exist" while a
        # fresh one worked, which is the most annoying shape a migration bug
        # can take.
        cur.execute("""ALTER TABLE cycle_landcover
                       ADD COLUMN IF NOT EXISTS name text""")
        cur.execute("""CREATE INDEX IF NOT EXISTS cycle_landcover_name_idx
                       ON cycle_landcover (country, name)
                       WHERE name IS NOT NULL""")
    conn.commit()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="")
    ap.add_argument("--max-gb", type=float, default=0.0,
                    help="skip countries whose extract is larger than this. "
                         "Area assembly holds a node location index in "
                         "memory and it scales with the extract, so on a "
                         "loaded machine the big four are a separate run.")
    ap.add_argument("--refresh", action="store_true",
                    help="re-extract countries that already have polygons")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")

    with connect() as conn:
        ensure_schema(conn)
        if args.status:
            with conn.cursor() as cur:
                cur.execute("""SELECT country, kind, count(*)
                               FROM cycle_landcover GROUP BY 1,2 ORDER BY 1,2""")
                for row in cur.fetchall():
                    print("  %s %-6s %d" % row)
            return
        ccs = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
        if not ccs:
            with conn.cursor() as cur:
                cur.execute("SELECT DISTINCT country FROM cycle_routes ORDER BY 1")
                ccs = [r[0] for r in cur.fetchall()]
        slugs = S.slug_for_iso2()
        # SMALLEST EXTRACT FIRST, deliberately. pyosmium's area assembly holds
        # a node location index whose size follows the extract: Austria at
        # 0.81 GB sat at 1.26 GB resident, so France at 4.7 GB is several
        # times that on a machine with other sessions on it. Ordering by size
        # means a run that dies on the big ones has still banked every small
        # and medium country, rather than dying alphabetically at Germany with
        # thirty countries untouched.
        sized = []
        for cc in ccs:
            slug = slugs.get(cc)
            if not slug:
                log(f"landcover [{cc}]: no Geofabrik slug, skipped")
                continue
            pbf = S.cached_extract(slug)
            gb = (pbf.stat().st_size / 1e9) if pbf else 0.0
            sized.append((gb, cc, slug))
        sized.sort()
        deferred = [(gb, cc) for gb, cc, _ in sized
                    if args.max_gb and gb > args.max_gb]
        if deferred:
            log("landcover: deferring " + ", ".join(
                f"{cc} ({gb:.1f} GB)" for gb, cc in deferred)
                + f" over --max-gb {args.max_gb}")
        total = 0
        for gb, cc, slug in sized:
            if args.max_gb and gb > args.max_gb:
                continue
            # RESUMABLE. Re-running the stage after a crash should not redo
            # the countries that finished: at 685 to 1,624 seconds per GB
            # that is hours of repeated work, and it is why a stall halfway
            # through Europe used to mean starting Europe again.
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM cycle_landcover "
                            "WHERE country = %s", (cc,))
                have = cur.fetchone()[0]
            if have and not args.refresh:
                log(f"landcover [{cc}]: {have} polygon(s) already, skipping "
                    f"(--refresh to redo)")
                continue
            with conn.cursor() as cur:
                cur.execute("DELETE FROM cycle_landcover WHERE country = %s", (cc,))
            conn.commit()
            total += extract(conn, cc, slug, args.verbose)
            repair_invalid(conn)
        done = len(sized) - len(deferred)
        log(f"landcover: {total} polygon(s) across {done} country(ies)"
            + (f", {len(deferred)} deferred" if deferred else ""))


if __name__ == "__main__":
    main()
