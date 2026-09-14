"""Stage 1 of the beach layer: find every named beach in Europe.

Two catalogues, merged into one row per real beach:

  Wikidata   anything typed as a beach (P31/P279* Q40080) with coordinates in
             the country, plus the fields that make a beach rankable at all:
             sitelink count (fame), main image, Commons category, the region
             it sits in, and its Wikipedia titles. CC0, so it can be kept.
  OpenStreetMap  every NAMED natural=beach and leisure=beach_resort in the
             country. This is where the small coves live, the calas and calan-
             ques and baaikes that no encyclopedia has an article about, and
             it is the only source for surface, lifeguard, nudism and access
             tags. ODbL, so it stays in its own fields and carries its own
             credit into the wire.

Merging is deliberately conservative. An OSM element that names its Wikidata
id is the same beach, no question asked. Otherwise the two rows have to be
within MERGE_KM of each other AND share a folded name token, or they stay
apart: two beaches 300 m apart along the same bay really are two beaches, and
a merge that guesses would silently delete one of them.

Idempotent and resumable: one cache file per country per stage
(cache/beaches/raw_CC.json), so a re-run costs nothing and a crash costs one
country. Re-harvest a country with --refresh.

Usage, from the repo root:
    python pipeline/beaches/harvest_beaches.py                # every country
    python pipeline/beaches/harvest_beaches.py --countries GR,HR
    python pipeline/beaches/harvest_beaches.py --countries ME --refresh
    python pipeline/beaches/harvest_beaches.py --no-osm       # Wikidata only
"""

import argparse
import json
import re
import sys
import unicodedata
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252, and this layer prints beach names:
# "Ir-Ramla tal-Mixquqa" and "Plaza Zlatni Rat" both raise UnicodeEncodeError
# on the way to a terminal that cannot spell them. Replacing the character is
# right for a progress line and wrong for a data file, which is why this
# touches stdout only; every cache and wire write goes through an explicit
# encoding="utf-8".
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sources import (SourceError, cell, get_json, haversine_km,  # noqa: E402
                     load_cache, overpass, save_cache, sparql)
import eea_spine  # noqa: E402

ROOT = HERE.parents[1]

# Every country the app draws, coastal or not. Landlocked ones are harvested
# too and simply come back with whatever lake beaches they really have: the
# rule that decides which countries appear in the app is "has published
# beaches", never a hand kept coastline list that would forget Lake Ohrid.
COUNTRIES = [
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
]

# The label language asked for alongside English, so a Greek or Croatian beach
# keeps the name written on the signpost when no English label exists.
LOCAL_LANG = {
    "AL": "sq", "AT": "de", "BA": "bs", "BE": "nl", "BG": "bg", "CH": "de",
    "CY": "el", "CZ": "cs", "DE": "de", "DK": "da", "EE": "et", "ES": "es",
    "FI": "fi", "FO": "fo", "FR": "fr", "GR": "el", "HR": "hr", "HU": "hu",
    "IS": "is", "IT": "it", "LT": "lt", "LV": "lv", "MC": "fr", "MD": "ro",
    "ME": "sr", "MK": "mk", "MT": "mt", "NL": "nl", "NO": "no", "PL": "pl",
    "PT": "pt", "RO": "ro", "RS": "sr", "SE": "sv", "SI": "sl", "SK": "sk",
    "XK": "sq", "SM": "it", "LI": "de", "LU": "fr", "AD": "ca", "IE": "en",
    "GB": "en",
}

MERGE_KM = 0.6          # how close two rows must be to be one beach
STAGE = "raw"

# Wikidata country QIDs. Hard coded rather than looked up: they are stable,
# and one fewer network dependency in front of every run is worth the lines.
COUNTRY_QID = {
    "AD": "Q228", "AL": "Q222", "AT": "Q40", "BA": "Q225", "BE": "Q31",
    "BG": "Q219", "CH": "Q39", "CY": "Q229", "CZ": "Q213", "DE": "Q183",
    "DK": "Q35", "EE": "Q191", "ES": "Q29", "FI": "Q33", "FO": "Q4628",
    "FR": "Q142", "GB": "Q145", "GR": "Q41", "HR": "Q224", "HU": "Q28",
    "IE": "Q27", "IS": "Q189", "IT": "Q38", "LI": "Q347", "LT": "Q37",
    "LU": "Q32", "LV": "Q211", "MC": "Q235", "MD": "Q217", "ME": "Q236",
    "MK": "Q221", "MT": "Q233", "NL": "Q55", "NO": "Q20", "PL": "Q36",
    "PT": "Q45", "RO": "Q218", "RS": "Q403", "SE": "Q34", "SI": "Q215",
    "SK": "Q214", "SM": "Q238", "XK": "Q1246",
}

