"""Which routes are near a destination, measured to the line, named as paths.

ROUTES.md R6, and the reason the whole routes layer exists. The Rome page
showed "Romea Strata in Italia - Tappa RSIT47", "Via Francigena - Variante
Anello di Cam..." and a stage of the Cammino Naturale dei Parchi: three
fragments of three long paths, each presented as if it were a destination in
its own right, and each placed by the CENTRE OF ITS BOUNDING BOX rather than
by where it actually passes. This pass replaces both halves of that.

WHAT IT MEASURES. For every destination, every published route of either
activity whose line comes within MAX_KM of the town centre, measured with
ST_Distance in EPSG:3035 to the nearest point ON THE LINE. Not the bbox
centre, which for a 386 km path can sit a hundred kilometres from where it
passes the town; not the start, which is somebody's choice of direction.
Per match: the distance, a compass bearing, the nearest access point on the
line (a vertex within ACCESS_SNAP_M of a road junction, a car park or a
station, preferring the named one), and whether a station lies within
TRANSIT_KM of that access point.

WHAT IT PRESENTS, and this is the part that is a judgement rather than a
measurement. "Present parents, never stages" cannot be done by attaching the
parent's row, because the parent is almost never published and usually
should not be: only 94 of 1,463 published stages have a published parent,
and the Via Francigena's own relation assembles into 54 disjoint parts whose
summed ascent (5,715 m over 1,921 km) is meaningless. A superroute is a
container, not a walk.

So a stage keeps its own line, its own figures and its own page, and wears
the PATH'S NAME: `name` becomes "Via Francigena", `stage` carries the
stage's own name and index, and the app renders "Via Francigena, passes
9 km west" with "this stretch: Variante Anello di Campagnano". Nothing is
invented: both names are in route_relations, the distance is to the line
that is actually there, and the figures belong to the piece you would walk.
A reader who taps it gets the stage, which is the thing with a GPX.

FOLDING. Two rows that share a path share a slot: co_located first (R3c
measured it), then the relation tree (R3a), then the family key. The
survivor is the nearest, because the question is "what is near here".

Output: data/derived/routes_attach.json, keyed by destination id, read by
pipeline/dossier/build_dossier.py into the dossier's `routes` key.

Usage, from the repo root (lab up):
    python pipeline/trails/attach.py
    python pipeline/trails/attach.py --dests FCO,CIA --verbose
    python pipeline/trails/attach.py --dry-run

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402

APP_DATA = ROOT / "continent-app" / "public" / "app_data.json"
OUT = ROOT / "data" / "derived" / "routes_attach.json"
REPORT = ROOT / "data" / "reports" / "routes_attach.json"
TRANSIT_SQL = ROOT / "tools" / "trailslab" / "initdb" / "10_transit.sql"

# A route further than this is not "from here" by any reading.
MAX_KM = 25.0
# Caps per destination, per activity.
CAP = {"hiking": 8, "cycling": 6}
# At most this many rows of one network tier, so a destination does not show
# six regional variants of the same idea.
TIER_CAP = 3
# Proximity decay: half weight at MAX_KM, so a very good route at the edge of
# the radius ranks with a fair one on the doorstep.
def decay(km):
    return 1.0 / (1.0 + km / MAX_KM)


# How near a line vertex must be to a road junction, car park or station to
# count as somewhere you could actually start.
ACCESS_SNAP_M = 500.0
# And how near a station must be to that access point for a car-free start.
TRANSIT_KM = 1.0

COMPASS = ("n", "ne", "e", "se", "s", "sw", "w", "nw")


def prefilter_degrees(lat):
    """(lon, lat) degrees for the index-served box around a destination.

    A degree of latitude is about 111 km everywhere; a degree of longitude
    shrinks with the cosine, to 38 km at Tromso. Dividing by that cosine is
    what keeps the box a true superset of the radius in the north instead of
    quietly clipping routes off the Norwegian coast. Floored at 60 degrees
    of effective latitude so the box cannot blow up near the pole."""
    d_lat = MAX_KM / 111.0
    d_lon = MAX_KM / (111.0 * max(0.25, math.cos(math.radians(min(abs(lat), 75.0)))))
    return d_lon, d_lat


def bearing_code(lat1, lon1, lat2, lon2):
    """Eight-point compass code from the destination to the route."""
    p = math.pi / 180
    dl = (lon2 - lon1) * p
    y = math.sin(dl) * math.cos(lat2 * p)
    x = (math.cos(lat1 * p) * math.sin(lat2 * p)
         - math.sin(lat1 * p) * math.cos(lat2 * p) * math.cos(dl))
    deg = (math.degrees(math.atan2(y, x)) + 360) % 360
    return COMPASS[int((deg + 22.5) // 45) % 8]


# One query per destination, both activities in one pass.
#
# Two things here are the shape they are because of measured mistakes, both
# recorded in memory as the PostGIS scan trap:
#
#   the prefilter  `geom && ST_Expand(point, deg)` is a bounding-box test the
#                  GiST index on trips.geom serves directly. Neither
#                  ST_DWithin on geography nor ST_DWithin over a transform
#                  can use that index: both scan every published route in
#                  Europe and cast or reproject its whole line, per
#                  destination. The box is generous (see DEG below) and the
#                  exact test behind it decides.
#   MATERIALIZED   a plain CTE is inlined and recomputed per row, which for
#                  the point is cheap but for anything derived from a route
#                  line is not. Measured elsewhere at 140x.
#
# The exact distance is geography (true metres on the ellipsoid, which is
# what "25 km from the town" means) and runs only on what the box returned.
# ST_ClosestPoint gives the point ON the line that the bearing and the access
# point are both measured from.
NEAR_SQL = """
WITH pt AS MATERIALIZED (
    SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) AS g4326,
           ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography AS gg,
           ST_Expand(ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
                     %(deg_lon)s, %(deg_lat)s) AS box
),
cand AS (
    SELECT 'hiking'::text AS activity, t.id, t.title AS name, t.country,
           t.network, t.distance_m, t.ascent_m, t.descent_m, t.rating,
           t.tier, t.is_loop, t.route_type, t.grade, t.grade_src,
           t.hierarchy, t.stage_index, t.stage_count, t.top_of, t.stage_of,
           t.co_located, t.family_key, t.raw_tags ? 'osmc:symbol' AS waymarked,
           t.source_ref, t.geom
    FROM trips t, pt
    WHERE t.status = 'published' AND t.category = 'hike'
      AND t.geom && pt.box
      AND ST_DWithin(t.geom::geography, pt.gg, %(max_m)s)
    UNION ALL
    SELECT 'cycling', r.id, COALESCE(r.name, r.ref), r.country,
           r.network, r.distance_m, r.ascent_m, r.descent_m, r.rating,
           r.tier, r.roundtrip, NULL, NULL, NULL,
           r.hierarchy, r.stage_index, r.stage_count, r.top_of, r.stage_of,
           r.co_located, r.cycle_network, false,
           r.source_ref, r.geom
    FROM cycle_routes r, pt
    WHERE r.id = ANY(%(cycle_ids)s)
      AND r.geom && pt.box
      AND ST_DWithin(r.geom::geography, pt.gg, %(max_m)s)
)
SELECT c.activity, c.id, c.name, c.country, c.network, c.distance_m,
       c.ascent_m, c.descent_m, c.rating, c.tier, c.is_loop, c.route_type,
       c.grade, c.grade_src, c.hierarchy, c.stage_index, c.stage_count,
       c.top_of, c.stage_of, c.co_located, c.family_key, c.waymarked,
       c.source_ref,
       ST_Distance(c.geom::geography, pt.gg) AS dist_m,
       ST_Y(near.p) AS near_lat, ST_X(near.p) AS near_lon
