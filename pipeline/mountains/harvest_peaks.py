"""Stage 1 of the mountain layer: find the summits worth ranking.

Europe has a lot of mountains. Wikidata alone types 247,164 of them inside the
43 countries this app prices, and Norway is 171,183 of that on its own, almost
all of them an unnamed 600 m bump above a fjord. Sweeping any of that live
would spend hours to bring back a haystack the ranking then throws away.

So this stage does not sweep. It reads a spine that is already on disk, adds
the two things that spine cannot know, and cuts to a shortlist.

  the spine is already harvested.  cache/features_wikidata.json holds every
        Wikidata mountain, summit and volcano in these countries with its
        coordinate, elevation, prominence, sitelink count and P18 image,
        pulled country by country and tile by tile in an earlier build. It is
        CC0, it is the population a "best mountains" list is drawn from, and
        re-querying it would cost hours to arrive at the same rows.
  the seed is pinned.  seed_peaks.py names the mountains travel writing names,
        including the lift-served viewpoints that are nobody's highest and
        nobody's most prominent, and the high points of the countries where
        height is the wrong question. Anything the spine missed is resolved
        here by entity search and force included.
  high points fill the flat countries.  Wikidata records P610 (highest point)
        on countries, provinces and counties. One cheap query per country
        turns that into exactly the list the brief asks lowland countries to
        be filled from, and it is how the Netherlands gets an answer at all:
        the spine has no Dutch rows, because a 322 m road junction is typed as
        a hill rather than a mountain.
  thin countries get the hill class as well.  Below THIN_POOL rows a country
        also gets a bounded hill and volcano pass, which is affordable exactly
        where the country is small.

Then a pre score cuts each country to SHORTLIST rows. That is the population
enrich_peaks.py spends network calls on, and the cut is deliberate: the
photographs and the Overpass context cost about a second each, so ranking
everything would cost a week to publish sixty rows a country.

Idempotent and resumable, one cache file per country
(cache/mountains/raw_CC.json), so a re-run costs nothing and a crash costs one
country. Re-harvest with --refresh.

Usage, from the repo root:
    python pipeline/mountains/harvest_peaks.py                 # every country
    python pipeline/mountains/harvest_peaks.py --countries CH,AT
    python pipeline/mountains/harvest_peaks.py --countries IT --refresh

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import re
import sys
import unicodedata
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from peak_sources import (SourceError, cell, get_json,  # noqa: E402
                          haversine_km, load_cache, save_cache, sparql)
import seed_peaks  # noqa: E402

ROOT = HERE.parents[1]

STAGE = "raw"

# The already harvested Wikidata spine. Read only: this layer never writes to
# it, so a features rebuild and a mountains rebuild cannot corrupt each other.
SPINE = ROOT / "cache" / "features_wikidata.json"

# The 43 countries the catalogue prices. Which ones appear in the app is
# decided by what they actually have, never by a hand kept list.
COUNTRIES = [
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "UA", "XK",
]
# 44 with Ukraine, which is the count brief 05 targets and the country the
# trails layer already curates (Hoverla, Chornohora, the Transcarpathian
# ridges). It has no rows in cache/features_wikidata.json, so it is harvested
# the way every thin country is: the P610 high points, the hill and volcano
# pass, and the OSM spine.

LOCAL_LANG = {
    "AL": "sq", "AT": "de", "BA": "bs", "BE": "nl", "BG": "bg", "CH": "de",
    "CY": "el", "CZ": "cs", "DE": "de", "DK": "da", "EE": "et", "ES": "es",
    "FI": "fi", "FO": "fo", "FR": "fr", "GR": "el", "HR": "hr", "HU": "hu",
    "IS": "is", "IT": "it", "LT": "lt", "LV": "lv", "MC": "fr", "MD": "ro",
    "ME": "sr", "MK": "mk", "MT": "mt", "NL": "nl", "NO": "no", "PL": "pl",
    "PT": "pt", "RO": "ro", "RS": "sr", "SE": "sv", "SI": "sl", "SK": "sk",
    "XK": "sq", "SM": "it", "LI": "de", "LU": "fr", "AD": "ca", "IE": "en",
    "GB": "en", "UA": "uk",
}

COUNTRY_QID = {
    "AD": "Q228", "AL": "Q222", "AT": "Q40", "BA": "Q225", "BE": "Q31",
    "BG": "Q219", "CH": "Q39", "CY": "Q229", "CZ": "Q213", "DE": "Q183",
    "DK": "Q35", "EE": "Q191", "ES": "Q29", "FI": "Q33", "FO": "Q4628",
    "FR": "Q142", "GB": "Q145", "GR": "Q41", "HR": "Q224", "HU": "Q28",
    "IE": "Q27", "IS": "Q189", "IT": "Q38", "LI": "Q347", "LT": "Q37",
    "LU": "Q32", "LV": "Q211", "MC": "Q235", "MD": "Q217", "ME": "Q236",
    "MK": "Q221", "MT": "Q233", "NL": "Q55", "NO": "Q20", "PL": "Q36",
    "PT": "Q45", "RO": "Q218", "RS": "Q403", "SE": "Q34", "SI": "Q215",
    "SK": "Q214", "SM": "Q238", "UA": "Q212", "XK": "Q1246",
}

# English country names, used ONLY to qualify a seed search term. Nothing is
# published from this table.
COUNTRY_NAME = {
    "AD": "Andorra", "AL": "Albania", "AT": "Austria",
    "BA": "Bosnia and Herzegovina", "BE": "Belgium", "BG": "Bulgaria",
    "CH": "Switzerland", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DK": "Denmark", "EE": "Estonia", "ES": "Spain", "FI": "Finland",
    "FO": "Faroe Islands", "FR": "France", "GB": "United Kingdom",
    "GR": "Greece", "HR": "Croatia", "HU": "Hungary", "IE": "Ireland",
    "IS": "Iceland", "IT": "Italy", "LI": "Liechtenstein", "LT": "Lithuania",
    "LU": "Luxembourg", "LV": "Latvia", "MC": "Monaco", "MD": "Moldova",
    "ME": "Montenegro", "MK": "North Macedonia", "MT": "Malta",
    "NL": "Netherlands", "NO": "Norway", "PL": "Poland", "PT": "Portugal",
    "RO": "Romania", "RS": "Serbia", "SE": "Sweden", "SI": "Slovenia",
    "SK": "Slovakia", "SM": "San Marino", "UA": "Ukraine",
    "XK": "Kosovo",
}

WD_API = "https://www.wikidata.org/w/api.php"

# What the label service is asked for, in order.
#
# "en" alone is not enough and the failure is silent: Wikidata's label service
# answers with the bare item id when the item has no label in the language
# asked for, and Moens Klint, the most photographed cliff in Denmark, carries
# labels in twelve languages of which neither English nor Danish is one. That
# published a mountain called "Q1517331". The list runs through the languages
# this app speaks and then the larger European ones, which between them cover
# anything a European landform is likely to be labelled in.
LABEL_LANGS = ("en,de,fr,es,it,nl,da,nb,sv,fi,pl,cs,pt,el,hu,ro,hr,sl,"
              "sk,et,lv,lt,uk")

# How many rows per country reach the enrich stage.
#
# 110 in v1, and 110 was the coverage cap wearing a shortlist's clothes: the
# export could never publish more than the harvest shortlisted, so "the best
# 110 mountains in Norway" was the ceiling on a country with 100,526 in the
# pool. v2 targets ~4,500 rated and ~3,000 listed rows over 44 countries,
# which is ~170 published per country, and no gate can publish 170 rows out
# of 110 candidates.
#
# 500 is what the region quota needs to have something to choose between in
# every range, and it is affordable because the harvest itself is a local
# read: the cost lands in enrich (ENRICH_TOP), which is separately capped and
# separately resumable.
SHORTLIST = 500

# Below this many spine rows a country also gets the hill and volcano pass.
# Deliberately generous: the pass is cheap exactly where the country is small.
THIN_POOL = 900

# The window the rest of the catalogue calls Europe: west of the Azores, east
# of the Urals' foot, south of the Canaries, north of Nordkapp. It exists
# because "the highest point of the Netherlands" is Mount Scenery on Saba, an
# 870 m volcano in the Caribbean, and a Dutch traveller looking at the
# Mountains tab does not mean that. Same for the French and Portuguese
# overseas territories. Madeira, the Azores and the Canaries are INSIDE the
# window on purpose: the app prices them.
WINDOW = (-32.0, 26.0, 46.0, 72.0)          # W, S, E, N


def in_europe(row):
    w, s, e, n = WINDOW
    return w <= row["lon"] <= e and s <= row["lat"] <= n


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------

# Letters NFKD does not decompose, because they are letters in their own right
# rather than a base plus a mark. Same table as the lake layer, and it earns
# its place again here: the seed spells the Norwegian summits Galdhopiggen and
# Snohetta in ASCII and Wikidata spells them with o-slash, and without this
# the fold turns the slash into a space and the two names share no token.
UNDECOMPOSED = {
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe",
    "ł": "l", "Ł": "l", "ß": "ss", "đ": "d", "Đ": "d", "ð": "d", "Ð": "d",
    "þ": "th", "Þ": "th", "ı": "i", "ħ": "h", "ŋ": "n", "ɫ": "l",
}


def fold(name):
    """Accent folded, lowercase, punctuation free."""
    text = unicodedata.normalize("NFKD", (name or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(UNDECOMPOSED.get(c, c) for c in text)
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


# The word for "mountain" in the languages this layer harvests, plus the
# articles that glue names together. Stripped before any name comparison, so
# "Monte Titano" and "Titano" are one mountain, and so a name that is nothing
# BUT the generic word never matches every other summit in the range on its
# only token. "Pic", "Piz", "Puy" and "Ben" are in here for that reason: half
# the Pyrenees is a Pic something.
GENERIC = {
    "mount", "mountain", "mountains", "mt", "peak", "peaks", "summit", "hill",
    "hills", "ridge", "rock", "rocks", "cliff", "cliffs", "crag", "massif",
    "range", "volcano", "berg", "berge", "spitze", "spitz", "kogel", "kopf",
    "horn", "alm", "alpe", "alp", "alps", "alpen", "gipfel", "wand", "stein",
    "monte", "montagna", "monti", "cima", "cime", "punta", "corno", "sasso",
    "pizzo", "piz", "mont", "montagne", "pic", "puy", "aiguille", "aiguilles",
    "roc", "roche", "rocher", "rochers", "dent", "dents", "col", "pico",
    "picos", "sierra", "serra", "cerro", "pena", "penya", "monta", "montana",
    "vrh", "vrv", "planina", "gora", "hora", "kopec", "szczyt", "gory",
    "hegy", "varf", "varful", "muntele", "maja", "mali", "mal", "bjeshka",
    "tunturi", "vaara", "fjell", "fjellet", "fjall", "fjallet", "tind",
    "tinden", "topp", "toppen", "nut", "nuten", "aksla", "kollen", "haugen",
    "bjerg", "bakke", "hoj", "kalns", "kalnas", "magi", "mag", "vuori",
    "beinn", "ben", "sgurr", "creag", "carn", "cnoc", "slieve", "sliabh",
    "yr", "moel", "mynydd", "crib", "vulkan", "jokull", "fell", "fjall",
    "the", "of", "de", "del", "della", "di", "du", "des", "la", "le", "les",
    "el", "los", "las", "van", "der", "den", "und", "and", "et", "am", "im",
    "sur", "auf", "at", "in", "on", "sankt", "st", "sveti", "svaty",
    # Numbers and size words, which are not names however distinctive they
    # look. "Tre Cime di Lavaredo" keeps the tokens {tre, lavaredo} without
    # this, and "tre" is Italian for three: it matched Punta dei Tre Scarperi
    # 8 km away and pinned the Dolomites' most famous silhouette onto the
    # wrong mountain.
    "tre", "due", "quattro", "cinque", "sette", "drei", "zwei", "vier",
    "funf", "sieben", "trois", "deux", "quatre", "cinq", "sept", "tres",
    "dos", "cuatro", "cinco", "two", "three", "four", "five", "seven",
    "grand", "grande", "grands", "grandes", "gross", "grosse", "grosser",
    "klein", "kleine", "kleiner", "piccolo", "piccola", "petit", "petite",
    "alt", "alte", "alter", "neu", "neue", "neuer", "vieux", "vecchio",
    "hoch", "hohe", "hoher", "hohen", "high", "low", "big", "little",
    "north", "south", "east", "west", "nord", "sud", "est", "ouest",
    "ovest", "norte", "sur", "este", "oeste", "sever", "jug", "vzhod",
    "obere", "untere", "ober", "unter", "vorder", "hinter", "mittel",
}


def name_tokens(name):
    return {t for t in fold(name).split() if t and t not in GENERIC and len(t) > 2}


def same_peak(a_name, b_name):
    """True when two names denote the same mountain once the generic words are
    gone. An empty token set on either side means the name carried no
    distinctive word at all, and guessing on nothing is exactly wrong."""
    ta, tb = name_tokens(a_name), name_tokens(b_name)
    if not ta or not tb:
        return False
    return bool(ta & tb)


def qid_of(url):
    return str(url or "").rsplit("/", 1)[-1]


# ---------------------------------------------------------------------------
# The spine, read once
# ---------------------------------------------------------------------------

_spine = None


def load_spine():
    """cache/features_wikidata.json, loaded once per process.

    35 MB of JSON and about four seconds. Read once and shared, because a 43
    country run would otherwise pay that 43 times."""
    global _spine
    if _spine is None:
        if not SPINE.exists():
            raise SourceError(f"no Wikidata spine at {SPINE}. Run the features "
                              f"harvest, or pass --no-spine to work from the "
                              f"seed and the high points alone.")
        _spine = json.loads(SPINE.read_text(encoding="utf-8"))
    return _spine


def spine_rows(cc):
    """Every mountain row the spine holds for one country, deduplicated.

    The spine is tiled: a country is one `CC|mountain|country` entry plus, for
    the big ones, a stack of bbox tiles that were split when the country query
    hit the result cap. Every tile carries the same row shape, so the merge is
    a dictionary keyed on the Wikidata id."""
    tiles = (load_spine().get("tiles") or {})
    out = {}
    for key, tile in tiles.items():
        parts = key.split("|")
        if len(parts) != 3 or parts[0] != cc or parts[1] != "mountain":
            continue
        for row in tile.get("rows") or []:
            qid = row.get("q")
            if not qid or qid in out:
                continue
            out[qid] = row
    return list(out.values())


def row_key(row):
    """The identity of a row inside one country's caches.

    Wikidata's Q number where there is one, and the OSM element id where
    there is not. The second half is new in v2: the OSM spine contributes
    named summits, ridges and cliffs that Wikidata has never heard of, and
    every stage downstream keyed its dictionaries on `wd`, which for those
    rows is None. One None key per country means one summit per country
    survives the Overpass sweep, which is the kind of bug that looks like a
    thin answer rather than like a crash."""
    return row.get("wd") or (f"osm:{row['oid']}" if row.get("oid") else "")


def as_row(raw, cc):
    """One spine row in this layer's shape."""
    names = raw.get("names") or {}
    lang = LOCAL_LANG.get(cc, "en")
    name = raw.get("en") or names.get("en") or names.get(lang) or ""
    local = names.get(lang) or ""
    lat, lon = raw.get("lat"), raw.get("lon")
    if name == "" or lat is None or lon is None:
        return None
    return {
        "wd": raw.get("q"),
        "name": name,
        "name_local": local,
        "names": names,
        "lat": float(lat),
        "lon": float(lon),
        "ele": raw.get("ele"),
        "prom": raw.get("prom"),
        "wd_img": raw.get("img") or "",
        "sitelinks": raw.get("sl") or 0,
        "cls": raw.get("cls") or [],
        "cc": cc,
        # Where this row came from, so a later reader can audit the pool
        # rather than guess. spine | highpoint | hill | seed-search.
        "src": "spine",
        "sources": ["wikidata-cc0"],
    }


