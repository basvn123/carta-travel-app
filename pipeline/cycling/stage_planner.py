"""Compose multi-day cycling tours over published routes. The differentiator.

No incumbent auto-splits a route into days. Komoot's multi-day planner is
explicitly manual: you pick the number of days and drag the endpoints, and
"add accommodation" is what sets a boundary. Ride with GPS is the same. This
file is the reason to build the layer at all, and the reason it can be
trusted is that it follows the trips layer's discipline exactly:

    NOTHING IS GENERATED AT REQUEST TIME.

Tours are composed here, validated by ten hard checks in
validate_cycling.py, and published as wire. A tour that fails one check is
not published and the previous wire stands.

The failure mode this exists to prevent is cycling's own version of the
plausible itinerary: a 140 km day with 2,400 m of climbing that ends in a
hamlet with no bed, on a track that is grade-5 sand. Every one of those four
claims is checked against a measurement here.

THE SPLIT

  1. Walk cumulative distance and SMOOTHED ascent along the route. The
     ascent curve comes from the stored elevation profile, rescaled so its
     total equals the route's measured ascent: the profile says where the
     climbing is, the full-resolution sampling says how much of it there is.
     Summing raw 30 m DEM differences here instead would put two thousand
     fake metres on a canal towpath, which is the whole reason the trails
     smoothing exists.
  2. Cut when either budget is reached, whichever binds first. On the Rhine
     that is always distance; in the Cairngorms it is usually ascent.
  3. SNAP THE CUT TO A SERVICE TOWN. Never an arbitrary GPS point. The
     candidates are the towns within 8 km of the line whose position falls
     inside the pace band, scored by beds, bike shop, water, station and
     grocery. The best one wins, and a tie goes to the one nearest the
     ideal day length.
  4. If no service town is in reach, extend or shorten the stage rather
     than inventing one. If neither works, the tour does not publish.

    pace       km/day     ascent/day   what it is
    relaxed    45 to 65   <= 600 m     a holiday
    balanced   65 to 95   <= 1000 m    the default
    strong     95 to 130  <= 1600 m    a rider who trains

WHAT COMPOSES. Routes over 120 km on their own, plus chains of routes whose
endpoints actually meet on the ground (within CHAIN_JOIN_M), which is what
lets a Scottish west-coast run use more than one NCN number. A chain is only
proposed when the join is geometric, never when two routes merely share a
region: "these are both in the Highlands" is not a plan.

Usage, from the repo root (DB up: cd tools/trailslab && docker compose up -d):
    python pipeline/cycling/stage_planner.py --countries GB
    python pipeline/cycling/stage_planner.py --countries GB --dry-run --verbose
    python pipeline/cycling/stage_planner.py --route 12345 --pace balanced
"""

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import enrich_cycling as E  # noqa: E402
import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

MODEL_VERSION = "cycle_tour_v1"

# The pace table, straight from the brief.
PACES = {
    "relaxed": {"km_lo": 45, "km_hi": 65, "ascent_cap": 600},
    "balanced": {"km_lo": 65, "km_hi": 95, "ascent_cap": 1000},
    "strong": {"km_lo": 95, "km_hi": 130, "ascent_cap": 1600},
}

# A route shorter than this is a day out, not a tour.
MIN_TOUR_M = 120_000
# And longer than this is a continental corridor. EuroVelo 6 end to end is
# not an itinerary anybody rides as one product; its country sections are.
MAX_TOUR_M = 1_200_000
MIN_STAGES = 3
MAX_STAGES = 14

# How far a stage may run past the pace band before the split gives up. A
# town 8 percent beyond the ideal is a longer day; one 40 percent beyond is
# a different tour.
BAND_STRETCH = 0.18
# The one widened retry, used only when the ordinary band holds no service
# town at all. Wider than BAND_STRETCH on purpose and still bounded: past
# this the "day" being described is somebody else's day. A stage found only
# at this width still faces every one of the ten checks afterwards, so
# widening buys a candidate, never a pass.
BAND_WIDEN = 0.35
# Two routes chain only when their ends genuinely meet.
CHAIN_JOIN_M = 2_000
MAX_CHAIN = 3
# A stage end has to be able to bail out to a train.
BAILOUT_KM = 20.0
# Beds required at a stage end, per the overnight_real check.
MIN_BEDS = 3


