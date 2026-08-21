"""The trip model: what makes a good base, a reachable day out, a sane hop.

Everything the composer decides runs through this file, so the reasoning is in
one place and a number can be argued with rather than hunted for.

Four questions, four sections:

  1. Can you get from A to B, and how?      leg()
     A faithful Python port of the app's own leg estimator
     (continent-app/src/lib/transport.js plus countryTransport.js and
     groundFares.js), including the landmass rule that decides whether an
     overland route exists at all. Porting rather than inventing matters: a
     composed trip and the same trip opened in the planner must agree about
     how long Vienna to Salzburg takes, or the app contradicts itself.

  2. How good is a place to stay, and for how long?   base_score(), base_days()
     The 0-10 traveller rating is the spine, but a rating says how good a
     place is, never how many days it holds. The place layer's visit_h and
     the count of photographed, described, top rated sights say that.

  3. What can you do from there in a day?    daytrip_candidates()
     A day out has to come back. Travel time each way, both ways, plus real
     hours on the ground, has to fit inside a day, and the target has to be
     worth the journey and different enough from the base to be a change of
     scene rather than a second helping.

  4. Which places belong together?           editorial_link(), theme_tags()
     Distance alone builds routes that look fine on a map and read as
     nonsense. The Wikivoyage Go next graph is a human answer to exactly this
     question and is treated as the strong prior it is.

All costs are per person, in EUR, and every one of them is an estimate. The
wire labels them that way and so does the app.
"""

import math
import re

from trip_sources import fold, haversine_km

# ---------------------------------------------------------------------------
# 1. GETTING THERE
# ---------------------------------------------------------------------------

# Ported from continent-app/src/lib/countryTransport.js. Keep the two in step:
# a composed trip that disagrees with the planner about the same leg is worse
# than no composed trip.
def _p(rail, rail_kmh, rail_eur, rail_overhead_h, bus_kmh, bus_eur, bus_overhead_h):
    return {"rail": rail, "rail_kmh": rail_kmh, "rail_eur": rail_eur,
            "rail_overhead_h": rail_overhead_h, "bus_kmh": bus_kmh,
            "bus_eur": bus_eur, "bus_overhead_h": bus_overhead_h}


COUNTRY_TRANSPORT = {
    "BE": _p("excellent", 90, 0.16, 0.25, 70, 0.07, 0.7),
    "NL": _p("excellent", 95, 0.17, 0.25, 70, 0.07, 0.7),
    "DE": _p("excellent", 110, 0.13, 0.30, 80, 0.06, 0.7),
    "AT": _p("excellent", 100, 0.13, 0.25, 75, 0.06, 0.7),
    "CH": _p("excellent", 95, 0.28, 0.20, 65, 0.10, 0.7),
    "DK": _p("excellent", 100, 0.18, 0.25, 75, 0.07, 0.7),
    "CZ": _p("excellent", 85, 0.08, 0.30, 75, 0.045, 0.6),
    "LU": _p("excellent", 80, 0.00, 0.25, 65, 0.00, 0.5),
    "FR": _p("good", 120, 0.11, 0.35, 80, 0.055, 0.75),
    "ES": _p("good", 115, 0.10, 0.35, 80, 0.05, 0.7),
    "IT": _p("good", 110, 0.10, 0.35, 75, 0.05, 0.7),
    "PT": _p("good", 90, 0.08, 0.35, 75, 0.05, 0.6),
    "GB": _p("good", 100, 0.22, 0.30, 70, 0.07, 0.7),
    "SE": _p("good", 105, 0.13, 0.35, 80, 0.06, 0.75),
    "FI": _p("good", 100, 0.12, 0.35, 75, 0.06, 0.75),
    "PL": _p("good", 90, 0.07, 0.35, 75, 0.04, 0.6),
    "HU": _p("good", 80, 0.06, 0.35, 70, 0.04, 0.6),
    "SK": _p("good", 75, 0.06, 0.35, 70, 0.04, 0.6),
    "NO": _p("fair", 85, 0.16, 0.50, 70, 0.08, 0.75),
    "IE": _p("fair", 85, 0.13, 0.50, 70, 0.06, 0.6),
    "SI": _p("fair", 65, 0.07, 0.55, 70, 0.05, 0.5),
    "HR": _p("fair", 60, 0.06, 0.60, 75, 0.05, 0.4),
    "RO": _p("fair", 55, 0.05, 0.60, 65, 0.04, 0.45),
    "BG": _p("fair", 55, 0.04, 0.60, 65, 0.035, 0.45),
    "GR": _p("fair", 70, 0.07, 0.55, 70, 0.05, 0.45),
    "LT": _p("fair", 80, 0.06, 0.50, 75, 0.04, 0.5),
    "LV": _p("fair", 65, 0.06, 0.50, 70, 0.04, 0.5),
    "EE": _p("fair", 75, 0.06, 0.50, 75, 0.04, 0.5),
    "RS": _p("poor", 50, 0.04, 0.80, 65, 0.035, 0.4),
    "BA": _p("poor", 45, 0.04, 0.80, 60, 0.035, 0.4),
    "ME": _p("poor", 50, 0.04, 0.80, 60, 0.035, 0.4),
    "MK": _p("poor", 45, 0.04, 0.80, 60, 0.03, 0.4),
    "XK": _p("poor", 40, 0.03, 0.80, 60, 0.03, 0.4),
    "AL": _p("none", 0, 0, 0, 60, 0.03, 0.4),
    "MT": _p("none", 0, 0, 0, 40, 0.02, 0.4),
    "CY": _p("none", 0, 0, 0, 60, 0.03, 0.45),
    "IS": _p("none", 0, 0, 0, 65, 0.10, 0.6),
    "LI": _p("fair", 70, 0.15, 0.40, 65, 0.06, 0.4),
    "MC": _p("good", 90, 0.11, 0.30, 60, 0.06, 0.6),
    "MD": _p("poor", 45, 0.03, 0.80, 60, 0.03, 0.45),
    "AD": _p("none", 0, 0, 0, 55, 0.05, 0.5),
    "SM": _p("none", 0, 0, 0, 55, 0.04, 0.5),
    "FO": _p("none", 0, 0, 0, 55, 0.06, 0.6),
}
DEFAULT_PROFILE = _p("fair", 75, 0.10, 0.50, 70, 0.06, 0.6)
RAIL_RANK = {"excellent": 4, "good": 3, "fair": 2, "poor": 1, "none": 0}

