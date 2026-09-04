"""enrich_images.py - a photograph OF the feature, or no photograph at all.

Stage 3 of the natural-features pipeline (see features_common.py for the stage
map). build_features.py attached whatever thumbnail the POI layer happened to
carry beside the feature, which is a coordinate coincidence dressed up as
evidence: 42k of the master's POI thumbnails were picked by a geosearch that
accepts any file within 60 m, so a beach can inherit the harbour, the car park
or the town skyline. This stage throws that assumption out and asks one
question per feature: is there a reason to believe this photo is of THIS
feature, and can we credit it. When the answer is no, the feature ships with no
photo, which the design system renders as a clean empty state. A wrong photo
reads as a lie and poisons trust in every other photo on the page.

The resolution ladder, first hit wins, recorded in image.binding:

  1 qid_p18      the feature's own Wikidata P18. Someone chose this file to
                 represent this entity. Verified coverage runs 62% (Portuguese
                 beaches) down to 22% (Swiss mountains), so it can never be the
                 only rung.
  2 qid_depicts  Commons structured data, haswbstatement:P180=<QID>, asked
                 three times with a narrowing filter: Featured pictures first,
                 then Quality images, then unfiltered. A human asserted the
                 file depicts this entity.
  3 commons_cat  the feature's own Commons category (P373). Category
                 membership is a curatorial statement about the file.
  4 poi_img      the thumbnail the POI layer already carries, kept only when
                 the file name still agrees with the feature name and its
                 Commons licence and credit resolve clean. That pass accepted
                 anything within 60 m, so its binding is inherited, not
                 trusted.
  5 geosearch    Commons geosearch inside a tight radius (beach 800 m,
                 mountain 1200 m) AND a distinctive token shared with the
                 feature name. Last, never first: 200 m around the Sagrada
                 Familia returns four interior shots and an altar boy.
  6 none         image stays null and provenance.image says why.

Rungs 1 to 3 only open once the QID is shown to BE the feature: an entity
whose P31 is a town, an island, a lake, a range or a protected area, or whose
P625 sits more than QID_TRUST_KM away, is the parent, and the parent's photo is
exactly what this stage exists to refuse.

A photo is refused, and the reason kept in provenance.image.reason, when:

  qid_not_the_feature  the QID resolves to the town, the island or the region
  borrowed_parent      the only candidate is a destination's own hero photo, or
                       a file named after a town within SETTLEMENT_KM and not
                       after anything that distinguishes the feature from that
                       town
  token_gate           a coordinate hit with no distinctive shared token: no
                       evidence at all that the photo is of this feature
  licence_missing      Commons has no licence metadata for the file
  licence_blocked      NC, ND or permission-only
  credit_missing       nobody to credit, or a licence with no deed URL to link
                       from the credit line (this is the ledger's open item 1).
                       Public domain is exempt from the URL half: it is a
                       status, not a licence, and has no deed
  wrong_subject        the file names a structure or a vehicle the feature is
                       not: the station, the lighthouse or the shrine standing
                       next to it, or the train passing it
  junk_shape           map, plan, coat of arms, flag, plaque, diagram, or a
                       non-photo mime type
  aspect_unusable      a 7:1 Wikivoyage banner or a tower-shaped panorama
  too_small            below MIN_SIDE px, a thumbnail of a thumbnail
  no_candidate         every rung came back empty

Freedom of panorama does not apply here: a beach and a summit are not
copyrighted works, so no FoP check gates this stage. Whoever extends the ladder
to buildings and public artwork must add one, because Commons hosting a file is
not a licence for Carta to publish it commercially in FR, GR, IS, IT, LU, MC,
RO, SI (no FoP for buildings), BE and DK (buildings only) or EE, LV, LT
(restricted).

Reads   data/derived/features_raw.json   the features
        cache/poi_image_licenses.json    TASL already resolved for POI images
        cache/poi_wikidata.json          which QIDs the significance pass
                                         already knows are towns or stations
        cache/geonames_cities500.txt     every European settlement, so a photo
                                         named after the town can be caught
        continent-app/public/app_data.json  the destination hero photos, so a
                                         beach can be caught inheriting one
Writes  data/derived/features_raw.json   image{} filled or nulled in place
        cache/features_images.json       every lookup, keyed by feature id.
                                         It is deliberately fat, around 5 KB
                                         per feature and so roughly 100 MB at
                                         full catalogue scale, because holding
                                         every candidate is what buys the
                                         offline --redecide. Deleting it costs
                                         a re-harvest, nothing else.

Idempotent and resumable: the decision ledger is keyed by feature id, so a
rerun re-applies it without a single request, and a killed run resumes at the
feature it died on (the cache checkpoints every CHECKPOINT_EVERY features).
Every lookup is remembered beside the decision, the candidate lists per feature
and the file metadata per Commons file, so --redecide can re-run the gates over
the whole ledger offline: a gate is only worth tightening if the tightening can
be tried without asking Wikimedia the same question twice.
Applying only touches features this stage has decided about; a feature outside
the scope keeps whatever build_features gave it, and rank_features still gates
that on its licence.

Politeness: serial requests, DELAY_S between them, a descriptive User-Agent
with a contact address, per https://www.mediawiki.org/wiki/API:Etiquette.

Usage:
    python pipeline/features/enrich_images.py --limit 200
    python pipeline/features/enrich_images.py --kind beach --country ES
    python pipeline/features/enrich_images.py --refresh --country MT
    python pipeline/features/enrich_images.py --redecide    # no network
    python pipeline/features/enrich_images.py --report      # no network
"""
import argparse
import difflib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

from features_common import (APP_DATA, CACHE, GENERIC_TOKENS, GeoIndex,
                             IMAGE_FEATURE_CACHE, POI_LICENSES, RAW_FEATURES,
                             catalogue_countries, fold, haversine_km, load_json,
                             log, save_json)
from build_features import commons_filename, romanise
# The read-side licence gate is imported, not copied: a photo this stage
# accepts and rank_features later drops is the worst of both worlds, so the two
# stages must agree byte for byte on what "shippable" means.
from rank_features import licence_ok

POI_WIKIDATA = CACHE / "poi_wikidata.json"
# Every European settlement of 500 people or more, already on disk for the
# place-candidates build. Carta prices 1,570 towns, so the catalogue alone can
# not tell us that "Capljina" is a town: without the gazetteer, a promenade
# called "Capljina, Riva" happily keeps a photo named "Capljina panorama.jpg".
GEONAMES = CACHE / "geonames_cities500.txt"
SETTLEMENT_KM = 4.0
SETTLEMENT_FCODES = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5",
                     "PPLC", "PPLG", "PPLL", "PPLS", "PPLX"}

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_SOURCE = {"name": "Wikimedia Commons",
                  "url": "https://commons.wikimedia.org/"}

UA = {"User-Agent": "CartaTravelApp-features/1.0 (portfolio project; "
                    "contact: data@carta-europetravel.com)"}
DELAY_S = 0.3
TIMEOUT_S = 60
RETRIES = 4
BATCH = 50               # titles or QIDs per request, the API's own limit
CHECKPOINT_EVERY = 25

