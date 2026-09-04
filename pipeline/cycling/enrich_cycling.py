"""Everything a harvested cycle route has to know before it can be rated.

Six steps, each independently re-runnable, each writing its own column so a
partial pass is legible rather than half a row:

  regions     nuts3 / nuts2 / coast / biogeo / h3, plus every region crossed,
              from pipeline/regions/assign.py. Stored, never recomputed at
              export (the region contract, master spec section 4).
  elevation   Copernicus GLO-30 sampled along the line, through the trails
              elevation module so the smoothing discipline is literally the
              same code. See ELEVATION below.
  surface     percent paved, percent traffic free, the smoothness ladder and
              the worst surface on the route, all length weighted over
              way_spans, plus the bike type that worst case implies.
  safety      the house metric. See SAFETY below.
  near        which of our own published beaches, lakes, peaks and trails
              the route runs past. Brief 08 will own this pass for all
              layers; cycling reads the published wires until it does.
  services    sleeping, water, food, bike shops and stations near the line,
              read out of the same Geofabrik extracts, clustered onto named
              places into SERVICE TOWNS. These are the atoms stage_planner.py
              cuts at; a stage never ends at an arbitrary GPS point.
  scenic      the composite that makes "the nicest part of Scotland" an
              answerable question.

ELEVATION. The brief asks for the same smoothing discipline as trails, and
the Swiss-calibrated parameters. Those two are the same thing and they live
in pipeline/trails/elevation.py: a 3-sample moving average and a 5 m
hysteresis gate before ascent commits, calibrated against the OSM ascent tags
on Swiss routes to a computed/tag median of 0.94. This module imports that
file and calls its sampler rather than restating any of it, so a canal
towpath cannot quietly grow two thousand metres of climb here that it does
not have on the hiking side. What is NOT reused is the DIN 33466 duration
rule, which is a walking standard; riding time comes from the pace table in
stage_planner.py.

SAFETY is our own design and is documented as a house metric, because there
is no standard to adopt: the ECF's own OSM-based methodology computes
infrastructure ratios and deliberately declines to define a safety score.
Per way, length weighted:

    penalty = road-class penalty          cycleway 0, residential 1,
                                          secondary 3, primary 6, trunk 10
            + speed penalty               over 30 km/h, up to +4
            - segregation bonus           cycleway=track, up to -1.5
    score   = 10 - mean(penalty), clamped to 0..10, 10 being safest

Only the TAGGED length counts, and known_share ships next to the score, so a
route nobody has tagged reads as unmeasured rather than as safe. No reading
is not a bad reading (invariant 6).

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/enrich_cycling.py --steps surface,safety
    python pipeline/cycling/enrich_cycling.py --countries GB --verbose
    python pipeline/cycling/enrich_cycling.py --steps services --countries GB
"""

import argparse
import importlib.util
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))

import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

# What an elevation pass may leave in data/raw/dem. See step_elevation.
#
# Four gigabytes, the same bound the trails task uses, because a Europe-wide
# pass would otherwise fill the disk: data/raw/dem already holds 23 GB for
# four pilot countries. It was briefly 1 while C: was down to 2.5 GB free,
# which is worth remembering as the shape of the constraint: DEM tiles land on
# the HOST filesystem, unlike database writes, which reuse space already
# inside the container volume. A tile evicted here re-downloads if needed.
DEM_EVICT_GB = 4

STEPS = ("regions", "elevation", "surface", "safety", "services",
         "routeservices", "near", "scenic")


def log(msg):
    print(f"[cycling] {msg}", flush=True)


def _by_path(name, relative):
    """Load a sibling layer's module by path, under a neutral name."""
    path = ROOT / relative
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    old = list(sys.path)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path[:] = old
    return mod


# ---------------------------------------------------------------------------
# Step: regions
# ---------------------------------------------------------------------------

REGION_FETCH = """
    SELECT id, ST_AsText(ST_Simplify(ST_Force2D(geom), 0.002))
    FROM cycle_routes
    WHERE (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
      AND (%(refresh)s OR regions IS NULL)
    ORDER BY id
"""

POINT_RE = None