def log(msg):
    print(f"[cycling] {msg}", flush=True)


# ---------------------------------------------------------------------------
# The ascent curve
# ---------------------------------------------------------------------------

def ascent_curve(elevation, total_ascent_m):
    """Cumulative climb at each profile position, scaled to the real total.

    Returns (positions_m, cumulative_ascent_m) or None. The profile is 200
    points, so the climb it shows is the shape of the route rather than its
    magnitude; rescaling by the measured total is what makes a slice of it a
    number worth publishing. When the profile shows no climb at all (a
    towpath), the scale is undefined and the ascent is spread evenly, which
    is the honest answer for a route that is flat everywhere.
    """
    profile = (elevation or {}).get("profile") or []
    if len(profile) < 3:
        return None
    pos = [float(p[0]) for p in profile]
    ele = [float(p[1]) for p in profile]
    raw, running = [0.0], 0.0
    # The same hysteresis idea as the elevation sampler, on an already
    # smoothed profile: commit a climb only once it has actually happened.
    anchor = ele[0]
    for i in range(1, len(ele)):
        delta = ele[i] - anchor
        if delta > 2.0:
            running += delta
            anchor = ele[i]
        elif delta < -2.0:
            anchor = ele[i]
        raw.append(running)
    measured = float(total_ascent_m or 0)
    if raw[-1] > 1.0 and measured > 0:
        k = measured / raw[-1]
        return pos, [v * k for v in raw]
    if measured > 0 and pos[-1] > 0:
        return pos, [measured * (p / pos[-1]) for p in pos]
    return pos, raw


def ascent_between(curve, start_m, end_m):
    """Climb between two positions, linearly interpolated on the curve."""
    if not curve:
        return None
    pos, cum = curve

    def at(x):
        if x <= pos[0]:
            return cum[0]
        if x >= pos[-1]:
            return cum[-1]
        lo, hi = 0, len(pos) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if pos[mid] <= x:
                lo = mid
            else:
                hi = mid
        span = pos[hi] - pos[lo]
        if span <= 0:
            return cum[lo]
        t = (x - pos[lo]) / span
        return cum[lo] + t * (cum[hi] - cum[lo])

    return max(0.0, at(end_m) - at(start_m))


# ---------------------------------------------------------------------------
# Slicing way_spans: what the riding is like on ONE stage
# ---------------------------------------------------------------------------

def slice_spans(way_spans, start_m, end_m):
    """way_spans clipped to one stage, in the same packed shape.

    This is the reason harvest_cycling keeps spans positioned along the line.
    Without it "the worst surface on stage three" cannot be answered, and
    the surface_fit check is decoration.
    """
    if not way_spans:
        return None
    tagsets = way_spans.get("tagsets") or []
    out = []
    for s, e, ref in way_spans.get("spans") or []:
        lo, hi = max(float(s), start_m), min(float(e), end_m)
        if hi - lo <= 0:
            continue
        out.append([round(lo, 1), round(hi, 1), ref])
    if not out:
        return None
    return {"tagsets": tagsets, "spans": out}


def stage_riding(way_spans, start_m, end_m):
    """Surface and safety for one stage, measured not inherited."""
    sliced = slice_spans(way_spans, start_m, end_m)
    if not sliced:
        return {}, {}
    return E.surface_of(sliced) or {}, E.safety_of(sliced) or {}


# ---------------------------------------------------------------------------
# Service towns
# ---------------------------------------------------------------------------

def usable_towns(route):
    """Towns with a measured position and at least somewhere to sleep."""
    out = []
    for town in route.get("services") or []:
        if "at_m" not in town:
            continue
        if (town.get("sleep") or 0) + (town.get("camp") or 0) <= 0:
            continue
        out.append(town)
    return sorted(out, key=lambda t: t["at_m"])


