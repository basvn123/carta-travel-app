"""Compose the trips: one base, a chain of bases, or a loop by car.

The question this layer answers is the one a traveller actually asks. Not
"where should I go" but "I have five days and I am thinking of Austria, what
is the best thing to do with them", which is a different question with a
different answer for every day count. Five days in Austria is Vienna and two
days out of it. Ten days is Vienna, Salzburg and Innsbruck with the train
between them. Fourteen is a loop with a car. The catalogue has never been able
to say any of that.

Three archetypes, which are the three real shapes a European trip takes:

    base    one bed for the whole trip, days out from it. The right answer for
            two to six days, and the only shape that does not spend a quarter
            of a short trip moving luggage.
    chain   two to five bases in sequence, each leg on a train or a coach that
            actually runs. Four days and up.
    loop    a car route that returns to where it started. Six days and up, and
            the only shape that reaches the places no train serves.

How a trip gets built, in one paragraph. Eligible bases are the places with a
strong enough rating, enough photographed sights to fill a day, a measured
place to sleep and a photograph of their own. For a single base trip the
composer works out how many days that base holds on its own, then fills the
rest with day trips that come back the same day, spread around the compass so
three days out are not three versions of the same drive. For a chain it runs a
beam search from every seed, scoring each extension on how good the next base
is, how far it is, and whether a Wikivoyage editor actually lists it as where
you go next from here. For a loop it does the same and pays the cost of
getting home. Every candidate is then scored, deduplicated against the ones
already kept, and the best few per country and per day count survive.

Nothing here writes prose. Every sentence the app shows is composed in the app
from reason codes this file emits, which is what keeps the six translations
honest and keeps a generated adjective out of a factual product.

Usage, from the repo root:
    python pipeline/trips/compose_trips.py                # every country
    python pipeline/trips/compose_trips.py --countries AT,CH
    python pipeline/trips/compose_trips.py --countries AT --verbose
"""

import argparse
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import trip_model as M  # noqa: E402
from trip_sources import (  # noqa: E402
    MODEL_VERSION, TRIP_CACHE, haversine_km, layer_index, load_catalogue,
    load_demand, load_pageviews, load_routes, slug, write_json)

# ---------------------------------------------------------------- the shapes

# Which day counts each archetype is offered for. A two day chain is a day of
# travel with a hotel change in it; a fourteen day single base is a house sit.
BASE_DAYS = [2, 3, 4, 5, 6]
CHAIN_DAYS = [4, 5, 6, 7, 8, 10, 12, 14]
LOOP_DAYS = [6, 7, 8, 10, 12, 14]

# How hard the trip works. Applied to the SHAPE of the itinerary, not to a
# label on it: given the same seven days, relaxed builds two bases and packed
# builds four, so the two are different routes rather than one route twice.
PACES = {
    "relaxed": {
        "core_bonus": 2,   # slow days the base holds on its own
        "min_nights": 3,      # sleep somewhere long enough to stop unpacking
        "max_stops": 3,
        "daytrips": 2,
        "poi_per_day": 3,
        "leg_h": 3.5,         # no travel day longer than an afternoon
        "score": 0.0,
    },
    "balanced": {
        "core_bonus": 0,   # slow days the base holds on its own
        "min_nights": 2,
        "max_stops": 5,
        "daytrips": 4,
        "poi_per_day": 4,
        "leg_h": 5.0,
        "score": 0.15,        # the shape most people actually want
    },
    "packed": {
        "core_bonus": -1,   # slow days the base holds on its own
        "min_nights": 2,
        "max_stops": 5,
        "daytrips": 5,
        "poi_per_day": 6,
        "leg_h": 5.0,
        "score": 0.0,
    },
}

# How big the places are. Two genuinely different trips through one country:
# the cities everyone has heard of, and everywhere else.
SCALES = {
    "icons": {
        "seed_classes": {"metro", "city"},
        # The pool matters as much as the seed: a route of famous cities may
        # pass through a town, but a village on it is a different trip.
        "pool_classes": {"metro", "city", "town"},
        "min_seed": 7.2,
    },
    "hidden": {
        "seed_classes": {"town", "village", "area"},
        # No metros. Seeding in Hallstatt and finishing in Vienna was an
        # icons trip that happened to start somewhere small.
        "pool_classes": {"city", "town", "village", "area"},
        # A smaller place clears a lower bar to open a trip, or "hidden" would
        # only ever be the handful of towns that rate like cities.
        "min_seed": 6.6,
    },
}

MIN_BASE_SCORE = 6.2         # below this a place is a stop, not a base
THIN_BASE_SCORE = 4.2        # the floor for a country that has nothing else
MIN_BASES_FOR_A_COUNTRY = 4  # under this, the floor above takes over
MIN_SEED_SCORE = 7.2         # a trip has to open on something worth the flight
MIN_NIGHTS_PER_BASE = 2      # one night in a city is a train change with a bed
BASE_SEPARATION_KM = 55      # closer than this, moving hotel buys you nothing
CHAIN_MAX_LEG_H = 5.0        # a travel day longer than this eats the next one
CHAIN_GOOD_LEG_H = 2.5       # under this the move costs only a morning
LOOP_MAX_LEG_H = 3.5         # behind the wheel, in one go
LOOP_MAX_DAILY_DRIVE_H = 2.6 # averaged over the whole loop
BEAM_WIDTH = 8
KEEP_PER_CELL = 3            # per country, archetype, length, scale and pace
MAX_DAYTRIPS_PER_BASE = 4
DAYTRIP_BEARING_SPREAD = 55  # degrees; two days out closer than this compete