FROM cand c, pt
CROSS JOIN LATERAL (
    SELECT ST_ClosestPoint(ST_Force2D(c.geom), pt.g4326) AS p
) near
ORDER BY dist_m
"""

# The access point: the nearest station to where the route passes.
#
# Measured from the point on the LINE, not from the whole line: the first
# version of this query transformed the route's entire geometry to EPSG:3035
# once per candidate row, which on a 380 km path is tens of thousands of
# vertices reprojected to answer a question about one point, and it made the
# pass slower than the dedup. ST_DWithin on geography over a 500 m radius
# uses the GiST index on transit_stops and reads the handful of stops that
# are actually near, which is the same answer at a thousandth of the cost.
# A station within ACCESS_SNAP_M of where the route passes IS the access
# point; a station within TRANSIT_KM of it makes the start car-free.
ACCESS_SQL = """
    SELECT s.name, s.kind,
           ST_Distance(s.geom::geography, %(pt)s::geography) AS d_pt,
           ST_Y(s.geom), ST_X(s.geom)
    FROM transit_stops s
    WHERE s.country = %(cc)s
      AND ST_DWithin(s.geom::geography, %(pt)s::geography, %(snap)s)
    ORDER BY d_pt
    LIMIT 1
"""

COLS = ("activity", "id", "name", "country", "network", "distance_m",
        "ascent_m", "descent_m", "rating", "tier", "is_loop", "route_type",
        "grade", "grade_src", "hierarchy", "stage_index", "stage_count",
        "top_of", "stage_of", "co_located", "family_key", "waymarked",
        "source_ref", "dist_m", "near_lat", "near_lon")


CYCLING_WIRE = ROOT / "continent-app" / "public" / "cycling"


def published_cycle_ids():
    """The cycle routes that actually ship, read off the wire.

    cycle_routes.tier is NULL for all 65,375 rows: the cycling layer derives
    the tier at EXPORT time (export_cycling.tier_of, from the score and the
    photo count) and never writes it back. So "published" for cycling is a
    property of the wire, not of the database, and a query filtering on tier
    or status silently returns nothing at all. The first full run of this
    pass attached 16,491 hiking rows and zero cycling rows for exactly that
    reason. Reading the wire is the only honest answer to "what ships".

    Rated rows only: the listed tier is 16,460 rows of coverage without a
    score, which is right for a country page and wrong for "routes from
    here".
    """
    ids = set()
    if not CYCLING_WIRE.is_dir():
        return ids
    for path in sorted(CYCLING_WIRE.glob("*.json")):
        if path.stem in ("index", "top") or len(path.stem) != 2:
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for row in doc.get("routes") or []:
            if row.get("id") is not None:
                ids.add(int(row["id"]))
    return ids


def load_dests(ids):
    data = json.loads(APP_DATA.read_text(encoding="utf-8"))["destinations"]
    out = []
    for did, d in data.items():
        if ids and did not in ids:
            continue
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        out.append({"id": did, "lat": lat, "lon": lon, "iso2": d.get("iso2"),
                    "city": d.get("city")})
    out.sort(key=lambda d: d["id"])
    return out


def path_names(conn, activity, tops):
    """osm relation id -> the path's own name, from the relation graph."""
    ids = sorted({int(t) for t in tops if t})
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute("""SELECT osm_id, tags_all->>'name' FROM route_relations
                       WHERE activity = %s AND osm_id = ANY(%s)""",
                    (activity, ids))
        return {r[0]: r[1] for r in cur.fetchall() if r[1]}


