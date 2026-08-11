"""Validation engine: score staged trailslab trips and route them by status.

Runs five checks per staged trip, writes one validation_runs row per check
(append-only, same convention as crosscheck_portals.py: consumers take the
newest row per subject and check), and computes quality_score 0-100 as the
weighted mean of the per-check scores. Weights and thresholds live in the
CONFIG dict. A check whose subchecks all lack data scores NULL and its
weight redistributes to the remaining checks instead of punishing trips the
elevation step has not reached yet.

Checks:
  continuity        gaps between assembled parts above the tolerance, run on
                    the repaired geometry when a fresh accepted repair exists
                    (absorbs repair.py's check: same check_name, same rows);
                    the osmc:status tag corroborates gaps as a signal, never
                    as a gate
  geometry_sanity   nonzero length, no vertex jumps above 2 km inside a
                    part, bbox inside the claimed country (generous boxes
                    plus margin, so border-hugging routes keep their slack)
  elevation_sanity  recomputed distance within 25 percent of the OSM
                    distance tag, average grade below 45 percent, ascent per
                    km plausible for a walkable route
  difficulty        easy/moderate/hard derived from distance + ascent with a
                    sac_scale floor, stored into trips.difficulty when the
                    column is still NULL; contradictions between sac_scale
                    and the measured terrain are flagged
  completeness      name, network, description present in the source tags

quality_score also folds in the portal-agreement boost: when the newest
portal_agreement row for a trip passed, crosscheck_portals.py's +10 applies
here too (capped at 100), so re-validation never wipes a granted boost and
crosscheck reruns never double-count (they skip trips with a prior passed
row).

Status routing, drafts only, and nothing is ever auto-approved: a draft at
or above needs_review_min moves to needs_review, a draft below reject_floor
moves to rejected, anything between stays draft. Trips a human already
touched (needs_review, approved, published, rejected) keep their status.

City trips have their own check set (see the CITYTRIP_CONFIG section):
content per stop, walking budget, day length and a popularity floor on the
city. compose_citytrips.py runs them right after composing; --citytrips
reruns them standalone.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/validate.py                     # all pilot countries
    python pipeline/trails/validate.py --countries CH --limit 200 --dry-run
    python pipeline/trails/validate.py --ids 7077 --verbose
    python pipeline/trails/validate.py --citytrips
"""

import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median

import numpy as np
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from repair import (  # noqa: E402
    EARTH_RADIUS_M, REPAIR_FRESH_SQL, REPAIRS_DDL, check_continuity)

CONFIG = {
    # Per-check weights for the quality_score weighted mean. Checks that
    # score NULL (no applicable data) drop out and the rest renormalise.
    "weights": {
        "continuity": 30,
        "geometry_sanity": 20,
        "elevation_sanity": 20,
        "difficulty": 10,
        "completeness": 20,
    },
    "tolerance_m": 50.0,          # continuity: gap tolerance between parts
    "jump_max_m": 2000.0,         # geometry: max vertex-to-vertex step
    "bbox_margin_deg": 0.5,       # geometry: slack around the country boxes
    "distance_tag_pct": 25.0,     # elevation: computed vs tag tolerance
    "avg_grade_max_pct": 45.0,    # elevation: (ascent+descent)/distance cap
    "ascent_per_km_max": 300.0,   # elevation: sustained climb cap
    "effort_easy_max_km": 11.0,   # difficulty: easy ceiling
    "effort_easy_max_asc": 450.0,
    "effort_hard_min_km": 19.0,   # difficulty: hard floor
    "effort_hard_min_asc": 1100.0,
    "portal_boost": 10.0,         # mirrors crosscheck_portals.py BOOST
    "needs_review_min": 60.0,     # draft -> needs_review at or above
    "reject_floor": 25.0,         # draft -> rejected below
}

