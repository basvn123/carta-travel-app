"""build_features.py - the BEACH and MOUNTAIN spine, built from local data only.

Stage 1 of the natural-features pipeline (see features_common.py for the stage
map). Carta already knows about thousands of beaches and summits, but only as
anonymous rows inside a destination's POI list, where a beach is whatever
OpenTripMap happened to tag near a priced city. This stage lifts them out into
standalone entities with their own identity, country and joins, so the later
stages (Wikidata, images, ranking) have something stable to enrich.

Everything it reads is already on disk; the network is never touched:

    continent-app/public/activities_full.json  134,657 POIs, keyed by dest id
    continent-app/public/app_data.json         the 1,570 priced destinations
    cache/eea_bathing_water.json               22,289 official EEA bathing sites
    cache/osm_protected_areas.json             47,700 named protected areas
    cache/wikidata_sitelinks.json              QID -> sitelink count
    cache/poi_wikidata.json                    wiki URL -> QID (the only local
                                               bridge from a POI to a QID)
    cache/poi_image_licenses.json              Commons file -> TASL + licence gate

Three things make the raw POI layer unusable as-is, and each has its own pass:

  1. The kind field leaks. OpenTripMap's "interesting_places" contains the
     substring "plac", so 22,383 POIs landed in the junk kind "Square"
     (harvest_activities.py:144) and 1,588 of them are named beaches. A
     name-recovery pass in ~20 European languages pulls them back, and records
     which pass found each candidate in provenance.spine.
  2. The kind field lies. "Peak" holds bus lines, islands, wine regions and
     hotels, and carries no elevation at all. A lexical contamination gate
     drops the obvious non-summits and logs every drop with its reason; what
     is left over (a volcano island filed as its own town) is a semantic
     problem for enrich_wikidata.py's P31, not for this stage.
  3. The same beach appears under several destinations and several spellings
     ("Playa de la Caleta" / "Malagueta Beach"). A union-find dedupe, the same
     idea as pipeline/dedupe_pois.py, keeps the best-evidence member and
     records the losers in provenance.dedupe_of.

Then the joins that only local data can give: official water quality (EEA),
the protected area around it (OSM), the nearest priced destination, and the
fame signals the POI already carries.

Writes:
    data/derived/features_raw.json      {"generated_at", "counts", "features"}
    data/reports/features_build_drops.json  every gated candidate + reason

Idempotent: a full run rebuilds the artifact from scratch, so a rerun can not
duplicate rows. A filtered run (--limit / --country) rebuilds only the
destinations in scope and keeps the features that no in-scope destination
contributed to, so the fast loop never silently truncates the artifact.
There is no --refresh: nothing here is fetched, so there is nothing to refresh.

Usage:
    python pipeline/features/build_features.py
    python pipeline/features/build_features.py --country ES
    python pipeline/features/build_features.py --limit 50 --dry
"""
import argparse
import re
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timezone

from filters import apply_filters
from features_common import (ACTIVITIES, APP_DATA, BATHING_CACHE, CACHE,
                             GeoIndex, POI_LICENSES, PROTECTED_CACHE, RAW_FEATURES,
                             REPORTS, SITELINKS_CACHE, blank_feature,
                             catalogue_countries, country_at, feature_id, fold,
                             has_country_shapes, haversine_km, load_json, log,
                             name_core, save_json)

# The POI records carry a wiki URL, never a QID, so the sitelink cache (which
# is keyed by QID) is only reachable through the POI->Wikidata resolution the
# significance pass already harvested.
POI_WIKIDATA = CACHE / "poi_wikidata.json"
DROPS_REPORT = REPORTS / "features_build_drops.json"

# Join radii. Water is tight because an EEA site 2 km down the coast is a
# DIFFERENT beach; protected areas and cities are containers, so they may sit
# further away and still describe the feature.
WATER_KM = 2.0
PROTECTED_KM = 5.0
NEAR_DEST_KM = 60.0

# Dedupe radii: one name in two spellings can be logged 12 km apart (a long
# beach digitised twice, once per neighbouring town), but two POIs with the
# byte-identical name only count as one place when they are on top of each
# other.
CORE_MERGE_KM = 12.0
NAME_MERGE_KM = 1.5

# The bathing-water cache holds no season field; it was paged out of the EEA
# 2025 layer by harvest_bathing_water.py (LAYER / YEAR there). Keep the two in
# sync when that harvester moves to a new season.
EEA_SEASON = 2025

OSM_SOURCE = {"name": "OpenStreetMap contributors",
              "url": "https://www.openstreetmap.org/copyright"}
EEA_SOURCE = {"name": f"European Environment Agency, WISE Bathing Water "
                      f"Quality {EEA_SEASON}",
              # the service the cache was paged out of, so the citation is
              # verifiable from harvest_bathing_water.py rather than guessed
              "url": ("https://water.discomap.eea.europa.eu/arcgis/rest/"
                      "services/BathingWater")}

WATER_CLASSES = ("Excellent", "Good", "Sufficient", "Poor")


