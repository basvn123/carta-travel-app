"""Stamp region ids onto every staged route, so the quota can be spatial.

The country cap was the ceiling this layer could not get past. Twelve
countries sat at exactly 158 published rows and twenty-nine at exactly 150
hikes, which is a constant deciding the tail rather than the data. Replacing
it with a per NUTS3 quota (pipeline/regions/quotas.py, `trail`) needs one
thing the lab did not have: every staged route has to know which region it
is in BEFORE the gate runs, not at export time when the selection is over.

So this runs before curate.py and writes four columns:

    rg               the compact wire block, exactly assign.wire_rg()'s shape
    nuts3            the owning level 3 region, lifted out for GROUP BY
    region_crosses   every level 3 region and range the line passes through
    regionized_at    when, so a re-run only touches what moved

Owning region: the point at half the route's LENGTH, per the assignment
contract for lines. Not the bbox centre, which for a horseshoe route can sit
in a valley the walk never enters, and not the start, which would hand every
cross-border route to whichever country the mapper began in.

Batched, not per row. assign.assign_line() is the reference implementation
and is right; called 236,000 times it is also an afternoon. This asks
PostGIS for the midpoints and the sample points in two queries, then does
ONE geopandas spatial join per spine layer, which is the same answer in
about two minutes. The reference lookup is used to verify a sample of the
result rather than to produce it (--verify).

Reads the REPAIRED geometry when there is a fresh accepted repair, the same
resolution curate.py and export_wire.py use, so all three agree about which
line a route is.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/regionize.py
    python pipeline/trails/regionize.py --countries CH,SI --verbose
    python pipeline/trails/regionize.py --all --refresh     # every staged row
    python pipeline/trails/regionize.py --verify 200
"""

import argparse
import json
import sys
import time
import warnings
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"
GPKG = ROOT / "cache" / "regions" / "regions.gpkg"

# How often the line is sampled for the `crosses` list, in kilometres. 8 km is
# assign_line's own default for trails: fine enough that a route cannot cross
# a whole NUTS3 region unnoticed, coarse enough that a 200 km trek costs 25
# points rather than 6,000.
SAMPLE_KM = 8.0
# The most sample points one geometry part contributes. A 400 km trek is
# placed well enough by 60 of them, and the cap is what keeps the crossing
# read linear in the number of routes rather than in their length.
MAX_SAMPLES = 60
# A coast stretch this far from the midpoint still owns the route. The same
# 15 km assign.py uses, because a lagoon walk sits inland of the shoreline.
COAST_KM = 15.0
BASIN_SNAP_KM = 10.0
SNAP_KM = 5.0
DEG_KM = 111.32

# geopandas warns that a nearest join on a geographic CRS measures in
# degrees. It does, and that is deliberate: assign.py buffers the same
# way (SNAP_KM / DEG_KM), so projecting here would make the batch path
# and the reference path disagree at the margin. Silenced rather than
# "fixed", because the two have to answer the same.
warnings.filterwarnings("ignore", message=".*geographic CRS.*",
                        category=UserWarning)


def apply_schema(conn):
    # Only when it would add something: an ALTER TABLE that changes nothing
    # still takes ACCESS EXCLUSIVE on trips, and this module's own sample walk
    # holds a read on trips for half an hour (see schema.py).
    ensure(conn, SCHEMA_SQL, verbose=True)


# ---------------------------------------------------------------------------
# The two reads
# ---------------------------------------------------------------------------

# `eff` is the geometry that will be PUBLISHED: the accepted repair when its
# hash still matches the relation it was built from, the relation otherwise.
# Identical to curate.py's and export_wire.py's resolution, deliberately
# spelled out three times rather than shared, because a helper that drifts
# would leave the three of them disagreeing silently.
EFF_GEOM = """
    SELECT t.id, t.country, COALESCE(r.geom, t.geom) AS geom
    FROM trips t
    LEFT JOIN trip_repairs r
           ON r.trip_id = t.id AND r.repaired
          AND r.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(t.geom)))
    WHERE t.category = 'hike'
      AND ({where})
"""

