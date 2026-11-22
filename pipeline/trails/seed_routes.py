"""Routed seeds: famous walks OSM has no route for, built with BRouter.

D24 famous coverage (2026-11-20). Most famous walks missing from Carta are
day walks OSM maps only as plain paths (Pen y Fan, Bastei, Durdle Door):
there is no route relation to import and derive_routes refuses unnamed or
branching ways. This builds such a walk from open facts and nothing typed
by hand. Two plans, the first that applies wins:

1. Start and end (D24). The walk's start (P1427) and end (P1444), both
   Wikidata items with a coordinate, with the walk's own coordinate as a
   via point when it lies away from both ends (the summit, the gorge).
2. Trailhead and landmark (D25 a, 2026-11-21). Only 5 of the 155 famous
   walks without an OSM route have a Wikidata start and end; most of the
   rest carry a `trailhead` from the D24 reference. The landmark is what
   the walk is named for:
   - the walk's own Wikidata coordinate (P625) when it lies 0.5 to 15 km
     from the trailhead (the summit or gorge item the reference names);
   - else a Wikidata item whose English label or alias is a leading part of
     the walk's name ("Pen y Fan from Pont ar Daf" -> "Pen y Fan"), else a
     contained part, longest first, within LANDMARK_MAX_M of the trailhead
     (wikidata.by_label).
   The walk is trailhead -> landmark -> trailhead. A walk whose name says
   circuit, loop or round comes back by a different way when one of
   BRouter's alternatives offers one that does not run back over the way
   up; otherwise every plan 2 walk is an out and back. Its length is judged
   against the reference with TRAILHEAD_LENGTH_TOL, wider than plan 1's,
   because the reference figure may be for a slightly different line.

BRouter's carta-hiking profile routes every leg (route_bridge.make_router).

A seed is kept only when every gate passes, else it is refused with the
gate's name in data/reports/famous/seed_routes.json:
- snap: each leg starts and ends within SNAP_M of its point. A trailhead
  from the D24 reference is stored to two decimals (about 0.5 km), so its
  own tolerance is the rounding radius of that point (snap_radius_m);
- forbidden_way: no metre on a motorway, trunk or ferry;
- off_path: at least PATH_SHARE_MIN on path-like ways and TRAIL_SHARE_MIN
  on real trail ways (path, footway, track, steps, bridleway);
- length: MIN_KM to MAX_KM, and within the plan's tolerance of the
  reference length (Wikidata's P2043 or the D24 reference);
- detour: no leg longer than DETOUR_FACTOR times its straight line;
- retrace: an A-to-B walk does not run back over itself (out and back is
  only allowed when start and end are the same place).
A plan 2 walk it cannot plan is skipped with its reason: no_trailhead,
not_a_day_walk (a multi-day trail or one over MAX_KM), no_landmark.

Kept seeds go to the trails lab as `source = 'seed_routed'`, `source_ref =
QID` (or the reference id for a D24 walk without one), `derived_route =
true`, one continuous part (gap_info 0/1), status needs_review; curate's
reference pass then picks them by QID, or by exact name for a D24 walk,
like any famous trail. Upserts on (source, source_ref), so a rerun replaces
the line; a seed that now fails a gate is set to rejected, never deleted.

    python pipeline/trails/seed_routes.py --dry-run          # report only
    python pipeline/trails/seed_routes.py --write            # into the lab
    python pipeline/trails/seed_routes.py --dry-run --ids Q123,Q456
"""

import argparse
import json
import math
import re
import sys
import unicodedata
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

