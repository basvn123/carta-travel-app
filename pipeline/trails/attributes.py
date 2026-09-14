"""The published filters: how hard, what shape, what it passes, who it suits.

Six questions a walker narrows a list by, derived once here and stored on the
route so the wire ships codes and the app ships chips:

  1 difficulty    easy / moderate / hard / very_hard / alpine, worst segment
                  wins, from the member way grades where they exist and from
                  the DEM where they do not. Which of the two decided it rides
                  in the wire, because a derived alpine grade is a guess.
  2 distance      already measured (elevation.py). No work here.
  3 ascent        already measured. The bands are the app's, from ascent_m.
  4 route type    loop / out_back / point / figure8, from the geometry.
  5 highlights    the KINDS on the line as codes, from scenic.py's features.
  6 suitability   family / dog / stroller / wheelchair / winter / beginner,
                  tagged and derived kept as different codes, and wheelchair
                  never derived.

Plus four things that are not filters and belong with them because they come
from the same evidence: the surface quality term the rating gained, the
season estimate, the portal verification badge, and the three facts the
retired describe.py knew that the structured fields did not (the waymark ref,
what the route passes, and who published the official line).

Order of the run: after curate.py (this only reads the selection), after
elevation.py (the DEM terms), after scenic.py (the highlight kinds), after
way_tags.py (the member way tags), and before rate.py, which reads the
surface term this writes.

On honesty, which is most of the design here:

  A tag and a derivation are different claims and get different codes. The
  filter chip for a tagged wheelchair route and a derived stroller route
  cannot be the same chip, and the wire says which is which.

  Coverage gates every tagged claim. OSM surface tagging is dense in Germany
  and absent on remote alpine paths, so "0% of this route is tagged dog=no"
  is not "dogs are welcome". Nothing tagged is claimed below MIN_COVER of the
  line saying something.

  Nothing about wheelchair access is ever derived. It is the one claim in
  this layer that could put a person somewhere they cannot get out of.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/trails/attributes.py
    python pipeline/trails/attributes.py --countries CH --verbose
    python pipeline/trails/attributes.py --only shape,grade
    python pipeline/trails/attributes.py --dry-run --countries SI
"""

import argparse
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
from schema import ensure  # noqa: E402
from way_tags import SAC_RANK, VIS_RANK, ferrata_value, sac_value  # noqa: E402

SCHEMA_SQL = ROOT / "tools" / "trailslab" / "initdb" / "07_filters.sql"

# ---------------------------------------------------------------------------
# 1. Difficulty
# ---------------------------------------------------------------------------

GRADES = ["easy", "moderate", "hard", "very_hard", "alpine"]
GRADE_RANK = {g: i for i, g in enumerate(GRADES)}

# SAC scale to the published grade. The two alpine grades collapse: a walker
# choosing a filter chip does not distinguish T5 from T6, and a list with a
# chip nobody can fill is worse than one value fewer.
SAC_GRADE = {
    "hiking": "easy",
    "mountain_hiking": "moderate",
    "demanding_mountain_hiking": "hard",
    "alpine_hiking": "very_hard",
    "demanding_alpine_hiking": "alpine",
    "difficult_alpine_hiking": "alpine",
}

# trail_visibility raises a floor rather than setting the grade: a marked T2
# path where the waymarks stop is a harder day than its terrain grade says,
# and route finding is the thing people underestimate.
VIS_FLOOR = {"bad": "moderate", "horrible": "hard", "no": "hard"}

# Any via ferrata section is at least very hard; a graded one from C up is
# alpine, because at that point it is a climb with a cable.
FERRATA_FLOOR = {0: "hard", 1: "very_hard", 2: "very_hard",
                 3: "alpine", 4: "alpine", 5: "alpine", 6: "alpine"}

# How much of the line has to say something before a tagged grade is used.
# Below this the tags describe a fragment, not the walk, and the DEM answers
# instead.
MIN_GRADE_COVER = 0.15
# How much of the line has to carry a tag before a SUITABILITY claim is made.
# Higher, because these are claims about a person's whole day.
MIN_COVER = 0.60

