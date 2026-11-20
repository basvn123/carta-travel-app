"""Routed seeds: famous walks OSM has no route for, built with BRouter.

D24 famous coverage (2026-11-20). Most famous walks missing from Carta are
day walks OSM maps only as plain paths (Pen y Fan, Bastei, Durdle Door):
there is no route relation to import and derive_routes refuses unnamed or
branching ways. This builds such a walk from Wikidata's own facts and
nothing typed by hand:

- the walk's start (P1427) and end (P1444), both Wikidata items with a
  coordinate; a walk without both is not built (its line would be a guess);
- the walk's own coordinate as a via point when it lies away from both ends
  (the summit, the gorge), so the line passes what the walk is named for;
- BRouter's carta-hiking profile between them (route_bridge.make_router).

A seed is kept only when every gate passes, else it is refused with the
gate's name in data/reports/famous/seed_routes.json:
- snap: each leg starts and ends within SNAP_M of its point;
- forbidden_way: no metre on a motorway, trunk or ferry;
- off_path: at least PATH_SHARE_MIN on path-like ways and TRAIL_SHARE_MIN
  on real trail ways (path, footway, track, steps, bridleway);
- length: MIN_KM to MAX_KM, and within LENGTH_TOL of Wikidata's P2043;
- detour: no leg longer than DETOUR_FACTOR times its straight line;
- retrace: an A-to-B walk does not run back over itself (out and back is
  only allowed when start and end are the same place).

Kept seeds go to the trails lab as `source = 'seed_routed'`, `source_ref =
QID`, `derived_route = true`, one continuous part (gap_info 0/1), status
needs_review; curate's reference pass then picks them by QID like any
famous trail. Upserts on (source, source_ref), so a rerun replaces the
line; a seed that now fails a gate is set to rejected, never deleted.

    python pipeline/trails/seed_routes.py --dry-run          # report only
    python pipeline/trails/seed_routes.py --write            # into the lab
    python pipeline/trails/seed_routes.py --dry-run --ids Q123,Q456
"""

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "famous"))

FAMOUS = ROOT / "data" / "famous" / "trails.json"
COVERAGE = ROOT / "data" / "reports" / "famous" / "coverage.json"
REPORT = ROOT / "data" / "reports" / "famous" / "seed_routes.json"
SOURCE = "seed_routed"

SNAP_M = 50.0
PATH_SHARE_MIN = 0.80
TRAIL_SHARE_MIN = 0.50
TRAIL_WAYS = frozenset({"path", "footway", "track", "steps", "bridleway"})
MIN_KM = 2.0
MAX_KM = 45.0
LENGTH_TOL = 0.25
DETOUR_FACTOR = 3.0
VIA_MIN_M = 500.0
SAME_PLACE_M = 300.0
RETRACE_MAX = 0.30