# --------------------------------------------------------------------------- #
# vocabulary
# --------------------------------------------------------------------------- #
# Tokens are matched whole, never as substrings: "berg" as a substring turns
# Heidelberg and Nuremberg into mountains, and "plac" is exactly the substring
# bug that created the Square leak in the first place. Greek and Cyrillic stay
# word characters (fold() lowercases and de-accents them but never
# transliterates), so a Greek beach keeps its name intact.
_TOKEN_SPLIT = re.compile("[^0-9a-z\u0370-\u03ff\u0400-\u04ff]+")

# Non-Latin words are written as escapes to keep the source ASCII-clean, per
# project style; the transliteration is in the comment beside each.
_PARALIA_GR = "\u03c0\u03b1\u03c1\u03b1\u03bb\u03b9\u03b1"      # paralia
_PLAZH_CYR = "\u043f\u043b\u0430\u0436"                        # plazh
_PLAZHA_CYR = "\u043f\u043b\u0430\u0436\u0430"                 # plazha
_PLYAZH_CYR = "\u043f\u043b\u044f\u0436"                       # plyazh

BEACH_WORDS = {
    # romance
    "playa", "playas", "platja", "platges", "praia", "praias", "plage",
    "plages", "spiaggia", "spiagge", "lido", "cala", "calas", "cales",
    # germanic
    "beach", "beaches", "strand", "strandje", "stranden", "strandbad",
    "sandur",
    # nordic / finnic / baltic
    "ranta", "rannat", "strond", "pludmale", "papludimys", "rand",
    # greek and cyrillic, in their own alphabet
    _PARALIA_GR, _PLAZH_CYR, _PLAZHA_CYR, _PLYAZH_CYR,
    # balkan / celtic / basque
    "paralia", "plazh", "plaja", "plaje", "plaj", "traeth", "tra",
    "hondartza",
}
# Compounding languages glue the word on: "uimaranta", "Nordstrand",
# "Badestrand". Only long, distinctive endings, and only on long tokens, so
# "Grand" does not become a beach.
BEACH_SUFFIXES = ("strand", "stranden", "strandje", "ranta", "strond")
BEACH_SUFFIX_MIN = 8
# Polish "plaza", Croatian/Serbian/Slovene "plaza" and Czech "plaze" all fold
# to a beach word that Spanish spells the same and means town square. Anywhere
# but ES the beach reading is the right one.
BEACH_WORDS_AMBIGUOUS = {"plaza": {"ES"}, "plaze": {"ES"}}
# ... except when the rest of the name says square: English uses "plaza" too,
# and "Church plaza" reached tier 1 as a Croatian beach on the first ranked
# run. The ambiguous word alone is not enough evidence, so a built, business or
# transport word beside it wins (AMBIGUOUS_BLOCKERS, below the vocabularies it
# is built from). Unambiguous beach words are untouched: a "Chapel Beach" is
# still a beach.

_VOUNO_GR = "\u03b2\u03bf\u03c5\u03bd\u03bf"                    # vouno
_OROS_GR = "\u03bf\u03c1\u03bf\u03c2"                           # oros
_VRH_CYR = "\u0432\u0440\u0445"                                 # vrh
_PLANINA_CYR = "\u043f\u043b\u0430\u043d\u0438\u043d\u0430"     # planina
_GORA_CYR = "\u0433\u043e\u0440\u0430"                          # gora

PEAK_WORDS = {
    "peak", "peaks", "pike", "mount", "mountain", "mt", "summit",
    "monte", "mont", "montagne", "monti", "pico", "picos", "pic", "puig",
    "puy", "cima", "cimon", "punta", "sierra",
    "berg", "bjerg", "bjerget", "spitze", "gipfel", "kogel", "horn",
    "fjell", "fjellet", "fjall", "fjallet", "tindur", "tind",
    "vrh", "vrch", "vrf", "hora", "gora", "szczyt", "planina", "maja",
    "kalns", "kalnas", "csucs", "tepe",
    _VOUNO_GR, _OROS_GR, _VRH_CYR, _PLANINA_CYR, _GORA_CYR,
}

# Which kinds the name-recovery pass is allowed to look at. Anything that is
# already a building by its own tag stays a building: a "Praia" that OTM filed
# as a Museum is a museum about the beach, and a "Monte" filed as a Monastery
# is the monastery on the hill.
RECOVERY_KINDS = {"Square", "Landmark", "Attraction", "Nature reserve",
                  "National park", "Park", "Viewpoint", "Glacier", "Canyon",
                  "Activity", "Climbing", "Historic site", "Village"}
RECOVERY_KINDS_BEACH = RECOVERY_KINDS | {"Swimming", "Surfing", "Diving",
                                         "Water park", "Sauna & baths"}
RECOVERY_KINDS_MOUNTAIN = RECOVERY_KINDS | {"Skiing"}