# ---------------------------------------------------------------------------
# The two live passes: high points, and the hill class for thin countries
# ---------------------------------------------------------------------------

# Deliberately thin, and the optimizer hint is not decoration.
#
# The obvious form of this query asks for the coordinate, the elevation and
# the labels in one go. Written that way it starts from "everything in the
# Netherlands", which is several hundred thousand items, and joins P610 to
# that: it ran for over two minutes and was still going. Turning the
# optimizer off makes Blazegraph honour the written order, so it starts from
# the 50,000 P610 statements in the whole database instead, and the same
# question answers in ten seconds. The measurements come afterwards, from
# entities_for(), which is an id lookup.
HIGHPOINT_QUERY = """
SELECT ?item ?ofLabel WHERE {
  hint:Query hint:optimizer "None".
  { ?of wdt:P610 ?item . ?of wdt:P17 wd:%(country)s . }
  UNION
  { wd:%(country)s wdt:P610 ?item . BIND(wd:%(country)s AS ?of) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%(labels)s". }
}
LIMIT 400
"""

HILL_QUERY = """
SELECT ?item ?itemLabel ?localLabel ?loc ?ele ?sl ?img WHERE {
  VALUES ?class { wd:Q54050 wd:Q8072 wd:Q207326 wd:Q8502 }
  ?item wdt:P31 ?class ;
        wdt:P17 wd:%(country)s ;
        wdt:P625 ?loc .
  OPTIONAL { ?item wdt:P2044 ?ele }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
  OPTIONAL { ?item rdfs:label ?localLabel FILTER(LANG(?localLabel) = "%(lang)s") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%(labels)s". }
}
LIMIT 900
"""