def _coords_of(wkt):
    """Every vertex of a MULTILINESTRING WKT as (lat, lon) pairs."""
    import re
    global POINT_RE
    if POINT_RE is None:
        POINT_RE = re.compile(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")
    return [(float(la), float(lo))
            for lo, la in POINT_RE.findall(wkt or "")]


def step_regions(conn, countries, refresh, verbose):
    """Assign every route to its regions, and record everything it crosses.

    A cycle route is a line, so it belongs to the region holding the midpoint
    of its length and additionally reports every region it passes through:
    a route that starts in the Cairngorms and ends on the Moray coast should
    appear on both region pages, which is what assign_line already does for
    trails.
    """
    import assign as A
    with conn.cursor() as cur:
        cur.execute(REGION_FETCH, {"countries": list(countries) or None,
                                   "refresh": bool(refresh)})
        rows = cur.fetchall()
    log(f"regions: {len(rows)} route(s) to assign")
    done = Counter()
    with conn.cursor() as cur:
        for i, (rid, wkt) in enumerate(rows, 1):
            coords = _coords_of(wkt)
            if len(coords) < 2:
                done["no_geometry"] += 1
                continue
            got = A.assign_line(coords)
            payload = A.wire_rg(got.ids)
            if got.crosses:
                payload["x"] = list(got.crosses)
            cur.execute("UPDATE cycle_routes SET regions = %s WHERE id = %s",
                        (Jsonb(payload), rid))
            done["assigned"] += 1
            if i % 500 == 0:
                conn.commit()
                log(f"  regions {i}/{len(rows)}")
    conn.commit()
    log(f"regions: {done['assigned']} assigned, {done['no_geometry']} without "
        f"usable geometry")
    return done


# ---------------------------------------------------------------------------
# Step: elevation
# ---------------------------------------------------------------------------

ELE_FETCH = """
    SELECT r.id, coalesce(r.name, r.ref, 'route ' || r.id), r.country,
           r.raw_tags->>'distance', r.raw_tags->>'ascent',
           ST_AsBinary(ST_Force3D(coalesce(cr.geom, r.geom))),
           md5(ST_AsBinary(ST_Force2D(coalesce(cr.geom, r.geom))))
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr
           ON cr.route_id = r.id AND cr.repaired
          AND cr.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(r.geom)))
    WHERE (%(countries)s::text[] IS NULL OR r.country = ANY(%(countries)s))
      AND r.distance_m >= %(min_len)s
      AND (%(refresh)s
           OR r.elevation IS NULL
           OR r.elevation->>'geom_md5'
              IS DISTINCT FROM md5(ST_AsBinary(ST_Force2D(
                   coalesce(cr.geom, r.geom)))))
    ORDER BY ST_GeoHash(ST_PointOnSurface(ST_Force2D(r.geom)), 5), r.id
"""

ELE_UPDATE = """
    UPDATE cycle_routes
       SET ascent_m = %(ascent_m)s, descent_m = %(descent_m)s,
           elevation = %(elevation)s,
           geom = CASE WHEN %(wkb)s::bytea IS NULL THEN geom
                       ELSE ST_GeomFromWKB(%(wkb)s, 4326) END
     WHERE id = %(id)s
"""

# Below this a route is a link, not a ride, and sampling it is DEM tiles spent
# on nothing. The stage planner never looks at anything shorter either.
MIN_ELEVATION_LEN_M = 3_000


def step_elevation(conn, countries, refresh, verbose, limit=0):
    """Sample GLO-30 along every route, through the trails sampler."""
    E = _by_path("carta_trails_elevation", "pipeline/trails/elevation.py")
    with conn.cursor() as cur:
        cur.execute(ELE_FETCH, {"countries": list(countries) or None,
                                "refresh": bool(refresh),
                                "min_len": MIN_ELEVATION_LEN_M})
        rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    log(f"elevation: {len(rows)} route(s) to sample "
        f"(step {E.SAMPLE_STEP_M:g} m, {E.SMOOTH_WINDOW}-sample average, "
        f"{E.CLIMB_THRESHOLD_M:g} m hysteresis, the Swiss-calibrated pair)")
    # BOUNDED, or a Europe-wide pass fills the disk. data/raw/dem already
    # holds 23 GB from the trails layer's four pilot countries and this
    # machine has 17 GB free; sampling 59,000 routes across 44 countries
    # unbounded would ask for far more than that. The trails module already
    # solved this with an LRU eviction budget and its own task passes
    # --evict-gb 4, so cycling uses the same lever. A tile evicted here simply
    # re-downloads if something needs it again.
    tiles = E.DemTiles(evict_gb=DEM_EVICT_GB)
    done = Counter()
    t0 = time.time()
    with conn.cursor() as cur:
        for i, row in enumerate(rows, 1):
            try:
                out = E.process_trip(row, tiles)
            except Exception as exc:
                done["failed"] += 1
                if verbose:
                    log(f"  {row[0]}: {type(exc).__name__}: {exc}")
                continue
            done[out["status"]] += 1
            p = out["params"]
            cur.execute(ELE_UPDATE, {
                "id": p["id"], "ascent_m": p.get("ascent_m"),
                "descent_m": p.get("descent_m"),
                "elevation": p.get("elevation"), "wkb": p.get("wkb")})
            if i % 200 == 0:
                conn.commit()
                log(f"  elevation {i}/{len(rows)} ({time.time() - t0:.0f}s)")
    conn.commit()
    log("elevation: " + ", ".join(f"{k}={v}" for k, v in sorted(done.items())))
    return done


# ---------------------------------------------------------------------------
# Steps: surface and safety, both read way_spans
# ---------------------------------------------------------------------------

# Paved, per the brief, verbatim.
PAVED = {"paved", "asphalt", "concrete", "concrete:plates", "paving_stones",
         "sett", "metal"}
# Everything else that appears often enough to name. Anything unlisted counts
# as unpaved only when it is a known unpaved value; an unknown string counts
# as unmeasured, which is the difference between a reading and a guess.
UNPAVED = {"unpaved", "gravel", "fine_gravel", "compacted", "ground", "dirt",
           "earth", "grass", "sand", "mud", "pebblestone", "woodchips",
           "rock", "stone", "cobblestone", "concrete:lanes", "wood",
           "grass_paver", "shells", "clay"}

# Traffic free, per the brief: a highway class away from motor traffic, or a
# road with a segregated cycle track alongside it.
TRAFFIC_FREE_HIGHWAY = {"cycleway", "path", "track", "pedestrian", "footway",
                        "bridleway"}
SEGREGATED_CYCLEWAY = {"track", "opposite_track", "sidepath"}

# The smoothness ladder, worst last. Values off the ladder (people do write
# smoothness=designated) are ignored rather than ranked.
SMOOTHNESS = ("excellent", "good", "intermediate", "bad", "very_bad",
              "horrible", "very_horrible", "impassable")
TRACKTYPE = ("grade1", "grade2", "grade3", "grade4", "grade5")

# What the worst surface on a route means for the bike you need. The stage
# planner's surface_fit check reads this and refuses to publish a touring
# tour that contains grade-4 track.
BIKE_TOURING = "touring"      # road tyres, paved and grade1 tracks
BIKE_GRAVEL = "gravel"        # accepts grade1-3 and intermediate/bad
BIKE_MTB = "mtb"              # anything worse; out of this layer's scope
BIKE_ORDER = (BIKE_TOURING, BIKE_GRAVEL, BIKE_MTB)

# Road class penalties. The brief's anchors are cycleway 0, residential 1,
# secondary 3, primary 6, trunk 10; the rest interpolate between them.
HIGHWAY_PENALTY = {
    "cycleway": 0.0, "path": 0.0, "footway": 0.0, "bridleway": 0.0,
    "pedestrian": 0.0, "steps": 0.0,
    "living_street": 0.5, "track": 1.0, "service": 1.0,
    "residential": 1.0, "unclassified": 1.5, "road": 2.0,
    "tertiary": 2.0, "secondary": 3.0, "primary": 6.0,
    "trunk": 10.0, "motorway": 10.0,
}
SPEED_FREE_KMH = 30.0       # at or below this, speed adds nothing
SPEED_PER_KMH = 0.05        # +1 penalty per 20 km/h over the free limit
SPEED_CAP = 4.0
SEGREGATION_BONUS = 1.5
WORST_PENALTY = 10.0


def _spans(way_spans):
    """(length_m, tags) for every span, tags possibly None."""
    if not way_spans:
        return []
    tagsets = way_spans.get("tagsets") or []
    out = []
    for start, end, ref in way_spans.get("spans") or []:
        length = float(end) - float(start)
        if length <= 0:
            continue
        tags = tagsets[ref] if 0 <= ref < len(tagsets) else None
        out.append((length, tags))
    return out


def _base_highway(value):
    """primary_link rides on a primary; the link is not a safer road."""
    if not value:
        return None
    return value[:-5] if value.endswith("_link") else value


def _maxspeed_kmh(value):
    if not value:
        return None
    text = str(value).strip().lower()
    if text in ("none", "signals", "variable"):
        return None
    if text.startswith("walk"):
        return 10.0
    mph = "mph" in text
    digits = "".join(ch for ch in text if ch.isdigit() or ch == ".")
    if not digits:
        return None
    try:
        speed = float(digits)
    except ValueError:
        return None
    return speed * 1.609 if mph else speed


def surface_of(way_spans):
    """Length-weighted surface picture for one route.

    Every share is measured over the length that carries the tag it is about,
    and the share of the route that carried it rides alongside. A route where
    nobody tagged surface reports paved_share None, not 0.
    """
    spans = _spans(way_spans)
    if not spans:
        return None
    total = sum(length for length, _ in spans)
    if total <= 0:
        return None

    paved_m = unpaved_m = surface_known_m = 0.0
    free_m = highway_known_m = 0.0
    ladder = Counter()
    smooth_known_m = track_known_m = 0.0
    worst_smooth = worst_track = None
    trunk_m = 0.0

    for length, tags in spans:
        if not tags:
            continue
        surface = (tags.get("surface") or "").strip().lower()
        if surface in PAVED:
            paved_m += length
            surface_known_m += length
        elif surface in UNPAVED:
            unpaved_m += length
            surface_known_m += length

        highway = _base_highway((tags.get("highway") or "").strip().lower())
        if highway:
            highway_known_m += length
            cycleway = (tags.get("cycleway") or "").strip().lower()
            if highway in TRAFFIC_FREE_HIGHWAY or cycleway in SEGREGATED_CYCLEWAY:
                free_m += length
            if highway == "trunk":
                trunk_m += length

        smooth = (tags.get("smoothness") or "").strip().lower()
        if smooth in SMOOTHNESS:
            smooth_known_m += length
            ladder[smooth] += length
            if worst_smooth is None or SMOOTHNESS.index(smooth) > SMOOTHNESS.index(worst_smooth):
                worst_smooth = smooth
        track = (tags.get("tracktype") or "").strip().lower()
        if track in TRACKTYPE:
            track_known_m += length
            if worst_track is None or TRACKTYPE.index(track) > TRACKTYPE.index(worst_track):
                worst_track = track

    def share(part, base):
        return round(part / base, 4) if base > 0 else None

    return {
        "total_m": int(round(total)),
        "paved_share": share(paved_m, surface_known_m),
        "surface_known_share": share(surface_known_m, total),
        "traffic_free_share": share(free_m, highway_known_m),
        "highway_known_share": share(highway_known_m, total),
        "unpaved_m": int(round(unpaved_m)),
        "trunk_m": int(round(trunk_m)),
        "worst_smoothness": worst_smooth,
        "worst_tracktype": worst_track,
        "smoothness_known_share": share(smooth_known_m, total),
        "tracktype_known_share": share(track_known_m, total),
        "ladder": {k: int(round(v)) for k, v in ladder.most_common()},
        "bike": bike_type(worst_smooth, worst_track, share(paved_m, surface_known_m)),
    }


def bike_type(worst_smooth, worst_track, paved_share):
    """The bike the worst stretch demands, never the average stretch.

    A tour is declared for one bike and ridden on all of it, so the binding
    constraint is the worst surface it contains. That is what makes
    validate_cycling's surface_fit check meaningful rather than decorative.
    """
    if worst_track in ("grade4", "grade5"):
        return BIKE_MTB
    if worst_smooth in ("horrible", "very_horrible", "impassable"):
        return BIKE_MTB
    if worst_track in ("grade2", "grade3") or worst_smooth in ("intermediate",
                                                               "bad", "very_bad"):
        return BIKE_GRAVEL
    if paved_share is not None and paved_share < 0.5:
        return BIKE_GRAVEL
    return BIKE_TOURING


def safety_of(way_spans):
    """The house safety metric. See SAFETY in the module docstring."""
    spans = _spans(way_spans)
    if not spans:
        return None
    total = sum(length for length, _ in spans)
    weighted = known_m = 0.0
    worst_class, worst_penalty = None, -1.0
    parts = Counter()
    for length, tags in spans:
        if not tags:
            continue
        highway = _base_highway((tags.get("highway") or "").strip().lower())
        if highway is None or highway not in HIGHWAY_PENALTY:
            continue
        penalty = HIGHWAY_PENALTY[highway]
        speed = _maxspeed_kmh(tags.get("maxspeed"))
        if speed and speed > SPEED_FREE_KMH:
            penalty += min(SPEED_CAP, (speed - SPEED_FREE_KMH) * SPEED_PER_KMH)
        cycleway = (tags.get("cycleway") or "").strip().lower()
        if cycleway in SEGREGATED_CYCLEWAY or tags.get("segregated") == "yes":
            penalty = max(0.0, penalty - SEGREGATION_BONUS)
        penalty = min(WORST_PENALTY, penalty)
        weighted += penalty * length
        known_m += length
        parts[highway] += length
        if penalty > worst_penalty:
            worst_class, worst_penalty = highway, penalty
    if known_m <= 0:
        return None
    mean = weighted / known_m
    return {
        "score": round(max(0.0, WORST_PENALTY - mean), 2),
        "mean_penalty": round(mean, 3),
        "known_share": round(known_m / total, 4) if total else None,
        "worst_class": worst_class,
        "by_class_m": {k: int(round(v)) for k, v in parts.most_common(8)},
        "model": "carta_cycle_safety_v1",
    }


SPANS_FETCH = """
    SELECT id, way_spans FROM cycle_routes
    WHERE way_spans IS NOT NULL
      AND (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
      AND (%(refresh)s OR {col} IS NULL)
    ORDER BY id
"""


def _span_step(conn, countries, refresh, column, fn, verbose):
    with conn.cursor() as cur:
        cur.execute(SPANS_FETCH.format(col=column),
                    {"countries": list(countries) or None,
                     "refresh": bool(refresh)})
        rows = cur.fetchall()
    log(f"{column}: {len(rows)} route(s) to measure")
    done = Counter()
    with conn.cursor() as cur:
        for i, (rid, spans) in enumerate(rows, 1):
            value = fn(spans)
            done["measured" if value else "no_tags"] += 1
            cur.execute(f"UPDATE cycle_routes SET {column} = %s WHERE id = %s",
                        (Jsonb(value) if value else None, rid))
            if i % 2000 == 0:
                conn.commit()
    conn.commit()
    log(f"{column}: {done['measured']} measured, {done['no_tags']} with no "
        f"usable tags")
    return done


def step_surface(conn, countries, refresh, verbose):
    return _span_step(conn, countries, refresh, "surface", surface_of, verbose)


def step_safety(conn, countries, refresh, verbose):
    return _span_step(conn, countries, refresh, "safety", safety_of, verbose)


# ---------------------------------------------------------------------------
# Step: services
# ---------------------------------------------------------------------------
#
# Read out of the Geofabrik extracts rather than Overpass. The extracts are
# already on disk, an Overpass sweep of every hotel in Europe would time out
# on every cell, and the answer has to be complete rather than sampled: the
# overnight_real check refuses a stage end with fewer than three mapped beds,
# so a missing guest house is a tour that does not publish.
#
# Two scans per country, both KeyFilter driven so the filtering happens in
# C++: places (the names the stage planner speaks), and the amenities. Only
# what falls within CORRIDOR_KM of a cycle route is kept, using a coarse
# degree grid built from the country's route vertices, so a country's
# hinterland costs nothing.

import osmium  # noqa: E402  (kept next to the step that needs it)

CORRIDOR_KM = 2.0            # the brief's buffer for services along a route
TOWN_SNAP_KM = 3.0           # an amenity belongs to the place nearest it
GRID_DEG = 0.05              # about 5.5 km of latitude; the corridor sieve

SLEEP_TOURISM = {"hotel", "guest_house", "hostel", "chalet", "motel",
                 "apartment", "alpine_hut", "wilderness_hut"}
CAMP_TOURISM = {"camp_site", "caravan_site"}
GROCERY_SHOPS = {"supermarket", "convenience", "grocery", "bakery",
                 "greengrocer", "general"}
PLACE_RANK = {"city": 5, "town": 4, "village": 3, "suburb": 2, "hamlet": 1}


def _grid_key(lat, lon):
    return (int(math.floor(lat / GRID_DEG)), int(math.floor(lon / GRID_DEG)))


def _corridor_cells(conn, country):
    """Every grid cell within the corridor of a route in this country."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT ST_AsText(ST_Simplify(ST_Force2D(geom), 0.003))
               FROM cycle_routes WHERE country = %s AND distance_m >= 3000""",
            (country,))
        cells = set()
        pad = int(math.ceil(CORRIDOR_KM / (GRID_DEG * 111.0)))
        for (wkt,) in cur.fetchall():
            for lat, lon in _coords_of(wkt):
                r, c = _grid_key(lat, lon)
                for dr in range(-pad, pad + 1):
                    for dc in range(-pad, pad + 1):
                        cells.add((r + dr, c + dc))
    return cells


