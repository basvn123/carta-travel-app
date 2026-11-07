"""Repair broken trails by ROUTING across their gaps on foot paths (T1183, D24).

Tier: Scheduled behind a flag (run_pipeline task trails_route_bridge, only
when CARTA_TRAILS_ROUTE_BRIDGE=1 and BRouter is up)

curate.py publishes a walk only when its geometry is one continuous line.
splice.py already joins the breaks that are mapping artefacts (every break
under 300 m, joined with a straight line, at most 750 m in total), and its
T1094 reorder pass fixes parts stored out of order. What is left is the
`failed_continuity` population of ROADMAP D24 (3,518 in the 2026-09-18
sweep): relations with at least one break too long for a straight line.
Some of those are a missing way through a village or across a valley floor,
a few hundred metres to two kilometres of real path that the relation lost.
Others are whole stages missing (Offa's Dyke Path, one 189 km break) and
must stay out.

This step routes each remaining break with BRouter (tools/brouter, the stock
`hiking-mountain` profile, as the house `carta-hiking` since T1201; research in
Execution/P15/T1183-trail-continuity.md)
and publishes the route only when EVERY break closes within the limits below.
A route that fails any limit is left exactly as it was, and the reason is
kept: in validation_runs (check_name `route_bridge`) and in the run report
data/reports/trails_route_bridge.json.

The limits, and why (each is a module constant, the config key):

  MAX_GAP_M = 2000        the straight-line break that may be routed at all.
                          Two kilometres is about half an hour on foot: a
                          lost connector, a village crossing, a ford. Longer
                          is a missing leg of the walk, which is a different
                          route, not a repair.
  ROUTED_FACTOR = 3.0,    a routed bridge may be at most 3 times its straight
  ROUTED_SLACK_M = 200    line plus 200 m (the slack lets a 40 m break go
                          round a fence), and never over MAX_BRIDGE_M. A
  MAX_BRIDGE_M = 3000     longer answer is BRouter finding a detour, not the
                          path the mappers dropped.
  SNAP_M = 50             BRouter snaps each loose end to the nearest way;
                          a snap further than this means there is no way at
                          that end, so the bridge would start in a field.
  PATH_SHARE_MIN = 0.80   at least 80% of every bridge on footway, path,
                          track, steps, pedestrian, bridleway, cycleway,
                          living_street, residential or service ways; and
  FORBIDDEN               not one metre on motorway, trunk or a ferry.
  MAX_BRIDGES = 8         breaks per route, as splice.MAX_GAPS: more is a
                          relation that was never finished.
  MAX_BRIDGED_M = 5000,   all bridges together (routed and straight) at most
  MAX_BRIDGED_SHARE=0.10  5 km and 10% of the route. The share keeps a short
                          walk from being mostly ours; the absolute cap binds
                          on long trails (10% of Offa's Dyke is 28 km).
  SPLICE_M = 300          a break this short that BRouter cannot route, or
                          routes badly, may still take a straight connector,
                          held to splice.py's own total, MAX_SPLICE_M = 750.

Start, end and order: the parts are taken in the order the relation lists
them; only the direction of each part is chosen (the end nearer to where the
previous part stopped is its start). Every bridge joins the end of part i to
the start of part i+1, so the repaired line starts where the relation's first
part starts, ends where its last part ends, and walks the parts in relation
order. keeps_order() re-checks that on the result before anything is stored.
A relation whose parts are out of order is refused (`gap_too_long` on the
order artefact); splice.py's reorder pass is the tool for those.

What it writes: one trip_repairs row per repaired route (method
`routed-bridge`, the same table curate.py, regionize.py and export_wire.py
already read), with every bridge's figures in repair_info. Z: each original
vertex keeps its own Z; a routed vertex takes BRouter's elevation where it
gives one, else a straight interpolation between the two ends. splice.py
--sync-only brings the stated distance in line, as for its own repairs.

Pure functions (plan_route and what it calls) take plain lists and a router
callable, so tests/test_trail_route_bridge.py runs them with no lab and no
BRouter. Only main() connects.

Usage, from the repo root (lab up: cd tools/trailslab && docker compose up -d;
BRouter up for the country: python tools/brouter/prepare.py --country IE --up --wait):
    python pipeline/trails/route_bridge.py --countries IE --dry-run --verbose
    python pipeline/trails/route_bridge.py --countries IE
    python pipeline/trails/route_bridge.py --trip-id 123456 --dry-run --verbose

ASCII clean, no em dashes, per project convention.
"""