# The contamination gate. Overture's beach layer is full of businesses ON the
# beach, and OTM's Peak layer is full of things that merely stand near one.
BUSINESS_WORDS = {
    "hotel", "hotels", "hostel", "motel", "resort", "resorts", "apartment",
    "apartments", "appartement", "appartements", "apartamentos", "aparthotel",
    "camping", "campsite", "campground", "glamping", "bungalow", "bungalows",
    "chalet", "chalets", "guesthouse", "b&b",
    "restaurant", "restaurante", "ristorante", "taverna", "tavern", "trattoria",
    "pizzeria", "cafe", "coffee", "bistro", "pub", "snack", "lounge", "grill",
    "spa", "wellness", "casino", "nightclub", "disco", "tennis", "gym",
    "fitness", "kiosk",
    "shop", "market", "supermarket", "minimarket", "boutique",
    "rental", "rentals", "office", "agency", "clinic", "pharmacy", "bank",
    "school", "academy", "parking", "garage", "showroom",
}
# Weak: ordinary words elsewhere. "Bar" is a Montenegrin town and "Store" is
# Norwegian for great, which condemned three real Jotunheimen summits on the
# first run. They only count when the name also carries a strong business word
# or a beach word, i.e. "Golden Bay Beach Bar".
BUSINESS_WEAK = {"bar", "bars", "club", "clubs", "store", "stores"}
TRANSPORT_WORDS = {
    "bus", "buses", "ktel", "station", "stazione", "estacion", "estacao",
    "bahnhof", "gare", "terminal", "airport", "aeroport", "aeroporto",
    "aeropuerto", "flughafen", "heliport", "ferry", "funicular", "funicolare",
    "seilbahn", "telecabina", "teleferico", "gondola", "chairlift",
}
# Mountains only: a summit is not a building. Beaches keep these, because a
# beach genuinely named after the chapel above it is still a beach.
BUILT_WORDS = {
    "castle", "castello", "castillo", "chateau", "schloss", "burg", "zamek",
    "church", "chiesa", "iglesia", "kirche", "kerk", "kostel", "chapel",
    "cappella", "capela", "kapelle", "kaplica", "cathedral", "basilica",
    "monastery", "monastero", "monasterio", "kloster", "klasztor", "convent",
    "abbey", "museum", "museo", "musee", "muzeum", "observatory", "staircase",
    "stairs", "villa", "palace", "palazzo", "stadium", "cemetery", "hospital",
}
# Mountains only: "La Geria" style wine country rides in at rate 3.
WINE_WORDS = {"wine", "winery", "wines", "vino", "vinho", "vin", "vignoble",
              "bodega", "bodegas", "vineyard", "vineyards", "weingut",
              "cantina", "distillery", "brewery"}
# Destination categories that say "this is a place people live on", used when
# a summit candidate carries its destination's own name.
SETTLEMENT_CATS = {"town", "village", "city", "island"}

AMBIGUOUS_BLOCKERS = BUILT_WORDS | BUSINESS_WORDS | TRANSPORT_WORDS


# Romanisation. slugify() and name_core() are ASCII-only, so a Greek or
# Cyrillic name folds to nothing: the first full run put 136 Bulgarian
# mountains under the single id "mountain:BG:" and switched their dedupe off.
# Transliterating is a rendering of the same name, not a new fact, and it also
# lets "Paralia Simou" meet the Greek spelling of itself in the dedupe.
def _map(start, latin):
    return {chr(start + i): latin[i] for i in range(len(latin))}


_ROMAN = {}
_ROMAN.update(_map(0x3b1, ["a", "v", "g", "d", "e", "z", "i", "th", "i", "k",
                           "l", "m", "n", "x", "o", "p", "r", "s", "s", "t",
                           "y", "f", "ch", "ps", "o"]))          # alpha..omega
_ROMAN.update(_map(0x430, ["a", "b", "v", "g", "d", "e", "zh", "z", "i", "j",
                           "k", "l", "m", "n", "o", "p", "r", "s", "t", "u",
                           "f", "h", "c", "ch", "sh", "sht", "a", "y", "",
                           "e", "yu", "ya"]))                    # a..ya
_ROMAN.update({chr(0x451): "e", chr(0x452): "dj", chr(0x453): "g",
               chr(0x456): "i", chr(0x458): "j", chr(0x459): "lj",
               chr(0x45a): "nj", chr(0x45b): "c", chr(0x45c): "k",
               chr(0x45e): "u", chr(0x45f): "dz"})               # south slavic


def romanise(name):
    """Folded name with Greek and Cyrillic letters written in Latin."""
    return "".join(_ROMAN.get(c, c) for c in fold(name))


def tokens(name):
    return [t for t in _TOKEN_SPLIT.split(fold(name)) if t]


def core_of(name):
    """The identity tokens, via the romanised name so the ASCII-only
    name_core() still has something to work with."""
    return name_core(romanise(name)) or " ".join(tokens(name))


def is_beach_name(name, iso2):
    toks = tokens(name)
    tset = set(toks)
    if tset & BEACH_WORDS:
        return True
    if not tset & AMBIGUOUS_BLOCKERS:
        for word, blocked in BEACH_WORDS_AMBIGUOUS.items():
            if word in tset and iso2 not in blocked:
                return True
    return any(len(t) >= BEACH_SUFFIX_MIN and t.endswith(BEACH_SUFFIXES)
               for t in toks)


