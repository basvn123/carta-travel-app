"""Guided search data (T439, 2026-10): what Explore's "Find a place" can answer.

Tier: Manual (run by hand after an ingest; the vibe embeddings are cached)

The owner asked for a search people would use, free, and guided: the app
shows the questions it can answer and the traveller can only ask those
(2026-10-13). So the search is retrieval over facts and precomputed scores,
with no model at runtime and no paid call. This layer writes the part of that
the app cannot compute itself:

  areas    named areas a traveller asks for that are not a country: regions
           (Tuscany, Provence), mountain areas (the Alps, the Pyrenees) and
           coasts and islands (Amalfi Coast, Crete), each a hand-set box or
           outline with its name in the six app languages. A destination's
           area ids are listed on it, so the app filters without geometry.
  nb       the distance in km from each destination to the nearest rated
           beach, trail start, lake and peak (same-country layer files),
           when one is within 25 km: "beach nearby", "trails from the town".
  vibes    a 0 to 100 score for about twenty curated vibes (quiet, old town,
           food and wine, lakeside...). Facts score first: a category tag or
           a close beach, lake or trail is direct evidence. Text scores
           second: each destination's description (city, country, blurb,
           categories, tags, the first lines of its Wikivoyage guide and its
           sight names) is embedded with a free local model and compared to
           each vibe's one-line description. Text is capped below facts and
           counts only in the top fifth of the catalogue for that vibe, so a
           thin record cannot claim a vibe on wording alone.

Months, cost, car-free and crowding are NOT here: the app already computes
them from the same records the cards read, so a search can never disagree
with a card.

Model: thenlper/gte-small (MIT licence) through sentence-transformers, run
on the CPU of this machine. Embeddings are cached in
cache/guided/vibes.npz (ignored, derived) keyed by a hash of each document and the
model name, so a rerun embeds only new or changed records.

Golden set: GOLDEN below lists guided questions with places a knowledgeable
traveller would expect near the top. `--check` reports hits in the top 10.
Write the expectation before tuning, never after.

Usage, from the repo root:
    python pipeline/guided_search_layer.py            # build and check
    python pipeline/guided_search_layer.py --check    # check only (reads the output)
"""

import argparse
import hashlib
import json
import math
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from pipeline_io import atomic_write_json  # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MASTER = ROOT / "app_data" / "app_data.json"
PUBLIC = ROOT / "continent-app" / "public"
OUT = PUBLIC / "search" / "guided.json"
CACHE = ROOT / "cache" / "guided" / "vibes.npz"
MODEL = "thenlper/gte-small"
NB_MAX_KM = 25.0
VERSION = 1

LANGS = ("en", "nl", "de", "fr", "es", "it")


def L(en, nl, de, fr, es, it):
    return dict(zip(LANGS, (en, nl, de, fr, es, it)))