def _scan_places(pbf, cells):
    """Named settlements inside the corridor, the anchors towns are named by."""
    places = []
    fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
        .with_filter(osmium.filter.KeyFilter("place"))
    for node in fp:
        kind = node.tags.get("place")
        if kind not in PLACE_RANK:
            continue
        name = node.tags.get("name")
        if not name:
            continue
        loc = node.location
        if not loc.valid():
            continue
        if _grid_key(loc.lat, loc.lon) not in cells:
            continue
        places.append({"name": name, "kind": kind, "lat": loc.lat,
                       "lon": loc.lon, "rank": PLACE_RANK[kind],
                       "osm": f"n{node.id}"})
    return places


def _amenity_kind(tags):
    """Which service bucket an object falls in, or None."""
    tourism = tags.get("tourism")
    if tourism in SLEEP_TOURISM:
        return "sleep"
    if tourism in CAMP_TOURISM:
        return "campsite"
    if tags.get("shop") == "bicycle":
        return "bike_shop"
    if tags.get("amenity") == "bicycle_repair_station":
        return "repair"
    if tags.get("amenity") == "drinking_water":
        return "water"
    if tags.get("shop") in GROCERY_SHOPS:
        return "grocery"
    if tags.get("railway") in ("station", "halt"):
        # A bail-out is a train that will take you and your bicycle home, so
        # the tag alone is not enough. OSM puts railway=station on heritage
        # lines, zoo miniatures and funiculars, and the first Chilterns tour
        # composed here offered "Whipsnade Central" as the escape from
        # Dunstable, which is a 15 inch gauge line inside a zoo. Excluding
        # these is the difference between a bail-out and a day out.
        if tags.get("disused") == "yes" or tags.get("abandoned") == "yes":
            return None
        if tags.get("railway:traffic_mode") == "freight":
            return None
        if tags.get("station") in ("miniature", "subway", "light_rail",
                                   "monorail", "funicular"):
            return None
        if tags.get("narrow_gauge") == "yes" or tags.get("usage") == "tourism":
            return None
        return "station"
    return None


