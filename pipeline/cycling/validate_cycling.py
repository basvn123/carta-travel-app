"""Ten hard checks, and a tour that fails one does not publish.

Mirrors pipeline/trips/validate_trips.py, and it is deliberately boring for
the same reason. A generated itinerary is only worth shipping if it is true,
and the failure mode of every planner on the market is the plausible one: a
route that reads beautifully and cannot be ridden, a village booked for the
night that has one guesthouse, a "gravel section" that is grade-5 sand.

Every check reads only what is already in the composed record, so validation
is fast, offline, deterministic, and can be re-run against a wire file long
after the planner that wrote it has changed.

Unlike the trips layer, there are no soft checks here. Every one of the ten
is HARD, because each describes something that would strand a rider at six in
the evening a hundred kilometres from a station.

    continuity      one merged line, zero gaps. The trails gate, unchanged.
    stage_budget    no stage over its pace's kilometres or its ascent cap.
    overnight_real  every stage end has at least three mapped beds within
                    8 km, or a campsite. Never a hamlet with one guesthouse.
    no_repeats      no town twice, unless the route is a loop returning to
                    where it started.
    surface_fit     the declared bike type matches the WORST surface on the
                    tour. A touring tour may not contain grade-4 track.
    safety_floor    no stage below the safety floor, and no stage with more
                    than 2 km on highway=trunk.
    water_and_food  drinking water or a shop at least every 40 km.
    bailout         every stage end within 20 km of a station, or explicitly
                    flagged remote. Remote is allowed; silence is not.
    images          no photograph from a host whose licence we have not
                    checked. The trips rule, unchanged.
    season          the tour declares its months from climatology. No
                    Highland tour published as a January product.

Usage, as a library from export_cycling.py, or on its own against the lab:
    python pipeline/cycling/validate_cycling.py
    python pipeline/cycling/validate_cycling.py --countries GB --verbose
"""

import argparse
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

import stage_planner as P  # noqa: E402
import cycle_sources as S  # noqa: E402
from db import connect as _db_connect  # noqa: E402,F401

# Every lab connection in this layer goes through the patient wrapper:
# the machine is shared and a ten second connect timeout loses runs.
connect = S.lab_connect

# Photographs are only ever stored from hosts whose licence the pipeline can
# check. Anything else is a link we cannot stand behind, so it does not ship.
# Same set the trips layer allows, plus Geograph, which brief 02 cleared for
# GB and IE and which is most of what exists for a Scottish B road.
ALLOWED_IMAGE_HOSTS = {
    "upload.wikimedia.org", "commons.wikimedia.org", "images.wikimedia.org",
    "s0.geograph.org.uk", "s1.geograph.org.uk", "s2.geograph.org.uk",
    "s3.geograph.org.uk", "s4.geograph.org.uk", "s5.geograph.org.uk",
    "s6.geograph.org.uk", "s7.geograph.org.uk", "s8.geograph.org.uk",
    "s9.geograph.org.uk", "www.geograph.org.uk", "geograph.org.uk",
}

MIN_BEDS = P.MIN_BEDS
BAILOUT_KM = P.BAILOUT_KM
DRY_LIMIT_M = 40_000          # water or a shop at least every 40 km
TRUNK_LIMIT_M = 2_000         # per stage
SAFETY_FLOOR = 4.0            # out of 10, where 10 is a segregated cycleway
# A tour whose safety could not be measured on most of its length is not a
# safe tour, it is an unmeasured one, and it does not ship as either.
SAFETY_MIN_KNOWN = 0.4

# Which surfaces each declared bike type may legally contain.
BIKE_ALLOWS = {
    "touring": {"tracktype": {"grade1"},
                "smoothness": {"excellent", "good", "intermediate"}},
    "gravel": {"tracktype": {"grade1", "grade2", "grade3"},
               "smoothness": {"excellent", "good", "intermediate", "bad",
                              "very_bad"}},
    "mtb": {"tracktype": set(P.E.TRACKTYPE), "smoothness": set(P.E.SMOOTHNESS)},
}


# ------------------------------------------------------------------ the checks

def check_continuity(tour):
    """One line. A multi-part tour draws a ride that teleports."""
    parts = tour.get("parts")
    if parts is None:
        return "continuity_unknown"
    if parts != 1:
        return "line_in_%s_parts" % parts
    return None