# Generous per-country boxes (lon_min, lat_min, lon_max, lat_max); a trip
# passes when its bbox fits one box expanded by bbox_margin_deg. FR lists
# the overseas departments because the Geofabrik france extract ships them.
COUNTRY_BBOXES = {
    "CH": [(5.9, 45.8, 10.5, 47.9)],
    "AT": [(9.4, 46.3, 17.2, 49.1)],
    "NO": [(4.0, 57.7, 31.5, 71.4),        # mainland
           (10.0, 74.0, 34.0, 81.0)],      # Svalbard
    "FR": [(-5.5, 41.2, 9.7, 51.3),        # metropolitan + Corsica
           (-63.2, 14.3, -60.7, 18.3),     # Antilles
           (-55.5, 2.0, -51.5, 6.0),       # Guyane
           (55.0, -21.6, 56.0, -20.6),     # Reunion
           (44.9, -13.1, 45.4, -12.5)],    # Mayotte
}

# osmc:status values that say the route itself is not complete upstream.
OSMC_INCOMPLETE = {"incomplete", "proposed", "planned", "construction",
                   "disused", "abandoned"}

SAC_RANK = {
    "hiking": 1, "mountain_hiking": 2, "demanding_mountain_hiking": 3,
    "alpine_hiking": 4, "demanding_alpine_hiking": 5,
    "difficult_alpine_hiking": 6,
}
DIFF_ORDER = ["easy", "moderate", "hard"]

PILOT_COUNTRIES = "CH,FR,NO,AT"


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def tag_number(text):
    """First number in an OSM tag value (mirrors elevation.py's parser,
    kept local so validation never needs the rasterio import chain)."""
    if not text:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", str(text))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def parse_parts(geojson_text):
    """GeoJSON MultiLineString -> list of (n, 2) lon/lat arrays."""
    parts = []
    for part in json.loads(geojson_text).get("coordinates", []):
        arr = np.asarray(part, dtype=float)
        if arr.ndim == 2 and len(arr) >= 2:
            parts.append(arr[:, :2])
    return parts


def part_steps_m(arr):
    """Haversine metres between consecutive vertices of one part."""
    lam, phi = np.radians(arr[:, 0]), np.radians(arr[:, 1])
    h = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.diff(lam) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0)))


def sac_rank(text):
    """OSM sac_scale value -> 1..6, tolerant of T-grades and value lists."""
    if not text:
        return None
    token = str(text).strip().lower().replace(";", ",").split(",")[0].strip()
    if token in SAC_RANK:
        return SAC_RANK[token]
    m = re.fullmatch(r"t\s*([1-6])", token)
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# The five checks: each returns (passed, score 0-100 or None, details)
# ---------------------------------------------------------------------------

def continuity_check(parts, trip, cfg):
    osmc = (trip["raw_tags"] or {}).get("osmc:status")
    passed, details = check_continuity(parts, cfg["tolerance_m"], osmc)
    gaps_over = details["gaps_over_tolerance"]
    details["components"] = (gaps_over + 1) if parts else 0
    details["geometry"] = trip["geometry_label"]
    if (trip["gap_info"] or {}).get("clipped"):
        details["clipped_at_extract"] = True
    score = 100.0 if passed else max(0.0, 100.0 - 30.0 * gaps_over)
    if gaps_over and osmc and osmc.strip().lower() in OSMC_INCOMPLETE:
        score = max(0.0, score - 15.0)
        details["osmc_signal"] = "route flagged incomplete upstream"
    return passed, score, details


def geometry_check(parts, trip, cfg):
    if not parts:
        return False, 0.0, {"failures": ["no_geometry"]}
    steps = [part_steps_m(a) for a in parts]
    length_m = float(sum(float(s.sum()) for s in steps))
    max_step = float(max(float(s.max()) for s in steps))
    jumps = int(sum(int((s > cfg["jump_max_m"]).sum()) for s in steps))
    lons = [(float(a[:, 0].min()), float(a[:, 0].max())) for a in parts]
    lats = [(float(a[:, 1].min()), float(a[:, 1].max())) for a in parts]
    bbox = (min(x for x, _ in lons), min(y for y, _ in lats),
            max(x for _, x in lons), max(y for _, y in lats))

    boxes = COUNTRY_BBOXES.get(trip["country"])
    m = cfg["bbox_margin_deg"]
    in_country = None if boxes is None else any(
        bbox[0] >= w - m and bbox[1] >= s - m
        and bbox[2] <= e + m and bbox[3] <= n + m
        for w, s, e, n in boxes)

    failures = []
    if length_m < 1.0:
        failures.append("zero_length")
    if jumps:
        failures.append("jump_over_2km")
    if in_country is False:
        failures.append("bbox_outside_country")

    score = 0.0 if length_m < 1.0 else max(
        0.0, 100.0 - 50.0 * bool(jumps) - 30.0 * (in_country is False))
    details = {"length_m": int(round(length_m)),
               "max_step_m": int(round(max_step)),
               "jumps_over_max": jumps,
               "bbox": [round(v, 3) for v in bbox],
               "bbox_in_country": in_country,
               "failures": failures}
    return not failures, score, details


