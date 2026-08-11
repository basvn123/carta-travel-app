"""Gap repair: bridge breaks in staged hike geometries via local Valhalla.

The ingest step (ingest_osm_routes.py) stores each OSM route relation as a
MultiLineString whose parts are in relation order, with gap bookkeeping in
trips.gap_info. This script runs the continuity check over those geometries
and, for trips that fail it, routes across each gap with the local Valhalla
(tools/trailslab/valhalla, pedestrian costing), splices the routed segment
between the parts, and stores the repaired geometry in trip_repairs next to
the untouched original.

Auto-accept rules: a repair is accepted (trip_repairs.repaired = true) only
when every gap above tolerance was bridged AND the length divergence between
repaired and original stays within --divergence-pct (default 15). Anything
else keeps repaired = false and moves draft trips to needs_review; a human
decides in the review UI. Nothing is ever auto-approved.

The continuity check (check_continuity) is defined here and absorbed by the
validation engine (validate.py imports it and writes the same check_name);
both follow the validation_runs conventions (one row per check per subject).
When a trip has a fresh accepted repair, meaning the trip's 2D geometry is
unchanged since the repair (REPAIR_FRESH_SQL), the check runs against the
repaired geometry, which is what makes re-validation pass after a repair.

Repaired geometry is written with Z = 0: re-run the elevation sampling step
after repairs before trusting ascent figures.

Usage, from the repo root (DB up; Valhalla up for repair mode, see
tools/trailslab/valhalla/prepare.py):
    python pipeline/trails/repair.py --check-only --countries CH
    python pipeline/trails/repair.py --countries CH --limit 5
    python pipeline/trails/repair.py --trip-id 123456
"""

import argparse
import json
import math
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from env_local import load_env  # noqa: E402

REPAIRS_DDL = ROOT / "tools" / "trailslab" / "initdb" / "02_trip_repairs.sql"
EARTH_RADIUS_M = 6371008.8
# A stored repair stays usable until the trip's 2D geometry actually changes
# (same md5 convention as elevation.py). The updated_at trigger fires on any
# trips UPDATE, including pure bookkeeping (validation stamps, status flips),
# so a timestamp comparison would stale every repair on every validate run;
# rows written before the md5 existed fall back to that older comparison.
REPAIR_FRESH_SQL = (
    "(r.repaired AND (r.repair_info->>'source_geom_md5'"
    " = md5(ST_AsBinary(ST_Force2D(t.geom)))"
    " OR (r.repair_info->>'source_geom_md5' IS NULL"
    " AND r.created_at >= t.updated_at)))")