# ---------------------------------------------------------------------------
# Vibes. `cats` are category tags that are direct evidence; `near` is a
# distance join that is evidence (layer, km); `desc` is what the text is
# compared with. Labels are what the guided search shows.
VIBES = {
    "quiet": dict(label=L("Quiet and calm", "Rustig", "Ruhig", "Calme", "Tranquilo", "Tranquillo"),
                  cats={"quiet", "remote", "countryside"},
                  desc="A quiet, peaceful small place away from crowds and mass tourism."),
    "oldtown": dict(label=L("Old town", "Oude binnenstad", "Altstadt", "Vieille ville", "Casco antiguo", "Centro storico"),
                    cats={"medieval", "fairytale", "baroque", "renaissance", "gothic"},
                    desc="A historic old town with medieval streets, old squares, churches and well preserved architecture."),
    "food": dict(label=L("Food and wine", "Eten en wijn", "Essen und Wein", "Gastronomie et vin", "Comida y vino", "Cibo e vino"),
                 cats={"food", "wine", "beer"},
                 desc="Known for its food and wine: local cuisine, markets, restaurants, vineyards and wine tasting."),
    "romantic": dict(label=L("Romantic", "Romantisch", "Romantisch", "Romantique", "Romántico", "Romantico"),
                     cats={"romantic"},
                     desc="A romantic place for couples, with charming streets, sunsets and beautiful views."),
    "family": dict(label=L("Good for families", "Voor gezinnen", "Für Familien", "En famille", "Para familias", "Per famiglie"),
                   cats={"family"},
                   desc="Family friendly, with easy beaches, parks and activities for children."),
    "beach": dict(label=L("Beach town", "Badplaats", "Badeort", "Station balnéaire", "Pueblo de playa", "Località di mare"),
                  cats={"beach"}, near=("beach", 3.0), facts_only=True, coastal=True,
                  desc="A seaside town with sandy beaches and swimming in the sea."),
    "island": dict(label=L("Island", "Eiland", "Insel", "Île", "Isla", "Isola"),
                   cats={"island", "islands"}, facts_only=True,
                   desc="An island with ferries, coves and sea views."),
    "mountain": dict(label=L("Mountain village", "Bergdorp", "Bergdorf", "Village de montagne", "Pueblo de montaña", "Paese di montagna"),
                     cats={"alps", "mountains", "skiing"}, near=("peak", 8.0), facts_only=True,
                     desc="An alpine mountain village surrounded by high peaks, with cable cars and mountain huts."),
    "hiking": dict(label=L("Hiking base", "Wandelbasis", "Wanderbasis", "Base de randonnée", "Base para senderismo", "Base per escursioni"),
                   cats={"hiking", "national-park"}, near=("trail", 8.0, 3), facts_only=True,
                   desc="A base for hiking, with marked walking trails and mountain paths starting nearby."),
    "lake": dict(label=L("Lakeside", "Aan een meer", "Am See", "Au bord d'un lac", "Junto a un lago", "Sul lago"),
                 cats={"lake", "lakes"}, near=("lake", 3.0), facts_only=True,
                 desc="A town on a lake shore, with lake swimming, boats and lake views."),
    "castles": dict(label=L("Castles", "Kastelen", "Burgen", "Châteaux", "Castillos", "Castelli"),
                    cats={"castle", "fortress"},
                    desc="Castles, fortresses and palaces to visit."),
    "art": dict(label=L("Art and museums", "Kunst en musea", "Kunst und Museen", "Art et musées", "Arte y museos", "Arte e musei"),
                cats={"art", "culture"},
                desc="Art galleries, museums, theatres and culture."),
    "nightlife": dict(label=L("Nightlife", "Uitgaan", "Nachtleben", "Vie nocturne", "Vida nocturna", "Vita notturna"),
                      cats={"nightlife", "party"},
                      desc="Bars, clubs and a lively nightlife."),
    "nature": dict(label=L("Nature", "Natuur", "Natur", "Nature", "Naturaleza", "Natura"),
                   cats={"nature", "wilderness", "national-park"},
                   desc="Unspoiled nature: forests, rivers, gorges, wildlife and national parks."),
    "views": dict(label=L("Scenic views", "Mooie uitzichten", "Schöne Aussicht", "Beaux panoramas", "Vistas", "Panorami"),
                  cats={"iconic", "fjord", "fjords", "valley"},
                  desc="Spectacular scenery and viewpoints over dramatic landscapes, cliffs or fjords."),
    "spa": dict(label=L("Spa and thermal baths", "Kuuroord", "Thermalbad", "Thermes", "Balneario", "Terme"),
                cats={"spa", "thermal"}, facts_only=True,
                desc="A spa town with thermal baths and wellness."),
    "city": dict(label=L("City break", "Stedentrip", "Städtereise", "City break", "Escapada urbana", "City break"),
                 cats={"city"},
                 desc="A lively city with museums, restaurants, shopping and good public transport."),
    "village": dict(label=L("Village", "Dorp", "Dorf", "Village", "Pueblo", "Borgo"),
                    cats={"village"},
                    desc="A small, charming village."),
    "unesco": dict(label=L("World Heritage", "Werelderfgoed", "Welterbe", "Patrimoine mondial", "Patrimonio mundial", "Patrimonio mondiale"),
                   cats={"unesco"}, facts_only=True,
                   desc="A UNESCO World Heritage site."),
    "adventure": dict(label=L("Outdoor adventure", "Avontuur buiten", "Outdoor-Abenteuer", "Aventure en plein air", "Aventura al aire libre", "Avventura all'aperto"),
                      cats={"adventure", "surf", "diving", "sailing"},
                      desc="Outdoor adventure sports: climbing, rafting, surfing, diving and sailing."),
}