# The DEM fallback, in (grade, max sustained gradient percent, ascent per km).
# Read hardest first; the first row both terms clear wins.
#
# max_grade_pct is elevation.py's steepest sustained run over about 90 m
# (GRADE_SPAN_STEPS), not a single 30 m step, which on a noisy DSM is nothing
# but speckle. ascent per km is the honest measure of a long grind.
DEM_LADDER = [
    ("alpine", 40.0, 250.0),
    ("very_hard", 30.0, 180.0),
    ("hard", 22.0, 120.0),
    ("moderate", 14.0, 70.0),
]
# A derived alpine grade needs height as well as steepness. A 45 percent
# gradient on a 300 m hill is a staircase in a wood, not the Alps, and the
# DEM cannot tell the difference from the profile alone.
DERIVED_ALPINE_MIN_TOP_M = 1500.0

# Effort, from what the walk asks of a day rather than of a foot. Capped at
# very_hard on purpose: length and climb make a long day, terrain makes an
# alpine one, and a 60 km flat trek is not alpine.
EFFORT_LADDER = [
    ("very_hard", 40_000, 2_200),
    ("hard", 25_000, 1_400),
    ("moderate", 15_000, 800),
]


def _max_grade(*grades):
    seen = [g for g in grades if g in GRADE_RANK]
    return max(seen, key=lambda g: GRADE_RANK[g]) if seen else None


def tagged_grade(wt):
    """Grade from the member way tags, or None when they do not cover enough.

    Worst segment wins: way_tags.py already picked the hardest sac_scale and
    trail_visibility that clear its own noise floor, so this only has to map
    them and take the strongest floor."""
    if not wt:
        return None, {}
    cover = (wt.get("cover") or {})
    sac_cover = float(cover.get("sac_scale") or 0)
    ferrata = wt.get("ferrata_max")
    if sac_cover < MIN_GRADE_COVER and ferrata is None:
        return None, {"sac_cover": round(sac_cover, 3)}

    parts = {"sac_cover": round(sac_cover, 3)}
    from_sac = None
    if sac_cover >= MIN_GRADE_COVER and wt.get("sac_worst"):
        from_sac = SAC_GRADE.get(wt["sac_worst"])
        parts["sac_worst"] = wt["sac_worst"]
        parts["sac_worst_share"] = wt.get("sac_worst_share")
    from_vis = None
    if wt.get("visibility_worst"):
        from_vis = VIS_FLOOR.get(wt["visibility_worst"])
        if from_vis:
            parts["visibility_worst"] = wt["visibility_worst"]
    from_ferrata = None
    if ferrata is not None:
        from_ferrata = FERRATA_FLOOR.get(int(ferrata), "very_hard")
        parts["ferrata_max"] = ferrata

    grade = _max_grade(from_sac, from_vis, from_ferrata)
    return grade, parts


def dem_grade(row):
    """Grade from the elevation profile, for a route nothing graded."""
    elev = row.get("elevation") or {}
    km = max(0.5, (row.get("distance_m") or 0) / 1000.0)
    ascent = float(row.get("ascent_m") or 0)
    per_km = ascent / km
    max_grade = elev.get("max_grade_pct")
    top = elev.get("ele_max_m")
    parts = {"ascent_per_km": int(round(per_km))}
    if max_grade is not None:
        parts["max_grade_pct"] = round(float(max_grade), 1)
    if top is not None:
        parts["ele_max_m"] = int(round(float(top)))
    if elev.get("status") != "ok":
        parts["elevation_status"] = elev.get("status")
        return None, parts

    grade = "easy"
    for name, grade_pct, ascent_km in DEM_LADDER:
        if (max_grade is not None and float(max_grade) >= grade_pct) \
                or per_km >= ascent_km:
            grade = name
            break
    if grade == "alpine" and (top is None
                              or float(top) < DERIVED_ALPINE_MIN_TOP_M):
        grade = "very_hard"
        parts["alpine_capped"] = "top below 1500 m"
    return grade, parts


