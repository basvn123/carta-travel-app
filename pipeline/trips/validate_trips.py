"""Check every composed trip before it is allowed anywhere near the app.

A generated itinerary is only worth shipping if it is true. The failure mode
of every AI trip planner on the market is the plausible one: a route that
reads beautifully and cannot be taken, a train that does not run, a day trip
that gets you there at four in the afternoon, a village booked for five
nights that has eleven beds. This file is the answer to that, and it is
deliberately boring.

Two kinds of check.

    HARD    the trip is wrong. It is dropped and the reason is counted, so a
            rule that starts silently deleting a country shows up in the run
            summary rather than in the app as an empty page.
    SOFT    the trip is fine but weaker, or something could not be verified.
            It ships with the warning recorded on it, the score is trimmed,
            and the app can say so out loud.

Every check reads only what is already in the composed record, so validation
is fast, offline, deterministic and can be re-run against a wire file long
after the composer that wrote it has changed.

Usage, as a library from export_trips.py, or on its own to audit a cache:
    python pipeline/trips/validate_trips.py cache/trips/composed.json
"""

import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import trip_model as M  # noqa: E402
from trip_sources import fold, haversine_km, load_catalogue, load_json  # noqa: E402

# Photographs are only ever stored from hosts whose licence the pipeline can
# check. Anything else is a link we cannot stand behind, so it does not ship.
ALLOWED_IMAGE_HOSTS = {
    "upload.wikimedia.org", "commons.wikimedia.org", "images.wikimedia.org",
}

DAY_LENGTH_H = M.DAY_LENGTH_H
MIN_HIGHLIGHTS_PER_STOP = 3
MAX_CHAIN_LEG_MIN = 5 * 60
MAX_LOOP_LEG_MIN = int(3.5 * 60)


# ------------------------------------------------------------------ the checks

def check_stops(trip, cat):
    """Every stop is a real, rated, photographed place in the catalogue."""
    for s in trip["stops"]:
        d = cat.get(s["dest"])
        if not d:
            return "stop_not_in_catalogue:%s" % s["dest"]
        if d["rating"] is None or d["lat"] is None or d["lon"] is None:
            return "stop_incomplete:%s" % s["dest"]
        if not s.get("img"):
            return "stop_without_photo:%s" % s["dest"]
        if not M.can_be_base(d):
            return "stop_cannot_be_a_base:%s" % s["dest"]
    return None


def check_no_repeats(trip, cat):
    """The same town twice under two names is a bug, not an itinerary."""
    names = [fold(s["city"]) for s in trip["stops"]]
    if len(set(names)) != len(names):
        return "repeated_city"
    for i, a in enumerate(trip["stops"]):
        for b in trip["stops"][i + 1:]:
            km = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
            if km is not None and km < 40:
                return "stops_too_close:%s_%s" % (a["dest"], b["dest"])
    return None


def check_nights(trip, cat):
    """Two nights minimum per base, and never more than the place holds."""
    # A two day city break is one night, and that is the whole point of it.
    # Everywhere else, one night in a place is a train change with a bed.
    floor = 1 if (trip["archetype"] == "base" and trip["days"] <= 2) else 2
    for s in trip["stops"]:
        d = cat.get(s["dest"]) or {}
        if s["nights"] < floor:
            return "single_night:%s" % s["dest"]
        # A base trip may stay longer than the place alone would justify,
        # because the days out are what fills those days.
        cap = M.max_nights(d) + (len(trip["daytrips"]) if trip["archetype"] == "base" else 0)
        if s["nights"] > cap:
            return "too_many_nights:%s(%s>%s)" % (s["dest"], s["nights"], cap)
    if sum(s["nights"] for s in trip["stops"]) != trip["days"] - 1:
        return "nights_do_not_match_days"
    return None


def check_legs(trip, cat):
    """Every move is on land, inside its cap, and joins the stops it claims."""
    stops = [s["dest"] for s in trip["stops"]]
    legs = trip["legs"]
    if trip["archetype"] == "base":
        return "base_trip_with_legs" if legs else None
    expected = len(stops) if trip["archetype"] == "loop" else len(stops) - 1
    if len(legs) != expected:
        return "leg_count:%s!=%s" % (len(legs), expected)
    cap = MAX_LOOP_LEG_MIN if trip["archetype"] == "loop" else MAX_CHAIN_LEG_MIN
    for i, lg in enumerate(legs):
        if lg["from"] != stops[i] or lg["to"] != stops[(i + 1) % len(stops)]:
            return "leg_does_not_join_its_stops:%s" % i
        a, b = cat.get(lg["from"]), cat.get(lg["to"])
        if not a or not b:
            return "leg_endpoint_missing:%s" % i
        if M.landmass_of(a) != M.landmass_of(b):
            return "leg_crosses_water:%s" % i
        if lg["minutes"] > cap:
            return "leg_too_long:%s(%smin)" % (i, lg["minutes"])
        if lg["mode"] == "train" and M.RAIL_RANK[lg.get("rail") or "none"] < 2:
            return "train_on_a_network_without_one:%s" % i
    return None