import argparse
import itertools
import json
import math
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
REPORT = ROOT / "data" / "reports" / "trails_route_bridge.json"

BROUTER_URL = "http://127.0.0.1:17777/brouter"
# T1201 (T1183-e): the house profile, stock hiking-mountain with
# hiking_routes_preference 0.5 instead of 0.2, so bridges keep to waymarked
# ways (tools/brouter/profiles/carta-hiking.brf). --profile hiking-mountain
# runs the stock one.
PROFILE = "carta-hiking"
EARTH_RADIUS_M = 6371008.8

# --- The limits (see the module docstring for the reasoning) ---------------
TOUCH_M = 30.0            # ends this close are joined as they are
SPLICE_M = 300.0          # straight fallback bound, as splice.SPLICE_M
MAX_SPLICE_M = 750.0      # straight fallback total, as splice.MAX_SPLICE_M
MAX_GAP_M = 2000.0
ROUTED_FACTOR = 3.0
ROUTED_SLACK_M = 200.0
MAX_BRIDGE_M = 3000.0
SNAP_M = 50.0
PATH_SHARE_MIN = 0.80
MAX_BRIDGES = 8
MAX_BRIDGED_M = 5000.0
MAX_BRIDGED_SHARE = 0.10
MAX_PARTS = 40

PATH_WAYS = frozenset({
    "path", "footway", "track", "steps", "pedestrian", "bridleway",
    "cycleway", "living_street", "residential", "service"})
FORBIDDEN_WAYS = frozenset({
    "motorway", "motorway_link", "trunk", "trunk_link"})

# Every reason a route can be refused, in the order plan_route meets them.
# The report counts each; nothing is refused under any other name.
REFUSALS = (
    "single_part",        # nothing to repair
    "too_many_parts",     # over MAX_PARTS
    "too_many_breaks",    # over MAX_BRIDGES breaks above TOUCH_M
    "gap_too_long",       # a straight-line break over MAX_GAP_M
    "unroutable",         # BRouter found no way and the break is over SPLICE_M
    "snap_too_far",       # a loose end has no way within SNAP_M
    "detour",             # routed length over the factor or MAX_BRIDGE_M
    "forbidden_way",      # motorway, trunk or ferry on the bridge
    "off_path",           # under PATH_SHARE_MIN of the bridge on paths
    "no_way_tags",        # BRouter returned no per-segment tags to check
    "too_much_straight",  # straight fallbacks over MAX_SPLICE_M
    "too_much_bridged",   # all bridges over MAX_BRIDGED_M
    "bridged_share",      # all bridges over MAX_BRIDGED_SHARE of the route
    "not_continuous",     # the safety re-check on the joined line failed
)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def dist_m(a, b):
    """Haversine metres between two points; only lon and lat are read."""
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def line_m(pts):
    return sum(dist_m(p, q) for p, q in itertools.pairwise(pts))


def orient_in_order(parts):
    """The parts in relation order, each facing the way it is walked.

    Only directions are chosen, never the order. The first part faces
    whichever end of the second part is nearer; each later part starts at
    the end nearer to where the previous one stopped. Returns (oriented,
    gaps) with gaps[i] the break between part i and part i+1."""
    if not parts:
        return [], []
    if len(parts) == 1:
        return [list(parts[0])], []
    first, second = parts[0], parts[1]
    fwd = min(dist_m(first[-1], second[0]), dist_m(first[-1], second[-1]))
    rev = min(dist_m(first[0], second[0]), dist_m(first[0], second[-1]))
    oriented = [list(first) if fwd <= rev else list(reversed(first))]
    gaps = []
    for part in parts[1:]:
        end = oriented[-1][-1]
        d_fwd, d_rev = dist_m(end, part[0]), dist_m(end, part[-1])
        oriented.append(list(part) if d_fwd <= d_rev else list(reversed(part)))
        gaps.append(min(d_fwd, d_rev))
    return oriented, gaps


def with_z(pt, z):
    return [pt[0], pt[1], z if z is not None else 0.0]