def effort_grade(row):
    """Grade from distance and ascent alone. Always available."""
    distance = row.get("distance_m") or 0
    ascent = row.get("ascent_m") or 0
    for name, max_m, max_asc in EFFORT_LADDER:
        if distance > max_m or ascent > max_asc:
            return name
    if distance <= 8_000 and ascent <= 350:
        return "easy"
    return "moderate"


def grade_of(row):
    """(grade, source, parts). source is 'tagged' when a mapper's grade
    decided the terrain and 'derived' when the DEM did."""
    wt = row.get("way_tags")
    from_tags, tag_parts = tagged_grade(wt)
    from_dem, dem_parts = dem_grade(row)
    effort = effort_grade(row)

    terrain = from_tags if from_tags else from_dem
    source = "tagged" if from_tags else "derived"
    grade = _max_grade(terrain, effort) or effort
    parts = {"terrain": terrain, "terrain_from": source, "effort": effort,
             **tag_parts, **dem_parts}
    return grade, source, parts


# ---------------------------------------------------------------------------
# 4. Route type
# ---------------------------------------------------------------------------

# Endpoints this close are the same place. 100 m is the brief's figure and
# about the length of a car park; curate.py's is_loop uses a looser 250 m
# because it answers a different question (can I leave the car here).
CLOSE_M = 100.0
# Buffer around the outbound half, in metres, and the share of the inbound
# half that has to fall inside it.
RETRACE_BUFFER_M = 15.0
RETRACE_SHARE = 0.6

# Everything in one query, in EPSG:3035 so the buffer means metres from
# Marseille to Tromso.
#
# ST_LineMerge first: a curated route is one continuous line by construction,
# but the column type is MultiLineString and ST_LineSubstring wants a
# LineString. A route that still merges to several parts is left unclassified
# rather than measured wrong.
SHAPE_SQL = """
WITH eff AS (
    SELECT t.id, t.raw_tags->>'roundtrip' AS roundtrip,
           COALESCE(r.geom, t.geom) AS geom
    FROM trips t
    LEFT JOIN trip_repairs r
           ON r.trip_id = t.id AND r.repaired
          AND r.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(t.geom)))
    WHERE t.id = ANY(%(ids)s)
), merged AS (
    SELECT id, roundtrip, ST_LineMerge(ST_Force2D(geom)) AS line FROM eff
), single AS (
    SELECT id, roundtrip, line FROM merged
    WHERE GeometryType(line) = 'LINESTRING' AND ST_NPoints(line) >= 4
), m AS (
    SELECT s.id, s.roundtrip, s.line,
           ST_Transform(s.line, 3035) AS metric
    FROM single s
), halves AS (
    SELECT m.id, m.roundtrip, m.line, m.metric,
           ST_LineSubstring(m.metric, 0.0, 0.5) AS out_half,
           ST_LineSubstring(m.metric, 0.5, 1.0) AS back_half
    FROM m
)
SELECT h.id,
       ST_Distance(ST_StartPoint(h.line)::geography,
                   ST_EndPoint(h.line)::geography) AS end_gap_m,
       ST_IsSimple(h.line) AS simple,
       h.roundtrip,
       CASE WHEN ST_Length(h.back_half) > 0 THEN
            ST_Length(ST_Intersection(
                ST_Buffer(h.out_half, %(buf)s), h.back_half))
            / ST_Length(h.back_half)
       ELSE 0 END AS retrace,
       ST_NumGeometries(ST_UnaryUnion(h.metric)) AS pieces
FROM halves h
"""


def route_type_of(rec):
    """(route_type, source, parts) for one row of SHAPE_SQL.

    Order matters and is the whole subtlety: an out and back ALSO starts and
    finishes in the same place, so testing "closed" first would call every
    there-and-back a loop. The retrace measurement runs first and only what
    it does not claim is judged on its endpoints."""
    gap = float(rec["end_gap_m"] or 0)
    retrace = float(rec["retrace"] or 0)
    closed = gap <= CLOSE_M
    tagged = str(rec.get("roundtrip") or "").strip().lower() in ("yes", "true")
    parts = {"end_gap_m": int(round(gap)), "retrace": round(retrace, 3),
             "simple": bool(rec["simple"]), "pieces": int(rec["pieces"] or 1)}

    if retrace >= RETRACE_SHARE:
        return "out_back", "geometry", parts
    if closed and not rec["simple"] and int(rec["pieces"] or 1) >= 2:
        # A figure of eight crosses itself once inside, which nodes the line
        # into two rings. More crossings than that is a network, not a shape
        # with a name, and stays a loop.
        return ("figure8" if int(rec["pieces"]) == 2 else "loop"), "geometry", parts
    if closed or tagged:
        return "loop", ("tagged" if tagged and not closed else "geometry"), parts
    return "point", "geometry", parts