def elevation_check(trip, cfg):
    dist, asc, desc = trip["distance_m"], trip["ascent_m"], trip["descent_m"]
    ele = trip["elevation"] or {}
    ele_ok = ele.get("status") == "ok"
    subs, details = {}, {"elevation_status": ele.get("status")}

    tag_km = tag_number((trip["raw_tags"] or {}).get("distance"))
    if tag_km and tag_km > 2000:
        tag_km /= 1000.0    # a tag over 2000 "km" is metres wearing the wrong unit
    if tag_km and tag_km >= 0.1 and dist:
        ratio = dist / 1000.0 / tag_km
        subs["distance_vs_tag"] = abs(ratio - 1.0) * 100 <= cfg["distance_tag_pct"]
        details.update(dist_tag_km=round(tag_km, 1),
                       computed_km=round(dist / 1000.0, 1),
                       ratio=round(ratio, 2))
    if ele_ok and dist and dist >= 500 and asc is not None and desc is not None:
        avg_grade = (asc + desc) / dist * 100.0
        subs["avg_grade"] = avg_grade < cfg["avg_grade_max_pct"]
        details["avg_grade_pct"] = round(avg_grade, 1)
    if ele_ok and dist and dist >= 1000 and asc is not None:
        per_km = asc / (dist / 1000.0)
        subs["ascent_plausible"] = per_km <= cfg["ascent_per_km_max"]
        details["ascent_per_km"] = int(round(per_km))

    if not subs:
        details["status"] = "skipped"    # score NULL: weight redistributes
        return True, None, details
    fails = [k for k, ok in subs.items() if not ok]
    details["subchecks"] = {k: "pass" if ok else "fail" for k, ok in subs.items()}
    return not fails, 100.0 * (len(subs) - len(fails)) / len(subs), details


def effort_class(dist_km, asc, cfg):
    if dist_km > cfg["effort_hard_min_km"] or asc > cfg["effort_hard_min_asc"]:
        return "hard"
    if dist_km <= cfg["effort_easy_max_km"] and asc <= cfg["effort_easy_max_asc"]:
        return "easy"
    return "moderate"


def difficulty_check(trip, cfg):
    rank = sac_rank(trip["sac_scale"])
    dist_km = (trip["distance_m"] or 0) / 1000.0
    asc = trip["ascent_m"]
    ele_ok = (trip["elevation"] or {}).get("status") == "ok"
    max_grade = (trip["elevation"] or {}).get("max_grade_pct")
    per_km = asc / dist_km if ele_ok and asc is not None and dist_km >= 1 else None

    derived = None
    if trip["distance_m"]:
        derived = effort_class(dist_km, asc or 0.0, cfg)
        floor = "hard" if (rank or 0) >= 4 else \
                "moderate" if rank == 3 else None
        if floor and DIFF_ORDER.index(floor) > DIFF_ORDER.index(derived):
            derived = floor

    contradictions = []
    if rank == 1 and ((per_km or 0) > 180
                      or (max_grade is not None and max_grade > 45)):
        contradictions.append("steep_terrain_on_t1")
    if (rank or 0) >= 4 and per_km is not None and dist_km >= 2 \
            and per_km < 30 and (max_grade or 0) < 12:
        contradictions.append("alpine_scale_on_flat")
    tagged = trip["difficulty"]
    if tagged in DIFF_ORDER and derived and \
            abs(DIFF_ORDER.index(tagged) - DIFF_ORDER.index(derived)) >= 2:
        contradictions.append("tagged_difficulty_mismatch")

    details = {"sac_scale": trip["sac_scale"], "sac_rank": rank,
               "derived": derived, "ascent_known": asc is not None,
               "contradictions": contradictions}
    if per_km is not None:
        details["ascent_per_km"] = int(round(per_km))
    if max_grade is not None:
        details["max_grade_pct"] = max_grade
    score = max(0.0, 100.0 - 65.0 * len(contradictions))
    return not contradictions, score, details