def z_of(pt):
    return float(pt[2]) if len(pt) > 2 and pt[2] is not None else None


def bridge_points(a, b, coords):
    """The interior of a bridge as 3D points from a to b.

    BRouter's own elevation is kept where it gives one; a point without it
    takes a straight interpolation between the Z of the two ends, so the
    joined line stays 3D and the elevation profile has no holes."""
    za, zb = z_of(a), z_of(b)
    total = line_m(coords) or 1.0
    out, run = [], 0.0
    prev = coords[0] if coords else a
    for c in coords:
        run += dist_m(prev, c)
        prev = c
        z = z_of(c)
        if z is None and za is not None and zb is not None:
            z = za + (zb - za) * run / total
        elif z is None:
            z = za if za is not None else zb
        out.append(with_z(c, z))
    return out


# ---------------------------------------------------------------------------
# BRouter answers
# ---------------------------------------------------------------------------

def parse_tags(text):
    tags = {}
    for token in (text or "").split():
        if "=" in token:
            k, v = token.split("=", 1)
            tags[k] = v
    return tags


def parse_brouter(body):
    """BRouter geojson text -> (answer, None) or (None, error).

    answer = {"coords": [[lon, lat, ele], ...], "segments": [(m, tags)],
              "track_m": float, "ascend_m": float}. BRouter answers a plain
    text error with HTTP 200 when it cannot route, so the body is read,
    not the status."""
    text = (body or "").strip()
    if not text.startswith("{"):
        return None, (text[:120] or "empty answer")
    try:
        feat = json.loads(text)["features"][0]
    except (ValueError, KeyError, IndexError, TypeError):
        return None, "unparseable answer"
    coords = [list(c) for c in (feat.get("geometry") or {}).get("coordinates") or []]
    if len(coords) < 2:
        return None, "empty shape"
    props = feat.get("properties") or {}
    msgs = props.get("messages") or []
    segments = []
    if len(msgs) > 1:
        header = msgs[0]
        if "Distance" in header and "WayTags" in header:
            i_d, i_t = header.index("Distance"), header.index("WayTags")
            for row in msgs[1:]:
                try:
                    m = float(row[i_d])
                except (TypeError, ValueError, IndexError):
                    continue
                if m > 0:
                    segments.append((m, parse_tags(row[i_t] if i_t < len(row) else "")))
    try:
        track = float(props.get("track-length"))
    except (TypeError, ValueError):
        track = line_m(coords)
    try:
        ascend = float(props.get("filtered ascend") or 0)
    except (TypeError, ValueError):
        ascend = 0.0
    return {"coords": coords, "segments": segments, "track_m": track,
            "ascend_m": ascend}, None


def way_mix(segments):
    """Metres on path ways, on forbidden ways, untagged, and the total."""
    path = forbidden = untagged = total = 0.0
    for m, tags in segments:
        total += m
        if not tags or "highway" not in tags and tags.get("route") != "ferry":
            untagged += m
            continue
        if tags.get("route") == "ferry" or tags.get("highway") in FORBIDDEN_WAYS:
            forbidden += m
        elif tags.get("highway") in PATH_WAYS:
            path += m
    return {"path_m": path, "forbidden_m": forbidden, "untagged_m": untagged,
            "total_m": total}


def judge_bridge(a, b, gap_m, answer):
    """None when a routed answer is an acceptable bridge, else the refusal."""
    coords = answer["coords"]
    if dist_m(a, coords[0]) > SNAP_M or dist_m(coords[-1], b) > SNAP_M:
        return "snap_too_far"
    routed = answer["track_m"]
    if routed > min(gap_m * ROUTED_FACTOR + ROUTED_SLACK_M, MAX_BRIDGE_M):
        return "detour"
    mix = way_mix(answer["segments"])
    if mix["total_m"] <= 0:
        return "no_way_tags"
    if mix["forbidden_m"] > 0:
        return "forbidden_way"
    if mix["path_m"] / mix["total_m"] < PATH_SHARE_MIN:
        return "off_path"
    return None


# ---------------------------------------------------------------------------
# The plan for one route
# ---------------------------------------------------------------------------