DETOUR = 1.30           # road km against straight line, matches car_layer.py
RAIL_DETOUR = 1.17      # rail follows its own alignment, not the road
TRAIN_FLOOR_EUR, TRAIN_FLOOR_KM, BUS_FLOOR_EUR = 4.0, 40.0, 3.0


def profile(iso2):
    return COUNTRY_TRANSPORT.get(iso2, DEFAULT_PROFILE)


def rail_quality(iso_a, iso_b):
    """A leg is only as good as its weaker network."""
    a, b = profile(iso_a)["rail"], profile(iso_b)["rail"]
    return a if RAIL_RANK[a] <= RAIL_RANK[b] else b


# --- Landmass, ported from countryTransport.js landmassOf() -----------------

NI_CITIES = {"Belfast", "Derry", "Cuilcagh Boardwalk", "Giant's Causeway",
             "Mourne Mountains", "Portrush (Causeway Coast)", "The Gobbins"}
GB_ISLANDS = {"Alderney", "Guernsey", "Jersey", "Islay", "Isle of Arran",
              "Isle of Harris (Luskentyre)", "Isle of Man",
              "Isle of Mull (Tobermory)", "Isle of Wight (The Needles)",
              "Isles of Scilly", "Orkney (Kirkwall & Skara Brae)",
              "Rathlin Island"}
IE_ISLANDS = {"Aran Islands (Inishmore)", "Inishbofin"}
FO_FERRY_ONLY = {"Mykines", "Kalsoy", "Suðuroy", "Nólsoy", "Sandoy",
                 "Fugloy", "Svínoy", "Stóra Dímun", "Skúvoy"}
ISLAND_GROUP = {
    "Palermo": "sicily", "Catania": "sicily", "Trapani": "sicily",
    "Alghero": "sardinia", "Cagliari": "sardinia",
    "Olbia (Costa Smeralda)": "sardinia",
    "Palma de Mallorca": "mallorca", "Soller": "mallorca",
    "Tenerife North": "tenerife", "Tenerife South": "tenerife",
    "Chania (Crete)": "crete", "Heraklion (Crete)": "crete",
    "Elounda & Spinalonga": "crete",
    "Ponta Delgada (Azores)": "sao-miguel",
    "Sete Cidades (Sao Miguel)": "sao-miguel",
    "Vila Franca Islet (Sao Miguel)": "sao-miguel",
    "Ajaccio (Corsica)": "corsica", "Bastia (Corsica)": "corsica",
    "Calvi (Corsica)": "corsica", "Figari (Corsica)": "corsica",
    "Fårö (Gotland)": "gotland", "Visby (Gotland)": "gotland",
    "Saaremaa": "saaremaa", "Muhu": "saaremaa",
}
MAINLAND_OVERRIDES = {
    "Lake Bled", "Sveti Stefan", "Krk (Baška)", "Pag Island (Novalja)",
    "Öland", "Svendborg", "Romo",
    "Rügen (Jasmund chalk cliffs)", "Usedom", "Sylt",
    "Runde", "Senja", "Sommarøy", "Vesterålen (Andenes)",
    "Nagu (Turku Archipelago)",
}


def landmass_of(d):
    """Landmass id for a stop. Two stops join overland iff these are equal."""
    if not d:
        return "continent"
    city = d.get("raw_city") or d.get("city") or ""
    iso = d.get("iso2")
    if iso == "IE":
        return ("ie:" + city) if city in IE_ISLANDS else "ireland"
    if iso == "GB":
        if city in NI_CITIES:
            return "ireland"
        return ("gb:" + city) if city in GB_ISLANDS else "britain"
    if iso == "IS":
        return "is:vestmannaeyjar" if city == "Vestmannaeyjar" else "iceland"
    if iso == "MT":
        return ("mt:" + city) if city in ("Gozo", "Comino") else "malta"
    if iso == "CY":
        return "cyprus"
    if iso == "FO":
        # Streymoy, Eysturoy, Vagar and the northern islands are joined by
        # subsea tunnels and causeways and drive as one island. Mykines,
        # Kalsoy and Suduroy are reached by ferry or helicopter only. Treating
        # every Faroese place as its own landmass left the whole country
        # without a single day trip.
        return "fo-main" if city not in FO_FERRY_ONLY else ("fo:" + city)
    if (d.get("transit") or {}).get("road_connected") is False:
        if city in MAINLAND_OVERRIDES:
            return "continent"
        return ISLAND_GROUP.get(city) or ("island:" + city)
    return "continent"