THUMB_PX = 640           # the card, hotlinkable
HERO_PX = 1280           # the sheet
MIN_SIDE = 320           # below this a "photo" is a thumbnail of a thumbnail

# Geosearch radii. A beach photo taken 800 m away is a photo of the next cove;
# a summit is visible from further off and its own coordinate is the peak, not
# the viewpoint, so mountains get more room. Both sit far inside the API's
# 10 km ceiling.
GEO_RADIUS_M = {"beach": 800, "mountain": 1200}

# How far the Wikidata entity may sit from the feature before the QID is
# somebody else. A long strand is digitised at its centroid and a summit POI
# can be a couple of hundred metres off the true peak; 3 km covers both and
# still catches the island, the town and the valley below.
QID_TRUST_KM = 3.0

# P31 classes that mean "this entity is the container, not the feature". Each
# one has been seen lending its photo to a POI: the island for a cove, the lake
# for a lido, the national park for a summit inside it.
BLOCKED_CLASSES = {
    "Q486972": "human settlement", "Q515": "city", "Q3957": "town",
    "Q532": "village", "Q15284": "municipality", "Q3266850": "resort town",
    "Q56061": "administrative territorial entity",
    "Q10864048": "first-level administrative country subdivision",
    "Q6256": "country", "Q82794": "geographic region", "Q23442": "island",
    "Q33837": "archipelago", "Q23397": "lake", "Q4022": "river",
    "Q165": "sea", "Q9430": "ocean", "Q39816": "valley",
    "Q46831": "mountain range", "Q473972": "protected area",
    "Q46169": "national park", "Q1174791": "nature reserve",
}
# Classes that ARE the feature. A Wikidata entity can be both (a beach on an
# island carries both statements), so an allowed class outvotes a blocked one.
ALLOWED_CLASSES = {
    "beach": {"Q40080",      # beach
              "Q272626",     # cape (a headland beach)
              "Q1210950",    # coast
              "Q13233858"},  # bathing place
    "mountain": {"Q8502",    # mountain
                 "Q54050",   # hill
                 "Q207326",  # mountain pass, the named viewpoint kind
                 "Q1210950",
                 "Q8072",    # volcano
                 "Q35509",   # cave, common for a summit-adjacent POI
                 "Q3777462"},  # summit
}

# Commons peer review, the only signal in this chain that is humans judging
# photographs. Featured is a hard Commons-wide aesthetic review; Quality is a
# technical one. Coverage is thin on the long tail, so it ranks, never gates.
ASSESS_SCORE = {"featured": 100, "poty": 90, "potd": 60, "quality": 40,
                "valued": 25}

# Card shape. Inside [TARGET_LO, TARGET_HI] the crop is free; outside the hard
# bounds the file is refused, which is how the 7:1 Wikivoyage banner dies.
ASPECT_HARD_LO, ASPECT_TARGET_LO = 0.45, 0.75
ASPECT_TARGET_HI, ASPECT_HARD_HI = 2.0, 3.0

# The union of the two junk regexes the POI passes already run, kept in one
# place. Matched against the file name, which is where map, flag and plaque
# scans announce themselves.
JUNK = re.compile(
    r"map\b|mapa|karte|kaart|plan\b|planta|logo|coat[_ ]of[_ ]arms|wappen|"
    r"escudo|blason|blazon|stemma|plaque|plakette|tafel|schild|sign\b|"
    r"diagram|schema|document|scan\b|urkunde|locator|positionskarte|"
    r"bandera|bandiera|flagge|drapeau|\bflag\b|seal\b|siegel|gonfalone|"
    r"coin\b|banknote|stamp\b|briefmarke|grave|tomb|gedenkstein|"
    r"\.svg$|\.tif+$|\.pdf$|\.gif$|\.ogg$|\.webm$|\.xcf$", re.I)
GOOD_MIME = ("image/jpeg", "image/png", "image/webp")

# Licence texts that are a public-domain STATUS rather than a licence, and so
# have no deed URL to link from the credit line.
PD_LICENCE_RE = re.compile(r"public domain|gemeinfrei|dominio p|domaine public"
                           r"|pd[- ]|cc0", re.I)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
# Greek and Cyrillic stay word characters, as in build_features: fold() de-
# accents them but never transliterates, so a Greek beach keeps its name and
# can still match a Greek file name. Written as escapes to keep the source
# ASCII-clean, per project style.
_TOKEN_RE = re.compile("[^0-9a-z\u0370-\u03ff\u0400-\u04ff]+")

# Words that can not carry a match on their own. features_common.GENERIC_TOKENS
# already holds the beach and summit vocabulary in 20 languages; these are the
# landscape and compass words it does not, and they matter because "Sunset
# Beach" and "Playa Norte" must not bind a photo on "sunset" or "norte". The
# set is applied to the FEATURE and TOWN names, never to the file name: a
# generic word can not be a matching token if it never enters the token set.
IMAGE_GENERIC = {
    "view", "vista", "vue", "aussicht", "panorama", "panoramica", "sunset",
    "sunrise", "beach", "strand", "playa", "praia", "plage", "spiaggia",
    "coast", "costa", "cote", "kust", "seaside", "sea", "mar", "mare",
    "meer", "mer", "island", "isla", "isola", "ile", "insel", "otok", "nisi",
    "mount", "mountain", "montagne", "montagna", "montana", "berg", "gipfel",
    "summit", "peak", "hill", "colline", "collina", "nature", "natur",
    "natura", "park", "parc", "parque", "national", "nacional", "nazionale",
    "reserve", "riserva", "reserva", "north", "south", "east", "west",
    "nord", "sud", "est", "ouest", "sued", "ost", "norte", "sur",
}
# A country or a home nation can not be the identity of a beach, and letting
# one act as one is how "Achmelvich Bay, Scotland" bound itself to a photo of
# the BBC Scotland offices. The catalogue country name is already stripped per
# feature; these are the endonyms and the home nations it does not cover.
COUNTRY_WORDS = {
    "scotland", "wales", "england", "britain", "ireland", "eire", "europe",
    "espana", "italia", "deutschland", "osterreich", "sverige", "norge",
    "suomi", "danmark", "polska", "hrvatska", "magyarorszag", "romania",
    "portugal", "france", "malta", "cyprus", "kypros", "kibris", "hellas",
    "ellada", "nederland", "belgie", "belgique", "schweiz", "suisse",
    "svizzera", "luxembourg", "letzebuerg", "eesti", "latvija", "lietuva",
    "slovensko", "slovenija", "cesko", "ceska", "bulgaria", "balgariya",
    "srbija", "makedonija", "shqiperia", "kosova", "andorra", "monaco",
    "liechtenstein", "montenegro", "albania", "greece", "spain", "italy",
    "germany", "austria", "sweden", "norway", "finland", "denmark", "poland",
    "croatia", "hungary", "netherlands", "belgium", "switzerland", "iceland",
    "estonia", "latvia", "lithuania", "slovakia", "slovenia", "czechia",
    "serbia", "bosnia", "hercegovina", "macedonia", "moldova", "kosovo",
}
IMAGE_GENERIC |= COUNTRY_WORDS
MIN_TOKEN_LEN = 5        # "aletsch" yes, "cala" no
SHORT_CORE_LEN = 3       # "Vai" and "Etna" are whole names, not fragments
PREFIX_MIN = 5           # "aletsch" may match "aletschgletscher"
FUZZY_MIN_LEN = 7        # "gediminas" may match "gedimino"
FUZZY_RATIO = 0.8