# Plan 2 (D25 a). The owner's examples sit 3 to 8 km from their trailheads;
# 15 km covers the long ones (Scafell Pike from Wasdale Head) and keeps a
# same-named hill in the next valley out.
LANDMARK_MAX_M = 15_000.0
TRAILHEAD_LENGTH_TOL = 0.35
# A landmark is often an area (a lake, a gorge, a cliff): its Wikidata point
# is the middle of the water, which no path reaches within 50 m (box dry run
# 2026-11-21: Morskie Oko, Oeschinensee, Vintgar refused on snap).
LANDMARK_SNAP_M = 300.0
# The widest snap a rounded trailhead gets: a point stored to one decimal is
# 7 km wide, and BRouter's start that far off is another walk.
TRAILHEAD_SNAP_MAX_M = 1_000.0
# BRouter's alternative indexes tried for a circuit's way back.
LOOP_ALTS = (1, 2, 3)
LOOP_WORDS = frozenset({"circuit", "loop", "round", "rundweg", "giro"})
# Words a landmark name never starts or ends with: they join the landmark to
# the rest of the walk's name ("from", "via") or say what the walk is.
SPAN_EDGE_WORDS = frozenset({
    "a", "an", "and", "the", "of", "from", "to", "via", "by", "on", "at",
    "de", "di", "du", "des", "del", "della", "la", "le", "da", "do", "von",
    "circuit", "loop", "round", "walk", "trail", "path", "way", "hike",
    "ridge", "traverse", "boardwalk", "coastal", "summit", "pass", "trek",
})
# A one-word part that is only a landform noun names no place ("Diamond
# Hill" -> "Hill" would find a hamlet called Hill).
GENERIC_SPANS = frozenset({
    "hill", "hills", "gorge", "canyon", "lake", "lago", "lac", "see", "fell",
    "cliff", "cliffs", "waterfall", "waterfalls", "valley", "peak", "peaks",
    "mount", "mountain", "seat", "river", "head", "edge", "cove", "scar",
    "bay", "point", "rock", "rocks", "glen", "loch", "tor", "pike", "great",
    "three", "five", "seven", "hot", "sentier", "klamm", "schlucht",
})
SPAN_MIN_CHARS = 4
LABEL_BATCH = 60


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


def _decimals(x):
    s = repr(float(x))
    return len(s.split(".", 1)[1].rstrip("0")) if "." in s and "e" not in s \
        else 0


def snap_radius_m(point):
    """How far a stored (lon, lat) may lie from the real place: half its
    last decimal in both axes. 51.88, -3.43 is about 0.5 km wide; a point
    to five decimals is SNAP_M. The larger decimal count of the two axes is
    the precision, because JSON drops a trailing zero (46.60 reads 46.6)."""
    lon, lat = point
    d = max(_decimals(lon), _decimals(lat))
    half = 0.5 * 10 ** -d
    r = dist_m((lon, lat), (lon + half, lat + half))
    return min(max(SNAP_M, r), TRAILHEAD_SNAP_MAX_M)


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


# ---------------------------------------------------------------------------
# Plan 2: trailhead and landmark (D25 a)
# ---------------------------------------------------------------------------

def _fold(word):
    return "".join(c for c in unicodedata.normalize("NFKD", word.lower())
                   if not unicodedata.combining(c))


def landmark_spans(name):
    """The parts of a walk's name that could be its landmark, best first:
    leading parts before contained ones, longer before shorter. Commas and
    brackets split the name; a part starts with a capital (a proper name)
    and never starts or ends with a joining or walk word. "Pen y Fan from
    Pont ar Daf" -> ["Pen y Fan from Pont ar Daf", ..., "Pen y Fan", ...,
    "Pont ar Daf", ...]."""
    out, seen = [], set()
    for seg_i, seg in enumerate(re.split(r"[,()\[\];]", name or "")):
        words = [w.strip(".:!?\"'“”‘’") for w in seg.split()]
        words = [w for w in words if w]
        for i in range(len(words)):
            if _fold(words[i]) in SPAN_EDGE_WORDS or not words[i][0].isupper():
                continue
            for j in range(i + 1, len(words) + 1):
                if _fold(words[j - 1]) in SPAN_EDGE_WORDS:
                    continue
                text = " ".join(words[i:j])
                if len(text) < SPAN_MIN_CHARS or text in seen:
                    continue
                if j == i + 1 and _fold(text) in GENERIC_SPANS:
                    continue
                seen.add(text)
                leading = seg_i == 0 and i == 0
                out.append((0 if leading else 1, -len(text), text))
    return [t for _, _, t in sorted(out)]


