"""

Tier: Manual

build_wire.py - the curated trip library ("journeys") as a browsable wire.

Reads the unified 253-trip dataset (Trips/carta-unified, schema v2.0: ten
canonical trip types, one 7-day itinerary per record, everything editorial)
and writes the three artifacts the Destinations tab browses:

    continent-app/public/journeys/index.json          the ten trip styles,
                                                      each with a hero photo
    continent-app/public/journeys/type/{slug}.json    cards for one style
    continent-app/public/journeys/journey/{id}.json   one trip in full

The dataset ships no photography at all, so this script also harvests one
hero per trip and one per style from the Wikipedia API (lead images, which
are Commons files with a page to credit). Candidates are the places the
record itself names - the resolved coordinate place, the basecamp towns, the
sub-region - so a photograph is always of somewhere the trip actually goes.
Records whose coordinate is only a gateway- or capital-city pin never take a
photograph from that pin: the schema flags those pins as "a map pin rather
than a location" and a picture of Sofia on a Bansko ski week would be a lie.

Harvest results are cached in cache/journey_images.json so re-runs are
offline and idempotent.

House rules applied to every shipped string (mirrors lib/format.js
stripDashes): no em/en dashes; numeric ranges and tight joins become a plain
hyphen, spaced prose dashes a comma. Inline [VERIFY: ...] markers are lifted
out of display prose (they already live in verifyFlags[]).

T911: journey/{id}.json carries fit {good: [...], less: [...]} when
Trips/carta-unified/carta-unified/data/fit.json has a row for the trip.

Run from the repo root:  python pipeline/journeys/build_wire.py
Offline re-export:       python pipeline/journeys/build_wire.py --no-fetch
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Trips" / "carta-unified" / "carta-unified" / "data" / "trips.master.json"
OUT = ROOT / "continent-app" / "public" / "journeys"
CACHE_PATH = ROOT / "cache" / "journey_images.json"
# T911: who a trip suits, {journeys: {id: {good: [...], less: [...]}}}, kept
# next to the dataset and filled by hand or a later pass; a trip with no row
# gets no fit key.
FIT_PATH = SRC.parent / "fit.json"

API = "https://en.wikipedia.org/w/api.php"
UA = "CartaTravelApp/1.0 (https://carta-europetravel.com; hero image harvest)"
THUMB_W = 1280          # a width upload.wikimedia.org actually renders
MIN_W = 640             # a hero narrower than this reads as a thumbnail
FETCH_PAUSE = 0.15      # polite gap between API calls

# The ten canonical types, in schema id order, with the articles whose lead
# image may front the style card. First candidate with a wide landscape lead
# wins; every one of them is an iconic, recognisable place for that style.
TYPE_HERO_CANDIDATES = {
    "cycling": ["Passo dello Stelvio", "Sella Pass", "Col du Galibier",
                "Danube Cycle Path"],
    "trail-running": ["Mont Blanc massif", "Chamonix",
                      "Ultra-Trail du Mont-Blanc"],
    "city": ["Charles Bridge", "Prague", "Grand-Place"],
    "cozy-towns": ["Hallstatt", "Colmar", "Rothenburg ob der Tauber"],
    "road-trip": ["Transfăgărășan",
                  "Grossglockner High Alpine Road", "Amalfi Coast"],
    "hiking": ["Tre Cime di Lavaredo", "Matterhorn", "Lac Blanc (Chamonix)"],
    "culinary": ["Wachau", "Lavaux", "Douro"],
    "winter-sports": ["Zermatt", "St. Moritz", "Kitzbühel"],
    "nature-escape": ["Lofoten", "Lake Bled", "Black Forest"],
    "water-sports": ["Navagio", "Calanques National Park", "Costa Brava"],
    # T431: the new styles' photographs come from samples.lock.json; these
    # article leads are the fallback a full build would try.
    "hostel": ["Stari Most", "Kotor"],
    "beach-week": ["Makarska Riviera", "Brela"],
    "rail": ["Semmering railway", "Wien Hauptbahnhof"],
    "pilgrim": ["Camino de Santiago", "Santiago de Compostela Cathedral"],
    "island-hopping": ["Paros", "Naxos"],
}
# T431: the sample trips of the new styles (sample_trips.py) pin their own
# hero, and each new style its photograph, from the dossier galleries the
# app already ships; the lock file is written by that script.
SAMPLES_LOCK = Path(__file__).resolve().parent / "samples.lock.json"


def load_samples_lock():
    if not SAMPLES_LOCK.exists():
        return {}, {}
    raw = json.loads(SAMPLES_LOCK.read_text(encoding="utf-8"))
    return raw.get("heroes") or {}, raw.get("typeHeroes") or {}


# T448: the order the traveller meets the styles, which is the audience order
# of T203 (walkers first, then quiet nature, bikes, cities and towns, cars,
# food, water, snow, runners), not the schema id order.
TYPE_ORDER = ["hiking", "nature-escape", "cycling", "city", "cozy-towns",
              "road-trip", "culinary", "water-sports", "winter-sports",
              "trail-running",
              # T431: the five styles the owner added on 2026-10-15, each
              # with one sample trip (sample_trips.py) until the catalogue
              # grows; they follow the ten the traveller already knows.
              "hostel", "beach-week", "rail", "pilgrim", "island-hopping"]

# T448: the style card shows people doing the thing (owner, 2026-10-14; the
# amended rule 6 of docs/IMAGE_BRIEF.md). Each is one Commons file looked at
# by eye, with its author and licence from the file page; it wins over the
# article leads above, which stay as the fallback.
TYPE_HERO_FILES = {
    "cycling": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Col_Aubisque.jpg/1280px-Col_Aubisque.jpg", "w": 1280, "h": 775, "credit": "Col d'Aubisque", "page": "https://commons.wikimedia.org/wiki/File:Col_Aubisque.jpg", "author": "Myrabella", "licence": "CC BY-SA 3.0"},
    "trail-running": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Runners_on_track_below_Lonscale_Fell_-_geograph.org.uk_-_4649478.jpg/1280px-Runners_on_track_below_Lonscale_Fell_-_geograph.org.uk_-_4649478.jpg", "w": 1280, "h": 960, "credit": "Lonscale Fell, Lake District", "page": "https://commons.wikimedia.org/wiki/File:Runners_on_track_below_Lonscale_Fell_-_geograph.org.uk_-_4649478.jpg", "author": "Alan O'Dowd", "licence": "CC BY-SA 2.0"},
    "city": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Stradun_%28Dubrovnik%29_02_%28js%29.jpg/1280px-Stradun_%28Dubrovnik%29_02_%28js%29.jpg", "w": 1280, "h": 838, "credit": "Stradun, Dubrovnik", "page": "https://commons.wikimedia.org/wiki/File:Stradun_(Dubrovnik)_02_(js).jpg", "author": "Jerzy Strzelecki", "licence": "CC BY-SA 3.0"},
    "cozy-towns": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/%C3%93bidos_-1_%2852113575953%29.jpg/1280px-%C3%93bidos_-1_%2852113575953%29.jpg", "w": 1280, "h": 853, "credit": "Óbidos", "page": "https://commons.wikimedia.org/wiki/File:%C3%93bidos_-1_(52113575953).jpg", "author": "Art Prof from Salt Lake City, UT", "licence": "CC BY 2.0"},
    "road-trip": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Iceland_trip_%28Unsplash%29.jpg/1280px-Iceland_trip_%28Unsplash%29.jpg", "w": 1280, "h": 853, "credit": "Ring Road, Iceland", "page": "https://commons.wikimedia.org/wiki/File:Iceland_trip_(Unsplash).jpg", "author": "Calvin Chou (calvin1029)", "licence": "CC0"},
    "hiking": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/CH.VS.Zermatt_2021-10-17_Matterhorn_8726.jpg/1280px-CH.VS.Zermatt_2021-10-17_Matterhorn_8726.jpg", "w": 1280, "h": 853, "credit": "Trail above Zermatt", "page": "https://commons.wikimedia.org/wiki/File:CH.VS.Zermatt_2021-10-17_Matterhorn_8726.jpg", "author": "Roy Egloff", "licence": "CC BY-SA 4.0"},
    "culinary": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/4_vendangeurs_by_JM_Rosier.jpg/1280px-4_vendangeurs_by_JM_Rosier.jpg", "w": 1280, "h": 841, "credit": "Beaumes-de-Venise vineyards", "page": "https://commons.wikimedia.org/wiki/File:4_vendangeurs_by_JM_Rosier.jpg", "author": "Jean-Marc Rosier", "licence": "CC BY-SA 3.0"},
    "winter-sports": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Off-piste_skiers_ready_for_takeoff_from_Storebj%C3%B8rn_peak_in_Jotunheimen.jpg/1280px-Off-piste_skiers_ready_for_takeoff_from_Storebj%C3%B8rn_peak_in_Jotunheimen.jpg", "w": 1280, "h": 853, "credit": "Storebjørn, Jotunheimen", "page": "https://commons.wikimedia.org/wiki/File:Off-piste_skiers_ready_for_takeoff_from_Storebj%C3%B8rn_peak_in_Jotunheimen.jpg", "author": "Frankemann", "licence": "CC BY-SA 4.0"},
    "nature-escape": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Sota_Seter_with_main_building.jpg/1280px-Sota_Seter_with_main_building.jpg", "w": 1280, "h": 853, "credit": "Sota Sæter, Breheimen", "page": "https://commons.wikimedia.org/wiki/File:Sota_Seter_with_main_building.jpg", "author": "Frankemann", "licence": "CC BY-SA 4.0"},
    "water-sports": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/004_Benagil_Beach_%28Praia_Benagil%29_sea_kayaking_recreational_activity_in_Algarve%2C_Portugal.jpg/1280px-004_Benagil_Beach_%28Praia_Benagil%29_sea_kayaking_recreational_activity_in_Algarve%2C_Portugal.jpg", "w": 1280, "h": 853, "credit": "Praia de Benagil", "page": "https://commons.wikimedia.org/wiki/File:004_Benagil_Beach_(Praia_Benagil)_sea_kayaking_recreational_activity_in_Algarve,_Portugal.jpg", "author": "Marek Ślusarczyk (Tupungato)", "licence": "CC BY 3.0"},
}

# T448: the cheap beds a trip offers, read from its accommodation list, so
# the library can filter on a hostel, hut or campsite night across styles.
BED_WORDS = {
    "hostel": re.compile(r"\b(hostels?|jugendherberge|auberge de jeunesse|dorm(itor(y|ies))?s?|bunks?)\b", re.I),
    "hut": re.compile(r"\b(huts?|refuges?|refugios?|rifugi|rifugio|chata|chaty|bouda|planinarski dom|bac[oó]wka|katun|cabane|h[uü]tte|hizha|koliba)\b", re.I),
    "camp": re.compile(r"\b(campsites?|camping|campground|glamping)\b", re.I),
}
NOT_A_HOSTEL_RE = re.compile(r"hostellerie|superbude", re.I)


def load_fit():
    """{id: {good, less}} with empty lists dropped; {} when the file is absent."""
    if not FIT_PATH.exists():
        return {}
    try:
        raw = json.loads(FIT_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out = {}
    for tid, row in (raw.get("journeys") or {}).items():
        if not isinstance(row, dict):
            continue
        fit = {k: [strip_dashes(str(x)) for x in row.get(k) or [] if x]
               for k in ("good", "less")}
        fit = {k: v for k, v in fit.items() if v}
        if fit:
            out[tid] = fit
    return out


def bed_kinds(trip):
    """hostel / hut / camp, for each kind any ranked bed of the trip names."""
    out = []
    for a in trip.get("accommodationStrategy") or []:
        if not isinstance(a, dict):
            continue
        text = " ".join(str(a.get(k) or "") for k in ("name", "style", "description"))
        for kind, rx in BED_WORDS.items():
            if kind in out or not rx.search(text):
                continue
            if kind == "hostel" and NOT_A_HOSTEL_RE.search(text) and not re.search(r"\bdorm", text, re.I):
                continue
            out.append(kind)
    return [k for k in BED_WORDS if k in out]

VERIFY_RE = re.compile(r"\s*`?\[VERIFY[^\]]*\]`?", re.IGNORECASE)

# Hand-named places for the trips whose own vocabulary only reaches articles
# with map leads (the Peloponnese article opens on an SVG locator). The name
# is still somewhere the trip goes; only the article choice is manual.
MANUAL_PLACES = {
    "gr-cycling-peloponnese-arcadia": ["Dimitsana", "Nafplio"],
    "gr-road-trip-peloponnese-loop": ["Monemvasia", "Nafplio"],
    "ad-hiking-coma-pedrosa-madriu": ["Coma Pedrosa",
                                      "Madriu-Perafita-Claror Valley"],
}


# T448: heroes looked at by eye after the rebuild. The J2 uniqueness pass and
# the newly cached places moved 32 trips to another photograph; 12 of the
# new ones were worse (a ski week without snow, an office block for the
# Soroca loop) and keep the photograph they had, and 3 had no good one
# either way and take a hand-picked Commons file. Pinned like the audit
# patch: the uniqueness pass never moves them.
JOURNEY_HERO_PINS = {
    "ad-winter-sports-grandvalira": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/AndorraSoldeuView.JPG/1280px-AndorraSoldeuView.JPG", "w": 1280, "h": 1144, "credit": "Soldeu", "page": "https://en.wikipedia.org/wiki/Soldeu"},
    "al-water-sports-riviera-karaburun": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Sazan%2C_godinet_dhe_port.jpg/1280px-Sazan%2C_godinet_dhe_port.jpg", "w": 1280, "h": 784, "credit": "Sazan Island Resort", "page": "https://en.wikipedia.org/wiki/Sazan_Island_Resort"},
    "be-winter-sports-hautes-fagnes-nordic": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Vue_de_Malmedy_en_mai_2012.jpg/1280px-Vue_de_Malmedy_en_mai_2012.jpg", "w": 1280, "h": 960, "credit": "Malmedy", "page": "https://en.wikipedia.org/wiki/Malmedy"},
    "bg-winter-sports-bansko-pirin": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Bansko_ski_resort_%2823917454674%29.jpg/1280px-Bansko_ski_resort_%2823917454674%29.jpg", "w": 1280, "h": 851, "credit": "Bansko", "page": "https://en.wikipedia.org/wiki/Bansko"},
    "cz-winter-sports-krkonose-spindleruv-mlyn": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Spindle_town.JPG/1280px-Spindle_town.JPG", "w": 1280, "h": 960, "credit": "Špindlerův Mlýn", "page": "https://en.wikipedia.org/wiki/%C5%A0pindler%C5%AFv_Ml%C3%BDn"},
    "hr-cycling-istria-parenzana": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Pula_Aerial_View.jpg/1280px-Pula_Aerial_View.jpg", "w": 1280, "h": 781, "credit": "Pula", "page": "https://en.wikipedia.org/wiki/Pula"},
    "li-winter-sports-malbun-family": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Malbun_seen_from_Augstenberg_%28valo139%29.jpg/1280px-Malbun_seen_from_Augstenberg_%28valo139%29.jpg", "w": 1280, "h": 960, "credit": "Malbun", "page": "https://en.wikipedia.org/wiki/Malbun"},
    "mc-road-trip-three-corniches-turini": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Roquebrune.jpg/1280px-Roquebrune.jpg", "w": 1280, "h": 720, "credit": "Alpes-Maritimes", "page": "https://en.wikipedia.org/wiki/Alpes-Maritimes"},
    "md-road-trip-grand-loop": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/%D0%A1%D0%BE%D1%80%D0%BE%D0%BA%D1%81%D0%BA%D0%B0%D1%8F_%D0%BA%D1%80%D0%B5%D0%BF%D0%BE%D1%81%D1%82%D1%8C_Cetatea_Soroca_Soroca_Fortress_%2844738806701%29.jpg/1280px-%D0%A1%D0%BE%D1%80%D0%BE%D0%BA%D1%81%D0%BA%D0%B0%D1%8F_%D0%BA%D1%80%D0%B5%D0%BF%D0%BE%D1%81%D1%82%D1%8C_Cetatea_Soroca_Soroca_Fortress_%2844738806701%29.jpg", "w": 1280, "h": 800, "credit": "Soroca", "page": "https://en.wikipedia.org/wiki/Soroca"},
    "me-road-trip-tara": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Kotor_aerial_1.jpg/1280px-Kotor_aerial_1.jpg", "w": 1280, "h": 837, "credit": "Bay of Kotor", "page": "https://en.wikipedia.org/wiki/Bay_of_Kotor"},
    "pl-culinary-malopolska": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Krakow_Rynek_Glowny_panorama_2.jpg/1280px-Krakow_Rynek_Glowny_panorama_2.jpg", "w": 1280, "h": 629, "credit": "Kraków", "page": "https://en.wikipedia.org/wiki/Krak%C3%B3w"},
    "pl-winter-sports-zakopane-bialka": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Zakopane_T58.jpg/1280px-Zakopane_T58.jpg", "w": 1280, "h": 960, "credit": "Zakopane", "page": "https://en.wikipedia.org/wiki/Zakopane"},
    "be-water-sports-de-panne-kite-landyacht": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/De_Panne_Beach_R01.jpg/1280px-De_Panne_Beach_R01.jpg", "w": 1280, "h": 785, "credit": "De Panne beach", "page": "https://commons.wikimedia.org/wiki/File:De_Panne_Beach_R01.jpg"},
    "lu-hiking-escapardenne-eislek": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Lac_de_la_Haute-S%C3%BBre%2C_Luxembourg_2012.jpg/1280px-Lac_de_la_Haute-S%C3%BBre%2C_Luxembourg_2012.jpg", "w": 1280, "h": 853, "credit": "Upper Sûre lake", "page": "https://commons.wikimedia.org/wiki/File:Lac_de_la_Haute-S%C3%BBre,_Luxembourg_2012.jpg"},
    "hr-nature-escape-velebit-lika": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Uvala_Veliki-Lubenovac_Northern-Velebit_Dinarides_Croatia.jpg/1280px-Uvala_Veliki-Lubenovac_Northern-Velebit_Dinarides_Croatia.jpg", "w": 1280, "h": 853, "credit": "Veliki Lubenovac, Northern Velebit", "page": "https://commons.wikimedia.org/wiki/File:Uvala_Veliki-Lubenovac_Northern-Velebit_Dinarides_Croatia.jpg"},
    "ro-road-trip-transfagarasan-transalpina": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/RO_B_Transfagarasan_view_towards_the_north_from_Balea_Lake_1.jpg/1280px-RO_B_Transfagarasan_view_towards_the_north_from_Balea_Lake_1.jpg", "w": 1280, "h": 857, "credit": "Transfăgărășan", "page": "https://commons.wikimedia.org/wiki/File:RO_B_Transfagarasan_view_towards_the_north_from_Balea_Lake_1.jpg"},
}

def strip_dashes(s):
    """lib/format.js stripDashes, in Python, so shipped copy obeys the house
    rule at build time rather than at render time."""
    # A price range keeps its meaning as "from X to Y". Plain digit ranges
    # (days, years) take a hyphen, but a range whose right end carries a
    # currency sign (a dash between two euro figures) would fall through to
    # the spaced-dash rule below and become "€1,200, €1,850", which reads as
    # two prices (spec A1), so it becomes "to".
    # Only an unspaced en dash is a range: all 2,079 price ranges in the
    # master are written "€40", en dash, "€55" with no space, while a spaced em dash
    # before a price is prose after an address ("Via Branca 88", em dash, "€4 to 6"), which the old
    # spaced rule turned into "88 to €4, €6" (T143). The lookahead leaves
    # the right-hand figure for the next match, so a chain stays a range.
    s = re.sub(r"(\d)\u2013(?=[€$£]\s?\d)", r"\1 to ", s)
    s = re.sub(r"(\d)\s*[—–]\s*(\d)", r"\1-\2", s)
    s = re.sub(r"(\w)[—–](\w)", r"\1-\2", s)
    s = re.sub(r"\s*[—–]\s*", ", ", s)
    return s


def clean_text(x):
    """Recursively clean every string: dashes out, [VERIFY] markers out."""
    if isinstance(x, str):
        return normalise_bold(strip_dashes(VERIFY_RE.sub("", x)).strip())
    if isinstance(x, list):
        return [clean_text(v) for v in x]
    if isinstance(x, dict):
        # Keys too: the source batches used em-dash headings as raw slot
        # names ("Remote access — the tracks that matter"), and a key is as
        # shipped as a value.
        return {clean_text(k): clean_text(v) for k, v in x.items()}
    return x


BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.S)
BOLD_MAX = 2


def normalise_bold(s):
    """One emphasis rule for every trip (spec J6). The source batches bolded
    place names in some trips and nothing in others, so the page read as
    heavily annotated or as flat prose depending on the trip. The rule: bold
    only the operative fact, meaning a span that carries a figure (a height,
    a distance, a price, a time), and at most BOLD_MAX of them per string, the
    first ones. Every other span, place names included, loses its markers and
    keeps its words. Structure carries the rest of the emphasis."""
    if "**" not in s:
        return s
    kept = 0

    def one(m):
        nonlocal kept
        inner = m.group(1)
        if kept < BOLD_MAX and re.search(r"\d", inner):
            kept += 1
            return m.group(0)
        return inner

    return BOLD_RE.sub(one, s)


# ── Wikipedia lead images ────────────────────────────────────────────────────

def load_cache():
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1),
                          encoding="utf-8")


def api_call(params):
    qs = urllib.parse.urlencode({**params, "format": "json",
                                 "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))
    return None


def fetch_lead_images(titles, cache, allow_fetch):
    """title -> {url, w, h, credit, page} | None, batched 50 a call.
    The cache key is the exact queried title; redirects resolve inside the
    API call, and the answer is stored under what was asked."""
    missing = [t for t in titles if t not in cache]
    if missing and not allow_fetch:
        for t in missing:
            cache[t] = None
    for i in range(0, len(missing) if allow_fetch else 0, 50):
        batch = missing[i:i + 50]
        try:
            data = api_call({
                "action": "query", "redirects": "1",
                "prop": "pageimages|info", "inprop": "url",
                "piprop": "thumbnail|name", "pithumbsize": str(THUMB_W),
                "titles": "|".join(batch),
            })
        except Exception as e:  # noqa: BLE001 - a failed batch is just uncached
            print(f"  ! pageimages batch failed: {e}", file=sys.stderr)
            continue
        # Map redirected/normalized names back to what was asked.
        back = {}
        q = data.get("query", {})
        for r in q.get("normalized", []) + q.get("redirects", []):
            back[r["to"]] = back.get(r["from"], r["from"])
        for page in q.get("pages", []):
            asked = back.get(page.get("title"), page.get("title"))
            thumb = page.get("thumbnail")
            if not thumb or page.get("missing"):
                cache[asked] = None
                continue
            cache[asked] = {
                "url": thumb["source"],
                "w": thumb.get("width"), "h": thumb.get("height"),
                "credit": page.get("title"),
                "page": page.get("fullurl")
                or f"https://en.wikipedia.org/wiki/{urllib.parse.quote(page['title'].replace(' ', '_'))}",
            }
        for t in batch:
            cache.setdefault(t, None)
        time.sleep(FETCH_PAUSE)
    return {t: cache.get(t) for t in titles}


# A hero must be a photograph. Lead images that are maps, flags, seals or
# locator diagrams (almost always PNG/SVG, or named as what they are) would
# put a cartogram on a card that promises a place.
NOT_A_PHOTO_RE = re.compile(
    r"\.(png|svg|gif)(\?|$)|map|karte|locator|locat(?:ion)?_|flag_|"
    r"coat_of|escudo|logo|banner_of", re.IGNORECASE)


def usable(img, min_w=MIN_W, landscape=True):
    if not img or not img.get("url") or not img.get("w"):
        return False
    if NOT_A_PHOTO_RE.search(img["url"].rsplit("/", 1)[-1]):
        return False
    if img["w"] < min_w:
        return False
    if landscape and img.get("h") and img["h"] > img["w"]:
        return False
    return True


PLACE_JUNK_RE = re.compile(
    r"point.to.point|multi.base|various|rotating|see below|n/a", re.IGNORECASE)


def place_candidates(trip):
    """The places whose photograph may front this trip, best claim first."""
    out = []

    def add(name):
        name = re.sub(r"\s*\(.*?\)\s*", " ", str(name or "")).strip(" ,.")
        if not name or len(name) > 60 or PLACE_JUNK_RE.search(name):
            return
        if name not in out:
            out.append(name)

    def add_split(text):
        # "Point-to-point: A -> B -> C", "A to B", "Zealand / Øresund" and
        # "Theth & Plav" all name several places; split on every separator
        # the batches used and keep the parts that read as one place name.
        for part in re.split(r"[:;,/→>&+]|\bto\b|\band\b|\bthe\b", str(text)):
            part = part.strip()
            if part and len(part.split()) <= 4:
                add(part)

    for name in MANUAL_PLACES.get(trip.get("id"), []):
        add(name)
    coords = trip.get("coordinates") or {}
    # A pin derived from the itinerary's named places (geocode.py, T090) is a
    # town the trip passes through, not a claim about what the week looks
    # like, so it does not jump the hero queue: it is tried only after the
    # basecamps and the sub-region, which keeps every hero those already give,
    # and choosing the photograph stays the hero tasks' job (spec B1, the
    # activity and not the nearest town).
    derived = str(coords.get("source") or "").startswith("itinerary places")
    if coords.get("precision") in ("source", "city") and not derived:
        add(coords.get("matchedPlace"))
    for base in trip.get("basecamps") or []:
        add_split(base)
    add_split(trip.get("subRegion") or "")
    if derived:
        add(coords.get("matchedPlace"))
    # The gateway city is last resort ONLY when the schema says the pin is
    # honest; a capital fallback pin stays photograph-less by design.
    if coords.get("precision") == "gateway" and trip.get("gatewayAirport"):
        add(re.sub(r"\s*\([A-Z]{3}\)", "", trip["gatewayAirport"]))
    return out


def search_hero(trip, cache, allow_fetch):
    """Last resort for a trip none of whose named places carried a lead
    image: full-text search Wikipedia for the sub-region (or first basecamp)
    plus the country, then take the first hit whose lead is a usable
    photograph. Cached under the query so re-runs stay offline."""
    what = (trip.get("subRegion") or "").split(",")[0].strip() \
        or (trip.get("basecamps") or [""])[0]
    if not what:
        return None
    query = f"{what} {trip.get('country') or ''}".strip()
    key = f"search::{query}"
    if key in cache:
        hit = cache[key]
        return strip_utm(hit) if usable(hit, landscape=False) else None
    if not allow_fetch:
        return None
    try:
        data = api_call({"action": "query", "list": "search",
                         "srsearch": query, "srlimit": "5",
                         "srnamespace": "0"})
        titles = [r["title"] for r in data["query"]["search"]]
        time.sleep(FETCH_PAUSE)
        found = fetch_lead_images(titles, cache, allow_fetch)
        pick = pick_hero(titles, found)
        cache[key] = pick
        return pick
    except Exception as e:  # noqa: BLE001
        print(f"  ! search fallback failed for {trip['id']}: {e}",
              file=sys.stderr)
        cache[key] = None
        return None


def strip_utm(img):
    """The API stamps ?utm_source=... onto thumb URLs; shipped URLs carry
    none (house rule, and srcset rewrites assume a bare thumb path)."""
    if not img:
        return img
    return {**img, "url": img["url"].split("?")[0]}


def load_hero_overrides():
    """Heroes the trip-hero audit replaced, keyed by journey id.

    continent-app/scripts/audit-trip-heroes.mjs flags journeys whose lead image
    is not a usable view: an 1890 railway map, a coat of arms, a town montage,
    or a shape that cannot survive the card crop. pick_hero below judges a
    candidate on its file NAME alone, which is why those got through; the audit
    reads the Commons categories and dimensions as well.

    An override is checked to be in the journey's own country, so applying it
    cannot move the picture to another nation. An id this file does not mention
    keeps whatever pick_hero chooses.
    """
    path = ROOT / "data" / "reports" / "trip_hero_patch.json"
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out = {}
    for tid, row in (raw.get("heroes") or {}).items():
        if row.get("layer") == "journey" and (row.get("hero") or {}).get("url"):
            out[tid] = row["hero"]
    return out


def pick_hero(candidates, images):
    for name in candidates:
        if usable(images.get(name)):
            return strip_utm(images[name])
    # Second pass: accept portrait rather than ship a grey card.
    for name in candidates:
        if usable(images.get(name), landscape=False):
            return strip_utm(images[name])
    return None


def photo_key(img):
    """The Commons file behind a hero, whatever thumb width serves it: the
    last path segment of the URL without its query or a leading NNNpx-
    prefix, percent-escapes decoded, case folded. Two heroes are the same
    photograph when their keys match (the validator's hero-duplicate check
    uses the same rule)."""
    name = urllib.parse.unquote(str(img["url"]).split("?")[0].rsplit("/", 1)[-1])
    return re.sub(r"^\d+px-", "", name).lower()


# Day titles are prose headings, so most of what they hold is not a place:
# "Arrival", "Stage 3", "Day trip", "Nordic skiing", a country. A second-tier
# name that matches any of these is skipped, as is any country the catalogue
# covers (COUNTRY_NAMES is filled from the master in main()): the lead image
# of a country article is a flag, a map or a skyline of its capital.
TIER2_JUNK_RE = re.compile(
    r"\b(arrival|arrive|departure|depart|stage|day|days|transfer|morning|evening|"
    r"afternoon|final|rest|return|orientation|loop|route|trail|skiing|ski|sledging|"
    r"touring|cycling|hiking|running|sailing|kayak\w*|surf\w*|kite\w*|freeride|"
    r"peak|ridge|riding|ride|walk|hike|market|lunch|dinner|breakfast|tasting)\b",
    re.IGNORECASE)
COUNTRY_NAMES = set()


def itinerary_place_candidates(trip):
    """Second-tier places, used only when a trip's own candidates all
    resolve to photographs another trip already holds: the town named in each
    day's title and sleep line, which the itinerary names in structured slots
    (the same slots geocode.py reads). Free prose is never read."""
    out = []
    for day in trip.get("itinerary") or []:
        for text in (day.get("sleep"), day.get("title")):
            if not text:
                continue
            for part in re.split(r"[:;,/\u2192>&+()]|\bto\b|\band\b|\bthe\b|\bin\b|\bat\b",
                                 str(text)):
                part = re.sub(r"'s\b", "", part).strip(" ,.")
                words = part.split()
                if (part and 1 <= len(words) <= 3 and part[0].isupper()
                        and not PLACE_JUNK_RE.search(part)
                        and not TIER2_JUNK_RE.search(part)
                        and part not in COUNTRY_NAMES and part not in out):
                    out.append(part)
    return out


def hero_claim_rank(trip, img, per_trip, images):
    """How strongly this trip claims the photograph: the position of the
    place that gave it in the trip's own candidate list (0 is the first
    basecamp). A hero that did not come from a candidate (a search hit, an
    audit replacement) claims it more weakly than any candidate would."""
    key = photo_key(img)
    for i, name in enumerate(per_trip.get(trip["id"], [])):
        got = images.get(name)
        if got and got.get("url") and photo_key(got) == key:
            return i
    return 99


def make_heroes_unique(trips, heroes, per_trip, images, pinned):
    """No photograph fronts more than one trip (spec J2).

    Two weeks opening on one photograph is the plainest sign the catalogue is
    generated, and it happens because neighbouring trips name the same town
    (a Prague city week and a Moravia beer week; a Vienna week and the
    Danube ride). The trip with the strongest claim keeps the photograph: the
    lowest candidate position, then a city trip over any other style, then the
    id, so the result does not depend on dict order. Every other trip walks its
    own candidates again, then the itinerary's named towns, and takes the
    first usable lead image no other trip holds. A trip in `pinned` (the audit
    patch, a person's choice) is never moved.

    Returns the ids still without a unique hero; the caller refuses to write
    the wire while that list is not empty."""
    by_id = {t["id"]: t for t in trips}
    taken = {}  # photo key -> trip id that holds it

    def claim_order(tid):
        t = by_id[tid]
        return (0 if tid in pinned else 1,
                hero_claim_rank(t, heroes[tid], per_trip, images),
                0 if t.get("tripTypeSlug") == "city" else 1, tid)

    holders = {}
    for tid, h in heroes.items():
        if h:
            holders.setdefault(photo_key(h), []).append(tid)
    losers = []
    for key, tids in holders.items():
        tids.sort(key=claim_order)
        taken[key] = tids[0]
        losers += [x for x in tids[1:] if x not in pinned]
    for tid in sorted(t["id"] for t in trips if not heroes.get(t["id"])):
        losers.append(tid)

    unresolved = []
    for tid in sorted(set(losers)):
        t = by_id[tid]
        names = list(per_trip.get(tid, []))
        names += [n for n in itinerary_place_candidates(t) if n not in names]
        pick = None
        for landscape in (True, False):
            for name in names:
                img = images.get(name)
                if usable(img, landscape=landscape) and photo_key(img) not in taken:
                    pick = strip_utm(img)
                    break
            if pick:
                break
        if pick:
            heroes[tid] = pick
            taken[photo_key(pick)] = tid
        else:
            heroes[tid] = None
            unresolved.append(tid)
    return unresolved


# ── Cards and details ────────────────────────────────────────────────────────

def month_short(months):
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [names[m - 1] for m in months if 1 <= m <= 12]


# ── Avoid months ─────────────────────────────────────────────────────────────
# bestPeriod.avoid is free text ("July-August (35 C on unshaded asphalt)").
# The month strip needs numbers, so read the month names out of it. Dashes are
# already gone by the time this runs (clean_text), so a range reads "July-August".

_MONTHS = ["january", "february", "march", "april", "may", "june", "july",
           "august", "september", "october", "november", "december"]
_MONTH_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|Sept|October|"
    r"November|December)\b")
# What may sit between the two ends of a range: a dash or "to", plus day
# numbers and fuzzy words ("mid-July to late August", "December-7 January").
_RANGE_GAP = re.compile(
    r"^\s*(?:-|to|through|until)\s*(?:(?:mid-?|late|early|the|first|last|half|"
    r"week|of|third|second|fortnight|\d{1,2})\s*)*$", re.I)


def _month_no(word):
    w = word.lower()
    return 9 if w == "sept" else _MONTHS.index(w) + 1


def parse_avoid_months(text):
    """Month numbers (1-12, sorted) a free-text avoid note names.
    A range wraps the year end (November-March is 11, 12, 1, 2, 3).
    Month words only count when capitalised, so the verb "may" is ignored,
    but a sentence-initial "May" is a month, which is what the data means."""
    if not text:
        return []
    found = list(_MONTH_RE.finditer(text))
    out = set()
    i = 0
    while i < len(found):
        a = _month_no(found[i].group(1))
        if i + 1 < len(found) and _RANGE_GAP.match(
                text[found[i].end():found[i + 1].start()]):
            b = _month_no(found[i + 1].group(1))
            m = a
            while True:
                out.add(m)
                if m == b:
                    break
                m = m % 12 + 1
            i += 2
        else:
            out.add(a)
            i += 1
    return sorted(out)


# ── Gateway airports ─────────────────────────────────────────────────────────
# Register rows T088-a and T092-a: the journey page used to split the one
# hand-written gatewayAirport string into airport rows in the browser
# (src/lib/gateway.js). The rows are now written here, once, as structured data
# (code, name, transfer minutes), so the page renders data rather than
# parsing prose. A v2.1 record (schema/trip.generated.schema.json) carries
# gateways already and they pass through untouched. A v2.0 record is read
# with the same two shapes gateway.js reads ("CODE Name, transfer" and
# "Name (CODE), transfer"), and the same completeness rule: anything that
# would not fit a row marks the list partial, and the page then shows the
# first airport and keeps the whole original text behind its info button.

_GW_CODE_FIRST = re.compile(r"^([A-Z]{3})\b[,\s]*\s*(.*)$", re.ASCII)
_GW_NAME_FIRST = re.compile(r"^(?:Fly\s+)?([^()]{2,40}?)\s*\(([A-Z]{3})\)\s*[,.]?\s*(.*)$")
_GW_SPLIT_NAME = re.compile(r"^(.*?)(?:,\s+|\s+(?=\d)|\s+is\s+|\s+has\s+|$)(.*)$")
_GW_MAX_DETAIL = 70
_GW_HOURS = re.compile(r"(\d{1,2})\s*h(?:\s*(\d{1,2})(?!\d)(?:\s*min)?)?\b")
_GW_MINUTES = re.compile(r"(\d{1,3})\s*min\b")


def transfer_minutes(detail):
    """The first duration a transfer note states, in minutes, or None.
    "2 h 05 to Krasno" is 125, "55 min" is 55, "approx 3h30" is 210."""
    h = _GW_HOURS.search(detail or "")
    m = _GW_MINUTES.search(detail or "")
    if h and (not m or h.start() <= m.start()):
        return int(h.group(1)) * 60 + int(h.group(2) or 0)
    if m:
        return int(m.group(1))
    return None


def parse_gateways(text):
    """(rows, complete) from a v2.0 gatewayAirport string; the Python twin of
    src/lib/gateway.js parseGateway, kept identical so the 144 trips it
    rendered as rows render the same rows from the wire."""
    src = str(text or "").replace("**", "").strip()
    if not src:
        return [], False
    rows, complete = [], True
    for seg in re.split(r"\s*;\s*", src):
        if not seg:
            continue
        a = _GW_CODE_FIRST.match(seg)
        b = None if a else _GW_NAME_FIRST.match(seg)
        if a:
            n = _GW_SPLIT_NAME.match(a.group(2))
            name, det = (n.group(1), n.group(2)) if n else (a.group(2), "")
            rows.append({"code": a.group(1), "name": name.strip(), "detail": det.strip()})
        elif b:
            det = re.sub(r"^(is|has)\s+", "", b.group(3).strip())
            rows.append({"code": b.group(2), "name": b.group(1).strip(), "detail": det})
        elif rows:
            rows[-1]["detail"] = re.sub(r"^;\s*", "", f"{rows[-1]['detail']}; {seg}")
        else:
            complete = False
    for r in rows:
        if (re.search(r"[.!?]\s+\S", r["detail"]) or re.search(r"\([A-Z]{3}\)", r["detail"])
                or len(r["detail"]) > _GW_MAX_DETAIL or len(r["name"]) > 40):
            complete = False
    if not rows:
        complete = False
    return rows, complete


def gateway_rows(trip):
    """(gateways, partial) for the wire. gateways follows the v2.1 shape:
    {code, name, transferMin, transferTo, note}."""
    if isinstance(trip.get("gateways"), list):
        return trip["gateways"], False
    text = trip.get("gatewayAirport")
    if not text:
        return [], False
    rows, complete = parse_gateways(text)
    out = [{"code": r["code"], "name": r["name"],
            "transferMin": transfer_minutes(r["detail"]), "transferTo": None,
            "note": r["detail"] or None} for r in rows]
    if complete:
        return out, False
    # Partial: the first airport only, without the detail that could not be
    # separated from its sentence; the page shows the full text on demand.
    if out:
        first = {**out[0], "transferMin": None, "note": None}
    elif trip.get("gatewayAirportCode"):
        first = {"code": trip["gatewayAirportCode"], "name": "", "transferMin": None,
                 "transferTo": None, "note": None}
    else:
        return [], True
    return [first], True


VISIT_STOP_RE = re.compile(
    r"^(the|a|an|out|into|to|down|up|back|south|north|east|west|again|across|"
    r"arriv\w*|land\w*|day|rest|free|first|last|final|two|three|one|via|over|"
    r"from|home|depart\w*|leave|transfer|loop|return\w*|easy|long|short|big|"
    r"full|half|morning|afternoon|evening|ferry|bus|train|drive|walk|ride|run|"
    r"ski|plus|then|on|by|with|towards?|onto|around|through|along|above|below|"
    r"beyond|under|in|at|of|for|optional|reserve|spare|buffer|recovery|"
    r"acclimati\w*|warm|settle|explore|exploring|discover|base|basecamp|hotel|"
    r"villa|guesthouse|hostel|camp\w*|refuge|rifugio|hut|chalet|apartment)\b",
    re.I)


def visits(trip, n=4):
    """T431: the places a trip card names ("Kaysersberg, Ribeauvillé,
    Haut-Koenigsbourg"), so a list says where the week goes instead of how
    long it is. A trip's own `visits`, then its `dayPlaces`, then the place
    names in its day titles (structured slots only, never prose)."""
    own = [str(x) for x in trip.get("visits") or [] if x]
    if own:
        return own[:n]
    out = []
    for d in trip.get("dayPlaces") or []:
        name = (d or {}).get("name")
        if name and name not in out:
            out.append(name)
    if out:
        return out[:n]
    for day in trip.get("itinerary") or []:
        for part in re.split(r"[:;,/\u2192>&+()]|\s[-\u2013]\s|\bto\b|\band\b|\bin\b|"
                             r"\bat\b|\bvia\b|\bover\b|\bfrom\b|\bthen\b|\bby\b|\bon\b",
                             str(day.get("title") or "")):
            part = re.sub(r"'s\b", "", part).strip(" ,.")
            part = re.sub(r"^(the|a)\s+", "", part, flags=re.I)
            words = part.split()
            if (part and 1 <= len(words) <= 3 and part[0].isupper()
                    and not VISIT_STOP_RE.search(part)
                    and not PLACE_JUNK_RE.search(part)
                    and part not in COUNTRY_NAMES
                    and not any(ch.isdigit() for ch in part)
                    and part not in out):
                out.append(part)
    return out[:n]


def card_photos(trip, hero, n=4):
    """T431: up to four photographs a trip card swipes through: the hero,
    then the trip's own `photos[]` (each a credited Commons file)."""
    out = []
    for img in [hero] + list(trip.get("photos") or []):
        url = (img or {}).get("url")
        if url and url not in out:
            out.append(url)
    return out[:n]


def to_card(trip, hero):
    budget = trip.get("budget") or {}
    total = budget.get("totalEur") or {}
    per_day = budget.get("perDayEur") or {}
    profile = trip.get("profile") or {}
    coords = trip.get("coordinates") or {}
    best = trip.get("bestPeriod") or {}
    return {
        "id": trip["id"],
        "title": trip.get("title") or trip["id"],
        "cc": trip.get("countryCode"),
        "country": trip.get("country"),
        "countries": [c.get("code") for c in trip.get("countries") or []],
        "sub": trip.get("subRegion"),
        "days": trip.get("durationDays") or 7,
        "tier": trip.get("budgetTier"),
        "eur": {"low": total.get("low"), "high": total.get("high")},
        "pd": {"low": per_day.get("low"), "high": per_day.get("high")},
        "diff": profile.get("difficulty"),
        "diffLabel": profile.get("difficultyLabel"),
        "months": best.get("months") or [],
        "summary": trip.get("summary"),
        "lat": coords.get("lat"), "lon": coords.get("lon"),
        "prec": coords.get("precision"),
        "gw": trip.get("gatewayAirportCode"),
        # T089: the first six tags, the same six the trip page shows, so the
        # list can filter on them without opening each trip.
        "tags": [str(x) for x in (trip.get("tags") or [])][:6],
        "beds": bed_kinds(trip),
        "hero": hero,
        "visits": visits(trip),
        **({"photos": card_photos(trip, hero)} if trip.get("photos") else {}),
        **({"sample": True} if trip.get("sample") else {}),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None,
                    help="write the wire here instead of continent-app/public/journeys")
    ap.add_argument("--no-fetch", action="store_true",
                    help="cache only; never touch the network")
    ap.add_argument("--cache", default=None,
                    help="read and write this image cache instead of "
                         "cache/journey_images.json (a scratch copy for a trial build)")
    ap.add_argument("--src", default=None,
                    help="read this master-shaped JSON instead of trips.master.json "
                         "(a scratch set of candidate trips; pair it with --out)")
    args = ap.parse_args()
    global OUT
    if args.out:
        OUT = Path(args.out)
    global CACHE_PATH
    if args.cache:
        CACHE_PATH = Path(args.cache)
    src = Path(args.src) if args.src else SRC

    master = json.loads(src.read_text(encoding="utf-8"))
    trips = [clean_text(t) for t in master["trips"]]
    print(f"{len(trips)} trips in, schema {master.get('schemaVersion')}")

    cache = load_cache()
    allow = not args.no_fetch
    for t in trips:
        COUNTRY_NAMES.update([t.get("country")] + [c.get("name") for c in t.get("countries") or []])
    COUNTRY_NAMES.discard(None)

    # One flat list of every place any trip names, fetched in batches.
    per_trip = {t["id"]: place_candidates(t) for t in trips}
    all_titles = []
    for names in per_trip.values():
        for n in names:
            if n not in all_titles:
                all_titles.append(n)
    for names in TYPE_HERO_CANDIDATES.values():
        for n in names:
            if n not in all_titles:
                all_titles.append(n)
    print(f"{len(all_titles)} candidate places to look up "
          f"({sum(1 for t in all_titles if t not in cache)} not yet cached)")
    images = fetch_lead_images(all_titles, cache, allow)
    if allow:  # --no-fetch learns nothing, so it never rewrites the cache
        save_cache(cache)

    heroes = {tid: pick_hero(names, images) for tid, names in per_trip.items()}
    for t in trips:
        if not heroes.get(t["id"]):
            heroes[t["id"]] = search_hero(t, cache, allow)
    if allow:  # --no-fetch learns nothing, so it never rewrites the cache
        save_cache(cache)
    # The audit's replacements win over pick_hero: it saw the categories and
    # the pixel size, and pick_hero only ever saw the file name.
    sample_heroes, sample_type_heroes = load_samples_lock()
    overrides = {**load_hero_overrides(), **JOURNEY_HERO_PINS, **sample_heroes}
    n_over = 0
    for tid, hero in overrides.items():
        if tid in heroes:
            heroes[tid] = hero
            n_over += 1
    if n_over:
        print(f"{n_over} hero(es) replaced from the audit patch")
    n_before = len(heroes) - len({photo_key(h) for h in heroes.values() if h})
    # J2: one photograph, one trip. The second-tier places (day titles and
    # sleep towns) are looked up only for the trips that need another photo.
    held = {}
    for tid, h in heroes.items():
        if h:
            held.setdefault(photo_key(h), []).append(tid)
    need = {tid for tids in held.values() if len(tids) > 1 for tid in tids}
    need |= {tid for tid, h in heroes.items() if not h}
    extra = []
    for t in trips:
        if t["id"] in need:
            for n in itinerary_place_candidates(t):
                if n not in all_titles and n not in extra:
                    extra.append(n)
    if extra:
        images.update(fetch_lead_images(extra, cache, allow))
        if allow:
            save_cache(cache)
    unresolved = make_heroes_unique(trips, heroes, per_trip, images,
                                    pinned=set(overrides))
    n_dup_after = (len([h for h in heroes.values() if h])
                   - len({photo_key(h) for h in heroes.values() if h}))
    print(f"{n_before} duplicate hero(es) before the J2 pass, "
          f"{n_dup_after} after, {len(unresolved)} trip(s) unresolved")
    if unresolved:
        print("  ! no unique hero for: " + ", ".join(unresolved) + "\n"
              "    add a place to MANUAL_PLACES (or an audit-patch hero) for each, "
              "then rebuild; the wire was not written.", file=sys.stderr)
        sys.exit(1)
    n_img = sum(1 for h in heroes.values() if h)
    print(f"{n_img}/{len(trips)} trips have a hero photograph")

    # Style heroes: wide landscape leads only; a style card must not open on
    # a portrait crop.
    type_heroes = {}
    for slug, names in TYPE_HERO_CANDIDATES.items():
        fixed = TYPE_HERO_FILES.get(slug) or sample_type_heroes.get(slug)
        if fixed:
            type_heroes[slug] = fixed
            continue
        pick = None
        for n in names:
            if usable(images.get(n), min_w=1000):
                pick = strip_utm(images[n])
                break
        type_heroes[slug] = pick or pick_hero(names, images)
        if not type_heroes[slug]:
            print(f"  ! no hero for style {slug}", file=sys.stderr)

    by_type = {slug: [] for slug in TYPE_ORDER}
    for t in trips:
        by_type.setdefault(t["tripTypeSlug"], []).append(t)

    (OUT / "type").mkdir(parents=True, exist_ok=True)
    (OUT / "journey").mkdir(parents=True, exist_ok=True)

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fits = load_fit()
    index_types = []
    for slug in TYPE_ORDER:
        rows = by_type.get(slug, [])
        rows.sort(key=lambda t: ((t.get("country") or ""),
                                 (t.get("title") or "")))
        cards = [to_card(t, heroes.get(t["id"])) for t in rows]
        (OUT / "type" / f"{slug}.json").write_text(
            json.dumps({"slug": slug, "trips": cards}, ensure_ascii=False),
            encoding="utf-8")
        index_types.append({
            "slug": slug,
            "id": rows[0]["tripTypeId"] if rows else None,
            "name": rows[0]["tripType"] if rows else slug,
            "n": len(rows),
            "countries": sorted({t.get("countryCode") for t in rows if t.get("countryCode")}),
            "hero": type_heroes.get(slug),
        })
        for t in rows:
            detail = dict(t)
            detail["hero"] = heroes.get(t["id"])
            bp = dict(detail.get("bestPeriod") or {})
            # A v2.1 record states its avoid months; only v2.0 prose is parsed.
            if "avoidMonths" not in bp:
                bp["avoidMonths"] = parse_avoid_months(bp.get("avoid"))
            detail["bestPeriod"] = bp
            gws, partial = gateway_rows(detail)
            if gws or partial:
                detail["gateways"] = gws
                detail["gatewaysPartial"] = partial
            # T089: snapshot is never read and adds dead weight to the JSON.
            detail.pop("snapshot", None)
            # T911: who the trip suits and who it suits less.
            if fits.get(t["id"]):
                detail["fit"] = fits[t["id"]]
            (OUT / "journey" / f"{t['id']}.json").write_text(
                json.dumps(detail, ensure_ascii=False), encoding="utf-8")

    (OUT / "index.json").write_text(json.dumps({
        "generated_at": generated,
        "model": "journeys_v1",
        "n_trips": len(trips),
        "types": index_types,
        "attribution": ["Photographs from Wikimedia Commons via Wikipedia; "
                        "each image credits and links its source page."],
    }, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(trips)} journeys, {len(index_types)} styles)")

    # T474 (row T435-b): the lead images arrive with a page and a place name
    # only; credits.py adds each photograph's author and licence, so the trip
    # page's gallery credits every photo the way every other page does.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from credits import credit_wire
    s = credit_wire(OUT, allow_fetch=allow)
    print(f"{s['credited']}/{s['photos']} photographs credited ({s['filled']} filled)")
    if s["missing"]:
        print(f"  ! {len(s['missing'])} photograph(s) without a licence; "
              "run pipeline/journeys/credits.py to see them", file=sys.stderr)


if __name__ == "__main__":
    main()