# Words that say the file is a photo of a STRUCTURE or a VEHICLE. A beach and
# a summit are neither, so a candidate whose name says station, lighthouse or
# shrine is a photo of something else standing nearby: the first 90 features of
# the pilot run produced a railway station for "Au bord du lac a Burier", a
# lighthouse for "Arryheerna Beach" and a shrine for "Abbot's Cliff Beach".
# Matched as whole tokens, so Kirchberg is not a church and Bar is not a bar,
# and only when the feature's own name does not use the same word.
BUILT_WORDS = {
    "station", "bahnhof", "gare", "stazione", "estacion", "stacja", "stacija",
    "stanica", "kolodvor", "asema", "stasjon", "railway", "airport",
    "aeroport", "flughafen", "aeroporto", "terminal", "hotel", "hostel",
    "restaurant", "museum", "museo", "musee", "muzeum", "church", "kirche",
    "chiesa", "iglesia", "eglise", "kerk", "kostel", "cathedral", "catedral",
    "cattedrale", "chapel", "kapelle", "chapelle", "monastery", "kloster",
    "monastero", "castle", "castillo", "castello", "chateau", "schloss",
    "zamek", "palace", "palacio", "palazzo", "palais", "rathaus", "hospital",
    "stadium", "stadion", "factory", "fabrik", "tunnel", "parking", "gate",
    "school", "schule", "scuola", "escuela", "ecole", "mokykla", "skola",
    "szkola", "kool", "casino", "kasino", "street", "strasse", "straat",
    "utca", "ulica", "calle", "avenue", "avenida", "boulevard", "apartment",
    "apartments", "apartamenty", "battery", "batterie", "fort", "fortress",
    "festung", "burgruine", "ruine", "ruins", "samostan", "manastir",
    "building", "budynek", "gebaude", "barracks", "kaserne",
    "supermarket", "shopping", "bridge", "brucke", "pont", "most", "puente",
    "ponte", "brug", "viaduct", "viadukt", "lighthouse", "leuchtturm",
    "vuurtoren", "phare", "watertoren", "wasserturm", "vodojem", "tower",
    "toren", "turm", "torre", "tornis", "wieza", "belfry", "belfort",
    "beffroi", "billboard", "shaft", "shrine", "memorial", "monument",
    "statue", "cemetery", "friedhof", "train", "vilciens", "vlak",
    "locomotive", "lokomotive", "tram", "autobus",
}
# German, Dutch and the Slavic languages glue the structure onto the name, so
# "Schlossalbrechtsberg.jpg" is one token and whole-token matching never sees
# the castle in it. These, and only these, are therefore matched as prefixes.
# The Romance words are deliberately absent: those languages do not compound,
# and "castello" as a prefix would refuse every photo of Castellon.
BUILT_PREFIXES = ("schloss", "bahnhof", "kirche", "kloster", "rathaus",
                  "friedhof", "stadion", "station", "leuchtturm", "wasserturm",
                  "watertoren", "vuurtoren", "vodojem", "kostel")

# The words that say a file is a photo OF this kind of place. They are the one
# thing that can rescue a candidate named after the town: a feature whose whole
# name IS the town name ("Capljina, Riva") has no token of its own, so
# "Capljina panorama.jpg" and "Capljina beach.jpg" are only distinguishable
# here. Subset of features_common.GENERIC_TOKENS, split by kind, which is why
# it is not simply imported.
KIND_WORDS = {
    "beach": {"beach", "beaches", "playa", "playas", "praia", "praias",
              "plage", "plages", "spiaggia", "spiagge", "strand", "strandje",
              "strandbad", "paralia", "plaja", "plaj", "plazha", "ranta",
              "traeth", "cala", "calas", "cove", "bay", "baia", "bahia",
              "baie", "bucht", "zatoka", "uvala", "lido", "dunes", "duinen"},
    "mountain": {"mount", "mountain", "montagne", "montagna", "montana",
                 "monte", "mont", "monti", "berg", "bjerg", "fjell", "pico",
                 "pic", "puig", "peak", "summit", "spitze", "gipfel", "vrh",
                 "vrch", "vrf", "cima", "cim", "punta", "horn", "kogel",
                 "szczyt", "vrchol", "tind", "topp", "alpe", "col", "pass"},
}

# The order the report prints, and the order resolve() walks.
RUNGS = ("qid_p18", "qid_depicts", "commons_cat", "poi_img", "geosearch")

# Which refusal a human most needs to see when several candidates failed for
# several reasons. A licence problem is actionable; "no candidate" is not.
REASON_PRIORITY = ("licence_blocked", "credit_missing", "licence_missing",
                   "borrowed_parent", "wrong_subject", "qid_not_the_feature",
                   "junk_shape", "aspect_unusable", "too_small", "token_gate",
                   "no_candidate")

_calls = Counter()
# --redecide re-runs the gates over what the cache already holds. Nothing may
# leave the machine in that mode, so the switch sits on the one function that
# talks to the network rather than on each of its five callers.
OFFLINE = False


# --------------------------------------------------------------------------- #
# http
# --------------------------------------------------------------------------- #
def api_get(base, params):
    """One serial request with backoff. Serial on purpose: API:Etiquette asks
    for it, and the batching below already does the work six threads would."""
    if OFFLINE:
        _calls["skipped_offline"] += 1
        return None
    url = base + "?" + urllib.parse.urlencode(params)
    for attempt in range(RETRIES):
        time.sleep(DELAY_S if attempt == 0 else DELAY_S + 2 ** attempt)
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                _calls[base] += 1
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            _calls["http_error"] += 1
            if e.code in (400, 404):
                return None
            retry_after = e.headers.get("Retry-After")
            if retry_after:
                try:
                    time.sleep(min(float(retry_after), 90))
                except ValueError:
                    pass
        except Exception:
            _calls["net_error"] += 1
    return None


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


# --------------------------------------------------------------------------- #
# text
# --------------------------------------------------------------------------- #
def clean(s):
    """extmetadata arrives as HTML (Artist is an <a> tag); the wire prints
    plain text."""
    return _WS_RE.sub(" ", _TAG_RE.sub("", s or "")).strip()


def tokens_of(s):
    """Folded tokens, with Greek and Cyrillic written in Latin. Both sides of
    every comparison come through here, which is the only way a feature the
    catalogue records in Cyrillic can match a Commons file named in Latin."""
    return [t for t in _TOKEN_RE.split(romanise(s)) if t]


def distinctive(name):
    """The tokens a match may hinge on. Generic words are stripped, so a file
    called "Playa del Ingles" can not match "Playa de Amadores" on "playa". A
    name whose whole identity is one short word (Vai, Etna) keeps that word:
    refusing it would mean refusing the feature. Digits never qualify: the
    build leaves a handful of summits named for their elevation ("307"), and
    "307" appears in enough file names to bind a peak to a zoo."""
    toks = [t for t in tokens_of(name)
            if t not in GENERIC_TOKENS and t not in IMAGE_GENERIC
            and not t.isdigit()]
    strong = {t for t in toks if len(t) >= MIN_TOKEN_LEN}
    if strong:
        return strong
    # "Eden Plage Mala" has no long word at all, and leaving it with no tokens
    # would make the feature nameless to every rung below the QID.
    medium = {t for t in toks if len(t) >= MIN_TOKEN_LEN - 1}
    if medium:
        return medium
    return {t for t in toks if len(t) >= SHORT_CORE_LEN} if len(toks) == 1 \
        else set()


