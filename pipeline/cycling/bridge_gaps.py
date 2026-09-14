"""Bridge the real breaks in a cycle route by ROUTING across them, with BRouter.

splice_cycling.py joins breaks up to 300 m with a straight connector, which
is right for the mapper's dropped ten-metre way and wrong for anything else.
The Scottish tour candidates fail continuity on breaks of 1.4 to 165 km:
ferry crossings (Bute, the Hebrides, the coastal run of EuroVelo 12) and
genuinely missing sections. A looser splice bound would draw a straight line
across the Sound of Bute and call it a day's ride; what those breaks need is
a road between the two ends, or a ferry, and a record of which it was.

So every gap above the splice bound is routed with BRouter (tools/brouter):
the house touring profile first, the stock trekking profile second because it
is the one that knows about ferries. What comes back is spliced in as its
own piece, with ITS OWN WAY TAGS from BRouter's per-segment messages written
into way_spans, so the surface, safety and bike-type figures of a stage that
crosses a bridge are measured on the road actually ridden rather than
inherited from the signed route around it. A ferry leg is tagged route=ferry
and counted separately.

Three bounds decide what is a repair and what is a different route:

    MAX_BRIDGE_GAP_M    a break longer than this is not a gap, it is most of a
                        route missing; nothing is routed across it
    MAX_ROUTED_FACTOR   a routed bridge much longer than its straight line is
                        a detour BRouter had to take, not the route
    MAX_BRIDGE_SHARE    and however small each bridge, together they may not
                        be more than a quarter of the ride, or the published
                        line is ours rather than the signed route's

A route that fails any of them stays as it was, and says why in the log.

What the repair leaves for the rest of the chain: cycle_repairs.geom (Z=0,
the elevation step re-samples any route whose effective geometry changed,
by md5), way_spans shifted and extended, distance_m brought in line. Then:

    python pipeline/cycling/enrich_cycling.py --steps elevation,surface,safety,services --countries GB
    python pipeline/cycling/cycle_index.py --countries GB
    python pipeline/cycling/stage_planner.py --countries GB
    python pipeline/cycling/validate_cycling.py --countries GB
    python pipeline/cycling/export_cycling.py   (then joins, then regions)

Usage, from the repo root (DB up; BRouter up: python tools/brouter/prepare.py --country GB --up --wait):
    python pipeline/cycling/bridge_gaps.py --countries GB --dry-run --verbose
    python pipeline/cycling/bridge_gaps.py --countries GB --regions TLM --min-km 100
    python pipeline/cycling/bridge_gaps.py --route 44739 --verbose
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import requests
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

connect = S.lab_connect

BROUTER_URL = "http://127.0.0.1:17777/brouter"
PROFILES = ("carta-touring", "trekking")
EARTH_RADIUS_M = 6371008.8

# The splice bound, the same 300 m the trails layer and splice_cycling.py use:
# under it a straight connector is honest, over it a road is needed.
SPLICE_M = 300.0
MAX_BRIDGE_GAP_M = 40_000.0
MAX_ROUTED_FACTOR = 3.0
MAX_ROUTED_SLACK_M = 2_000.0
MAX_BRIDGE_SHARE = 0.25
# Two ends closer than this are already joined; nothing to bridge.
TOUCH_M = 30.0

# The way tags the surface, safety and bike-type steps read. Same list as
# harvest_cycling.WAY_TAGS plus `route`, which is how a ferry leg is known.
WAY_TAGS = ("highway", "surface", "smoothness", "tracktype", "maxspeed",
            "cycleway", "bicycle", "segregated", "access", "oneway",
            "mtb:scale", "route")


def log(msg):
    print(f"[cycling] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def dist_m(a, b):
    """Haversine metres between two (lon, lat) points."""
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def length_m(part):
    return sum(dist_m(part[i], part[i + 1]) for i in range(len(part) - 1))


def orient_parts(parts):
    """Each part the way it is ridden, in the order the relation gave them.

    The relation order is kept (it is the order way_spans was measured in)
    and only the direction of each part is decided: whichever end is nearer
    to where the previous part stopped is the start. The first part faces
    the second.
    """
    out = []
    for i, part in enumerate(parts):
        if i == 0:
            if len(parts) > 1:
                nxt = parts[1]
                d_fwd = min(dist_m(part[-1], nxt[0]), dist_m(part[-1], nxt[-1]))
                d_rev = min(dist_m(part[0], nxt[0]), dist_m(part[0], nxt[-1]))
                out.append((list(part), False) if d_fwd <= d_rev else (list(reversed(part)), True))
            else:
                out.append((list(part), False))
            continue
        prev_end = out[-1][0][-1]
        if dist_m(prev_end, part[0]) <= dist_m(prev_end, part[-1]):
            out.append((list(part), False))
        else:
            out.append((list(reversed(part)), True))
    return out


# ---------------------------------------------------------------------------
# BRouter
# ---------------------------------------------------------------------------

def parse_tags(text):
    """BRouter's WayTags column, "highway=tertiary surface=asphalt", as the
    tag subset the enrichment steps read."""
    tags = {}
    for token in (text or "").split():
        if "=" not in token:
            continue
        k, v = token.split("=", 1)
        if k in WAY_TAGS:
            tags[k] = v
    return tags or None


def route_gap(session, a, b, profile, timeout=60):
    """One BRouter call. Returns (coords, segments, meta) or None.

    segments are (length_m, tags) in order, from the per-segment messages;
    the coordinates are the routed line. BRouter answers a plain-text error
    with status 200 when it cannot route, so the body is tested, not the
    status.
    """
    params = {
        "lonlats": f"{a[0]:.6f},{a[1]:.6f}|{b[0]:.6f},{b[1]:.6f}",
        "profile": profile,
        "alternativeidx": 0,
        "format": "geojson",
    }
    try:
        resp = session.get(BROUTER_URL, params=params, timeout=timeout)
    except requests.RequestException as exc:
        return None, f"request failed: {exc}"
    body = resp.text or ""
    if not body.lstrip().startswith("{"):
        return None, body.strip()[:120] or f"http {resp.status_code}"
    try:
        feat = resp.json()["features"][0]
    except (ValueError, KeyError, IndexError):
        return None, "unparseable answer"
    coords = [[c[0], c[1]] for c in feat["geometry"]["coordinates"]]
    props = feat.get("properties") or {}
    msgs = props.get("messages") or []
    segments = []
    if len(msgs) > 1:
        header = msgs[0]
        try:
            i_dist = header.index("Distance")
            i_tags = header.index("WayTags")
        except ValueError:
            i_dist = i_tags = None
        if i_dist is not None:
            for row in msgs[1:]:
                try:
                    seg_m = float(row[i_dist])
                except (TypeError, ValueError, IndexError):
                    continue
                if seg_m <= 0:
                    continue
                segments.append((seg_m, parse_tags(row[i_tags] if i_tags is not None
                                                   and i_tags < len(row) else "")))
    meta = {
        "track_m": float(props.get("track-length") or length_m(coords)),
        "ascend_m": float(props.get("filtered ascend") or 0),
        "profile": profile,
    }
    return (coords, segments, meta), None


def within_bounds(routed_m, gap_m):
    return routed_m <= gap_m * MAX_ROUTED_FACTOR + MAX_ROUTED_SLACK_M


def bridge(session, a, b, gap_m, verbose=False):
    """Route a gap, and take the shortest answer that is a bridge.

    The touring profile answers first and is kept when its answer is within
    bounds. When it is not, the answer is usually water: a 300 m break
    across a firth that the touring profile has to ride 13 km round, and the
    trekking profile crosses on the ferry. So an over-long touring answer is
    never taken on its own; the trekking profile is asked as well and the
    shorter of the two acceptable answers wins. If neither is acceptable the
    caller refuses the route and says which detour it would have been.
    """
    best, worst_detour, errors = None, None, []
    for profile in PROFILES:
        got, err = route_gap(session, a, b, profile)
        if not got:
            errors.append(f"{profile}: {err}")
            if verbose:
                log(f"    {profile}: {err}")
            continue
        routed = got[2]["track_m"]
        if within_bounds(routed, gap_m):
            if best is None or routed < best[2]["track_m"]:
                best = got
            if profile == PROFILES[0]:
                break
        else:
            worst_detour = routed if worst_detour is None else min(worst_detour, routed)
    if best:
        return best, None
    if worst_detour is not None:
        return None, f"detour_{worst_detour / 1000:.0f}km_for_{gap_m / 1000:.1f}km"
    return None, "unroutable:" + "; ".join(errors)[:80]


# ---------------------------------------------------------------------------
# way_spans
# ---------------------------------------------------------------------------

def rebuild_spans(way_spans, part_infos, bridges_by_index):
    """way_spans for the repaired line.

    The original spans are positioned along the relation-ordered parts; each
    part keeps its spans, translated to where the part now starts and
    mirrored where the part was reversed, and every bridge contributes its
    own spans from BRouter's segments. Tagsets are re-packed so a bridge's
    tags dedupe against the route's.
    """
    tagsets = list((way_spans or {}).get("tagsets") or [])
    spans = [(float(s), float(e), int(ref)) for s, e, ref in (way_spans or {}).get("spans") or []]
    index = {json.dumps(t, sort_keys=True): i for i, t in enumerate(tagsets)}

    def ref_for(tags):
        if not tags:
            return -1
        key = json.dumps(tags, sort_keys=True)
        if key not in index:
            index[key] = len(tagsets)
            tagsets.append(tags)
        return index[key]

    out = []
    cursor = 0.0
    for i, info in enumerate(part_infos):
        o_start, o_end, reversed_, new_len = info
        o_len = max(o_end - o_start, 1e-9)
        scale = new_len / o_len
        for s, e, ref in spans:
            lo, hi = max(s, o_start), min(e, o_end)
            if hi <= lo:
                continue
            if reversed_:
                ns, ne = cursor + (o_end - hi) * scale, cursor + (o_end - lo) * scale
            else:
                ns, ne = cursor + (lo - o_start) * scale, cursor + (hi - o_start) * scale
            out.append([round(ns, 1), round(ne, 1), ref])
        cursor += new_len
        br = bridges_by_index.get(i)
        if br:
            for seg_m, tags in br["segments"]:
                out.append([round(cursor, 1), round(cursor + seg_m, 1), ref_for(tags)])
                cursor += seg_m
            # A straight connector has no tags: untagged metres, as the
            # splice module records them.
            if br["mode"] == "straight":
                out.append([round(cursor, 1), round(cursor + br["routed_m"], 1), -1])
                cursor += br["routed_m"]
    out.sort(key=lambda x: x[0])
    # Merge touching spans with the same tagset, the way pack_spans does.
    packed = []
    for s, e, ref in out:
        if packed and packed[-1][2] == ref and abs(packed[-1][1] - s) < 1.0:
            packed[-1][1] = e
        else:
            packed.append([s, e, ref])
    untagged = sum(e - s for s, e, ref in packed if ref == -1)
    return {"tagsets": tagsets, "spans": packed, "untagged_m": int(round(untagged))}


# ---------------------------------------------------------------------------
# The repair
# ---------------------------------------------------------------------------

CANDIDATES_SQL = """
    SELECT r.id, r.country, coalesce(r.name, r.ref, 'route ' || r.id),
           r.distance_m, r.way_spans, ST_AsGeoJSON(ST_Force2D(r.geom)),
           md5(ST_AsBinary(ST_Force2D(r.geom)))
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr ON cr.route_id = r.id
    WHERE (%(ids)s::bigint[] IS NOT NULL AND r.id = ANY(%(ids)s)
           OR (%(ids)s::bigint[] IS NULL
               AND r.country = ANY(%(countries)s)
               AND r.status <> 'rejected'
               AND r.distance_m >= %(min_m)s
               AND (%(region)s::text IS NULL OR r.regions->>'n2' LIKE %(region)s)))
      AND ST_NumGeometries(ST_LineMerge(ST_Force2D(r.geom))) > 1
      AND (%(refresh)s OR cr.route_id IS NULL OR NOT cr.repaired
           OR cr.repair_info->>'source_geom_md5'
              IS DISTINCT FROM md5(ST_AsBinary(ST_Force2D(r.geom))))
    ORDER BY r.distance_m DESC