def check_loop_closes(trip, cat):
    if trip["archetype"] != "loop":
        return None
    if not trip["legs"]:
        return "loop_without_legs"
    if trip["legs"][-1]["to"] != trip["stops"][0]["dest"]:
        return "loop_does_not_return"
    drive_min = sum(lg["minutes"] for lg in trip["legs"])
    if drive_min / 60.0 / trip["days"] > 3.0:
        return "loop_drives_too_much:%sh" % round(drive_min / 60)
    return None


def check_daytrips(trip, cat):
    """A day out has to come back, and be worth the journey."""
    seen = set()
    for t in trip["daytrips"]:
        if t["dest"] in [s["dest"] for s in trip["stops"]]:
            return "daytrip_to_its_own_base:%s" % t["dest"]
        if t["dest"] in seen:
            return "repeated_daytrip:%s" % t["dest"]
        seen.add(t["dest"])
        floor = M.MIN_ON_SITE_CAR_H if t["mode"] == "car" else M.MIN_ON_SITE_H
        if t["on_site_h"] < floor:
            return "daytrip_too_rushed:%s" % t["dest"]
        # Both halves were rounded on the way into the wire, so the sum can
        # miss by a couple of minutes without the day being any longer.
        if (t["minutes"] * 2) / 60.0 + t["on_site_h"] > DAY_LENGTH_H + 0.15:
            return "daytrip_does_not_fit_a_day:%s" % t["dest"]
        if not t.get("highlights"):
            return "daytrip_with_nothing_to_see:%s" % t["dest"]
    if trip["archetype"] != "base" and trip["daytrips"]:
        return "daytrips_on_a_moving_trip"
    return None


def check_plan(trip, cat):
    """The day by day plan covers every day and sends nobody nowhere."""
    plan = trip["plan"]
    if len(plan) != trip["days"]:
        return "plan_length:%s!=%s" % (len(plan), trip["days"])
    if [p["d"] for p in plan] != list(range(1, trip["days"] + 1)):
        return "plan_days_out_of_order"
    for p in plan:
        if p["stop"] >= len(trip["stops"]):
            return "plan_points_at_a_missing_stop:day%s" % p["d"]
        if p["kind"] != "depart" and not p["items"] and not p.get("daytrip"):
            return "empty_day:%s" % p["d"]
    kinds = Counter(p["kind"] for p in plan)
    if kinds.get("arrive", 0) != 1 or kinds.get("depart", 0) != 1:
        return "plan_without_one_arrival_and_one_departure"
    return None


def check_enough_to_do(trip, cat):
    """Every base can fill the days it is given, with things you can picture."""
    for s in trip["stops"]:
        shown = [h for h in s["highlights"] if h.get("img")]
        if len(shown) < MIN_HIGHLIGHTS_PER_STOP:
            return "thin_stop:%s(%s)" % (s["dest"], len(shown))
        # Two things to see for every day you are actually there, which is what
        # separates a stop worth three nights from a stop worth one.
        if len(s["highlights"]) < s["nights"] + 1:
            return "thin_for_its_stay:%s(%s_for_%sn)" % (
                s["dest"], len(s["highlights"]), s["nights"])
    total = sum(len(s["highlights"]) for s in trip["stops"])
    total += sum(len(t["highlights"]) for t in trip["daytrips"])
    if total < trip["days"] + 2:
        return "not_enough_to_do:%s_for_%sd" % (total, trip["days"])
    return None


def check_hero(trip, cat):
    """A trip with no photograph to lead with does not ship.

    Every stop is required to have one already, but the hero can still come
    out empty when every candidate is a wordmark or a flagged file, and a card
    with a grey block where the photograph goes is not worth publishing.
    """
    for st in trip["stops"]:
        if st.get("img"):
            return None
        for h in st["highlights"]:
            if h.get("img"):
                return None
    return "no_photograph_to_lead_with"