def _scan_amenities(pbf, cells):
    """Every service object inside the corridor, as (kind, lat, lon, name).

    Three passes rather than a location cache. with_locations() would need
    every node in the extract held in memory to give a way its geometry, and
    for Great Britain that is gigabytes to answer "roughly where is this
    hotel". Instead the way pass keeps only each way's FIRST node reference,
    and a third pass resolves just those references with an IdFilter, which
    is the same trick harvest_cycling.py uses to assemble route geometry
    inside 4 GB extracts. A building's first corner is well within the 2 km
    corridor and the 3 km town snap, so nothing is lost but the memory.
    """
    out = []
    keys = ("tourism", "shop", "amenity", "railway")
    # Nodes: one pass per key, because KeyFilter takes one key and a single
    # unfiltered node pass over a country extract is minutes of nothing.
    for key in keys:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
            .with_filter(osmium.filter.KeyFilter(key))
        for node in fp:
            kind = _amenity_kind(node.tags)
            if not kind:
                continue
            loc = node.location
            if not loc.valid() or _grid_key(loc.lat, loc.lon) not in cells:
                continue
            out.append((kind, loc.lat, loc.lon, node.tags.get("name")))

    # Ways: hotels, campsites and stations are very often mapped as outlines.
    pending = []
    for key in ("tourism", "shop", "amenity", "railway"):
        fp = osmium.FileProcessor(str(pbf), osmium.osm.WAY) \
            .with_filter(osmium.filter.KeyFilter(key))
        for way in fp:
            kind = _amenity_kind(way.tags)
            if not kind or len(way.nodes) < 1:
                continue
            pending.append((kind, way.nodes[0].ref, way.tags.get("name")))
    if not pending:
        return out

    wanted = np.unique(np.fromiter((ref for _k, ref, _n in pending),
                                   dtype=np.int64, count=len(pending)))
    coords = {}
    fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
        .with_filter(osmium.filter.IdFilter(wanted))
    for node in fp:
        loc = node.location
        if loc.valid():
            coords[node.id] = (loc.lat, loc.lon)
    for kind, ref, name in pending:
        got = coords.get(ref)
        if not got or _grid_key(got[0], got[1]) not in cells:
            continue
        out.append((kind, got[0], got[1], name))
    return out


def _haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p)
         * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(max(0.0, a)))


SERVICE_UPSERT = """
    INSERT INTO cycle_services
        (country, name, geom, sleep_n, campsite_n, bike_shop_n, repair_n,
         water_n, grocery_n, station_n, station_name, score, osm_refs)
    VALUES (%(country)s, %(name)s,
            ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
            %(sleep)s, %(campsite)s, %(bike_shop)s, %(repair)s, %(water)s,
            %(grocery)s, %(station)s, %(station_name)s, %(score)s, %(refs)s)
    ON CONFLICT (country, name, geom) DO UPDATE SET
        sleep_n = EXCLUDED.sleep_n, campsite_n = EXCLUDED.campsite_n,
        bike_shop_n = EXCLUDED.bike_shop_n, repair_n = EXCLUDED.repair_n,
        water_n = EXCLUDED.water_n, grocery_n = EXCLUDED.grocery_n,
        station_n = EXCLUDED.station_n, station_name = EXCLUDED.station_name,
        score = EXCLUDED.score, osm_refs = EXCLUDED.osm_refs
"""


def service_score(town):
    """How good a place is to end a day, 0..1.

    The weights say what a rider actually needs at six in the evening: a bed
    first and by a long way, then food, then the things that rescue a bad
    day (a bike shop, a train home). Water is nearly free to find and so
    counts least.
    """
    beds = min(1.0, (town["sleep"] + 0.5 * town["campsite"]) / 6.0)
    food = min(1.0, town["grocery"] / 3.0)
    bike = min(1.0, (town["bike_shop"] + 0.5 * town["repair"]) / 2.0)
    rail = 1.0 if town["station"] else 0.0
    water = min(1.0, town["water"] / 2.0)
    return round(0.50 * beds + 0.20 * food + 0.14 * bike + 0.11 * rail
                 + 0.05 * water, 4)