# ---------------------------------------------------------------- the context

def build_context(cat, only=None, verbose=False):
    routes = load_routes()
    graph, n_links = M.build_editorial_graph(cat, routes)
    itineraries = M.resolve_itineraries(cat, routes)
    ctx = {
        "demand": load_demand(),
        "pageviews": load_pageviews(),
        "wv_status": routes.get("status") or {},
        "wv_getin": routes.get("getin") or {},
        "graph": graph,
        "graph_undirected": _undirected(graph),
        "itineraries": itineraries,
        "itinerary_edges": _itinerary_edges(itineraries),
        "layers": {},
        "harvested_at": routes.get("generated_at"),
    }
    ccs = only or sorted({d["iso2"] for d in cat.values() if d["iso2"]})
    for cc in ccs:
        ctx["layers"][cc] = layer_index(cc)
    if verbose:
        print("  editorial graph: %s places, %s onward links" % (len(graph), n_links))
        print("  itineraries: %s routes corroborated on the catalogue" % len(itineraries))
    return ctx


def _undirected(graph):
    out = defaultdict(set)
    for src, targets in graph.items():
        for t in targets:
            out[src].add(t)
            out[t].add(src)
    return out


def _itinerary_edges(itineraries):
    """Consecutive pairs named by a Wikivoyage itinerary, to the article."""
    edges = {}
    for it in itineraries:
        stops = it["stops"]
        for i in range(len(stops) - 1):
            edges[(stops[i], stops[i + 1])] = it
            edges[(stops[i + 1], stops[i])] = it
    return edges


# ------------------------------------------------------------- eligible bases

def eligible_bases(cat, cc, ctx, min_score=MIN_BASE_SCORE):
    """The places in one country that can hold a traveller for a night."""
    out = []
    for d in cat.values():
        if d["iso2"] != cc or d["rating"] is None:
            continue
        if not d.get("image"):
            continue
        if not M.can_be_base(d):
            continue
        pois = M.top_pois(d, want=24)
        if len(pois) < M.MIN_POIS_FOR_A_DAY:
            continue
        score = M.base_score(d, ctx)
        if score < min_score:
            continue
        out.append({"d": d, "score": score, "pois": pois,
                    "days": M.base_days(d)})
    out.sort(key=lambda r: -r["score"])
    return out


def _dedupe_same_city(bases):
    """One entry per town. A city with two airports is still one city."""
    seen, out = set(), []
    for b in bases:
        key = (M.fold(b["d"]["city"]), b["d"]["iso2"])
        if key in seen:
            continue
        seen.add(key)
        out.append(b)
    return out


# ---------------------------------------------------------------- day trips

def daytrips_for(base, cat, ctx, want=MAX_DAYTRIPS_PER_BASE):
    # `want` comes from the pace: a relaxed week goes out twice, a packed
    # one five times.
    """The best days out from one base, spread around the compass.

    Two day trips in the same direction compete for the same day, and a week
    that sends someone down the same valley three times is a worse week than
    one that sends them to the lake, the ridge and the old capital.
    """
    bd = base["d"]
    cands = []
    for t in cat.values():
        if t["id"] == bd["id"] or t["rating"] is None:
            continue
        reach = M.daytrip_reach(bd, t)
        if not reach:
            continue
        if not M.top_pois(t, want=3):
            continue
        cands.append({
            "d": t, "reach": reach,
            "score": M.daytrip_score(bd, t, reach, ctx),
            "bearing": M.bearing(bd, t),
        })
    cands.sort(key=lambda c: -c["score"])

    picked = []
    for c in cands:
        if len(picked) >= want:
            break
        # Same town twice under two names, or the same direction twice.
        if any(M.fold(p["d"]["city"]) == M.fold(c["d"]["city"]) for p in picked):
            continue
        clash = False
        for p in picked:
            gap = abs(p["bearing"] - c["bearing"])
            gap = min(gap, 360 - gap)
            if gap < DAYTRIP_BEARING_SPREAD and abs(p["reach"]["km"] - c["reach"]["km"]) < 40:
                clash = True
                break
        if clash:
            continue
        picked.append(c)
    return picked


# --------------------------------------------------------------- route search

def editorial_bonus(a_id, b_id, ctx):
    """How strongly a human travel editor connects these two places."""
    if b_id in ctx["graph"].get(a_id, ()):
        return 2.2                     # "from here, go to B"
    if b_id in ctx["graph_undirected"].get(a_id, ()):
        return 1.4                     # B's guide points back at A
    if (a_id, b_id) in ctx["itinerary_edges"]:
        return 1.8                     # consecutive stops on a written route
    return 0.0


