"""Bridge the short breaks that OSM route relations leave in otherwise whole trails.

curate.py refuses any route whose geometry is not one continuous line, because
a multi-part GPX draws a walk that teleports and no hiking app can follow it.
That gate is right, and it is also blunt: it threw away the Walker's Haute
Route over a SEVEN METRE break between two parts of its relation, and 10,757
other routes whose every gap is under 300 m.

Those gaps are not missing legs of the walk. They are what happens when a
mapper splits a way at a road crossing and the relation loses a ten metre
connector, or when the country extract clips a way at the border. The walk is
continuous on the ground; the relation is not.

So: where EVERY break in a relation is short enough to be a mapping artefact,
the parts are joined in relation order with a straight connector and the
result stored as a repair. Where any break is real, nothing is written and the
route stays out, which is why Offa's Dyke Path (one 189 km gap) and Likya Yolu
(twenty-one gaps up to 138 km) are still not published.

How this differs from repair.py, which is the other half of this idea:
repair.py ROUTES across a gap with a local Valhalla, which is the better answer
and needs per-country routing tiles (1.8 GB each, only Switzerland has them).
This needs nothing, produces a straight line rather than a path, and is
therefore held to a much tighter bound: a gap Valhalla would happily route
around for two kilometres is refused here. Both write to trip_repairs and both
are read the same way, so a country that later gets Valhalla tiles can have
its splices replaced by real routing without anything downstream changing.

Honesty, since a straight connector is a claim about ground we have not
checked: the count and the total length of the bridges ride in repair_info,
export_wire ships them, and the trail page says the route has short bridged
breaks. Z is carried through from the real points either side, so ascent and
the elevation profile stay valid without re-sampling; only the distance grows,
by the length of the connectors.

Runs after curate.py has marked loops and before it selects, or standalone at
any time: it only ever adds repairs, never changes trips.geom.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/splice.py --dry-run
    python pipeline/trails/splice.py
    python pipeline/trails/splice.py --countries CH,DE --verbose
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402

# The longest break this will bridge with a straight line, in metres.
#
# 300 m is about three football pitches. Below it, on a waymarked route, the
# connector is a path somebody forgot to add to the relation; above it, we
# would be inventing a leg of the walk. Measured against the four flagship
# routes this recovers: Walker's Haute Route 7 m, Glowny Szlak Beskidzki 62 m,
# Malerweg 179 m, Besseggen 251 m.
SPLICE_M = 300.0

# A relation with more breaks than this is not a whole route with an artefact,
# it is a route that was never finished. Likya Yolu has twenty-one.
MAX_GAPS = 8

# How much of a route may be bridged in total, as an absolute length and as a
# share. Both, because either alone gets a class of route wrong:
#
#   absolute only   eight 290 m bridges on a 4 km walk is 2.3 km, refused.
#   share only      a share cap punishes short routes for their length. At
#                   1.5% it threw out Besseggen, Norway's best known day hike:
#                   two breaks of about 250 m on a 14 km route is 3.6% of it
#                   and 500 m of ground, which is a mapping artefact by any
#                   reading except a percentage.
MAX_SPLICE_M = 750.0
MAX_SPLICE_SHARE = 0.05


# ---------------------------------------------------------------------------
# Which routes qualify
# ---------------------------------------------------------------------------

# Every inter-part break of every multi-part candidate, so the caller can test
# a route on its worst gap and its total rather than one gap at a time.
GAPS_SQL = """
    WITH cand AS (
        SELECT t.id, t.country, t.title, t.distance_m, t.geom,
               ST_NumGeometries(t.geom) AS np
        FROM trips t
        WHERE t.category = 'hike' AND t.source = 'osm'
          AND t.status <> 'rejected'
          AND t.title NOT LIKE 'OSM route %%'
          AND t.distance_m BETWEEN 2000 AND 400000
          AND ST_NumGeometries(t.geom) BETWEEN 2 AND %(max_parts)s
          AND (%(countries)s::text[] IS NULL OR t.country = ANY(%(countries)s))
          AND NOT EXISTS (SELECT 1 FROM trip_repairs r WHERE r.trip_id = t.id
                          AND r.repair_info->>'source_geom_md5'
                              = md5(ST_AsBinary(ST_Force2D(t.geom))))
    ), gaps AS (
        SELECT c.id, c.country, c.title, c.distance_m, c.np,
               ST_Distance(
                   ST_EndPoint(ST_GeometryN(c.geom, i))::geography,
                   ST_StartPoint(ST_GeometryN(c.geom, i + 1))::geography) AS gap
        FROM cand c, generate_series(1, c.np - 1) AS i
    )
    SELECT id, country, title, distance_m, np,
           count(*) AS n_gaps, max(gap) AS max_gap, sum(gap) AS total_gap
    FROM gaps
    GROUP BY id, country, title, distance_m, np
    HAVING max(gap) <= %(splice_m)s
    ORDER BY country, id