# ---------------------------------------------------------------------------
# 5. Highlights as codes
# ---------------------------------------------------------------------------

# scenic.py's kinds folded onto the ten codes a chip can carry. Several kinds
# share a code on purpose: a reader filtering for "castle" wants the ruin on
# the ridge too, and a filter with eighteen values is a taxonomy, not a
# filter.
HIGHLIGHT_CODE = {
    "waterfall": "waterfall",
    "lake": "lake", "water": "lake", "hot_spring": "lake",
    "peak": "summit", "volcano": "summit",
    "viewpoint": "viewpoint",
    "castle": "castle", "ruins": "castle", "monastery": "castle",
    "hut": "hut",
    "gorge": "gorge", "cliff": "gorge", "arch": "gorge", "cave": "gorge",
    "beach": "coast", "coastline": "coast", "lighthouse": "coast",
    "forest": "forest",
    "village": "village",
    # glacier and spring have no chip of their own: a glacier reads as a
    # summit day and a spring is a convenience, not a reason.
    "glacier": "summit",
}

# Only what the route genuinely TOUCHES earns a code. scenic.py stores both
# radii; the wide one feeds the density signal and the narrow one is what a
# card may claim.
HIGHLIGHT_ON_LINE_M = 250


def highlight_codes(row):
    """Distinct highlight codes, in the order the walk meets them."""
    h = row.get("highlights") or {}
    out, seen = [], set()
    for f in h.get("features") or []:
        code = HIGHLIGHT_CODE.get(f.get("kind"))
        if not code or code in seen:
            continue
        if (f.get("off_m") or 0) > HIGHLIGHT_ON_LINE_M:
            continue
        seen.add(code)
        out.append(code)
    return out


# ---------------------------------------------------------------------------
# 6. Suitability
# ---------------------------------------------------------------------------

def _share(mapping, *values):
    return sum(float((mapping or {}).get(v) or 0) for v in values)