def extend_score(prev, cand, ctx, mode, leg_cap=None):
    """Value of adding `cand` after `prev`, or None when the leg does not work."""
    lg = M.leg(prev["d"], cand["d"])
    if not lg.get("ok"):
        return None
    if lg["km"] < BASE_SEPARATION_KM:
        return None
    hours = lg["car_hours"] if mode == "car" else lg["public_hours"]
    cap = LOOP_MAX_LEG_H if mode == "car" else (leg_cap or CHAIN_MAX_LEG_H)
    if hours > cap:
        return None

    score = cand["score"]
    score += editorial_bonus(prev["d"]["id"], cand["d"]["id"], ctx)
    # A change of scene between bases, same reasoning as a day trip.
    new = M.scenes(cand["d"]) - M.scenes(prev["d"])
    score += 0.5 * min(2, len(new))
    # Travel friction. Under the comfortable threshold a move costs a morning;
    # past it, it eats the day, and the score should say so.
    score -= max(0.0, hours - CHAIN_GOOD_LEG_H) * 1.6
    score -= hours * 0.25
    return score, lg


def search_routes(seeds, pool, ctx, *, mode, max_stops, want=BEAM_WIDTH, leg_cap=None):
    """Beam search over base sequences. Returns [(stops, legs, score)]."""
    beams = [([s], [], s["score"]) for s in seeds]
    finished = []
    for _ in range(max_stops - 1):
        nxt = []
        for stops, legs, score in beams:
            used = {s["d"]["id"] for s in stops}
            last = stops[-1]
            for cand in pool:
                if cand["d"]["id"] in used:
                    continue
                if any(M.fold(cand["d"]["city"]) == M.fold(s["d"]["city"]) for s in stops):
                    continue
                # Never two bases within a day trip of each other: that is a
                # day out, and paying for a second hotel to do it is a worse
                # trip than staying put.
                if any((haversine_km(cand["d"]["lat"], cand["d"]["lon"],
                                     s["d"]["lat"], s["d"]["lon"]) or 0) < BASE_SEPARATION_KM
                       for s in stops):
                    continue
                res = extend_score(last, cand, ctx, mode, leg_cap)
                if not res:
                    continue
                add, lg = res
                nxt.append((stops + [cand], legs + [lg], score + add))
        if not nxt:
            break
        nxt.sort(key=lambda r: -r[2])
        beams = nxt[:want]
        finished.extend(beams)
    return finished


# ----------------------------------------------------------- nights and days

def spread_nights(stops, nights, pace=None):
    """Give each base at least two nights, the rest by how much it holds.

    A one night stop is a train change with a bed in it. The only exception is
    a base whose own depth says half a day, which the composer will not have
    selected as a base in the first place.
    """
    n = len(stops)
    floor = (pace or {}).get("min_nights", MIN_NIGHTS_PER_BASE)
    caps = [M.max_nights(s["d"]) for s in stops]
    # A relaxed trip asks for three nights a base, which a village cannot give.
    # Rather than bend the cap, the route simply is not offered at that pace.
    caps = [max(c, floor) if s["d"].get("place_class") in ("metro", "city") else c
            for c, s in zip(caps, stops)]
    if nights < n * floor or any(c < floor for c in caps):
        return None
    if nights > sum(caps):
        # This route cannot absorb this many nights without parking someone in
        # a village for half a week. That is a different route's job.
        return None
    out = [floor] * n
    left = nights - sum(out)
    weights = [max(0.5, s["days"]) for s in stops]
    order = sorted(range(n), key=lambda i: -weights[i])
    i = 0
    while left > 0 and i < 400:
        idx = order[i % n]
        if out[idx] < caps[idx]:
            out[idx] += 1
            left -= 1
        i += 1
    return out if left == 0 else None


def build_days(stops, nights, legs, daytrips, archetype):
    """The day by day plan, as reason coded rows the app renders.

    Day d is the day you wake up at the stop you slept at on night d, and the
    last day is the one you leave on. A move happens on the morning of the
    first day at the new base, which is why that day carries the leg and only
    two things to see.
    """
    days = []
    day_no = 1
    for i, stop in enumerate(stops):
        for k in range(nights[i]):
            kind = "arrive" if (i == 0 and k == 0) else ("travel" if k == 0 else "base")
            days.append({
                "d": day_no, "kind": kind, "stop": i,
                "leg": legs[i - 1] if (kind == "travel" and i > 0) else None,
            })
            day_no += 1
    days.append({"d": day_no, "kind": "depart", "stop": len(stops) - 1, "leg": None})

    # Day trips take over the fullest days in the middle of a stay: never the
    # arrival day, never the departure day, and never a day you also move.
    if daytrips:
        open_days = [x for x in days
                     if x["kind"] == "base" and x["d"] not in (1, len(days))]
        for trip, slot in zip(daytrips, open_days):
            slot["kind"] = "daytrip"
            slot["daytrip"] = trip
    return days


def fill_day_items(days, stops, pools):
    """Hand each day its share of the sights, dealt out rather than front loaded.

    Filling day one with the best four and working down left the last day of a
    three night stay with nothing at all whenever a base had six sights rather
    than twelve, which is most of the smaller towns in the catalogue. Dealing
    round robin gives every day a share of the good ones and guarantees that
    no day comes out empty as long as the stop has at least one sight per day,
    which is exactly what the enough_to_do check enforces.

    `pools` is the wire visible highlight list per stop, not the internal
    ranking list, so every name a day names is a name the app can resolve.
    """
    by_stop = defaultdict(list)
    for day in days:
        if day["kind"] == "daytrip":
            day["items"] = M.top_pois(day["daytrip"]["d"], want=3)
            continue
        by_stop[day["stop"]].append(day)

    for stop_i, stop_days in by_stop.items():
        pool = pools[stop_i]
        n = len(stop_days)
        if not pool:
            for day in stop_days:
                day["items"] = []
            continue
        for i, day in enumerate(stop_days):
            share = pool[i::n]
            # An arrival or a travel morning is half a day of sightseeing, and
            # the departure day is a coffee and a train.
            cap = 2 if day["kind"] in ("travel", "arrive") else (
                1 if day["kind"] == "depart" else 4)
            day["items"] = share[:cap] or pool[:1]
    return days