MIDPOINTS_SQL = """
WITH eff AS (
""" + EFF_GEOM + """
), merged AS (
    SELECT id, country,
           ST_LineMerge(ST_Force2D(geom)) AS line
    FROM eff
)
SELECT id, country,
       ST_X(pt) AS lon, ST_Y(pt) AS lat,
       ST_Length(line::geography) AS len_m
FROM merged,
     LATERAL (
        SELECT CASE
            WHEN GeometryType(line) = 'LINESTRING'
                THEN ST_LineInterpolatePoint(line, 0.5)
            ELSE ST_LineInterpolatePoint(
                     ST_GeometryN(line, 1 + ST_NumGeometries(line) / 2), 0.5)
        END AS pt
     ) m
WHERE pt IS NOT NULL
"""

# Sample points for `crosses`: evenly spaced ALONG the line, which is what
# assign_line's cumulative walk produces.
#
# Not ST_Segmentize plus ST_DumpPoints, which was the first version and is a
# trap: segmentize only ADDS vertices, so the dump hands back every original
# vertex too and 110 Liechtenstein routes produced 61,643 "samples". Walking
# the fraction with ST_LineInterpolatePoint gives exactly the points asked
# for, capped per part so a 200 km trek costs 26 rather than thousands.
SAMPLES_SQL = """
WITH eff AS (
""" + EFF_GEOM + """
), parts AS (
    SELECT e.id, (ST_Dump(ST_Force2D(e.geom))).geom AS part FROM eff e
), measured AS (
    SELECT id, part,
           LEAST(%(maxpts)s,
                 GREATEST(1, (GREATEST(ST_Length(part::geography), 1.0)
                              / %(step)s)::int)) AS n
    FROM parts
    WHERE ST_NPoints(part) >= 2
)
SELECT m.id, ST_X(p.pt) AS lon, ST_Y(p.pt) AS lat
FROM measured m,
     LATERAL generate_series(0, m.n) AS g,
     LATERAL (SELECT ST_LineInterpolatePoint(m.part, g::float8 / m.n) AS pt) p
"""


def country_list(conn, args, clause, params):
    """Which countries this run covers, in a stable order."""
    if args.countries:
        return [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT country FROM trips "
                    "WHERE category = 'hike' ORDER BY country")
        out = [r[0] for r in cur.fetchall()]
    conn.commit()
    return out


def owning_regions(conn, ids):
    """{trip id: nuts3} read back from the column, so the crossing pass does
    not depend on the midpoint pass having run in the same process."""
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute("SELECT id, nuts3 FROM trips WHERE id = ANY(%s)", (ids,))
        out = {tid: n3 for tid, n3 in cur.fetchall() if n3}
    conn.commit()
    return out


def fetch_points(conn, sql, where, params=None):
    with conn.cursor() as cur:
        cur.execute(sql.format(where=where), params or {})
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# The spine, as frames rather than as a tree
# ---------------------------------------------------------------------------

class Spine:
    """The GeoPackage's layers as GeoDataFrames plus the parent chain.

    Loaded once. `admin` is read whole because the parent chain needs every
    level, but only level 3 is ever joined against."""

    def __init__(self):
        import geopandas as gpd
        if not GPKG.exists():
            raise FileNotFoundError(
                f"{GPKG} missing. Run: python pipeline/regions/build_regions.py")
        self.gpd = gpd
        admin = gpd.read_file(GPKG, layer="admin")
        self.parent = dict(zip(admin["id"], admin["parent"]))
        self.level_of = dict(zip(admin["id"], admin["level"]))
        self.country_of = dict(zip(admin["id"], admin["country"]))
        self.a3 = admin[admin["level"] == 3][["id", "country", "geometry"]] \
            .reset_index(drop=True)
        self.layers = {}
        for name in ("coast", "range", "basin", "biogeo"):
            try:
                self.layers[name] = gpd.read_file(GPKG, layer=name)
            except Exception:
                self.layers[name] = None

    def chain(self, n3):
        """n3 -> (country, n1, n2), through the parent column."""
        if not n3:
            return None, None, None
        n1 = n2 = None
        node = n3
        for _ in range(4):
            node = self.parent.get(node) or None
            if node is None:
                break
            level = self.level_of.get(node)
            if level == 2:
                n2 = node
            elif level == 1:
                n1 = node
        return self.country_of.get(n3), n1, n2