def suitability_of(row, grade, season):
    """{"tagged": [...], "derived": [...], "cover": {...}}.

    Tagged and derived never share a code. Somebody filtering for a
    wheelchair route is asking whether a mapper checked, and somebody
    filtering for a family walk is asking whether it looks gentle; conflating
    the two would answer the first question with the second."""
    wt = row.get("way_tags") or {}
    cover = wt.get("cover") or {}
    tagged, derived = [], []

    # Wheelchair: tagged, never derived, and only when most of the line was
    # actually surveyed for it.
    wc_cover = float(cover.get("wheelchair") or 0)
    if wc_cover >= MIN_COVER:
        yes = _share(wt.get("wheelchair"), "yes")
        no = _share(wt.get("wheelchair"), "no")
        if yes >= 0.8 and no == 0:
            tagged.append("wheelchair")

    # Dogs: tagged only, for the same reason. Silence about dogs is not
    # permission, and a "dogs welcome" chip that turns out to be a guess is
    # a wasted drive with a dog in the car.
    dog_cover = float(cover.get("dog") or 0)
    if dog_cover >= 0.25:
        banned = _share(wt.get("dog"), "no")
        allowed = _share(wt.get("dog"), "yes", "leashed", "leashed_only")
        if banned == 0 and allowed > 0:
            tagged.append("dog")

    # Stroller. Tagged when smoothness says so over most of the line; derived
    # from the brief's own rule otherwise. Both need the walk to be short.
    distance = row.get("distance_m") or 0
    max_grade = ((row.get("elevation") or {}).get("max_grade_pct"))
    gentle = max_grade is not None and float(max_grade) < 6.0
    short = distance and distance < 6_000
    sm_cover = float(cover.get("smoothness") or 0)
    if short and sm_cover >= MIN_COVER \
            and _share(wt.get("smoothness"), "excellent", "good") >= 0.8:
        tagged.append("stroller")
    elif short and gentle and grade == "easy" \
            and float(wt.get("rollable_share") or 0) >= 0.6:
        derived.append("stroller")

    # Family: short, gentle, nothing that needs a head for heights.
    ascent = row.get("ascent_m") or 0
    if distance and distance <= 8_000 and ascent <= 300 \
            and GRADE_RANK.get(grade, 9) <= GRADE_RANK["easy"] \
            and wt.get("ferrata_max") is None \
            and VIS_RANK.get(wt.get("visibility_worst") or "excellent", 0) \
            <= VIS_RANK["intermediate"]:
        derived.append("family")

    # Beginner: a first proper walk. Waymarked, because the other half of
    # being a beginner is not knowing where the path went.
    if distance and distance <= 12_000 and ascent <= 500 \
            and GRADE_RANK.get(grade, 9) <= GRADE_RANK["moderate"] \
            and (row.get("network") or ""):
        derived.append("beginner")

    # Winter: walkable in the months the season estimate keeps open, and not
    # graded beyond a hillwalk. An estimate, like the season it reads.
    if season and season.get("n", 0) >= 11 \
            and GRADE_RANK.get(grade, 9) <= GRADE_RANK["moderate"]:
        derived.append("winter")

    out = {"tagged": tagged, "derived": derived}
    keep = {k: round(float(v), 3) for k, v in cover.items()
            if k in ("wheelchair", "dog", "smoothness", "surface", "sac_scale")}
    if keep:
        out["cover"] = keep
    return out


# ---------------------------------------------------------------------------
# Surface quality, the rating's newest component
# ---------------------------------------------------------------------------

# What a route with no surface tagging at all scores. Neutral rather than
# zero: the percentile machinery in rate.py ranks every published row, and a
# country that does not tag surface would otherwise rank its whole list at
# the bottom of a component it never had a chance at.
SURFACE_UNKNOWN = 0.5
# How much a road walking share costs. A route that is a third tarmac loses
# about a third of the component, which is roughly how much people mind.
ROAD_PENALTY = 1.0


def surface_of(row):
    """{"quality": 0..1, "road_share": .., "known": .., "source": ..}."""
    wt = row.get("way_tags") or {}
    cover = float((wt.get("cover") or {}).get("surface") or 0)
    road = float(wt.get("road_share") or 0)
    base = wt.get("surface_quality")
    known = cover
    if base is None:
        base = wt.get("smoothness_quality")
        known = float((wt.get("cover") or {}).get("smoothness") or 0)
    if base is None:
        return {"quality": round(SURFACE_UNKNOWN - ROAD_PENALTY * road, 4),
                "road_share": round(road, 4), "known": 0.0,
                "source": "unknown"}
    # Blend towards neutral by how much of the line actually said something,
    # so a route with 8 percent surface coverage is not judged on 8 percent.
    blended = known * float(base) + (1.0 - known) * SURFACE_UNKNOWN
    return {"quality": round(max(0.0, blended - ROAD_PENALTY * road), 4),
            "road_share": round(road, 4), "known": round(known, 4),
            "source": "surface" if wt.get("surface_quality") is not None
                      else "smoothness"}


# ---------------------------------------------------------------------------
# Season, the same rule the mountain layer publishes
# ---------------------------------------------------------------------------

def season_of(row):
    """The months a walker would normally find the route clear of snow.

    An ESTIMATE from the route's top height and its latitude, deliberately
    the same rule and the same shape pipeline/mountains/enrich_peaks.py
    publishes, so a peak and the path up it never disagree about when the
    season is. `est` is carried so the app can say "typically" rather than
    presenting it as a condition report."""
    elev = row.get("elevation") or {}
    top = elev.get("ele_max_m")
    if top is None or elev.get("status") != "ok":
        return None
    lat = abs(float(row.get("lat") or 45.0))
    effective = float(top) + (lat - 45.0) * 55.0
    if effective < 900:
        return {"from": "jan", "to": "dec", "n": 12, "est": True}
    if effective < 1500:
        return {"from": "apr", "to": "nov", "n": 8, "est": True}
    if effective < 2200:
        return {"from": "jun", "to": "oct", "n": 5, "est": True}
    if effective < 3000:
        return {"from": "jul", "to": "sep", "n": 3, "est": True}
    return {"from": "jul", "to": "aug", "n": 2, "est": True}