POINT_RE = re.compile(r"Point\(([-0-9.]+) ([-0-9.]+)\)")


def _point(text):
    hit = POINT_RE.search(text or "")
    return (float(hit.group(2)), float(hit.group(1))) if hit else (None, None)


def _commons_name(url):
    text = str(url or "")
    if "Special:FilePath/" in text:
        text = text.split("Special:FilePath/", 1)[1]
    return urllib.parse.unquote(text).replace("_", " ").strip()


def highpoint_rows(cc):
    """The mountains Wikidata records as the highest point of this country or
    of any of its provinces, counties and regions.

    This is the brief's lowland rule, implemented from open data rather than
    from opinion: in the Netherlands, Denmark and the Baltics the interesting
    high ground is exactly the set of administrative high points, and nothing
    else in the machine's vocabulary finds it."""
    try:
        rows = sparql(HIGHPOINT_QUERY % {"country": COUNTRY_QID[cc],
                                  "labels": LABEL_LANGS})
    except (SourceError, ValueError, KeyError) as exc:
        print(f"    high point pass declined ({str(exc)[:90]})")
        return []
    of_label = {}
    for row in rows:
        qid = qid_of(cell(row, "item"))
        if qid and qid.startswith("Q"):
            of_label.setdefault(qid, cell(row, "ofLabel") or "")
    out = []
    qids = list(of_label)
    for i in range(0, len(qids), 70):
        for row in entities_for(qids[i:i + 70], cc):
            row["highpoint_of"] = of_label.get(row["wd"], "")
            row["src"] = "highpoint"
            out.append(row)
    return out