# --- Water the landmass rule cannot see -------------------------------------

# Country pairs with NO land route between them. Both sides are "the
# continent" as far as landmass_of is concerned, and the straight line between
# them is sea. Sweden reaches Denmark over the Oresund bridge and Finland over
# the Tornio border, so neither of those pairs is here; every other Baltic
# neighbour is a ferry.
SEA_PAIRS = frozenset(
    frozenset(p) for p in [
        # Gulf of Finland and the eastern Baltic
        ("FI", "EE"), ("FI", "LV"), ("FI", "LT"), ("FI", "PL"),
        ("FI", "DE"), ("FI", "DK"), ("FI", "IS"),
        # Sweden across the Baltic (its land neighbours are NO and FI)
        ("SE", "EE"), ("SE", "LV"), ("SE", "LT"), ("SE", "PL"), ("SE", "DE"),
        # Denmark across the Skagerrak and the Baltic (its land neighbour is DE)
        ("DK", "NO"), ("DK", "PL"), ("DK", "EE"), ("DK", "LV"), ("DK", "LT"),
        # Norway across the Skagerrak (its land neighbours are SE and FI)
        ("NO", "DE"), ("NO", "PL"), ("NO", "IS"),
        # The Tyrrhenian and the Ionian
        ("IT", "GR"), ("IT", "AL"), ("IT", "ME"), ("IT", "ES"),
        ("ES", "IT"), ("GR", "CY"), ("TR", "CY"),
    ]
)

# Italy reaches the Balkans by road only around the head of the Adriatic, past
# Trieste. Both ends of a leg have to be north of this parallel for the road
# route to resemble the straight line; south of it the line is open water.
ADRIATIC_CORRIDOR_LAT = 45.0
ADRIATIC_EAST = {"SI", "HR", "BA", "ME", "RS", "XK", "MK", "AL", "GR"}


def crosses_open_water(a, b):
    """True when the straight line between two continental stops is sea."""
    ia, ib = a.get("iso2"), b.get("iso2")
    if not ia or not ib or ia == ib:
        return False
    if frozenset((ia, ib)) in SEA_PAIRS:
        return True
    if ia == "IT" and ib in ADRIATIC_EAST or ib == "IT" and ia in ADRIATIC_EAST:
        if a.get("lat", 0) < ADRIATIC_CORRIDOR_LAT or b.get("lat", 0) < ADRIATIC_CORRIDOR_LAT:
            return True
    return False


def car_hours(road_km):
    """One flat speed made a 60 km hop and a 600 km motorway run alike."""
    kmh = 65 if road_km <= 60 else 74 if road_km <= 150 else 84 if road_km <= 400 else 93
    return road_km / kmh + 0.15


def leg(a, b):
    """One overland leg between two catalogue places.

    Returns the recommended public mode and the car alternative, each with
    hours and a per-person fare estimate, or a record with ok=False saying why
    there is no sensible overland route.
    """
    km = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
    if km is None:
        return {"ok": False, "why": "no_coords"}
    if landmass_of(a) != landmass_of(b):
        return {"ok": False, "why": "sea_crossing", "km": round(km)}
    if crosses_open_water(a, b):
        # Same landmass by the island rule, open water by the map. Tallinn to
        # Helsinki is 82 km of Gulf of Finland and about 700 km of road.
        return {"ok": False, "why": "open_water", "km": round(km)}

    road_km = km * DETOUR
    pa, pb = profile(a["iso2"]), profile(b["iso2"])
    quality = rail_quality(a["iso2"], b["iso2"])
    poor_end = ((a.get("transit") or {}).get("transit_quality") == "poor"
                or (b.get("transit") or {}).get("transit_quality") == "poor")

    modes = {}
    if quality != "none":
        rail_km = km * RAIL_DETOUR
        kmh = (pa["rail_kmh"] + pb["rail_kmh"]) / 2
        overhead = (pa["rail_overhead_h"] + pb["rail_overhead_h"]) / 2 + (0.35 if poor_end else 0)
        rate = (pa["rail_eur"] + pb["rail_eur"]) / 2
        fare = 0.0 if rate == 0 else max(TRAIN_FLOOR_EUR, rate * TRAIN_FLOOR_KM, rate * rail_km)
        modes["train"] = {"hours": rail_km / kmh + overhead, "eur": round(fare, 2)}

    bus_kmh = (pa["bus_kmh"] + pb["bus_kmh"]) / 2
    bus_overhead = (pa["bus_overhead_h"] + pb["bus_overhead_h"]) / 2
    bus_rate = (pa["bus_eur"] + pb["bus_eur"]) / 2
    bus_fare = 0.0 if bus_rate == 0 else max(BUS_FLOOR_EUR, bus_rate * road_km)
    modes["bus"] = {"hours": road_km / bus_kmh + bus_overhead, "eur": round(bus_fare, 2)}
    modes["car"] = {"hours": car_hours(road_km), "eur": round(road_km / 100 * 6.5 * 1.75, 2)}

    # The public recommendation: the train wherever the network earns it,
    # otherwise the coach. This mirrors the planner's value-of-time ranking
    # closely enough for a composed itinerary, which never quotes a fare as
    # anything but an estimate.
    if "train" in modes and RAIL_RANK[quality] >= 2 and modes["train"]["hours"] <= modes["bus"]["hours"] + 0.75:
        public = "train"
    elif "train" in modes and RAIL_RANK[quality] >= 3:
        public = "train"
    else:
        public = "bus"

    return {
        "ok": True,
        "km": round(km),
        "road_km": round(road_km),
        "rail_quality": quality,
        "public": public,
        "public_hours": round(modes[public]["hours"], 2),
        "public_eur": modes[public]["eur"],
        "car_hours": round(modes["car"]["hours"], 2),
        "car_eur": modes["car"]["eur"],
        "modes": {k: {"hours": round(v["hours"], 2), "eur": v["eur"]} for k, v in modes.items()},
    }