def completeness_check(trip, cfg):
    tags = trip["raw_tags"] or {}
    have = {"name": bool(tags.get("name")),
            "network": bool(trip["network"]),
            "description": bool(tags.get("description"))}
    score = 50.0 * have["name"] + 30.0 * have["network"] \
        + 20.0 * have["description"]
    return have["name"] and have["network"], score, {"present": have}


def validate_trip(trip, cfg):
    parts = parse_parts(trip["geojson"])
    checks = {
        "continuity": continuity_check(parts, trip, cfg),
        "geometry_sanity": geometry_check(parts, trip, cfg),
        "elevation_sanity": elevation_check(trip, cfg),
        "difficulty": difficulty_check(trip, cfg),
        "completeness": completeness_check(trip, cfg),
    }
    num = den = 0.0
    for name, (_, score, _) in checks.items():
        if score is not None:
            num += cfg["weights"][name] * score
            den += cfg["weights"][name]
    quality = round(num / den, 1) if den else 0.0
    return checks, quality


# ---------------------------------------------------------------------------
# City trips: their own checks, the same validation_runs conventions.
#
# A composed citytrip is not a hike: continuity or elevation say nothing
# about it. What can go wrong is content (a stop without an image licence,
# a description missing, a coordinate outside the city) and shape (a day
# that overwalks its budget, runs too short or too long, or was composed
# for a city nobody has heard of). The composer records everything these
# checks need in raw_tags, so a re-validation never has to reopen the
# 100 MB catalogue.
#
# Status routing mirrors the hikes: drafts whose every check passes move to
# needs_review, failing drafts stay draft with the failures on record, and
# nothing is ever auto-approved. compose_citytrips.py calls
# validate_citytrips() right after storing; `--citytrips` reruns it
# standalone.
# ---------------------------------------------------------------------------

CITYTRIP_CONFIG = {
    "weights": {
        "citytrip_stops": 35,
        "citytrip_walking": 25,
        "citytrip_day_length": 20,
        "citytrip_popularity": 20,
    },
    "min_stops": 4,
    "city_radius_km": 10.0,       # a stop further out is not a city sight
    # plan-day's DEFAULT_MAX_WALK_KM; the budget is checked against the
    # same straight-line path sum plan-day charges against it, with the
    # routed street distance reported alongside.
    "walk_budget_km": 12.0,
    "day_min_min": 5 * 60,        # a city day under 5 hours is a stroll
    "day_max_min": 9 * 60,        # and over 9 an endurance event
    # Popularity floor on the city itself: either the curated rating or the
    # sitelink fame clears it (Linz: score 5.6 but fame 482 passes).
    "pop_floor_score": 6.0,
    "pop_floor_fame": 400,
}

# Licence families an image may carry, matching the images table's NC/ND
# insert constraint plus an allow-list, because "not forbidden" is not the
# same as "known to be open".
IMG_LICENSE_DENY = re.compile(
    r"(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv", re.I)
IMG_LICENSE_ALLOW = re.compile(
    r"^(cc0\b|cc[ -]by\b|cc[ -]by[ -]sa\b|cc[ -]sa\b|public domain|pd\b|"
    r"pdm\b|no restrictions|attribution\b|fal\b|licence art libre|gfdl\b)",
    re.I)


def img_license_ok(license_text):
    text = (license_text or "").strip()
    if not text or IMG_LICENSE_DENY.search(text):
        return False
    return bool(IMG_LICENSE_ALLOW.match(text))