def fold_key(row):
    """What makes two rows the same physical path, strongest first."""
    if row["co_located"]:
        return ("co", int(row["co_located"][0]))
    if row["top_of"]:
        return ("tree", int(row["top_of"]))
    if row["hierarchy"] == "parent" and str(row["source_ref"] or "").isdigit():
        return ("tree", int(row["source_ref"]))
    if row["family_key"]:
        return ("fam", row["family_key"])
    return ("id", row["id"])


def attach_row(row, dest, names, access):
    """One RouteSummary-shaped attach row, wearing the path's name."""
    km = round(row["dist_m"] / 1000.0, 1)
    path = names.get(int(row["top_of"])) if row["top_of"] else None
    out = {
        "activity": row["activity"],
        "id": row["id"],
        "cc": row["country"],
        # The path's name when this row is a piece of one, else its own.
        "name": path or row["name"],
        "km": km,
        "dir": bearing_code(dest["lat"], dest["lon"],
                            row["near_lat"], row["near_lon"]),
        "lat": round(row["near_lat"], 5),
        "lon": round(row["near_lon"], 5),
        "km_len": round((row["distance_m"] or 0) / 1000.0, 1) or None,
        "ascent_m": row["ascent_m"],
        "net": row["network"],
        "rating": float(row["rating"]) if row["rating"] is not None else None,
    }
    if path and path.strip().lower() != (row["name"] or "").strip().lower():
        # The piece you would actually walk, named, so the reader can tell
        # the path from the stretch of it that passes.
        out["stage"] = {"name": row["name"], "i": row["stage_index"],
                        "n": row["stage_count"]}
    if row["grade"]:
        out["grade"] = row["grade"]
        out["grade_src"] = row["grade_src"]
    if row["route_type"]:
        out["shape"] = row["route_type"]
    elif row["is_loop"]:
        out["shape"] = "loop"
    if row["waymarked"]:
        out["way"] = True
    if row["tier"] == "l":
        out["listed"] = True
    if access:
        out["access"] = access
        if access.get("transit"):
            out["car_free"] = True
    return out


def pick(rows, activity, conn, dest, names):
    """The rules, in order: fold, rank, cap by tier, cap by count."""
    cap = CAP[activity]
    best = {}
    for row in rows:
        if row["activity"] != activity:
            continue
        key = fold_key(row)
        # Nearest wins the slot: the question is what is near here.
        if key not in best or row["dist_m"] < best[key]["dist_m"]:
            best[key] = row
    ranked = sorted(best.values(), key=lambda r: (
        -((float(r["rating"]) if r["rating"] is not None else 5.0)
          * decay(r["dist_m"] / 1000.0)), r["dist_m"], r["id"]))

    picked, tiers, listed_pool = [], Counter(), []
    for row in ranked:
        if row["tier"] == "l":
            listed_pool.append(row)
            continue
        tier = (row["network"] or "?").lower()
        if tiers[tier] >= TIER_CAP:
            continue
        picked.append(row)
        tiers[tier] += 1
        if len(picked) >= cap:
            break
    # A listed row fills only where there would otherwise be nothing at all.
    if not picked and listed_pool:
        picked = listed_pool[:1]
    return [attach_row(r, dest, names,
                       access_for(conn, r, dest)) for r in picked]