# ---------------------------------------------------------------------------
# 2. WHAT MAKES A BASE
# ---------------------------------------------------------------------------

SIGHT_HOURS_PER_DAY = 7.0     # an active sightseeing day, walking included
MIN_POIS_FOR_A_DAY = 4        # fewer photographed, described sights than this
                              # and a place is a stop, not a base

# Names that describe a category rather than a sight. A day plan that sends
# someone to "Old Town" and "Church" has told them nothing.
_GENERIC = re.compile(
    r"^(old town|city centre|city center|centre|center|church|chapel|cathedral|"
    r"museum|castle|park|square|market|town hall|bridge|tower|monument|"
    r"cemetery|fountain|station|beach|harbour|harbor|lake|river)$")

# Wikidata carries battles, sieges, treaties, congresses and massacres at the
# coordinates where they happened, and the POI harvest cannot tell them from
# buildings. "Battle of Vienna" was the top thing to see in Vienna. An event
# is a thing that HAPPENED, not a thing you can go and look at.
_EVENT_NAME = re.compile(
    "^(battle|siege|sack|massacre|treaty|peace|congress|council|synod|"
    "revolt|uprising|liberation|bombing|assassination|coronation) of ",
    re.I)
_EVENT_WORD = re.compile(
    "(^| )(putsch|pogrom|earthquake|eruption|flood|plague|shipwreck)($| |,)",
    re.I)
_EVENT_DESC = re.compile(
    "(^| )(battle|siege|treaty|massacre|uprising|revolt|congress of|"
    "military conflict|military operation|armed conflict|war between|"
    "historical event|series of events)($| |,|\.)",
    re.I)


def _is_event(name, desc):
    """A thing that HAPPENED here, rather than a thing you can look at.

    Wikidata carries battles, sieges, treaties and congresses at the
    coordinates where they took place, and the POI harvest cannot tell them
    from buildings. Until this filter existed, the top thing to see in Vienna
    was the Battle of Vienna.
    """
    text = name or ""
    if _EVENT_NAME.search(text) or _EVENT_WORD.search(text):
        return True
    return bool(_EVENT_DESC.search(desc or ""))


# Notable, but not somewhere a visitor spends an afternoon. The harvest rates
# these highly because Wikidata does, and Wikidata is answering a different
# question. A university campus, a football ground and a regional hospital are
# all real landmarks and none of them belongs in a sightseeing day.
_NOT_A_SIGHT = re.compile(
    "(^| )(university|college|polytechnic|hospital|clinic|stadium|arena|"
    "school|gymnasium|prison|barracks|courthouse|airport|bus station|"
    "railway station|company|corporation|headquarters|office building|"
    "shopping mall|shopping centre|shopping center|supermarket|"
    "power station|factory|warehouse|business park)($| |,|\.)",
    re.I)

# A wordmark is not a photograph of a place. Commons hosts plenty of them and
# the image harvester takes whatever the article leads with.
_LOGO_IMG = re.compile(
    "(logo|wordmark|coat[_ ]of[_ ]arms|wappen|seal[_ ]of|emblem|"
    "escudo|blason|stemma|\.svg)",
    re.I)


def _is_not_a_sight(name, kind, desc):
    """True when this is a landmark rather than a thing to go and see."""
    if _NOT_A_SIGHT.search(desc or ""):
        return True
    return bool(_NOT_A_SIGHT.search(name or ""))


def _usable_photo(url):
    """A photograph of the place, rather than its badge."""
    return bool(url) and not _LOGO_IMG.search(url)