def town_fitness(town, at_m, ideal_m):
    """How good this town is as the end of today, 0..1.

    Two things at once, and the weighting says which matters: whether the
    place can hold a rider for a night (0.7), and whether stopping there
    makes today the length it was meant to be (0.3). A superb town 30 km
    early is still the wrong end of a stage.
    """
    service = float(town.get("score") or 0)
    off = abs(at_m - ideal_m)
    closeness = max(0.0, 1.0 - off / max(1.0, ideal_m * 0.35))
    return round(0.7 * service + 0.3 * closeness, 4)


def beds_at(town):
    return (town.get("sleep") or 0) + (town.get("camp") or 0)


# ---------------------------------------------------------------------------
# The split
# ---------------------------------------------------------------------------

def split(route, pace, verbose=False):
    """One route into stages at real towns, or None with a reason.

    Returns (stages, None) or (None, reason_code). The reason is a code, not
    prose, and it is counted in the run summary so a rule that starts
    silently deleting a country shows up here rather than as an empty page.
    """
    spec = PACES[pace]
    total_m = float(route.get("distance_m") or 0)
    if total_m < MIN_TOUR_M:
        return None, "too_short"
    if total_m > MAX_TOUR_M:
        return None, "too_long"

    curve = ascent_curve(route.get("elevation"), route.get("ascent_m"))
    towns = usable_towns(route)
    if len(towns) < MIN_STAGES:
        return None, "not_enough_service_towns"

    km_lo, km_hi = spec["km_lo"] * 1000.0, spec["km_hi"] * 1000.0
    stretch_lo = km_lo * (1 - BAND_STRETCH)
    stretch_hi = km_hi * (1 + BAND_STRETCH)

    # AIM FOR EVEN DAYS, not for the middle of the band.
    #
    # Walking forward and cutting at the band midpoint is greedy and cannot
    # backtrack, so it strands whatever is left. The Caledonia Way is the
    # case that showed it: 191 km at balanced pace took an 80 km first day
    # and left 111 km carrying 1,700 m of climb, which is over the cap, and
    # the tour died on its last stage rather than on anything real about the
    # route. Dividing the route into the fewest days that fit the cap and
    # then aiming at THAT length gives three days of 64 km, which is what a
    # rider would plan and what the gate accepts.
    n_stages = max(MIN_STAGES, int(math.ceil(total_m / km_hi)))
    # And a pace whose own floor cannot be met that many times over is not a
    # pace this route can be ridden at. Say so here rather than composing a
    # tour for the gate to reject.
    if total_m / n_stages < stretch_lo:
        return None, "route_too_short_for_this_pace"
    if n_stages > MAX_STAGES:
        return None, "route_needs_too_many_days"
    ideal = total_m / n_stages

    stages, cursor, used = [], 0.0, set()
    start_town = _nearest_town(towns, 0.0)
    guard = 0
    while cursor < total_m - stretch_lo * 0.5:
        guard += 1
        if guard > MAX_STAGES + 4:
            return None, "did_not_converge"

        # Where the ascent budget would force the cut, if it binds first.
        ascent_limit = _ascent_limit(curve, cursor, spec["ascent_cap"],
                                     cursor + stretch_hi)
        hard_hi = min(cursor + stretch_hi, ascent_limit)
        # Re-divide what REMAINS at every cut, so a stage that came in short
        # or long is absorbed by the days after it instead of accumulating
        # into the last one.
        left = total_m - cursor
        days_left = max(1, int(round(left / ideal)))
        target = left / days_left if days_left else ideal
        soft_ideal = min(cursor + max(stretch_lo, min(target, stretch_hi)),
                         ascent_limit)
        lo = cursor + stretch_lo

        candidates = [t for t in towns
                      if lo <= t["at_m"] <= hard_hi and t["at_m"] not in used]
        remaining = total_m - cursor
        if remaining <= stretch_hi:
            # The last stage. It has to end at the end, but it ALSO has to be
            # a day: an eighteen kilometre final stage is not a stage, it is
            # the previous one with a night inserted into it. So the finish
            # town must be at least a short day from here, and when it is not,
            # the fix is to swallow the previous boundary and ride the two as
            # one, which is what a rider would do anyway.
            end_candidates = [t for t in towns
                              if t["at_m"] >= total_m - stretch_hi * 0.5
                              and t["at_m"] not in used]
            if not end_candidates:
                return None, "no_town_at_the_finish"
            best = max(end_candidates, key=lambda t: float(t.get("score") or 0))
            if best["at_m"] - cursor < stretch_lo and stages:
                merged_from = stages[-1]["start_m"]
                merged_from_town = stages[-1]["from"]
                merged = _make_stage(route, curve, merged_from, best["at_m"],
                                     merged_from_town, best, len(stages), spec)
                if merged is None:
                    return None, "last_stage_too_short_to_merge"
                stages[-1] = merged
                break
            stage = _make_stage(route, curve, cursor, best["at_m"],
                                start_town, best, len(stages) + 1, spec)
            if stage is None:
                return None, "last_stage_over_budget"
            stages.append(stage)
            break

        if not candidates:
            # "If no service town is within reach, extend or shorten the stage
            # rather than inventing one." One widened attempt, and only
            # outwards: a longer day on a route that has nowhere to stop is a
            # real answer, a stage boundary in a field is not.
            # Outwards ONLY. Widening inwards would propose a stage shorter
            # than the pace's own floor, which validate_cycling then refuses,
            # so the planner would be manufacturing work for the gate to
            # throw away. "Shorten" in the brief means shorten towards the
            # bottom of the band, and the band's bottom is already `lo`.
            wide_hi = min(cursor + km_hi * (1 + BAND_WIDEN), ascent_limit)
            wide_lo = lo
            candidates = [t for t in towns
                          if wide_lo <= t["at_m"] <= wide_hi
                          and t["at_m"] not in used]
        if not candidates:
            return None, "no_service_town_in_the_band"
        best = max(candidates, key=lambda t: town_fitness(t, t["at_m"], soft_ideal))
        stage = _make_stage(route, curve, cursor, best["at_m"], start_town,
                            best, len(stages) + 1, spec)
        if stage is None:
            # The cut is inside the distance band but over the ascent cap.
            # Shorten rather than invent: try the next town back.
            shorter = [t for t in candidates if t["at_m"] < best["at_m"]]
            stage = None
            for alt in sorted(shorter, key=lambda t: -t["at_m"]):
                stage = _make_stage(route, curve, cursor, alt["at_m"],
                                    start_town, alt, len(stages) + 1, spec)
                if stage is not None:
                    best = alt
                    break
            if stage is None:
                return None, "over_the_ascent_cap"
        stages.append(stage)
        used.add(best["at_m"])
        cursor = best["at_m"]
        start_town = best

    if not MIN_STAGES <= len(stages) <= MAX_STAGES:
        return None, "stage_count_out_of_range"
    return stages, None