"""

COLS = ("id", "country", "title", "distance_m", "np",
        "n_gaps", "max_gap", "total_gap")


def candidates(conn, countries, limit=0):
    with conn.cursor() as cur:
        cur.execute(GAPS_SQL, {
            "max_parts": MAX_GAPS + 1,
            "splice_m": SPLICE_M,
            "countries": list(countries) or None,
        })
        rows = [dict(zip(COLS, r)) for r in cur.fetchall()]
    keep = []
    for r in rows:
        length = max(1.0, float(r["distance_m"] or 0))
        total = float(r["total_gap"])
        r["share"] = total / length
        if total <= MAX_SPLICE_M and r["share"] <= MAX_SPLICE_SHARE:
            keep.append(r)
    return keep[:limit] if limit else keep


# ---------------------------------------------------------------------------
# The splice
# ---------------------------------------------------------------------------

# ST_DumpPoints over a MultiLineString yields path = {part, vertex}, so
# ordering by it walks the parts in relation order and each part in its own
# order. ST_MakeLine over that is one continuous line whose only new geometry
# is the straight segment across each break.
#
# The Z ordinate rides through untouched: every vertex is an original 3D point
# from the DEM sampling, and the connector simply joins two of them. That is
# what lets the ascent figures and the elevation profile survive a splice, and
# it is the one real advantage this has over the Valhalla path, which returns
# 2D geometry and forces a re-sample.
SPLICE_SQL = """
    WITH pts AS (
        SELECT (dp).path[1] AS part, (dp).path[2] AS vertex, (dp).geom AS pt
        FROM (SELECT ST_DumpPoints(geom) AS dp FROM trips WHERE id = %(id)s) d
    ), line AS (
        SELECT ST_Multi(ST_MakeLine(pt ORDER BY part, vertex)) AS geom FROM pts
    )
    SELECT ST_AsBinary(l.geom),
           ST_NumGeometries(l.geom),
           ST_Length(l.geom::geography),
           ST_Length(t.geom::geography),
           md5(ST_AsBinary(ST_Force2D(t.geom))),
           ST_NDims(l.geom)
    FROM line l, trips t WHERE t.id = %(id)s
"""

UPSERT_SQL = """
    INSERT INTO trip_repairs
        (trip_id, geom, repaired, divergence_pct, original_len_m,
         repaired_len_m, repair_info)
    VALUES (%s, ST_GeomFromWKB(%s, 4326), true, %s, %s, %s, %s)
    ON CONFLICT (trip_id) DO UPDATE SET
        geom = EXCLUDED.geom, repaired = EXCLUDED.repaired,
        divergence_pct = EXCLUDED.divergence_pct,
        original_len_m = EXCLUDED.original_len_m,
        repaired_len_m = EXCLUDED.repaired_len_m,
        repair_info = EXCLUDED.repair_info,
        created_at = now()