def top_pois(dest, want=14, need_media=True):
    """The sights a day plan can actually send someone to, best first.

    Ranked by the significance rate the POI engine assigns (0 to 3), then by
    having a photograph and a one line description, because a stop nobody can
    picture is a worse stop. Near duplicates within 120 m of an equally named
    neighbour are dropped: the harvesters produce "Grand Place" and
    "Grand-Place" as separate rows more often than is comfortable.
    """
    rows = []
    for p in dest.get("pois") or []:
        name = (p.get("name") or "").strip()
        if not name or p.get("lat") is None or p.get("lon") is None:
            continue
        if _GENERIC.match(fold(name)):
            continue
        if _is_event(name, p.get("desc")):
            continue
        if _is_not_a_sight(name, p.get("kind"), p.get("desc")):
            continue
        rate = p.get("rate") or 0
        if rate < 2:
            continue
        has_img = _usable_photo(p.get("img"))
        has_desc = bool(p.get("desc"))
        if need_media and not has_img:
            continue
        rows.append({
            "name": name, "kind": p.get("kind"), "lat": p["lat"], "lon": p["lon"],
            "rate": rate, "img": p.get("img") if has_img else None,
            "desc": p.get("desc"),
            "wiki": p.get("wiki"), "heritage": bool(p.get("heritage")),
            "active": bool(p.get("active")),
            "_sort": (rate, 1 if has_img else 0, 1 if has_desc else 0),
        })
    rows.sort(key=lambda r: r["_sort"], reverse=True)

    kept = []
    for r in rows:
        key = fold(r["name"])
        clash = False
        for k in kept:
            if fold(k["name"]) == key:
                clash = True
                break
            d = haversine_km(r["lat"], r["lon"], k["lat"], k["lon"])
            if d is None:
                continue
            # Two rows this close are one stop on any day plan, whatever the
            # harvest called them. "Galleria degli Uffizi" and "Piazzale degli
            # Uffizi" sit fifty metres apart and are the same afternoon; the
            # name test alone could not see it, because the names share no
            # opening word. The higher rated one is already first, so the
            # second is the one dropped.
            if d < 0.07:
                clash = True
                break
            if d < 0.15 and key[:6] == fold(k["name"])[:6]:
                clash = True
                break
        if not clash:
            kept.append(r)
        if len(kept) >= want:
            break
    for r in kept:
        r.pop("_sort", None)
    return kept


def base_days(dest):
    """How many days a place holds before it starts repeating itself.

    Two independent readings, and the smaller wins because over-promising a
    base is how a four day trip ends with a wasted afternoon:
      the place layer's visit_h, the modelled hours a visitor spends here,
      divided by an active day;
      the count of photographed, described, top rated sights, at roughly six
      a day.
    """
    hours = dest.get("visit_h")
    by_hours = (hours / SIGHT_HOURS_PER_DAY) if hours else None
    n = len(top_pois(dest, want=40))
    by_pois = min(n / 6.0, 4.0) if n else 0.0
    if by_hours is None:
        est = by_pois
    elif not by_pois:
        est = by_hours
    else:
        # Weighted, not min(): visit_h is a place-CLASS constant (a metro gets
        # 16.8 h, a city 9.6, a village 3.4), so taking the minimum let the
        # class alone decide and gave Salzburg the same day and a half as any
        # other city in the catalogue. The sight count is what separates them.
        est = 0.62 * by_hours + 0.38 * by_pois
    return max(0.5, min(4.0, round(est * 2) / 2))       # half day steps, cap 4


# How many nights a place can hold before it stops being somewhere to stay.
# Not a judgement on the place: Hallstatt is one of the loveliest villages in
# Europe and 779 people live there, so four nights of it is a rental cottage
# rather than a base. "area" is a road, a pass, a valley or a park; it can be
# the best day of a trip and is never a bed.
MAX_NIGHTS_BY_CLASS = {"metro": 5, "city": 4, "town": 3, "village": 2, "area": 3}
MAX_BASE_DAYS_BY_CLASS = {"metro": 6, "city": 6, "town": 5, "village": 4, "area": 4}

# The smallest place with lodging worth planning a night around. Below this an
# "area" is a road, a pass, a viewpoint or a glacier lagoon.
AREA_MIN_POP = 500


def max_nights(dest):
    return MAX_NIGHTS_BY_CLASS.get(dest.get("place_class"), 2)


def max_base_days(dest):
    return MAX_BASE_DAYS_BY_CLASS.get(dest.get("place_class"), 3)


def can_be_base(dest):
    """Somewhere with beds, sights and a name on a station board.

    The "area" class is the awkward one. It covers both the Grossglockner High
    Alpine Road, which is a road, and Gozo, Paphos and the High Tatras, which
    are regions people obviously sleep in. Refusing all of them left Malta,
    Cyprus and half of Iceland without a single trip; accepting all of them
    offered a mountain pass as a base. A named settlement with people living
    in it is what separates the two.
    """
    acc = dest.get("accommodation") or {}
    if not acc.get("per_person_night_eur"):
        return False
    pop = dest.get("pop")
    cls = dest.get("place_class")
    if cls == "area":
        return bool(pop and pop >= AREA_MIN_POP)
    if cls == "village" and (pop is None or pop < 250):
        return False
    return True


DESIGNATION_WEIGHT = {
    "unesco_whc": 1.0, "capital_of_culture": 0.5, "europa_nostra": 0.4,
    "green_capital": 0.3, "blue_flag": 0.2,
}