"""

UPSERT_SQL = """
    INSERT INTO cycle_repairs
        (route_id, geom, repaired, divergence_pct, original_len_m,
         repaired_len_m, repair_info)
    VALUES (%(id)s,
            ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(%(gj)s), 4326)),
            true, %(div)s, %(o_len)s, %(r_len)s, %(info)s)
    ON CONFLICT (route_id) DO UPDATE SET
        geom = EXCLUDED.geom, repaired = true,
        divergence_pct = EXCLUDED.divergence_pct,
        original_len_m = EXCLUDED.original_len_m,
        repaired_len_m = EXCLUDED.repaired_len_m,
        repair_info = EXCLUDED.repair_info,
        created_at = now()
"""

ROUTE_SQL = """
    UPDATE cycle_routes SET way_spans = %(spans)s, distance_m = %(r_len)s
    WHERE id = %(id)s
"""


def repair_one(session, row, verbose=False):
    rid, cc, name, distance_m, way_spans, gj, md5 = row
    geom = json.loads(gj)
    raw_parts = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
    raw_parts = [p for p in raw_parts if len(p) > 1]
    if len(raw_parts) < 2:
        return None, "one_part"

    # Where each part sits in the ORIGINAL way_spans: cumulative over the
    # relation order, which is how build_spans measured them.
    o_lens = [length_m(p) for p in raw_parts]
    o_total = sum(o_lens)
    span_total = max((float(e) for _s, e, _r in (way_spans or {}).get("spans") or []), default=0.0)
    # way_spans was measured by the harvest with its own edge lengths; rescale
    # so the parts tile the span axis exactly.
    k = (span_total / o_total) if (o_total and span_total) else 1.0
    o_offsets, c = [], 0.0
    for L in o_lens:
        o_offsets.append((c, c + L * k))
        c += L * k

    oriented = orient_parts(raw_parts)
    bridges = {}
    total_bridge = ferry_m = 0.0
    for i in range(len(oriented) - 1):
        a = oriented[i][0][-1]
        b = oriented[i + 1][0][0]
        gap = dist_m(a, b)
        if gap <= TOUCH_M:
            continue
        if gap <= SPLICE_M:
            bridges[i] = {"mode": "straight", "gap_m": round(gap), "routed_m": gap,
                          "coords": [a, b], "segments": [], "ascend_m": 0}
            total_bridge += gap
            continue
        if gap > MAX_BRIDGE_GAP_M:
            return None, f"gap_{i}_is_{gap / 1000:.0f}km_not_a_gap"
        got, err = bridge(session, a, b, gap, verbose)
        if not got:
            return None, f"gap_{i}_{err}"
        coords, segments, meta = got
        routed = meta["track_m"]
        is_ferry = any(t and t.get("route") == "ferry" for _m, t in segments)
        f_m = sum(m for m, t in segments if t and t.get("route") == "ferry")
        bridges[i] = {"mode": "ferry" if is_ferry else "road", "gap_m": round(gap),
                      "routed_m": routed, "coords": coords, "segments": segments,
                      "ascend_m": meta["ascend_m"], "profile": meta["profile"],
                      "ferry_m": round(f_m)}
        total_bridge += routed
        ferry_m += f_m
        if verbose:
            log(f"    gap {i}: {gap / 1000:.1f} km -> {bridges[i]['mode']} "
                f"{routed / 1000:.1f} km ({meta['profile']})")
    if not bridges:
        return None, "nothing_to_bridge"
    if total_bridge > o_total * MAX_BRIDGE_SHARE:
        return None, f"bridged_{total_bridge / o_total:.0%}_over_{MAX_BRIDGE_SHARE:.0%}"

    # One line: parts and bridges in riding order.
    line = []
    part_infos = []
    for i, (pts, rev) in enumerate(oriented):
        if line and dist_m(line[-1], pts[0]) <= TOUCH_M:
            line.extend(pts[1:])
        else:
            line.extend(pts)
        part_infos.append((o_offsets[i][0], o_offsets[i][1], rev, o_lens[i]))
        br = bridges.get(i)
        if br:
            bc = br["coords"]
            line.extend(bc[1:] if dist_m(line[-1], bc[0]) <= TOUCH_M else bc)
    r_len = length_m(line)
    new_spans = rebuild_spans(way_spans, part_infos, bridges)
    info = {
        "method": "brouter",
        "source_geom_md5": md5,
        "bridges": len(bridges),
        "total_bridge_m": int(round(total_bridge)),
        "ferry_m": int(round(ferry_m)),
        "bridge_list": [
            {"after_part": i, "mode": b["mode"], "gap_m": b["gap_m"],
             "routed_m": int(round(b["routed_m"])), "profile": b.get("profile"),
             "from": [round(b["coords"][0][0], 5), round(b["coords"][0][1], 5)],
             "to": [round(b["coords"][-1][0], 5), round(b["coords"][-1][1], 5)]}
            for i, b in sorted(bridges.items())],
        "model": "cycle_bridge_v1",
    }
    return {
        "id": rid, "name": name, "cc": cc,
        "gj": json.dumps({"type": "MultiLineString", "coordinates": [line]}),
        "div": round(100.0 * abs(r_len - o_total) / max(o_total, 1), 2),
        "o_len": int(round(o_total)), "r_len": int(round(r_len)),
        "info": info, "spans": new_spans,
        "n_bridges": len(bridges), "total_bridge": total_bridge, "ferry_m": ferry_m,
        "modes": sorted({b["mode"] for b in bridges.values()}),
    }, None


def run(conn, countries, ids, min_km, region, refresh, dry_run, verbose):
    with conn.cursor() as cur:
        cur.execute(CANDIDATES_SQL, {
            "ids": ids or None, "countries": list(countries) or [],
            "min_m": int(min_km * 1000), "region": (region + "%") if region else None,
            "refresh": bool(refresh)})
        rows = cur.fetchall()
    log(f"bridge: {len(rows)} route(s) with a break above the splice bound")
    session = requests.Session()
    done, refused = [], []
    t0 = time.time()
    for row in rows:
        rid, cc, name = row[0], row[1], row[2]
        if verbose:
            log(f"  {rid} {name} ({row[3] / 1000:.0f} km)")
        rep, why = repair_one(session, row, verbose)
        if not rep:
            refused.append((rid, name, why))
            if verbose:
                log(f"    refused: {why}")
            continue
        done.append(rep)
        log(f"  {rid} {name}: {rep['n_bridges']} bridge(s), {rep['total_bridge'] / 1000:.1f} km "
            f"{'+'.join(rep['modes'])}"
            + (f", {rep['ferry_m'] / 1000:.1f} km by ferry" if rep["ferry_m"] else "")
            + f", {rep['o_len'] / 1000:.0f} -> {rep['r_len'] / 1000:.0f} km")
        if dry_run:
            continue
        with conn.cursor() as cur:
            cur.execute(UPSERT_SQL, {"id": rep["id"], "gj": rep["gj"], "div": rep["div"],
                                     "o_len": rep["o_len"], "r_len": rep["r_len"],
                                     "info": Jsonb(rep["info"])})
            cur.execute(ROUTE_SQL, {"id": rep["id"], "spans": Jsonb(rep["spans"]),
                                    "r_len": rep["r_len"]})
        conn.commit()
    log(f"bridge: {len(done)} repaired, {len(refused)} refused, {time.time() - t0:.0f}s"
        + (" (dry run, nothing written)" if dry_run else ""))
    if refused:
        from collections import Counter
        kinds = Counter(w.split(":")[0].split("_is_")[0] for _r, _n, w in refused)
        for k, n in kinds.most_common(8):
            log(f"    {k}: {n}")
        if verbose:
            for rid, name, why in refused[:30]:
                log(f"    {rid} {name}: {why}")
    return done, refused


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--route", help="comma separated route ids, repaired as given")
    ap.add_argument("--min-km", type=float, default=100.0,
                    help="only routes long enough to be a tour (default 100)")
    ap.add_argument("--regions", help="ITL/NUTS2 prefix, e.g. TLM for Scotland")
    ap.add_argument("--refresh", action="store_true", help="redo fresh repairs too")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])
    ids = [int(x) for x in args.route.split(",") if x.strip()] if args.route else None
    if not countries and not ids:
        raise SystemExit("--countries or --route is required")
    try:
        requests.get(BROUTER_URL, timeout=5)
    except requests.RequestException:
        raise SystemExit("BRouter is not answering on 127.0.0.1:17777; "
                         "python tools/brouter/prepare.py --country GB --up --wait")
    with connect() as conn:
        run(conn, countries, ids, args.min_km, args.regions, args.refresh,
            args.dry_run, args.verbose)


if __name__ == "__main__":
    main()