def step_services(conn, countries, refresh, verbose):
    """Cluster corridor amenities onto named places and store service towns."""
    slug_of = {v: k for k, v in S.countries().items()}
    todo = sorted(countries) if countries else sorted(slug_of)
    done = Counter()
    for cc in todo:
        slug = slug_of.get(cc)
        if not slug:
            continue
        pbf = S.cached_extract(slug)
        if pbf is None:
            log(f"services [{cc}]: no cached extract, skipped")
            done["no_extract"] += 1
            continue
        cells = _corridor_cells(conn, cc)
        if not cells:
            done["no_routes"] += 1
            continue
        t0 = time.time()
        places = _scan_places(pbf, cells)
        amenities = _scan_amenities(pbf, cells)
        log(f"services [{cc}]: {len(cells)} corridor cells, {len(places)} "
            f"places, {len(amenities)} amenities ({time.time() - t0:.0f}s)")
        if not places:
            done["no_places"] += 1
            continue

        by_cell = defaultdict(list)
        for idx, p in enumerate(places):
            by_cell[_grid_key(p["lat"], p["lon"])].append(idx)
        towns = {i: {"sleep": 0, "campsite": 0, "bike_shop": 0, "repair": 0,
                     "water": 0, "grocery": 0, "station": 0,
                     "station_name": None}
                 for i in range(len(places))}
        pad = int(math.ceil(TOWN_SNAP_KM / (GRID_DEG * 111.0)))
        for kind, lat, lon, name in amenities:
            r, c = _grid_key(lat, lon)
            best, best_km = None, TOWN_SNAP_KM
            for dr in range(-pad, pad + 1):
                for dc in range(-pad, pad + 1):
                    for idx in by_cell.get((r + dr, c + dc), ()):
                        p = places[idx]
                        km = _haversine_km(lat, lon, p["lat"], p["lon"])
                        # A city pulls from further out than a hamlet: its
                        # hotels are genuinely its own.
                        reach = TOWN_SNAP_KM * (1 + 0.25 * (p["rank"] - 1))
                        if km <= reach and km < best_km:
                            best, best_km = idx, km
            if best is None:
                continue
            towns[best][kind] += 1
            if kind == "station" and name and not towns[best]["station_name"]:
                towns[best]["station_name"] = name

        written = 0
        with conn.cursor() as cur:
            for idx, counts in towns.items():
                if not (counts["sleep"] or counts["campsite"]):
                    continue        # not somewhere a day can end
                p = places[idx]
                cur.execute(SERVICE_UPSERT, {
                    "country": cc, "name": p["name"], "lat": p["lat"],
                    "lon": p["lon"], "sleep": counts["sleep"],
                    "campsite": counts["campsite"],
                    "bike_shop": counts["bike_shop"],
                    "repair": counts["repair"], "water": counts["water"],
                    "grocery": counts["grocery"], "station": counts["station"],
                    "station_name": counts["station_name"],
                    "score": service_score(counts),
                    "refs": Jsonb({"place": p["osm"], "kind": p["kind"]}),
                })
                written += 1
        conn.commit()
        done["towns"] += written
        log(f"services [{cc}]: {written} service town(s) stored")
    log(f"services: {done['towns']} town(s) across {len(todo)} country(ies)")
    done += attach_all_services(conn, countries, verbose)
    return done


def step_routeservices(conn, countries, refresh, verbose):
    """Only the join: which stored service towns each route can reach.

    Its own step because the extract sweep above takes minutes and this takes
    longer, and re-running the pair together to redo one of them is how an
    afternoon goes.
    """
    return attach_all_services(conn, countries, verbose)


# The service towns each route can actually reach, stored on the route so the
# stage planner never re-runs a spatial join per candidate tour.
# Two decisions here, both paid for in measurement.
#
# SIMPLIFIED before the merge. A town's position along the route feeds a stage
# cut whose own band is plus or minus twelve kilometres, and its distance off
# the line is tested against an eight kilometre reach. Fifteen metres is two
# orders of magnitude finer than either question.
SERVICE_SIMPLIFY_DEG = 0.00015

# PLANAR, in EPSG:3035, not geography. The first version of this join asked
# ST_DWithin in geography, which cannot use a geometry index and casts the
# whole route line once per candidate town: a 921 km route with 25,258
# vertices took 49.9 seconds on its own, so Great Britain alone would have
# been most of a day. In 3035 the same join is planar, cycle_services carries
# a stored geom_3035 with its own GIST index, and the error over an 8 km
# radius anywhere in Europe is far inside the tolerance of "can a rider get
# there at the end of a day".
SERVICE_CRS = 3035

ROUTE_SERVICES_SQL = """
    -- MATERIALIZED is not decoration. Postgres inlines a non-recursive CTE by
    -- default, and an inlined `r` means the simplify, the line merge and the
    -- reprojection of a 25,000 vertex route are recomputed once per candidate
    -- town. That is the difference between this query taking a second and
    -- taking two minutes, and it is invisible until you EXPLAIN it.
    WITH r AS MATERIALIZED (
        SELECT ST_Transform(
                   ST_LineMerge(ST_Simplify(
                       ST_Force2D(coalesce(cr.geom, c.geom)), %(simp)s)),
                   3035) AS geom
        FROM cycle_routes c
        LEFT JOIN cycle_repairs cr
               ON cr.route_id = c.id AND cr.repaired
              AND cr.repair_info->>'source_geom_md5'
                  = md5(ST_AsBinary(ST_Force2D(c.geom)))
        WHERE c.id = %(id)s
    )
    SELECT s.name, s.sleep_n, s.campsite_n, s.bike_shop_n, s.repair_n,
           s.water_n, s.grocery_n, s.station_n, s.station_name, s.score,
           ST_Y(s.geom), ST_X(s.geom),
           CASE WHEN GeometryType(r.geom) = 'LINESTRING'
                THEN ST_LineLocatePoint(r.geom, s.geom_3035) END AS frac,
           ST_Distance(s.geom_3035, r.geom) AS off_m,
           ST_Length(r.geom) AS len_m
    FROM r, cycle_services s
    WHERE s.country = %(cc)s
      AND ST_DWithin(s.geom_3035, r.geom, %(reach_m)s)
    ORDER BY frac NULLS LAST
"""

# How far off the line a service town may sit and still be the end of a day.
# The brief's number, and it is generous on purpose: 8 km is half an hour's
# detour at the end of a stage, and refusing it would strand tours in
# countries where the route deliberately avoids the towns.
SERVICE_REACH_M = 8_000


def attach_services(conn, route_id, country):
    """The ordered service towns along one route, with position along it.

    `at` is the fraction along the merged line and `at_m` the metres, which
    is what the stage planner cuts on. A route whose parts do not merge into
    one LineString has no position to give, so its towns come back without
    one and the tour composer refuses it: a stage boundary on a discontinuous
    route is not a place, it is an index.
    """
    with conn.cursor() as cur:
        cur.execute(ROUTE_SERVICES_SQL, {"id": route_id, "cc": country,
                                         "reach_m": SERVICE_REACH_M,
                                         "simp": SERVICE_SIMPLIFY_DEG})
        out = []
        for row in cur.fetchall():
            (name, sleep, camp, shop, repair, water, grocery, station,
             station_name, score, lat, lon, frac, off_m, len_m) = row
            town = {
                "name": name, "lat": round(float(lat), 5),
                "lon": round(float(lon), 5),
                "sleep": sleep, "camp": camp, "shop": shop, "repair": repair,
                "water": water, "grocery": grocery, "station": station,
                "station_name": station_name, "score": float(score or 0),
                "off_m": int(round(float(off_m or 0))),
            }
            if frac is not None:
                town["at"] = round(float(frac), 6)
                town["at_m"] = int(round(float(frac) * float(len_m or 0)))
            out.append(town)
    return out