def keeps_order(line, oriented):
    """True when every original part appears in `line`, whole and in order,
    and the line starts and ends where the oriented parts do."""
    if not oriented or not line:
        return False
    if line[0][:2] != oriented[0][0][:2] or line[-1][:2] != oriented[-1][-1][:2]:
        return False
    pos = 0
    for part in oriented:
        want = [pt[:2] for pt in part]
        # A bridge vertex can coincide with a part's first point, so a
        # mismatch moves the search on rather than failing at once.
        while pos + len(want) <= len(line):
            if all(line[pos + k][:2] == w for k, w in enumerate(want)):
                break
            pos += 1
        else:
            return False
        pos += len(want)
    return True


def max_step_m(line):
    return max((dist_m(p, q) for p, q in itertools.pairwise(line)), default=0.0)


def plan_route(coord_parts, length_m, router):
    """(plan, None, detail) or (None, reason, detail) for one route.

    coord_parts: the stored parts as coordinate lists ([lon, lat] or
    [lon, lat, z]), in relation order. length_m: the route's stated length
    (falls back to the parts' own length). router(a, b) -> (answer, error)
    with answer as parse_brouter returns it; called only for breaks that
    pass the cheap checks, so a refused route costs no routing at all when
    its worst break is already too long."""
    parts = [[list(p) for p in part] for part in coord_parts if len(part) >= 2]
    detail = {"parts": len(parts)}
    if len(parts) < 2:
        return None, "single_part", detail
    if len(parts) > MAX_PARTS:
        return None, "too_many_parts", detail
    oriented, gaps = orient_in_order(parts)
    breaks = [g for g in gaps if g > TOUCH_M]
    detail.update({"breaks": len(breaks),
                   "max_gap_m": round(max(gaps), 1) if gaps else 0.0,
                   "gaps_m": [round(g, 1) for g in gaps[:40]]})
    if len(breaks) > MAX_BRIDGES:
        return None, "too_many_breaks", detail
    if breaks and max(breaks) > MAX_GAP_M:
        return None, "gap_too_long", detail
    own_len = sum(line_m(p) for p in parts)
    length = max(1.0, float(length_m or 0) or own_len)

    line = [with_z(p, z_of(p)) for p in oriented[0]]
    bridges = []
    straight_m = 0.0
    for i, gap in enumerate(gaps):
        nxt = oriented[i + 1]
        a, b = line[-1], nxt[0]
        if gap <= TOUCH_M:
            line.extend(with_z(p, z_of(p)) for p in nxt)
            continue
        answer, err = router(a, b)
        why = judge_bridge(a, b, gap, answer) if answer else "unroutable"
        if why is None:
            inner = bridge_points(a, b, answer["coords"])
            mix = way_mix(answer["segments"])
            bridges.append({
                "after_part": i, "mode": "routed", "gap_m": round(gap, 1),
                "bridge_m": round(answer["track_m"], 1),
                "ascend_m": round(answer["ascend_m"], 1),
                "path_share": round(mix["path_m"] / mix["total_m"], 3)})
            line.extend(inner)
        elif gap <= SPLICE_M:
            # The splice bound: a short break may still take a straight
            # connector, as splice.py would, and says which rule it failed.
            bridges.append({"after_part": i, "mode": "straight",
                            "gap_m": round(gap, 1), "bridge_m": round(gap, 1),
                            "routed_refusal": why,
                            **({"error": str(err)[:80]} if err else {})})
            straight_m += gap
        else:
            detail["failed_gap"] = {"after_part": i, "gap_m": round(gap, 1),
                                    **({"error": str(err)[:80]} if err else {})}
            return None, why, detail
        line.extend(with_z(p, z_of(p)) for p in nxt)

    total = sum(br["bridge_m"] for br in bridges)
    detail.update({"bridges": len(bridges), "bridged_m": round(total, 1),
                   "straight_m": round(straight_m, 1),
                   "bridged_share": round(total / length, 5)})
    if straight_m > MAX_SPLICE_M:
        return None, "too_much_straight", detail
    if total > MAX_BRIDGED_M:
        return None, "too_much_bridged", detail
    if total / length > MAX_BRIDGED_SHARE:
        return None, "bridged_share", detail
    # Safety re-check on what would be stored: the parts whole and in
    # relation order, and no step in the line longer than a straight
    # connector may be (a routed bridge is dense; a step over SPLICE_M would
    # be a jump the checks above missed).
    if not keeps_order(line, oriented) or max_step_m(line) > SPLICE_M + 1e-6:
        return None, "not_continuous", detail
    # T1201 (T1183-b, T1183-c): `bridges` in detail is the count, so the
    # per-bridge figures ride as `bridge_list`, and the routed climb is
    # summed for splice.py --sync-only to add to the stated ascent.
    plan = {"line": line, **detail, "bridge_list": bridges,
            "bridge_ascend_m": round(sum(br.get("ascend_m") or 0
                                         for br in bridges), 1),
            "max_bridge_m": round(max((br["bridge_m"] for br in bridges),
                                      default=0.0), 1),
            "routed": sum(1 for br in bridges if br["mode"] == "routed"),
            "original_m": round(own_len, 1),
            "repaired_m": round(line_m(line), 1)}
    return plan, None, detail