def _haversine_km(lat1, lon1, lat2, lon2):
    from math import asin, cos, radians, sin, sqrt
    p1, p2 = radians(lat1), radians(lat2)
    h = (sin((p2 - p1) / 2) ** 2
         + cos(p1) * cos(p2) * sin(radians(lon2 - lon1) / 2) ** 2)
    return 2 * (EARTH_RADIUS_M / 1000.0) * asin(min(1.0, sqrt(h)))


def citytrip_stops_check(trip, cfg):
    tags = trip["raw_tags"] or {}
    stops = tags.get("stops") or []
    centre = tags.get("anchor_centre") or {}
    problems = []
    for s in stops:
        name = s.get("name") or "?"
        if not s.get("name"):
            problems.append("unnamed stop")
        if not (s.get("img") and img_license_ok(s.get("img_license"))):
            problems.append(f"{name}: no approved-licence image")
        if not s.get("has_desc"):
            problems.append(f"{name}: no description")
        lat, lon = s.get("lat"), s.get("lon")
        if lat is None or lon is None:
            problems.append(f"{name}: no coordinates")
        elif centre.get("lat") is not None:
            km = _haversine_km(centre["lat"], centre["lon"], lat, lon)
            if km > cfg["city_radius_km"]:
                problems.append(f"{name}: {km:.1f} km from the city centre")
    if len(stops) < cfg["min_stops"]:
        problems.append(f"only {len(stops)} stops, need {cfg['min_stops']}")
    details = {"stops": len(stops), "problems": problems[:12]}
    score = 100.0 if not problems else max(
        0.0, 100.0 - 25.0 * len(problems))
    return not problems, score, details


def citytrip_walking_check(trip, cfg):
    tags = trip["raw_tags"] or {}
    straight_km = tags.get("walk_straight_km")
    routed_km = (trip["distance_m"] or 0) / 1000.0
    details = {"straight_km": straight_km,
               "routed_km": round(routed_km, 1),
               "budget_km": cfg["walk_budget_km"]}
    if straight_km is None:
        details["status"] = "skipped"     # weight redistributes
        return True, None, details
    passed = straight_km <= cfg["walk_budget_km"]
    over = max(0.0, straight_km - cfg["walk_budget_km"])
    return passed, max(0.0, 100.0 - 20.0 * over), details


def citytrip_day_length_check(trip, cfg):
    dur = trip["duration_min"]
    details = {"duration_min": dur, "window": [cfg["day_min_min"],
                                               cfg["day_max_min"]]}
    if not dur:
        return False, 0.0, details
    passed = cfg["day_min_min"] <= dur <= cfg["day_max_min"]
    off = (max(0, cfg["day_min_min"] - dur) + max(0, dur - cfg["day_max_min"]))
    return passed, max(0.0, 100.0 - off / 3.0), details


def citytrip_popularity_check(trip, cfg):
    rating = (trip["raw_tags"] or {}).get("city_rating") or {}
    score, fame = rating.get("score"), rating.get("fame")
    details = {"score": score, "fame": fame,
               "floors": {"score": cfg["pop_floor_score"],
                          "fame": cfg["pop_floor_fame"]}}
    if score is None and fame is None:
        return False, 0.0, {**details, "problem": "no city rating recorded"}
    passed = ((score or 0) >= cfg["pop_floor_score"]
              or (fame or 0) >= cfg["pop_floor_fame"])
    return passed, 100.0 if passed else 40.0, details


CITYTRIP_FETCH_SQL = """
    SELECT id, country, title, status::text, distance_m, duration_min,
           raw_tags
    FROM trips
    WHERE category = 'citytrip' AND id = ANY(%s)
    ORDER BY id
"""