def _nearest_town(towns, at_m):
    return min(towns, key=lambda t: abs(t["at_m"] - at_m)) if towns else None


def _ascent_limit(curve, start_m, cap_m, hard_hi):
    """The furthest position whose climb from start_m is still within cap."""
    if not curve or cap_m <= 0:
        return hard_hi
    lo, hi = start_m, hard_hi
    if (ascent_between(curve, start_m, hi) or 0) <= cap_m:
        return hi
    for _ in range(40):
        mid = (lo + hi) / 2
        if (ascent_between(curve, start_m, mid) or 0) <= cap_m:
            lo = mid
        else:
            hi = mid
    return lo


def _make_stage(route, curve, start_m, end_m, from_town, to_town, day, spec):
    """One stage, fully measured, or None when it breaks its own budget."""
    length_m = end_m - start_m
    if length_m <= 1000:
        return None
    # The pace floor, enforced HERE rather than only in the gate. The planner
    # and validate_cycling.check_stage_budget have to agree on what a day is,
    # or the planner spends its time composing tours the gate exists to
    # reject, and the run summary blames the gate for the planner's arithmetic.
    if length_m < spec["km_lo"] * 1000.0 * (1 - BAND_STRETCH):
        return None
    ascent = ascent_between(curve, start_m, end_m)
    if ascent is not None and ascent > spec["ascent_cap"]:
        return None
    if length_m > spec["km_hi"] * 1000.0 * (1 + BAND_STRETCH):
        return None

    surface, safety = stage_riding(route.get("way_spans"), start_m, end_m)
    on_stage = [t for t in (route.get("services") or [])
                if "at_m" in t and start_m <= t["at_m"] <= end_m]
    water = sum((t.get("water") or 0) for t in on_stage)
    food = sum((t.get("grocery") or 0) for t in on_stage)
    # The longest run with neither water nor a shop, which is what the
    # water_and_food check actually cares about.
    marks = [start_m] + sorted(t["at_m"] for t in on_stage
                               if (t.get("water") or 0) or (t.get("grocery") or 0))
    marks.append(end_m)
    dry_m = max(b - a for a, b in zip(marks, marks[1:])) if len(marks) > 1 else length_m

    bailout = _bailout(route, to_town, end_m)
    return {
        "d": day,
        "from": _town_card(from_town),
        "to": _town_card(to_town),
        "start_m": int(round(start_m)),
        "end_m": int(round(end_m)),
        "distance_m": int(round(length_m)),
        "ascent_m": int(round(ascent)) if ascent is not None else None,
        "paved_share": surface.get("paved_share"),
        "traffic_free_share": surface.get("traffic_free_share"),
        "worst_smoothness": surface.get("worst_smoothness"),
        "worst_tracktype": surface.get("worst_tracktype"),
        "bike": surface.get("bike"),
        "trunk_m": surface.get("trunk_m"),
        "safety": safety.get("score"),
        "water_n": water,
        "food_n": food,
        "longest_dry_m": int(round(dry_m)),
        "bailout": bailout,
    }


