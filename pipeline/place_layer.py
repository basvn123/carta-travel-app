"""place_layer.py - what KIND of place this is, and what you do with it.

Carta had one number for a destination: how good it is. That number was being
asked to answer a question it cannot answer - "should I sleep here or just go
for the afternoon?" - and the answer was leaking into the rating, badly. The
POI-depth term in rating_v2 correlated +0.57 with log(population): a village
was marked down for being a village, so a perfect hill town could not out-rank
a mediocre city. (Of 1,488 rated destinations, only 9 of the 40 that reached
"worth the journey" had fewer than 20,000 people, and 8 of those 9 were
landscapes - Santorini, the Dolomites, Lake Como - not built places.)

So the size-shaped signal moves out of the rating and becomes its own block,
where it is not a flaw but the answer:

  class    metro | city | town | village | area
           what you are looking at. Drives the Destinations tab's circular
           class chips: bigger cities to base yourself in, smaller towns and
           sights to go and see.
  base     0-1, how well this place works as somewhere to SLEEP: beds we can
           actually price, food, transport that does not need a car, enough
           town to come back to in the evening.
  visit_h  hours to see the highlights properly. A village is an afternoon;
           Rome is not.
  depth    0-1, breadth of things to do. This is the old rating term, now
           living where it belongs.

Nothing here is a quality judgement. A 500-person village and a capital both
sit wherever their rating puts them; this block only says what shape of visit
each one is. That separation is the whole point: rating answers "is it
special", place answers "how long, and where do I sleep".

Consumed by: apply_place_layer.py (writes dest.place), the Destinations tab
class chips, and promote_place_candidates.py (which needs to know whether a
new entry arrives as a base or as a day trip).
"""

import math
import re

PLACE_MODEL = {
    "version": "place_v1",
    "classes": ["metro", "city", "town", "village", "area"],
    "class_rule": "population, with an area class for landscapes and regions",
    "thresholds": {"metro": 300000, "city": 50000, "town": 8000},
    "fields": {
        "class": "metro | city | town | village | area",
        "base": "0-1 how well it works as a place to sleep",
        "visit_h": "hours to see the highlights",
        "depth": "0-1 breadth of things to do",
    },
}

METRO_POP = 300000
CITY_POP = 50000
TOWN_POP = 8000

# Same POI weighting the rating uses, so "depth" and the rating's highlights
# term are measuring the same catalogue with the same ruler.
POI_RATE_WEIGHT = {3: 1.0, 2: 0.45}
POI_RATE_WEIGHT_LOW = 0.15
POI_ACTIVE_WEIGHT = 0.30
DEPTH_SATURATION = 34.0     # raw weight at which depth reaches ~0.63

# A place with no population in the gazetteer is a landscape, a coastline or a
# multi-village region: Cinque Terre, Plitvice, Connemara. These read as `area`
# unless one of these tags says otherwise.
AREA_TAGS = {
    "national-park", "wilderness", "fjord", "lake", "island", "alps",
    "mountains", "countryside", "nature", "valley", "remote", "coast",
}

# Some catalogue entries stand for a REGION but still match a gazetteer
# settlement, so they arrive with a population and would class as a village:
# "Amalfi Coast" picks up Amalfi's 4,933 people, "Lake Como" picks up 2,823.
# Calling those villages is wrong in the way a traveller notices - they filter
# to Villages expecting Riquewihr and get a 50 km coastline. The entry's own
# name is the reliable tell, because Carta named it after the region on
# purpose. Matched case-insensitively as whole words against the city name.
AREA_NAME_WORDS = {
    "coast", "coastline", "riviera", "valley", "valleys", "lakes", "lake",
    "islands", "isles", "peninsula", "massif", "gorge", "gorges", "delta",
    "fjord", "fjords", "archipelago", "highlands", "downs", "moors", "dales",
    "alps", "dolomites", "pyrenees", "carpathians", "tatras", "region",
    "national", "park", "reserve", "steppe", "plateau", "cliffs", "caves",
}
# ...except where the word is simply part of a real town's name. A settlement
# called "Lake District" is a region; "Newcastle" is not, and neither of these
# is. Checked before the word test, so a genuine town keeps its class.
AREA_NAME_EXCEPT = {
    "parkstad", "parkano", "lakeview", "regionalny",
}

# Hours to see the highlights, by class, before depth adjusts it.
BASE_VISIT_H = {"metro": 14.0, "city": 8.0, "town": 5.0, "village": 3.0,
                "area": 6.0}
VISIT_H_MIN = 2.0
VISIT_H_MAX = 30.0


def poi_weight(items):
    """Rate-weighted count of real POIs (dupes and noise excluded)."""
    raw = 0.0
    for it in items or []:
        if it.get("dup") or it.get("noise"):
            continue
        if it.get("active"):
            raw += POI_ACTIVE_WEIGHT
        else:
            raw += POI_RATE_WEIGHT.get(it.get("rate"), POI_RATE_WEIGHT_LOW)
    return raw