def _points_frame(spine, rows, id_key="id"):
    return spine.gpd.GeoDataFrame(
        {"_i": list(range(len(rows)))},
        geometry=spine.gpd.points_from_xy([r["lon"] for r in rows],
                                          [r["lat"] for r in rows]),
        crs="EPSG:4326")


def _join_within(spine, pts, frame, value_col, sort_by=None):
    """value per point by containment, first match, None where nothing holds.

    sort_by orders the candidate polygons before the duplicate drop, which is
    how the deepest GMBA range wins a nest of them (a peak is inside the
    Bernese Alps AND inside the Alps; the reader wants the first)."""
    if frame is None or not len(pts):
        return [None] * len(pts)
    hit = spine.gpd.sjoin(pts, frame[[value_col, "geometry"]
                                     + ([sort_by] if sort_by else [])],
                          how="left", predicate="within")
    if sort_by and sort_by in hit.columns:
        hit = hit.sort_values(["_i", sort_by], ascending=[True, False])
    hit = hit[~hit["_i"].duplicated(keep="first")]
    out = [None] * len(pts)
    for i, val in zip(hit["_i"], hit[value_col]):
        out[int(i)] = None if val is None or val != val else str(val)
    return out


def _join_nearest(spine, pts, frame, value_col, max_km):
    """value per point by nearest within max_km. Used for the coast stretch
    and the sea snap: a point no polygon contains is not an error."""
    if frame is None or not len(pts):
        return [None] * len(pts)
    hit = spine.gpd.sjoin_nearest(
        pts, frame[[value_col, "geometry"]], how="left",
        max_distance=max_km / DEG_KM, distance_col="_d")
    hit = hit.sort_values(["_i", "_d"])
    hit = hit[~hit["_i"].duplicated(keep="first")]
    out = [None] * len(pts)
    for i, val in zip(hit["_i"], hit[value_col]):
        out[int(i)] = None if val is None or val != val else str(val)
    return out


def assign_midpoints(spine, rows, verbose=False):
    """rg per row, in row order. One sjoin per spine layer."""
    import h3
    pts = _points_frame(spine, rows)

    n3 = _join_within(spine, pts, spine.a3, "id")
    # The sea snap, for a route whose midpoint sits over water (a coastal
    # path drawn seaward of the admin polygon, an island crossing).
    missing = [i for i, v in enumerate(n3) if v is None]
    if missing:
        sub = pts.iloc[missing].copy()
        sub["_i"] = list(range(len(missing)))
        snapped = _join_nearest(spine, sub, spine.a3, "id", SNAP_KM)
        for k, i in enumerate(missing):
            n3[i] = snapped[k]
        if verbose:
            got = sum(1 for i in missing if n3[i])
            print(f"    sea snap: {got}/{len(missing)} midpoints recovered")

    coast = _join_nearest(spine, pts, spine.layers.get("coast"), "id", COAST_KM)
    rng = _join_within(spine, pts, spine.layers.get("range"), "id",
                       sort_by="level")
    basin = _join_within(spine, pts, spine.layers.get("basin"), "id")
    missing_b = [i for i, v in enumerate(basin) if v is None]
    if missing_b:
        sub = pts.iloc[missing_b].copy()
        sub["_i"] = list(range(len(missing_b)))
        snapped = _join_nearest(spine, sub, spine.layers.get("basin"), "id",
                                BASIN_SNAP_KM)
        for k, i in enumerate(missing_b):
            basin[i] = snapped[k]
    biogeo = _join_within(spine, pts, spine.layers.get("biogeo"), "code")

    out = []
    for i, row in enumerate(rows):
        _country, _n1, n2 = spine.chain(n3[i])
        rg = {}
        if n3[i]:
            rg["n3"] = n3[i]
        if n2:
            rg["n2"] = n2
        if coast[i]:
            rg["co"] = coast[i]
        if rng[i]:
            rg["ra"] = rng[i]
        if basin[i]:
            rg["ba"] = basin[i]
        if biogeo[i] and biogeo[i] != "OUT":
            rg["bg"] = biogeo[i]
        rg["h4"] = h3.latlng_to_cell(row["lat"], row["lon"], 4)
        out.append((rg, n3[i]))
    return out