def base_score(dest, ctx):
    """0 to 10: how good this place is to sleep in and see out from.

    The traveller rating carries most of it, because that is the number the
    whole app already stands behind. What the rating cannot say is whether a
    place has enough to fill a day, whether a human travel editor thought it
    worth a guide, and whether anyone actually goes: those three adjust it.
    """
    rating = dest.get("rating")
    if rating is None:
        return 0.0
    score = float(rating)

    # Depth. A rating of 7.5 on a place with three sights is a good afternoon.
    n_top = len(top_pois(dest, want=24))
    if n_top >= 12:
        score += 0.5
    elif n_top >= 8:
        score += 0.25
    elif n_top < MIN_POIS_FOR_A_DAY:
        score -= 1.2

    # Editorial corroboration: a human wrote a guide, and how far they took it.
    status = (ctx.get("wv_status") or {}).get(dest["id"])
    score += {"star": 0.9, "guide": 0.6, "usable": 0.25}.get(status, 0.0)

    # Designations, capped so a city does not win on paperwork alone.
    weight = sum(DESIGNATION_WEIGHT.get(x.get("kind"), 0.0)
                 for x in dest.get("designations") or [])
    score += min(0.8, weight * 0.4)

    # Somewhere to sleep, measured rather than borrowed from the country.
    acc = dest.get("accommodation") or {}
    if acc.get("price_source", "").startswith("inside_airbnb_city"):
        score += 0.3
    elif not acc.get("per_person_night_eur"):
        score -= 0.6

    # Do people go? Eurostat nights for the region, as corroboration only: a
    # quiet region costs nothing, a busy one earns a little.
    nights = region_nights(dest, ctx)
    if nights and nights > 2_000_000:
        score += 0.3
    elif nights and nights > 500_000:
        score += 0.15

    # Deliberately NOT clamped at 10. This is a ranking number: clamping it
    # flattened Vienna, Salzburg and Florence to an identical 10.0 and the
    # composer lost the ability to tell them apart. The wire clamps once, at
    # export, where a person reads it.
    return round(max(0.0, score), 2)


def region_nights(dest, ctx):
    code = (dest.get("crowding") or {}).get("nuts3")
    if not code:
        return None
    row = (ctx.get("demand") or {}).get(code)
    return (row or {}).get("nights")


# ---------------------------------------------------------------------------
# 3. WHAT YOU CAN DO IN A DAY FROM THERE
# ---------------------------------------------------------------------------

DAY_LENGTH_H = 11.0           # door to door, the honest outer edge of a day out
MIN_ON_SITE_H = 4.0           # under this it is a look, not a visit
MIN_ON_SITE_CAR_H = 5.0       # driving there and back is work; earn more of a day
DAYTRIP_MAX_KM = 150          # beyond this even a fast train stops being a day
DAYTRIP_MIN_KM = 12           # closer than this it is part of the same city

# Alpine and fjord roads are not straight lines with a detour factor on them.
# Without this, a pass crossing that takes four hours read as two, and the
# composer offered the Dolomites as a day out from the Salzkammergut.
MOUNTAIN_CATS = {"alps", "mountains", "skiing", "fjord", "fjords", "valley"}
MOUNTAIN_FACTOR = 1.28


def _terrain_factor(a, b):
    hard = (MOUNTAIN_CATS & set(a.get("categories") or [])
            or MOUNTAIN_CATS & set(b.get("categories") or []))
    return MOUNTAIN_FACTOR if hard else 1.0


def _train_day_ok(base, target, km):
    """Would a train actually get you there and back in a day?

    The leg estimator prices a direct service at network speed, which is right
    for a main line and wrong for a lake with no station and for a cross border
    hop that in practice means two changes. Both cases were producing day trips
    nobody could take: a station at each end, and beyond about a hundred
    kilometres the train has to stay inside one network.
    """
    tq_a = (base.get("transit") or {}).get("transit_quality")
    tq_b = (target.get("transit") or {}).get("transit_quality")
    if tq_a in ("poor", "none") or tq_b in ("poor", "none"):
        return False
    if base.get("iso2") != target.get("iso2") and km > 110:
        return False
    return True


def daytrip_reach(base, target):
    """Is `target` a day out from `base`, and how does one get there?

    A day trip has to come back. Travel each way, both ways, plus real hours
    on the ground has to fit a day, which is what rules out the pretty town
    three hours down a branch line that every generated itinerary offers.
    """
    km = haversine_km(base["lat"], base["lon"], target["lat"], target["lon"])
    if km is None or km > DAYTRIP_MAX_KM or km < DAYTRIP_MIN_KM:
        return None
    lg = leg(base, target)
    if not lg.get("ok"):
        return None
    terrain = _terrain_factor(base, target)
    options = []
    if "train" in lg["modes"] and RAIL_RANK[lg["rail_quality"]] >= 2 and _train_day_ok(base, target, km):
        options.append(("train", lg["modes"]["train"]["hours"], lg["modes"]["train"]["eur"]))
    options.append(("bus", lg["modes"]["bus"]["hours"] * terrain, lg["modes"]["bus"]["eur"]))
    options.append(("car", lg["modes"]["car"]["hours"] * terrain, lg["modes"]["car"]["eur"]))
    best = None
    for mode, hours, eur in options:
        on_site = DAY_LENGTH_H - hours * 2
        floor = MIN_ON_SITE_CAR_H if mode == "car" else MIN_ON_SITE_H
        if on_site < floor:
            continue
        if best is None or hours < best[1]:
            best = (mode, hours, eur, on_site)
    if not best:
        return None
    mode, hours, eur, on_site = best
    return {"mode": mode, "km": lg["km"], "minutes": int(round(hours * 60)),
            "eur": eur, "on_site_h": round(on_site, 1)}