def validate_citytrips(conn, ids=None, dry_run=False, cfg=None):
    """Run the citytrip checks, write validation_runs, route drafts.

    Returns the per-trip results. All checks passing moves a draft to
    needs_review; anything else leaves the status alone (a failing citytrip
    stays draft rather than being auto-rejected: the usual fix is a
    re-compose with different parameters, not a human verdict).
    """
    cfg = cfg or CITYTRIP_CONFIG
    if ids is None:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM trips WHERE category = 'citytrip'"
                        " ORDER BY id")
            ids = [r[0] for r in cur.fetchall()]
    if not ids:
        return []
    with conn.cursor() as cur:
        cur.execute(CITYTRIP_FETCH_SQL, (list(ids),))
        rows = cur.fetchall()

    checkers = {
        "citytrip_stops": citytrip_stops_check,
        "citytrip_walking": citytrip_walking_check,
        "citytrip_day_length": citytrip_day_length_check,
        "citytrip_popularity": citytrip_popularity_check,
    }
    results, to_review = [], []
    check_rows, trip_rows = [], []
    for row in rows:
        trip = dict(zip(("id", "country", "title", "status", "distance_m",
                         "duration_min", "raw_tags"), row))
        checks = {name: fn(trip, cfg) for name, fn in checkers.items()}
        num = den = 0.0
        for name, (_, score, _) in checks.items():
            if score is not None:
                num += cfg["weights"][name] * score
                den += cfg["weights"][name]
        quality = round(num / den, 1) if den else 0.0
        all_passed = all(passed for passed, _, _ in checks.values())
        for name, (passed, score, details) in checks.items():
            check_rows.append((trip["id"], name, passed, score, Jsonb(details)))
        trip_rows.append({"id": trip["id"], "quality": quality,
                          "derived": None})
        if all_passed and trip["status"] == "draft":
            to_review.append(trip["id"])
        results.append({**trip, "checks": checks, "quality": quality,
                        "all_passed": all_passed})

    moved = 0
    if not dry_run:
        with conn.cursor() as cur:
            cur.executemany(INSERT_CHECK_SQL, check_rows)
            cur.executemany(UPDATE_TRIP_SQL, trip_rows)
            if to_review:
                cur.execute("UPDATE trips SET status = 'needs_review' "
                            "WHERE id = ANY(%s) AND status = 'draft'",
                            (to_review,))
                moved = cur.rowcount
        conn.commit()

    for r in results:
        fails = [n for n, (p, _, _) in r["checks"].items() if not p]
        verdict = "all checks pass" if r["all_passed"] else \
            "FAILS " + ", ".join(fails)
        print(f"  [{r['id']}] {r['title'][:44]} ({r['country']}) "
              f"quality {r['quality']:.0f}, {verdict}")
    if not dry_run:
        print(f"  {len(results)} citytrips validated, {moved} drafts -> "
              f"needs_review; approve stays human-only")
    return results


# ---------------------------------------------------------------------------
# DB plumbing
# ---------------------------------------------------------------------------

SELECT_IDS_SQL = """
    SELECT id FROM trips
    WHERE source = 'osm' AND category = 'hike'
      AND country = ANY(%s) AND status::text = ANY(%s)
    ORDER BY country, id
"""

FETCH_SQL = f"""
    SELECT t.id, t.country, t.title, t.status, t.network, t.sac_scale,
           t.difficulty, t.distance_m, t.ascent_m, t.descent_m,
           t.raw_tags, t.gap_info, t.elevation,
           CASE WHEN {REPAIR_FRESH_SQL}
                THEN 'repaired' ELSE 'original' END,
           ST_AsGeoJSON(ST_Force2D(
               CASE WHEN {REPAIR_FRESH_SQL}
                    THEN r.geom ELSE t.geom END), 6)
    FROM trips t
    LEFT JOIN trip_repairs r ON r.trip_id = t.id
    WHERE t.id = ANY(%s)
    ORDER BY t.country, t.id
"""

INSERT_CHECK_SQL = """
    INSERT INTO validation_runs
        (subject_type, subject_id, check_name, passed, score, details)
    VALUES ('trip', %s, %s, %s, %s, %s)
"""

UPDATE_TRIP_SQL = """
    UPDATE trips
    SET quality_score = %(quality)s,
        difficulty = COALESCE(difficulty, %(derived)s),
        last_validated_at = now()
    WHERE id = %(id)s
"""

COLUMNS = ("id", "country", "title", "status", "network", "sac_scale",
           "difficulty", "distance_m", "ascent_m", "descent_m",
           "raw_tags", "gap_info", "elevation", "geometry_label", "geojson")