def _town_card(town):
    if not town:
        return None
    return {k: town.get(k) for k in
            ("name", "lat", "lon", "sleep", "camp", "shop", "repair",
             "water", "grocery", "station", "station_name", "off_m")
            if town.get(k) is not None}


def _bailout(route, town, end_m):
    """The nearest railway station to this stage end, or an honest remote flag.

    A tour without bail-outs is not a worse tour, it is a different one, and
    saying so is the point. The check refuses silence, not remoteness.
    """
    if town and (town.get("station") or 0):
        return {"kind": "station", "name": town.get("station_name")
                or town.get("name"), "km": 0}
    best, best_km = None, BAILOUT_KM
    for other in route.get("services") or []:
        if not (other.get("station") or 0):
            continue
        if town is None:
            continue
        km = E._haversine_km(town["lat"], town["lon"],
                             other["lat"], other["lon"])
        if km < best_km:
            best, best_km = other, km
    if best:
        return {"kind": "station",
                "name": best.get("station_name") or best.get("name"),
                "km": round(best_km, 1)}
    return {"kind": "remote"}


# ---------------------------------------------------------------------------
# Chains: routes whose ends actually meet
# ---------------------------------------------------------------------------

CHAIN_SQL = """
    SELECT a.id, b.id,
           ST_Distance(ST_EndPoint(ST_LineMerge(ST_Force2D(a.geom)))::geography,
                       ST_StartPoint(ST_LineMerge(ST_Force2D(b.geom)))::geography)
    FROM cycle_routes a, cycle_routes b
    WHERE a.country = %(cc)s AND b.country = %(cc)s AND a.id <> b.id
      AND a.distance_m BETWEEN 25000 AND 600000
      AND b.distance_m BETWEEN 25000 AND 600000
      AND GeometryType(ST_LineMerge(ST_Force2D(a.geom))) = 'LINESTRING'
      AND GeometryType(ST_LineMerge(ST_Force2D(b.geom))) = 'LINESTRING'
      AND ST_DWithin(ST_EndPoint(ST_LineMerge(ST_Force2D(a.geom)))::geography,
                     ST_StartPoint(ST_LineMerge(ST_Force2D(b.geom)))::geography,
                     %(join_m)s)
    ORDER BY 3
    LIMIT 4000
"""