def check_stage_budget(tour):
    spec = P.PACES.get(tour.get("pace"))
    if not spec:
        return "unknown_pace:%s" % tour.get("pace")
    km_cap = spec["km_hi"] * 1000.0 * (1 + P.BAND_STRETCH)
    for stage in tour["stages"]:
        if stage["distance_m"] > km_cap:
            return "stage_%s_too_long:%skm" % (
                stage["d"], round(stage["distance_m"] / 1000))
        ascent = stage.get("ascent_m")
        if ascent is not None and ascent > spec["ascent_cap"]:
            return "stage_%s_climbs_too_much:%sm" % (stage["d"], ascent)
        if stage["distance_m"] < spec["km_lo"] * 1000.0 * (1 - P.BAND_STRETCH):
            return "stage_%s_too_short:%skm" % (
                stage["d"], round(stage["distance_m"] / 1000))
    return None


def check_overnight_real(tour):
    """A stage end has to be somewhere a rider can actually sleep."""
    for stage in tour["stages"]:
        town = stage.get("to") or {}
        if not town.get("name"):
            return "stage_%s_ends_nowhere" % stage["d"]
        beds = town.get("sleep") or 0
        camp = town.get("camp") or 0
        if beds < MIN_BEDS and camp < 1:
            return "stage_%s_ends_with_%s_beds:%s" % (
                stage["d"], beds, town["name"])
        if (town.get("off_m") or 0) > P.E.SERVICE_REACH_M:
            return "stage_%s_ends_%skm_off_route" % (
                stage["d"], round((town["off_m"]) / 1000))
    return None


def check_no_repeats(tour):
    """The same town twice is a bug, unless the route comes back to it."""
    names = [(s.get("to") or {}).get("name") for s in tour["stages"]]
    start = (tour["stages"][0].get("from") or {}).get("name")
    seen = Counter(n for n in names if n)
    for name, n in seen.items():
        if n > 1:
            return "town_twice:%s" % name
    # The start may reappear only as the last stop, and only on a loop.
    if start and start in names:
        if names[-1] != start:
            return "returns_to_the_start_mid_tour:%s" % start
    return None


def check_surface_fit(tour):
    """The declared bike has to be able to ride the worst part of the tour."""
    bike = tour.get("bike") or tour.get("bike_type")
    allows = BIKE_ALLOWS.get(bike)
    if not allows:
        return "unknown_bike_type:%s" % bike
    for stage in tour["stages"]:
        track = stage.get("worst_tracktype")
        if track and track not in allows["tracktype"]:
            return "stage_%s_has_%s_on_a_%s_tour" % (stage["d"], track, bike)
        smooth = stage.get("worst_smoothness")
        if smooth and smooth not in allows["smoothness"]:
            return "stage_%s_is_%s_on_a_%s_tour" % (stage["d"], smooth, bike)
    return None


def check_safety_floor(tour):
    for stage in tour["stages"]:
        score = stage.get("safety")
        if score is None:
            return "stage_%s_safety_unmeasured" % stage["d"]
        if score < SAFETY_FLOOR:
            return "stage_%s_below_the_safety_floor:%s" % (stage["d"], score)
        trunk = stage.get("trunk_m") or 0
        if trunk > TRUNK_LIMIT_M:
            return "stage_%s_has_%skm_on_a_trunk_road" % (
                stage["d"], round(trunk / 1000, 1))
    return None


def check_water_and_food(tour):
    for stage in tour["stages"]:
        dry = stage.get("longest_dry_m")
        if dry is None:
            return "stage_%s_supplies_unknown" % stage["d"]
        if dry > DRY_LIMIT_M:
            return "stage_%s_has_%skm_without_water_or_a_shop" % (
                stage["d"], round(dry / 1000))
    return None


def check_bailout(tour):
    """Remote is a legitimate answer. Not knowing is not."""
    for stage in tour["stages"]:
        bail = stage.get("bailout") or {}
        kind = bail.get("kind")
        if kind == "station":
            if (bail.get("km") or 0) > BAILOUT_KM:
                return "stage_%s_bailout_%skm_away" % (stage["d"], bail["km"])
        elif kind != "remote":
            return "stage_%s_without_a_bailout_answer" % stage["d"]
    return None


def check_images(tour):
    """Every photograph comes from a host whose licence we actually checked."""
    for img in (tour.get("images") or []):
        url = img.get("url") if isinstance(img, dict) else img
        if not url:
            continue
        host = (urlparse(url).hostname or "").lower()
        if host not in ALLOWED_IMAGE_HOSTS:
            return "photo_from_an_unchecked_host:%s" % host
        if isinstance(img, dict) and not (img.get("license") or "").strip():
            return "photo_without_a_licence"
    return None