def portal_boosted_ids(conn):
    """Trips whose newest portal_agreement row passed (append-only table:
    the newest row per subject and check is the truth)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (subject_id) subject_id, passed
            FROM validation_runs
            WHERE subject_type = 'trip' AND check_name = 'portal_agreement'
            ORDER BY subject_id, run_at DESC, id DESC""")
        return {sid for sid, passed in cur.fetchall() if passed}


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(results, top_n):
    print("\nscore distribution:")
    buckets = Counter(min(9, int(r["quality"] // 10)) for r in results)
    peak = max(buckets.values(), default=1)
    for b in range(9, -1, -1):
        n = buckets.get(b, 0)
        label = "90-100" if b == 9 else f"{b * 10:2d}-{b * 10 + 9}"
        print(f"  {label:>6}  {'#' * max(1 if n else 0, round(40 * n / peak)):<40} {n}")

    print("\ncheck outcomes:")
    for name in CONFIG["weights"]:
        outcome = Counter(
            "n/a" if r["checks"][name][1] is None
            else ("pass" if r["checks"][name][0] else "fail")
            for r in results)
        print(f"  {name:<16} {outcome['pass']:>6} pass  "
              f"{outcome['fail']:>6} fail  {outcome['n/a']:>6} n/a")

    by_country = defaultdict(list)
    for r in results:
        by_country[r["country"]].append(r)
    for country in sorted(by_country):
        rows = by_country[country]
        scores = [r["quality"] for r in rows]
        print(f"\n[{country}] {len(rows)} trips, median {median(scores):.1f}, "
              f"mean {mean(scores):.1f}; top {min(top_n, len(rows))}:")
        rows.sort(key=lambda r: (-r["quality"], -(r["distance_m"] or 0)))
        for r in rows[:top_n]:
            km = (r["distance_m"] or 0) / 1000.0
            print(f"  {r['quality']:6.1f}  {km:7.1f} km  "
                  f"{r['status']:<12} {r['title'][:52]}")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(
        description="Validate staged trips: five checks into validation_runs, "
                    "quality_score 0-100, drafts routed by threshold.")
    parser.add_argument("--countries", default=PILOT_COUNTRIES,
                        help=f"comma-separated ISO codes (default: "
                             f"{PILOT_COUNTRIES})")
    parser.add_argument("--ids", default="",
                        help="comma-separated trip ids (debugging)")
    parser.add_argument("--statuses",
                        default="draft,needs_review,approved,published",
                        help="statuses to validate (default: all but rejected)")
    parser.add_argument("--limit", type=int, default=0,
                        help="cap the number of trips (testing)")
    parser.add_argument("--tolerance-m", type=float,
                        default=CONFIG["tolerance_m"],
                        help="continuity gap tolerance in metres (default 50)")
    parser.add_argument("--top", type=int, default=20,
                        help="top trips to print per country (default 20)")
    parser.add_argument("--dry-run", action="store_true",
                        help="compute and print only, no DB writes")
    parser.add_argument("--verbose", action="store_true",
                        help="one line per trip")
    parser.add_argument("--citytrips", action="store_true",
                        help="validate stored citytrips instead of hikes "
                             "(their own checks: stops, walking budget, "
                             "day length, city popularity)")
    args = parser.parse_args()

    if args.citytrips:
        conn = connect()
        try:
            ids = ([int(i) for i in args.ids.split(",") if i.strip()]
                   if args.ids else None)
            if not validate_citytrips(conn, ids=ids, dry_run=args.dry_run):
                print("no citytrips staged; run compose_citytrips.py first")
        finally:
            conn.close()
        return

    cfg = {**CONFIG, "tolerance_m": args.tolerance_m}
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()]

    conn = connect()
    with conn.cursor() as cur:
        cur.execute(REPAIRS_DDL.read_text())   # fresh labs: repair may not have run
    conn.commit()

    if args.ids:
        ids = [int(i) for i in args.ids.split(",") if i.strip()]
    else:
        with conn.cursor() as cur:
            sql, params = SELECT_IDS_SQL, [countries, statuses]
            if args.limit:
                sql += " LIMIT %s"
                params.append(args.limit)
            cur.execute(sql, params)
            ids = [r[0] for r in cur.fetchall()]
        conn.commit()
    if not ids:
        print("no trips match the filters")
        conn.close()
        return
    boosted = portal_boosted_ids(conn)
    conn.commit()
    print(f"{len(ids)} trips to validate ({', '.join(countries)}), "
          f"{len(boosted)} carry a portal agreement boost")

    results, failed = [], []
    to_review, to_reject = [], []
    rows_written = 0
    t0 = time.time()
    for start in range(0, len(ids), 200):
        batch = ids[start:start + 200]
        if start:   # re-read per batch: crosscheck may be granting boosts live
            boosted = portal_boosted_ids(conn)
            conn.commit()
        with conn.cursor() as cur:
            cur.execute(FETCH_SQL, (batch,))
            fetched = cur.fetchall()
        check_rows, trip_rows = [], []
        for row in fetched:
            trip = dict(zip(COLUMNS, row))
            try:
                checks, quality = validate_trip(trip, cfg)
            except Exception as exc:  # one broken geometry must not stop the run
                failed.append(f"{trip['id']}: {type(exc).__name__}: {exc}")
                continue
            if trip["id"] in boosted:
                quality = min(100.0, round(quality + cfg["portal_boost"], 1))
            derived = checks["difficulty"][2].get("derived")
            results.append({"id": trip["id"], "country": trip["country"],
                            "title": trip["title"], "status": trip["status"],
                            "distance_m": trip["distance_m"],
                            "quality": quality, "checks": checks})
            for name, (passed, score, details) in checks.items():
                check_rows.append((trip["id"], name, passed, score,
                                   Jsonb(details)))
            trip_rows.append({"id": trip["id"], "quality": quality,
                              "derived": derived})
            if trip["status"] == "draft":
                if quality < cfg["reject_floor"]:
                    to_reject.append(trip["id"])
                elif quality >= cfg["needs_review_min"]:
                    to_review.append(trip["id"])
            if args.verbose:
                parts_line = "  ".join(
                    f"{n.split('_')[0]} " +
                    ("n/a" if s is None else f"{s:.0f}")
                    for n, (_, s, _) in checks.items())
                print(f"[{trip['id']}] {trip['title'][:40]} "
                      f"({trip['country']}): {quality:.1f}  {parts_line}")
        if not args.dry_run:
            with conn.cursor() as cur:
                cur.executemany(INSERT_CHECK_SQL, check_rows)
                cur.executemany(UPDATE_TRIP_SQL, trip_rows)
            conn.commit()   # per batch: keep transactions short
            rows_written += len(check_rows)
        done = start + len(batch)
        if done // 2000 > start // 2000 or done == len(ids):
            rate = done / max(time.time() - t0, 1e-9)
            print(f"  {done}/{len(ids)} trips ({rate:.0f}/s)")

    moved_review = moved_reject = 0
    if not args.dry_run:
        with conn.cursor() as cur:
            if to_review:
                cur.execute("UPDATE trips SET status = 'needs_review' "
                            "WHERE id = ANY(%s) AND status = 'draft'",
                            (to_review,))
                moved_review = cur.rowcount
            if to_reject:
                cur.execute("UPDATE trips SET status = 'rejected' "
                            "WHERE id = ANY(%s) AND status = 'draft'",
                            (to_reject,))
                moved_reject = cur.rowcount
        conn.commit()
    conn.close()

    print(f"\ndone in {time.time() - t0:.0f}s: {len(results)} trips "
          f"validated, {rows_written} validation rows written"
          + (" (dry run, nothing written)" if args.dry_run else ""))
    print(f"status: {moved_review} drafts -> needs_review "
          f"(threshold {cfg['needs_review_min']:g}), "
          f"{moved_reject} drafts -> rejected (floor {cfg['reject_floor']:g}); "
          f"approve stays human-only")
    if failed:
        print(f"failed trips ({len(failed)}): " + " | ".join(failed[:10]))
    if results:
        print_report(results, args.top)


if __name__ == "__main__":
    main()