def find_chains(conn, cc, verbose=False):
    """Pairs of routes that can genuinely be ridden one after the other.

    Geometric only. Two routes in the same region are not a chain; two
    routes where the first ends where the second begins are.
    """
    with conn.cursor() as cur:
        cur.execute(CHAIN_SQL, {"cc": cc, "join_m": CHAIN_JOIN_M})
        pairs = cur.fetchall()
    if verbose:
        log(f"chains [{cc}]: {len(pairs)} end-to-end joins found")
    return [(a, b, float(d)) for a, b, d in pairs]


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------
#
# The brief names ERA5-Land. The project's climatology of record is the NASA
# POWER 2001-2020 monthly normals already cached for 3,038 places (brief 04
# retired WorldClim over its non-commercial licence and landed on POWER,
# which is a US Government work with no reuse restriction). Same variables,
# same resolution class, already cleared and already on disk, so this reads
# that rather than adding a third climate source for one field.

CLIMATE = ROOT / "cache" / "climate.json"
_climate = None

RIDEABLE_T_HIGH = 11.0       # a day that never reaches 11 C is not a tour
RIDEABLE_T_LOW = -2.0        # nor is a night of hard frost in a tent
RIDEABLE_PRECIP_MM = 160     # a month wetter than this is not a holiday
COMFORT_BAND = 18            # how far below the best month still counts


def _climate_table():
    global _climate
    if _climate is None:
        try:
            with open(CLIMATE, encoding="utf-8") as fh:
                raw = json.load(fh)
        except (OSError, json.JSONDecodeError):
            raw = {}
        _climate = [(v.get("lat"), v.get("lon"), v)
                    for v in raw.values()
                    if v.get("lat") is not None and v.get("months")]
    return _climate


def season_for(lat, lon, max_km=120.0):
    """Rideable months and the best of them, from the nearest normals.

    Nothing is claimed beyond max_km: a tour in the Highlands does not get
    Edinburgh's summer, it gets no season, and the season check treats that
    as unmeasured rather than as year-round.
    """
    table = _climate_table()
    if not table:
        return None
    best, best_km = None, max_km
    for plat, plon, rec in table:
        km = E._haversine_km(lat, lon, plat, plon)
        if km < best_km:
            best, best_km = rec, km
    if not best:
        return None
    months = best["months"]
    rideable, comforts = [], []
    for i, m in enumerate(months, 1):
        if (m.get("t_high") or -99) >= RIDEABLE_T_HIGH \
                and (m.get("t_low") or -99) >= RIDEABLE_T_LOW \
                and (m.get("precip_mm") or 0) <= RIDEABLE_PRECIP_MM:
            rideable.append(i)
            comforts.append((m.get("comfort") or 0, i))
    if not rideable:
        return {"months": [], "best": [], "basis": "power_normals",
                "from_km": round(best_km, 1)}
    top = max(c for c, _ in comforts)
    return {
        "months": rideable,
        "best": sorted(i for c, i in comforts if c >= top - COMFORT_BAND),
        "basis": "power_normals",
        "source": best.get("source"),
        "from_km": round(best_km, 1),
    }


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

ROUTE_SQL = """
    SELECT r.id, r.country, r.name, r.ref, r.network, r.cycle_network,
           r.distance_m, r.ascent_m, r.roundtrip, r.rating, r.raw_tags,
           r.surface, r.safety, r.scenic, r.services, r.near, r.regions,
           r.elevation, r.way_spans,
           ST_Y(ST_PointOnSurface(ST_Force2D(r.geom))),
           ST_X(ST_PointOnSurface(ST_Force2D(r.geom))),
           GeometryType(ST_LineMerge(ST_Force2D(coalesce(cr.geom, r.geom))))
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr
           ON cr.route_id = r.id AND cr.repaired
          AND cr.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(r.geom)))
    WHERE r.country = %(cc)s
      AND r.status <> 'rejected'
      AND r.distance_m >= %(min_m)s
    ORDER BY r.rating DESC NULLS LAST, r.distance_m DESC
"""

ROUTE_COLS = ("id", "country", "name", "ref", "network", "cycle_network",
              "distance_m", "ascent_m", "roundtrip", "rating", "raw_tags",
              "surface", "safety", "scenic", "services", "near", "regions",
              "elevation", "way_spans", "lat", "lon", "merged_type")