# ---------------------------------------------------------------------------
# Areas: hand-set approximations, like the region boxes of the search index.
# box = [west, south, east, north]; poly = [[lon, lat], ...] outline.
AREAS = {
    # Mountain areas
    "alps": dict(kind="mountains", label=L("Alps", "Alpen", "Alpen", "Alpes", "Alpes", "Alpi"), poly=[
        [5.6, 43.9], [5.2, 44.9], [5.4, 45.4], [5.7, 45.9], [6.2, 46.25], [6.9, 46.45], [7.6, 46.75],
        [8.3, 47.0], [8.9, 47.15], [9.5, 47.35], [9.9, 47.55], [10.7, 47.6], [11.2, 47.65], [11.7, 47.75],
        [12.3, 47.8], [13.1, 47.85], [13.8, 47.95], [14.5, 47.95], [15.6, 48.05], [16.2, 48.15], [16.4, 47.7],
        [15.4, 47.1], [15.7, 46.55], [14.9, 46.0], [14.2, 45.9], [13.3, 46.1], [12.5, 45.95], [11.7, 45.8],
        [10.9, 45.65], [10.2, 45.7], [9.6, 45.8], [9.0, 45.85], [8.0, 45.65], [7.6, 45.3], [7.3, 44.9],
        [7.5, 44.35], [8.1, 44.2], [7.6, 43.85], [7.2, 43.7], [6.6, 43.6], [5.9, 43.65]]),
    "dolomites": dict(kind="mountains", cc=["IT"], label=L("Dolomites", "Dolomieten", "Dolomiten", "Dolomites", "Dolomitas", "Dolomiti"), box=[10.8, 46.2, 12.5, 46.8]),
    "pyrenees": dict(kind="mountains", label=L("Pyrenees", "Pyreneeën", "Pyrenäen", "Pyrénées", "Pirineos", "Pirenei"), poly=[
        [-1.8, 43.4], [-0.5, 43.15], [0.8, 43.0], [1.9, 42.9], [3.1, 42.6], [3.3, 42.3], [2.5, 42.2],
        [1.4, 42.15], [0.3, 42.2], [-0.8, 42.55], [-1.7, 42.85]]),
    "carpathians": dict(kind="mountains", label=L("Carpathians", "Karpaten", "Karpaten", "Carpates", "Cárpatos", "Carpazi"), poly=[
        [17.2, 48.6], [18.5, 49.6], [20.0, 49.6], [22.0, 49.4], [24.0, 48.9], [25.5, 47.9], [26.5, 46.5],
        [26.6, 45.5], [25.0, 45.2], [23.0, 45.0], [22.3, 45.3], [22.6, 46.6], [23.3, 47.3], [22.6, 48.2],
        [21.0, 48.8], [19.0, 48.6], [17.8, 48.2]]),
    "tatras": dict(kind="mountains", cc=["SK", "PL"], label=L("Tatras", "Tatra", "Tatra", "Tatras", "Tatras", "Tatra"), box=[19.6, 49.05, 20.45, 49.35]),
    "apennines": dict(kind="mountains", label=L("Apennines", "Apennijnen", "Apennin", "Apennins", "Apeninos", "Appennini"), poly=[
        [8.6, 44.6], [10.5, 44.5], [12.0, 44.0], [13.3, 42.9], [14.3, 42.1], [15.6, 41.0], [16.3, 40.0],
        [16.4, 39.0], [15.7, 38.9], [15.4, 40.0], [14.6, 40.9], [13.8, 41.4], [12.9, 42.0], [12.3, 42.9],
        [11.3, 43.7], [9.9, 44.1], [8.7, 44.3]]),
    "picos": dict(kind="mountains", cc=["ES"], label=L("Picos de Europa", "Picos de Europa", "Picos de Europa", "Picos de Europa", "Picos de Europa", "Picos de Europa"), box=[-5.15, 43.05, -4.45, 43.35]),
    "highlands": dict(kind="mountains", cc=["GB"], label=L("Scottish Highlands", "Schotse Hooglanden", "Schottische Highlands", "Highlands écossais", "Tierras Altas de Escocia", "Highlands scozzesi"), poly=[
        [-6.4, 56.0], [-4.5, 56.1], [-2.5, 56.9], [-2.0, 57.6], [-3.4, 58.65], [-5.2, 58.65], [-6.5, 57.9]]),
    "blackforest": dict(kind="mountains", cc=["DE"], label=L("Black Forest", "Zwarte Woud", "Schwarzwald", "Forêt-Noire", "Selva Negra", "Foresta Nera"), box=[7.6, 47.6, 8.6, 48.95]),
    "julian": dict(kind="mountains", cc=["SI", "IT"], label=L("Julian Alps", "Julische Alpen", "Julische Alpen", "Alpes juliennes", "Alpes Julianos", "Alpi Giulie"), box=[13.4, 46.15, 14.2, 46.55]),
    "lakedistrict": dict(kind="mountains", cc=["GB"], label=L("Lake District", "Lake District", "Lake District", "Lake District", "Lake District", "Lake District"), box=[-3.45, 54.25, -2.75, 54.7]),
    # Coasts and islands
    "amalfi": dict(kind="coast", cc=["IT"], label=L("Amalfi Coast", "Amalfikust", "Amalfiküste", "Côte amalfitaine", "Costa Amalfitana", "Costiera Amalfitana"), box=[14.3, 40.55, 14.8, 40.7]),
    "costabrava": dict(kind="coast", cc=["ES"], label=L("Costa Brava", "Costa Brava", "Costa Brava", "Costa Brava", "Costa Brava", "Costa Brava"), box=[2.75, 41.65, 3.35, 42.45]),
    "cotedazur": dict(kind="coast", cc=["FR", "MC"], label=L("French Riviera", "Côte d'Azur", "Côte d'Azur", "Côte d'Azur", "Costa Azul", "Costa Azzurra"), box=[6.5, 43.35, 7.55, 43.85]),
    "cinqueterre": dict(kind="coast", cc=["IT"], label=L("Cinque Terre", "Cinque Terre", "Cinque Terre", "Cinque Terre", "Cinque Terre", "Cinque Terre"), box=[9.55, 44.05, 9.85, 44.2]),
    "crete": dict(kind="coast", cc=["GR"], label=L("Crete", "Kreta", "Kreta", "Crète", "Creta", "Creta"), box=[23.4, 34.8, 26.4, 35.75]),
    "balearics": dict(kind="coast", cc=["ES"], label=L("Balearic Islands", "Balearen", "Balearen", "Baléares", "Islas Baleares", "Baleari"), box=[1.1, 38.6, 4.4, 40.15]),
    "canaries": dict(kind="coast", cc=["ES"], label=L("Canary Islands", "Canarische Eilanden", "Kanaren", "Canaries", "Islas Canarias", "Canarie"), box=[-18.3, 27.5, -13.3, 29.5]),
    "ionian": dict(kind="coast", cc=["GR"], label=L("Ionian Islands", "Ionische Eilanden", "Ionische Inseln", "Îles Ioniennes", "Islas Jónicas", "Isole Ionie"), box=[19.3, 37.6, 21.1, 39.95]),
    "cyclades": dict(kind="coast", cc=["GR"], label=L("Cyclades", "Cycladen", "Kykladen", "Cyclades", "Cícladas", "Cicladi"), box=[24.2, 36.3, 26.2, 37.9]),
    "dalmatia": dict(kind="coast", cc=["HR", "ME", "BA"], label=L("Dalmatia", "Dalmatië", "Dalmatien", "Dalmatie", "Dalmacia", "Dalmazia"), box=[15.0, 42.4, 18.5, 44.9]),
    "algarve": dict(kind="coast", cc=["PT"], label=L("Algarve", "Algarve", "Algarve", "Algarve", "Algarve", "Algarve"), box=[-9.0, 36.9, -7.3, 37.5]),
    "sicily": dict(kind="coast", cc=["IT"], label=L("Sicily", "Sicilië", "Sizilien", "Sicile", "Sicilia", "Sicilia"), box=[12.3, 36.6, 15.7, 38.3]),
    "sardinia": dict(kind="coast", cc=["IT"], label=L("Sardinia", "Sardinië", "Sardinien", "Sardaigne", "Cerdeña", "Sardegna"), box=[8.0, 38.8, 9.9, 41.3]),
    "corsica": dict(kind="coast", cc=["FR"], label=L("Corsica", "Corsica", "Korsika", "Corse", "Córcega", "Corsica"), box=[8.5, 41.3, 9.6, 43.1]),
    "cornwall": dict(kind="coast", cc=["GB"], label=L("Cornwall", "Cornwall", "Cornwall", "Cornouailles", "Cornualles", "Cornovaglia"), box=[-5.8, 49.9, -4.1, 50.9]),
    # Regions
    "tuscany": dict(kind="region", cc=["IT"], label=L("Tuscany", "Toscane", "Toskana", "Toscane", "Toscana", "Toscana"), box=[9.7, 42.4, 12.4, 44.5]),
    "provence": dict(kind="region", cc=["FR"], label=L("Provence", "Provence", "Provence", "Provence", "Provenza", "Provenza"), box=[4.2, 43.1, 7.1, 44.5]),
    "andalusia": dict(kind="region", cc=["ES"], label=L("Andalusia", "Andalusië", "Andalusien", "Andalousie", "Andalucía", "Andalusia"), box=[-7.6, 36.0, -1.6, 38.7]),
    "bavaria": dict(kind="region", cc=["DE"], label=L("Bavaria", "Beieren", "Bayern", "Bavière", "Baviera", "Baviera"), box=[9.0, 47.2, 13.9, 50.6]),
    "alsace": dict(kind="region", cc=["FR"], label=L("Alsace", "Elzas", "Elsass", "Alsace", "Alsacia", "Alsazia"), box=[6.8, 47.4, 8.3, 49.1]),
    "tyrol": dict(kind="region", cc=["AT", "IT"], label=L("Tyrol", "Tirol", "Tirol", "Tyrol", "Tirol", "Tirolo"), box=[10.1, 46.6, 12.9, 47.8]),
    "peloponnese": dict(kind="region", cc=["GR"], label=L("Peloponnese", "Peloponnesos", "Peloponnes", "Péloponnèse", "Peloponeso", "Peloponneso"), box=[21.1, 36.3, 23.5, 38.4]),
    "catalonia": dict(kind="region", cc=["ES"], label=L("Catalonia", "Catalonië", "Katalonien", "Catalogne", "Cataluña", "Catalogna"), box=[0.1, 40.5, 3.4, 42.9]),
    "normandy": dict(kind="region", cc=["FR"], label=L("Normandy", "Normandië", "Normandie", "Normandie", "Normandía", "Normandia"), box=[-1.9, 48.2, 1.8, 49.8]),
    "brittany": dict(kind="region", cc=["FR"], label=L("Brittany", "Bretagne", "Bretagne", "Bretagne", "Bretaña", "Bretagna"), box=[-5.2, 47.2, -1.0, 48.9]),
    "lapland": dict(kind="region", cc=["FI", "SE", "NO"], label=L("Lapland", "Lapland", "Lappland", "Laponie", "Laponia", "Lapponia"), box=[20.0, 66.0, 30.0, 70.1]),
    "puglia": dict(kind="region", cc=["IT"], label=L("Puglia", "Apulië", "Apulien", "Pouilles", "Apulia", "Puglia"), box=[14.9, 39.75, 18.6, 42.25]),
    "salzkammergut": dict(kind="region", cc=["AT"], label=L("Salzkammergut", "Salzkammergut", "Salzkammergut", "Salzkammergut", "Salzkammergut", "Salzkammergut"), box=[13.1, 47.45, 14.1, 47.95]),
    "basque": dict(kind="region", cc=["ES", "FR"], label=L("Basque Country", "Baskenland", "Baskenland", "Pays basque", "País Vasco", "Paesi Baschi"), box=[-3.45, 42.45, -1.0, 43.45]),
}