WD_QUERY = """
SELECT ?x ?xLabel ?local ?lat ?lon ?img ?commons ?sl ?admLabel ?typeLabel
       ?len ?enwiki ?localwiki ?protLabel ?partLabel WHERE {
  ?x wdt:P31/wdt:P279* wd:Q40080 ; wdt:P17 wd:%(qid)s ; wdt:P31 ?type .
  ?x p:P625/psv:P625 ?co .
  ?co wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  ?x wikibase:sitelinks ?sl .
  OPTIONAL { ?x rdfs:label ?local FILTER(LANG(?local) = "%(lang)s") }
  OPTIONAL { ?x wdt:P18 ?img }
  OPTIONAL { ?x wdt:P373 ?commons }
  OPTIONAL { ?x wdt:P131 ?adm }
  OPTIONAL { ?x wdt:P2043 ?len }
  OPTIONAL { ?x wdt:P3018 ?prot }
  OPTIONAL { ?x wdt:P361 ?part }
  OPTIONAL { ?enwiki schema:about ?x ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?localwiki schema:about ?x ;
             schema:isPartOf <https://%(lang)s.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,%(lang)s". }
}
"""

# Named beaches only. An unnamed polygon cannot be listed, cannot be searched
# for and cannot be described, and there are hundreds of thousands of them.
#
# natural=beach only, deliberately. leisure=beach_resort was in this list for
# one run and brought back hotel chains ("Azul Beach Resort") mapped on their
# own grounds: the tag means "managed bathing place" to some mappers and "the
# resort that owns it" to others, and a list that promises beaches cannot
# afford the second reading.
OSM_QUERY = """
[out:json][timeout:%(timeout)d];
area["ISO3166-1"="%(cc)s"][admin_level=2]->.a;
(
  node["natural"="beach"]["name"](area.a);
  way["natural"="beach"]["name"](area.a);
  relation["natural"="beach"]["name"](area.a);
);
out tags center;
"""


# Scripts that are not Latin, spelled in Latin.
#
# fold() ends by deleting everything outside [a-z0-9 ], which for a name
# written in Greek or Cyrillic deletes the whole name. That is not a cosmetic
# problem: name_tokens() is built on fold(), the export's name test is built
# on name_tokens(), and the name test is a HARD gate on both tiers. So every
# beach whose name is written in its own alphabet was silently unpublishable.
# Measured over the harvest: 1,850 beaches, including 1,228 in Greece, which
# is 37 per cent of the country, and 74 per cent of Bulgaria.
#
# The tables are deliberately plain. This is not transliteration for a reader,
# it is a comparison key: it has to be stable and consistent, not beautiful,
# and nothing built on it is ever shown on screen. The row keeps its real
# name; only the key is folded.
_GREEK = {
    "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i",
    "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x",
    "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "y",
    "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o",
}
_CYRILLIC = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sht", "ъ": "a",
    "ь": "", "ю": "yu", "я": "ya", "ы": "y", "э": "e",
    # Serbian, Macedonian and Ukrainian letters the Russian table has not got
    "ђ": "dj", "ј": "j", "љ": "lj", "њ": "nj", "ћ": "c", "џ": "dz",
    "ѓ": "g", "ќ": "k", "ѕ": "dz", "і": "i", "ї": "i", "є": "ie", "ґ": "g",
}
_TRANSLIT = {**_GREEK, **_CYRILLIC}