# ------------------------------------------------------------- trip assembly

def assemble(stops, legs, nights, daytrips, archetype, days_total, cat, ctx,
             scale='icons', pace='balanced', pc=None):
    """One finished trip, ready to be scored and validated."""
    dests = [s["d"] for s in stops]
    cc = dests[0]["iso2"]
    layer_hits = []
    for s in stops:
        layer_hits.extend(M.nearest_layer_hits(s["d"], ctx["layers"].get(s["d"]["iso2"], []),
                                               want=4))
    # The highlight list is built first and the plan is dealt out of it, so a
    # day can never name a sight the wire does not carry.
    per_day = (pc or PACES["balanced"])["poi_per_day"]
    pools = [M.top_pois(s["d"], want=max(4, min(16, 2 + per_day * nights[i])))
             for i, s in enumerate(stops)]
    plan = fill_day_items(
        build_days(stops, nights, legs, daytrips, archetype), stops, pools)

    countries = []
    for d in dests:
        if d["iso2"] not in countries:
            countries.append(d["iso2"])
    # A day out over the border is still a border crossing, and a traveller
    # planning documents and a rental car agreement needs to know. Salzburg
    # reaches Berchtesgaden and Chiemsee; the trip is still an Austrian one.
    daytrip_countries = []
    for t in daytrips:
        cc_t = t["d"]["iso2"]
        if cc_t not in countries and cc_t not in daytrip_countries:
            daytrip_countries.append(cc_t)

    mode = "car" if archetype == "loop" else (
        "rail" if all(lg.get("public") == "train" for lg in legs) and legs else
        ("mixed" if legs else "rail"))
    if archetype == "base":
        modes = {t["reach"]["mode"] for t in daytrips}
        mode = "car" if modes == {"car"} else ("rail" if modes <= {"train"} else "mixed")

    stay_eur = sum((M.nightly_eur(s["d"]) or 0) * nights[i] for i, s in enumerate(stops))
    leg_eur = sum((lg["car_eur"] if archetype == "loop" else lg["public_eur"]) for lg in legs)
    daytrip_eur = sum(t["reach"]["eur"] * 2 for t in daytrips)   # return fare, two people

    trip = {
        "archetype": archetype,
        "scale": scale,
        "pace": pace,
        "days": days_total,
        "nights": sum(nights),
        "cc": cc,
        "countries": countries,
        "daytrip_countries": daytrip_countries,
        "stops": [{
            "dest": s["d"]["id"], "city": s["d"]["city"], "iso2": s["d"]["iso2"],
            "country": s["d"]["country"],
            "lat": s["d"]["lat"], "lon": s["d"]["lon"],
            "nights": nights[i],
            "rating": s["d"]["rating"],
            "score": s["score"],
            "img": (s["d"].get("image") or {}).get("url"),
            "img_credit": (s["d"].get("image") or {}).get("credit"),
            "img_page": (s["d"].get("image") or {}).get("page"),
            "class": s["d"].get("place_class"),
            "transit": (s["d"].get("transit") or {}).get("transit_quality"),
            "walk_km": M.walkability(s["pois"][:8]),
            # As many things to see as the stay has room for: a flat six
            # left a five night base with nothing to do on day four.
            "highlights": [_poi_wire(p) for p in pools[i]],
            "around": M.nearest_layer_hits(s["d"], ctx["layers"].get(s["d"]["iso2"], []), want=4),
        } for i, s in enumerate(stops)],
        # A loop carries one leg more than it has moves: the drive home. It
        # wraps back to the first stop rather than running off the end.
        "legs": [{
            "from": stops[i]["d"]["id"],
            "to": stops[(i + 1) % len(stops)]["d"]["id"],
            "km": lg["km"],
            "mode": "car" if archetype == "loop" else lg["public"],
            "minutes": int(round((lg["car_hours"] if archetype == "loop"
                                  else lg["public_hours"]) * 60)),
            "eur": lg["car_eur"] if archetype == "loop" else lg["public_eur"],
            "rail": lg["rail_quality"],
            "home": archetype == "loop" and i == len(stops) - 1,
            "est": True,
        } for i, lg in enumerate(legs)],
        "daytrips": [{
            "dest": t["d"]["id"], "city": t["d"]["city"], "iso2": t["d"]["iso2"],
            "lat": t["d"]["lat"], "lon": t["d"]["lon"],
            "rating": t["d"]["rating"],
            "img": (t["d"].get("image") or {}).get("url"),
            "km": t["reach"]["km"], "minutes": t["reach"]["minutes"],
            "mode": t["reach"]["mode"], "eur": t["reach"]["eur"],
            "on_site_h": t["reach"]["on_site_h"],
            "why": sorted(M.scenes(t["d"]) - M.scenes(stops[0]["d"]))[:2],
            "highlights": [_poi_wire(p) for p in M.top_pois(t["d"], want=3)],
        } for t in daytrips],
        "plan": [{
            "d": x["d"], "kind": x["kind"], "stop": x["stop"],
            "daytrip": x["daytrip"]["d"]["id"] if x.get("daytrip") else None,
            "items": [p["name"] for p in x["items"]],
        } for x in plan],
        "themes": M.theme_tags(dests, layer_hits),
        "season": M.season_months(dests),
        "transport": mode,
        "cost": {
            "stay_eur": round(stay_eur),
            "legs_eur": round(leg_eur + daytrip_eur),
            "per_day_eur": round((stay_eur + leg_eur + daytrip_eur) / max(1, days_total)),
            "group": 2, "est": True,
        },
    }
    trip["id"] = _trip_id(trip)
    trip["name"], trip["name_parts"] = _trip_name(trip, cat)
    trip["score"], trip["why"] = score_trip(trip, stops, legs, daytrips, ctx)
    return trip