def access_for(conn, row, dest):
    """The nearest station to where the route passes, and whether it is close
    enough to call the start car-free."""
    with conn.cursor() as cur:
        cur.execute(ACCESS_SQL, {
            "pt": f"SRID=4326;POINT({row['near_lon']} {row['near_lat']})",
            "cc": row["country"], "snap": ACCESS_SNAP_M})
        got = cur.fetchone()
    if not got:
        return None
    name, kind, d_pt, lat, lon = got
    return {"name": name, "kind": kind,
            "km": round(d_pt / 1000.0, 1),
            "lat": round(lat, 5), "lon": round(lon, 5),
            "transit": d_pt <= TRANSIT_KM * 1000.0}


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dests", default="", help="comma separated destination ids")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    conn = connect()
    ensure(conn, TRANSIT_SQL, verbose=args.verbose)
    ids = {d.strip().upper() for d in args.dests.split(",") if d.strip()}
    dests = load_dests(ids)
    cycle_ids = sorted(published_cycle_ids())
    print(f"{len(dests):,} destinations to attach, against "
          f"{len(cycle_ids):,} rated cycle routes in the wire")
    if not cycle_ids:
        print("  no cycling wire on disk: the cycling half will be empty")

    out = {}
    counts = {"hiking": Counter(), "cycling": Counter()}
    stats = Counter()
    t0 = time.time()
    for i, dest in enumerate(dests, 1):
        with conn.cursor() as cur:
            d_lon, d_lat = prefilter_degrees(dest["lat"])
            cur.execute(NEAR_SQL, {"lat": dest["lat"], "lon": dest["lon"],
                                   "max_m": MAX_KM * 1000.0,
                                   "deg_lon": d_lon, "deg_lat": d_lat,
                                   "cycle_ids": cycle_ids})
            rows = [dict(zip(COLS, r)) for r in cur.fetchall()]
        conn.commit()
        names = {}
        for activity in ("hiking", "cycling"):
            tops = [r["top_of"] for r in rows if r["activity"] == activity]
            names.update(path_names(conn, activity, tops))
        block = {}
        for activity in ("hiking", "cycling"):
            got = pick(rows, activity, conn, dest, names)
            counts[activity][len(got)] += 1
            if got:
                block[activity] = got
                stats[f"{activity}_rows"] += len(got)
                stats[f"{activity}_with_stage"] += sum(1 for g in got if g.get("stage"))
                stats[f"{activity}_car_free"] += sum(1 for g in got if g.get("car_free"))
        if block:
            out[dest["id"]] = block
            stats["dests_with_any"] += 1
        if args.verbose and block:
            print(f"  {dest['id']} {dest['city'][:24]:<24} "
                  + ", ".join(f"{a} {len(v)}" for a, v in block.items()))
        if i % 250 == 0:
            print(f"  {i}/{len(dests)} ({time.time() - t0:.0f}s)")
    conn.close()

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "max_km": MAX_KM, "caps": CAP, "tier_cap": TIER_CAP,
        "destinations": len(dests),
        "destinations_with_any": stats["dests_with_any"],
        "rows": {a: stats[f"{a}_rows"] for a in ("hiking", "cycling")},
        "rows_named_for_their_path": {a: stats[f"{a}_with_stage"]
                                      for a in ("hiking", "cycling")},
        "car_free_starts": {a: stats[f"{a}_car_free"]
                            for a in ("hiking", "cycling")},
        "per_destination_distribution": {
            a: {str(k): v for k, v in sorted(counts[a].items())}
            for a in ("hiking", "cycling")},
        "r0_baseline_trails": {"0": 134, "1": 365, "2": 342, "3": 320,
                               "4": 265, "5": 212, "6": 1926},
        "seconds": round(time.time() - t0, 1),
    }
    if not args.dry_run:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    print(f"\n{stats['dests_with_any']:,} of {len(dests):,} destinations have "
          f"at least one route ({time.time() - t0:.0f}s)")
    for a in ("hiking", "cycling"):
        print(f"  {a}: {stats[f'{a}_rows']:,} rows, "
              f"{stats[f'{a}_with_stage']:,} named for their path, "
              f"{stats[f'{a}_car_free']:,} car-free starts; "
              f"per destination {report['per_destination_distribution'][a]}")
    if args.dry_run:
        print("dry run: nothing written")
    else:
        print(f"wrote {OUT.relative_to(ROOT).as_posix()} and "
              f"{REPORT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
