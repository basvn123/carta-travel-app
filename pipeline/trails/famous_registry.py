"""The famous-trail registry: what a region is embarrassed to be missing.

CARTA_TRAILS_BUILD_BRIEF.md Phase 1, and the centre of
docs/TRAILS_DATA_QUALITY.md. This module answers one question the catalogue
could not answer before: for every region Carta covers, WHICH walks should be
published there? Until that list exists as evidence, "did we get the famous
ones" can only be answered with "probably", and 17,619 published rows with
the Sentier des Roches missing look exactly like 17,619 good ones.

Why the old recall net could not do this, verified in the source before this
module was written:

  curate.FAMOUS is a per-COUNTRY list of name needles, matched with
  named_famous() against rows ALREADY IN THE POOL. It is a fine tiebreaker
  and a useless instrument: a trail that never got ingested is not in the
  pool, so no needle can notice it is gone. A country list also cannot
  promise a region page anything, and the region page is what a traveller
  actually lands on.

So the registry is per NUTS3 region and per GMBA range, built from evidence
rather than memory, and it is deliberately allowed to name trails the
catalogue does NOT have. That is the whole point: the rows that do not match
are the product's to-do list. coverage_report.py does the matching.

Evidence, strongest first (the brief's order, and the order of the weights):

  1. Wikidata (WDQS/QLever)  items that are instance-of a hiking trail and
     carry coordinates inside one of the 43 countries. Gives the label, the
     aliases, the coordinate, the sitelink count and P2043 length when set.
  2. Wikipedia pageviews     average daily views over the last 12 full
     months, via enrich_activities.pageviews_avg, cached in
     cache/trail_pageviews.json. The closest thing to "do people look this
     up" that is free and reproducible.
  3. OSM fame tags           every RELATION and every WAY carrying
     wikipedia/wikidata together with a hiking-ish tag, read from the
     Geofabrik extracts already on disk. This is the step that finds
     way-only trails, and the reason Sentier des Roches can be named here
     while being unpublishable by the current ingest.
  4. National portals        crosscheck_portals.py's per-country sources.
  5. The seed list           SEEDS below, the brief's section 9 recall net,
     resolved against 1-4. A seed that resolves to nothing ships as
     unresolved:true rather than being dropped, because a name we cannot
     resolve is a finding, not a blank.

Never Overpass in bulk: the extracts under data/raw/geofabrik are the same
data without the rate limit, and a KeyFilter on wikidata/wikipedia reads a
national extract in about 30 seconds (measured: France 31s against 783s for
a tag-blind pass, 25x, which is what makes a 44-country sweep a coffee break
rather than an overnight job).

This module HARVESTS AND SCORES ONLY. It publishes nothing, gates nothing and
never writes to the wire or to the staging DB. Re-running it is always safe.

Usage, from the repo root:
    python pipeline/trails/famous_registry.py --countries FR,CH
    python pipeline/trails/famous_registry.py --all
    python pipeline/trails/famous_registry.py --all --refresh   # re-scan OSM
    python pipeline/trails/famous_registry.py --countries FR --offline

Output: data/trails/famous_registry.json  (committed, so a regression in the
evidence shows up in a diff like any other change).

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "regions"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import enrich_activities as ea  # noqa: E402  (pageviews_avg, PV window)
import harvest_activities as ha  # noqa: E402  (sitelink_counts, WDQS cache)
from ingest_osm_routes import COUNTRIES, cached_extract  # noqa: E402

REGISTRY = ROOT / "data" / "trails" / "famous_registry.json"
# The full evidence dump, including the ~163,000 `place` candidates (a named
# summit or lake with an article and no path). Local only: at 87 MB compact
# it would add a nine-figure line count to the repo on every monthly run,
# which defeats the point of committing the registry to see regressions in a
# diff. The committed file carries every `trail` row, which is what the
# coverage gate acts on.
REGISTRY_FULL = ROOT / "data" / "trails" / "famous_registry_full.json"
OSM_FAME_CACHE = ROOT / "cache" / "trails_osm_fame.json"
WD_CACHE = ROOT / "cache" / "trails_wikidata_famous.json"
PV_CACHE = ROOT / "cache" / "trail_pageviews.json"
PORTAL_DIR = ROOT / "data" / "reports" / "trails_portals"

# Same knobs popularity.py uses against the same pageviews API.
PV_WORKERS = 8
PV_DELAY_S = 0.05

# Wikidata classes that a famous walk is an instance of. Deliberately wider
# than "hiking trail": Cirque de Gavarnie is a cirque, Trolltunga a rock
# formation, Gornergrat a mountain, and a traveller searching for the walk
# does not care which. The hiking-ness is re-established downstream by the
# OSM evidence and by the region assignment, so a wide net here costs a few
# unmatched rows and buys the names people actually search for.
WD_CLASSES = {
    "Q2143825": "hiking trail",
    "Q17008256": "long-distance trail",
    "Q1826691": "via ferrata",
    "Q1030034": "mountain pass",
    "Q8502": "mountain",
    # NOT "mountain range" (Q207326). A range is where walks are, not a walk:
    # including it put "Alpidischer Gebirgsguertel", a tectonic belt spanning
    # a continent, fifth in Liechtenstein's ranking. Ranges enter this layer
    # as the `range` field on a row, which is what they are good for.
    "Q23442": "island",              # island crossings (Faroes, Greek isles)
    "Q1437459": "cirque",
    "Q34763": "gorge",               # Samaria, Vikos, Verdon
    "Q8072": "volcano",              # Teide, Vesuvio, Stromboli
    "Q23397": "lake",                # Morskie Oko, Oeschinensee
    "Q34038": "waterfall",           # Krimmler, Glymur, Savica
    "Q179700": "rock formation",     # Trolltunga, Kjeragbolten, Pravcicka
    "Q46169": "national park",
    "Q473972": "protected area",
}

# Which of those classes IS a walk, as against a place a walk goes to.
#
# Both belong in the registry and the difference decides what a region is
# HELD TO. "Trolltunga" is a rock formation and the walk to it is the famous
# walk, so a place row is a legitimate candidate. But a country has hundreds
# of named summits and lakes with an article and no trail, and holding every
# region's top three to those would bury the real misses (measured on
# Liechtenstein: 33 of 36 misses were summits and lakes). So:
#
#   kind "trail"  a walk by class, or fame-tagged hiking ways in OSM. The
#                 gate holds a region to these.
#   kind "place"  a feature people walk to. Reported, ranked, never gating
#                 on its own, because "no trail is published to this lake"
#                 is a weaker claim than "this named path is missing".
TRAIL_CLASSES = {"Q2143825", "Q17008256", "Q1826691"}

# A hiking-ish OSM object: the brief's rule, verbatim. Either a walking route
# relation, or a walkable way that somebody bothered to name or grade. The
# name-or-sac_scale test is what keeps 300,000 anonymous field paths out.
ROUTE_VALUES = {"hiking", "foot", "walking"}
WALK_HIGHWAYS = {"path", "footway", "track", "steps", "bridleway"}

# The highway values that are a WALK rather than a way somebody walks along.
# A footway is the odd one out and it is the whole problem: a named footway is
# usually a pavement carrying a street name, or the deck of a bridge, or the
# edge of a square. derive_routes has always refused to SEED a cluster on one
# for exactly this reason; this registry admitted them as famous trails.
TRAIL_HIGHWAYS = {"path", "track", "bridleway", "steps"}

# Tags that say "somebody maps this as a trail" rather than "this way has a
# name". Measured on Luxembourg: of the 48 fame-tagged walkable ways this scan
# admitted, 45 carried none of these, and those 45 were streets, squares,
# bridges and a statue. On France the same test cuts 557 fame groups to 28
# and keeps the Sentier des Roches (15 of its 18 ways are graded).
TRAIL_SIGNAL_KEYS = ("sac_scale", "trail_visibility", "osmc:symbol",
                     "network", "marked_trail:hiking", "marked_trail:foot")

# A way carrying any of these is a named FEATURE that a path runs over,
# through or beside, not a walk: a bridge, a tunnel, a lake, a square, a
# monument. The first three were already here for the Spiersbachbruecke; the
# rest were added in Phase 2 when the 8,893 way_only_not_derived misses turned
# out to be mostly Via Roma, Bahnhofsplatz, Millennium Bridge and Ketelmeer.
NON_WALK_KEYS = ("man_made", "bridge:name", "tunnel:name",
                 "natural", "water", "place", "landuse", "historic")


def kind_of(osm):
    """"trail" or "place" for one OSM fame group.

    This used to be the single line `row["kind"] = "trail"`, on the reasoning
    that OSM tagging a named walkable way is direct evidence of a path and
    outranks whatever class Wikidata filed the feature under. The first half
    of that is right and the second half was the bug: a fame tag on a walkable
    way is usually evidence that the way TOUCHES something famous, not that
    the way IS a famous walk. Via Roma, Bahnhofsplatz, Gustav Adolfs Torg,
    the Millennium Bridge, Solkanski most, Ketelmeer (a lake) and Karl XII:s
    staty (a statue) all reached the registry as famous TRAILS, and then
    reached the coverage report as 8,864 of its 8,893 `way_only_not_derived`
    misses: a to-do list of work that could never be done, hiding the 29
    entries that were real.

    A group is a walk when OSM says so in one of four ways:

      a relation      somebody published it as a walking route.
      a grade         sac_scale is not a thing anybody puts on a boulevard.
      a trail highway path, track, bridleway or steps. Footway is excluded
                      on its own for the same reason derive_routes refuses to
                      SEED on one: a named footway is usually a pavement.
      several ways    a footway split into two or more named pieces might be
                      a promenade walk, so the net stays generous here; the
                      registry's job is to over-name rather than under-name.

    A Wikidata trail class or a human seed still forces "trail" downstream,
    which is deliberate: this function reads OSM evidence only, and a walk
    that Wikidata calls a hiking trail is a walk whatever its ways look like.
    """
    if osm.get("relation_id") or osm.get("sac_scale"):
        return "trail"
    # Way-only evidence has to clear TWO tests, not either one. A trail
    # highway alone is not enough: the Schiessentuempel (a waterfall) and the
    # Pont Grande-Duchesse Charlotte (a bridge) are both tagged
    # highway=path in Luxembourg, and both reached the trail gate when this
    # function accepted a bare highway value. A trail signal alone is not
    # enough either, because network= sits on plenty of street furniture.
    # Together they are the test measured in Phase 2: France 557 fame groups
    # to 28, Luxembourg 48 admitted ways to 3, with the Sentier des Roches
    # and the Fuerstensteig both kept.
    walkish = (osm.get("highway") in TRAIL_HIGHWAYS
               and osm.get("trail_signal"))
    if walkish:
        return "trail"
    # Several named ways under one name is a corridor rather than a feature,
    # so it stays in scope even without a signal: a promenade split into six
    # named pieces might be a walk, and the registry over-names on purpose.
    # A bridge mapped as two path ways is why this needs the signal too.
    if (osm.get("named_ways") or 0) >= 3 and osm.get("trail_signal"):
        return "trail"
    return "place"

# The fame-score weights. Documented here because a score nobody can explain
# is a score nobody can argue with, and this one decides which three rows a
# region is HELD TO in the coverage gate.
#
#   pageviews  0.35  did anybody look it up
#   sitelinks  0.25  did anybody write it up, in how many languages
#   osm fame   0.20  is it tagged as notable on the ground
#   portal     0.10  does a national mapping agency publish it
#   seed       0.10  did a human name it in the brief
#
# Normalised WITHIN COUNTRY, so Luxembourg still has a top three and does not
# vanish behind the Alps. That is the brief's rule and it matters: the gate
# is per region, and a region in a small country must still be answerable.
WEIGHTS = {"pageviews": 0.35, "sitelinks": 0.25, "osm": 0.20,
           "portal": 0.10, "seed": 0.10}

# The name folding moved to names.py in Phase 2, because derive_routes needs
# the same section markers to chain "[secteur 4]" onto "[secteur 5]" and a
# second copy of this list would let the chainer and this report disagree
# about what one trail is. Re-exported here: coverage_report.py has imported
# squash and base_name from this module since Phase 1.
from names import (  # noqa: E402,F401
    COUNTER_RE, SECTION_RE, base_name, slugify, squash,
)


# ---------------------------------------------------------------------------
# The seed recall net (brief section 9)
# ---------------------------------------------------------------------------
# NOT a data source, and it must never become one. Every entry is resolved
# against Wikidata / Wikipedia / OSM / a portal below; an entry that resolves
# to nothing ships with unresolved:true so a human sees it once. Names are as
# travellers search for them; aliases and local spellings are the resolver's
# job. Expected to grow whenever a miss is found.
SEEDS = {
    "AD": ["Coma Pedrosa", "Estanys de Tristaina", "Cami dels Matxos",
           "Estany de l'Illa", "Coronallacs", "GR 11", "GR 7"],
    "AL": ["Theth-Valbone", "Blue Eye of Theth", "Maja e Jezerces",
           "Mount Korab", "Llogara-Cika", "Gjipe Canyon",
           "Peaks of the Balkans", "Grunas Waterfall"],
    "AT": ["Adlerweg", "5-Gipfel-Klettersteig", "Gosausee-Adamekhutte",
           "Krimmler Wasserfalle", "Dachstein Heilbronner Rundweg",
           "Zentralalpenweg", "Salzsteigweg", "Karnischer Hohenweg",
           "Rax Plateau", "Wilder Kaiser Steinerne Rinne",
           "Grossglockner Gamsgrubenweg"],
    "BA": ["Via Dinarica", "Lukomir-Rakitnica", "Hajducka vrata",
           "Sutjeska Maglic", "Vjetrenica"],
    "BE": ["GR 5", "GR 57 Ourthe", "Hautes Fagnes", "Ninglinspo",
           "Herbeumont Semois", "Sentier de l'Ambleve"],
    "BG": ["Kom-Emine", "Seven Rila Lakes", "Musala", "Vihren",
           "Malyovitsa", "Belogradchik Rocks", "Devil's Throat"],
    "CH": ["Hardergrat", "Aletsch Panoramaweg", "Eiger Trail",
           "Funf-Seen-Weg Pizol", "Gornergrat-Riffelsee", "Creux du Van",
           "Oeschinensee Panoramaweg", "Schynige Platte-First",
           "Walker's Haute Route", "Via Alpina", "Gemmipass",
           "Bisse du Rho"],
    "CY": ["Aphrodite Trail", "Artemis Trail", "Caledonia Falls",
           "Avakas Gorge", "Troodos Atalante"],
    "CZ": ["Pravcicka brana", "Snezka", "Prachovske skaly", "Adrspach",
           "Zlata stezka", "Macocha", "Pancir"],
    "DE": ["Watzmann Ostwand", "Hollentalklamm", "Partnachklamm",
           "Malerweg", "Rheinsteig", "Eifelsteig", "Heidschnuckenweg",
           "Goldsteig", "Westweg", "Rennsteig", "Konigssee-Obersee",
           "Zugspitze Reintal", "Drachenfels", "Externsteine"],
    "DK": ["Haervejen", "Gendarmstien", "Mons Klint", "Rubjerg Knude",
           "Camonoen"],
    "EE": ["Suur Munamagi", "Viru bog", "Perakula-Aegviidu-Ahijarve",
           "Jagala waterfall"],
    "ES": ["Ruta del Cares", "Caminito del Rey", "Teide Telesforo Bravo",
           "Ordesa Cola de Caballo", "Carros de Foc", "Ruta de las Xanas",
           "Camino Frances", "Camino del Norte", "Camino Primitivo",
           "GR 11", "GR 131", "Pedraforca", "Mulhacen", "Masca Barranco",
           "Roque Nublo", "Cami de Cavalls"],
    "FI": ["Karhunkierros", "Hetta-Pallas", "UKK", "Kevo", "Halti",
           "Nuuksio"],
    "FO": ["Traelanipa", "Slaettaratindur", "Kallur lighthouse",
           "Postrouten"],
    "FR": ["Sentier des Roches", "Cirque de Gavarnie", "Brevent-Lac Blanc",
           "Aiguilles Rouges", "Calanques Sugiton", "Calanque d'En-Vau",
           "Tour du Mont Blanc", "GR 20", "GR 34", "GR 5", "GR 10",
           "Tour des Ecrins", "Tour du Queyras", "Chemin de Stevenson",
           "Mont Aiguille", "Pointe du Raz", "Dune du Pilat",
           "Cirque de Troumouse", "Gorges du Verdon Blanc-Martel",
           "Puy de Dome", "Pic du Midi d'Ossau"],
    "GB": ["Ben Nevis Mountain Track", "Snowdon Llanberis", "Crib Goch",
           "Helvellyn Striding Edge", "Scafell Pike", "Old Man of Coniston",
           "Tryfan", "Glyder Fach", "Pen y Fan", "West Highland Way",
           "Pennine Way", "Coast to Coast", "Hadrian's Wall Path",
           "Offa's Dyke", "Cotswold Way", "South West Coast Path",
           "Pembrokeshire Coast Path", "Giant's Causeway Cliff Path",
           "Malham Cove", "Old Harry Rocks", "Seven Sisters"],
    "GR": ["Samaria Gorge", "Vikos Gorge", "Mount Olympus Mytikas",
           "Meteora", "Menalon Trail", "Corfu Trail", "Imbros Gorge",
           "Athos pilgrim paths", "Zagori stone bridges",
           "Santorini Fira-Oia"],
    "HR": ["Plitvice", "Premuzic Trail", "Paklenica Manita pec",
           "Biokovo Sveti Jure", "Velebit Zavizan", "Krka falls",
           "Dubrovnik city walls"],
    "HU": ["Orszagos Kektura", "Bukk Szalajka", "Matra Kekes",
           "Csobanc", "Tihany"],
    "IE": ["Wicklow Way", "Kerry Way", "Dingle Way", "Causeway Coast Way",
           "Cliffs of Moher Coastal Walk", "Diamond Hill",
           "Carrauntoohil Devil's Ladder", "Glendalough Spinc"],
    "IS": ["Laugavegur", "Fimmvorduhals", "Reykjadalur", "Glymur",
           "Skogafoss", "Hornstrandir", "Thakgil", "Storurd"],
    "IT": ["Tre Cime di Lavaredo", "Seceda", "Col Raiser", "Alpe di Siusi",
           "Sentiero Azzurro", "Sentiero degli Dei", "Selvaggio Blu",
           "Alta Via 1", "Alta Via 2", "Lago di Braies", "Tofana Astaldi",
           "Sassolungo Friedrich August", "Gran Paradiso Nivolet",
           "Vesuvio Gran Cono", "Stromboli", "Via Francigena",
           "Sentiero Italia"],
    "LI": ["Furstensteig", "Drei Schwestern", "Liechtenstein-Weg",
           "Furstin-Gina-Weg"],
    "LT": ["Curonian Spit dunes", "Aukstaitija lakes",
           "Baltic Coastal Hiking Route", "Camino Lituano"],
    "LU": ["Mullerthal Trail", "Escapardenne Lee Trail", "Sentier du Nord",
           "Schiessentumpel"],
    "LV": ["Gauja Sigulda", "Jurtaka", "Meztaka", "Kemeri bog"],
    "MD": ["Orheiul Vechi", "Codrii reserve", "Tipova"],
    "ME": ["Bobotov Kuk", "Durmitor Ring", "Ledena pecina",
           "Ladder of Kotor", "Peaks of the Balkans", "Via Dinarica"],
    "MK": ["High Scardus Trail", "Matka Canyon", "Vodno Millennium Cross",
           "Titov Vrv", "Golem Korab"],
    "MT": ["Dingli Cliffs", "Victoria Lines", "Gozo Coastal Walk",
           "Blue Grotto"],
    "NL": ["Pieterpad", "Pelgrimspad", "Trekvogelpad", "Posbank",
           "Drents-Friese Wold", "Waddenwandelen", "Zuid-Kennemerland"],
    "NO": ["Preikestolen", "Trolltunga", "Kjeragbolten", "Besseggen",
           "Romsdalseggen", "Reinebringen", "Segla", "Galdhopiggen",
           "Hardangervidda", "Olavsleden", "Rondvassbu", "Ryten"],
    "PL": ["Rysy", "Morskie Oko", "Orla Perc", "Giewont", "Sniezka",
           "Szczeliniec Wielki", "Kasprowy Wierch", "Swinica",
           "Polonina Wetlinska", "Sleza"],
    "PT": ["Pico Ruivo", "Pico do Arieiro", "Levada do Caldeirao Verde",
           "Rota Vicentina", "Fishermen's Trail", "Sete Cidades",
           "Ponta de Sao Lourenco", "Passadicos do Paiva",
           "Cascata do Arado", "Pico mountain", "Fanal forest"],
    "RO": ["Piatra Craiului", "Bucegi Sphinx", "Babele",
           "Fagaras Moldoveanu", "Retezat Bucura", "Transilvanica",
           "Cheile Turzii", "Sapte Scari"],
    "RS": ["Veliki Strbac", "Tara Banjska stena", "Stara Planina Midzor",
           "Fruska Gora", "Via Dinarica"],
    "SE": ["Kungsleden", "Sormlandsleden", "Skaneleden", "Hoga Kusten",
           "Padjelantaleden", "Abisko Karkevagge", "Bohusleden"],
    "SI": ["Triglav Kredarica", "Vintgar Gorge", "Velika Planina",
           "Soca Trail", "Tolmin Gorge", "Savica Waterfall",
           "Slovenska planinska pot", "Juliana Trail", "Logar Valley Rinka"],
    "SK": ["Tatranska magistrala", "Slovensky raj Sucha Bela", "Rysy",
           "Cesta hrdinov SNP", "Velky Rozsutec", "Kvacianska dolina"],
    "XK": ["Rugova Canyon", "Peaks of the Balkans", "Gjeravica",
           "Mirusha waterfalls"],
}


# Names that the wide class net drags in and that no traveller means by "a
# walk". The classes are deliberately wide (a gorge, a volcano and a rock
# formation are all walks people search for), so the guard is on the NAME,
# where the false positives actually are: continental-scale features, whole
# ranges, tectonics and administrative regions. A registry row that survives
# this and is still wrong is a visible, fixable miss; one silently dropped is
# not, so this list stays short and specific on purpose.
NAME_REJECT = re.compile(
    r"\b(belt|orogen|plate|craton|massif central|alps|pyrenees|carpathians|"
    r"apennines|balkan peninsula|scandinavian peninsula|iberian peninsula|"
    r"continental|watershed|drainage basin|geopark|biosphere|municipality|"
    r"province|prefecture|canton of|district of|arrondissement|bridge|"
    r"viaduct|tunnel|dam|reservoir|quarry|airport|railway station)\b",
    re.IGNORECASE)


def load_json(path, default=None):
    if not Path(path).exists():
        return default
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=False),
        encoding="utf-8")


# ---------------------------------------------------------------------------
# Evidence 3: OSM fame tags, from the extracts on disk
# ---------------------------------------------------------------------------

def scan_osm_fame(cc, slug, verbose=False):
    """Named, fame-tagged, hiking-ish ways and relations in one extract.

    The KeyFilter is the whole performance story and runs in C++: filtering
    on wikidata/wikipedia first reads France in 31 seconds, against 783 for
    a pass that hands every object to Python. Do not replace it with a
    tag-blind loop.

    Ways are folded by BASE NAME, so the 15 ways named
    'Sentier des Roches [secteur 1..8]' become one candidate carrying
    named_ways=15 rather than eight candidates nobody can match. The
    coordinate is taken from the first node of the first way, which is good
    enough to place a trail in a NUTS3 region; the registry never claims to
    know the geometry, only roughly where the thing is.
    """
    import osmium

    pbf = cached_extract(slug)
    if pbf is None:
        return None

    groups = {}
    node_want = set()
    way_want = {}          # way id -> the group keys waiting on it
    t0 = time.time()
    fp = osmium.FileProcessor(str(pbf), osmium.osm.WAY | osmium.osm.RELATION) \
        .with_filter(osmium.filter.KeyFilter("wikidata", "wikipedia"))
    for obj in fp:
        tags = obj.tags
        name = (tags.get("name") or "").strip()
        is_rel = obj.is_relation()
        if is_rel:
            if tags.get("route") not in ROUTE_VALUES:
                continue
        else:
            if tags.get("highway") not in WALK_HIGHWAYS:
                continue
            if not name and not tags.get("sac_scale"):
                continue
            # A named, article-bearing structure that a path happens to run
            # over is a bridge, not a walk. Without this, Liechtenstein's
            # only way_only_not_derived row was the Spiersbachbruecke, which
            # is noise in the one code that is supposed to mean work to do.
            if any(tags.get(k) for k in NON_WALK_KEYS):
                continue
        if not name:
            continue
        key = squash(base_name(name))
        if not key:
            continue
        g = groups.setdefault(key, {
            "name": base_name(name), "aliases": set(), "relation_id": None,
            "named_ways": 0, "wikidata": None, "wikipedia": None,
            "sac_scale": None, "network": None, "first_node": None,
            # What kind of walkable way carried the fame tag, and whether
            # anything about it says "trail" rather than "street with an
            # article". Recorded rather than discarded because kind_of()
            # needs it: this scan was seeing the evidence and throwing it
            # away, which is why a boulevard could become a famous trail.
            "highway": None, "trail_signal": False,
        })
        if name != g["name"]:
            g["aliases"].add(name)
        g["wikidata"] = g["wikidata"] or tags.get("wikidata")
        g["wikipedia"] = g["wikipedia"] or tags.get("wikipedia")
        g["sac_scale"] = g["sac_scale"] or tags.get("sac_scale")
        g["network"] = g["network"] or tags.get("network")
        if not is_rel:
            # Prefer a genuine trail highway value when the group has ways
            # of several kinds: a trail that crosses a village is a path
            # that becomes a footway for 80 m, and the path is the truer
            # claim about what the walk is.
            if g["highway"] is None or tags.get("highway") in TRAIL_HIGHWAYS:
                g["highway"] = tags.get("highway")
            if any(tags.get(k) for k in TRAIL_SIGNAL_KEYS):
                g["trail_signal"] = True
        if is_rel:
            g["relation_id"] = g["relation_id"] or obj.id
            # A relation carries no coordinate of its own. Without this, every
            # relation-sourced row would be unplaceable and would silently
            # drop out of a per-region gate, which is the exact failure this
            # registry exists to make impossible. Remember the first member
            # way and resolve it in the way pass below.
            if g["first_node"] is None:
                for mem in obj.members:
                    if mem.type == "w":
                        way_want.setdefault(mem.ref, []).append(key)
                        break
        else:
            g["named_ways"] += 1
            if g["first_node"] is None:
                try:
                    g["first_node"] = obj.nodes[0].ref
                except Exception:
                    pass
                if g["first_node"] is not None:
                    node_want.add(g["first_node"])

    # Resolve the member ways the relations are waiting on, then the nodes.
    # Two extra filtered passes; both are IdFilter and run in C++.
    if way_want:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.WAY) \
            .with_filter(osmium.filter.IdFilter(set(way_want)))
        for way in fp:
            try:
                ref = way.nodes[0].ref
            except Exception:
                continue
            for key in way_want.get(way.id, []):
                if groups[key]["first_node"] is None:
                    groups[key]["first_node"] = ref
                    node_want.add(ref)

    coords = {}
    if node_want:
        fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE) \
            .with_filter(osmium.filter.IdFilter(node_want))
        for node in fp:
            loc = node.location
            if loc.valid():
                coords[node.id] = (round(loc.lat, 6), round(loc.lon, 6))

    out = {}
    for key, g in groups.items():
        lat = lon = None
        if g["first_node"] is not None:
            got = coords.get(g["first_node"])
            if got:
                lat, lon = got
        out[key] = {
            "name": g["name"], "aliases": sorted(g["aliases"])[:6],
            "relation_id": g["relation_id"], "named_ways": g["named_ways"],
            "wikidata": g["wikidata"], "wikipedia": g["wikipedia"],
            "sac_scale": g["sac_scale"], "network": g["network"],
            "highway": g["highway"], "trail_signal": g["trail_signal"],
            "lat": lat, "lon": lon,
        }
    if verbose:
        print(f"    {cc}: {len(out):,} fame-tagged hiking candidate(s) "
              f"in {time.time() - t0:.0f}s")
    return out


def osm_fame(countries, refresh=False, verbose=False):
    """Cached per-country OSM fame scan. cache/trails_osm_fame.json."""
    cache = load_json(OSM_FAME_CACHE, {}) or {}
    slug_of = {cc: slug for slug, cc in COUNTRIES.items()}
    changed = False
    for cc in countries:
        if cc in cache and not refresh:
            continue
        slug = slug_of.get(cc)
        if not slug:
            continue
        got = scan_osm_fame(cc, slug, verbose=verbose)
        if got is None:
            if verbose:
                print(f"    {cc}: no extract on disk, skipped")
            continue
        cache[cc] = got
        changed = True
        write_json(OSM_FAME_CACHE, cache)   # checkpoint per country
    if changed and verbose:
        print(f"  osm fame cache: {OSM_FAME_CACHE}")
    return cache


# ---------------------------------------------------------------------------
# Evidence 1: Wikidata
# ---------------------------------------------------------------------------

def wd_query(country_qid, classes, wiki_host):
    """Identity, place and fame for one country's candidate items.

    Deliberately WITHOUT the article join and without a second label
    OPTIONAL. Fifteen class values crossed with three OPTIONALs is the
    cross-product trap this repo has hit before: QLever answers it with a
    400 and WDQS times out, so the "richer" single query returns nothing at
    all. Articles are resolved separately by wd_articles() in QID batches,
    which both endpoints serve comfortably.

    Labels come back in the local language when there is one and in English
    otherwise, through a single label service call rather than a join."""
    values = " ".join("wd:" + q for q in classes)
    return (ha.SPARQL_PREFIXES +
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> "
            "SELECT ?item ?cls ?label ?coord ?sl ?len WHERE { "
            f"VALUES ?cls {{ {values} }} "
            "?item wdt:P31 ?cls . "
            f"?item wdt:P17 wd:{country_qid} . "
            # The plain wdt:P625 truthy path, NOT p:/psv: with
            # wikibase:geoLatitude. QLever answers the psv form with a 400
            # while WDQS serves it, so the two endpoints returned DIFFERENT
            # SETS and a country's rows depended on which one happened to
            # answer. That silently lost the Dune du Pilat from France.
            # Both endpoints serve this form, as one WKT point to parse.
            "?item wdt:P625 ?coord . "
            "?item wikibase:sitelinks ?sl . "
            "OPTIONAL { ?item wdt:P2043 ?len } "
            "?item rdfs:label ?label . "
            f"FILTER(LANG(?label) IN ('{wiki_host}', 'en')) "
            "} LIMIT 20000")


POINT_RE = re.compile(r"Point\(\s*(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s*\)",
                      re.IGNORECASE)


def parse_point(wkt):
    """'Point(lon lat)' -> (lat, lon). WDQS and QLever differ in case and in
    how many decimals they print, so this parses rather than string-slices."""
    m = POINT_RE.search(wkt or "")
    if not m:
        return None, None
    return float(m.group(2)), float(m.group(1))


def wd_articles(qids, wiki_host, verbose=False):
    """{qid: article title} in one language edition, in batches of 300.

    Separate from wd_query for the reason written there. sitelink_counts
    uses the same batch size against the same endpoints, so this is a shape
    both services are known to serve."""
    out = {}
    todo = sorted({q for q in qids if q})
    for i in range(0, len(todo), 300):
        chunk = todo[i:i + 300]
        query = (ha.SPARQL_PREFIXES +
                 "PREFIX schema: <http://schema.org/> "
                 "SELECT ?item ?art WHERE { VALUES ?item { " +
                 " ".join("wd:" + q for q in chunk) + " } "
                 "?art schema:about ?item ; "
                 f"schema:isPartOf <https://{wiki_host}.wikipedia.org/> }}")
        got = None
        for endpoint in ha.SPARQL_ENDPOINTS:
            got = ha.get_json(
                endpoint + "?" + urllib.parse.urlencode(
                    {"format": "json", "query": query}),
                base_headers={**ha.HEADERS,
                              "Accept": "application/sparql-results+json"})
            if got is not None and got.get("results") is not None:
                break
            got = None
        if got is None:
            continue
        for b in got.get("results", {}).get("bindings", []) or []:
            try:
                qid = b["item"]["value"].rsplit("/", 1)[-1]
                url = b["art"]["value"]
                out[qid] = urllib.parse.unquote(url.rsplit("/wiki/", 1)[-1])
            except Exception:
                continue
        time.sleep(0.3)
    if verbose:
        print(f"        {len(out):,}/{len(todo):,} article(s) resolved "
              f"on {wiki_host}.wikipedia")
    return out


# ISO2 -> the language edition whose pageviews mean most for that country.
# A French walk is looked up on fr.wikipedia, not en, and using en alone
# would score every non-anglophone trail at zero.
WIKI_LANG = {
    "AD": "ca", "AL": "sq", "AT": "de", "BA": "bs", "BE": "nl", "BG": "bg",
    "CH": "de", "CY": "el", "CZ": "cs", "DE": "de", "DK": "da", "EE": "et",
    "ES": "es", "FI": "fi", "FO": "fo", "FR": "fr", "GB": "en", "GR": "el",
    "HR": "hr", "HU": "hu", "IE": "en", "IS": "is", "IT": "it", "LI": "de",
    "LT": "lt", "LU": "de", "LV": "lv", "MC": "fr", "MD": "ro", "ME": "sr",
    "MK": "mk", "MT": "en", "NL": "nl", "NO": "no", "PL": "pl", "PT": "pt",
    "RO": "ro", "RS": "sr", "SE": "sv", "SI": "sl", "SK": "sk", "TR": "tr",
    "UA": "uk", "XK": "sq",
}


# ISO2 -> Wikidata country QID. P17 is the gate that keeps a query from
# returning the world; without it the class values alone match ~2M items.
COUNTRY_QID = {
    "AD": "Q228", "AL": "Q222", "AT": "Q40", "BA": "Q225", "BE": "Q31",
    "BG": "Q219", "CH": "Q39", "CY": "Q229", "CZ": "Q213", "DE": "Q183",
    "DK": "Q35", "EE": "Q191", "ES": "Q29", "FI": "Q33", "FO": "Q4628",
    "FR": "Q142", "GB": "Q145", "GR": "Q41", "HR": "Q224", "HU": "Q28",
    "IE": "Q27", "IS": "Q189", "IT": "Q38", "LI": "Q347", "LT": "Q37",
    "LU": "Q32", "LV": "Q211", "MC": "Q235", "MD": "Q217", "ME": "Q236",
    "MK": "Q221", "MT": "Q233", "NL": "Q55", "NO": "Q20", "PL": "Q36",
    "PT": "Q45", "RO": "Q218", "RS": "Q403", "SE": "Q34", "SI": "Q215",
    "SK": "Q214", "TR": "Q43", "UA": "Q212", "XK": "Q1246",
}


def wikidata_candidates(countries, refresh=False, offline=False,
                        verbose=False):
    """Coordinate-bearing items of the WD_CLASSES, per country, cached.

    One query per country rather than one for Europe: the endpoint times out
    on the wide one, and a per-country failure then costs one country rather
    than the run. QLever first, WDQS as the fallback, which is
    harvest_activities' own order and its reasoning (WDQS rate-limits
    anonymous clients hard during outages).
    """
    cache = load_json(WD_CACHE, {}) or {}
    if offline:
        return cache
    classes = sorted(WD_CLASSES)
    for cc in countries:
        if cc in cache and not refresh:
            continue
        qid = COUNTRY_QID.get(cc)
        if not qid:
            continue
        lang = WIKI_LANG.get(cc, "en")
        query = wd_query(qid, classes, lang)
        rows, got = [], None
        # Both endpoints, then back off and try again. WDQS rate-limits
        # anonymous clients hard (this repo has seen 1 req/min during an
        # outage) and QLever 400s on a query it dislikes, so a single pass
        # silently produces an EMPTY registry for a country, which is the
        # most dangerous failure this module has: a country with no rows
        # looks exactly like a country with nothing famous in it.
        for attempt in range(3):
            for endpoint in ha.SPARQL_ENDPOINTS:
                got = ha.get_json(
                    endpoint + "?" + urllib.parse.urlencode(
                        {"format": "json", "query": query}),
                    base_headers={**ha.HEADERS,
                                  "Accept": "application/sparql-results+json"})
                if got is not None and got.get("results") is not None:
                    break
                got = None
            if got is not None:
                break
            if attempt < 2:
                wait = 20 * (attempt + 1)
                if verbose:
                    print(f"    {cc}: no SPARQL answer, retrying in {wait}s")
                time.sleep(wait)
        if got is None:
            # Never cache a failure: an empty list would be indistinguishable
            # from "this country has nothing", and the next run would trust it.
            print(f"    ! {cc}: SPARQL gave nothing after 3 tries, "
                  "left uncached for a retry")
            continue
        seen = {}
        for b in got.get("results", {}).get("bindings", []) or []:
            try:
                qid = b["item"]["value"].rsplit("/", 1)[-1]
                label = (b["label"]["value"] or "").strip()
                lab_lang = b["label"].get("xml:lang") or "en"
                if not label or re.fullmatch(r"Q\d+", label):
                    continue
                cls = ((b.get("cls") or {}).get("value") or "")
                cls = cls.rsplit("/", 1)[-1] or None
                lat, lon = parse_point((b.get("coord") or {}).get("value"))
                if lat is None:
                    continue
                row = seen.get(qid)
                if row is None:
                    seen[qid] = {
                        "qid": qid, "label": label, "lab_lang": lab_lang,
                        "cls": cls,
                        "en": label if lab_lang == "en" else None,
                        "lat": lat, "lon": lon,
                        "sitelinks": int(float(b["sl"]["value"])),
                        "km": (round(float(b["len"]["value"]), 2)
                               if b.get("len") else None),
                        "lang": None, "title": None,
                    }
                else:
                    # An item is often an instance of several of the classes
                    # (Dune du Pilat is a dune AND a protected area). A trail
                    # class beats a place class, because kind decides whether
                    # a region is HELD TO the row.
                    if cls in TRAIL_CLASSES:
                        row["cls"] = cls
                    # Two label rows per item at most (local + en). The local
                    # one is the name a traveller searches for, so it wins;
                    # the English one is kept as an alias.
                    if lab_lang == lang and row["lab_lang"] != lang:
                        row["en"] = row["label"]
                        row["label"], row["lab_lang"] = label, lab_lang
                    elif lab_lang == "en":
                        row["en"] = label
            except Exception:
                continue
        rows = list(seen.values())
        arts = wd_articles([r["qid"] for r in rows], lang, verbose=verbose)
        for r in rows:
            if arts.get(r["qid"]):
                r["lang"], r["title"] = lang, arts[r["qid"]]
        cache[cc] = rows
        write_json(WD_CACHE, cache)
        if verbose:
            print(f"    {cc}: {len(rows):,} wikidata candidate(s)")
        time.sleep(1.0)
    return cache


# ---------------------------------------------------------------------------
# Evidence 2: pageviews
# ---------------------------------------------------------------------------

def pageviews_for(wiki_tags, offline=False, verbose=False):
    """{'fr:Sentier des Roches': avg_daily_views}, cached on disk.

    Reuses enrich_activities.pageviews_avg so the window (last 12 full
    months) is the same one every other fame number in this repo uses. A
    None (hard failure) is not cached, so it retries next run; a 0 (article
    has no data) is."""
    cache = load_json(PV_CACHE, {}) or {}
    if offline:
        return cache
    todo = [t for t in sorted(set(wiki_tags))
            if t and t not in cache and ":" in t]
    if not todo:
        return cache

    # Threaded, like popularity.py against the same cache and the same API.
    # A full sweep asks for ~69,000 articles; serially that is about three
    # hours of a monthly task doing nothing but waiting on a socket.
    def work(tag):
        lang, title = tag.split(":", 1)
        url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title)}"
        time.sleep(PV_DELAY_S)
        return tag, ea.pageviews_avg(url)

    done = fails = 0
    print(f"        {len(todo):,} article(s) to look up")
    with ThreadPoolExecutor(max_workers=PV_WORKERS) as ex:
        futs = [ex.submit(work, t) for t in todo]
        for f in as_completed(futs):
            try:
                tag, views = f.result()
            except Exception:
                fails += 1
                done += 1
                continue
            if views is None:
                fails += 1          # hard failure: not cached, retried later
            else:
                cache[tag] = views
            done += 1
            if done % 500 == 0:
                write_json(PV_CACHE, cache)
                print(f"        pageviews {done:,}/{len(todo):,} "
                      f"({fails} failure(s))", flush=True)
    write_json(PV_CACHE, cache)
    return cache


# ---------------------------------------------------------------------------
# Evidence 4: national portals
# ---------------------------------------------------------------------------

def portal_names(countries):
    """{cc: {squashed name}} from whatever crosscheck_portals.py has written.

    Read defensively and treated as a bonus signal: the portal pass is not
    guaranteed to have run, and a registry that crashes because an optional
    evidence source is missing would be a worse instrument than one that
    scores it zero."""
    out = {cc: set() for cc in countries}
    if not PORTAL_DIR.exists():
        return out
    for path in PORTAL_DIR.glob("*.json"):
        cc = path.stem.upper()[:2]
        if cc not in out:
            continue
        blob = load_json(path, None)
        rows = []
        if isinstance(blob, dict):
            for key in ("routes", "rows", "names", "matches"):
                if isinstance(blob.get(key), list):
                    rows = blob[key]
                    break
        elif isinstance(blob, list):
            rows = blob
        for r in rows:
            name = r.get("name") if isinstance(r, dict) else r
            if isinstance(name, str) and name.strip():
                out[cc].add(squash(name))
    return out


# ---------------------------------------------------------------------------
# Region assignment
# ---------------------------------------------------------------------------

def assign_regions(rows, verbose=False):
    """nuts3 + range per row, by the trails regionizer's own spine.

    Point containment, with a 5 km nearest-snap for a coordinate that falls
    just offshore (a coastal path's node drawn seaward of the admin polygon,
    an island). Same Spine, same layers and the same SNAP_KM the line
    regionizer uses, so a registry row and the trail that should match it
    are placed by the same rules rather than by two that nearly agree."""
    if not rows:
        return
    import regionize as RZ
    try:
        spine = RZ.Spine()
    except FileNotFoundError as exc:
        print(f"  ! {exc}")
        print("  ! rows will carry no region; coverage cannot gate on them")
        return
    pts = RZ._points_frame(spine, rows)
    n3 = RZ._join_within(spine, pts, spine.a3, "id")
    missing = [i for i, v in enumerate(n3) if v is None]
    if missing:
        sub = pts.iloc[missing].copy()
        sub["_i"] = list(range(len(missing)))
        snapped = RZ._join_nearest(spine, sub, spine.a3, "id", RZ.SNAP_KM)
        for k, i in enumerate(missing):
            n3[i] = snapped[k]
    rng = RZ._join_within(spine, pts, spine.layers.get("range"), "id",
                          sort_by="level" if spine.layers.get("range") is not
                          None and "level" in spine.layers["range"].columns
                          else None)
    placed = 0
    for i, row in enumerate(rows):
        row["nuts3"] = n3[i]
        row["range"] = rng[i]
        if n3[i]:
            placed += 1
    if verbose:
        print(f"  regions: {placed:,}/{len(rows):,} rows placed in a NUTS3")


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def norm_within(values):
    """0..1 by rank-free min/max on log1p, per country.

    log1p because pageviews are heavy-tailed: the Eiffel Tower of trails
    would otherwise flatten every other row in the country to zero."""
    if not values:
        return {}
    logs = {k: math.log1p(max(0.0, v)) for k, v in values.items()}
    lo, hi = min(logs.values()), max(logs.values())
    if hi - lo < 1e-9:
        return {k: (1.0 if hi > 0 else 0.0) for k in logs}
    return {k: (v - lo) / (hi - lo) for k, v in logs.items()}


def score_country(rows):
    """fame_score for one country's rows, normalised inside that country."""
    pv = norm_within({i: (r["evidence"]["wikipedia"] or {}).get(
        "pageviews_avg") or 0 for i, r in enumerate(rows)})
    sl = norm_within({i: r["evidence"].get("sitelinks") or 0
                      for i, r in enumerate(rows)})
    for i, r in enumerate(rows):
        osm = r["evidence"].get("osm") or {}
        parts = {
            "pageviews": pv.get(i, 0.0),
            "sitelinks": sl.get(i, 0.0),
            "osm": 1.0 if osm.get("fame_tagged") else 0.0,
            "portal": 1.0 if r["evidence"].get("portal") else 0.0,
            "seed": 1.0 if r["evidence"].get("seed") else 0.0,
        }
        r["fame_score"] = round(
            sum(WEIGHTS[k] * v for k, v in parts.items()), 4)
        r["fame_parts"] = {k: round(v, 4) for k, v in parts.items()}


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_country(cc, osm_rows, wd_rows, portals, verbose=False):
    """Merge the evidence for one country into registry rows.

    Merge key is the squashed base name. Wikidata leads (it has the
    coordinate and the sitelinks), OSM joins on name or on a shared QID, and
    a seed that matched neither still ships, unresolved."""
    rows, by_key, by_qid = [], {}, {}

    def fresh(name, lat=None, lon=None):
        row = {
            "id": None, "name": name, "kind": "place", "wd_class": None,
            "aliases": [], "country": cc,
            "nuts3": None, "range": None, "lat": lat, "lon": lon,
            "evidence": {"wikidata": None, "sitelinks": 0, "wikipedia": None,
                         "osm": None, "portal": None, "seed": False},
            "fame_score": 0.0, "expected_km": None, "unresolved": False,
        }
        rows.append(row)
        return row

    for w in wd_rows:
        key = squash(base_name(w["label"]))
        if not key:
            continue
        row = by_key.get(key)
        if row is None:
            row = fresh(w["label"], w["lat"], w["lon"])
            by_key[key] = row
        row["evidence"]["wikidata"] = w["qid"]
        row["evidence"]["sitelinks"] = w["sitelinks"]
        row["expected_km"] = w.get("km")
        row["wd_class"] = w.get("cls")
        if w.get("cls") in TRAIL_CLASSES:
            row["kind"] = "trail"
        if w.get("title"):
            row["evidence"]["wikipedia"] = {
                "lang": w["lang"], "title": w["title"], "pageviews_avg": None}
        if w.get("en") and w["en"] != w["label"]:
            row["aliases"] = sorted(set(row["aliases"]) | {w["en"]})
        by_qid[w["qid"]] = row

    for key, o in (osm_rows or {}).items():
        row = by_key.get(key)
        if row is None and o.get("wikidata"):
            row = by_qid.get(o["wikidata"])
        if row is None:
            row = fresh(o["name"], o.get("lat"), o.get("lon"))
            by_key[key] = row
        if row["lat"] is None and o.get("lat") is not None:
            row["lat"], row["lon"] = o["lat"], o["lon"]
        row["aliases"] = sorted(set(row["aliases"]) | set(o.get("aliases") or []))
        row["evidence"]["osm"] = {
            "relation_id": o.get("relation_id"),
            "named_ways": o.get("named_ways") or 0,
            "fame_tagged": bool(o.get("wikidata") or o.get("wikipedia")),
            "wikipedia_tag": o.get("wikipedia"),
            "sac_scale": o.get("sac_scale"),
            "network": o.get("network"),
            "highway": o.get("highway"),
            "trail_signal": bool(o.get("trail_signal")),
        }
        row["evidence"]["wikidata"] = (row["evidence"]["wikidata"]
                                       or o.get("wikidata"))
        row["kind"] = kind_of(o)
        if o.get("wikipedia") and ":" in (o["wikipedia"] or ""):
            lang, title = o["wikipedia"].split(":", 1)
            row["evidence"]["wikipedia"] = {"lang": lang, "title": title,
                                            "pageviews_avg": None}

    portal_set = portals.get(cc) or set()
    for row in rows:
        if squash(row["name"]) in portal_set:
            row["evidence"]["portal"] = True

    # Seeds last: they attach to what resolved, or ship unresolved.
    for seed in SEEDS.get(cc, []):
        key = squash(base_name(seed))
        row = by_key.get(key)
        if row is None:
            # Substring fallback: 'Mount Korab' against 'Korab'.
            for k, cand in by_key.items():
                if key and (key in k or k in key) and abs(len(k) - len(key)) < 12:
                    row = cand
                    break
        if row is None:
            row = fresh(seed)
            by_key[key] = row
            row["unresolved"] = True
        row["evidence"]["seed"] = True
        # A human named this as one of the country's walks, so the gate may
        # hold a region to it even when Wikidata files it as a summit.
        row["kind"] = "trail"
        if seed != row["name"] and seed not in row["aliases"]:
            row["aliases"] = sorted(set(row["aliases"]) | {seed})

    # Drop the wide net's obvious non-walks, but ONLY where Wikidata is the
    # sole evidence. A name that OSM tags as a hiking way, or that a human
    # seeded, outranks this guard: the cost of a wrong drop (a famous trail
    # that never appears in the gate, invisibly) is far worse than the cost
    # of a wrong keep (one unmatched row a human reads once).
    kept = []
    for row in rows:
        e = row["evidence"]
        if (NAME_REJECT.search(row["name"] or "")
                and not e.get("osm") and not e.get("seed")):
            continue
        kept.append(row)

    for row in kept:
        row["id"] = f"{cc.lower()}-{slugify(row['name'])}"
    return kept


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", default="FR,CH",
                    help="ISO2 list (default FR,CH)")
    ap.add_argument("--all", action="store_true", help="every catalogue country")
    ap.add_argument("--refresh", action="store_true",
                    help="re-scan OSM extracts and re-query Wikidata")
    ap.add_argument("--offline", action="store_true",
                    help="caches only, no network")
    ap.add_argument("--full", action="store_true",
                    help="also write famous_registry_full.json with the "
                         "place candidates too (not committed)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    countries = (sorted(set(COUNTRIES.values())) if args.all else
                 [c.strip().upper() for c in args.countries.split(",")
                  if c.strip()])

    print(f"famous registry: {len(countries)} country(ies)")

    print("  [1/5] OSM fame tags from the extracts on disk")
    osm = osm_fame(countries, refresh=args.refresh, verbose=True)

    print("  [2/5] Wikidata candidates")
    wd = wikidata_candidates(countries, refresh=args.refresh,
                             offline=args.offline, verbose=True)

    print("  [3/5] merge + national portals")
    portals = portal_names(countries)
    all_rows, per_country = [], {}
    for cc in countries:
        rows = build_country(cc, osm.get(cc) or {}, wd.get(cc) or [],
                             portals, verbose=args.verbose)
        per_country[cc] = rows
        all_rows += rows
    print(f"        {len(all_rows):,} registry row(s)")

    print("  [4/5] pageviews")
    tags = []
    for r in all_rows:
        w = r["evidence"].get("wikipedia")
        if w:
            tags.append(f"{w['lang']}:{w['title']}")
    pv = pageviews_for(tags, offline=args.offline, verbose=True)
    for r in all_rows:
        w = r["evidence"].get("wikipedia")
        if w:
            w["pageviews_avg"] = pv.get(f"{w['lang']}:{w['title']}")

    print("  [5/5] regions + fame score")
    placed = [r for r in all_rows if r["lat"] is not None]
    assign_regions(placed, verbose=True)
    for cc in countries:
        score_country(per_country[cc])

    all_rows.sort(key=lambda r: (r["country"], -r["fame_score"], r["name"]))
    unresolved = [r for r in all_rows if r["unresolved"]]
    no_region = [r for r in all_rows if not r["nuts3"]]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "countries": countries,
        "weights": WEIGHTS,
        "pv_window": {"start": ea.PV_START, "end": ea.PV_END,
                      "days": ea.PV_DAYS},
        "counts": {
            "rows": len(all_rows),
            "per_country": {cc: len(per_country[cc]) for cc in countries},
            "with_region": len(all_rows) - len(no_region),
            "unresolved_seeds": len(unresolved),
            "with_osm": sum(1 for r in all_rows if r["evidence"].get("osm")),
            "with_wikidata": sum(1 for r in all_rows
                                 if r["evidence"].get("wikidata")),
        },
        "rows": all_rows,
    }
    trail_rows = [r for r in all_rows if r.get("kind") == "trail"]
    payload["counts"]["trail_rows"] = len(trail_rows)
    payload["counts"]["place_rows"] = len(all_rows) - len(trail_rows)

    if args.full:
        write_json(REGISTRY_FULL, payload)
        print(f"  -> {REGISTRY_FULL} (every row, not committed)")

    payload["rows"] = trail_rows
    payload["note"] = (
        "rows[] holds the kind:trail candidates, which is what the coverage "
        "gate holds a region to. The kind:place candidates (a named summit "
        "or lake with an article and no path) are counted above and written "
        "to famous_registry_full.json by --full, which is not committed.")
    write_json(REGISTRY, payload)

    print()
    print(f"  rows                {len(all_rows):,}")
    print(f"  with a NUTS3 region {len(all_rows) - len(no_region):,}")
    print(f"  with OSM evidence   {payload['counts']['with_osm']:,}")
    print(f"  with a wikidata id  {payload['counts']['with_wikidata']:,}")
    print(f"  walks (kind trail)  {len(trail_rows):,}")
    print(f"  places              {len(all_rows) - len(trail_rows):,}")
    print(f"  unresolved seeds    {len(unresolved):,}")
    for r in unresolved[:20]:
        print(f"      {r['country']}  {r['name']}")
    print(f"  -> {REGISTRY}")


if __name__ == "__main__":
    main()