# ---------------------------------------------------------------------------
# The three facts the retired prose knew
# ---------------------------------------------------------------------------

# How close a catalogue anchor has to be to be worth naming, and the rounding.
# Straight out of describe.py's build_facts, which is where these lived: the
# anchor point is a city or POI centroid, so "within 1 m" would be false
# precision. Rounded to hundreds with a 100 m floor.
PASSES_MAX = 3
PASSES_FLOOR_M = 100


def fold_name(name):
    """Accent folded lowercase, for spotting the same anchor twice."""
    import unicodedata
    text = unicodedata.normalize("NFKD", (name or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def passes_of(anchors):
    """[{"name": .., "m": ..}] for the places the route runs past.

    popularity.py returns the three highest fame anchors, which for a city is
    often the city plus two of its own landmarks under near identical names
    ("Lausanne, Lausanne, Lausanne"). Nearest per folded name wins."""
    nearest = {}
    for a in anchors or []:
        key = fold_name(a.get("name"))
        if not key:
            continue
        if key not in nearest or a.get("dist_m", 0) < nearest[key]["dist_m"]:
            nearest[key] = a
    ordered = sorted(nearest.values(), key=lambda a: a.get("dist_m", 0))
    return [{"name": a["name"],
             "m": max(PASSES_FLOOR_M, round((a.get("dist_m") or 0) / 100) * 100)}
            for a in ordered[:PASSES_MAX]] or None


def waymark_ref_of(row):
    """The reference painted on the signposts, as a walker reads it."""
    tags = row.get("raw_tags") or {}
    ref = (tags.get("ref") or "").strip()
    if not ref or len(ref) > 24:
        return None
    return ref


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

FETCH_SQL = """
    SELECT t.id, t.country, t.title, t.network, t.distance_m, t.ascent_m,
           t.sac_scale, t.raw_tags, t.elevation, t.highlights, t.way_tags,
           t.status::text AS status,
           ST_Y(ST_PointOnSurface(ST_Envelope(t.geom))) AS lat,
           port.passed AS portal_passed,
           port.details AS portal_details,
           pop.details AS popularity_details
    FROM trips t
    LEFT JOIN LATERAL (
        SELECT v.passed, v.details FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name = 'portal_agreement'
        ORDER BY v.run_at DESC LIMIT 1
    ) port ON true
    LEFT JOIN LATERAL (
        SELECT v.details FROM validation_runs v
        WHERE v.subject_type = 'trip' AND v.subject_id = t.id
          AND v.check_name IN ('popularity', 'popularity_dayhike')
        ORDER BY v.run_at DESC LIMIT 1
    ) pop ON true
    WHERE t.country = %(cc)s AND t.category = 'hike'
      AND t.status IN ('approved', 'published')
"""


def fetch(conn, cc):
    with conn.cursor() as cur:
        cur.execute(FETCH_SQL, {"cc": cc})
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def fetch_shapes(conn, ids):
    if not ids:
        return {}
    with conn.cursor() as cur:
        cur.execute(SHAPE_SQL, {"ids": ids, "buf": RETRACE_BUFFER_M})
        cols = [d.name for d in cur.description]
        return {r[0]: dict(zip(cols, r)) for r in cur.fetchall()}


UPDATE_SQL = """
    UPDATE trips SET
        grade = %(grade)s, grade_src = %(grade_src)s, grade_parts = %(grade_parts)s,
        route_type = %(route_type)s, route_type_src = %(route_type_src)s,
        route_type_parts = %(route_type_parts)s,
        highlight_kinds = %(highlight_kinds)s,
        suitability = %(suitability)s, surface = %(surface)s,
        season = %(season)s, waymark_ref = %(waymark_ref)s,
        publisher = %(publisher)s, passes = %(passes)s,
        portal_ok = %(portal_ok)s, portal_source = %(portal_source)s
    WHERE id = %(id)s
"""


# ---------------------------------------------------------------------------
# The pass
# ---------------------------------------------------------------------------

def derive(row, shape):
    grade, grade_src, grade_parts = grade_of(row)
    season = season_of(row)
    if shape:
        route_type, route_type_src, route_type_parts = route_type_of(shape)
    else:
        route_type, route_type_src, route_type_parts = None, None, None

    portal_details = row.get("portal_details") or {}
    portal_ok = bool(row.get("portal_passed"))
    portal_source = portal_details.get("source") if portal_ok else None

    anchors = (row.get("popularity_details") or {}).get("anchors") or []

    return {
        "id": row["id"],
        "grade": grade,
        "grade_src": grade_src,
        "grade_parts": Jsonb(grade_parts),
        "route_type": route_type,
        "route_type_src": route_type_src,
        "route_type_parts": Jsonb(route_type_parts) if route_type_parts else None,
        "highlight_kinds": highlight_codes(row) or None,
        "suitability": Jsonb(suitability_of(row, grade, season)),
        "surface": Jsonb(surface_of(row)),
        "season": Jsonb(season) if season else None,
        "waymark_ref": waymark_ref_of(row),
        "publisher": portal_source,
        "passes": Jsonb(passes_of(anchors)) if passes_of(anchors) else None,
        "portal_ok": portal_ok if row.get("portal_passed") is not None else None,
        "portal_source": portal_source,
    }


def curated_countries(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT country FROM trips
            WHERE category = 'hike' AND status IN ('approved', 'published')
            ORDER BY country""")
        return [r[0] for r in cur.fetchall()]


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    totals = Counter()
    grades = Counter()
    shapes = Counter()
    codes = Counter()
    suits = Counter()
    with connect() as conn:
        ensure(conn, SCHEMA_SQL, verbose=True)
        countries = ([c.strip().upper() for c in args.countries.split(",") if c.strip()]
                     if args.countries else curated_countries(conn))
        for cc in countries:
            rows = fetch(conn, cc)
            conn.commit()
            if not rows:
                continue
            shape_by_id = fetch_shapes(conn, [r["id"] for r in rows])
            conn.commit()
            records = [derive(r, shape_by_id.get(r["id"])) for r in rows]
            for rec in records:
                grades[rec["grade"]] += 1
                shapes[rec["route_type"]] += 1
                for code in rec["highlight_kinds"] or []:
                    codes[code] += 1
                suit = rec["suitability"].obj
                for code in suit["tagged"]:
                    suits[f"{code} (tagged)"] += 1
                for code in suit["derived"]:
                    suits[f"{code} (derived)"] += 1
                totals["tagged_grade" if rec["grade_src"] == "tagged"
                       else "derived_grade"] += 1
            if not args.dry_run:
                with conn.cursor() as cur:
                    cur.executemany(UPDATE_SQL, records)
                conn.commit()
            totals["rows"] += len(records)
            n_shape = sum(1 for r in records if r["route_type"])
            print(f"{cc}: {len(records):4d} route(s), {n_shape} shaped, "
                  f"{sum(1 for r in records if r['grade_src'] == 'tagged')} "
                  f"graded from tags")
            if args.verbose:
                for r in records[:4]:
                    print(f"    [{r['id']}] {r['grade']}/{r['grade_src']} "
                          f"{r['route_type']} {r['highlight_kinds'] or []}")

    print("\n" + "=" * 58)
    print(f"{totals['rows']:,} route(s) in {(time.time() - t0) / 60:.1f} min")
    print(f"grade: {dict(grades)}")
    print(f"  {totals['tagged_grade']:,} from member way tags, "
          f"{totals['derived_grade']:,} derived from the DEM")
    print(f"route type: {dict(shapes)}")
    print(f"highlights: {dict(codes.most_common())}")
    print(f"suitability: {dict(suits.most_common())}")
    if args.dry_run:
        print("dry run: nothing written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