def kind_word(filename, kind):
    """Does the file name say it is a photo of this kind of place."""
    words = KIND_WORDS.get(kind, set())
    return any(t in words for t in tokens_of(filename))


def built_words_in(tokens):
    """Which structure words these tokens name, compounds included."""
    out = set()
    for t in tokens:
        # Commons uploaders number their files without a separator, so
        # "Samostan02612.jpg" has to be read as the monastery it is.
        bare = t.rstrip("0123456789")
        if t in BUILT_WORDS or bare in BUILT_WORDS:
            out.add(t if t in BUILT_WORDS else bare)
            continue
        for w in BUILT_PREFIXES:
            if t.startswith(w):
                out.add(w)
                break
    return out


def wrong_subject(filename, feature_tokens):
    """Does the file name say it is a photo of a structure the feature is not.
    A summit called Schlossberg keeps its castle word; a beach that borrowed
    the station next door does not."""
    return bool(built_words_in(tokens_of(filename))
                - built_words_in(feature_tokens))


def token_hit(name_tokens, filename):
    """Does the file name carry one of the feature's distinctive tokens.

    Three arms, each earning its keep on the pilot run. Exact. Prefix, for the
    agglutinating languages ("Aletschgletscher" for "Aletsch"), with a floor so
    "san" can not claim "santorini". And near-identical, long tokens only,
    because Commons and the catalogue disagree about spelling far more often
    than they disagree about places: "Gedimino kalnas" is Gediminas Hill and
    "Aberdaeron" is Aberdaron, while two unrelated names of seven letters or
    more do not land this close by accident."""
    if not name_tokens:
        return 0
    hits = 0
    for ft in tokens_of(filename):
        # A generic word in the file name may not carry the match either, or
        # the prefix arm hands "Beach of Vrouwenpolder.jpg" to a feature called
        # "Beachhouse Six Fiftyfive" on the strength of the word beach.
        if ft in GENERIC_TOKENS or ft in IMAGE_GENERIC:
            continue
        for nt in name_tokens:
            if ft == nt:
                hits += 1
                break
            if min(len(ft), len(nt)) >= PREFIX_MIN \
                    and (ft.startswith(nt) or nt.startswith(ft)):
                hits += 1
                break
            if min(len(ft), len(nt)) >= FUZZY_MIN_LEN \
                    and difflib.SequenceMatcher(None, ft, nt).ratio() \
                    >= FUZZY_RATIO:
                hits += 1
                break
    return hits


# --------------------------------------------------------------------------- #
# wikidata
# --------------------------------------------------------------------------- #
def _claim_values(claims, prop):
    out = []
    for c in claims.get(prop) or []:
        val = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
        if val is not None:
            out.append(val)
    return out


def wikidata_records(qids, memo, refresh=False):
    """QID -> {p18, p373, p31, lat, lon, label}. Batched 50 per request, which
    is the API's cap, and memoised so a rerun asks for nothing."""
    todo = sorted({q for q in qids if q and (refresh or q not in memo)})
    for chunk in chunks(todo, BATCH):
        data = api_get(WIKIDATA_API, {
            "action": "wbgetentities", "format": "json",
            "ids": "|".join(chunk), "props": "claims|labels",
            "languages": "en|de|fr|es|it|pt|el|nl|pl|hr|no|sv|da|fi|cs",
        })
        entities = ((data or {}).get("entities")) or {}
        for qid in chunk:
            ent = entities.get(qid) or {}
            if not ent or "missing" in ent:
                memo[qid] = {"missing": True}
                continue
            claims = ent.get("claims") or {}
            coord = next(iter(_claim_values(claims, "P625")), None)
            labels = ent.get("labels") or {}
            memo[qid] = {
                "p18": next(iter(_claim_values(claims, "P18")), None),
                "p373": next(iter(_claim_values(claims, "P373")), None),
                "p31": [v.get("id") for v in _claim_values(claims, "P31")
                        if isinstance(v, dict) and v.get("id")],
                "lat": (coord or {}).get("latitude"),
                "lon": (coord or {}).get("longitude"),
                "label": next((v.get("value") for v in labels.values()), None),
            }
    return memo


def qid_trust(f, rec, admin_flag):
    """None when the QID is the feature itself, otherwise the refusal reason.

    This is the guard the brief's core rule needs: rung 1 will happily hand
    back the town's skyline if the POI's wiki link resolved to the town, and
    it did that often enough that rank_features already strips such articles
    (gate_article). Cheaper to catch it here, before the photo is chosen."""
    if not rec or rec.get("missing"):
        return "qid_not_the_feature"
    classes = set(rec.get("p31") or [])
    allowed = classes & ALLOWED_CLASSES.get(f["kind"], set())
    lat, lon = rec.get("lat"), rec.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        if haversine_km(f["lat"], f["lon"], lat, lon) > QID_TRUST_KM:
            return "qid_not_the_feature"
    if allowed:
        return None
    if classes & set(BLOCKED_CLASSES):
        return "qid_not_the_feature"
    if admin_flag:
        return "qid_not_the_feature"
    return None


# --------------------------------------------------------------------------- #
# commons
# --------------------------------------------------------------------------- #
II_PARAMS = {
    "prop": "imageinfo",
    "iiprop": "extmetadata|url|size|mime",
    "iiurlwidth": str(THUMB_PX),
    # One call returns candidates, licence, author, peer review, dimensions and
    # a sized thumbnail. The repo's two older passes fetch this twice.
    "iiextmetadatafilter": ("LicenseShortName|LicenseUrl|Artist|Credit|"
                            "Assessments|Restrictions|DateTimeOriginal"),
}


def _title_name(title):
    return title[5:] if title.startswith("File:") else title


def parse_page(page):
    """One Commons File: page -> the record every gate and the scorer read."""
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata") or {}

    def val(key):
        return clean((meta.get(key) or {}).get("value"))

    date = val("DateTimeOriginal")
    year = None
    m = re.search(r"(1[89]\d{2}|20\d{2})", date)
    if m:
        year = int(m.group(1))
    return {
        "file": _title_name(page.get("title") or ""),
        "width": info.get("width"), "height": info.get("height"),
        "mime": info.get("mime"),
        # The API decorates thumburl with utm analytics parameters; the wire
        # prints the bare URL.
        "thumb": (info.get("thumburl") or "").split("?")[0] or None,
        "licence": val("LicenseShortName") or None,
        "licence_url": val("LicenseUrl") or None,
        "author": val("Artist")[:200] or None,
        "credit": val("Credit")[:200] or None,
        "restrictions": val("Restrictions") or None,
        "assess": [a for a in re.split(r"[|,]", val("Assessments")) if a],
        "year": year,
    }