def is_peak_name(name):
    """Leading or trailing token only. "Monte Erice" and "Cima Tosa" are
    summits; "Staircase of Santa Maria del Monte" is a staircase. The word
    also needs a name beside it: "MT-52" is a Maltese road, not a mountain."""
    toks = tokens(name)
    if len(toks) < 2:
        return False
    if toks[0] in PEAK_WORDS:
        rest = toks[1:]
    elif toks[-1] in PEAK_WORDS:
        rest = toks[:-1]
    else:
        return False
    return any(not t.isdigit() for t in rest)


def gate_reason(kind, name, iso2, dest):
    """Why this candidate is not a feature, or None to keep it."""
    toks = set(tokens(name))
    if toks & TRANSPORT_WORDS:
        return "transport_name"
    if toks & BUSINESS_WORDS:
        return "business_name"
    if (toks & BUSINESS_WEAK) and (toks & BEACH_WORDS or toks & BUSINESS_WORDS):
        return "business_name"
    if kind == "mountain":
        if toks & BUILT_WORDS:
            return "built_name"
        if toks & WINE_WORDS:
            return "wine_name"
        # The island or town filed as its own summit: "Santorini",
        # "Pantelleria", "Monsanto". The catalogue's own categories are the
        # discriminator. A destination that calls itself 'mountains' really is
        # named after the mountain (Mont Ventoux, Kjerag, Lovcen), and so is a
        # walking destination that never calls itself a settlement (Slieve
        # League, Creux du Van). An island stays an island.
        city = (dest.get("city") or "").strip()
        if city and fold(name).strip() == fold(city):
            cats = set(dest.get("categories") or [])
            wild = bool(cats & {"hiking", "wilderness"}
                        and not cats & SETTLEMENT_CATS)
            if "mountains" not in cats and not wild:
                return "settlement_name"
    return None


# --------------------------------------------------------------------------- #
# candidates
# --------------------------------------------------------------------------- #
def collect(acts, dests, countries, limit, country):
    """Walk the POI layer once and return (rows, drops, scope, stats)."""
    rows, drops = [], []
    stats = Counter()
    scope = set()

    dest_ids = list(acts.keys())
    if country:
        dest_ids = [d for d in dest_ids
                    if (dests.get(d) or {}).get("iso2") == country]
    if limit:
        dest_ids = dest_ids[:limit]

    for did in dest_ids:
        dest = dests.get(did)
        if not dest:
            stats["dest_missing"] += 1        # POI list with no catalogue row
            continue
        iso2 = dest.get("iso2")
        if iso2 not in countries:
            stats["country_off_catalogue"] += 1
            continue
        scope.add(did)
        for i, it in enumerate(acts[did] or []):
            if it.get("dup") or it.get("noise"):
                continue                      # already judged by the POI passes
            poi_kind = it.get("kind") or ""
            name = (it.get("name") or "").strip()
            if not name:
                continue
            if poi_kind == "Beach":
                kind, spine = "beach", "kind_beach"
            elif poi_kind == "Peak":
                kind, spine = "mountain", "kind_peak"
            elif (poi_kind in RECOVERY_KINDS_BEACH
                    and is_beach_name(name, iso2)):
                kind, spine = "beach", "name_beach"
            elif (poi_kind in RECOVERY_KINDS_MOUNTAIN and is_peak_name(name)):
                kind, spine = "mountain", "name_peak"
            else:
                continue
            stats[f"cand_{spine}"] += 1

            lat, lon = it.get("lat"), it.get("lon")
            if not all(isinstance(v, (int, float)) for v in (lat, lon)):
                drops.append({"dest": did, "name": name, "kind": kind,
                              "spine": spine, "reason": "no_coords"})
                continue
            pop = it.get("pop")
            reason = gate_reason(kind, name, iso2, dest)
            if reason:
                drops.append({"dest": did, "name": name, "kind": kind,
                              "spine": spine, "reason": reason,
                              "rate": it.get("rate") or 0})
                continue
            rows.append({
                "did": did, "idx": i, "kind": kind, "spine": spine,
                "iso2": iso2, "country": countries[iso2], "name": name,
                "lat": float(lat), "lon": float(lon),
                "core": core_of(name), "fname": fold(name).strip(),
                "poi_kind": poi_kind, "src": it.get("src"),
                "rate": int(it.get("rate") or 0),
                "img": it.get("img"), "img_src": it.get("img_src"),
                "wiki": it.get("wiki"),
                "pop": pop if isinstance(pop, (int, float)) else None,
            })
    return rows, drops, scope, stats


# --------------------------------------------------------------------------- #
# dedupe
# --------------------------------------------------------------------------- #
def _union_by_key(rows, idxs_by_key, max_km, union):
    """Pair up rows sharing a key, inside a latitude window so a huge bucket
    ("grande" is the core of dozens of beaches) never goes quadratic."""
    dlat = max_km / 111.0
    for idxs in idxs_by_key.values():
        if len(idxs) < 2:
            continue
        idxs = sorted(idxs, key=lambda i: rows[i]["lat"])
        for a in range(len(idxs)):
            ra = rows[idxs[a]]
            for b in range(a + 1, len(idxs)):
                rb = rows[idxs[b]]
                if rb["lat"] - ra["lat"] > dlat:
                    break
                if haversine_km(ra["lat"], ra["lon"],
                                rb["lat"], rb["lon"]) <= max_km:
                    union(idxs[a], idxs[b])