def _poi_wire(p):
    out = {"name": p["name"], "kind": p.get("kind"),
           "lat": round(p["lat"], 5), "lon": round(p["lon"], 5), "rate": p["rate"]}
    if p.get("img"):
        out["img"] = p["img"]
    if p.get("desc"):
        out["desc"] = p["desc"][:180]
    if p.get("wiki"):
        out["wiki"] = p["wiki"]
    return out


def _trip_id(trip):
    cities = "-".join(slug(s["city"]) for s in trip["stops"][:3])
    suffix = "" if trip.get("pace") in (None, "balanced") else "-" + trip["pace"]
    if trip.get("scale") == "hidden":
        suffix += "-hidden"
    return "%s-%s-%s-%sd%s" % (trip["cc"].lower(), cities, trip["archetype"],
                               trip["days"], suffix)


def _trip_name(trip, cat):
    """A name made of place names, never an adjective.

    The app writes the readable line from `name_parts` in the traveller's own
    language; `name` is the English fallback and the id's human twin.
    """
    cities = [s["city"] for s in trip["stops"]]
    parts = {"cities": cities, "archetype": trip["archetype"],
             "days": trip["days"], "country": trip["stops"][0]["country"]}
    if trip["archetype"] == "base":
        outs = [t["city"] for t in trip["daytrips"][:2]]
        parts["daytrips"] = outs
        name = cities[0] + (" and " + " and ".join(outs) if outs else "")
    elif trip["archetype"] == "loop":
        name = " to ".join(cities[:2]) + " loop" if len(cities) > 1 else cities[0]
        if len(cities) > 2:
            name = "%s, %s and %s loop" % (cities[0], cities[1], cities[-1])
    else:
        name = " to ".join([cities[0], cities[-1]]) if len(cities) > 2 else " and ".join(cities)
    return name, parts


# ------------------------------------------------------------------- scoring

# Days per base the pace is aiming at. A relaxed fortnight is three towns; a
# packed one is six.
PACE_DAYS_PER_STOP = {"relaxed": 4.0, "balanced": 3.0, "packed": 2.2}

# Most distinguishing first, most generic last.
WHY_ORDER = [
    "namedRoute", "unesco", "hiddenGem", "thinCoverage", "oneBed", "quiet",
    "walkable", "railOnly", "lightTravel", "editorialRoute",
    "editorialPartial", "travelHeavy", "season",
]