def query_rows(query, cc, tag):
    """One bounded SPARQL pass, in this layer's row shape. A failure is
    reported and returns nothing: a country that loses a pass still publishes
    what its other passes found."""
    lang = LOCAL_LANG.get(cc, "en")
    try:
        rows = sparql(query % {"country": COUNTRY_QID[cc], "lang": lang,
                               "labels": LABEL_LANGS})
    except (SourceError, ValueError, KeyError) as exc:
        print(f"    {tag} pass declined ({str(exc)[:90]})")
        return []
    out = []
    for row in rows:
        qid = qid_of(cell(row, "item"))
        lat, lon = _point(cell(row, "loc"))
        name = cell(row, "itemLabel") or ""
        if not qid or lat is None or not name or name.startswith("Q"):
            continue
        ele = cell(row, "ele")
        try:
            ele = float(ele) if ele not in (None, "") else None
        except ValueError:
            ele = None
        out.append({
            "wd": qid,
            "name": name,
            "name_local": cell(row, "localLabel") or "",
            "names": {},
            "lat": lat,
            "lon": lon,
            "ele": ele,
            "prom": None,
            "wd_img": _commons_name(cell(row, "img")),
            "sitelinks": int(cell(row, "sl") or 0),
            "cls": [],
            "cc": cc,
            "src": "hill",
            "sources": ["wikidata-cc0"],
            "highpoint_of": cell(row, "ofLabel") or "",
        })
    return out