# Generous snapping: trail endpoints sit on OSM ways, but the extract clip
# or a private-access way can push the nearest routable edge some way off.
SNAP_RADIUS_M = 150


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def dist_m(a, b):
    """Haversine metres between two (lon, lat) points."""
    phi1, phi2 = math.radians(a[1]), math.radians(b[1])
    dphi, dlam = phi2 - phi1, math.radians(b[0] - a[0])
    h = (math.sin(dphi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def parts_length_m(parts):
    return sum(dist_m(p, q) for part in parts for p, q in zip(part, part[1:]))


def parse_multiline(geojson_text):
    """GeoJSON MultiLineString -> list of parts as (lon, lat) tuples (Z dropped)."""
    gj = json.loads(geojson_text)
    return [[(pt[0], pt[1]) for pt in part] for part in gj["coordinates"]]


def chain_parts(parts):
    """Orient parts (stored in relation order) so consecutive ends meet.

    The upstream stitcher leaves part orientation arbitrary, so each junction
    considers both ends of the incoming part, and the first part also tries
    both of its own orientations against the second. Returns (oriented parts,
    gap metres between part i's end and part i+1's start).
    """
    if len(parts) <= 1:
        return [list(p) for p in parts], []
    first = parts[0]
    flips = [(min(dist_m(a_end, b_start) for b_start in
                  (parts[1][0], parts[1][-1])), flip)
             for flip, a_end in ((False, first[-1]), (True, first[0]))]
    oriented = [list(reversed(first)) if min(flips)[1] else list(first)]
    gaps = []
    for part in parts[1:]:
        end = oriented[-1][-1]
        d_fwd, d_rev = dist_m(end, part[0]), dist_m(end, part[-1])
        gaps.append(min(d_fwd, d_rev))
        oriented.append(list(reversed(part)) if d_rev < d_fwd else list(part))
    return oriented, gaps


def multiline_wkt(parts):
    body = ",".join(
        "(" + ",".join(f"{x:.7f} {y:.7f}" for x, y in part) + ")"
        for part in parts)
    return "MULTILINESTRING(" + body + ")"


# ---------------------------------------------------------------------------
# Continuity check (validation_runs conventions; the future validation
# engine can absorb this)
# ---------------------------------------------------------------------------

def check_continuity(parts, tolerance_m, osmc_status=None):
    """One trip's continuity verdict: (passed, details dict)."""
    _, gaps = chain_parts(parts)
    over = [g for g in gaps if g > tolerance_m]
    details = {
        "tolerance_m": tolerance_m,
        "parts": len(parts),
        "gaps_m": [round(g, 1) for g in gaps[:40]],
        "gaps_over_tolerance": len(over),
        "max_gap_m": round(max(gaps), 1) if gaps else 0,
    }
    if osmc_status:
        details["osmc_status"] = osmc_status   # upstream signal, not a gate
    return not over, details


def record_check(cur, trip_id, check_name, passed, details):
    from psycopg.types.json import Jsonb
    cur.execute(
        """INSERT INTO validation_runs
               (subject_type, subject_id, check_name, passed, details)
           VALUES ('trip', %s, %s, %s, %s)""",
        (trip_id, check_name, passed, Jsonb(details)))


# ---------------------------------------------------------------------------
# Valhalla client
# ---------------------------------------------------------------------------

def decode_polyline6(shape):
    """Valhalla shape string -> [(lon, lat), ...] (polyline, 1e-6 precision)."""
    coords, i, lat, lon = [], 0, 0, 0
    while i < len(shape):
        deltas = []
        for _ in range(2):
            result, shift = 0, 0
            while True:
                b = ord(shape[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lon += deltas[1]
        coords.append((lon / 1e6, lat / 1e6))
    return coords


def valhalla_route(session, base_url, a, b):
    """Pedestrian route a -> b. Returns (coords, None) or (None, reason)."""
    payload = {
        "locations": [
            {"lat": a[1], "lon": a[0], "type": "break", "radius": SNAP_RADIUS_M},
            {"lat": b[1], "lon": b[0], "type": "break", "radius": SNAP_RADIUS_M},
        ],
        "costing": "pedestrian",
        "directions_type": "none",
    }
    try:
        resp = session.post(base_url.rstrip("/") + "/route", json=payload,
                            timeout=60)
    except requests.ConnectionError:
        sys.exit(f"valhalla unreachable at {base_url}; start it with "
                 f"python tools/trailslab/valhalla/prepare.py --up --wait")
    except requests.RequestException as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if resp.status_code != 200:
        try:
            err = resp.json()
            reason = f"code {err.get('error_code')}: {err.get('error')}"
        except ValueError:
            reason = f"HTTP {resp.status_code}"
        return None, reason
    coords = []
    for leg in resp.json()["trip"]["legs"]:
        coords.extend(decode_polyline6(leg["shape"]))
    if len(coords) < 2:
        return None, "empty shape"
    return coords, None


# ---------------------------------------------------------------------------
# Repair
# ---------------------------------------------------------------------------

def repair_parts(oriented, gaps, session, args):
    """Splice routed segments into the oriented parts.

    Gaps within tolerance stay as breaks (the check tolerates them); gaps
    above --max-gap-km are never routed, a detour that long would be a
    fabrication, not a repair. Returns (new parts, per-gap records).
    """
    assembled = [oriented[0]]
    records = []
    for part, gap in zip(oriented[1:], gaps):
        if gap <= args.tolerance_m:
            records.append({"gap_m": round(gap, 1), "status": "tolerated"})
            assembled.append(part)
            continue
        if gap > args.max_gap_km * 1000:
            records.append({"gap_m": round(gap, 1), "status": "skipped",
                            "reason": f"exceeds --max-gap-km {args.max_gap_km}"})
            assembled.append(part)
            continue
        coords, err = valhalla_route(session, args.valhalla_url,
                                     assembled[-1][-1], part[0])
        if coords is None:
            records.append({"gap_m": round(gap, 1), "status": "failed",
                            "error": err})
            assembled.append(part)
            continue
        routed_m = sum(dist_m(p, q) for p, q in zip(coords, coords[1:]))
        records.append({"gap_m": round(gap, 1), "status": "routed",
                        "routed_m": round(routed_m, 1)})
        # The shape ends are edge-snapped, not the exact trail endpoints;
        # plain concatenation closes the last few metres with connectors.
        assembled[-1] = assembled[-1] + coords + part
    return assembled, records


def store_repair(cur, trip_id, parts, repaired, divergence_pct,
                 original_m, repaired_m, info):
    from psycopg.types.json import Jsonb
    cur.execute(
        """INSERT INTO trip_repairs (trip_id, geom, repaired, divergence_pct,
                                     original_len_m, repaired_len_m, repair_info)
           VALUES (%s, ST_Force3D(ST_GeomFromText(%s, 4326)), %s, %s, %s, %s,
                   %s::jsonb || jsonb_build_object('source_geom_md5',
                       (SELECT md5(ST_AsBinary(ST_Force2D(geom)))
                        FROM trips WHERE id = %s)))
           ON CONFLICT (trip_id) DO UPDATE
           SET geom = EXCLUDED.geom, repaired = EXCLUDED.repaired,
               divergence_pct = EXCLUDED.divergence_pct,
               original_len_m = EXCLUDED.original_len_m,
               repaired_len_m = EXCLUDED.repaired_len_m,
               repair_info = EXCLUDED.repair_info, created_at = now()""",
        (trip_id, multiline_wkt(parts), repaired, round(divergence_pct, 2),
         int(round(original_m)), int(round(repaired_m)), Jsonb(info), trip_id))


def flag_for_review(cur, trip_id):
    # Only drafts move; never touch needs_review/approved/published/rejected.
    cur.execute("UPDATE trips SET status = 'needs_review' "
                "WHERE id = %s AND status = 'draft'", (trip_id,))


def repair_trip(conn, trip, session, args, counts):
    trip_id, country, title, osmc_status, gj_original = trip[:5]
    parts = parse_multiline(gj_original)
    oriented, gaps = chain_parts(parts)
    passed, details = check_continuity(parts, args.tolerance_m, osmc_status)
    if passed:
        counts["already_passing"] += 1
        return
    print(f"[{trip_id}] {title} ({country}, {len(parts)} parts, "
          f"max gap {details['max_gap_m']:.0f} m)")

    original_m = parts_length_m(parts)
    new_parts, gap_records = repair_parts(oriented, gaps, session, args)
    repaired_m = parts_length_m(new_parts)
    divergence = ((repaired_m - original_m) / original_m * 100
                  if original_m else 0.0)
    routed = [r for r in gap_records if r["status"] == "routed"]
    unbridged = [r for r in gap_records
                 if r["status"] in ("failed", "skipped")]
    for rec in gap_records:
        if rec["status"] == "routed":
            print(f"  gap {rec['gap_m']:.0f} m -> routed "
                  f"{rec['routed_m']:.0f} m of path")
        elif rec["status"] != "tolerated":
            why = rec.get("error") or rec.get("reason")
            print(f"  gap {rec['gap_m']:.0f} m -> {rec['status']} ({why})")

    auto = not unbridged and abs(divergence) <= args.divergence_pct
    verdict = ("auto-accepted" if auto else
               "flagged for review (" +
               ("unbridged gaps" if unbridged else
                f"divergence over {args.divergence_pct:g}%") + ")")
    print(f"  before {original_m / 1000:.2f} km, "
          f"after {repaired_m / 1000:.2f} km, "
          f"divergence {divergence:+.1f}% -> {verdict}")
    counts["auto_accepted" if auto else "flagged_review"] += 1

    info = {"tolerance_m": args.tolerance_m,
            "divergence_threshold_pct": args.divergence_pct,
            "valhalla": args.valhalla_url, "gaps": gap_records}
    re_passed, re_details = check_continuity(new_parts, args.tolerance_m,
                                             osmc_status)
    re_details["geometry"] = "repaired"
    print(f"  continuity re-check: {'PASS' if re_passed else 'STILL FAILING'} "
          f"({re_details['gaps_over_tolerance']} gaps over "
          f"{args.tolerance_m:g} m)")

    if args.dry_run:
        return
    with conn.cursor() as cur:
        record_check(cur, trip_id, "continuity", passed,
                     {**details, "geometry": "original"})
        record_check(cur, trip_id, "gap_repair", auto, info)
        if routed:
            store_repair(cur, trip_id, new_parts, auto, divergence,
                         original_m, repaired_m, info)
            record_check(cur, trip_id, "continuity", re_passed, re_details)
        if not auto:
            flag_for_review(cur, trip_id)
    conn.commit()   # per trip: keep transactions short next to live ingests


# ---------------------------------------------------------------------------
# Candidate selection and modes
# ---------------------------------------------------------------------------

def ensure_schema(conn):
    with conn.cursor() as cur:
        cur.execute(REPAIRS_DDL.read_text())
    conn.commit()


def fetch_candidates(conn, args):
    """Multipart trips (or one specific trip), gappiest last so the demo
    ordering surfaces big single-gap routes first."""
    where, params = ["t.source = 'osm'"], []
    if args.trip_id:
        where.append("t.id = %s")
        params.append(args.trip_id)
    else:
        where.append("COALESCE((t.gap_info->>'gap_count')::int, 0) > 0")
        if args.countries:
            where.append("t.country = ANY(%s)")
            params.append(args.countries)
    sql = f"""
        SELECT t.id, t.country, t.title, t.raw_tags->>'osmc:status',
               ST_AsGeoJSON(t.geom, 7),
               CASE WHEN {REPAIR_FRESH_SQL}
                    THEN ST_AsGeoJSON(r.geom, 7) END
        FROM trips t
        LEFT JOIN trip_repairs r ON r.trip_id = t.id
        WHERE {' AND '.join(where)}
        ORDER BY COALESCE((t.gap_info->>'gap_count')::int, 0) ASC,
                 t.distance_m DESC NULLS LAST"""
    if args.limit:
        sql += " LIMIT %s"
        params.append(args.limit)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def check_only(conn, trips, args):
    """Validate continuity for every candidate, preferring fresh accepted
    repairs; single-part trips pass trivially and are not selected."""
    from collections import Counter
    counts = Counter()
    for trip_id, country, title, osmc_status, gj, gj_repaired in trips:
        parts = parse_multiline(gj_repaired or gj)
        passed, details = check_continuity(parts, args.tolerance_m, osmc_status)
        details["geometry"] = "repaired" if gj_repaired else "original"
        counts["pass" if passed else "fail"] += 1
        if gj_repaired:
            counts["using_repair"] += 1
        if not args.dry_run:
            with conn.cursor() as cur:
                record_check(cur, trip_id, "continuity", passed, details)
            conn.commit()
        if args.trip_id or args.verbose:
            print(f"[{trip_id}] {title} ({country}): "
                  f"{'PASS' if passed else 'FAIL'} on {details['geometry']} "
                  f"geometry, {details['gaps_over_tolerance']} gaps over "
                  f"{args.tolerance_m:g} m, max {details['max_gap_m']:.0f} m")
    print(f"\ncontinuity: {counts['pass']} pass, {counts['fail']} fail "
          f"of {len(trips)} multipart trips checked "
          f"({counts['using_repair']} on repaired geometry)")


def main():
    sys.stdout.reconfigure(errors="replace")
    load_env()
    parser = argparse.ArgumentParser(
        description="Repair gappy hike geometries via the local Valhalla.")
    parser.add_argument("--countries", default="",
                        help="comma-separated ISO codes, e.g. CH,AT "
                             "(default: all)")
    parser.add_argument("--trip-id", type=int, default=0,
                        help="repair or check one specific trip id")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap candidate trips (ordered: fewest gaps, "
                             "longest route first)")
    parser.add_argument("--check-only", action="store_true",
                        help="run the continuity check, no repairs")
    parser.add_argument("--tolerance-m", type=float, default=50.0,
                        help="gap tolerance in metres (default 50)")
    parser.add_argument("--divergence-pct", type=float, default=15.0,
                        help="max auto-accepted length divergence (default 15)")
    parser.add_argument("--max-gap-km", type=float, default=25.0,
                        help="never route gaps longer than this (default 25)")
    parser.add_argument("--valhalla-url",
                        default=None,
                        help="Valhalla base URL (default: "
                             "TRAILSLAB_VALHALLA_URL or http://localhost:8002)")
    parser.add_argument("--dry-run", action="store_true",
                        help="compute and print only, no DB writes")
    parser.add_argument("--verbose", action="store_true",
                        help="per-trip lines in --check-only mode")
    args = parser.parse_args()
    if args.valhalla_url is None:
        import os
        args.valhalla_url = os.environ.get("TRAILSLAB_VALHALLA_URL",
                                           "http://localhost:8002")
    args.countries = [c.strip().upper()
                      for c in args.countries.split(",") if c.strip()]

    conn = connect()
    ensure_schema(conn)
    trips = fetch_candidates(conn, args)
    if not trips:
        print("no candidate trips match the filters")
        return

    if args.check_only:
        check_only(conn, trips, args)
    else:
        from collections import Counter
        counts = Counter()
        session = requests.Session()
        for trip in trips:
            repair_trip(conn, trip, session, args, counts)
        print(f"\nrepair: {counts['auto_accepted']} auto-accepted, "
              f"{counts['flagged_review']} flagged for review, "
              f"{counts['already_passing']} of {len(trips)} candidates "
              f"already passed")
    conn.close()


if __name__ == "__main__":
    main()