"""


def splice_one(conn, row, verbose=False):
    """Join one route's parts and store the result. Returns True on success."""
    with conn.cursor() as cur:
        cur.execute(SPLICE_SQL, {"id": row["id"]})
        wkb, n_parts, rep_len, orig_len, src_md5, ndims = cur.fetchone()
        # One part is the whole point of the exercise; anything else means the
        # dump-and-rebuild did not do what this assumes, so write nothing.
        if n_parts != 1:
            if verbose:
                print(f"    {row['id']}: splice produced {n_parts} parts, skipped")
            return False
        if ndims != 3:
            # A 2D result would silently drop the DEM Z and make the stored
            # ascent figures describe a geometry that no longer exists.
            if verbose:
                print(f"    {row['id']}: splice lost the Z ordinate, skipped")
            return False
        orig_len = float(orig_len or 0)
        rep_len = float(rep_len or 0)
        divergence = ((rep_len - orig_len) / orig_len * 100) if orig_len else 0.0
        cur.execute(UPSERT_SQL, (
            row["id"], wkb, round(divergence, 4),
            int(round(orig_len)), int(round(rep_len)),
            Jsonb({
                "method": "straight-splice",
                "source_geom_md5": src_md5,
                "bridges": int(row["n_gaps"]),
                "max_bridge_m": round(float(row["max_gap"]), 1),
                "total_bridge_m": round(float(row["total_gap"]), 1),
                "bridge_share": round(row["share"], 5),
                "limit_m": SPLICE_M,
                "total_limit_m": MAX_SPLICE_M,
                "note": ("parts joined in relation order with straight "
                         "connectors; no routing engine was involved"),
            }),
        ))
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Keeping the published number and the published line in agreement
# ---------------------------------------------------------------------------

# elevation.py measures distance from trips.geom, which is the ORIGINAL
# relation, so a spliced trip states a length up to 750 m shorter than the line
# the app draws and the GPX carries. Ascent and descent are unaffected (a
# connector joins two existing 3D points, so it adds no climb worth counting)
# and the profile is unaffected, but the distance has to describe the line
# actually published.
#
# Idempotent, and safe to re-run whenever: it only ever copies a stored
# repaired length onto the trip it belongs to. Run it AFTER elevation.py, since
# that pass rewrites distance_m from the original geometry.
SYNC_SQL = """
    UPDATE trips t
       SET distance_m = r.repaired_len_m
      FROM trip_repairs r
     WHERE r.trip_id = t.id
       AND r.repaired
       AND r.repair_info->>'method' = 'straight-splice'
       AND r.repair_info->>'source_geom_md5'
           = md5(ST_AsBinary(ST_Force2D(t.geom)))
       AND t.distance_m IS DISTINCT FROM r.repaired_len_m
"""


def sync_distances(conn):
    with conn.cursor() as cur:
        cur.execute(SYNC_SQL)
        n = cur.rowcount
    conn.commit()
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sync-only", action="store_true",
                    help="skip splicing, only bring stated distances back in "
                         "line with the spliced geometry (run after "
                         "elevation.py, which measures the original)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                 if args.countries else [])

    with connect() as conn:
        if args.sync_only:
            n = sync_distances(conn)
            print(f"{n:,} spliced trip(s) had their stated distance brought "
                  f"back in line with the geometry that ships")
            return
        rows = candidates(conn, countries, args.limit)
        print(f"{len(rows):,} route(s) have breaks short enough to bridge "
              f"(every gap <= {SPLICE_M:g} m, at most {MAX_GAPS}, "
              f"{MAX_SPLICE_M:g} m and {MAX_SPLICE_SHARE:.0%} of the route "
              f"in total)")
        if args.dry_run:
            by_country = Counter(r["country"] for r in rows)
            for cc, n in sorted(by_country.items()):
                print(f"  {cc}: {n}")
            print("dry run: nothing written")
            return

        done = Counter()
        for i, row in enumerate(rows, 1):
            if splice_one(conn, row, args.verbose):
                done["spliced"] += 1
                done[row["country"]] += 1
            else:
                done["skipped"] += 1
            if i % 500 == 0:
                conn.commit()
                print(f"  {i}/{len(rows)} ...", flush=True)
        conn.commit()

        synced = sync_distances(conn)
        print(f"\nspliced {done['spliced']:,} route(s), "
              f"skipped {done['skipped']:,}; "
              f"{synced:,} stated distance(s) brought in line")
        print("re-run curate.py to let them compete for a place, and "
              "splice.py --sync-only after any elevation pass")


if __name__ == "__main__":
    main()