# ---------------------------------------------------------------------------
# The seed
# ---------------------------------------------------------------------------

SEED_NEAR_KM = 25.0
# A massif, a range or a plateau is named over tens of kilometres, and the
# item Wikidata holds for it can sit anywhere inside that. The hint stays a
# hint, so these get a wider circle rather than an exemption.
WIDE_KINDS = ("massif", "ridge", "plateau", "range")
SEED_NEAR_KM_WIDE = 60.0


def seed_radius(entry):
    return SEED_NEAR_KM_WIDE if entry.get("kind") in WIDE_KINDS else SEED_NEAR_KM


def search_wikidata(term, limit=8):
    """wbsearchentities, which is an index lookup rather than a query.

    Used only for seeded entries the spine missed, which is a few dozen calls
    in a whole build. A SPARQL label match would be tidier to write and about
    a hundred times slower to run."""
    params = urllib.parse.urlencode({
        "action": "wbsearchentities", "search": term, "language": "en",
        "uselang": "en", "type": "item", "limit": limit, "format": "json",
    })
    try:
        data = get_json(f"{WD_API}?{params}", timeout=60)
    except (SourceError, ValueError):
        return []
    return [hit["id"] for hit in (data.get("search") or []) if hit.get("id")]


ENTITY_QUERY = """
SELECT ?item ?itemLabel ?localLabel ?loc ?ele ?prom ?sl ?img WHERE {
  VALUES ?item { %(items)s }
  ?item wdt:P625 ?loc .
  OPTIONAL { ?item wdt:P2044 ?ele }
  OPTIONAL { ?item wdt:P2660 ?prom }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
  OPTIONAL { ?item rdfs:label ?localLabel FILTER(LANG(?localLabel) = "%(lang)s") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "%(labels)s". }
}
"""


def entities_for(qids, cc):
    """Coordinates and measurements for a handful of ids, in row shape."""
    if not qids:
        return []
    lang = LOCAL_LANG.get(cc, "en")
    values = " ".join(f"wd:{q}" for q in qids)
    try:
        rows = sparql(ENTITY_QUERY % {"items": values, "lang": lang,
                                      "labels": LABEL_LANGS})
    except (SourceError, ValueError):
        return []
    out = []
    for row in rows:
        qid = qid_of(cell(row, "item"))
        lat, lon = _point(cell(row, "loc"))
        name = cell(row, "itemLabel") or ""
        local = cell(row, "localLabel") or ""
        # The label service answers with the ID itself when the item has no
        # label in the language asked for, and an item pinned by `wd` skips
        # every other name check, so "Q1517331" was published as the name of
        # Denmark's most famous cliff. The local label is the fallback, and
        # with neither there is no row worth keeping.
        if name.startswith("Q") and name[1:].isdigit():
            name = local
        if not qid or lat is None or not name:
            continue

        def num(key):
            value = cell(row, key)
            try:
                return float(value) if value not in (None, "") else None
            except ValueError:
                return None

        out.append({
            "wd": qid,
            "name": name,
            "name_local": local,
            "names": {},
            "lat": lat,
            "lon": lon,
            "ele": num("ele"),
            "prom": num("prom"),
            "wd_img": _commons_name(cell(row, "img")),
            "sitelinks": int(cell(row, "sl") or 0),
            "cls": [],
            "cc": cc,
            "sources": ["wikidata-cc0"],
        })
    return out