def dist_m(a, b):
    """Metres between two (lon, lat) points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2)
         * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def retraced_share(coords, cell_m=25.0):
    """Share of the line's length that runs over cells it already used, a
    cheap stand-in for overlap: an A-to-B walk should not double back."""
    seen, back, total = set(), 0.0, 0.0
    k = cell_m / 111_000.0
    for a, b in zip(coords, coords[1:]):
        m = dist_m(a, b)
        total += m
        cell = (round(b[0] / k), round(b[1] / k))
        if cell in seen:
            back += m
        seen.add((round(a[0] / k), round(a[1] / k)))
    return back / total if total else 0.0


def plan_points(ref, places):
    """[(lon, lat)] for one reference, or (None, reason)."""
    s, e = ref.get("start"), ref.get("end")
    if not s or not e:
        return None, "no_start_end"
    a, b = places.get(s), places.get(e)
    if not a or not b:
        return None, "start_end_unlocated"
    pts = [a]
    if ref.get("lat") is not None and ref.get("lon") is not None:
        v = (ref["lon"], ref["lat"])
        if dist_m(v, a) > VIA_MIN_M and dist_m(v, b) > VIA_MIN_M:
            pts.append(v)
    pts.append(b)
    return pts, None


def judge(ref, pts, legs):
    """None when the joined legs are the walk, else the gate's name."""
    from route_bridge import FORBIDDEN_WAYS, PATH_WAYS
    coords, path = [], 0.0
    trail = forbidden = total = 0.0
    for (a, b), leg in zip(zip(pts, pts[1:]), legs):
        c = leg["coords"]
        if dist_m(a, c[0]) > SNAP_M or dist_m(c[-1], b) > SNAP_M:
            return "snap"
        if leg["track_m"] > DETOUR_FACTOR * max(dist_m(a, b), 1.0) and \
                dist_m(a, b) > SAME_PLACE_M:
            return "detour"
        if not leg["segments"]:
            return "no_way_tags"
        for m, tags in leg["segments"]:
            total += m
            hw = tags.get("highway")
            if tags.get("route") == "ferry" or hw in FORBIDDEN_WAYS:
                forbidden += m
            elif hw in PATH_WAYS:
                path += m
                if hw in TRAIL_WAYS:
                    trail += m
        coords += c if not coords else c[1:]
    if forbidden > 0:
        return "forbidden_way"
    if not total or path / total < PATH_SHARE_MIN or \
            trail / total < TRAIL_SHARE_MIN:
        return "off_path"
    km = sum(dist_m(a, b) for a, b in zip(coords, coords[1:])) / 1000.0
    if km < MIN_KM or km > MAX_KM:
        return "length"
    want = ref.get("length_km")
    if want and abs(km - want) > LENGTH_TOL * want:
        return "length"
    loop = dist_m(pts[0], pts[-1]) <= SAME_PLACE_M
    if not loop and retraced_share(coords) > RETRACE_MAX:
        return "retrace"
    return None


def route_ref(ref, places, router):
    """{qid, name, verdict, ...} for one reference; 'kept' carries a line."""
    out = {"qid": ref.get("qid"), "name": ref.get("name"),
           "countries": ref.get("countries"),
           "length_km": ref.get("length_km")}
    pts, why = plan_points(ref, places)
    if why:
        return dict(out, verdict="skipped", gate=why)
    legs = []
    for a, b in zip(pts, pts[1:]):
        try:
            leg, err = router(a, b)
        except SystemExit as e:   # make_router exits when BRouter is down
            return dict(out, verdict="skipped", gate="brouter_down",
                        error=str(e))
        if leg is None:
            return dict(out, verdict="refused", gate="unroutable",
                        error=err)
        legs.append(leg)
    gate = judge(ref, pts, legs)
    coords = []
    for leg in legs:
        coords += leg["coords"] if not coords else leg["coords"][1:]
    km = sum(dist_m(a, b) for a, b in zip(coords, coords[1:])) / 1000.0
    res = dict(out, points=[list(p) for p in pts], km=round(km, 2),
               ascend_m=round(sum(leg.get("ascend_m") or 0 for leg in legs)))
    if gate:
        return dict(res, verdict="refused", gate=gate)
    return dict(res, verdict="kept", coords=coords)


def targets(ids=None):
    """Tier A trails the coverage report lists as missing for want of an
    OSM route (no_osm_relation), or the given QIDs."""
    refs = json.loads(FAMOUS.read_text(encoding="utf-8"))["rows"]
    if ids:
        return [r for r in refs if r.get("qid") in ids]
    cov = json.loads(COVERAGE.read_text(encoding="utf-8"))
    rows = cov["kinds"]["trails"]["rows"]
    want = {r["id"] for r in rows if r["tier"] == "A"
            and r["status"] == "missing" and r.get("reason") ==
            "no_osm_relation"}
    return [r for r in refs if r["id"] in want and r.get("qid")]