# ---------------------------------------------------------------------------
# Golden set: a guided question and places a knowledgeable traveller would
# expect in the top ten. Written before tuning (2026-10-13).
GOLDEN = [
    (dict(vibe="lake", country="AT"), ["Hallstatt", "Zell am See", "St. Wolfgang im Salzkammergut", "Bregenz"]),
    (dict(vibe="lake", country="IT"), ["Bellagio", "Varenna", "Como", "Sirmione", "Riva del Garda", "Stresa"]),
    (dict(vibe="mountain", country="CH"), ["Zermatt", "Grindelwald", "Wengen", "Lauterbrunnen", "St. Moritz"]),
    (dict(vibe="hiking", area="dolomites"), ["Cortina d'Ampezzo", "Ortisei", "Canazei", "Selva di Val Gardena"]),
    (dict(vibe="oldtown", country="HR"), ["Dubrovnik", "Split", "Rovinj", "Trogir", "Korčula"]),
    (dict(vibe="oldtown", country="CZ"), ["Český Krumlov", "Prague", "Telč", "Kutná Hora"]),
    (dict(vibe="castles", country="DE"), ["Füssen", "Heidelberg", "Cochem", "Schwangau"]),
    (dict(vibe="island", country="GR"), ["Santorini", "Naxos", "Paros", "Mykonos", "Milos", "Corfu"]),
    (dict(vibe="beach", country="PT"), ["Lagos", "Albufeira", "Tavira", "Carvoeiro"]),
    (dict(vibe="food", country="IT"), ["Bologna", "Parma", "Modena", "Florence", "Naples"]),
    (dict(vibe="nightlife", country="ES"), ["Ibiza", "Barcelona", "Madrid", "Valencia"]),
    (dict(vibe="spa"), ["Budapest", "Baden-Baden", "Karlovy Vary", "Bath"]),
    (dict(vibe="art", country="NL"), ["Amsterdam", "The Hague", "Rotterdam"]),
    (dict(vibe="hiking", area="highlands"), ["Fort William", "Aviemore", "Glencoe"]),
    (dict(vibe="views", country="NO"), ["Flåm", "Geiranger", "Bergen", "Ålesund"]),
    (dict(vibe="beach", area="sardinia"), ["Alghero", "Villasimius", "Cala Gonone", "Olbia"]),
    (dict(vibe="island", country="HR"), ["Hvar", "Korčula", "Vis", "Brač"]),
    (dict(vibe="quiet", area="alps"), ["Hallstatt", "Alpbach", "Mürren", "Gimmelwald", "Bled"]),
    (dict(vibe="romantic", country="FR"), ["Annecy", "Colmar", "Paris", "Saint-Paul-de-Vence"]),
    (dict(vibe="hiking", area="pyrenees"), ["Torla", "Benasque", "Cauterets", "Gavarnie"]),
]


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def in_poly(lon, lat, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def in_area(lon, lat, a, cc=None):
    if a.get("cc") and cc not in a["cc"]:
        return False
    if "box" in a:
        w, s, e, n = a["box"]
        return w <= lon <= e and s <= lat <= n
    return in_poly(lon, lat, a["poly"])


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


def layer_points(folder, key, min_tier=0):
    """Points of one outdoor layer, by iso2: {cc: [(lat, lon), ...]}. Rows
    under min_tier are left out: a reservoir or a lagoon is not a lake a
    traveller asks for, a hillock is not a peak."""
    out = {}
    d = PUBLIC / folder
    for f in sorted(d.glob("*.json")):
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001 - a broken file is skipped, counted below
            print(f"  skipped unreadable {f.name}")
            continue
        rows = j.get(key) or []
        pts = []
        for r in rows:
            if folder == "trails":
                g = r.get("geometry") or {}
                coords = g.get("coordinates") or []
                if g.get("type") == "MultiLineString" and coords and coords[0]:
                    ends = [coords[0][0], coords[-1][-1]]
                elif g.get("type") == "LineString" and coords:
                    ends = [coords[0], coords[-1]]
                else:
                    continue
                pts += [(e[1], e[0]) for e in ends]
            elif (r.get("tier") or 0) < min_tier:
                continue
            elif r.get("lat") is not None and r.get("lon") is not None:
                pts.append((r["lat"], r["lon"]))
        out[f.stem] = pts
    return out


def near(lat, lon, pts, within):
    """(nearest km, how many within `within` km) over a point list."""
    best = None
    n = 0
    for (plat, plon) in pts:
        if abs(plat - lat) > 0.3 or abs(plon - lon) > 0.45:
            continue
        d = km(lat, lon, plat, plon)
        if d <= within:
            n += 1
        if best is None or d < best:
            best = d
    return best, n


def document(d):
    parts = [d.get("city") or "", d.get("country") or ""]
    if d.get("blurb"):
        parts.append(d["blurb"])
    cats = d.get("categories") or []
    tags = d.get("tags") or []
    if cats or tags:
        parts.append("Known for: " + ", ".join(cats + tags) + ".")
    g = (d.get("guide") or {}).get("text") or ""
    if g:
        parts.append(g[:400])
    items = ((d.get("activities") or {}).get("items") or [])[:8]
    names = [i.get("name") for i in items if i.get("name")]
    if names:
        parts.append("Sights: " + ", ".join(names) + ".")
    return " ".join(p for p in parts if p).strip()


def embed_documents(docs):
    """{id: doc} -> {id: unit vector}, cached by document hash and model."""
    import numpy as np
    from sentence_transformers import SentenceTransformer

    cached = {}
    if CACHE.exists():
        z = np.load(CACHE, allow_pickle=False)
        if str(z["model"]) == MODEL:
            for k, h, v in zip(z["ids"], z["hashes"], z["vecs"]):
                cached[str(k)] = (str(h), v)
    want = {k: hashlib.sha1(v.encode("utf-8")).hexdigest() for k, v in docs.items()}
    todo = [k for k, h in want.items() if k not in cached or cached[k][0] != h]
    model = SentenceTransformer(MODEL, device="cpu")
    if todo:
        print(f"  embedding {len(todo)} of {len(docs)} documents ({len(docs) - len(todo)} cached)")
        t0 = time.time()
        vecs = model.encode([docs[k] for k in todo], batch_size=64, normalize_embeddings=True, show_progress_bar=False)
        print(f"  embedded in {time.time() - t0:.0f} s")
        for k, v in zip(todo, vecs):
            cached[k] = (want[k], v)
    ids = sorted(docs)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE, model=np.array(MODEL), ids=np.array(ids),
                        hashes=np.array([cached[k][0] for k in ids]),
                        vecs=np.stack([cached[k][1] for k in ids]).astype("float32"))
    return {k: cached[k][1] for k in ids}, model