def dedupe(rows):
    """Union-find over the candidates: same name core within 12 km, or the
    identical name within 1.5 km. Blocked by kind and country, so a Croatian
    and a Polish "Plaza Centralna" stay two features and a beach never merges
    into the headland above it."""
    parent = list(range(len(rows)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[max(a, b)] = min(a, b)

    by_core = defaultdict(list)
    by_name = defaultdict(list)
    for i, r in enumerate(rows):
        block = (r["kind"], r["iso2"])
        if len(r["core"]) >= 3:
            by_core[(block, r["core"])].append(i)
        if r["fname"]:
            by_name[(block, r["fname"])].append(i)
    _union_by_key(rows, by_core, CORE_MERGE_KM, union)
    _union_by_key(rows, by_name, NAME_MERGE_KM, union)

    groups = defaultdict(list)
    for i in range(len(rows)):
        groups[find(i)].append(i)
    return list(groups.values())


def evidence_key(r):
    """Best-evidence member wins the name and the coordinates: highest rate,
    then an image, then a wiki link. The tail of the key is only there to make
    the winner deterministic across runs."""
    return (r["rate"], 1 if r["img"] else 0, 1 if r["wiki"] else 0,
            r["pop"] or 0, -len(r["name"]), r["did"], -r["idx"])


# --------------------------------------------------------------------------- #
# joins
# --------------------------------------------------------------------------- #
def water_index():
    """Only classified sites: an unclassified row can not answer the one
    question the join exists to answer."""
    sites = load_json(BATHING_CACHE) or []
    return GeoIndex([s for s in sites if s.get("q") in WATER_CLASSES])


def protected_index():
    cache = load_json(PROTECTED_CACHE) or {}
    return GeoIndex(list((cache.get("by_key") or {}).values()))


def dest_index(dests):
    """City centres, not airports: city_lat/city_lon is the centre the rest of
    the pipeline treats as "the town" (9 dests are airport-anchored)."""
    pts = []
    for did, d in dests.items():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            pts.append({"lat": lat, "lon": lon, "id": did,
                        "city": d.get("city")})
    return GeoIndex(pts)


def designations_of(hits):
    """What the protected neighbourhood is, by kind string. OSM tags Natura
    2000 habitat sites as protect_class=4, which harvest_protected_areas_osm.py
    labels "Habitat reserve" - a class inference, not a Natura 2000 site-code
    join, so it stays a hint the ranker may weight but must not print as fact."""
    out = set()
    for _km, p in hits:
        kind = (p.get("kind") or "").lower()
        if p.get("np") or kind == "national park":
            out.add("national_park")
        elif kind == "habitat reserve":
            out.add("natura2000")
        elif kind == "wilderness area":
            out.add("wilderness")
        elif kind == "natural monument":
            out.add("natural_monument")
    return sorted(out)


_THUMB_RE = re.compile(r"upload\.wikimedia\.org/wikipedia/commons/thumb/"
                       r"[0-9a-f]/[0-9a-f]{2}/([^/]+)/")
_DIRECT_RE = re.compile(r"upload\.wikimedia\.org/wikipedia/commons/"
                        r"[0-9a-f]/[0-9a-f]{2}/([^/?]+)")
# enrich_images_commons.py and harvest_pois_wikidata_images.py store the
# server-side resize form instead, which the two upload.wikimedia.org patterns
# above can not see: 42k of the master's 80k POI thumbnails are written this
# way, so parsing only the upload host silently declared them licence-less.
_FILEPATH_RE = re.compile(r"commons\.wikimedia\.org/wiki/Special:FilePath/"
                          r"([^?#]+)")
_WIKI_RE = re.compile(r"https?://([a-z\-]+)\.wikipedia\.org/wiki/(.+)$")


def commons_filename(url):
    """Port of harvest_image_licenses.commons_filename: the licence cache is
    keyed by the file's display name. None means "not a Commons file", which
    includes upload.wikimedia.org/wikipedia/<lang>/ paths: those are local
    wiki uploads, usually non-free, and must never be treated as reusable."""
    if not url:
        return None
    m = (_THUMB_RE.search(url) or _DIRECT_RE.search(url)
         or _FILEPATH_RE.search(url))
    if not m:
        return None
    return urllib.parse.unquote(m.group(1)).replace("_", " ")


def wikipedia_ref(url):
    """A wikipedia URL as "el:Foo", the form blank_feature documents. Nothing
    is fetched; the POI already carries the URL."""
    m = _WIKI_RE.match(url or "")
    if not m:
        return None
    title = urllib.parse.unquote(m.group(2).split("#")[0]).replace("_", " ")
    return f"{m.group(1)}:{title}" if title else None


# --------------------------------------------------------------------------- #
# build
# --------------------------------------------------------------------------- #
def build(rows, groups, dests, stamp):
    water = water_index()
    prot = protected_index()
    cities = dest_index(dests)
    licences = load_json(POI_LICENSES) or {}
    qid_by_wiki = load_json(POI_WIKIDATA) or {}
    sitelinks = load_json(SITELINKS_CACHE) or {}
    COUNTRY_NAMES = catalogue_countries(load_json(APP_DATA) or {})
    if not has_country_shapes():
        log("  WARNING: no country shapes, border corrections are OFF")

    stats = Counter()
    features = []
    reassigns = []
    for g in groups:
        members = [rows[i] for i in g]
        canon = max(members, key=evidence_key)
        # A POI inherits the country of the destination it was harvested under,
        # and near a border that is simply wrong: Saranda in Albania collected
        # four Corfu beaches, so Greek sand shipped on Albania's tab (the
        # country review found 35 of these). Trust the coordinate over the
        # harvest, and REASSIGN rather than drop, since a Corfu beach is not
        # junk. A point that lands in no shape at all (a beach centroid a few
        # hundred metres offshore) keeps the harvested country.
        iso2, country = canon["iso2"], canon["country"]
        actual = country_at(canon["lat"], canon["lon"])
        if actual and actual != iso2:
            if actual in COUNTRY_NAMES:
                stats["reassigned_country"] += 1
                reassigns.append({"name": canon["name"], "kind": canon["kind"],
                                  "from": iso2, "to": actual,
                                  "lat": canon["lat"], "lon": canon["lon"]})
                iso2, country = actual, COUNTRY_NAMES[actual]
            else:
                # Outside the 43 priced countries entirely (a Turkish beach
                # collected by a Greek island). Nothing to show it on.
                stats["dropped_off_catalogue"] += 1
                reassigns.append({"name": canon["name"], "kind": canon["kind"],
                                  "from": iso2, "to": actual, "dropped": True,
                                  "lat": canon["lat"], "lon": canon["lon"]})
                continue

        f = blank_feature(canon["kind"], iso2, country,
                          canon["name"], canon["lat"], canon["lon"])

        # The group's evidence is unioned, exactly as dedupe_pois.py does for
        # the master: a merged twin's photo is a photo of this feature.
        ranked = sorted(members, key=evidence_key, reverse=True)
        rate = max(m["rate"] for m in members)
        img = next((m for m in ranked if m["img"]), None)
        wiki = next((m["wiki"] for m in ranked if m["wiki"]), None)
        pops = [m["pop"] for m in members if m["pop"]]

        f["sources"] = [dict(OSM_SOURCE)]
        f["provenance"] = {
            "spine": canon["spine"],
            "harvested": stamp,
            "dests": sorted({m["did"] for m in members}),
            "poi_kinds": sorted({m["poi_kind"] for m in members}),
            "poi_src": sorted({m["src"] for m in members if m["src"]}),
            "dedupe_of": sorted({f"{m['did']}:{m['name']}" for m in members
                                 if m is not canon}),
        }

        # ---- fame signals, all straight from the POI layer
        wd = (qid_by_wiki.get(wiki) or {}) if wiki else {}
        sl = sitelinks.get(wd.get("qid")) if wd.get("qid") else None
        if sl is None:
            sl = wd.get("sitelinks")          # resolved but not in the QID cache
        f["signals"] = {
            "poi_rate": rate,
            "has_wiki": bool(wiki),
            "pageviews": max(pops) if pops else None,
            "sitelinks": sl,
            "commons_assessed": False,
        }
        if wd.get("qid"):
            f["wikidata"] = wd["qid"]         # known locally; enrich fills the rest
            stats["qid"] += 1
        if wiki:
            f["wikipedia"] = wikipedia_ref(wiki)
            stats["wiki"] += 1
        if sl is not None:
            stats["sitelinks"] += 1

        # ---- image the POI already carries, with its TASL row when Commons
        # has been assessed. ok=false is an NC/ND file: not shippable, so the
        # feature stays image-less and enrich_images.py can look for another.
        if img:
            fn = commons_filename(img["img"])
            lic = licences.get(fn) if fn else None
            if lic and lic.get("ok") is False:
                stats["image_licence_blocked"] += 1
            elif lic and not lic.get("miss"):
                f["image"] = {"url": img["img"], "thumb": img["img"],
                              "author": lic.get("author"),
                              "licence": lic.get("license"),
                              "licence_url": lic.get("license_url"),
                              "source": "wikimedia_commons",
                              "binding": "poi", "file": fn}
                f["signals"]["commons_assessed"] = True
                stats["image"] += 1
            else:
                f["image"] = {"url": img["img"], "thumb": img["img"],
                              "author": None, "licence": None,
                              "licence_url": None,
                              "source": img["img_src"] or "poi",
                              "binding": "poi", "file": fn}
                stats["image"] += 1

        # ---- water (beaches only): the nearest official bathing site
        if f["kind"] == "beach":
            km, site = water.nearest(f["lat"], f["lon"], WATER_KM)
            if site:
                f["water"] = {"class": site["q"], "site": site.get("name"),
                              "dist_km": round(km, 2), "year": EEA_SEASON,
                              "profile_url": site.get("profile") or None}
                f["sources"].append(dict(EEA_SOURCE))
                stats["water"] += 1

        # ---- protected area + designations
        hits = prot.near(f["lat"], f["lon"], PROTECTED_KM)
        if hits:
            km, p = hits[0]
            f["protected"] = {"name": p.get("name"), "kind": p.get("kind"),
                              "dist_km": round(km, 2),
                              "wikidata": p.get("wikidata")}
            f["designations"] = designations_of(hits)
            stats["protected"] += 1

        # ---- nearest priced destination
        km, c = cities.nearest(f["lat"], f["lon"], NEAR_DEST_KM)
        if c:
            f["near"] = {"dest_id": c["id"], "city": c["city"],
                         "km": round(km, 1)}
            stats["near"] += 1

        features.append(f)
    if reassigns:
        save_json(REPORTS / "features_border_moves.json",
                  {"generated_at": stamp, "moves": reassigns}, indent=1)
        moved = sum(1 for r in reassigns if not r.get("dropped"))
        log(f"  border check: {moved} features moved to the country their "
            f"coordinates fall in, {len(reassigns) - moved} dropped as "
            "outside the priced catalogue")
    return features, stats


def assign_ids(features):
    """feature_id() collapses same name + same country on purpose, but two
    genuinely different "Playa Grande" 400 km apart must not share an id.
    Collisions are broken by a suffix in a fixed geographic order, so the id a
    feature gets does not depend on which run produced it. The id is built
    from the romanised name; the record keeps the real one."""
    by_id = defaultdict(list)
    for f in features:
        f["id"] = feature_id(f["kind"], f["iso2"], romanise(f["name"]))
        by_id[f["id"]].append(f)
    used = set(by_id)
    collisions = 0
    for fid, group in sorted(by_id.items()):
        if len(group) < 2:
            continue
        for n, f in enumerate(sorted(group, key=lambda x: (x["lat"], x["lon"]))):
            if not n:
                continue
            # a beach really called "Plage 2" may already own "plage-2", so
            # walk past any suffix that is somebody else's id
            k = n + 1
            while f"{fid}-{k}" in used:
                k += 1
            f["id"] = f"{fid}-{k}"
            used.add(f["id"])
            collisions += 1
    return collisions


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def summarise(features, drops, stats, countries, collisions, note):
    per_country = defaultdict(Counter)
    for f in features:
        c = per_country[f["iso2"]]
        c[f["kind"]] += 1
        if f.get("water"):
            c["water"] += 1
        if f.get("image"):
            c["image"] += 1
        if f.get("protected"):
            c["protected"] += 1

    kinds = Counter(f["kind"] for f in features)
    spines = Counter(f["provenance"]["spine"] for f in features)
    reasons = Counter(d["reason"] for d in drops)

    log("")
    log(f"features: {len(features)}  ({kinds['beach']} beaches, "
        f"{kinds['mountain']} mountains)")
    cands = {k[5:]: v for k, v in stats.items() if k.startswith("cand_")}
    log(f"  candidates: {sum(cands.values())}  {dict(sorted(cands.items()))}")
    log(f"  kept by spine: {dict(sorted(spines.items()))}")
    log(f"  merged away by dedupe: {stats['merged']}  "
        f"(groups with 2+ members: {stats['merge_groups']})")
    log(f"  id collisions disambiguated: {collisions}")
    log(f"  dropped: {len(drops)}  {dict(sorted(reasons.items()))}")
    log("")
    log("joins:")
    n = len(features) or 1
    nb = kinds["beach"] or 1
    log(f"  water class (beaches):  {stats['water']}/{kinds['beach']} "
        f"({100 * stats['water'] / nb:.0f}%)")
    log(f"  protected area <=5 km:  {stats['protected']}/{len(features)} "
        f"({100 * stats['protected'] / n:.0f}%)")
    log(f"  priced dest <=60 km:    {stats['near']}/{len(features)} "
        f"({100 * stats['near'] / n:.0f}%)")
    log(f"  image already on disk:  {stats['image']}/{len(features)} "
        f"({100 * stats['image'] / n:.0f}%)"
        f"  [{stats['image_licence_blocked']} blocked by licence]")
    log(f"  wikipedia link:         {stats['wiki']}   qid: {stats['qid']}   "
        f"sitelinks: {stats['sitelinks']}")
    log("")
    log("per country (beaches / mountains / with water class / with image):")
    for iso2 in sorted(per_country):
        c = per_country[iso2]
        log(f"  {iso2} {countries.get(iso2, ''):<24} "
            f"{c['beach']:>5} {c['mountain']:>5} {c['water']:>6} {c['image']:>6}")
    missing = sorted(set(countries) - set(per_country))
    if missing:
        log(f"  countries with no feature at all: {missing}")
    log("")
    log("top dropped names (worst offenders first):")
    ranked = sorted(drops, key=lambda d: (-(d.get("rate") or 0), d["name"]))
    for d in ranked[:15]:
        log(f"  [{d['reason']}] {d['name']}  ({d['dest']}, {d['kind']}, "
            f"rate {d.get('rate', 0)})")
    if note:
        log("")
        log(note)
    return {"per_country": {k: dict(v) for k, v in per_country.items()},
            "by_kind": dict(kinds), "by_spine": dict(spines),
            "dropped": dict(reasons), "drop_samples": ranked[:300],
            "joins": {k: v for k, v in stats.items()},
            "id_collisions": collisions}


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--limit", type=int, default=0,
                    help="only the first N destinations, for a fast loop")
    ap.add_argument("--country", help="ISO2, e.g. ES")
    ap.add_argument("--dry", action="store_true",
                    help="report only, write nothing")
    args = ap.parse_args()

    app = load_json(APP_DATA) or {}
    dests = app.get("destinations") or {}
    countries = catalogue_countries(app)
    acts = load_json(ACTIVITIES) or {}
    log(f"catalogue: {len(dests)} destinations, {len(countries)} countries; "
        f"POI lists: {len(acts)}")

    rows, drops, scope, stats = collect(acts, dests, countries,
                                        args.limit, args.country)
    log(f"candidates: {len(rows)} kept, {len(drops)} gated, "
        f"{len(scope)} destinations in scope")

    groups = dedupe(rows)
    stats["merged"] = len(rows) - len(groups)
    stats["merge_groups"] = sum(1 for g in groups if len(g) > 1)
    log(f"dedupe: {len(rows)} candidates -> {len(groups)} features")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    features, jstats = build(rows, groups, dests, stamp)
    stats.update(jstats)

    note = ""
    filtered = bool(args.limit or args.country)
    if filtered:
        # Keep what this run did not look at, so a fast loop can not truncate
        # a good artifact; anything an in-scope destination contributed to is
        # rebuilt, so nothing is duplicated either.
        prev = (load_json(RAW_FEATURES) or {}).get("features") or []
        kept = [f for f in prev
                if not (set(f.get("provenance", {}).get("dests") or []) & scope)]
        note = (f"filtered run: {len(features)} rebuilt, {len(kept)} preserved "
                f"from the previous artifact")
        features = features + kept

    # gate_reason ran at intake, against the destination whose POI list the
    # candidate came from. build() then moves a feature to the country its
    # coordinates actually fall in and re-joins it to a nearer destination,
    # and both can change the answer: the settlement clause reads the
    # destination record, so a peak that was a peak beside its old dest can be
    # a town beside its new one. Ask once more now the country and the join
    # are final, or the border fix quietly reopens the door the gate shut.
    kept_gated, regated = [], []
    for f in features:
        dest = dests.get((f.get("near") or {}).get("dest_id")) or {}
        reason = gate_reason(f["kind"], f["name"], f["iso2"], dest)
        if reason:
            regated.append((f, reason))
            drops.append({"dest": (f.get("near") or {}).get("dest_id"),
                          "name": f["name"], "kind": f["kind"],
                          "iso2": f["iso2"], "reason": f"regated:{reason}"})
        else:
            kept_gated.append(f)
    if regated:
        features = kept_gated
        counted = Counter(r for _, r in regated)
        log(f"  re-gated after the border move: {len(regated)} dropped "
            f"({', '.join(f'{k} {v}' for k, v in sorted(counted.items()))})")
        stats["regated"] = len(regated)

    # The curation rules, distilled from the per-country review of the first
    # wire (648 named rows). They are data, not code: see filters.py and
    # data/curation/features_filter_rules.json. Applied here rather than at
    # export so every later stage counts the same set, and so an image lookup
    # is never spent on a beach bar.
    before = len(features)
    features, frep = apply_filters(features)
    for row in frep["removed"] + frep["rerouted"]:
        drops.append({"dest": None, "name": row["name"], "kind": row["kind"],
                      "iso2": row["iso2"], "reason": f"filter:{row['rule']}"})
    if before != len(features):
        log(f"  curation filters: {len(frep['removed'])} dropped, "
            f"{len(frep['merged'])} merged into a twin, "
            f"{len(frep['rerouted'])} rerouted, "
            f"{len(frep['image_quarantined'])} photos quarantined")

    collisions = assign_ids(features)
    features.sort(key=lambda f: (f["iso2"], f["kind"], f["name"]))
    counts = summarise(features, drops, stats, countries, collisions, note)
    counts["filtered"] = {"dropped": len(frep["removed"]),
                          "merged": len(frep["merged"]),
                          "rerouted": len(frep["rerouted"]),
                          "by_rule": dict(frep["by_rule"])}

    if args.dry:
        log("\ndry run: nothing written")
        return
    save_json(RAW_FEATURES, {"generated_at": stamp, "counts": counts,
                             "features": features})
    save_json(DROPS_REPORT, {"generated_at": stamp,
                             "scope": {"limit": args.limit or None,
                                       "country": args.country},
                             "by_reason": counts["dropped"], "drops": drops})
    log(f"\nwrote {RAW_FEATURES}  ({len(features)} features)")
    log(f"wrote {DROPS_REPORT}  ({len(drops)} gated candidates)")


if __name__ == "__main__":
    main()