def score_trip(trip, stops, legs, daytrips, ctx):
    """0 to 10, plus the reason codes the card and the page read from.

    The score is the honest average of the places the trip actually visits,
    adjusted for how much of it is spent travelling and how much a human
    editor corroborates the route. Everything that adjusts it also emits a
    reason, so nothing moves the number without saying so.
    """
    why = []
    # The spine is the published 0-10 traveller rating, weighted by how many
    # nights the trip actually spends in each place. base_score is the
    # composer's internal ranking number and runs past 10 by design, so using
    # it here clamped every trip in Austria to a flat 10.0 and the page could
    # not tell Vienna and Graz apart.
    ratings = [s["d"]["rating"] or 0 for s in stops]
    weights = [trip["stops"][i]["nights"] for i in range(len(stops))]
    total_w = sum(weights) or 1
    score = sum(r * w for r, w in zip(ratings, weights)) / total_w

    if daytrips:
        # Days out are a real part of the trip, so they move the number, but
        # the bed you wake up in matters more than the places you pass through.
        avg_day = sum(t["d"]["rating"] or 0 for t in daytrips) / len(daytrips)
        share = min(0.3, 0.09 * len(daytrips))
        score = score * (1 - share) + avg_day * share

    # Travel friction, as a share of the trip.
    travel_h = sum(lg["minutes"] for lg in trip["legs"]) / 60.0
    travel_h += sum(t["minutes"] * 2 for t in trip["daytrips"]) / 60.0
    share = travel_h / max(1, trip["days"] * 10)
    if share > 0.30:
        score -= 0.9
        why.append({"k": "travelHeavy", "h": round(travel_h)})
    elif share < 0.12 and trip["days"] >= 4:
        score += 0.3
        why.append({"k": "lightTravel", "h": round(travel_h)})

    # Corroboration: a human editor connects these places, or wrote the route.
    linked = sum(1 for i in range(len(stops) - 1)
                 if editorial_bonus(stops[i]["d"]["id"], stops[i + 1]["d"]["id"], ctx) > 0)
    if legs and linked == len(legs):
        score += 0.5
        why.append({"k": "editorialRoute"})
    elif linked:
        score += 0.25
        why.append({"k": "editorialPartial", "n": linked})

    named = _matching_itinerary(trip, ctx)
    if named:
        score += 0.4
        why.append({"k": "namedRoute", "name": named["title"], "url": named["url"]})
        trip["follows"] = {"title": named["title"], "url": named["url"],
                           "mode": named.get("mode")}

    # What the trip is actually made of, as facts rather than adjectives.
    unesco = sum(1 for s in stops
                 for x in (s["d"].get("designations") or [])
                 if x.get("kind") == "unesco_whc")
    if unesco:
        why.append({"k": "unesco", "n": unesco})
    gems = [s["d"]["city"] for s in stops if s["d"].get("hidden_gem")]
    if gems:
        score += 0.2 * min(2, len(gems))
        why.append({"k": "hiddenGem", "cities": gems[:2]})
    walkable = [s for s in trip["stops"] if s["walk_km"] and s["walk_km"] <= 3.0]
    if len(walkable) == len(trip["stops"]) and trip["stops"][0]["walk_km"]:
        why.append({"k": "walkable", "km": max(s["walk_km"] for s in trip["stops"])})
    if trip["transport"] == "rail" and trip["legs"]:
        why.append({"k": "railOnly"})
    if trip["archetype"] == "base":
        why.append({"k": "oneBed", "city": trip["stops"][0]["city"],
                    "n": len(trip["daytrips"])})
    crowd = [s["d"] for s in stops if (s["d"].get("crowding") or {}).get("tier") == 1]
    if len(crowd) == len(stops) and crowd:
        why.append({"k": "quiet"})
    if trip["season"]["basis"] == "all" and trip["season"]["best"]:
        why.append({"k": "season", "months": trip["season"]["best"]})
    if any(s.get("thin") for s in stops):
        why.append({"k": "thinCoverage", "country": stops[0]["d"]["country"]})
    score += PACES.get(trip.get("pace") or "balanced", {}).get("score", 0.0)
    # How many bases this pace wants for this many days. Without it, relaxed
    # and packed both kept the same two-stop route and differed only in a word.
    if trip["archetype"] != "base":
        ideal = trip["days"] / PACE_DAYS_PER_STOP[trip.get("pace") or "balanced"]
        score -= abs(len(stops) - ideal) * 0.55
    if trip.get("pace") and trip["pace"] != "balanced":
        why.append({"k": "pace" + trip["pace"].capitalize()})
    if trip.get("scale") == "hidden":
        why.append({"k": "offTheBeatenTrack"})

    # A card shows the first two reasons, so what leads has to be what makes
    # THIS trip different. Emitted in narrative order, every card in Italy
    # opened with the same two sentences about travel time and Wikivoyage.
    why.sort(key=lambda r: WHY_ORDER.index(r["k"]) if r["k"] in WHY_ORDER else 99)
    return round(max(0.0, min(10.0, score)), 1), why


def _matching_itinerary(trip, ctx):
    """A written itinerary this route follows for at least two of its legs."""
    ids = [s["dest"] for s in trip["stops"]]
    best, best_n = None, 0
    for it in ctx["itineraries"]:
        stops = it["stops"]
        n = sum(1 for i in range(len(ids) - 1)
                if ids[i] in stops and ids[i + 1] in stops)
        if n > best_n:
            best, best_n = it, n
    return best if best_n >= 2 else None


def _loop_earns_it(stops, legs):
    """Is a car the right answer for this route, or is the train?

    Yes when a stop has weak or no local transport, when a stop says a car is
    needed to see it, or when the railway between the stops is fair or worse.
    """
    for st in stops:
        lt = st["d"].get("transit") or {}
        if lt.get("transit_quality") in ("poor", "none"):
            return True
        if lt.get("car_needed"):
            return True
        if st["d"].get("place_class") in ("village", "area"):
            return True
    return any(M.RAIL_RANK[lg.get("rail_quality") or "none"] < 3 for lg in legs)


# ---------------------------------------------------------------- per country

# How far outside its own borders a country's chain search may reach. Vienna
# to Bratislava is an hour on a train and the best sixth day of an Austrian
# week; Copenhagen to Malmoe is thirty five minutes across a bridge. Refusing
# to cross a border is a worse itinerary, not a purer one.
CROSS_BORDER_KM = 320


