"""Bridge the short breaks OSM cycle relations leave in otherwise whole routes.

This is pipeline/trails/splice.py applied to cycle_routes, and it deliberately
imports that module's thresholds rather than restating them:

    SPLICE_M           the longest single break a straight connector may cross
    MAX_GAPS           more breaks than this is an unfinished route, not an
                       artefact
    MAX_SPLICE_M       how much of a route may be bridged in total, absolute
    MAX_SPLICE_SHARE   and as a share, because either bound alone gets a
                       class of route wrong

Those four numbers were calibrated on real routes (Walker's Haute Route, 7 m;
Besseggen, two breaks of about 250 m on a 14 km walk) and a second copy of
them here would drift the first time one is tuned. Reuse means the constants,
not a paste.

Why the same numbers hold for cycling. The cause is the same: a mapper splits
a way at a road crossing and the relation loses a ten metre connector, or the
country extract clips a way at the border. The route is continuous on the
ground; the relation is not. What differs is that a cyclist crossing a
bridged gap has fewer options than a walker, so the honesty burden is higher,
not lower: the count and total length of the bridges ride in repair_info,
export_cycling ships them, and the route page says the line has short bridged
breaks.

Where a break is real, nothing is written and the route stays out. That is
what keeps an "EV1 Portugal" whose relation is missing 60 km of undeveloped
route from publishing as a continuous line, which is precisely the failure
the EuroVelo developed-only GPX exists to avoid.

Z rides through untouched: a connector joins two existing 3D points, so the
ascent figures and the elevation profile survive a splice and only the
distance grows. Run --sync-only after any elevation pass, which measures the
original geometry and would otherwise leave the stated distance describing a
line the app does not draw.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/splice_cycling.py --dry-run
    python pipeline/cycling/splice_cycling.py --countries GB,NL --verbose
    python pipeline/cycling/splice_cycling.py --sync-only
"""

import argparse
import importlib.util
import sys
from collections import Counter
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect


def _trails_splice():
    """pipeline/trails/splice.py, loaded by path for its calibrated bounds."""
    path = ROOT / "pipeline" / "trails" / "splice.py"
    spec = importlib.util.spec_from_file_location("carta_trails_splice", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["carta_trails_splice"] = mod
    old = list(sys.path)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path[:] = old
    return mod


_T = _trails_splice()
SPLICE_M = _T.SPLICE_M
MAX_GAPS = _T.MAX_GAPS
MAX_SPLICE_M = _T.MAX_SPLICE_M
MAX_SPLICE_SHARE = _T.MAX_SPLICE_SHARE

# The shortest route worth bridging, and the longest. A 900 m "route" whose
# relation is in two pieces is a fragment; a 3,000 km one is a continental
# corridor whose gaps are real countries' worth of missing infrastructure.
MIN_LEN_M = 2_000
MAX_LEN_M = 3_000_000


GAPS_SQL = """
    WITH cand AS (
        SELECT r.id, r.country, r.name, r.ref, r.distance_m, r.geom,
               ST_NumGeometries(r.geom) AS np
        FROM cycle_routes r
        WHERE r.source = 'osm'
          AND r.status <> 'rejected'
          AND r.distance_m BETWEEN %(min_len)s AND %(max_len)s
          AND ST_NumGeometries(r.geom) BETWEEN 2 AND %(max_parts)s
          AND (%(countries)s::text[] IS NULL OR r.country = ANY(%(countries)s))
          AND NOT EXISTS (
              SELECT 1 FROM cycle_repairs cr WHERE cr.route_id = r.id
              AND cr.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(r.geom))))
    ), gaps AS (
        SELECT c.id, c.country, c.name, c.ref, c.distance_m, c.np,
               ST_Distance(
                   ST_EndPoint(ST_GeometryN(c.geom, i))::geography,
                   ST_StartPoint(ST_GeometryN(c.geom, i + 1))::geography) AS gap
        FROM cand c, generate_series(1, c.np - 1) AS i
    )
    SELECT id, country, coalesce(name, ref, 'route ' || id) AS title,
           distance_m, np, count(*) AS n_gaps, max(gap) AS max_gap,
           sum(gap) AS total_gap
    FROM gaps
    GROUP BY id, country, name, ref, distance_m, np
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
            "min_len": MIN_LEN_M,
            "max_len": MAX_LEN_M,
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


# ST_DumpPoints over a MultiLineString yields path = {part, vertex}, so
# ordering by it walks the parts in relation order and each part in its own
# order. ST_MakeLine over that is one continuous line whose only new geometry
# is the straight segment across each break.
SPLICE_SQL = """
    WITH pts AS (
        SELECT (dp).path[1] AS part, (dp).path[2] AS vertex, (dp).geom AS pt
        FROM (SELECT ST_DumpPoints(geom) AS dp
              FROM cycle_routes WHERE id = %(id)s) d
    ), line AS (
        SELECT ST_Multi(ST_MakeLine(pt ORDER BY part, vertex)) AS geom FROM pts
    )
    SELECT ST_AsBinary(l.geom), ST_NumGeometries(l.geom),
           ST_Length(l.geom::geography), ST_Length(r.geom::geography),
           md5(ST_AsBinary(ST_Force2D(r.geom))), ST_NDims(l.geom)
    FROM line l, cycle_routes r WHERE r.id = %(id)s
"""

UPSERT_SQL = """
    INSERT INTO cycle_repairs
        (route_id, geom, repaired, divergence_pct, original_len_m,
         repaired_len_m, repair_info)
    VALUES (%s, ST_GeomFromWKB(%s, 4326), true, %s, %s, %s, %s)
    ON CONFLICT (route_id) DO UPDATE SET
        geom = EXCLUDED.geom, repaired = EXCLUDED.repaired,
        divergence_pct = EXCLUDED.divergence_pct,
        original_len_m = EXCLUDED.original_len_m,
        repaired_len_m = EXCLUDED.repaired_len_m,
        repair_info = EXCLUDED.repair_info,
        created_at = now()
"""


def splice_one(conn, row, verbose=False):
    """Join one route's parts and store the result. True when it worked."""
    with conn.cursor() as cur:
        cur.execute(SPLICE_SQL, {"id": row["id"]})
        wkb, n_parts, rep_len, orig_len, src_md5, ndims = cur.fetchone()
        if n_parts != 1:
            if verbose:
                print(f"    {row['id']}: splice produced {n_parts} parts, skipped")
            return False
        if ndims != 3:
            # A 2D result would silently drop the DEM Z and make the stored
            # ascent describe a geometry that no longer exists.
            if verbose:
                print(f"    {row['id']}: splice lost the Z ordinate, skipped")
            return False
        orig_len, rep_len = float(orig_len or 0), float(rep_len or 0)
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


# way_spans measures along the ORIGINAL relation, and a splice adds up to
# 750 m of connector. Left alone, a stage cut at 60,000 m would read the
# surface of a different stretch of road. Rescaling the span coordinates by
# the length ratio keeps every span in proportion to the line that ships,
# which is the honest approximation: the connectors are short and unsurfaced
# by definition, so no span's tags are made to describe them.
RESCALE_SQL = """
    UPDATE cycle_routes r
       SET way_spans = jsonb_set(
             r.way_spans, '{spans}',
             (SELECT coalesce(jsonb_agg(jsonb_build_array(
                        round((s->>0)::numeric * %(k)s::numeric, 1),
                        round((s->>1)::numeric * %(k)s::numeric, 1),
                        (s->>2)::int) ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements(r.way_spans->'spans')
                     WITH ORDINALITY AS t(s, ord)))
     WHERE r.id = %(id)s
       AND r.way_spans ? 'spans'
"""

SYNC_SQL = """
    UPDATE cycle_routes r
       SET distance_m = cr.repaired_len_m
      FROM cycle_repairs cr
     WHERE cr.route_id = r.id
       AND cr.repaired
       AND cr.repair_info->>'method' = 'straight-splice'
       AND cr.repair_info->>'source_geom_md5'
           = md5(ST_AsBinary(ST_Force2D(r.geom)))
       AND r.distance_m IS DISTINCT FROM cr.repaired_len_m
    RETURNING r.id, cr.original_len_m, cr.repaired_len_m
"""


def sync_distances(conn):
    """Bring the stated distance, and the span coordinates, back in line with
    the geometry that actually ships. Idempotent, safe to re-run."""
    with conn.cursor() as cur:
        cur.execute(SYNC_SQL)
        rows = cur.fetchall()
        for rid, orig, rep in rows:
            if orig and rep and orig != rep:
                cur.execute(RESCALE_SQL, {"id": rid, "k": rep / float(orig)})
    conn.commit()
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sync-only", action="store_true",
                    help="skip splicing, only bring stated distances and "
                         "span coordinates back in line with the spliced "
                         "geometry (run after any elevation pass)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])

    with connect() as conn:
        if args.sync_only:
            n = sync_distances(conn)
            print(f"{n:,} spliced route(s) brought back in line with the "
                  f"geometry that ships")
            return
        rows = candidates(conn, countries, args.limit)
        print(f"{len(rows):,} route(s) have breaks short enough to bridge "
              f"(every gap <= {SPLICE_M:g} m, at most {MAX_GAPS}, "
              f"{MAX_SPLICE_M:g} m and {MAX_SPLICE_SHARE:.0%} of the route "
              f"in total; thresholds imported from trails/splice.py)")
        if args.dry_run:
            for cc, n in sorted(Counter(r["country"] for r in rows).items()):
                print(f"  {cc}: {n}")
            print("dry run: nothing written")
            return

        done = Counter()
        for i, row in enumerate(rows, 1):
            done["spliced" if splice_one(conn, row, args.verbose)
                 else "skipped"] += 1
            if i % 500 == 0:
                conn.commit()
                print(f"  {i}/{len(rows)} ...", flush=True)
        conn.commit()
        synced = sync_distances(conn)
        print(f"\nspliced {done['spliced']:,} route(s), "
              f"skipped {done['skipped']:,}; {synced:,} brought in line")


if __name__ == "__main__":
    main()
