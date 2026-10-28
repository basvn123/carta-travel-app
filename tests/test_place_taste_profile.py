"""The place taste profile (rating v5, T762).

Every rated destination carries twelve values, one per like key of the
planner, each [value 0..1, fact]; the like keys match the app's LIKES; the
carried keys are there; re-running against the frozen reference gives the
same values; and a sanity check: for each like, five places that must be in
the top 10% and five that must be in the bottom half, each with its reason.
The owner checks these lists (register row T762-a).

"Top 10%": fewer than a tenth of the places score strictly higher (many
places tie at the top of a like). "Bottom half": at or under the median
(most places hold no beach, lake, ski lift or spa, so they tie at 0).

Reads app_data/app_data.json (else public/app_data.json).

Runs under pytest, or standalone: python tests/test_place_taste_profile.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import place_taste_profile as tp  # noqa: E402
import rating_config  # noqa: E402

_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
DATA = json.loads((_MASTER if _MASTER.exists() else _WIRE).read_text(encoding="utf-8"))
DESTS = DATA["destinations"]
RATED = {k: d for k, d in DESTS.items() if d.get("rating")}

TOP = {
    "beach": [
        "Nazaré",            # Atlantic surf beaches, Praia do Norte and Praia da Nazaré
        "Albufeira",         # Algarve: sandy coves in the town and along the cliffs
        "Tossa de Mar",      # Costa Brava town beach under its walled old town
        "Cascais",           # Lisbon coast beaches, Guincho 8 km off
        "Riomaggiore",       # Cinque Terre: the village coves and Monterosso's beach
    ],
    "hiking": [
        "Chamonix",          # Mont Blanc massif, the Tour du Mont Blanc starts here
        "Zermatt",           # Matterhorn trails, the Five Lakes Walk
        "Innsbruck",         # Nordkette and the Karwendel at the city's edge
        "Zakopane",          # Tatra National Park on the doorstep
        "Lake District",     # England's fell-walking country
    ],
    "lakes": [
        "Hallstatt",         # on the Hallstatter See, Gosausee 20 minutes off
        "Lake Como",         # the lake itself
        "Lake Bled",         # Bled, with Bohinj half an hour away
        "Lucerne",           # Lake Lucerne
        "Annecy",            # Lac d'Annecy
    ],
    "culture": [
        "Matera",            # UNESCO Sassi, rock churches
        "Rome",              # UNESCO centre, Vatican museums
        "Florence",          # UNESCO centre, Uffizi
        "Prague",            # UNESCO centre, castle district
        "Krakow",            # UNESCO old town, Wawel
    ],
    "city": [
        "Paris", "London", "Berlin", "Madrid",   # the four largest metros
        "Rome",              # capital metro
    ],
    "food": [
        "Bologna",           # the food vibe of guided search (no food source yet)
        "Naples",            # pizza's home, food vibe
        "San Sebastián",     # pintxos, food vibe
        "Lyon",              # bouchons, food vibe
        "Parma",             # ham and Parmigiano, food vibe
    ],
    "nightlife": [
        "Ibiza",             # the clubs (filed as an area, so venues count)
        "Berlin",            # metro, nightlife vibe
        "Amsterdam",         # metro, nightlife vibe
        "Barcelona",         # metro, nightlife vibe
        "Budapest",          # ruin bars, metro
    ],
    "hidden": [
        "Gjógv",             # Faroese village, curated hidden gem
        "Albarracín",        # walled Aragon village, low fame
        "Conques",           # Way of St James abbey village, low fame
        "Theth & Albanian Alps",  # remote valley, low fame
        "Appenzell",         # small Swiss town, low fame
    ],
    "cycling": [
        "Antwerp",           # dense Flemish cycle network, rated routes nearby
        "Bratislava",        # Danube EuroVelo 6 at the door
        "Trier",             # Mosel cycle path
        "Turku",             # Archipelago Trail starts here
        "Ghent",             # Flemish routes, Kraenepoel and Leie paths
    ],
    "ski": [
        "Chamonix",          # Aiguille du Midi cable car, ski areas
        "Zermatt",           # Klein Matterhorn lifts
        "Grindelwald",       # Jungfrau ski region, First and Mannlichen lifts
        "Ortisei",           # Val Gardena, Dolomiti Superski
        "Megève",            # Evasion Mont-Blanc ski area
    ],
    "wellness": [
        "Budapest",          # Gellert and Szechenyi thermal baths, spa vibe
        "Baden-Baden",       # spa town
        "Karlovy Vary",      # spa town
        "Bath",              # Roman baths, Thermae Bath Spa
        "Vichy",             # spa town
    ],
    "islands": [
        "Ibiza", "Palma de Mallorca", "Tenerife South",   # Balearics, Canaries
        "Corfu", "Santorini",                              # Ionian, Cyclades
    ],
}

BOTTOM = {
    "beach": [
        "Prague", "Vienna", "Munich", "Zurich", "Budapest",   # inland: river and lake lidos are not sea beaches
    ],
    "hiking": [
        "Venice",            # lagoon city, no walks within 30 minutes
        "Rotterdam",         # flat port city
        "Seville",           # Guadalquivir plain
        "Mykonos",           # small dry island
        "Benidorm",          # resort strip
    ],
    "lakes": [
        "Seville", "Dubrovnik", "Bari", "Malaga", "Valencia",  # coast or plain, no lake within 30 minutes
    ],
    "culture": [
        "Saas-Fee",          # ski village
        "Lanzarote",         # volcanic island, beaches
        "Gjógv",             # tiny Faroese village
        "Tromsø",            # Arctic base for northern lights
        "Mykines",           # puffin island
    ],
    "city": [
        "Hallstatt", "Gjógv", "Zermatt", "Giethoorn", "Lake Bled",   # villages and an area
    ],
    "food": [
        "Gjógv", "Zermatt", "Tromsø", "Lanzarote", "Hallstatt",      # no food vibe
    ],
    "nightlife": [
        "Hallstatt", "Giethoorn", "Gjógv", "Lake Bled",   # villages
        "Conques",           # abbey village
    ],
    "hidden": [
        "Paris", "London", "Rome", "Barcelona", "Venice",   # the most famous places there are
    ],
    "cycling": [
        "Funchal", "Santorini", "Lanzarote", "Mykonos", "Dubrovnik",   # islands and a cliff coast
    ],
    "ski": [
        "Lisbon", "Seville", "Amsterdam", "Porto", "Athens",   # no ski area or lift within 30 minutes
    ],
    "wellness": [
        "Amsterdam",         # a few saunas, no spa vibe
        "Seville",           # hammams, no spa vibe
        "Benidorm", "Lisbon", "Porto",
    ],
    "islands": [
        "Prague", "Vienna", "Madrid", "Zurich", "Munich",   # landlocked capitals
    ],
}


def _id(name):
    hits = [k for k, d in RATED.items() if d["city"].split(" (")[0] == name]
    assert hits, f"no rated place called {name}"
    return hits[0]


def _values(like):
    return [d["taste"]["likes"][like][0] for d in RATED.values()]


def test_like_keys_match_the_app():
    assert tp.likes_in_app() == tp.LIKES


def test_every_rated_place_has_twelve_values_with_facts():
    for did, d in RATED.items():
        t = d.get("taste")
        assert t, f"{did} has no taste profile"
        assert set(t["likes"]) == set(tp.LIKES), did
        for like, (value, fact) in t["likes"].items():
            assert 0.0 <= value <= 1.0 and isinstance(fact, dict) and fact, (did, like)
        for key in ("size", "crowd_by_month", "car_need", "cost_level"):
            assert key in t, (did, key)


def test_rerun_gives_identical_values():
    taste, _ = tp.compute(DATA, rating_config.reference("taste"))
    moved = [did for did, t in taste.items() if DESTS[did].get("taste") != t]
    assert not moved, f"{len(moved)} profiles move on a re-run, e.g. {moved[:5]}"


def test_sanity_top_ten_percent():
    bad = []
    for like, names in TOP.items():
        vals = _values(like)
        for name in names:
            v = RATED[_id(name)]["taste"]["likes"][like][0]
            above = sum(1 for x in vals if x > v) / len(vals)
            if above >= 0.10:
                bad.append(f"{like}: {name} {v} ({above:.0%} above)")
    assert not bad, bad


def test_sanity_bottom_half():
    bad = []
    for like, names in BOTTOM.items():
        vals = sorted(_values(like))
        median = vals[len(vals) // 2]
        for name in names:
            v = RATED[_id(name)]["taste"]["likes"][like][0]
            if v > median:
                bad.append(f"{like}: {name} {v} (median {median})")
    assert not bad, bad


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