def compose_country(cc, cat, ctx, bases_by_cc, verbose=False):
    """Every trip this country can honestly offer, across scale and pace.

    Six passes rather than one: two scales (the cities everyone knows, and
    everywhere else) times three paces (relaxed, balanced, packed). They are
    separate passes rather than filters because each one changes the route
    itself, so the same country and the same seven days come back as six
    different trips rather than one trip wearing six labels.
    """
    bases = bases_by_cc.get(cc) or []
    if not bases:
        return [], {"reason": "no_eligible_bases"}
    # The coverage floor. Ranking the whole continent on one scale starves
    # Moldova, Malta and the Faroes, which is a fact about the scale rather
    # than about those countries: they have four good places each and the
    # scale was built for France.
    # Thin means "too few places to split by scale", which is a bigger set
    # than "the coverage floor was applied". Liechtenstein has one base: the
    # floor never fired because relaxing the score found nothing extra, and
    # then icons and hidden each filtered that one base away and the country
    # published nothing at all.
    thin = bool(bases and bases[0].get("thin")) or len(bases) < MIN_BASES_FOR_A_COUNTRY

    # The pool is this country's bases plus the strong ones just over the
    # border, which is what lets a route be honest about geography.
    anchor = bases[:8]
    pool = list(bases[:70])
    foreign = []
    for other_cc, others in bases_by_cc.items():
        if other_cc == cc:
            continue
        for b in others[:24]:
            if b["score"] < MIN_SEED_SCORE:
                continue
            near = min((haversine_km(b["d"]["lat"], b["d"]["lon"],
                                     a["d"]["lat"], a["d"]["lon"]) or 9e9)
                       for a in anchor)
            if near <= CROSS_BORDER_KM:
                foreign.append(b)
    foreign.sort(key=lambda b: -b["score"])
    pool.extend(foreign[:20])

    daytrip_cache = {}

    def trips_of(b, want):
        """Days out from one base, cached at the widest ask and sliced down."""
        key = b["d"]["id"]
        if key not in daytrip_cache:
            daytrip_cache[key] = daytrips_for(b, cat, ctx, want=MAX_DAYTRIPS_WIDE)
        return daytrip_cache[key][:want]

    out = []
    # A thin country runs one pass, not two: with the same seeds on both, the
    # scale split would only produce the same routes under two labels.
    scales = {"icons": SCALES["icons"]} if thin else SCALES
    for scale, sc in scales.items():
        seeds = _seeds_for(bases, sc, thin)
        if not seeds:
            continue
        scale_pool = pool if thin else [
            b for b in pool if b["d"].get("place_class") in sc["pool_classes"]]
        if verbose:
            print("  %s/%s: %s seeds, %s in the pool"
                  % (cc, scale, len(seeds), len(scale_pool)))
        for pace, pc in PACES.items():
            out.extend(_compose_pass(seeds, scale_pool, cat, ctx, scale, pace, pc))

    kept = rank_and_cap(out)
    return kept, {"eligible": len(bases), "candidates": len(out), "kept": len(kept)}


def _seeds_for(bases, sc, thin):
    """The places a trip of this scale may open on.

    A country with almost nothing ignores the scale split entirely: Moldova
    has four places worth a night and dividing them into icons and hidden
    leaves nothing on either side.
    """
    if thin:
        return bases[:6]
    rows = [b for b in bases
            if b["d"].get("place_class") in sc["seed_classes"]
            and b["score"] >= sc["min_seed"]]
    return rows[:18]


def _compose_pass(seeds, pool, cat, ctx, scale, pace, pc):
    """One (scale, pace) pass: single bases, chains and loops."""
    out = []
    tag = {"scale": scale, "pace": pace}

    # --- one base, days out from it ---------------------------------------
    for b in seeds:
        outs = _daytrips_cached(b, cat, ctx)[:pc["daytrips"]]
        for days in BASE_DAYS:
            if days > M.max_base_days(b["d"]):
                continue
            nights = days - 1
            # A relaxed short break still wants its nights in one place, so
            # the floor applies to a single base trip too.
            if nights < pc["min_nights"] and days > 2:
                continue
            # How many days the base fills by itself before anyone goes out.
            # A relaxed trip counts slow days as content, which is the whole
            # point of it; a packed one gives one back so it travels more.
            core = max(1, min(int(round(b["days"])) + pc["core_bonus"], days))
            want_out = max(0, days - core)
            picked = outs[:min(want_out, len(outs))]
            # A base has to fill the days it is offered for, out of its own
            # depth plus the days out it can reach.
            if core + len(picked) < days:
                continue
            out.append(assemble([b], [], [nights], picked, "base", days,
                                cat, ctx, **tag, pc=pc))

    # --- a chain of bases --------------------------------------------------
    routes = search_routes(seeds, pool, ctx, mode="public",
                           max_stops=pc["max_stops"], leg_cap=pc["leg_h"])
    for stops, legs, _ in routes:
        for days in CHAIN_DAYS:
            nights = spread_nights(stops, days - 1, pc)
            if not nights:
                continue
            if any(nights[i] > stops[i]["days"] + 2 for i in range(len(stops))):
                continue
            out.append(assemble(stops, legs, nights, [], "chain", days,
                                cat, ctx, **tag, pc=pc))

    # --- a loop by car -----------------------------------------------------
    loops = search_routes(seeds, pool, ctx, mode="car",
                          max_stops=min(6, pc["max_stops"] + 1))
    for stops, legs, _ in loops:
        if len(stops) < 3:
            continue
        # A loop has to earn the car: on an excellent railway it is the same
        # three cities again with a rental attached.
        if not _loop_earns_it(stops, legs):
            continue
        home = M.leg(stops[-1]["d"], stops[0]["d"])
        if not home.get("ok") or home["car_hours"] > LOOP_MAX_LEG_H:
            continue
        drive_h = sum(lg["car_hours"] for lg in legs) + home["car_hours"]
        for days in LOOP_DAYS:
            if drive_h / days > LOOP_MAX_DAILY_DRIVE_H:
                continue
            nights = spread_nights(stops, days - 1, pc)
            if not nights:
                continue
            trip = assemble(stops, legs + [home], nights, [], "loop", days,
                            cat, ctx, **tag, pc=pc)
            trip["returns_to"] = stops[0]["d"]["id"]
            out.append(trip)
    return out