# ---------------------------------------------------------------------------
# Run report (pure, so the tests read the same shape the owner reads)
# ---------------------------------------------------------------------------

def summarise(results):
    """results: [{"id", "country", "title", "reason" or None, ...}]."""
    counts = Counter("repaired" if r.get("reason") is None else r["reason"]
                     for r in results)
    by_country = Counter(r["country"] for r in results if r.get("reason") is None)
    return {
        "candidates": len(results),
        "repaired": counts.get("repaired", 0),
        "refused": {k: counts[k] for k in REFUSALS if counts.get(k)},
        "repaired_by_country": dict(sorted(by_country.items())),
        "limits": {
            "profile": PROFILE, "touch_m": TOUCH_M, "max_gap_m": MAX_GAP_M,
            "routed_factor": ROUTED_FACTOR, "routed_slack_m": ROUTED_SLACK_M,
            "max_bridge_m": MAX_BRIDGE_M, "snap_m": SNAP_M,
            "path_share_min": PATH_SHARE_MIN, "max_bridges": MAX_BRIDGES,
            "max_bridged_m": MAX_BRIDGED_M,
            "max_bridged_share": MAX_BRIDGED_SHARE,
            "splice_m": SPLICE_M, "max_splice_m": MAX_SPLICE_M,
        },
    }


# ---------------------------------------------------------------------------
# I/O: BRouter and the lab
# ---------------------------------------------------------------------------

def make_router(url=BROUTER_URL, profile=PROFILE, timeout=60):
    import requests
    session = requests.Session()

    def route(a, b):
        params = {"lonlats": f"{a[0]:.6f},{a[1]:.6f}|{b[0]:.6f},{b[1]:.6f}",
                  "profile": profile, "alternativeidx": 0,
                  "format": "geojson"}
        try:
            resp = session.get(url, params=params, timeout=timeout)
        except requests.ConnectionError:
            sys.exit(f"brouter unreachable at {url}; start it with "
                     f"python tools/brouter/prepare.py --country XX --up --wait")
        except requests.RequestException as exc:
            return None, f"request failed: {exc}"
        return parse_brouter(resp.text)
    return route


# Same population as splice.py's reorder pass: what both splice passes left.
CANDIDATES_SQL = """
    SELECT t.id, t.country, t.title, t.distance_m,
           ST_AsGeoJSON(t.geom, 7) AS gj,
           md5(ST_AsBinary(ST_Force2D(t.geom))) AS src_md5,
           ST_Length(t.geom::geography) AS orig_len
    FROM trips t
    WHERE t.category = 'hike' AND t.source = 'osm'
      AND t.status <> 'rejected'
      AND t.title NOT LIKE 'OSM route %%'
      AND t.distance_m BETWEEN 2000 AND 400000
      AND ST_NumGeometries(t.geom) BETWEEN 2 AND %(max_parts)s
      AND (%(ids)s::bigint[] IS NULL OR t.id = ANY(%(ids)s))
      AND (%(countries)s::text[] IS NULL OR t.country = ANY(%(countries)s))
      AND NOT EXISTS (SELECT 1 FROM trip_repairs r WHERE r.trip_id = t.id
                      AND r.repair_info->>'source_geom_md5'
                          = md5(ST_AsBinary(ST_Force2D(t.geom))))
    ORDER BY t.country, t.id
"""