# How different is the target from the base? A second walled old town is a
# weaker day out than a lake, and this is what says so.
SCENE = {
    "city": "urban", "historic": "urban", "art": "urban", "unesco": "urban",
    "medieval": "urban", "baroque": "urban", "renaissance": "urban",
    "roman": "ruins", "byzantine": "ruins", "ruins": "ruins",
    "beach": "coast", "island": "coast", "fjord": "coast", "fjords": "coast",
    "lake": "water", "lakes": "water",
    "alps": "mountain", "mountains": "mountain", "skiing": "mountain",
    "nature": "green", "national-park": "green", "wilderness": "green",
    "valley": "green", "countryside": "green", "volcanic": "green",
    "food": "table", "wine": "table",
}


def scenes(dest):
    return {SCENE[c] for c in dest.get("categories") or [] if c in SCENE}


def daytrip_score(base, target, reach, ctx):
    """How good a day out this is, 0 to 10ish, before the composer ranks it."""
    score = base_score(target, ctx) * 0.8
    # A change of scene is most of the point of leaving town for the day.
    new = scenes(target) - scenes(base)
    score += 0.8 * min(2, len(new))
    # Time on the ground, not time in a seat.
    score += (reach["on_site_h"] - MIN_ON_SITE_H) * 0.25
    if reach["mode"] == "train":
        score += 0.3            # no parking, no driving, town centre to town centre
    if target.get("hidden_gem"):
        score += 0.4
    return round(score, 2)


# ---------------------------------------------------------------------------
# 4. WHICH PLACES BELONG TOGETHER
# ---------------------------------------------------------------------------

def build_editorial_graph(cat, routes):
    """Resolve Wikivoyage Go next titles onto catalogue ids.

    A link only counts when the target name matches a catalogue place in a
    country the source could plausibly reach. Titles like "Europe", "UNESCO
    World Heritage List" and "Austria" fall out on their own, which is why the
    harvester does not try to filter them: resolution is the filter.
    """
    by_name = {}
    for did, d in cat.items():
        by_name.setdefault(fold(d["city"]), []).append(did)
        # "Salzburg (city)" and "Baden (Austria)" are how Wikivoyage
        # disambiguates; the bare name is what the catalogue holds.
        stripped = fold(re.sub(r"\s*\([^)]*\)\s*$", "", d["city"]))
        if stripped != fold(d["city"]):
            by_name.setdefault(stripped, []).append(did)

    graph, resolved = {}, 0
    for did, titles in (routes.get("gonext") or {}).items():
        src = cat.get(did)
        if not src:
            continue
        out = []
        for title in titles or []:
            key = fold(re.sub(r"\s*\([^)]*\)\s*$", "", title))
            best, best_km = None, None
            for cand in by_name.get(key, []):
                if cand == did:
                    continue
                t = cat[cand]
                km = haversine_km(src["lat"], src["lon"], t["lat"], t["lon"])
                # Go next is about the region you are in, not the continent.
                if km is None or km > 600:
                    continue
                if best_km is None or km < best_km:
                    best, best_km = cand, km
            if best and best not in out:
                out.append(best)
        if out:
            graph[did] = out
            resolved += len(out)
    return graph, resolved


def resolve_itineraries(cat, routes, min_stops=3):
    """Wikivoyage itinerary articles, reduced to the catalogue stops they name.

    Kept only when at least `min_stops` of the article's linked places resolve
    inside ONE country group and sit within a plausible corridor of each
    other, which is what keeps "Across Canada by train" out of a European
    catalogue without a hand written country list.
    """
    by_name = {}
    for did, d in cat.items():
        by_name.setdefault(fold(d["city"]), []).append(did)
    out = []
    for art in routes.get("itineraries") or []:
        hits = []
        for title in art.get("places") or []:
            key = fold(re.sub(r"\s*\([^)]*\)\s*$", "", title))
            cands = by_name.get(key) or []
            if len(cands) == 1:
                hits.append(cands[0])
            elif len(cands) > 1 and hits:
                anchor = cat[hits[-1]]
                best, best_km = None, None
                for c in cands:
                    km = haversine_km(anchor["lat"], anchor["lon"], cat[c]["lat"], cat[c]["lon"])
                    if km is not None and (best_km is None or km < best_km):
                        best, best_km = c, km
                if best and best_km is not None and best_km < 500:
                    hits.append(best)
        seen, ordered = set(), []
        for h in hits:
            if h not in seen:
                seen.add(h)
                ordered.append(h)
        if len(ordered) < min_stops:
            continue
        # One corridor, not a scatter. An itinerary article links plenty of
        # places in passing ("Channel Tunnel" names Amsterdam and Nottingham),
        # so consecutive resolved stops have to stay within a day's travel of
        # each other AND on the same landmass, or the article is link soup
        # rather than a route.
        span_ok = True
        for i in range(len(ordered) - 1):
            p, q = cat[ordered[i]], cat[ordered[i + 1]]
            km = haversine_km(p["lat"], p["lon"], q["lat"], q["lon"])
            if km is None or km > 220 or landmass_of(p) != landmass_of(q):
                span_ok = False
                break
        if not span_ok:
            continue
        out.append({"title": art["title"], "url": art["url"],
                    "mode": art.get("mode"), "status": art.get("status"),
                    "stops": ordered})
    return out