# Day trips are expensive to work out and do not depend on the pace, so they
# are computed once per base at the widest ask and sliced per pass.
MAX_DAYTRIPS_WIDE = 5
_DAYTRIPS = {}


def _daytrips_cached(b, cat, ctx):
    key = b["d"]["id"]
    if key not in _DAYTRIPS:
        _DAYTRIPS[key] = daytrips_for(b, cat, ctx, want=MAX_DAYTRIPS_WIDE)
    return _DAYTRIPS[key]


def rank_and_cap(trips):
    """Keep the best few per day count and archetype, and never twice the same.

    Two trips that share their first two bases are the same trip to anyone
    reading the page, so the weaker one goes, and each cell keeps entries that
    open on different towns so a country's list is a tour of the country.
    """
    # Two paces can converge. Over seven days relaxed wants 1.75 bases and
    # balanced 2.33, so both land on the same two cities with the same nights,
    # and the only difference left is how many sights the day plan lists. That
    # is not worth a second card, so the identical ones collapse and the pace
    # with the best standing wins.
    exact = {}
    for t in trips:
        key = (t["archetype"], t["days"],
               tuple(s["dest"] for s in t["stops"]),
               tuple(s["nights"] for s in t["stops"]),
               tuple(sorted(d["dest"] for d in t["daytrips"])))
        kept = exact.get(key)
        if not kept or t["score"] > kept["score"]:
            exact[key] = t
    trips = list(exact.values())

    by_cell = defaultdict(list)
    for t in trips:
        # Cross border routes get their own cells. Sharing one, they either
        # crowded out every domestic route (a capital next door usually rates
        # higher than a second city) or never appeared at all.
        by_cell[(t["archetype"], t["days"], t["scale"], t["pace"],
                 len(t["countries"]) > 1)].append(t)
    kept = []
    for cell, rows in sorted(by_cell.items()):
        rows.sort(key=lambda t: (-t["score"], t["id"]))
        chosen = []
        for t in rows:
            head = tuple(s["dest"] for s in t["stops"][:2])
            if any(tuple(c["stops"][i]["dest"] for i in range(min(2, len(c["stops"])))) == head
                   for c in chosen):
                continue
            if any(c["stops"][0]["dest"] == t["stops"][0]["dest"] for c in chosen):
                continue
            # Near duplicates: same set of towns in another order.
            tset = frozenset(s["dest"] for s in t["stops"])
            if any(len(tset & frozenset(s["dest"] for s in c["stops"])) >= max(2, len(tset) - 1)
                   for c in chosen):
                continue
            chosen.append(t)
            if len(chosen) >= KEEP_PER_CELL:
                break
        kept.extend(chosen)
    return kept


# ---------------------------------------------------------------------- shell

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2, default every one")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--out", default=str(TRIP_CACHE / "composed.json"))
    args = ap.parse_args()

    t0 = time.time()
    cat = load_catalogue()
    only = None
    if args.countries:
        only = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    ccs = only or sorted({d["iso2"] for d in cat.values() if d["iso2"]})

    print("composing trips for %s countries from %s places" % (len(ccs), len(cat)))
    # Every country's bases, not only the ones being composed: a chain seeded
    # in Austria has to be able to see Bratislava.
    all_ccs = sorted({d["iso2"] for d in cat.values() if d["iso2"]})
    ctx = build_context(cat, all_ccs, verbose=True)
    print("  ranking bases in %s countries" % len(all_ccs))
    bases_by_cc = {c: _dedupe_same_city(eligible_bases(cat, c, ctx)) for c in all_ccs}
    # The coverage floor, applied where the continent wide bar leaves a
    # country empty. Chisinau rates 3.9 on a scale calibrated against Rome; a
    # traveller with three days in Moldova still deserves the best three days
    # Moldova has, clearly labelled as the best of a short list.
    relaxed = []
    for c in all_ccs:
        if len(bases_by_cc[c]) >= MIN_BASES_FOR_A_COUNTRY:
            continue
        rows = _dedupe_same_city(eligible_bases(cat, c, ctx, THIN_BASE_SCORE))
        for b in rows:
            b["thin"] = True
        if len(rows) > len(bases_by_cc[c]):
            bases_by_cc[c] = rows
            relaxed.append(c)
    print("  %s places can hold a traveller for a night"
          % sum(len(v) for v in bases_by_cc.values()))
    if relaxed:
        print("  coverage floor applied in %s" % ", ".join(relaxed))

    all_trips, stats = [], {}
    for cc in ccs:
        trips, st = compose_country(cc, cat, ctx, bases_by_cc, verbose=args.verbose)
        all_trips.extend(trips)
        stats[cc] = st
        print("  %s: %s trips (%s candidates)"
              % (cc, len(trips), st.get("candidates", 0)))

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": MODEL_VERSION,
        "harvest_at": ctx.get("harvested_at"),
        "n": len(all_trips),
        "stats": stats,
        "trips": all_trips,
    }
    write_json(args.out, payload)
    print("wrote %s trips to %s in %.1f min"
          % (len(all_trips), args.out, (time.time() - t0) / 60))


if __name__ == "__main__":
    main()