def check_season(tour):
    """A tour has to say when it can be ridden, and mean it."""
    season = tour.get("season") or {}
    months = season.get("months")
    if not months:
        return "no_season_declared"
    if len(months) == 12:
        # Nowhere in the catalogue's range is a twelve-month cycling product.
        # Twelve months means the climatology was not really consulted.
        return "claims_every_month"
    if not season.get("best"):
        return "no_best_months"
    return None


HARD_CHECKS = [
    ("continuity", check_continuity),
    ("stage_budget", check_stage_budget),
    ("overnight_real", check_overnight_real),
    ("no_repeats", check_no_repeats),
    ("surface_fit", check_surface_fit),
    ("safety_floor", check_safety_floor),
    ("water_and_food", check_water_and_food),
    ("bailout", check_bailout),
    ("images", check_images),
    ("season", check_season),
]


# ---------------------------------------------------------------------- runner

def validate(tours):
    """Split composed tours into what ships and what does not, with reasons."""
    kept, dropped, reasons = [], [], Counter()
    for tour in tours:
        failure = None
        for name, fn in HARD_CHECKS:
            failure = fn(tour)
            if failure:
                reasons["%s/%s" % (name, failure.split(":")[0])] += 1
                break
        if failure:
            dropped.append({"slug": tour.get("slug"), "why": failure})
            continue
        tour["checks"] = {"passed": [name for name, _ in HARD_CHECKS],
                          "model": P.MODEL_VERSION}
        kept.append(tour)
    return kept, dropped, reasons


TOURS_SQL = """
    SELECT t.id, t.country, t.slug, t.title, t.pace, t.bike_type, t.days,
           t.distance_m, t.ascent_m, t.stages, t.season, t.images,
           ST_NumGeometries(t.geom)
    FROM cycle_tours t
    WHERE (%(countries)s::text[] IS NULL OR t.country = ANY(%(countries)s))
    ORDER BY t.country, t.slug
"""

MARK_SQL = """
    UPDATE cycle_tours SET status = %s, checks = %s WHERE id = %s
"""


def load_tours(conn, countries):
    with conn.cursor() as cur:
        cur.execute(TOURS_SQL, {"countries": list(countries) or None})
        out = []
        for row in cur.fetchall():
            (tid, cc, slug, title, pace, bike, days, dist, ascent, stages,
             season, images, parts) = row
            out.append({"id": tid, "country": cc, "slug": slug,
                        "title": title, "pace": pace, "bike": bike,
                        "bike_type": bike, "days": days, "distance_m": dist,
                        "ascent_m": ascent, "stages": stages or [],
                        "season": season, "images": images or [],
                        "parts": int(parts or 0)})
    return out


def run(conn, countries, verbose=False, write=True):
    """Validate every composed tour and route it by status.

    Passing moves a tour to needs_review, which is where the review UI picks
    it up; failing moves it to rejected with the reason on the row. Nothing
    is ever auto-approved, and nothing is ever silently deleted.
    """
    tours = load_tours(conn, countries)
    kept, dropped, reasons = validate(tours)
    if write:
        from psycopg.types.json import Jsonb
        by_slug = {d["slug"]: d["why"] for d in dropped}
        with conn.cursor() as cur:
            for tour in tours:
                if tour["slug"] in by_slug:
                    cur.execute(MARK_SQL, ("rejected",
                                           Jsonb({"failed": by_slug[tour["slug"]]}),
                                           tour["id"]))
                else:
                    cur.execute(MARK_SQL, ("needs_review",
                                           Jsonb(tour["checks"]), tour["id"]))
        conn.commit()
    return kept, dropped, reasons


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2")
    ap.add_argument("--dry-run", action="store_true",
                    help="report only, do not move any tour's status")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    countries = ([c.strip().upper() for c in args.countries.split(",")
                  if c.strip()] if args.countries else [])

    with connect() as conn:
        kept, dropped, reasons = run(conn, countries, args.verbose,
                                     write=not args.dry_run)
    total = len(kept) + len(dropped)
    print(f"{total} tour(s) in, {len(kept)} pass all ten checks, "
          f"{len(dropped)} dropped")
    for why, n in reasons.most_common():
        print(f"  {why:52s} {n}")
    if args.verbose:
        for row in dropped[:40]:
            print(f"    {row['slug']}: {row['why']}")


if __name__ == "__main__":
    main()