def check_images(trip, cat):
    """Every photograph comes from a host whose licence we actually checked."""
    urls = [s.get("img") for s in trip["stops"]]
    urls += [t.get("img") for t in trip["daytrips"]]
    for s in trip["stops"]:
        urls += [h.get("img") for h in s["highlights"]]
    for u in urls:
        if not u:
            continue
        host = (urlparse(u).hostname or "").lower()
        if host not in ALLOWED_IMAGE_HOSTS:
            return "photo_from_an_unchecked_host:%s" % host
    return None


def check_cost(trip, cat):
    cost = trip.get("cost") or {}
    if not cost.get("stay_eur") or cost["stay_eur"] <= 0:
        return "no_stay_price"
    if cost["per_day_eur"] > 900:
        return "implausible_cost:%s" % cost["per_day_eur"]
    return None


HARD_CHECKS = [
    ("stops", check_stops),
    ("no_repeats", check_no_repeats),
    ("nights", check_nights),
    ("legs", check_legs),
    ("loop_closes", check_loop_closes),
    ("daytrips", check_daytrips),
    ("plan", check_plan),
    ("enough_to_do", check_enough_to_do),
    ("hero", check_hero),
    ("images", check_images),
    ("cost", check_cost),
]


# ------------------------------------------------------------- the soft checks

def soft_checks(trip, cat, ctx):
    """Warnings, and the quality multiplier they add up to."""
    warned = []

    if trip["season"]["basis"] != "all" or not trip["season"]["best"]:
        warned.append("no_shared_season")
    if trip["archetype"] != "base":
        linked = sum(1 for i in range(len(trip["stops"]) - 1)
                     if trip["stops"][i + 1]["dest"]
                     in (ctx["graph_undirected"].get(trip["stops"][i]["dest"]) or ()))
        if not linked:
            warned.append("no_editorial_link")
    guided = any((ctx["wv_status"] or {}).get(s["dest"]) in ("guide", "star")
                 for s in trip["stops"])
    if not guided:
        warned.append("no_written_guide")
    spread = [s["walk_km"] for s in trip["stops"] if s.get("walk_km")]
    if spread and max(spread) > 4.0:
        warned.append("sights_are_spread_out")
    measured = sum(1 for s in trip["stops"]
                   if ((cat.get(s["dest"]) or {}).get("accommodation") or {})
                   .get("price_source", "").startswith("inside_airbnb_city"))
    if not measured:
        warned.append("stay_prices_are_country_level")
    crowded = [s for s in trip["stops"]
               if ((cat.get(s["dest"]) or {}).get("crowding") or {}).get("tier") == 3]
    if len(crowded) == len(trip["stops"]) and crowded:
        warned.append("every_stop_is_crowded")

    quality = max(0.4, 1.0 - 0.07 * len(warned))
    return warned, round(quality, 2)


# ---------------------------------------------------------------------- runner

def validate(trips, cat, ctx):
    """Split composed trips into what ships and what does not, with reasons."""
    kept, dropped = [], []
    reasons = Counter()
    for trip in trips:
        failure = None
        for name, fn in HARD_CHECKS:
            failure = fn(trip, cat)
            if failure:
                reasons["%s/%s" % (name, failure.split(":")[0])] += 1
                break
        if failure:
            dropped.append({"id": trip["id"], "why": failure})
            continue
        warned, quality = soft_checks(trip, cat, ctx)
        trip["checks"] = {
            "passed": [name for name, _ in HARD_CHECKS],
            "warned": warned,
            "quality": quality,
        }
        # A warning is a real deduction, not a footnote: a trip with no shared
        # season and no written guide behind it should not outrank one with
        # both on the same page.
        trip["score"] = round(min(10.0, trip["score"] * (0.88 + 0.12 * quality)), 1)
        kept.append(trip)
    return kept, dropped, reasons


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "cache/trips/composed.json"
    payload = load_json(path)
    if not payload:
        raise SystemExit("no composed trips at %s" % path)
    cat = load_catalogue()
    import compose_trips as C
    ctx = C.build_context(cat, verbose=False)
    kept, dropped, reasons = validate(payload["trips"], cat, ctx)
    print("%s trips in, %s kept, %s dropped" % (len(payload["trips"]), len(kept), len(dropped)))
    for why, n in reasons.most_common():
        print("  %-46s %s" % (why, n))
    warned = Counter(w for t in kept for w in t["checks"]["warned"])
    print("warnings on the trips that shipped:")
    for w, n in warned.most_common():
        print("  %-46s %s" % (w, n))


if __name__ == "__main__":
    main()