def is_circuit(ref):
    """True when the walk's name (or an alias) says it goes round."""
    for n in [ref.get("name")] + list(ref.get("names") or []):
        if set(re.findall(r"[a-z]+", _fold(n or ""))) & LOOP_WORDS:
            return True
    return False


def trailhead_of(ref):
    th = ref.get("trailhead") or {}
    if th.get("lat") is None or th.get("lon") is None:
        return None
    return (float(th["lon"]), float(th["lat"]))


def is_day_walk(ref):
    km = ref.get("length_km")
    if km is not None and km > MAX_KM:
        return False
    return ref.get("trail_kind") != "multi-day"


def pick_landmarks(ref, own_point, label_hits):
    """Every landmark candidate in the order they are tried: the parts of
    the walk's name Wikidata knows ("Pen y Fan" in "Pen y Fan from Pont ar
    Daf"), then the walk's own point. The box dry run of 2026-11-21 took the
    walk's own point first, which for "Pen y Fan from Pont ar Daf" sits by the
    car park: a 1.4 km walk, refused on length."""
    th = trailhead_of(ref)
    if th is None:
        return []
    out, seen = [], set()
    for span in landmark_spans(ref.get("name")):
        for qid, _sl, (lat, lon), _cc in label_hits.get(span) or []:
            p = (lon, lat)
            if qid not in seen and VIA_MIN_M < dist_m(th, p) <= LANDMARK_MAX_M:
                seen.add(qid)
                out.append({"point": p, "qid": qid, "by": "label",
                            "label": span})
    if own_point and VIA_MIN_M < dist_m(th, own_point) <= LANDMARK_MAX_M \
            and ref.get("qid") not in seen:
        out.append({"point": own_point, "qid": ref.get("qid"), "by": "own",
                    "label": ref.get("name")})
    return out


def pick_landmark(ref, own_point, label_hits):
    """{point, qid, by, label} or None. own_point is the walk's own Wikidata
    coordinate (lon, lat); label_hits is wikidata.by_label's answer
    {label: [[qid, sitelinks, (lat, lon), [cc]], ...]}, best known first."""
    th = trailhead_of(ref)
    if th is None:
        return None
    if own_point and VIA_MIN_M < dist_m(th, own_point) <= LANDMARK_MAX_M:
        return {"point": own_point, "qid": ref.get("qid"), "by": "own",
                "label": ref.get("name")}
    for span in landmark_spans(ref.get("name")):
        for qid, _sl, (lat, lon), _cc in label_hits.get(span) or []:
            p = (lon, lat)
            if VIA_MIN_M < dist_m(th, p) <= LANDMARK_MAX_M:
                return {"point": p, "qid": qid, "by": "label", "label": span}
    return None


def trailhead_plan(ref, landmark):
    """([trailhead, landmark, trailhead], None) or (None, reason)."""
    th = trailhead_of(ref)
    if th is None:
        return None, "no_trailhead"
    if not is_day_walk(ref):
        return None, "not_a_day_walk"
    if not landmark:
        return None, "no_landmark"
    return [th, tuple(landmark["point"]), th], None


def _join(legs):
    coords = []
    for leg in legs:
        coords += leg["coords"] if not coords else leg["coords"][1:]
    return coords


def way_back(router, up, landmark, trailhead, circuit):
    """(leg, shape) for the way down. A circuit takes the first BRouter
    alternative that neither runs back over the way up nor detours;
    anything else, or a circuit with no such alternative, is an out and
    back on BRouter's best way."""
    if circuit:
        straight = max(dist_m(landmark, trailhead), 1.0)
        for alt in LOOP_ALTS:
            leg, _err = router(landmark, trailhead, alt=alt)
            if leg is None:
                continue
            if leg["track_m"] > DETOUR_FACTOR * straight:
                continue
            if retraced_share(_join([up, leg])) <= RETRACE_MAX:
                return leg, "loop"
    leg, err = router(landmark, trailhead)
    return (leg, "out_and_back") if leg is not None else (None, err)


# ---------------------------------------------------------------------------
# Judging
# ---------------------------------------------------------------------------