def assign_crosses(spine, samples, verbose=False):
    """{trip id: sorted region ids the line passes through}.

    Level 3 regions and ranges only: those are the two axes a region page is
    built on, and adding basins would triple the array for a list nobody
    browses by."""
    if not samples:
        return {}
    pts = _points_frame(spine, samples)
    n3 = _join_within(spine, pts, spine.a3, "id")
    rng = _join_within(spine, pts, spine.layers.get("range"), "id",
                       sort_by="level")
    out = defaultdict(set)
    for i, s in enumerate(samples):
        for val in (n3[i], rng[i]):
            if val:
                out[s["id"]].add(val)
    return {k: sorted(v) for k, v in out.items()}


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

UPDATE_SQL = """
    UPDATE trips SET rg = %s, nuts3 = %s, regionized_at = now()
    WHERE id = %s
"""

CROSSES_SQL = "UPDATE trips SET region_crosses = %s WHERE id = %s"

# How many rows go per transaction. Small enough that a write over the whole
# staged pool never holds one long transaction against a lab several other
# passes are using at the same time.
WRITE_BATCH = 2000


def _write(conn, sql, records):
    for i in range(0, len(records), WRITE_BATCH):
        with conn.cursor() as cur:
            cur.executemany(sql, records[i:i + WRITE_BATCH])
        conn.commit()


def store(conn, records):
    _write(conn, UPDATE_SQL, records)


def store_crosses(conn, records):
    _write(conn, CROSSES_SQL, records)


# ---------------------------------------------------------------------------
# Verify against the reference implementation
# ---------------------------------------------------------------------------