def seed_match(entry, rows):
    """The harvested row this seed entry names, or None.

    An explicit `wd` settles it outright. Otherwise: name first, coordinate
    second, and BOTH are required when the seed carries a hint. "Mount
    Olympus" is a real summit in Greece and in Cyprus, "Rysy" is on both sides
    of the Polish border and there are four Snowdons. A token match alone
    would put one of them under the other's photograph."""
    pinned = entry.get("wd")
    if pinned:
        for row in rows:
            if row.get("wd") == pinned:
                return row
    names = [entry["n"]] + list(entry.get("alt") or [])
    hint = (entry.get("lat"), entry.get("lon"))
    limit = seed_radius(entry)
    # Exact name first, token match second, and only then distance.
    #
    # Without the exact tier, "Jungfrau" matched "Wengen Jungfrau" 6 km away
    # and pinned Switzerland's rack railway, its hazards and its editorial
    # bonus onto the wrong item, leaving the real Jungfrau unseeded and 30th
    # in its own country. A token match is a guess; an identical name is not.
    folded_names = {fold(n) for n in names}
    best, best_km, best_rank = None, None, 0
    for row in rows:
        # Coordinate first, name second, and the order is about cost rather
        # than logic: name matching folds and tokenises two strings, and
        # Norway's pool is 171,183 rows. A hint rejects almost all of them
        # with two subtractions.
        km = None
        if hint[0] is not None:
            if abs(hint[0] - row["lat"]) > limit / 90.0:
                continue
            km = haversine_km(hint[0], hint[1], row["lat"], row["lon"])
            if km > limit:
                continue
        exact = (fold(row["name"]) in folded_names
                 or fold(row.get("name_local") or "") in folded_names)
        if not exact and not any(
                same_peak(n, row["name"]) or same_peak(n, row.get("name_local"))
                for n in names):
            continue
        rank = 2 if exact else 1
        if km is None:
            if rank == 2:
                return row
            if best_rank < rank:
                best, best_km, best_rank = row, None, rank
            continue
        if rank > best_rank or (rank == best_rank
                                and (best_km is None or km < best_km)):
            best, best_km, best_rank = row, km, rank
    return best


def resolve_seed(cc, rows):
    """Pin every seeded mountain of this country into `rows`.

    Returns (rows, resolved, missing). A seed entry that cannot be resolved is
    NOT invented: it is reported by name so somebody can look at it, because a
    row with a name and nothing else is worse than an absence."""
    entries = seed_peaks.by_country().get(cc) or []
    if not entries:
        return rows, 0, []
    by_qid = {r["wd"]: r for r in rows if r.get("wd")}
    resolved, missing = 0, []
    for entry in entries:
        hit = seed_match(entry, rows)
        if hit is None:
            # Ask Wikidata's own index, qualified by the country so "First"
            # and "Monte" mean the mountain rather than the ordinal or the word.
            terms = [entry["n"]] + list(entry.get("alt") or [])
            country = COUNTRY_NAME.get(cc, "")
            candidates = []
            for term in terms[:2]:
                candidates += search_wikidata(f"{term} {country}".strip())
                candidates += search_wikidata(term)
                if len(candidates) >= 12:
                    break
            # Only the candidate that ANSWERS the seed is kept, and that is
            # not a tidiness rule. wbsearchentities is a text index: searching
            # "Pic Blanc Andorra" returns Aneto and Mulhacen among the hits,
            # and the first version of this appended every candidate to the
            # pool whether it matched or not. Both of those then outranked the
            # real Andorran summits on sitelinks and published under Andorra,
            # which is a mountain in the wrong country on the first screen.
            fresh = [q for q in dict.fromkeys(candidates) if q not in by_qid]
            found = [r for r in entities_for(fresh[:12], cc) if in_europe(r)]
            hit = seed_match(entry, rows + found)
            if hit is not None and hit.get("wd") not in by_qid:
                hit["src"] = "seed-search"
                rows.append(hit)
                by_qid[hit["wd"]] = hit
        if hit is None:
            missing.append(entry["n"])
            continue
        hit["seed"] = {
            "name": entry["n"], "kind": entry.get("kind") or "peak",
            "lift": entry.get("lift") or "", "why": entry.get("why") or "editorial",
            "haz": list(entry.get("haz") or []),
            "alt": list(entry.get("alt") or []),
        }
        if entry.get("haz"):
            hit["haz_seed"] = list(entry["haz"])
        resolved += 1
    return rows, resolved, missing


# ---------------------------------------------------------------------------
# The cut
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# The second spine: OpenStreetMap
# ---------------------------------------------------------------------------

# What an OSM landform tag means to kind_of(). The values are words the
# KIND_PATTERNS in peak_index already match, so one table serves both spines
# rather than a second classifier that can disagree with the first.
OSM_KIND_WORDS = {
    "peak": "mountain", "volcano": "volcano", "saddle": "mountain pass",
    "ridge": "ridge", "arete": "arete", "cliff": "cliff",
    "plateau": "plateau", "mountain_pass": "mountain pass",
}

# How close an OSM element and a Wikidata item have to be to be the same
# landform when no `wikidata` tag says so. The brief's number. It is small on
# purpose: a summit node and its Wikidata item are usually within 30 m, and
# 150 m is already generous on a broad ridge, while 500 m would start
# swallowing the next top along.
OSM_MATCH_M = 150