def build():
    import numpy as np

    t0 = time.time()
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    dests = data["destinations"]
    if isinstance(dests, list):
        dests = {d["id"]: d for d in dests}
    print(f"guided search: {len(dests)} destinations")

    layers = {
        "beach": layer_points("beaches", "beaches"),
        "lake": layer_points("lakes", "lakes", min_tier=2),
        "peak": layer_points("mountains", "mountains", min_tier=1),
        "trail": layer_points("trails", "trips"),
    }
    for k, v in layers.items():
        print(f"  {k}: {sum(len(p) for p in v.values())} points in {len(v)} countries")

    rows = {}
    for did, d in dests.items():
        lat, lon = d.get("lat"), d.get("lon")
        if lat is None or lon is None:
            continue
        cc = d.get("iso2") or ""
        nb = {}
        trail_ends = 0
        for layer, by_cc in layers.items():
            k, n = near(lat, lon, by_cc.get(cc, []), 8.0)
            if k is not None and k <= NB_MAX_KM:
                nb[layer] = round(k, 1)
            if layer == "trail":
                trail_ends = n
        areas = [aid for aid, a in AREAS.items() if in_area(lon, lat, a, cc)]
        rows[did] = {"nb": nb, "a": areas, "_trails8": trail_ends}

    # Facts first.
    facts = {}
    for did, d in dests.items():
        if did not in rows:
            continue
        cats = set(d.get("categories") or []) | set(d.get("tags") or [])
        coastal = bool(cats & {"coast", "beach", "island", "islands"})
        # A city has trail ends around it (urban walks, long-distance routes
        # passing through), which does not make it a hiking base (T427).
        urban = "city" in cats or ((dests[did].get("place") or {}).get("class") in ("metro", "city"))
        f = {}
        for vid, v in VIBES.items():
            tagged = bool(cats & v["cats"])
            close = False
            rule = v.get("near")
            if rule and not (v.get("coastal") and not coastal):
                dist = rows[did]["nb"].get(rule[0])
                close = dist is not None and dist <= rule[1]
                if close and len(rule) > 2:  # a minimum count within the radius
                    close = rows[did]["_trails8"] >= rule[2] and not urban
            if rule:
                # A tag with the thing close by is proof; a tag far from it
                # (an inland city tagged "beach") or the thing alone is less.
                s = 100 if tagged and close else 80 if close else 70 if tagged else 0
            else:
                s = 100 if tagged else 0
            if s:
                f[vid] = s
        facts[did] = f

    # Text second.
    docs = {did: document(dests[did]) for did in rows}
    vecs, model = embed_documents(docs)
    ids = sorted(vecs)
    M = np.stack([vecs[k] for k in ids])
    text_vibes = [vid for vid, v in VIBES.items() if not v.get("facts_only")]
    V = model.encode([VIBES[v]["desc"] for v in text_vibes], normalize_embeddings=True, show_progress_bar=False)
    sims = M @ V.T  # (n_dest, n_vibe)
    thin = np.array([len(docs[k]) < 80 for k in ids])
    text = {k: {} for k in ids}
    for j, vid in enumerate(text_vibes):
        col = sims[:, j]
        order = col.argsort()
        pct = np.empty_like(col)
        pct[order] = np.arange(len(col)) / max(1, len(col) - 1)
        for i, k in enumerate(ids):
            if thin[i] or pct[i] < 0.9:
                continue
            # the top tenth maps to 55..75: text never outranks a fact
            text[k][vid] = int(round(55 + (pct[i] - 0.9) / 0.1 * 20))

    for did in rows:
        merged = dict(text.get(did, {}))
        for vid, s in facts[did].items():
            merged[vid] = max(merged.get(vid, 0), s)
        top = sorted(merged.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
        rows[did]["v"] = {k: s for k, s in top if s >= 55}
        rows[did].pop("_trails8", None)

    out = {
        "version": VERSION,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": MODEL,
        "nb_max_km": NB_MAX_KM,
        "vibes": [{"id": vid, "label": v["label"]} for vid, v in VIBES.items()],
        "areas": [{"id": aid, "kind": a["kind"], "label": a["label"], **({"cc": a["cc"]} if a.get("cc") else {}),
                   **({"box": a["box"]} if "box" in a else {"poly": a["poly"]})} for aid, a in AREAS.items()],
        "d": {did: {k: v for k, v in r.items() if v} for did, r in sorted(rows.items())},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(OUT, out, indent=None, separators=(",", ":"))
    n_v = sum(1 for r in rows.values() if r.get("v"))
    print(f"wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB, "
          f"{len(rows)} destinations, {n_v} with a vibe, {len(AREAS)} areas, {len(VIBES)} vibes "
          f"({time.time() - t0:.0f} s)")
    return dests


def rank(dests, guided, q):
    """The ranking the app uses (src/lib/guidedSearch.js mirrors it)."""
    hits = []
    for did, r in guided["d"].items():
        d = dests.get(did)
        if not d:
            continue
        if q.get("country") and d.get("iso2") != q["country"]:
            continue
        if q.get("area") and q["area"] not in (r.get("a") or []):
            continue
        s = (r.get("v") or {}).get(q["vibe"], 0)
        if s < 55:
            continue
        score = (d.get("rating") or {}).get("score") or 0
        hits.append((s * 0.7 + score * 3, d.get("city") or did))
    hits.sort(key=lambda x: -x[0])
    seen, out = set(), []
    for _, c in hits:
        base = c.split(" (")[0]
        if base in seen:
            continue
        seen.add(base)
        out.append(c)
    return out


def check(dests=None):
    if dests is None:
        data = json.loads(MASTER.read_text(encoding="utf-8"))
        dests = data["destinations"]
        if isinstance(dests, list):
            dests = {d["id"]: d for d in dests}
    guided = json.loads(OUT.read_text(encoding="utf-8"))
    held = {fold(d.get("city") or ""): d.get("city") for d in dests.values()}
    total_hit = total_exp = 0
    print("golden set (expected places held by the catalogue, found in the top 10):")
    for q, expected in GOLDEN:
        exp = [e for e in expected if any(fold(e) in k or k.startswith(fold(e)) for k in held)]
        top = rank(dests, guided, q)[:10]
        topf = [fold(t) for t in top]
        hit = [e for e in exp if any(fold(e) in t for t in topf)]
        total_hit += len(hit)
        total_exp += len(exp)
        label = ", ".join(f"{k}={v}" for k, v in q.items())
        print(f"  {label:32} {len(hit)}/{len(exp)} held  top: {', '.join(top[:6])}")
        missing = [e for e in expected if e not in exp]
        if missing:
            print(f"  {'':32} not in the catalogue: {', '.join(missing)}")
    print(f"golden total: {total_hit} of {total_exp} held expectations in the top 10")
    return total_hit, total_exp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="check the existing output only")
    a = ap.parse_args()
    dests = None if a.check else build()
    check(dests)


if __name__ == "__main__":
    main()