def judge(ref, pts, legs, snap_m=None, length_tol=LENGTH_TOL):
    """None when the joined legs are the walk, else the gate's name. snap_m
    gives each point its own tolerance (default SNAP_M for all)."""
    from route_bridge import FORBIDDEN_WAYS, PATH_WAYS
    snap_m = snap_m or [SNAP_M] * len(pts)
    coords, path = [], 0.0
    trail = forbidden = total = 0.0
    for i, ((a, b), leg) in enumerate(zip(zip(pts, pts[1:]), legs)):
        c = leg["coords"]
        if dist_m(a, c[0]) > snap_m[i] or dist_m(c[-1], b) > snap_m[i + 1]:
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
    if want and abs(km - want) > length_tol * want:
        return "length"
    loop = dist_m(pts[0], pts[-1]) <= SAME_PLACE_M
    if not loop and retraced_share(coords) > RETRACE_MAX:
        return "retrace"
    return None


def _finish(out, pts, legs, gate, **extra):
    coords = _join(legs)
    km = sum(dist_m(a, b) for a, b in zip(coords, coords[1:])) / 1000.0
    res = dict(out, points=[list(p) for p in pts], km=round(km, 2),
               ascend_m=round(sum(leg.get("ascend_m") or 0 for leg in legs)),
               **extra)
    if gate:
        return dict(res, verdict="refused", gate=gate)
    return dict(res, verdict="kept", coords=coords)


def route_trailhead(out, ref, landmark, router):
    """Plan 2 for one reference."""
    pts, why = trailhead_plan(ref, landmark)
    if why:
        return dict(out, verdict="skipped", gate=why, plan="trailhead")
    th, mark, _ = pts
    extra = {"plan": "trailhead", "landmark": {
        "qid": landmark.get("qid"), "by": landmark["by"],
        "label": landmark.get("label"), "point": list(mark)}}
    try:
        up, err = router(th, mark)
        if up is None:
            return dict(out, verdict="refused", gate="unroutable", error=err,
                        **extra)
        down, how = way_back(router, up, mark, th, is_circuit(ref))
    except SystemExit as e:   # make_router exits when BRouter is down
        return dict(out, verdict="skipped", gate="brouter_down",
                    error=str(e), **extra)
    if down is None:
        return dict(out, verdict="refused", gate="unroutable", error=how,
                    **extra)
    extra["shape"] = how
    tol = snap_radius_m(th)
    gate = judge(ref, pts, [up, down], snap_m=[tol, LANDMARK_SNAP_M, tol],
                 length_tol=TRAILHEAD_LENGTH_TOL)
    return _finish(out, pts, [up, down], gate, **extra)


def route_trailhead_any(out, ref, candidates, router):
    """Plan 2 over the landmark candidates in turn: the first kept walk, or
    the first refusal when none is kept (its gate names the reason)."""
    if not candidates:
        return route_trailhead(out, ref, None, router)
    first = None
    for mark in candidates:
        res = route_trailhead(out, ref, mark, router)
        if res["verdict"] == "kept" or res.get("gate") == "brouter_down":
            return res
        first = first or res
    return first


def route_ref(ref, places, router, landmark=None):
    """{qid, name, verdict, ...} for one reference; 'kept' carries a line.
    Plan 1 (start and end) when Wikidata gives both, else plan 2
    (trailhead and landmark) when the reference has a trailhead."""
    out = {"id": ref.get("id"), "qid": ref.get("qid"), "name": ref.get("name"),
           "countries": ref.get("countries"),
           "length_km": ref.get("length_km")}
    pts, why = plan_points(ref, places)
    if why:
        if trailhead_of(ref) is not None:
            if isinstance(landmark, list):
                return route_trailhead_any(out, ref, landmark, router)
            return route_trailhead(out, ref, landmark, router)
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
    return _finish(out, pts, legs, gate, plan="start_end")