def depth01(dest):
    """Breadth of things to do, 0-1, saturating."""
    act = dest.get("activities") or {}
    items = act.get("items_full") or []
    if not items:
        n = len(act.get("items") or [])
        return min(1.0, (n * 0.6) / DEPTH_SATURATION) if n else 0.0
    return 1.0 - math.exp(-poi_weight(items) / DEPTH_SATURATION)


def named_as_area(city):
    """True when the entry's own name says it stands for a region.

    Only the name itself is read. Carta's convention is "Place (what it is
    near)", and the parenthetical is context rather than the name: Agrigento
    (Valley of the Temples) is a city of 32,514 people, and Bacharach (Rhine
    Gorge) is a village on the river, neither of them a valley or a gorge.
    """
    head = re.split(r"[(]", city or "", 1)[0]
    words = re.findall(r"[a-z]+", head.lower())
    if any(w in AREA_NAME_EXCEPT for w in words):
        return False
    return any(w in AREA_NAME_WORDS for w in words)


def classify(dest):
    """metro | city | town | village | area."""
    pop = ((dest.get("geonames") or {}).get("population"))
    cats = set(dest.get("categories") or [])
    if not pop:
        return "area"
    if pop >= METRO_POP:
        return "metro"
    # A region that happens to match a gazetteer settlement is still a region.
    # Guarded by size: "Newcastle upon Tyne" must never trip this, and no real
    # city does, because Carta does not name cities after landscapes.
    if pop < CITY_POP and named_as_area(dest.get("city")):
        return "area"
    # An island entry stands for the whole island, but its population is
    # whatever the gazetteer found in the main town: Ibiza reads 49,727, Corfu
    # 40,047, Mykonos 10,704. Classing those as a town or a village is simply
    # wrong - nobody spends an afternoon on Corfu. Below city size they are
    # areas, which is what the app calls an island or a landscape. Above it
    # (Palma, Heraklion) the town really is the destination and stays a city.
    if "island" in cats and pop < CITY_POP:
        return "area"
    if pop >= CITY_POP:
        return "city"
    if pop >= TOWN_POP:
        return "town"
    # A named landscape that happens to have a village on it (Zermatt, Lake
    # Bled, Hallstatt) is still a place you go to and sleep in, so population
    # wins; only the tiny entries that are really a region read as `area`.
    if pop < 1200 and (cats & AREA_TAGS) and not (cats & {"town", "village", "city"}):
        return "area"
    return "village"


def base01(dest, cls, depth):
    """How well this place works as somewhere to sleep, 0-1.

    Not a quality score. A traveller basing themselves somewhere needs beds we
    can price, somewhere to eat, and a way to move without a hire car; a
    beautiful village with none of those is a day trip, and the app should say
    so rather than sending someone to sleep there.
    """
    pop = ((dest.get("geonames") or {}).get("population")) or 0
    lt = dest.get("local_transport") or {}
    acc = dest.get("accommodation") or {}

    # Size: enough town to have an evening. Saturates fast - 20k is plenty.
    size = 1.0 - math.exp(-pop / 9000.0)

    # Lodging we can actually quote at this place rather than borrowed from
    # the country average.
    lodging = 1.0 if acc.get("level") == "city" else 0.45 if acc else 0.2

    # Getting around: a place needing a hire car is a weaker base.
    tq = lt.get("transit_quality")
    transit = {"excellent": 1.0, "good": 0.85, "fair": 0.6,
               "limited": 0.35, "poor": 0.2}.get(tq, 0.5)
    if lt.get("car_needed"):
        transit *= 0.6

    # An airport of its own (or being one) makes a place a natural base.
    gateway = 0.85 if dest.get("tier") == "airport" else 0.0

    score = (0.34 * size + 0.22 * lodging + 0.24 * transit
             + 0.10 * depth + 0.10 * max(gateway, size))
    # You sleep in a village on a landscape, not on the landscape - unless the
    # area is an island or a resort coast with its own airport, where sleeping
    # there is the entire point.
    if cls == "area" and not gateway:
        score *= 0.75
    return round(max(0.0, min(1.0, score)), 3)


def visit_hours(cls, depth):
    """Hours to see the highlights, from class and measured depth."""
    h = BASE_VISIT_H.get(cls, 5.0) * (0.55 + 0.9 * depth)
    return round(max(VISIT_H_MIN, min(VISIT_H_MAX, h)), 1)


def compute_place(dest):
    """The full `place` block for one destination."""
    depth = depth01(dest)
    cls = classify(dest)
    return {
        "class": cls,
        "base": base01(dest, cls, depth),
        "visit_h": visit_hours(cls, depth),
        "depth": round(depth, 3),
        "source": PLACE_MODEL["version"],
    }