# ---------------------------------------------------------------------------
# Themes and seasons
# ---------------------------------------------------------------------------

THEME_FROM_CATEGORY = {
    "city": "city", "historic": "history", "medieval": "history",
    "renaissance": "history", "baroque": "history", "roman": "history",
    "byzantine": "history", "ottoman": "history", "ruins": "history",
    "castle": "history", "cathedral": "history", "unesco": "history",
    "art": "art", "beach": "coast", "island": "coast", "fjord": "coast",
    "fjords": "coast", "lake": "nature", "lakes": "nature", "nature": "nature",
    "national-park": "nature", "wilderness": "nature", "valley": "nature",
    "countryside": "nature", "volcanic": "nature",
    "alps": "mountains", "mountains": "mountains", "skiing": "mountains",
    "food": "food", "wine": "food", "nightlife": "nightlife",
    "party": "nightlife", "romantic": "romantic", "iconic": "romantic",
}
# The order themes read in on a card, most defining first.
THEME_ORDER = ["history", "art", "city", "coast", "nature", "mountains",
               "food", "nightlife", "romantic"]


def theme_tags(dests, layer_hits=None):
    """The themes a whole trip is about, in reading order."""
    found = set()
    for d in dests:
        for c in d.get("categories") or []:
            th = THEME_FROM_CATEGORY.get(c)
            if th:
                found.add(th)
    # What is around a base widens its themes, with one exception: a swimming
    # spot on a lake is not a coast, and calling Salzburg coastal because
    # there is a bathing beach on the Wallersee is the kind of small lie that
    # makes a reader stop trusting the rest of the card.
    coastal = any("coast" == THEME_FROM_CATEGORY.get(c)
                  for d in dests for c in d.get("categories") or [])
    for hit in layer_hits or []:
        theme = {"beach": "coast", "lake": "nature",
                 "mountain": "mountains", "trail": "nature"}[hit["kind"]]
        if theme == "coast" and not coastal:
            continue
        found.add(theme)
    return [t for t in THEME_ORDER if t in found][:5]


def season_months(dests):
    """The months every stop is at its best, and the months some stop is not.

    The intersection first, because a trip is only as good as its worst stop
    that week. When the intersection is empty (an Alpine pass and a southern
    beach do not share a season) the union stands in, and the wire says which
    of the two it is so the app can be honest about it.
    """
    sets = []
    for d in dests:
        sets.append(set(best_months(d)))
    sets = [x for x in sets if x]
    if not sets:
        return {"best": [], "basis": "none"}
    inter = set.intersection(*sets)
    if inter:
        return {"best": sorted(inter), "basis": "all"}
    union = sorted(set.union(*sets))
    return {"best": union, "basis": "some"}


def best_months(dest):
    """The months this place is at its best, from whichever shape it carries.

    The master keeps the WorldClim reading under climate.summary.best_months;
    the served wire slims it to climate.best. Reading only the served spelling
    is why every trip in Austria once warned that its stops shared no season
    when all of them agree on May to September.
    """
    c = dest.get("climate") or {}
    if isinstance(c.get("best"), list) and c["best"]:
        return list(c["best"])
    summary = c.get("summary") or {}
    return list(summary.get("best_months") or [])


def walkability(pois):
    """How far most of a base's sights sit from the middle of them, in km.

    A bounding box diagonal called half of Europe "spread out" the moment one
    peak or one abbey sat ten kilometres outside town, which is true of almost
    every city worth visiting. What a traveller actually wants to know is
    whether the bulk of it is walkable, so this returns the radius that holds
    three quarters of the sights.
    """
    if len(pois) < 2:
        return 0.0
    lat = sum(p["lat"] for p in pois) / len(pois)
    lon = sum(p["lon"] for p in pois) / len(pois)
    dists = sorted((haversine_km(lat, lon, p["lat"], p["lon"]) or 0) for p in pois)
    idx = max(0, int(round(0.75 * len(dists))) - 1)
    return round(dists[idx], 1)


def nightly_eur(dest, group=2):
    """Whole-group nightly stay estimate, the same anchors the receipt uses."""
    acc = dest.get("accommodation") or {}
    pp = acc.get("per_person_night_eur")
    if not pp:
        return None
    return round(pp * max(1, group), 2)


def nearest_layer_hits(dest, layers, radius_km=45, want=6):
    """Beaches, lakes, mountains and hikes close enough to matter to a base."""
    out = []
    for row in layers or []:
        km = haversine_km(dest["lat"], dest["lon"], row["lat"], row["lon"])
        if km is None or km > radius_km:
            continue
        out.append({**row, "km": round(km, 1)})
    out.sort(key=lambda r: (-(r.get("score") or 0), r["km"]))
    # One of each kind first, so a base does not report six lakes and no peak.
    picked, seen_kind = [], set()
    for r in out:
        if r["kind"] not in seen_kind:
            picked.append(r)
            seen_kind.add(r["kind"])
    for r in out:
        if len(picked) >= want:
            break
        if r not in picked:
            picked.append(r)
    return picked[:want]


def bearing(a, b):
    """Compass bearing from a to b, for spreading day trips around a base."""
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlon = math.radians(b["lon"] - a["lon"])
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360