def _pages_of(data):
    return list(((data or {}).get("query") or {}).get("pages", {}).values())


def file_records(names, memo, refresh=False):
    """File name -> record, batched 50 titles per request and memoised across
    features: two beaches 400 m apart often carry the same photo."""
    todo = sorted({n for n in names if n and (refresh or n not in memo)})
    for chunk in chunks(todo, BATCH):
        data = api_get(COMMONS_API, dict(
            II_PARAMS, action="query", format="json",
            titles="|".join("File:" + n for n in chunk)))
        query = (data or {}).get("query") or {}
        # MediaWiki normalises titles (underscores, first-letter case), so the
        # answer has to be mapped back to the name we asked with.
        back = {r["to"]: r["from"] for r in query.get("normalized") or []}
        for page in (query.get("pages") or {}).values():
            title = page.get("title") or ""
            asked = _title_name(back.get(title, title))
            if "missing" in page or not page.get("imageinfo"):
                memo[asked] = {"missing": True}
            else:
                rec = parse_page(page)
                rec["file"] = _title_name(title)
                memo[asked] = rec
        for name in chunk:
            memo.setdefault(name, {"missing": True})
    return memo


def generator_query(extra, ctx, key):
    """Any generator plus imageinfo in one response, which is what makes the
    ladder affordable.

    The answer is remembered twice: the file names under this feature's query
    key, and the full record per file in the shared file memo. That is what
    makes --redecide possible, and a gate is only worth tightening if the
    tightening can be tried without asking Wikimedia the same question again."""
    hits = ctx["queries"].get(key)
    if hits is None:
        data = api_get(COMMONS_API, dict(II_PARAMS, action="query",
                                         format="json", **extra))
        hits = []
        for page in _pages_of(data):
            if page.get("imageinfo"):
                rec = parse_page(page)
                ctx["files"][rec["file"]] = rec
                hits.append(rec["file"])
        ctx["queries"][key] = hits
    return [ctx["files"][name] for name in hits if name in ctx["files"]]


def depicts_files(qid, ctx, key, filt=None, limit=10):
    """Files carrying a depicts (P180) statement for this QID, optionally only
    the peer-reviewed ones. incategory does NOT recurse, so the two flat
    Commons categories are named exactly."""
    srsearch = f"haswbstatement:P180={qid}"
    if filt:
        srsearch += f" incategory:{filt}"
    return generator_query({"generator": "search", "gsrsearch": srsearch,
                            "gsrnamespace": "6", "gsrlimit": str(limit)},
                           ctx, key)


def category_files(category, ctx, key, limit=50):
    title = category if category.lower().startswith("category:") \
        else "Category:" + category
    return generator_query({"generator": "categorymembers", "gcmtitle": title,
                            "gcmnamespace": "6", "gcmtype": "file",
                            "gcmlimit": str(limit)}, ctx, key)


def geosearch_files(lat, lon, radius_m, ctx, key, limit=20):
    """generator=geosearch drops the per-hit dist field that list=geosearch
    returns, and that is fine: the radius already enforces "near", and the
    Sagrada Familia test says the nearest photo is not the best photo. Paying
    a second request for a tie-break we would overrule is not worth it."""
    return generator_query({"generator": "geosearch",
                            "ggscoord": f"{lat}|{lon}",
                            "ggsradius": str(radius_m), "ggsnamespace": "6",
                            "ggslimit": str(limit)}, ctx, key)


# --------------------------------------------------------------------------- #
# gates
# --------------------------------------------------------------------------- #
def aspect_fit(width, height):
    """1.0 for a shape a card can crop, tapering to 0 at the hard bounds."""
    if not width or not height:
        return 0.0
    ratio = width / height
    if ASPECT_TARGET_LO <= ratio <= ASPECT_TARGET_HI:
        return 1.0
    if ratio < ASPECT_TARGET_LO:
        return max(0.0, (ratio - ASPECT_HARD_LO)
                   / (ASPECT_TARGET_LO - ASPECT_HARD_LO))
    return max(0.0, (ASPECT_HARD_HI - ratio)
               / (ASPECT_HARD_HI - ASPECT_TARGET_HI))


def borrowed(filename, ident):
    """Is this the parent's photo rather than the feature's.

    Two ways it can be. The file is literally a destination's hero image, which
    is the town skyline by construction. Or it is named after the town and not
    after anything that distinguishes the feature from the town, and does not
    even say it is a beach or a summit: "Capljina panorama (4).jpg" on a
    riverside beach called "Capljina, Riva"."""
    if filename in ident["hero"]:
        return True
    if not token_hit(ident["parent"], filename):
        return False
    if token_hit(ident["own"], filename):
        return False
    return not kind_word(filename, ident["kind"])


def gate_file(rec, ident, name_check=True):
    """The refusal reason for this file, or None when it may be shipped.

    name_check is off for the entity's own P18: qid_trust has already
    established that the entity IS the feature, and an editor picked that file
    to represent it, so a file name that happens to read like the valley is
    still the answer to "which photo represents this pass"."""
    if not rec or rec.get("missing"):
        return "no_candidate"
    name = rec.get("file") or ""
    if JUNK.search(name) or rec.get("mime") not in GOOD_MIME:
        return "junk_shape"
    if wrong_subject(name, ident["all"]):
        return "wrong_subject"
    if name in ident["hero"] or (name_check and borrowed(name, ident)):
        return "borrowed_parent"
    width, height = rec.get("width") or 0, rec.get("height") or 0
    if min(width, height) < MIN_SIDE:
        return "too_small"
    ratio = width / height if height else 0
    if not (ASPECT_HARD_LO <= ratio <= ASPECT_HARD_HI):
        return "aspect_unusable"
    if not rec.get("licence"):
        return "licence_missing"
    if not licence_ok(rec["licence"]):
        return "licence_blocked"
    # TASL: without someone to credit there is no credit line to render, and an
    # uncreditable photo is not a photo we may publish.
    if not rec.get("author"):
        return "credit_missing"
    # The licence URL is required for a licence, because the credit line has to
    # link the terms the reuse rests on. Public domain is not a licence but a
    # status: there is no deed to link to, and "Photo: Enschiner, public
    # domain" is already a complete credit. Every single credit_missing in the
    # pilot run was a PD file with an author and no deed URL, so demanding one
    # would have been a rule about URLs rather than about credit.
    if not rec.get("licence_url") and not PD_LICENCE_RE.search(rec["licence"]):
        return "credit_missing"
    return None


def score_file(rec, is_p18=False, token_hits=0):
    """The researched formula (data/curation/research/_sources_images.md 4.2)
    minus the two terms that each cost an extra request per file: global usage
    and contest-finalist categories. Peer review dominates by design."""
    assess = max((ASSESS_SCORE.get(a.strip().lower(), 0)
                  for a in rec.get("assess") or []), default=0)
    width, height = rec.get("width") or 0, rec.get("height") or 0
    megapixels = width * height / 1e6
    score = float(assess)
    score += 30.0 if is_p18 else 0.0
    score += 10.0 * min(megapixels, 12.0) / 12.0
    score += 10.0 * aspect_fit(width, height)
    score += 5.0 if (rec.get("year") or 0) >= 2012 else 0.0
    score += 8.0 * min(token_hits, 2) / 2.0
    return score