def osm_rows(cc):
    """Whatever cache/mountains/osm_CC.json holds, in this layer's row shape.

    Read from the cache only. This stage never calls Overpass: the spine is
    harvested by pipeline/mountains/osm_spine.py, which is separable for the
    same reason the context sweep is (Overpass is the one source here that is
    regularly unreachable), and a harvest run on a box that has never fetched
    it simply works from Wikidata alone."""
    cached = load_cache("osm", cc)
    if not cached:
        return []
    out = []
    for row in cached.get("rows") or []:
        word = OSM_KIND_WORDS.get(row.get("natural") or "", "hill")
        names = row.get("names") or {}
        lang = LOCAL_LANG.get(cc, "en")
        out.append({
            "wd": row.get("wd") or None,
            "oid": row["oid"],
            "name": names.get("en") or row["name"],
            "name_local": names.get(lang) or row["name"],
            "names": names,
            "lat": row["lat"],
            "lon": row["lon"],
            "ele": row.get("ele"),
            "prom": row.get("prom"),
            "wd_img": "",
            "sitelinks": 0,
            "cls": [word],
            "osm_tags": row.get("tags") or {},
            "cc": cc,
            "src": "osm",
            "sources": ["osm-odbl"],
        })
    return out


def merge_osm(rows, extra):
    """Fold the OSM spine into the Wikidata one.

    Reconciliation is the brief's, in the brief's order: the `wikidata` tag
    first, because an OSM mapper writing Q1234 on a summit node is a human
    statement that these are the same mountain, and a spatial match within
    150 m second.

    A match ENRICHES rather than replaces. Wikidata carries the sitelinks
    that acclaim is built from and OSM carries the elevation and prominence
    that Wikidata mostly does not, so the merged row is better than either
    spine alone, which is the whole argument for having two.

    Returns (rows, matched, added)."""
    cells = {}
    for row in rows:
        cells.setdefault((int(row["lat"] * 100), int(row["lon"] * 100)),
                         []).append(row)
    by_qid = {r["wd"]: r for r in rows if r.get("wd")}
    matched = added = 0
    for cand in extra:
        twin = by_qid.get(cand["wd"]) if cand.get("wd") else None
        if twin is None:
            base = (int(cand["lat"] * 100), int(cand["lon"] * 100))
            best_km = None
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for other in cells.get((base[0] + dy, base[1] + dx), ()):
                        km = haversine_km(other["lat"], other["lon"],
                                          cand["lat"], cand["lon"])
                        if km * 1000.0 > OSM_MATCH_M:
                            continue
                        if best_km is None or km < best_km:
                            twin, best_km = other, km
        if twin is not None:
            matched += 1
            twin.setdefault("oid", cand["oid"])
            if twin.get("ele") is None and cand.get("ele") is not None:
                twin["ele"] = cand["ele"]
            if twin.get("prom") is None and cand.get("prom") is not None:
                twin["prom"] = cand["prom"]
            if cand.get("osm_tags"):
                twin["osm_tags"] = {**(twin.get("osm_tags") or {}),
                                    **cand["osm_tags"]}
            if "osm-odbl" not in twin.get("sources", []):
                twin.setdefault("sources", []).append("osm-odbl")
            continue
        rows.append(cand)
        added += 1
        cells.setdefault((int(cand["lat"] * 100), int(cand["lon"] * 100)),
                         []).append(cand)
        if cand.get("wd"):
            by_qid[cand["wd"]] = cand
    return rows, matched, added

def pre_score(row, ele_max):
    """A cheap ordering, used ONLY to decide who earns the network calls.

    Fame first, because a summit somebody has written about in six languages
    is the population a "best of" list is drawn from. Then prominence, which
    is the objective way to say a summit is its own mountain rather than a
    bump on somebody else's ridge, and then height against the tallest thing
    in the same country, so a Dutch hill is measured against Dutch hills.

    A seeded row is pinned above everything, and a P18 is worth a little on
    its own: an item somebody has attached a photograph to is an item somebody
    cared about."""
    if row.get("seed"):
        return 100.0
    score = 0.0
    sl = row.get("sitelinks") or 0
    score += 3.2 * math.log1p(sl) / math.log1p(60)
    prom = row.get("prom")
    if prom:
        score += 1.8 * min(1.0, math.log1p(prom) / math.log1p(1500))
    ele = row.get("ele")
    if ele and ele_max:
        score += 1.2 * max(0.0, min(1.0, ele / ele_max))
    if row.get("highpoint_of"):
        score += 1.4
    if row.get("wd_img"):
        score += 0.5
    return score


def dedupe_rows(rows):
    """One row per mountain. Wikidata holds separate items for a summit and
    the massif under it often enough to matter (Monte Rosa and Dufourspitze,
    Bucegi and Omu), and the spine's tiles overlap at their edges. Rows within
    250 m of each other with a shared name token are the same mountain; the
    one with more sitelinks wins, and the loser's seed pin moves across.

    Grid bucketed rather than pairwise, and that is not a micro optimisation:
    the first version compared every row against every row already kept, which
    is fine for Andorra's 154 and hung outright on Norway's 171,183. A 0.01
    degree bucket is about a kilometre, so a candidate only ever meets the
    handful of rows in its own cell and the eight around it."""
    rows = sorted(rows, key=lambda r: -(r.get("sitelinks") or 0))
    kept = []
    cells = {}

    def cell_key(row):
        return (int(row["lat"] * 100), int(row["lon"] * 100))

    for row in rows:
        base = cell_key(row)
        twin = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for other in cells.get((base[0] + dy, base[1] + dx), ()):
                    if haversine_km(other["lat"], other["lon"],
                                    row["lat"], row["lon"]) > 0.25:
                        continue
                    # `and other["wd"]` matters now that rows can arrive
                    # without a Q number: two OSM summits 200 m apart both
                    # have wd None, and None == None would fold every
                    # cluster of tops on a ridge into one row.
                    if (same_peak(other["name"], row["name"])
                            or (other.get("wd") and other["wd"] == row.get("wd"))):
                        twin = other
                        break
                if twin:
                    break
            if twin:
                break
        if twin is None:
            kept.append(row)
            cells.setdefault(base, []).append(row)
            continue
        if row.get("seed") and not twin.get("seed"):
            twin["seed"] = row["seed"]
        if not twin.get("wd_img") and row.get("wd_img"):
            twin["wd_img"] = row["wd_img"]
        if twin.get("prom") is None and row.get("prom") is not None:
            twin["prom"] = row["prom"]
        if twin.get("ele") is None and row.get("ele") is not None:
            twin["ele"] = row["ele"]
    return kept