ATTACH_FETCH = """
    SELECT id, country FROM cycle_routes
    WHERE (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
      AND distance_m >= 3000
    ORDER BY id
"""


def attach_all_services(conn, countries, verbose=False):
    """Store each route's reachable service towns, so the stage planner never
    re-runs a spatial join per candidate tour."""
    with conn.cursor() as cur:
        cur.execute(ATTACH_FETCH, {"countries": list(countries) or None})
        rows = cur.fetchall()
    done = Counter()
    with conn.cursor() as cur:
        for i, (rid, cc) in enumerate(rows, 1):
            towns = attach_services(conn, rid, cc)
            done["with_towns" if towns else "no_towns"] += 1
            done["placed"] += sum(1 for t in towns if "at_m" in t)
            cur.execute("UPDATE cycle_routes SET services = %s WHERE id = %s",
                        (Jsonb(towns), rid))
            if i % 500 == 0:
                conn.commit()
                log(f"  services attached {i}/{len(rows)}")
    conn.commit()
    log(f"services: {done['with_towns']} route(s) reach a service town, "
        f"{done['no_towns']} reach none, {done['placed']} town positions "
        f"measured along a continuous line")
    return done


# ---------------------------------------------------------------------------
# Step: near, the cross-layer join
# ---------------------------------------------------------------------------
#
# Brief 08 specifies this once for all five existing layers at export time.
# Cycling is designed to consume it from day one (master spec section 5), so
# rather than wait, this reads the already-published wires of the other
# layers and writes neighbour ids onto each route. It costs one pass and
# nothing at runtime, and it is what lets a stage that ends near a published
# lake say so.
#
# Read direction matters: this only ever READS the other layers' wire. It
# never writes into them, so brief 08 can replace this with the shared pass
# without anything here having to be undone.

NEAR_KM = 5.0
NEAR_MAX_PER_LAYER = 8

OTHER_LAYERS = {
    "beach": ("beaches", "beaches"),
    "lake": ("lakes", "lakes"),
    "peak": ("mountains", "mountains"),
    "trail": ("trails", "trips"),
}


def _load_other_layer(folder, key, cc):
    """One country's published rows of another layer, as (id, lat, lon)."""
    path = ROOT / "continent-app" / "public" / folder / f"{cc}.json"
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return []
    out = []
    for row in (data.get(key) or []):
        rid = row.get("id") or row.get("slug")
        lat, lon = row.get("lat"), row.get("lon")
        if lat is None and row.get("bbox") and len(row["bbox"]) == 4:
            bbox = row["bbox"]
            lat, lon = (bbox[1] + bbox[3]) / 2.0, (bbox[0] + bbox[2]) / 2.0
        if rid is None or lat is None or lon is None:
            continue
        out.append((rid, float(lat), float(lon)))
    return out


NEAR_FETCH = """
    SELECT id, country, ST_AsText(ST_Simplify(ST_Force2D(geom), 0.004))
    FROM cycle_routes
    WHERE (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
      AND distance_m >= 3000
      AND (%(refresh)s OR near IS NULL)
    ORDER BY country, id
"""


def step_near(conn, countries, refresh, verbose):
    """Which of our own published places each route runs past."""
    with conn.cursor() as cur:
        cur.execute(NEAR_FETCH, {"countries": list(countries) or None,
                                 "refresh": bool(refresh)})
        rows = cur.fetchall()
    log(f"near: {len(rows)} route(s) to join against the other layers")

    by_country = defaultdict(list)
    for rid, cc, wkt in rows:
        by_country[cc].append((rid, wkt))

    done = Counter()
    with conn.cursor() as cur:
        for cc, group in sorted(by_country.items()):
            others = {layer: _load_other_layer(folder, key, cc)
                      for layer, (folder, key) in OTHER_LAYERS.items()}
            have = {k: len(v) for k, v in others.items() if v}
            if not have:
                done["country_without_layers"] += 1
            # A degree grid over the other layers' rows, so a 900 km route is
            # not a full scan of every beach in the country per vertex.
            grids = {}
            for layer, items in others.items():
                grid = defaultdict(list)
                for rid, lat, lon in items:
                    grid[_grid_key(lat, lon)].append((rid, lat, lon))
                grids[layer] = grid
            pad = int(math.ceil(NEAR_KM / (GRID_DEG * 111.0)))
            for rid, wkt in group:
                coords = _coords_of(wkt)
                found = {}
                for layer, grid in grids.items():
                    if not grid:
                        continue
                    hits = {}
                    for lat, lon in coords:
                        r, c = _grid_key(lat, lon)
                        for dr in range(-pad, pad + 1):
                            for dc in range(-pad, pad + 1):
                                for oid, olat, olon in grid.get((r + dr, c + dc), ()):
                                    if oid in hits:
                                        continue
                                    km = _haversine_km(lat, lon, olat, olon)
                                    if km <= NEAR_KM:
                                        hits[oid] = round(km, 2)
                    if hits:
                        best = sorted(hits.items(), key=lambda kv: kv[1])
                        found[layer] = [k for k, _ in best[:NEAR_MAX_PER_LAYER]]
                cur.execute("UPDATE cycle_routes SET near = %s WHERE id = %s",
                            (Jsonb(found), rid))
                done["joined" if found else "nothing_near"] += 1
            conn.commit()
            log(f"near [{cc}]: layers available {have or 'none'}")
    conn.commit()
    log(f"near: {done['joined']} route(s) run past one of our own places, "
        f"{done['nothing_near']} past none")
    return done


# ---------------------------------------------------------------------------
# Step: scenic
# ---------------------------------------------------------------------------
#
# Five components. Every one is a claim a reader could check on a map, which
# is the same discipline the trail rating holds itself to, and none of them is
# anybody's opinion because no opinion is legally available to us.
#
#   protected    share of the line inside a Natura 2000 or Emerald site.
#                Emerald matters as much as Natura here: the Cairngorms, the
#                Norwegian fjords and the Swiss passes are all outside the EU
#                designation and would otherwise score zero.
#   views        named summits, viewpoints, waterfalls, lakes, gorges and
#                castles within 500 m of the line, per kilometre, out of the
#                scenic_pois sweep the trails layer already did across Europe.
#   coast        proximity to the EEA coastline, decaying with distance.
#   catalogue    published beaches, lakes, peaks and trails of our own within
#                5 km. A route past our own best places is scenic by the
#                catalogue's own judgement (brief 08).
#   quiet        the inverse of the safety penalty. Traffic is the single
#                largest thing that makes a beautiful road unpleasant.
#
# A component with no reading drops out and the rest renormalise. Never a
# zero nobody earned.

# `land` is the brief's "forest/water fraction", measured from OSM land cover
# rather than from WorldCover, and it takes the largest weight because it is
# the only component that says what the ride LOOKS like. Everything else says
# what is near it, how protected it is, or how busy the road is.
#
# The weights it took from: `views` gave up 0.06 because a per-kilometre count
# of named features tracks OSM naming density, which follows population, and
# `protected` gave up 0.04 because designation and land cover are correlated
# and paying both fully counts one landscape twice.
SCENIC_WEIGHTS = {
    "land": 0.24,
    "protected": 0.22,
    "views": 0.18,
    "coast": 0.14,
    "catalogue": 0.10,
    "quiet": 0.12,
}
SCENIC_MODEL = "cycle_scenic_v4"   # v2: protected over a 1 km corridor;
                                   # v3: catalogue never scores an absence;
                                   # v4: land cover, the brief's missing input