# --------------------------------------------------------------------------- #
# the ladder
# --------------------------------------------------------------------------- #
def shipped_image(rec, binding):
    """The contract's image{} block. url is a Special:FilePath resize so the
    hero and the card come from one file name that build_features.commons_
    filename can parse straight back out of the URL."""
    quoted = urllib.parse.quote((rec["file"] or "").replace(" ", "_"))
    return {
        "url": ("https://commons.wikimedia.org/wiki/Special:FilePath/"
                f"{quoted}?width={HERO_PX}"),
        "thumb": rec.get("thumb"),
        "author": rec.get("author"),
        "licence": rec.get("licence"),
        "licence_url": rec.get("licence_url"),
        "source": "wikimedia_commons",
        "binding": binding,
        "file": rec["file"],
    }


def best_of(candidates, binding, ident, rejects, seen, require_token=True):
    """Score the survivors of the gates, return the winner.

    The token gate runs before the shape and licence gates so the recorded
    reason is the true one: a file sharing no token with the feature fails on
    evidence, and calling that a licence problem would send the next reader
    looking in the wrong place."""
    scored = []
    for rec in candidates:
        name = rec.get("file") or ""
        if name in seen:
            continue          # the three depicts passes overlap by design
        seen.add(name)
        hits = token_hit(ident["name"], name)
        if require_token and not hits:
            rejects.append({"rung": binding, "file": name,
                            "reason": "token_gate"})
            continue
        reason = gate_file(rec, ident)
        if reason:
            rejects.append({"rung": binding, "file": name, "reason": reason})
            continue
        # The entity's own P18 can reappear inside the depicts and category
        # lists, and when it does it should win them: it is the one file an
        # editor picked to represent this entity.
        scored.append((score_file(rec, is_p18=(name == ident.get("p18")),
                                  token_hits=hits), rec))
    if not scored:
        return None
    scored.sort(key=lambda t: (-t[0], t[1]["file"]))
    return scored[0][1]