def fold(name):
    """Accent folded, lowercase, punctuation free, and Latin.

    The same fold the rest of the pipeline uses, including the l-with-stroke
    case that NFKD misses, plus Greek and Cyrillic spelled into Latin so a
    name written in its own alphabet still has tokens to compare."""
    text = unicodedata.normalize("NFKD", (name or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("ł", "l").replace("ß", "ss")
    if any(c in _TRANSLIT for c in text):
        text = "".join(_TRANSLIT.get(c, c) for c in text)
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


# Words that say "beach" in the languages we harvest. Stripped before the name
# comparison so "Praia da Marinha" and "Marinha" are one beach, and so a name
# that is nothing BUT the generic word ("Plaza", "Spiaggia") never matches
# every other beach in the bay on its only token.
GENERIC = {
    "beach", "beaches", "strand", "strandbad", "playa", "platja", "praia",
    "plage", "spiaggia", "lido", "plaza", "plaz", "plaza", "pla", "paralia",
    "parolia", "ranta", "strand", "stranden", "sandur", "kust", "bagno",
    "cala", "caleta", "calanque", "bahia", "baia", "bay", "cove", "beachresort",
    "strandbad", "badestrand", "playas", "praias", "spiagge", "plages",
    "strandje", "strandjes", "beachclub", "plazha", "plazhi", "plaja",
    "pludmale", "paplūdimys", "papludimys", "uimaranta", "badeplass",
    "strandbad", "de", "da", "do", "del", "della", "di", "la", "le", "el",
    "los", "las", "the", "of", "van", "der", "den", "et", "und", "and",
    # The words the widened harvest brought in, and the ones the Greek and
    # Cyrillic transliteration made visible for the first time. Without these
    # every Estonian beach shares the token "rand" and merges with its
    # neighbours, and every Greek one shares "paralia".
    "rand", "rannad", "randa", "badstrand", "sandstrand", "havsbad",
    "badeplassen", "badestelle", "badesee", "strandbader", "strond",
    "ramla", "bajja", "uvala", "luka", "plazhut", "plazh", "plaj",
    "see", "sjo", "jarvi", "meri", "more", "mare", "kupaliste",
    "spiaggia", "spiagge", "marina", "camping", "campingplatz",
    "akti", "ormos", "kolpos", "nisi",
}


def name_tokens(name):
    return {t for t in fold(name).split() if t and t not in GENERIC and len(t) > 2}


def same_beach(a_name, b_name):
    """True when two names denote the same beach once the generic words are
    gone. Either token set being empty means the name carried no distinctive
    word at all, and guessing on nothing is exactly the wrong call."""
    ta, tb = name_tokens(a_name), name_tokens(b_name)
    if not ta or not tb:
        return False
    return bool(ta & tb)


# ---------------------------------------------------------------------------
# Wikidata
# ---------------------------------------------------------------------------

def wikidata_beaches(cc):
    qid = COUNTRY_QID.get(cc)
    if not qid:
        return []
    lang = LOCAL_LANG.get(cc, "en")
    rows = sparql(WD_QUERY % {"qid": qid, "lang": lang})
    out = {}
    for row in rows:
        item = cell(row, "x", "").rsplit("/", 1)[-1]
        if not item:
            continue
        lat, lon = cell(row, "lat"), cell(row, "lon")
        if lat is None or lon is None:
            continue
        rec = out.get(item)
        if rec is None:
            rec = {
                "wd": item,
                "name": cell(row, "xLabel") or "",
                "name_local": cell(row, "local") or "",
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "iso2": cc,
                "adm": cell(row, "admLabel") or "",
                "types": [],
                "sitelinks": int(cell(row, "sl", 0) or 0),
                "wd_img": cell(row, "img") or "",
                "commons_cat": cell(row, "commons") or "",
                "enwiki": cell(row, "enwiki") or "",
                "localwiki": cell(row, "localwiki") or "",
                "length_m": None,
                "protected": [],
                "part_of": [],
            }
            out[item] = rec
        # The OPTIONALs multiply the rows out; fold the extra values back in.
        for key, field in (("typeLabel", "types"), ("protLabel", "protected"),
                           ("partLabel", "part_of")):
            value = cell(row, key)
            if value and not value.startswith("http") and value not in rec[field]:
                rec[field].append(value)
        length = cell(row, "len")
        if length and rec["length_m"] is None:
            try:
                rec["length_m"] = round(float(length))
            except ValueError:
                pass
    # A Wikidata "beach" with no label at all is an id, not a destination.
    return [r for r in out.values() if r["name"] and not r["name"].startswith("Q")]


# ---------------------------------------------------------------------------
# OpenStreetMap
# ---------------------------------------------------------------------------

# Spain, France and Italy have more named beaches than one Overpass query can
# assemble inside its time budget, and a query that runs out comes back empty
# rather than angry (see sources.overpass). So a country that fails as a whole
# is asked for again in tiles: same area filter, so no neighbour's beaches leak
# in, but a bounded search space per request.
TILE_DEG = 4.0
NOMINATIM = "https://nominatim.openstreetmap.org/search"

# No area filter in the tiled query, deliberately. Resolving
# area["ISO3166-1"="FR"] is itself expensive, and asking for it once per tile
# on an endpoint that is already answering 504s is what kept France failing.
# A bare bounding box is the cheapest question Overpass can be asked; the
# country filtering then happens here, against the polygons the app already
# ships (continent-app/public/country_shapes.json).
OSM_TILE_QUERY = """
[out:json][timeout:%(timeout)d];
(
  node["natural"="beach"]["name"](%(bbox)s);
  way["natural"="beach"]["name"](%(bbox)s);
  relation["natural"="beach"]["name"](%(bbox)s);
);
out tags center;
"""

SHAPES = ROOT / "continent-app" / "public" / "country_shapes.json"
# How far outside the simplified polygon a beach may still be counted. The
# shapes are drawn for a map at continent zoom, so a real beach can sit a
# little outside its own coastline in them; 0.02 degrees is about 2 km, which
# is wider than that error and narrower than any neighbouring country.
SHAPE_SLACK = 0.02
_shapes = None


def _rings_of(geometry):
    kind = (geometry or {}).get("type")
    coords = (geometry or {}).get("coordinates") or []
    if kind == "Polygon":
        return [coords]
    if kind == "MultiPolygon":
        return coords
    return []


def country_polygons(cc):
    """[[ring, ...], ...] for one country, from the app's own shape file."""
    global _shapes
    if _shapes is None:
        _shapes = {}
        try:
            raw = json.loads(SHAPES.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {"features": []}
        for feature in raw.get("features") or []:
            iso2 = ((feature.get("properties") or {}).get("iso2") or "").upper()
            if iso2:
                _shapes.setdefault(iso2, []).extend(_rings_of(feature.get("geometry")))
    return _shapes.get(cc.upper()) or []


def _in_ring(lat, lon, ring):
    """Ray casting. `ring` is [[lon, lat], ...]."""
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > lat) != (y2 > lat):
            x_at = x1 + (lat - y1) * (x2 - x1) / ((y2 - y1) or 1e-12)
            if lon < x_at:
                inside = not inside
    return inside


def in_country(lat, lon, polygons, slack=SHAPE_SLACK):
    """True when the point, or a point within `slack` of it, is inside."""
    if not polygons:
        return False
    probes = [(lat, lon)]
    if slack:
        probes += [(lat + slack, lon), (lat - slack, lon),
                   (lat, lon + slack), (lat, lon - slack)]
    for polygon in polygons:
        if not polygon:
            continue
        outer = polygon[0]
        for plat, plon in probes:
            if _in_ring(plat, plon, outer):
                return True
    return False


_bboxes = {}


def _country_bbox_from_shape(cc):
    if cc not in _bboxes:
        south = west = 1e9
        north = east = -1e9
        for polygon in country_polygons(cc):
            for lon, lat in (polygon[0] if polygon else []):
                south, north = min(south, lat), max(north, lat)
                west, east = min(west, lon), max(east, lon)
        _bboxes[cc] = None if south > north else (south, west, north, east)
    return _bboxes[cc]


def belongs_to(lat, lon, cc):
    """Whether a beach found inside a bounding box should be filed under cc.

    Inside this country's own outline is a yes. Outside it, the answer is
    still yes UNLESS the point falls inside some OTHER country's outline,
    because the shapes are a simplified continental map and they leave out
    islands: Ibiza is in none of them, and a rule of "inside my polygon or
    nowhere" would have deleted the Balearics from Spain. Only a demonstrable
    neighbour takes a beach away."""
    if in_country(lat, lon, country_polygons(cc)):
        return True
    country_polygons(cc)                       # ensures _shapes is loaded
    for other in _shapes:
        if other == cc:
            continue
        box = _country_bbox_from_shape(other)
        if not box or not (box[0] <= lat <= box[2] and box[1] <= lon <= box[3]):
            continue
        if in_country(lat, lon, _shapes[other], slack=0):
            return False
    return True


def country_bbox(cc):
    """(south, west, north, east) from Nominatim, cached on disk.

    Asked for rather than hard coded: a hand written box that is a degree
    short loses a coastline silently, and this is one call per country, once,
    ever."""
    cache = load_cache("bbox", "all") or {}
    if cc in cache:
        return tuple(cache[cc])
    params = urllib.parse.urlencode({"country": cc, "format": "json",
                                     "limit": 1, "polygon_geojson": 0})
    try:
        rows = get_json(f"{NOMINATIM}?{params}", timeout=60)
    except SourceError:
        return None
    if not rows or "boundingbox" not in rows[0]:
        return None
    south, north, west, east = (float(v) for v in rows[0]["boundingbox"])
    box = (south, west, north, east)
    cache[cc] = list(box)
    save_cache("bbox", "all", cache)
    return box


def tiles_of(box, step=TILE_DEG):
    south, west, north, east = box
    lat = south
    while lat < north:
        lon = west
        while lon < east:
            yield (lat, lon, min(lat + step, north), min(lon + step, east))
            lon += step
        lat += step


# The whole-country probe is deliberately impatient. An Overpass query that
# cannot finish burns its ENTIRE time budget before it says so, so a generous
# budget with generous retries costs half an hour per country to learn what a
# 90 second probe says once. Spain, France and Italy are always going to need
# tiles; the probe exists to find out which of the others do, cheaply.
PROBE_TIMEOUT = 90
TILE_TIMEOUT = 180


def osm_extract_rows(cc):
    """(rows, answered) out of the Geofabrik extract, or ([], False).

    This is the preferred bulk source since 03-BEACHES.md: it is local, it is
    deterministic, it carries the widened tag set and the beach lengths the
    `space` component needs, and it cannot be told a lie by a regional mirror.
    Overpass remains the fallback for a country with no extract on disk, and
    remains the only source for the 400 m context sweep in enrich."""
    try:
        import osm_extract
    except ImportError:
        return [], False
    payload = load_cache(osm_extract.STAGE, cc)
    # A cache that EXISTS and holds no rows is a complete answer: Liechtenstein
    # is landlocked and has no mapped beach, and that is not the same as
    # "nobody has scanned Liechtenstein". Conflating the two sent every empty
    # country to Overpass to be told the same thing slowly.
    if payload is None:
        return [], False
    if not payload.get("rows"):
        return [], True
    rows = []
    for row in payload["rows"]:
        rows.append({
            "osm_id": row["osm_id"],
            "name": row["name"],
            "name_local": row.get("name_local") or "",
            "name_en": row.get("name_en") or "",
            "lat": row["lat"],
            "lon": row["lon"],
            "iso2": row["iso2"],
            "tags": row.get("tags") or {},
            "osm_tag": row.get("osm_tag") or "",
            "name_src": row.get("name_src") or "osm",
            "length_m": row.get("length_m"),
            "length_src": row.get("length_src") or "",
        })
    return rows, True


def osm_beaches(cc, prefer_extract=True):
    """(rows, answered). The second half is the important one.

    Overpass refusing us for an hour and a country genuinely having no mapped
    beaches both come back as an empty list, and the difference decides
    whether the cached country is finished or half done."""
    if prefer_extract:
        rows, ok = osm_extract_rows(cc)
        if ok:
            print(f"    {cc}: {len(rows)} rows from the Geofabrik extract")
            return rows, "extract"
    try:
        elements = overpass(OSM_QUERY % {"cc": cc, "timeout": PROBE_TIMEOUT},
                            timeout=PROBE_TIMEOUT + 30, tries=1, backoff=10.0)
        return osm_rows(cc, elements), "overpass"
    except SourceError as exc:
        print(f"    {cc}: one-shot OSM query failed ({str(exc)[:70]}), tiling")
    elements, answered = osm_beaches_tiled(cc)
    return osm_rows(cc, elements), ("overpass" if answered else "")


def osm_beaches_tiled(cc, timeout=TILE_TIMEOUT):
    box = country_bbox(cc)
    if not box:
        print(f"    OSM skipped for {cc}: no bounding box")
        return [], False
    seen, out = set(), []
    answered = 0
    tiles = list(tiles_of(box))
    for n, (south, west, north, east) in enumerate(tiles, 1):
        query = OSM_TILE_QUERY % {
            "cc": cc, "timeout": timeout,
            "bbox": f"{south},{west},{north},{east}",
        }
        try:
            got = overpass(query, timeout=timeout + 30, tries=2,
                           backoff=15.0)
        except SourceError as exc:
            print(f"    {cc} tile {n}/{len(tiles)} failed: {str(exc)[:70]}")
            continue
        answered += 1
        for el in got:
            key = f"{el.get('type')}/{el.get('id')}"
            if key in seen:
                continue
            centre = el.get("center") or {}
            lat = el.get("lat", centre.get("lat"))
            lon = el.get("lon", centre.get("lon"))
            # A bounding box does not stop at a border, so the neighbours come
            # back with it. They are dropped here rather than published as
            # this country's beaches.
            if lat is None or lon is None or not belongs_to(lat, lon, cc):
                continue
            seen.add(key)
            out.append(el)
        if got:
            print(f"    {cc} tile {n}/{len(tiles)}: {len(got)} "
                  f"({len(out)} so far)")
    # Every tile has to have answered. One refused tile is a missing stretch of
    # coast, and a country missing a stretch of coast is not finished.
    return out, bool(tiles) and answered == len(tiles)


def osm_rows(cc, elements):
    out = []
    for el in elements:
        tags = el.get("tags") or {}
        name = (tags.get("name") or "").strip()
        if not name:
            continue
        centre = el.get("center") or {}
        lat = el.get("lat", centre.get("lat"))
        lon = el.get("lon", centre.get("lon"))
        if lat is None or lon is None:
            continue
        out.append({
            "osm_id": f"{el.get('type')}/{el.get('id')}",
            "name": name,
            "name_local": tags.get(f"name:{LOCAL_LANG.get(cc, 'en')}") or "",
            "name_en": tags.get("name:en") or "",
            "lat": round(float(lat), 6),
            "lon": round(float(lon), 6),
            "iso2": cc,
            "tags": {k: v for k, v in tags.items()
                     if not k.startswith("name:") and k not in ("name",)},
        })
    return out


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

class _Grid:
    """A 0.1 degree bucket index over rows, so a merge is linear.

    merge() and merge_spine() both ask "is there a row of the other list near
    this one", and both did it by scanning every row already accepted. That is
    fine at the old scale and quadratic at the new one: Spain now brings 5,939
    Wikidata rows, 5,948 OSM rows and 2,296 register sites, and the scan was
    62 million haversine calls for one country. Same answers, bucketed.

    0.1 degree is about 11 km of latitude, comfortably wider than any merge
    radius in this file, so looking at the nine cells around a point cannot
    miss a candidate."""

    STEP = 10.0            # cells per degree

    def __init__(self, rows=()):
        self.cells = {}
        for row in rows:
            self.add(row)

    @staticmethod
    def _key(lat, lon):
        return (int(lat * _Grid.STEP), int(lon * _Grid.STEP))

    def add(self, row):
        self.cells.setdefault(self._key(row["lat"], row["lon"]), []).append(row)

    def near(self, lat, lon):
        base = self._key(lat, lon)
        out = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                out.extend(self.cells.get((base[0] + dy, base[1] + dx), ()))
        return out


def merge(wd_rows, osm_rows):
    """One row per beach, Wikidata first (it carries the fame and the images),
    OSM folded into it or added on its own."""
    beaches = []
    by_qid = {}
    grid = _Grid()
    for row in wd_rows:
        rec = dict(row)
        rec["key"] = f"wd:{row['wd']}"
        rec["sources"] = ["wikidata"]
        rec["osm_id"] = ""
        rec["osm_tags"] = {}
        beaches.append(rec)
        grid.add(rec)
        by_qid[row["wd"]] = rec

    for row in osm_rows:
        tags = row["tags"]
        target = None
        # An OSM element that names its Wikidata id settles the question.
        qid = (tags.get("wikidata") or "").strip()
        if qid and qid in by_qid:
            target = by_qid[qid]
        else:
            best_km = MERGE_KM
            for rec in grid.near(row["lat"], row["lon"]):
                if rec["iso2"] != row["iso2"]:
                    continue
                km = haversine_km(rec["lat"], rec["lon"], row["lat"], row["lon"])
                if km <= best_km and (same_beach(rec["name"], row["name"])
                                      or same_beach(rec.get("name_local"),
                                                    row["name"])
                                      or same_beach(rec["name"],
                                                    row.get("name_en"))):
                    target, best_km = rec, km
        if target is not None:
            if "osm" not in target["sources"]:
                target["sources"].append("osm")
            target["osm_id"] = row["osm_id"]
            target["osm_tags"] = tags
            if not target.get("name_local"):
                target["name_local"] = row.get("name_local") or ""
            # The measured length comes from the OSM geometry and is what the
            # v2 `space` component reads. Wikidata's P2043 is kept only where
            # OSM has nothing: it carries a unit we do not read, which is how
            # "As Catedrais, 2" once meant two metres of shore.
            if row.get("length_m"):
                target["length_m"] = row["length_m"]
                target["length_src"] = row.get("length_src") or "osm"
            if row.get("osm_tag"):
                target["osm_tag"] = row["osm_tag"]
            continue
        beaches.append(_new_osm_row(row))
        grid.add(beaches[-1])
    return beaches


def _new_osm_row(row):
    tags = row["tags"]
    return {
            "key": f"osm:{row['osm_id']}",
            "wd": "",
            "name": row.get("name_en") or row["name"],
            "name_local": row["name_local"] or row["name"],
            "name_src": row.get("name_src") or "osm",
            "lat": row["lat"],
            "lon": row["lon"],
            "iso2": row["iso2"],
            "adm": "",
            "types": [],
            "sitelinks": 0,
            "wd_img": "",
            "commons_cat": "",
            "enwiki": "",
            "localwiki": "",
            "length_m": row.get("length_m"),
            "length_src": row.get("length_src") or "",
            "osm_tag": row.get("osm_tag") or "",
            "protected": [],
            "part_of": [],
            "sources": ["osm"],
            "osm_id": row["osm_id"],
            "osm_tags": tags,
    }


# ---------------------------------------------------------------------------
# The EEA bathing water register, as a third spine
# ---------------------------------------------------------------------------

def merge_spine(beaches, sites):
    """Fold the register into the catalogue: matched sites enrich, the rest
    become rows.

    A registered bathing site is a place a European government says people
    swim, with a coordinate and a decade of classifications behind it. Most of
    them are already here under an OSM or a Wikidata name, and for those the
    register is what it has always been: the water reading. The ones nothing
    else knew about are the coverage this layer was missing, and they enter as
    rows of their own.

    Matching is deliberately conservative in the same way merge() is. A site
    within MERGE_KM whose name agrees is that beach. A site within
    SAME_PLACE_KM is that beach whatever it is called, because two bathing
    points 200 m apart are two ends of one strand and publishing both would
    put the same sand on the page twice."""
    added = matched = 0
    grid = _Grid(beaches)
    for site in sites:
        target, best_km = None, eea_spine.MERGE_KM
        for rec in grid.near(site["lat"], site["lon"]):
            if rec["iso2"] != site["iso2"]:
                continue
            km = haversine_km(rec["lat"], rec["lon"], site["lat"], site["lon"])
            if km > best_km:
                continue
            if (km <= eea_spine.SAME_PLACE_KM
                    or same_beach(rec["name"], site["name"])
                    or same_beach(rec.get("name_local"), site["name"])):
                target, best_km = rec, km
        if target is not None:
            matched += 1
            if "eea" not in target["sources"]:
                target["sources"].append("eea")
            # The register's own reading, stamped at harvest so the enrich
            # stage's coordinate join never has to guess which site is this
            # beach's. A site the enrich join already found is overwritten
            # only by a NEARER one.
            existing = target.get("water") or {}
            if not existing or (existing.get("km") or 99) > best_km:
                water = dict(site["water"])
                water["km"] = round(best_km, 2)
                target["water"] = water
            continue
        added += 1
        row = {
            "key": f"eea:{site['eea_id']}",
            "wd": "",
            "name": site["name"],
            "name_local": "",
            "name_src": "eea",
            "name_registry": site.get("name_registry") or "",
            "lat": site["lat"],
            "lon": site["lon"],
            "iso2": site["iso2"],
            "adm": "",
            "types": [],
            "sitelinks": 0,
            "wd_img": "",
            "commons_cat": "",
            "enwiki": "",
            "localwiki": "",
            "length_m": None,
            "protected": [],
            "part_of": [],
            "sources": ["eea"],
            "osm_id": "",
            "osm_tags": {},
            "eea_id": site["eea_id"],
            "coastal": site["coastal"],
            "water": site["water"],
        }
        beaches.append(row)
        grid.add(row)
    return added, matched


def harvest_country(cc, use_osm=True, refresh=False, prefer_extract=True,
                    use_spine=True, reuse_wikidata=False):
    """One country's beaches, cached. Re-runs pick up an unfinished half.

    A cached country is only finished if Overpass ANSWERED for it. During an
    hour when the endpoint was refusing every request, the first version of
    this wrote "Germany: 52 beaches, 0 from OSM" and then skipped Germany on
    every later run, because a cache file existed. `osm_ok` is what makes the
    difference between "no beaches mapped here" and "nobody answered"."""
    cached = None if refresh and not reuse_wikidata else load_cache(STAGE, cc)
    if cached and not reuse_wikidata and (cached.get("osm_ok") or not use_osm):
        print(f"  {cc}: {len(cached['beaches'])} beaches (cached)")
        return cached

    if cached and reuse_wikidata:
        # The OSM source changed under us, not Wikidata. This is the switch to
        # use when the bulk pass moves from Overpass to a Geofabrik extract or
        # the extract is refreshed: the Wikidata half is already on disk and
        # re-asking the SPARQL endpoint 43 times to learn what it already told
        # us is rude and slow. Same merge, same output, no query.
        print(f"  {cc}: reusing {len(cached['beaches'])} cached Wikidata rows")
        wd_rows = []
        for beach in cached["beaches"]:
            if not beach.get("wd"):
                continue
            row = dict(beach)
            for field in ("sources", "osm_id", "osm_tags", "key", "water",
                          "osm_tag", "length_src", "name_src", "coastal"):
                row.pop(field, None)
            wd_rows.append(row)
    elif cached:
        # Wikidata already answered for this country, so only the OSM half is
        # outstanding: reuse those rows rather than spend the SPARQL query
        # again. The merge fields are stripped so the merge can redo them.
        print(f"  {cc}: cached without OSM, retrying Overpass only")
        wd_rows = []
        for beach in cached["beaches"]:
            if not beach.get("wd"):
                continue
            row = dict(beach)
            for field in ("sources", "osm_id", "osm_tags", "key"):
                row.pop(field, None)
            wd_rows.append(row)
    else:
        print(f"  {cc}: querying Wikidata")
        try:
            wd_rows = wikidata_beaches(cc)
        except SourceError as exc:
            print(f"    Wikidata failed for {cc}: {exc}")
            wd_rows = []

    # --no-osm leaves the OSM half OUTSTANDING rather than done, so a later
    # full run still fills it in instead of treating the country as finished.
    found, osm_ok = [], False
    if use_osm:
        found, osm_ok = osm_beaches(cc, prefer_extract=prefer_extract)

    # A failed retry must never be written over a cache that already holds
    # beaches. The first version of this kept only the Wikidata rows while
    # retrying, so an hour when Overpass was down turned Albania's 141 beaches
    # into 10 and called it a harvest. Nothing replaces something.
    cached_osm = len([b for b in (cached or {}).get("beaches", [])
                      if "osm" in (b.get("sources") or [])])
    # The guard below exists because Overpass lies: a timed-out query and a
    # lying mirror both answer "no beaches here" with a straight face, and
    # believing either turns Albania's 141 beaches into 10.
    #
    # A Geofabrik extract cannot lie in that way. It is a file on disk, the
    # scan is deterministic, and an empty answer means the country genuinely
    # has no mapped beach. San Marino is landlocked and its correct row count
    # is zero; under the unconditional guard it kept 2,415 Italian beaches
    # that a bad country filter had given it, because "nothing replaces
    # something" outranked a correct answer.
    trustworthy_empty = (osm_ok == "extract")
    if (cached and use_osm and not trustworthy_empty
            and (not osm_ok or (not found and cached_osm))):
        # Either nobody answered, or somebody answered "nothing" for a country
        # we already hold beaches for. The second case is how a regional mirror
        # lies: overpass.osm.ch returned a clean empty result for Austria and
        # turned 74 beaches into 6 before the pattern showed.
        print(f"  {cc}: no usable OSM answer, keeping the cached "
              f"{len(cached['beaches'])} beaches")
        return cached

    beaches = merge(wd_rows, found)
    spine_added = spine_matched = 0
    if use_spine:
        sites = eea_spine.candidate_rows(cc)
        if sites:
            spine_added, spine_matched = merge_spine(beaches, sites)
    payload = {
        "country": cc,
        "harvested_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_wikidata": len(wd_rows),
        "n_osm": len(found),
        "n_eea": spine_added + spine_matched,
        "n_eea_new": spine_added,
        # False means Overpass never answered; the next run retries this half.
        "osm_ok": bool(osm_ok),
        "beaches": beaches,
    }
    save_cache(STAGE, cc, payload)
    both = sum(1 for b in beaches if len(b["sources"]) > 1)
    outstanding = ("" if osm_ok
                   else " [OSM half outstanding, a later run fills it in]")
    spine_note = (f", {spine_added} new + {spine_matched} matched from the "
                  f"bathing register" if (spine_added or spine_matched) else "")
    print(f"  {cc}: {len(beaches)} beaches "
          f"({len(wd_rows)} wikidata, {len(found)} osm, {both} merged"
          f"{spine_note}){outstanding}")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="",
                        help="comma separated ISO2 (default: every country)")
    parser.add_argument("--refresh", action="store_true",
                        help="re-query even when a country is cached")
    parser.add_argument("--no-osm", action="store_true",
                        help="Wikidata only, for a quick pass")
    parser.add_argument("--overpass", action="store_true",
                        help="take the OSM half from Overpass rather than "
                             "from the Geofabrik extract. The extract is the "
                             "default since 03-BEACHES.md: it is local, it "
                             "carries the widened tag set and the beach "
                             "lengths, and it cannot time out.")
    parser.add_argument("--reuse-wikidata", action="store_true",
                        help="re-merge from the cached Wikidata rows instead "
                             "of re-querying SPARQL. Use this when the OSM "
                             "half changed and Wikidata did not, which is "
                             "what moving the bulk pass onto the Geofabrik "
                             "extracts is.")
    parser.add_argument("--no-spine", action="store_true",
                        help="skip the EEA bathing water register, which is "
                             "otherwise merged in as a third source")
    parser.add_argument("--reverse", action="store_true",
                        help="work the country list from the end, so a second "
                             "process on another Overpass mirror can meet this "
                             "one in the middle")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES
    if args.reverse:
        countries = list(reversed(countries))
    total = 0
    for cc in countries:
        try:
            payload = harvest_country(cc, use_osm=not args.no_osm,
                                      refresh=args.refresh,
                                      prefer_extract=not args.overpass,
                                      use_spine=not args.no_spine,
                                      reuse_wikidata=args.reuse_wikidata)
            total += len(payload["beaches"])
        except KeyboardInterrupt:
            raise
        except Exception as exc:                      # one country, not the run
            print(f"  {cc}: failed ({exc})")
    print(f"[beaches] {total} named beaches across {len(countries)} countries")


if __name__ == "__main__":
    main()