def slugify(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return text[:60] or "tour"


def tour_title(route, pace, days):
    name = route.get("name") or route.get("ref") or f"route {route['id']}"
    return f"{name}, {days} days {pace}"


TOUR_UPSERT = """
    INSERT INTO cycle_tours
        (country, slug, title, route_ids, pace, bike_type, days, distance_m,
         ascent_m, geom, stages, season, scenic, safety, rating, regions,
         near, status)
    VALUES (%(country)s, %(slug)s, %(title)s, %(route_ids)s, %(pace)s,
            %(bike)s, %(days)s, %(distance_m)s, %(ascent_m)s,
            ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
            %(stages)s, %(season)s, %(scenic)s, %(safety)s, %(rating)s,
            %(regions)s, %(near)s, 'draft')
    ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title, route_ids = EXCLUDED.route_ids,
        pace = EXCLUDED.pace, bike_type = EXCLUDED.bike_type,
        days = EXCLUDED.days, distance_m = EXCLUDED.distance_m,
        ascent_m = EXCLUDED.ascent_m, geom = EXCLUDED.geom,
        stages = EXCLUDED.stages, season = EXCLUDED.season,
        scenic = EXCLUDED.scenic, safety = EXCLUDED.safety,
        rating = EXCLUDED.rating, regions = EXCLUDED.regions,
        near = EXCLUDED.near
    RETURNING id
"""

GEOM_SQL = """
    SELECT ST_AsText(ST_Multi(ST_Force3D(ST_LineMerge(ST_Force2D(
               coalesce(cr.geom, r.geom)))))),
           ST_NumGeometries(ST_Multi(ST_LineMerge(ST_Force2D(
               coalesce(cr.geom, r.geom))))),
           coalesce(cr.repair_info, '{}'::jsonb)
    FROM cycle_routes r
    LEFT JOIN cycle_repairs cr
           ON cr.route_id = r.id AND cr.repaired
          AND cr.repair_info->>'source_geom_md5'
              = md5(ST_AsBinary(ST_Force2D(r.geom)))
    WHERE r.id = %s
"""


def compose_country(conn, cc, paces, dry_run=False, verbose=False, only=None):
    """Every tour this country can honestly offer."""
    with conn.cursor() as cur:
        cur.execute(ROUTE_SQL, {"cc": cc, "min_m": MIN_TOUR_M})
        routes = [dict(zip(ROUTE_COLS, r)) for r in cur.fetchall()]
    if only:
        routes = [r for r in routes if r["id"] in only]
    reasons = Counter()
    made = []
    for route in routes:
        if route["merged_type"] != "LINESTRING":
            reasons["route/not_continuous"] += 1
            continue
        for pace in paces:
            stages, why = split(route, pace, verbose)
            if why:
                reasons[f"{pace}/{why}"] += 1
                continue
            tour = _tour_record(conn, route, pace, stages)
            if tour is None:
                reasons[f"{pace}/no_geometry"] += 1
                continue
            made.append(tour)
    log(f"tours [{cc}]: {len(made)} composed from {len(routes)} route(s)")
    if verbose or dry_run:
        for why, n in reasons.most_common(12):
            log(f"    {why}: {n}")
    if not dry_run:
        _store(conn, made)
        # Retire what no longer composes. Without this a tour that a fixed
        # split, a re-harvest or a tightened threshold has stopped producing
        # sits in cycle_tours forever, gets re-validated on every run, and
        # shows up in the summary as the gate rejecting something the planner
        # is no longer proposing. The gate runs before the write, and that
        # only means anything if the write is the whole answer.
        retired = _retire(conn, cc, {t["slug"] for t in made}, only)
        if retired:
            log(f"tours [{cc}]: {retired} stale tour(s) retired")
    return made, reasons


RETIRE_SQL = """
    DELETE FROM cycle_tours
    WHERE country = %(cc)s
      AND NOT (slug = ANY(%(keep)s))
      AND (%(routes)s::bigint[] IS NULL OR route_ids && %(routes)s)
"""


def _retire(conn, cc, keep, only=None):
    """Drop this country's tours that the current model no longer composes."""
    with conn.cursor() as cur:
        cur.execute(RETIRE_SQL, {"cc": cc, "keep": sorted(keep),
                                 "routes": sorted(only) if only else None})
        n = cur.rowcount
    conn.commit()
    return n


def _tour_record(conn, route, pace, stages):
    with conn.cursor() as cur:
        cur.execute(GEOM_SQL, (route["id"],))
        got = cur.fetchone()
    if not got or not got[0]:
        return None
    wkt, n_parts, repair_info = got[0], int(got[1] or 0), got[2] or {}

    days = len(stages)
    distance = sum(s["distance_m"] for s in stages)
    ascents = [s["ascent_m"] for s in stages if s["ascent_m"] is not None]
    bikes = [s.get("bike") for s in stages if s.get("bike")]
    worst_bike = max(bikes, key=E.BIKE_ORDER.index) if bikes else "unknown"
    safeties = [s["safety"] for s in stages if s["safety"] is not None]
    scenic = (route.get("scenic") or {}).get("score")
    return {
        "country": route["country"],
        "slug": f"{route['country'].lower()}-{slugify(route.get('name') or route.get('ref') or route['id'])}-{pace}",
        "title": tour_title(route, pace, days),
        "route_ids": [route["id"]],
        "parts": n_parts,
        "bridges": repair_info.get("bridges"),
        "bridged_m": repair_info.get("total_bridge_m"),
        "pace": pace,
        "bike": worst_bike,
        "days": days,
        "distance_m": distance,
        "ascent_m": int(sum(ascents)) if ascents else None,
        "wkt": wkt,
        "stages": stages,
        "season": season_for(route["lat"], route["lon"]),
        "scenic": scenic,
        "safety": round(sum(safeties) / len(safeties), 2) if safeties else None,
        "rating": route.get("rating"),
        "regions": route.get("regions"),
        "near": route.get("near"),
    }


def _store(conn, tours):
    with conn.cursor() as cur:
        for tour in tours:
            cur.execute(TOUR_UPSERT, {
                **tour,
                "stages": Jsonb(tour["stages"]),
                "season": Jsonb(tour["season"]) if tour["season"] else None,
                "regions": Jsonb(tour["regions"]) if tour["regions"] else None,
                "near": Jsonb(tour["near"]) if tour["near"] else None,
            })
    conn.commit()


def model_block():
    """The tour model for index.json. The model ships with the data."""
    return {
        "version": MODEL_VERSION,
        "paces": {k: dict(v) for k, v in PACES.items()},
        "min_tour_m": MIN_TOUR_M,
        "max_tour_m": MAX_TOUR_M,
        "stages": {"min": MIN_STAGES, "max": MAX_STAGES},
        "band_stretch": BAND_STRETCH,
        "cut_rule": ("distance or ascent, whichever binds first, snapped to "
                     "the best service town inside the band"),
        "service_reach_m": E.SERVICE_REACH_M,
        "min_beds": MIN_BEDS,
        "bailout_km": BAILOUT_KM,
        "chain_join_m": CHAIN_JOIN_M,
        "season_basis": "nasa_power_normals_2001_2020",
    }


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--pace", default=",".join(PACES),
                    help=f"comma separated subset of {','.join(PACES)}")
    ap.add_argument("--route", type=int, help="compose one route only")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    paces = [p.strip() for p in args.pace.split(",") if p.strip()]
    unknown = [p for p in paces if p not in PACES]
    if unknown:
        ap.error(f"unknown pace: {', '.join(unknown)}")

    with connect() as conn:
        if args.countries:
            todo = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
        else:
            with conn.cursor() as cur:
                cur.execute("""SELECT DISTINCT country FROM cycle_routes
                               WHERE distance_m >= %s ORDER BY 1""",
                            (MIN_TOUR_M,))
                todo = [r[0] for r in cur.fetchall()]
        total, all_reasons = 0, Counter()
        for cc in todo:
            made, reasons = compose_country(
                conn, cc, paces, args.dry_run, args.verbose,
                only={args.route} if args.route else None)
            total += len(made)
            all_reasons += reasons
        print(f"\n{total} tour(s) composed across {len(todo)} country(ies)")
        for why, n in all_reasons.most_common(15):
            print(f"  {why:44s} {n}")
        if args.dry_run:
            print("dry run: nothing written")


if __name__ == "__main__":
    main()