def locate(qids):
    """{qid: (lon, lat)} from Wikidata P625."""
    import wikidata as wd
    got = wd.values_of(sorted(qids), "P625")
    out = {}
    for q, vals in got.items():
        lat, lon = wd.parse_point(vals[0])
        if lat is not None:
            out[q] = (lon, lat)
    return out


UPSERT_SQL = """
    INSERT INTO trips (country, category, title, geom, distance_m, network,
                       source, source_ref, license, attribution_text,
                       raw_tags, gap_info, derived_route, status)
    VALUES (%(country)s, 'hike', %(title)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)), %(length_m)s,
            NULL, 'seed_routed', %(qid)s, 'ODbL 1.0',
            'Paths (c) OpenStreetMap contributors, ODbL; routed with BRouter',
            %(raw_tags)s, '{"gap_count": 0, "merged_segments": 1}'::jsonb,
            true, 'needs_review'::trip_status)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title, geom = EXCLUDED.geom,
        distance_m = EXCLUDED.distance_m, raw_tags = EXCLUDED.raw_tags,
        gap_info = EXCLUDED.gap_info, derived_route = true,
        status = CASE WHEN trips.status = 'rejected'
                      THEN 'needs_review'::trip_status ELSE trips.status END
"""
REJECT_SQL = """
    UPDATE trips SET status = 'rejected'
    WHERE source = 'seed_routed' AND source_ref = %(qid)s
"""


def write(conn, results):
    from psycopg.types.json import Jsonb
    n = 0
    with conn.cursor() as cur:
        for r in results:
            if r["verdict"] == "kept":
                # trips.geom is MultiLineStringZ: one part, Z added by SQL.
                wkt = "MULTILINESTRING((" + ", ".join(
                    f"{c[0]:.7f} {c[1]:.7f}" for c in r["coords"]) + "))"
                cur.execute(UPSERT_SQL, {
                    "country": (r["countries"] or ["XX"])[0],
                    "title": r["name"], "wkt": wkt,
                    "length_m": int(r["km"] * 1000), "qid": r["qid"],
                    "raw_tags": Jsonb({"name": r["name"],
                                       "wikidata": r["qid"],
                                       "route": "hiking",
                                       "carta:seed_points": r["points"]})})
                n += 1
            elif r["verdict"] == "refused" and r.get("qid"):
                cur.execute(REJECT_SQL, {"qid": r["qid"]})
    conn.commit()
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--write", action="store_true")
    ap.add_argument("--ids", default="", help="comma list of QIDs")
    ap.add_argument("--report", default=str(REPORT))
    a = ap.parse_args(argv)
    ids = {q.strip() for q in a.ids.split(",") if q.strip()}
    refs = targets(ids)
    places = locate({q for r in refs for q in (r.get("start"), r.get("end"))
                     if q})
    from route_bridge import make_router
    router = make_router()
    results = [route_ref(r, places, router) for r in refs]
    counts = {}
    for r in results:
        key = r["verdict"] if r["verdict"] == "kept" else \
            f"{r['verdict']}:{r['gate']}"
        counts[key] = counts.get(key, 0) + 1
    print(f"seed routes: {len(refs)} famous walks without an OSM route; "
          + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    rep = {"generated_at": datetime.now(timezone.utc).strftime(
               "%Y-%m-%dT%H:%M:%SZ"),
           "mode": "write" if a.write else "dry-run", "counts": counts,
           "rows": [{k: v for k, v in r.items() if k != "coords"}
                    for r in results]}
    Path(a.report).parent.mkdir(parents=True, exist_ok=True)
    Path(a.report).write_text(json.dumps(rep, ensure_ascii=False, indent=1)
                              + "\n", encoding="utf-8")
    if a.write:
        from db import connect
        with connect() as conn:
            n = write(conn, results)
        print(f"  wrote {n} seed route(s) to the trails lab")
    return 0


if __name__ == "__main__":
    sys.exit(main())