def harvest_country(cc, refresh=False, shortlist_n=SHORTLIST, use_spine=True,
                    use_osm=True):
    if not refresh and load_cache(STAGE, cc) is not None:
        print(f"  {cc}: cached")
        return load_cache(STAGE, cc)

    rows = []
    if use_spine:
        for raw in spine_rows(cc):
            row = as_row(raw, cc)
            if row and in_europe(row):
                rows.append(row)
    else:
        # --no-spine skips READING the spine, it does not forget what the
        # spine already contributed: without this, a --no-spine --refresh
        # rewrote the cache from the seed and the high points alone and the
        # spine rows silently vanished from the pool. Same lesson as
        # enrich's --no-images: a skip flag controls the source, never the
        # data. The seed mark is cleared so resolve_seed below re-decides it
        # under the current rules, the way lakes' --fix-seeds does.
        for row in (load_cache(STAGE, cc) or {}).get("peaks") or []:
            if row.get("wd"):
                row = dict(row)
                row.pop("seed", None)
                rows.append(row)
    spine_n = len(rows)

    highs = [r for r in highpoint_rows(cc) if in_europe(r)]
    by_qid = {r["wd"] for r in rows}
    for row in highs:
        if row["wd"] in by_qid:
            # Keep the fact, not the duplicate.
            for existing in rows:
                if existing["wd"] == row["wd"]:
                    existing["highpoint_of"] = row.get("highpoint_of") or ""
                    break
        else:
            rows.append(row)
            by_qid.add(row["wd"])

    # The second spine, folded in before the seed is resolved so a seeded
    # mountain can resolve against an OSM row Wikidata has never heard of.
    osm_matched = osm_added = 0
    if use_osm:
        rows, osm_matched, osm_added = merge_osm(rows, osm_rows(cc))
        by_qid = {r["wd"] for r in rows if r.get("wd")}

    hills_n = 0
    if len(rows) < THIN_POOL:
        hills = [r for r in query_rows(HILL_QUERY, cc, "hill") if in_europe(r)]
        for row in hills:
            if row["wd"] not in by_qid:
                rows.append(row)
                by_qid.add(row["wd"])
                hills_n += 1

    rows, resolved, missing = resolve_seed(cc, rows)
    rows = dedupe_rows(rows)

    ele_max = max([r.get("ele") or 0 for r in rows] or [0]) or 1
    for row in rows:
        row["pre"] = round(pre_score(row, ele_max), 3)
    rows.sort(key=lambda r: (-r["pre"], fold(r["name"])))
    short = rows[:shortlist_n]
    # A seeded row is never cut, whatever the shortlist size.
    for row in rows[shortlist_n:]:
        if row.get("seed"):
            short.append(row)

    payload = {
        "cc": cc,
        "harvested_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pool": len(rows),
        "spine": spine_n,
        "highpoints": len(highs),
        "hills": hills_n,
        "osm_matched": osm_matched,
        "osm_added": osm_added,
        "seed_resolved": resolved,
        "seed_missing": missing,
        "peaks": short,
    }
    save_cache(STAGE, cc, payload)
    note = f", {len(missing)} seed unresolved" if missing else ""
    print(f"  {cc}: pool {len(rows)} (spine {spine_n}, high points {len(highs)}, "
          f"hills {hills_n}, osm +{osm_added}/={osm_matched}), "
          f"shortlist {len(short)}, seed {resolved}{note}")
    if missing:
        print(f"      unresolved: {', '.join(missing)}")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--shortlist", type=int, default=SHORTLIST)
    parser.add_argument("--no-spine", action="store_true",
                        help="work from the seed and the high points alone")
    parser.add_argument("--no-osm", action="store_true",
                        help="leave the OSM spine cache out of the pool")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES
    for cc in countries:
        try:
            harvest_country(cc, refresh=args.refresh, shortlist_n=args.shortlist,
                            use_spine=not args.no_spine,
                            use_osm=not args.no_osm)
        except KeyboardInterrupt:
            raise
        except Exception as exc:                      # noqa: BLE001
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