VIEW_KINDS = ("peak", "volcano", "viewpoint", "waterfall", "lake", "gorge",
              "castle", "monastery", "glacier", "arch", "lighthouse", "cave",
              "ruins", "hot_spring", "beach")
VIEW_M = 500                 # the brief's radius for viewpoint density
RICH_VIEWS_PER_KM = 0.9      # the density that scores 1.0
COAST_DECAY_KM = 12.0        # a route 12 km inland gets about a third
CATALOGUE_KM = 5.0

# Everything below is measured PLANAR in EPSG:3035, with an index-usable
# degree prefilter in front of it, for the reason the service join documents:
# a geography ST_DWithin cannot use a geometry index, so the alternative is a
# full scan of 972,000 scenic points per route with a geography cast each.
#
# The prefilter radius is in degrees and is deliberately generous. 0.02
# degrees of longitude is 760 m at 70 north, still comfortably outside the
# 500 m the exact test then applies, so nothing is lost at the top of Norway
# where a fixed degree radius is at its tightest.
VIEW_PREFILTER_DEG = 0.02
COAST_PREFILTER_DEG = 1.2

# How close to a protected site counts as riding through protected landscape.
#
# Measured, not chosen. Strict containment (the line INSIDE the polygon) gave
# a median of 0.0000 across 1,941 British routes and left 87 percent of them
# under 0.02, while carrying the largest weight in the composite: a component
# that is zero for seven routes in eight is not a signal, it is a constant
# suppressing every score.
#
# The reason is specific to ROADS rather than to the data. Designated site
# boundaries routinely exclude the carriageway itself, so a road threading the
# Cairngorms sits in a corridor between designations and reads as unprotected.
# A trail does not have that problem, which is why the trails layer never hit
# it. On the same fourteen Scottish routes a 1 km corridor separates 0.15 from
# 1.00 where strict overlap separated 0.005 from 0.23.
#
# This changes the reading for every route in Europe identically. It is a
# correction to how the question is asked, not a thumb on any region's scale,
# and the model version below is bumped because of it.
PROTECTED_CORRIDOR_M = 1000

PROTECTED_SQL = """
    WITH r AS MATERIALIZED (
        SELECT ST_Transform(ST_Simplify(ST_Force2D(geom), 0.0002), 3035) AS g
        FROM cycle_routes WHERE id = %(id)s
    ), near AS (
        -- ST_Union before the intersection, not after. Adjacent designations
        -- overlap once buffered, and summing their intersections separately
        -- double counts the shared stretch and reports shares above 1.0.
        SELECT ST_Union(ST_Buffer(p.geom_3035, %(corridor)s)) AS g
        FROM r, cycle_protected p
        WHERE p.geom_3035 IS NOT NULL
          AND p.geom_3035 && ST_Expand(r.g, %(corridor)s)
          AND ST_DWithin(p.geom_3035, r.g, %(corridor)s)
    )
    SELECT coalesce(ST_Length(ST_Intersection(r.g, near.g)), 0)
    FROM r LEFT JOIN near ON true
"""

VIEWS_SQL = """
    WITH r AS MATERIALIZED (
        SELECT ST_Transform(ST_Simplify(ST_Force2D(geom), 0.0002), 3035) AS g,
               ST_Simplify(ST_Force2D(geom), 0.0002) AS g4326
        FROM cycle_routes WHERE id = %(id)s
    )
    SELECT count(*) FROM r, scenic_pois s
    WHERE s.kind = ANY(%(kinds)s)
      AND ST_DWithin(s.geom, r.g4326, %(pad)s)
      AND ST_DWithin(ST_Transform(s.geom, 3035), r.g, %(m)s)
"""


def _coast_km(conn, route_id):
    """Distance from the route to the nearest coastline vertex, in km.

    Read from the region spine's own coast layer once it has been mirrored
    into the lab; without it the component is simply absent.
    """
    with conn.cursor() as cur:
        cur.execute("""SELECT CASE
                         WHEN to_regclass('public.region_coast') IS NULL
                           THEN false
                         ELSE EXISTS (SELECT 1 FROM region_coast LIMIT 1)
                       END""")
        if not cur.fetchone()[0]:
            return None
        # KNN first, exact second. The <-> operator walks the GIST index and
        # returns the nearest stretch in log time; measuring the distance to
        # every coastal stretch within 60 km in geography, which is what this
        # did first, is 2,666 geography casts of a whole route line per route.
        cur.execute("""
            WITH r AS MATERIALIZED (
                SELECT ST_Simplify(ST_Force2D(geom), 0.0002) AS g4326,
                       ST_Transform(ST_Simplify(ST_Force2D(geom), 0.0002),
                                    3035) AS g
                FROM cycle_routes WHERE id = %(id)s
            ), near AS (
                SELECT c.geom
                FROM r, region_coast c
                WHERE c.geom && ST_Expand(r.g4326, %(pad)s)
                ORDER BY c.geom <-> r.g4326
                LIMIT 4
            )
            SELECT min(ST_Distance(ST_Transform(near.geom, 3035), r.g)) / 1000.0
            FROM r, near""",
            {"id": route_id, "pad": COAST_PREFILTER_DEG})
        got = cur.fetchone()
    return float(got[0]) if got and got[0] is not None else None


# The catalogue component: which of our own published places a route runs
# past. It can ADD to a scenic score and it can never subtract, and that
# asymmetry is the whole design.
#
# WHY, in three measured steps, because the obvious fixes are both wrong.
#
# 1. Counting hits and scoring the rest zero reads OUR BACKLOG as scenery. A
#    cross-layer join turns coverage into quality the moment coverage is
#    uneven: Great Britain publishes 4 lakes and 22 summits, all in the
#    populated half, so every Highland route scored this near zero, ranked
#    lower, published less, and looked thinner still to the next join. The
#    Highlands are not short of lochs, they are short of PUBLISHED lochs,
#    which is a statement about this pipeline and not about Scotland.
#
# 2. So read coverage.json and count only regions the audit calls `ok`,
#    excluding `na` (the layer does not apply) and `thin`/`empty` (the
#    backlog has not arrived). Implemented, measured, REJECTED: it made the
#    Highlands worse, 5.2 against the central belt's 5.8 where they had tied.
#    `ok` means "met its quota", not "densely enumerated": Highlands and
#    Islands is `ok` for mountains with NINE published summits across a
#    region the size of Belgium. A 200 km route can pass none of them and
#    that says nothing at all about the route.
#
# 3. Which leaves the reading that was always the honest one. For a LINEAR
#    feature, no region-level status is fine-grained enough to license
#    "absence is evidence". A zero here is a zero nobody earned, so it is not
#    a reading: the component drops and the remaining scenic weights
#    renormalise, exactly as every other absent component in this layer does.
#
# The residual bias is real and worth stating: this component can only raise
# a score, so a route with catalogue evidence is advantaged over one without
# rather than the other way round. That is the correct direction for a bonus
# signal built on an admittedly incomplete catalogue, and it is why the
# weight is 0.16 rather than anything larger.
CATALOGUE_SATURATES_AT = 6