WRITE_SQL = """
    WITH l AS (
        SELECT ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%(gj)s), 4326)) AS geom
    )
    INSERT INTO trip_repairs
        (trip_id, geom, repaired, divergence_pct, original_len_m,
         repaired_len_m, repair_info)
    SELECT %(id)s, l.geom, true,
           CASE WHEN %(orig)s > 0
                THEN (ST_Length(l.geom::geography) - %(orig)s) / %(orig)s * 100
                ELSE 0 END,
           %(orig)s, ST_Length(l.geom::geography), %(info)s
    FROM l
    ON CONFLICT (trip_id) DO UPDATE SET
        geom = EXCLUDED.geom, repaired = EXCLUDED.repaired,
        divergence_pct = EXCLUDED.divergence_pct,
        original_len_m = EXCLUDED.original_len_m,
        repaired_len_m = EXCLUDED.repaired_len_m,
        repair_info = EXCLUDED.repair_info,
        created_at = now()
"""

CHECK_SQL = """
    INSERT INTO validation_runs (subject_type, subject_id, check_name, passed, details)
    VALUES ('trip', %s, 'route_bridge', %s, %s)
"""


def run(conn, router, countries, ids, limit, dry_run, verbose):
    from psycopg.types.json import Jsonb
    with conn.cursor() as cur:
        cur.execute(CANDIDATES_SQL, {"max_parts": MAX_PARTS,
                                     "ids": list(ids) or None,
                                     "countries": list(countries) or None})
        rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    results = []
    for n, (rid, cc, title, dist, gj, src_md5, orig_len) in enumerate(rows, 1):
        coords = json.loads(gj).get("coordinates") or []
        plan, why, detail = plan_route(coords, dist, router)
        results.append({"id": rid, "country": cc, "title": title,
                        "reason": why, **detail})
        if verbose:
            verdict = (f"repaired, {plan['bridges']} bridge(s), "
                       f"{plan['bridged_m']:.0f} m" if plan else f"refused: {why}")
            print(f"  {rid} {cc} {title[:44]}: {verdict}", flush=True)
        if dry_run:
            continue
        with conn.cursor() as cur:
            cur.execute(CHECK_SQL, (rid, plan is not None,
                                    Jsonb({"reason": why, **detail})))
            if plan:
                info = {k: v for k, v in plan.items() if k != "line"}
                info.update({
                    "method": "routed-bridge", "source_geom_md5": src_md5,
                    "profile": PROFILE, "note": (
                        "parts kept in relation order; breaks routed on foot "
                        "paths with BRouter within the T1183 limits")})
                cur.execute(WRITE_SQL, {
                    "id": rid, "orig": float(orig_len or 0), "info": Jsonb(info),
                    "gj": json.dumps({"type": "LineString",
                                      "coordinates": plan["line"]})})
        if n % 200 == 0:
            conn.commit()
            print(f"  {n}/{len(rows)} ...", flush=True)
    if not dry_run:
        conn.commit()
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="", help="comma separated ISO2")
    ap.add_argument("--trip-id", type=int, action="append", default=[])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--brouter-url", default=BROUTER_URL)
    ap.add_argument("--profile", default=PROFILE)
    ap.add_argument("--dry-run", action="store_true",
                    help="route and judge, write only the report")
    ap.add_argument("--report", default=str(REPORT))
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(errors="replace")
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    sys.path.insert(0, str(HERE))
    from db import connect
    router = make_router(args.brouter_url, args.profile)
    with connect() as conn:
        results = run(conn, router, countries, args.trip_id, args.limit,
                      args.dry_run, args.verbose)
    summary = summarise(results)
    summary["dry_run"] = args.dry_run
    summary["routes"] = results
    out = Path(args.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=1, ensure_ascii=True) + "\n",
                   encoding="utf-8")
    print(f"route bridge: {summary['repaired']:,} of {summary['candidates']:,} "
          f"candidate route(s) became continuous")
    for k, v in summary["refused"].items():
        print(f"  refused {k}: {v:,}")
    print(f"report: {out}")
    if args.dry_run:
        print("dry run: nothing written to the lab")
    else:
        print("next: splice.py --sync-only (stated distances), then trails_curate")


if __name__ == "__main__":
    main()