def targets(ids=None):
    """Tier A trails the coverage report lists as missing for want of an
    OSM route (no_osm_relation), or the given QIDs or reference ids. A row
    needs a QID or a trailhead to be planned at all."""
    refs = json.loads(FAMOUS.read_text(encoding="utf-8"))["rows"]
    if ids:
        return [r for r in refs if r.get("qid") in ids or r.get("id") in ids]
    cov = json.loads(COVERAGE.read_text(encoding="utf-8"))
    rows = cov["kinds"]["trails"]["rows"]
    want = {r["id"] for r in rows if r["tier"] == "A"
            and r["status"] == "missing" and r.get("reason") ==
            "no_osm_relation"}
    return [r for r in refs if r["id"] in want
            and (r.get("qid") or trailhead_of(r) is not None)]


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


def lookup_labels(spans):
    """wikidata.by_label over every span, in batches (one VALUES list per
    query keeps the query small enough for QLever and WDQS)."""
    import wikidata as wd
    spans = sorted(set(spans))
    got = {}
    for i in range(0, len(spans), LABEL_BATCH):
        got.update(wd.by_label(spans[i:i + LABEL_BATCH]))
    return got


def landmarks(refs, places):
    """{reference id: landmark} for the rows plan 2 will route."""
    todo = [r for r in refs if trailhead_of(r) is not None
            and plan_points(r, places)[1] and is_day_walk(r)]
    hits = lookup_labels(s for r in todo for s in landmark_spans(r["name"]))
    return {r["id"]: pick_landmarks(r, places.get(r.get("qid")), hits)
            for r in todo}


UPSERT_SQL = """
    INSERT INTO trips (country, category, title, geom, distance_m, network,
                       source, source_ref, license, attribution_text,
                       raw_tags, gap_info, derived_route, status)
    VALUES (%(country)s, 'hike', %(title)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)), %(length_m)s,
            NULL, 'seed_routed', %(source_ref)s, 'ODbL 1.0',
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
    WHERE source = 'seed_routed' AND source_ref = %(source_ref)s
"""


def source_ref_of(r):
    """The QID, or the reference id ("ref:hoellentalklamm") for a D24 walk
    without one: curate then picks it by its exact name."""
    return r.get("qid") or r.get("id")


def raw_tags_of(r):
    tags = {"name": r["name"], "route": "hiking",
            "carta:seed_points": r["points"],
            "carta:seed_plan": r.get("plan")}
    if r.get("qid"):
        tags["wikidata"] = r["qid"]
    if r.get("shape"):
        tags["carta:seed_shape"] = r["shape"]
    if r.get("landmark"):
        tags["carta:seed_landmark"] = r["landmark"]
    return tags


def write(conn, results):
    from psycopg.types.json import Jsonb
    n = 0
    with conn.cursor() as cur:
        for r in results:
            ref = source_ref_of(r)
            if r["verdict"] == "kept":
                # trips.geom is MultiLineStringZ: one part, Z added by SQL.
                wkt = "MULTILINESTRING((" + ", ".join(
                    f"{c[0]:.7f} {c[1]:.7f}" for c in r["coords"]) + "))"
                cur.execute(UPSERT_SQL, {
                    "country": (r["countries"] or ["XX"])[0],
                    "title": r["name"], "wkt": wkt,
                    "length_m": int(r["km"] * 1000), "source_ref": ref,
                    "raw_tags": Jsonb(raw_tags_of(r))})
                n += 1
            elif r["verdict"] == "refused" and ref:
                cur.execute(REJECT_SQL, {"source_ref": ref})
    conn.commit()
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--write", action="store_true")
    ap.add_argument("--ids", default="",
                    help="comma list of QIDs or reference ids")
    ap.add_argument("--report", default=str(REPORT))
    a = ap.parse_args(argv)
    ids = {q.strip() for q in a.ids.split(",") if q.strip()}
    refs = targets(ids)
    wanted = {q for r in refs for q in (r.get("start"), r.get("end")) if q}
    wanted |= {r["qid"] for r in refs
               if r.get("qid") and trailhead_of(r) is not None}
    places = locate(wanted)
    marks = landmarks(refs, places)
    from route_bridge import make_router
    router = make_router()
    results = [route_ref(r, places, router, marks.get(r["id"]))
               for r in refs]
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