def catalogue_hits(near):
    """Our own published places near this route, or None when there are none.

    None, not zero. See the note above: absence is not a reading here.
    """
    hits = sum(len(v or []) for v in (near or {}).values())
    return hits if hits > 0 else None


_LC = None


def _landcover():
    """landcover.py, loaded once. Kept lazy so a lab without the table, or a
    country whose extraction has not run, costs an import rather than a
    failure."""
    global _LC
    if _LC is None:
        import landcover as _mod
        _LC = _mod
    return _LC


def scenic_of(conn, route_id, row):
    """The composite, plus the parts, plus which components were missing."""
    length_km = max(0.5, (row.get("distance_m") or 0) / 1000.0)
    parts, missing, detail = {}, [], {}

    with conn.cursor() as cur:
        # An EMPTY table is not a reading of zero. cycle_protected is created
        # by the reference loader before it downloads anything, so testing
        # only that the relation exists would have given every route in Europe
        # a protected share of 0.0 the moment the EEA service was unreachable,
        # which is precisely the zero nobody earned that invariant 6 forbids.
        cur.execute("""SELECT CASE
                         WHEN to_regclass('public.cycle_protected') IS NULL
                           THEN false
                         ELSE EXISTS (SELECT 1 FROM cycle_protected LIMIT 1)
                       END""")
        has_protected = cur.fetchone()[0]
    if has_protected:
        # GEOS still throws a side-location conflict on a handful of EEA site
        # rings even after ST_MakeValid, and one bad polygon must not end a
        # country pass. A route whose protection could not be computed has no
        # reading for it, which is the same answer as no data: the component
        # drops and the rest renormalise.
        try:
            with conn.cursor() as cur:
                cur.execute(PROTECTED_SQL, {"id": route_id,
                                            "corridor": PROTECTED_CORRIDOR_M})
                inside_m = float(cur.fetchone()[0] or 0)
            share = min(1.0, inside_m / max(1.0, row.get("distance_m") or 1))
        # min() is a guard, not the answer: the corridor union cannot exceed
        # the route length once the buffers are unioned, so a clamp firing
        # here means the geometry disagrees with the stored distance.
            parts["protected"] = round(share, 4)
        except Exception as exc:                       # noqa: BLE001
            conn.rollback()
            missing.append("protected")
            if str(exc).startswith("GEOS"):
                log(f"  route {route_id}: protected geometry unusable "
                    f"({type(exc).__name__}), component dropped")
    else:
        missing.append("protected")

    with conn.cursor() as cur:
        cur.execute(VIEWS_SQL, {"id": route_id, "kinds": list(VIEW_KINDS),
                                "m": VIEW_M, "pad": VIEW_PREFILTER_DEG})
        n_views = int(cur.fetchone()[0] or 0)
    parts["views"] = round(min(1.0, (n_views / length_km) / RICH_VIEWS_PER_KM), 4)

    coast = _coast_km(conn, route_id)
    if coast is None:
        missing.append("coast")
    else:
        parts["coast"] = round(math.exp(-coast / COAST_DECAY_KM), 4)

    hits = catalogue_hits(row.get("near"))
    if hits is None:
        missing.append("catalogue")
    else:
        parts["catalogue"] = round(min(1.0, hits / CATALOGUE_SATURATES_AT), 4)

    # Land cover: the brief's forest/water fraction. Absent until
    # landcover.py has run for the country, and absent for a route whose
    # corridor OSM has barely tagged, because an unmapped corridor is not a
    # built-up one. Same discipline as surface and safety.
    land = None
    try:
        land = _landcover().measure_one(conn, route_id, row.get("country"))
    except Exception:                                  # noqa: BLE001
        conn.rollback()
        land = None
    if land is None:
        missing.append("land")
    else:
        parts["land"] = land["natural"]
        detail["land"] = land

    safety = row.get("safety") or {}
    if safety.get("score") is None:
        missing.append("quiet")
    else:
        parts["quiet"] = round(float(safety["score"]) / 10.0, 4)

    live = {k: v for k, v in SCENIC_WEIGHTS.items() if k in parts}
    total_w = sum(live.values())
    if total_w <= 0:
        return None
    score = sum(parts[k] * w for k, w in live.items()) / total_w
    return {
        "score": round(score * 10, 3),
        "parts": parts,
        "n_views": n_views,
        "views_per_km": round(n_views / length_km, 3),
        "missing": missing,
        "weights": {k: round(w / total_w, 4) for k, w in live.items()},
        # The land-cover breakdown travels with the score, because "0.24
        # natural" is not a claim a reader can check and "22% wild, 4% water,
        # 14% farm, 17% built, over half the corridor tagged" is.
        "detail": detail,
        "model": SCENIC_MODEL,
    }


SCENIC_FETCH = """
    SELECT id, country, distance_m, near, safety, regions
    FROM cycle_routes
    WHERE (%(countries)s::text[] IS NULL OR country = ANY(%(countries)s))
      AND distance_m >= 3000
      AND (%(refresh)s OR scenic IS NULL)
    ORDER BY id
"""


def step_scenic(conn, countries, refresh, verbose):
    with conn.cursor() as cur:
        cur.execute(SCENIC_FETCH, {"countries": list(countries) or None,
                                   "refresh": bool(refresh)})
        cols = ("id", "country", "distance_m", "near", "safety", "regions")
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    log(f"scenic: {len(rows)} route(s) to score")
    done = Counter()
    missing = Counter()
    with conn.cursor() as cur:
        for i, row in enumerate(rows, 1):
            value = scenic_of(conn, row["id"], row)
            if value:
                done["scored"] += 1
                for m in value["missing"]:
                    missing[m] += 1
            else:
                done["no_components"] += 1
            cur.execute("UPDATE cycle_routes SET scenic = %s WHERE id = %s",
                        (Jsonb(value) if value else None, row["id"]))
            if i % 500 == 0:
                conn.commit()
                log(f"  scenic {i}/{len(rows)}")
    conn.commit()
    log(f"scenic: {done['scored']} scored, {done['no_components']} with "
        f"nothing measurable")
    if missing:
        log("scenic components absent (dropped and renormalised): "
            + ", ".join(f"{k}={v}" for k, v in missing.most_common()))
    return done


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

RUNNERS = {
    "regions": step_regions,
    "elevation": step_elevation,
    "surface": step_surface,
    "safety": step_safety,
    "services": step_services,
    "routeservices": step_routeservices,
    "near": step_near,
    "scenic": step_scenic,
}


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--steps", default=",".join(STEPS),
                    help=f"comma separated subset of {','.join(STEPS)}")
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--refresh", action="store_true",
                    help="recompute even where a value is already stored")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    unknown = [s for s in steps if s not in RUNNERS]
    if unknown:
        ap.error(f"unknown steps: {', '.join(unknown)}")
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])

    with connect() as conn:
        for step in steps:
            t0 = time.time()
            fn = RUNNERS[step]
            if step == "elevation":
                fn(conn, countries, args.refresh, args.verbose, args.limit)
            else:
                fn(conn, countries, args.refresh, args.verbose)
            log(f"{step}: {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