def reject_sample(rejects):
    """One example per (rung, reason), capped. A run that refused 40 panoramio
    files of the same town teaches nothing by listing all 40; what the next
    reader needs is which rungs were walked and what each one caught."""
    out, seen = [], set()
    for r in rejects:
        key = (r["rung"], r["reason"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
        if len(out) >= 8:
            break
    return out


def poi_candidate(f, prev):
    """The Commons file the POI layer bound to this feature, whichever run
    finds it first.

    It has to come out of the ledger and not only out of the artifact, because
    this stage overwrites feature["image"]: once a rerun has nulled a photo
    with no licence, the artifact no longer remembers there was ever a POI
    thumbnail, and rung 4 would quietly disappear on the second pass."""
    image = f.get("image") or {}
    return (image.get("file")
            or (prev or {}).get("poi")
            or commons_filename(image.get("url"))
            or commons_filename((f.get("image_pending") or {}).get("url")))


def resolve(f, ctx, prev=None):
    """Walk the ladder for one feature. Returns the cache record. Every fetch
    goes through the memos, which prefetch() has already refilled for this run,
    so --refresh is honoured without asking twice."""
    rejects = []
    tried = []
    seen = set()
    poi_file = poi_candidate(f, prev)
    name_tokens = distinctive(f["name"])
    parent_tokens = ctx["parent_tokens"](f)
    ident = {"hero": ctx["hero_files"], "parent": parent_tokens,
             "name": name_tokens, "own": name_tokens - parent_tokens,
             "all": set(tokens_of(f["name"])), "kind": f["kind"], "p18": None}
    qid = f.get("wikidata")
    qid_reason = None

    if qid:
        wikidata_records([qid], ctx["entities"])
        rec = ctx["entities"].get(qid)
        qid_reason = qid_trust(f, rec, ctx["admin_qids"].get(qid, False))
    else:
        rec = None

    def done(image, binding):
        return {"binding": binding, "image": image, "reason": None,
                "poi": poi_file, "tried": tried,
                "rejects": reject_sample(rejects), "at": ctx["stamp"]}

    # ---- rung 1: the entity's own P18
    if qid and not qid_reason and (rec or {}).get("p18"):
        tried.append("qid_p18")
        file_records([rec["p18"]], ctx["files"])
        cand = ctx["files"].get(rec["p18"])
        ident["p18"] = (cand or {}).get("file") or rec["p18"]
        seen.add(rec["p18"])
        # Neither the token gate nor the parent-name check runs here: qid_trust
        # already established that the entity IS the feature, and an editor
        # chose this file to represent it. A pass called "Alt de Juclar" whose
        # P18 is named after the valley it opens onto is still correctly
        # illustrated by that photo.
        reason = gate_file(cand, ident, name_check=False)
        if reason:
            rejects.append({"rung": "qid_p18", "file": rec["p18"],
                            "reason": reason})
        else:
            return done(shipped_image(cand, "qid_p18"), "qid_p18")

    # ---- rung 2: files that say they depict this entity, best review first
    if qid and not qid_reason:
        tried.append("qid_depicts")
        for tag, filt in (("fp", '"Featured pictures on Wikimedia Commons"'),
                          ("qi", '"Quality images"'), ("all", None)):
            hits = depicts_files(qid, ctx, f"{f['id']}|depicts:{tag}", filt)
            if not hits:
                continue
            winner = best_of(hits, "qid_depicts", ident, rejects, seen)
            if winner:
                return done(shipped_image(winner, "qid_depicts"), "qid_depicts")

    # ---- rung 3: the feature's own Commons category
    if qid and not qid_reason and (rec or {}).get("p373"):
        tried.append("commons_cat")
        category = rec["p373"]
        # The binding here is the CATEGORY, not the file name: everything
        # inside "Category:Praia da Marinha" is that beach, including the
        # correctly filed IMG_4471.jpg. So the token gate runs once, against
        # the category name, and the files inside are judged on the shape and
        # licence gates alone.
        if token_hit(name_tokens, category):
            winner = best_of(category_files(category, ctx,
                                            f"{f['id']}|category"),
                             "commons_cat", ident, rejects, seen,
                             require_token=False)
            if winner:
                return done(shipped_image(winner, "commons_cat"), "commons_cat")
        else:
            rejects.append({"rung": "commons_cat", "file": category,
                            "reason": "token_gate"})

    # ---- rung 4: the photo the POI layer already carries
    if poi_file:
        tried.append("poi_img")
        file_records([poi_file], ctx["files"])
        cand = ctx["files"].get(poi_file)
        if cand and not cand.get("missing"):
            # Local TASL fills what extmetadata left blank: the licence sweep
            # already resolved 28k of these files.
            local = ctx["licences"].get(poi_file) or {}
            for src, dst in (("license", "licence"),
                             ("license_url", "licence_url"),
                             ("author", "author")):
                if not cand.get(dst) and local.get(src):
                    cand[dst] = local[src]
        # The POI pass accepted any file within 60 m of the POI whether or
        # not the name agreed, and the pilot run showed what that buys: three
        # separate summits of the Aiguille Blanche de Peuterey illustrated by
        # "Trelatete.jpg", a different mountain, and "Adamova hora" by a photo
        # of the village square. Inherited evidence is still evidence that has
        # to hold, so rung 4 asks the same question of the name as rung 5.
        if not token_hit(ident["name"], poi_file):
            reason = "token_gate"
        else:
            reason = gate_file(cand, ident)
        if reason:
            rejects.append({"rung": "poi_img", "file": poi_file,
                            "reason": reason})
        else:
            return done(shipped_image(cand, "poi_img"), "poi_img")

    # ---- rung 5: geosearch, token-gated, the weakest binding we accept
    tried.append("geosearch")
    if name_tokens:
        hits = geosearch_files(f["lat"], f["lon"],
                               GEO_RADIUS_M.get(f["kind"], 800),
                               ctx, f"{f['id']}|geosearch")
        winner = best_of(hits, "geosearch", ident, rejects, seen)
        if winner:
            return done(shipped_image(winner, "geosearch"), "geosearch")
    else:
        # Nothing in the name can bind a coordinate hit to this feature, so
        # rung 5 can not open at all: an unnamed cove gets no photo.
        rejects.append({"rung": "geosearch", "file": None,
                        "reason": "token_gate"})

    # ---- rung 6: nothing we can stand behind
    found = {r["reason"] for r in rejects}
    if qid_reason:
        found.add(qid_reason)
    reason = next((r for r in REASON_PRIORITY if r in found), "no_candidate")
    return {"binding": None, "image": None, "reason": reason, "poi": poi_file,
            "tried": tried, "rejects": reject_sample(rejects),
            "at": ctx["stamp"]}


# --------------------------------------------------------------------------- #
# context
# --------------------------------------------------------------------------- #
def settlement_index(countries):
    """Populated places in the priced countries, as a GeoIndex. Parsed from the
    GeoNames dump the place-candidates build already reads, so nothing is
    downloaded: columns are id, name, ascii, alternates, lat, lon, class, code,
    country."""
    rows = []
    if not GEONAMES.exists():
        log(f"[images] WARNING: no {GEONAMES.name}, the parent-town guard "
            f"falls back to the 1,570 priced towns alone")
        return GeoIndex(rows)
    with GEONAMES.open("r", encoding="utf-8") as fh:
        for line in fh:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 9 or cols[7] not in SETTLEMENT_FCODES:
                continue
            if cols[8] not in countries:
                continue
            try:
                rows.append({"lat": float(cols[4]), "lon": float(cols[5]),
                             "name": cols[1], "ascii": cols[2]})
            except ValueError:
                continue
    return GeoIndex(rows)


def build_context(stamp, cache):
    """Everything the ladder reads that is not per-feature, loaded once. The
    two memos are the cache's own dicts, not copies, so every lookup the ladder
    makes lands in the file the next checkpoint writes."""
    app = load_json(APP_DATA) or {}
    dests = app.get("destinations") or {}

    # The destination hero photos, by Commons file name. A feature that lands
    # on one of these is inheriting the town's picture by definition.
    hero_files = set()
    dest_names = {}
    for dest_id, d in dests.items():
        image = d.get("image") or {}
        for key in ("hires", "url"):
            name = commons_filename(image.get(key))
            if name:
                hero_files.add(name)
        dest_names[dest_id] = d.get("city") or ""

    towns = settlement_index(set(catalogue_countries(app)))

    admin_qids = {}
    for rec in (load_json(POI_WIKIDATA) or {}).values():
        qid = rec.get("qid")
        if qid and (rec.get("admin") or rec.get("station")):
            admin_qids[qid] = True

    def parent_tokens(f):
        """The town, region and country words this feature sits inside. Every
        destination that contributed a POI to it counts, not only the nearest:
        a beach merged from three towns can inherit any of the three. The
        feature's own tokens are NOT subtracted here; resolve() keeps the
        difference as ident["own"], because "is the file named after the town"
        and "is the file named after the feature" are two questions and a
        beach called after its village needs both answered."""
        toks = distinctive((f.get("near") or {}).get("city") or "")
        toks |= distinctive(f.get("country") or "")
        for dest_id in (f.get("provenance") or {}).get("dests") or []:
            toks |= distinctive(dest_names.get(dest_id, ""))
        for _km, town in towns.near(f["lat"], f["lon"], SETTLEMENT_KM):
            toks |= distinctive(town["name"]) | distinctive(town["ascii"])
        return toks

    return {
        "hero_files": hero_files,
        "admin_qids": admin_qids,
        "licences": load_json(POI_LICENSES) or {},
        "parent_tokens": parent_tokens,
        "entities": cache["entities"],
        "files": cache["files"],
        "queries": cache["queries"],
        "stamp": stamp,
    }


def prefetch(todo, ctx, ledger, refresh):
    """Ask for the QIDs and the POI file names 50 at a time before the ladder
    walks feature by feature. Same answers, a fraction of the requests: a
    700-feature run drops from roughly 800 single-item lookups to 20 batches."""
    wikidata_records([f.get("wikidata") for f in todo], ctx["entities"],
                     refresh)
    names = [poi_candidate(f, ledger.get(f["id"])) for f in todo]
    file_records([n for n in names if n], ctx["files"], refresh)


def load_cache():
    """features is the decision ledger the contract asks for, keyed by feature
    id. entities and files are memos beside it: one QID or one Commons file
    fetched for feature A is never fetched again for feature B, and neither
    survives a --refresh of the features that reference it."""
    cache = load_json(IMAGE_FEATURE_CACHE) or {}
    for key in ("features", "queries", "entities", "files"):
        cache.setdefault(key, {})
    return cache


# --------------------------------------------------------------------------- #
# selection and apply
# --------------------------------------------------------------------------- #
def select(features, cache, kind, country, limit, refresh, redecide=False,
           missing=False, ids=None):
    """Which features this run resolves. A limited run takes a round robin over
    (country, kind) rather than the head of the list, so a 200-feature test run
    is not 200 Spanish beaches.

    --redecide is confined to features the ledger already holds. Letting it
    reach the rest would write a refusal for a feature nobody has ever looked
    up, which is the one thing this pipeline must never do: an unasked question
    is not a no.

    --missing-only is the periodic retry of the refusals: features the ledger
    has looked up and holds no image for. Commons grows, so a "no" from last
    season is worth asking again without re-walking the 6,400 that already
    have their photograph."""
    rows = [f for f in features
            if (not kind or f["kind"] == kind)
            and (not country or f["iso2"] == country.upper())]
    if ids is not None:
        rows = [f for f in rows if f["id"] in ids]
    if missing:
        ledger = cache["features"]
        rows = [f for f in rows
                if f["id"] in ledger and not ledger[f["id"]].get("image")]
    elif redecide:
        rows = [f for f in rows if f["id"] in cache["features"]]
    elif not refresh:
        rows = [f for f in rows if f["id"] not in cache["features"]]
    if not limit or len(rows) <= limit:
        return rows

    buckets = defaultdict(list)
    for f in rows:
        buckets[(f["iso2"], f["kind"])].append(f)
    for key in buckets:
        buckets[key].sort(key=lambda f: f["id"])
    out, keys = [], sorted(buckets)
    while len(out) < limit and any(buckets[k] for k in keys):
        for key in keys:
            if buckets[key]:
                out.append(buckets[key].pop(0))
                if len(out) >= limit:
                    break
    return out


def apply_cache(features, cache, stats):
    """Write every decision we hold onto the artifact. Features this stage has
    never decided about keep the thumbnail build_features gave them: silently
    nulling those would delete evidence this stage has not looked at yet."""
    ledger = cache["features"]
    for f in features:
        rec = ledger.get(f["id"])
        if not rec:
            continue
        image = rec.get("image")
        f["image"] = dict(image) if image else None
        f["signals"]["commons_assessed"] = bool(image)
        f["provenance"]["image"] = {k: v for k, v in
                                    (("binding", rec.get("binding")),
                                     ("reason", rec.get("reason")),
                                     ("poi", rec.get("poi")),
                                     ("tried", rec.get("tried")),
                                     ("rejects", rec.get("rejects")),
                                     ("checked", rec.get("at")))
                                    if v}
        sources = f.setdefault("sources", [])
        has_commons = any(s.get("name") == COMMONS_SOURCE["name"]
                          for s in sources)
        if image and not has_commons:
            sources.append(dict(COMMONS_SOURCE))
        elif not image and has_commons:
            f["sources"] = [s for s in sources
                            if s.get("name") != COMMONS_SOURCE["name"]]
        stats[rec.get("binding") or "none"] += 1


def refresh_counts(data):
    """build_features tallied images at build time; after this stage those
    numbers describe a state that no longer exists, so the envelope's image
    counts are recomputed from the artifact itself."""
    features = data["features"]
    counts = data.setdefault("counts", {})
    per_country = counts.setdefault("per_country", {})
    for iso2, block in per_country.items():
        if "image" in block:
            block["image"] = 0
    for f in features:
        if f.get("image"):
            block = per_country.setdefault(f["iso2"], {})
            block["image"] = block.get("image", 0) + 1
    if "joins" in counts:
        counts["joins"]["image"] = sum(1 for f in features if f.get("image"))


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def report(features, cache):
    ledger = cache["features"]
    rows = [(f, ledger[f["id"]]) for f in features if f["id"] in ledger]
    if not rows:
        log("[images] nothing resolved yet")
        return
    n = len(rows)
    by_binding = Counter((r.get("binding") or "none") for _f, r in rows)
    log(f"[images] {n} features resolved, "
        f"{n - by_binding['none']} with a photo "
        f"({100 * (n - by_binding['none']) / n:.0f}%)")

    log("rungs (first hit wins):")
    for rung in RUNGS + ("none",):
        count = by_binding.get(rung, 0)
        log(f"    {rung:<12} {count:>6}  {100 * count / n:>5.1f}%")

    log("refused, by reason:")
    reasons = Counter(r.get("reason") for _f, r in rows if not r.get("binding"))
    for reason, count in reasons.most_common():
        log(f"    {reason:<20} {count:>6}")

    log("per country (resolved / with photo / share):")
    per = defaultdict(lambda: [0, 0])
    for f, r in rows:
        per[f["iso2"]][0] += 1
        per[f["iso2"]][1] += 1 if r.get("binding") else 0
    for iso2 in sorted(per):
        total, hit = per[iso2]
        log(f"    {iso2}  {total:>5} {hit:>5}  {100 * hit / total:>5.1f}%")

    # Commons peer review is not stored on the feature (it ranks candidates, it
    # is not a fact about the beach), but the file memo still holds it, so the
    # examples can say whether a human ever reviewed the photo.
    files = cache.get("files") or {}
    log("examples:")
    shown = [(f, r) for f, r in rows if r.get("image")]
    step = max(1, len(shown) // 10)
    for f, r in shown[::step][:10]:
        assess = (files.get(r["image"]["file"]) or {}).get("assess") or []
        review = " ".join(assess) if assess else "no peer review"
        log(f"    [{r['binding']}] {f['name']} ({f['iso2']}, {f['kind']}), "
            f"{review}")
        log(f"        {r['image']['url']}")
        log(f"        {r['image']['licence']} / {r['image']['author']}")


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int,
                        help="resolve at most N features, round robin over "
                             "country and kind")
    parser.add_argument("--kind", choices=("beach", "mountain"))
    parser.add_argument("--country", help="ISO2, e.g. ES")
    parser.add_argument("--refresh", action="store_true",
                        help="re-fetch features already in the ledger")
    parser.add_argument("--redecide", action="store_true",
                        help="re-run the gates over the cached lookups, no "
                             "network, for when a gate changes")
    parser.add_argument("--missing-only", action="store_true",
                        help="re-ask Commons only for the features the ledger "
                             "holds no image for; the periodic retry of the "
                             "refusals, since Commons grows")
    parser.add_argument("--ids", metavar="FILE",
                        help="JSON list of feature ids to confine the run to; "
                             "how a targeted retry (say, the wire's imageless "
                             "627) avoids walking the whole raw pool")
    parser.add_argument("--report", action="store_true",
                        help="apply the ledger and report, no network")
    args = parser.parse_args()

    data = load_json(RAW_FEATURES)
    if not data:
        log(f"[images] no {RAW_FEATURES}; run build_features.py first")
        return
    features = data["features"]
    cache = load_cache()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not args.report:
        global OFFLINE
        OFFLINE = args.redecide
        ctx = build_context(stamp, cache)
        wanted_ids = None
        if args.ids:
            with open(args.ids, encoding="utf-8") as fh:
                wanted_ids = set(json.load(fh))
        todo = select(features, cache, args.kind, args.country, args.limit,
                      args.refresh, args.redecide, args.missing_only,
                      wanted_ids)
        log(f"[images] {len(features)} features, {len(cache['features'])} "
            f"already resolved, {len(todo)} to walk"
            f"{' from cache only' if OFFLINE else ''}")
        if args.refresh or args.missing_only:
            # A refresh means the answers are stale, not just the decision, so
            # the feature's remembered queries go with it.
            stale = {f["id"] for f in todo}
            for key in [k for k in cache["queries"]
                        if k.split("|")[0] in stale]:
                cache["queries"].pop(key)
        if not OFFLINE:
            prefetch(todo, ctx, cache["features"],
                     args.refresh or args.missing_only)
        for i, f in enumerate(todo, 1):
            cache["features"][f["id"]] = resolve(f, ctx,
                                                 cache["features"].get(f["id"]))
            if i % CHECKPOINT_EVERY == 0:
                save_json(IMAGE_FEATURE_CACHE, cache)
                hit = sum(1 for g in todo[:i]
                          if (cache["features"].get(g["id"]) or {}).get("image"))
                log(f"    {i}/{len(todo)}  photos so far: {hit}")
        save_json(IMAGE_FEATURE_CACHE, cache)
        log(f"[images] requests: "
            f"{_calls[COMMONS_API]} commons, {_calls[WIKIDATA_API]} wikidata, "
            f"{_calls['http_error']} http errors, {_calls['net_error']} "
            f"network errors")

    stats = Counter()
    apply_cache(features, cache, stats)
    refresh_counts(data)
    save_json(RAW_FEATURES, data)
    log(f"[images] applied to {sum(stats.values())} features in "
        f"{RAW_FEATURES.name}")
    report(features, cache)


if __name__ == "__main__":
    main()