def verify(conn, n, verbose=False):
    """Hold a sample of the batch result against assign.assign_line().

    The batch path exists for speed and the reference path is the contract;
    if they disagree about the owning region, the batch path is wrong. Run
    after any change to either."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "carta_regions_assign", ROOT / "pipeline" / "regions" / "assign.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["carta_regions_assign"] = mod
    spec.loader.exec_module(mod)

    with conn.cursor() as cur:
        cur.execute("""
            WITH eff AS (
                SELECT t.id, COALESCE(r.geom, t.geom) AS geom
                FROM trips t
                LEFT JOIN trip_repairs r
                       ON r.trip_id = t.id AND r.repaired
                      AND r.repair_info->>'source_geom_md5'
                          = md5(ST_AsBinary(ST_Force2D(t.geom)))
                WHERE t.category = 'hike' AND t.nuts3 IS NOT NULL
                  AND t.status IN ('approved', 'published')
            )
            SELECT e.id, t.nuts3,
                   ST_AsGeoJSON(ST_Force2D(e.geom), 6)
            FROM eff e JOIN trips t ON t.id = e.id
            ORDER BY e.id
            LIMIT %s""", (n,))
        rows = cur.fetchall()

    agree = disagree = skipped = 0
    for trip_id, stored_n3, geojson in rows:
        parts = json.loads(geojson).get("coordinates") or []
        if json.loads(geojson).get("type") == "LineString":
            parts = [parts]
        coords = [(pt[1], pt[0]) for part in parts for pt in part]
        if len(coords) < 2:
            skipped += 1
            continue
        ref = mod.assign_line(coords, sample_km=SAMPLE_KM).ids.nuts3
        if ref == stored_n3:
            agree += 1
        else:
            disagree += 1
            if verbose:
                print(f"    [{trip_id}] batch {stored_n3} vs reference {ref}")
    total = agree + disagree
    pct = 100.0 * agree / total if total else 0.0
    print(f"verify: {agree}/{total} agree with assign_line ({pct:.1f}%)"
          + (f", {skipped} too short to place" if skipped else ""))
    return disagree == 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Which staged rows are worth placing. Everything the curation gate could
# ever look at, which is everything not rejected and not a synthetic stub:
# the quota has to see the whole pool of a region, not only what a previous
# pass happened to publish.
CANDIDATE_WHERE = ("t.status <> 'rejected' AND t.title NOT LIKE 'OSM route %%'")
CURATED_WHERE = "t.status IN ('approved', 'published')"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2, default every "
                                        "country with staged hikes")
    ap.add_argument("--all", action="store_true",
                    help="place the whole candidate pool, not only what is "
                         "already approved or published (what the quota gate "
                         "needs, and the slow one)")
    ap.add_argument("--refresh", action="store_true",
                    help="re-place rows that already carry a region")
    ap.add_argument("--no-crosses", action="store_true",
                    help="place the owning region only, skip the crossing "
                         "list (the slow half, and only region pages read it)")
    ap.add_argument("--verify", type=int, default=0, metavar="N",
                    help="hold N placed routes against assign_line and stop")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(errors="replace")
    t0 = time.time()
    with connect() as conn:
        apply_schema(conn)

        if args.verify:
            ok = verify(conn, args.verify, verbose=args.verbose)
            return 0 if ok else 1

        where = [CANDIDATE_WHERE if args.all else CURATED_WHERE]
        params = {"step": 1000.0 * SAMPLE_KM, "maxpts": MAX_SAMPLES}
        if args.countries:
            ccs = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
            where.append("t.country = ANY(%(cc)s)")
            params["cc"] = ccs
        if not args.refresh:
            where.append("t.regionized_at IS NULL")
        clause = " AND ".join(where)

        print("loading the region spine ...", flush=True)
        spine = Spine()

        # Country by country, not one query over 236,000 routes.
        #
        # The single-query version asked PostGIS to merge and interpolate
        # every staged geometry in one statement, which the server answered by
        # spawning parallel workers, filling memory and then dying mid-read
        # ("server closed the connection unexpectedly", twice). Per country the
        # largest read is Germany's, each one commits before the next starts,
        # and a crash costs one country rather than the whole pass.
        stats, by_cc = Counter(), defaultdict(set)
        for cc in country_list(conn, args, clause, params):
            cc_clause = clause + " AND t.country = %(one_cc)s"
            rows = fetch_points(conn, MIDPOINTS_SQL, cc_clause,
                                {**params, "one_cc": cc})
            conn.commit()      # let go of the read lock before anything slow
            if not rows:
                continue
            placed = assign_midpoints(spine, rows, verbose=False)
            records = []
            for row, (rg, n3) in zip(rows, placed):
                stats["placed" if n3 else "unplaced"] += 1
                if n3:
                    by_cc[cc].add(n3)
                records.append((Jsonb(rg), n3, row["id"]))
            if args.dry_run:
                print(f"  {cc}: would place {len(records):,}", flush=True)
                continue
            store(conn, records)
            print(f"  {cc}: {len(records):,} placed across "
                  f"{len(by_cc[cc])} region(s)", flush=True)

        if args.dry_run:
            print(f"dry run: would place {stats['placed']:,} route(s), "
                  f"{stats['unplaced']:,} with no region")
            return 0

        # The crossings, second and separately, over a MUCH smaller scope.
        #
        # They are read by the region pages ("which routes touch this
        # region"), which only ever list published content, so walking the
        # line of all 236,000 staged relations to compute them was 40 minutes
        # of work for an answer nothing reads. Worse, it held a read on trips
        # for that whole time, which queues every ALTER behind it and every
        # query behind the ALTER. The owning region above is what the quota
        # gate needs and it is now written before this runs at all.
        if not args.no_crosses:
            cross_where = list(where)
            cross_where[0] = CURATED_WHERE
            if not args.refresh:
                cross_where = [w for w in cross_where
                               if w != "t.regionized_at IS NULL"]
            print("reading sample points for the crossings "
                  "(published and approved only) ...", flush=True)
            samples = fetch_points(conn, SAMPLES_SQL,
                                   " AND ".join(cross_where), params)
            conn.commit()
            print(f"  {len(samples):,} sample point(s)", flush=True)
            crosses = assign_crosses(spine, samples, verbose=args.verbose)
            by_id = owning_regions(conn, list(crosses))
            cross_records = [
                (sorted(set(ids) | ({by_id[tid]} if by_id.get(tid) else set())),
                 tid)
                for tid, ids in crosses.items()]
            store_crosses(conn, cross_records)
            print(f"  {len(cross_records):,} route(s) carry a crossing list",
                  flush=True)

        print("\n" + "=" * 58)
        print(f"{stats['placed']:,} route(s) placed, {stats['unplaced']:,} "
              f"with no region, in {(time.time() - t0) / 60:.1f} min")
        regions = sorted({n3 for s in by_cc.values() for n3 in s})
        print(f"{len(regions):,} distinct level 3 regions hold at least one "
              f"staged route, across {len(by_cc)} countries")
        if args.verbose:
            for cc in sorted(by_cc):
                print(f"  {cc}: {len(by_cc[cc])} region(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
