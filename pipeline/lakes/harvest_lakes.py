"""Stage 1 of the lake layer: find the water bodies worth ranking.

The beach layer sweeps OpenStreetMap for every named beach in a country and
merges Wikidata into it. That shape is wrong for lakes, and Finland is why:
OSM holds 168,000 named Finnish lakes, almost all of them a pond behind a
summer house. A country sweep for `natural=water` would spend hours of
Overpass time to bring back a haystack, and then the ranking would have to
throw nearly all of it away.

So this layer inverts the two sources.

  Wikidata is the spine.  Every water body typed as a lake, a reservoir or a
        lagoon (P31/P279* of Q23397, Q131681, Q187223), taken per country in
        two bounded passes: the most written about, and the largest. That is
        exactly the population a "best lakes" list is drawn from, it is CC0,
        and it carries what a lake is ranked on: area, depth, elevation, the
        region, the Commons category and the sitelink count.
  The curated seed is pinned.  seed_lakes.py names the water bodies travel
        writing actually names, including the ones Wikidata records as small
        and ordinary, and it carries the swimming rules that must never be
        guessed. Anything in the seed that the two passes missed is resolved
        by name here and force included.
  OpenStreetMap comes later, and targeted.  enrich_lakes.py asks Overpass what
        is AROUND each shortlisted lake, in batches: swimming areas, beaches,
        boat rental, parking, a lido. One bounded question per 25 lakes rather
        than one unbounded question per country.

Class enumeration is done once, not per query. A per country
`P31/P279* wd:Q23397` traversal answers Malta in fourteen seconds and times
Germany and Italy out entirely (both returned HTTP 504 after four tries during
the build). Enumerating the subclasses first, with a bounded four step path,
and then asking each country for `VALUES ?type` turns an unbounded traversal
into an index lookup.

Idempotent and resumable, one cache file per country
(cache/lakes/raw_CC.json), so a re-run costs nothing and a crash costs one
country. Re-harvest with --refresh.

Usage, from the repo root:
    python pipeline/lakes/harvest_lakes.py                 # every country
    python pipeline/lakes/harvest_lakes.py --countries SI,HR
    python pipeline/lakes/harvest_lakes.py --countries IT --refresh
    python pipeline/lakes/harvest_lakes.py --seed-only     # just the seed
"""

import argparse
import json
import re
import sys
import unicodedata
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from water_sources import (SourceError, cell, get_json,  # noqa: E402
                           haversine_km, load_cache, save_cache, sparql)
import seed_lakes  # noqa: E402

ROOT = HERE.parents[1]

STAGE = "raw"

# The 43 countries the catalogue prices. Landlocked, island and micro states
# are all harvested: which ones appear in the app is decided by what they
# actually have, never by a hand kept list.
COUNTRIES = [
    "AD", "AL", "AT", "BA", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FO", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
    "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT",
    "RO", "RS", "SE", "SI", "SK", "SM", "XK",
]

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

# The three roots. Rivers are deliberately NOT a root: the tab is Lakes, the
# brief's own numbers make river bathing the weakest and most volatile
# category in Europe (47 per cent Excellent against 88 per cent coastal), and
# a river's quality can turn inside 48 hours of rain. The handful of rivers
# that ARE famous swimming destinations, the Soca and the Una and the Fairy
# Pools, come in through the seed, where a human has looked at them.
CLASS_ROOTS = ["Q23397", "Q131681", "Q187223"]   # lake, reservoir, lagoon

# How many per country each bounded pass asks for. Fame first, because that is
# the population a "best of" list is drawn from; then area, because a large
# lake nobody has written about is still a lake and some countries have
# nothing but those.
FAME_N = 700
AREA_N = 250
DETAIL_CHUNK = 90         # items per detail query

WD_API = "https://www.wikidata.org/w/api.php"

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
    "SK": "Slovakia", "SM": "San Marino", "XK": "Kosovo",
}

# ---------------------------------------------------------------------------
# Units. P2046 and P4511 carry a unit QID and the values are NOT all metric
# the way a reader assumes: Lake Windermere's area arrives in square miles on
# some passes and a lake "2.1 deep" is 2.1 kilometres if nobody checks.
# Anything whose unit is not in these tables is dropped rather than guessed.
# ---------------------------------------------------------------------------
AREA_TO_KM2 = {
    "Q712226": 1.0,          # square kilometre
    "Q25343": 1e-6,          # square metre
    "Q35852": 0.01,          # hectare
    "Q232291": 2.589988,     # square mile
    "Q81292": 0.00404686,    # acre
}
LEN_TO_M = {
    "Q11573": 1.0,           # metre
    "Q3710": 0.3048,         # foot
    "Q828224": 1000.0,       # kilometre
    "Q218593": 0.0254,       # inch
    "Q253276": 1609.344,     # mile
}


def qid_of(url):
    return str(url or "").rsplit("/", 1)[-1]


# Letters NFKD does not decompose, because they are letters in their own right
# rather than a base plus a mark. Every one of these cost a real match: the
# seed spells the Danish lakes Furesoen, Julso and Arreso in ASCII, Wikidata
# spells them Furesoen, Julso and Arreso with o-slash, and without this table
# the fold turns the slash into a space and the two names share no token at
# all. Four Danish lakes were unresolved for exactly this reason.
UNDECOMPOSED = {
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe",
    "ł": "l", "Ł": "l", "ß": "ss", "đ": "d", "Đ": "d", "ð": "d", "Ð": "d",
    "þ": "th", "Þ": "th", "ı": "i", "ħ": "h", "ŋ": "n", "ɫ": "l",
}


def fold(name):
    """Accent folded, lowercase, punctuation free. Same fold as the rest of
    the pipeline, plus the letters NFKD leaves alone (see UNDECOMPOSED)."""
    text = unicodedata.normalize("NFKD", (name or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = "".join(UNDECOMPOSED.get(c, c) for c in text)
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


# The word for "lake" in the languages this layer harvests, plus the articles
# and prepositions that glue names together. Stripped before any name
# comparison, so "Lago di Garda" and "Garda" are one lake, and so a name that
# is nothing BUT the generic word never matches every other lake in the
# valley on its only token.
GENERIC = {
    "lake", "lakes", "loch", "lough", "llyn", "see", "sea", "meer", "plas",
    "plassen", "jezero", "jezera", "jezioro", "ezero", "ezera", "ezers",
    "jarv", "jarvi", "vatn", "vatnet", "vann", "sjo", "sjon", "so", "soen",
    "lago", "laghi", "lac", "lacs", "lacul", "lagoa", "laguna", "lagoon",
    "lagune", "embalse", "barragem", "barrage", "estany", "estanys", "etang",
    "liqeni", "liqen", "pleso", "prehrada", "stausee", "reservoir", "yazovir",
    "tarn", "pond", "teich", "vijver", "bassin", "kul", "gol", "to", "tavak",
    # Watercourse words, and they are NOT optional. Without "river" in this
    # set, the seed entry "River Wye" shared its only surviving token with
    # "Pembroke River upper reaches" 160 km away and pinned the wrong water
    # body into Britain's list.
    "river", "rivers", "rijeka", "reka", "reku", "fiume", "rio", "riviere",
    "riviera", "fluss", "flod", "floden", "elv", "elva", "joki", "jogi",
    "rzeka", "potok", "creek", "stream", "brook", "burn", "beck", "waterfall",
    "waterfalls", "falls", "cascade", "ujevara", "ujevarat", "vodopad",
    "the", "of", "de", "da", "do", "del", "della", "di", "du", "des", "la",
    "le", "les", "el", "los", "las", "van", "der", "den", "und", "and", "et",
    "am", "im", "sur", "auf", "at", "in", "on",
}


def name_tokens(name):
    return {t for t in fold(name).split() if t and t not in GENERIC and len(t) > 2}


def same_water(a_name, b_name):
    """True when two names denote the same water body once the generic words
    are gone. An empty token set on either side means the name carried no
    distinctive word at all, and guessing on nothing is exactly wrong."""
    ta, tb = name_tokens(a_name), name_tokens(b_name)
    if not ta or not tb:
        return False
    return bool(ta & tb)


# ---------------------------------------------------------------------------
# The class list, enumerated once
# ---------------------------------------------------------------------------

CLASS_HOP = """
SELECT DISTINCT ?sub WHERE {
  VALUES ?parent { %(parents)s }
  ?sub wdt:P279 ?parent .
}
"""
CLASS_DEPTH = 4
CLASS_MAX = 1200


def lake_classes(refresh=False):
    """Every Wikidata class that is a lake, a reservoir or a lagoon, walked
    down four subclass steps. Cached: it is a handful of queries and the
    answer barely moves.

    Walked one hop at a time in Python rather than asked for as a property
    path. Both `wdt:P279*` and a bounded `P279?/P279?/P279?/P279?` chain from
    these roots time the public endpoint out: the planner has no selective
    triple to start from and evaluates the path against every subclass
    statement in Wikidata. One hop with a VALUES list of known parents is an
    index lookup and answers in a second or two.

    Four steps rather than unbounded on purpose. The star walks up into the
    general ontology (a lake is a body of water is a geographic feature is an
    entity) and comes back with most of the taxonomy. Four steps reaches
    crater lake, glacial lake, oxbow lake, kettle lake, tarn, salt lake,
    hydroelectric reservoir and coastal lagoon, which is the vocabulary this
    layer needs."""
    cached = None if refresh else load_cache("classes", "all")
    if cached and cached.get("qids"):
        return cached["qids"]

    seen = set(CLASS_ROOTS)
    frontier = list(CLASS_ROOTS)
    for depth in range(CLASS_DEPTH):
        found = set()
        for i in range(0, len(frontier), 120):
            chunk = frontier[i:i + 120]
            rows = sparql(CLASS_HOP % {"parents": _values(chunk)}, timeout=180)
            found.update(qid_of(cell(r, "sub")) for r in rows)
        frontier = sorted(found - seen)
        if not frontier:
            break
        seen.update(frontier)
        print(f"    subclass depth {depth + 1}: +{len(frontier)} "
              f"({len(seen)} total)")
        if len(seen) > CLASS_MAX:
            # A runaway means a bad P279 edge somewhere in Wikidata pulled a
            # whole branch of the ontology in. Stop rather than build a query
            # with ten thousand VALUES in it.
            print(f"    stopping at {len(seen)} classes, the tree ran away")
            break

    qids = sorted(seen)
    if not set(CLASS_ROOTS) <= set(qids):
        raise SourceError("class enumeration lost its own roots")
    save_cache("classes", "all", {"qids": qids,
                                  "at": datetime.now(timezone.utc)
                                  .isoformat(timespec="seconds")})
    print(f"  {len(qids)} lake, reservoir and lagoon classes")
    return qids


def _values(qids, prefix="wd:"):
    return " ".join(prefix + q for q in qids)


RANK_QUERY = """
SELECT ?x ?rank WHERE {
  VALUES ?type { %(types)s }
  ?x wdt:P31 ?type ; wdt:P17 wd:%(qid)s ; %(rank)s ?rank .
} ORDER BY DESC(?rank) LIMIT %(n)d
"""


def ranked_items(cc, classes, by, limit):
    """The top `limit` items of one country by one ordering. `by` is the
    predicate that produces the ranking value."""
    qid = COUNTRY_QID.get(cc)
    if not qid:
        return []
    query = RANK_QUERY % {"types": _values(classes), "qid": qid,
                          "rank": by, "n": limit}
    rows = sparql(query, timeout=280)
    return [qid_of(cell(r, "x")) for r in rows if cell(r, "x")]


# TWO detail queries, not one, and the split is not cosmetic.
#
# A single query with every OPTIONAL in it multiplies its own answer out: a
# lake with four P31 types, three protected areas, two parents and four basin
# countries arrives as ninety six identical rows differing in one column, and
# every one of them carries the label, the image URL and both Wikipedia links.
# Ninety lakes of that shape produced a 9 MB response that the endpoint
# truncated mid string, and the country died on a JSON parse error rather than
# on anything anybody could read.
#
# So the one-to-one fields come back once per lake, and the many-valued ones
# come back as a narrow two column list. Same data, a twentieth of the bytes.
DETAIL_QUERY = """
SELECT ?x ?xLabel ?local ?lat ?lon ?img ?commons ?sl ?admLabel
       ?area ?areaUnit ?depth ?depthUnit ?elev ?elevUnit
       ?enwiki ?localwiki WHERE {
  VALUES ?x { %(items)s }
  ?x p:P625/psv:P625 ?co .
  ?co wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  ?x wikibase:sitelinks ?sl .
  OPTIONAL { ?x rdfs:label ?local FILTER(LANG(?local) = "%(lang)s") }
  OPTIONAL { ?x wdt:P18 ?img }
  OPTIONAL { ?x wdt:P373 ?commons }
  OPTIONAL { ?x wdt:P131 ?adm }
  OPTIONAL { ?x p:P2046/psv:P2046 ?av .
             ?av wikibase:quantityAmount ?area ; wikibase:quantityUnit ?areaUnit }
  OPTIONAL { ?x p:P4511/psv:P4511 ?dv .
             ?dv wikibase:quantityAmount ?depth ; wikibase:quantityUnit ?depthUnit }
  OPTIONAL { ?x p:P2044/psv:P2044 ?ev .
             ?ev wikibase:quantityAmount ?elev ; wikibase:quantityUnit ?elevUnit }
  OPTIONAL { ?enwiki schema:about ?x ;
             schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?localwiki schema:about ?x ;
             schema:isPartOf <https://%(lang)s.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,%(lang)s". }
}
"""

LIST_QUERY = """
SELECT ?x ?field ?valLabel WHERE {
  VALUES ?x { %(items)s }
  { ?x wdt:P31 ?val . BIND("types" AS ?field) }
  UNION { ?x wdt:P3018 ?val . BIND("protected" AS ?field) }
  UNION { ?x wdt:P361 ?val . BIND("part_of" AS ?field) }
  UNION { ?x wdt:P205 ?val . BIND("basin_countries" AS ?field) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,%(lang)s". }
}
"""

LIST_FIELDS = ("types", "protected", "part_of", "basin_countries")


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def details_for(items, cc, lang):
    """{qid: row} for a list of pinned Wikidata items, in chunks."""
    out = {}
    for i in range(0, len(items), DETAIL_CHUNK):
        chunk = items[i:i + DETAIL_CHUNK]
        try:
            rows = sparql(DETAIL_QUERY % {"items": _values(chunk),
                                          "lang": lang}, timeout=280)
        except (SourceError, ValueError) as exc:
            print(f"    detail chunk {i // DETAIL_CHUNK + 1} failed: "
                  f"{str(exc)[:80]}")
            continue
        for row in rows:
            item = qid_of(cell(row, "x"))
            lat, lon = _num(cell(row, "lat")), _num(cell(row, "lon"))
            if not item or lat is None or lon is None or item in out:
                continue
            rec = {
                "wd": item,
                "name": cell(row, "xLabel") or "",
                "name_local": cell(row, "local") or "",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "iso2": cc,
                "adm": cell(row, "admLabel") or "",
                "types": [],
                "sitelinks": int(_num(cell(row, "sl", 0)) or 0),
                "wd_img": cell(row, "img") or "",
                "commons_cat": cell(row, "commons") or "",
                "enwiki": cell(row, "enwiki") or "",
                "localwiki": cell(row, "localwiki") or "",
                "area_km2": None,
                "depth_m": None,
                "elev_m": None,
                "protected": [],
                "part_of": [],
                "basin_countries": [],
            }
            factor = AREA_TO_KM2.get(qid_of(cell(row, "areaUnit")))
            amount = _num(cell(row, "area"))
            if factor and amount is not None and amount > 0:
                rec["area_km2"] = round(amount * factor, 4)
            factor = LEN_TO_M.get(qid_of(cell(row, "depthUnit")))
            amount = _num(cell(row, "depth"))
            if factor and amount is not None and amount > 0:
                rec["depth_m"] = round(amount * factor, 1)
            factor = LEN_TO_M.get(qid_of(cell(row, "elevUnit")))
            amount = _num(cell(row, "elev"))
            if factor and amount is not None:
                rec["elev_m"] = round(amount * factor)
            out[item] = rec

        # The many-valued half, over the items that answered.
        answered = [q for q in chunk if q in out]
        if not answered:
            continue
        try:
            rows = sparql(LIST_QUERY % {"items": _values(answered),
                                        "lang": lang}, timeout=280)
        except (SourceError, ValueError) as exc:
            print(f"    list chunk {i // DETAIL_CHUNK + 1} failed: "
                  f"{str(exc)[:80]}")
            continue
        for row in rows:
            item = qid_of(cell(row, "x"))
            field = cell(row, "field")
            value = cell(row, "valLabel")
            if (item not in out or field not in LIST_FIELDS or not value
                    or value.startswith("http")):
                continue
            bucket = out[item][field]
            if value not in bucket:
                bucket.append(value)
    # An item with no label but its own id is an id, not a destination.
    return {q: r for q, r in out.items()
            if r["name"] and not re.fullmatch(r"Q\d+", r["name"])}


# ---------------------------------------------------------------------------
# The curated seed, resolved onto real items
# ---------------------------------------------------------------------------

# How far a hint coordinate may be from the item Wikidata holds. A lake has
# one centre and 30 km is generous for it. A RIVER does not: Wikidata puts a
# river's coordinate at its source or its mouth, and the Soca's source is
# 90 km from the stretch people raft. Rivers therefore get a river sized
# tolerance, which is safe because the name has already had to match.
SEED_NEAR_KM = 30.0
SEED_NEAR_KM_LONG = 160.0
LONG_KINDS = ("river",)


def seed_radius(entry):
    return SEED_NEAR_KM_LONG if entry.get("kind") in LONG_KINDS else SEED_NEAR_KM


def search_wikidata(term, limit=8):
    """wbsearchentities, which is an index lookup rather than a query.

    Used only for seeded entries the two bounded passes missed, which is a few
    dozen calls in a whole build. A SPARQL label match would be the tidier
    thing to write and roughly a hundred times slower to run."""
    params = urllib.parse.urlencode({
        "action": "wbsearchentities", "search": term, "language": "en",
        "uselang": "en", "type": "item", "limit": limit, "format": "json",
    })
    try:
        data = get_json(f"{WD_API}?{params}", timeout=60)
    except (SourceError, ValueError):
        return []
    return [hit["id"] for hit in (data.get("search") or []) if hit.get("id")]


def seed_match(entry, rows):
    """The harvested row this seed entry names, or None.

    An explicit `wd` on the seed entry settles it outright. That is the escape
    hatch for the names entity search cannot reach: "Una" is a Spanish word, an
    album and four Brazilian rivers before it is the Bosnian one, and no
    reasonable query string puts the right item first.

    Otherwise: name first, coordinate second, and BOTH are required when the
    seed carries a hint. "Lake Prespa" is a real lake in three countries and
    "Blue Lagoon" is a Maltese sea cove and an Icelandic spa. A token match
    alone would put one of them under the other's photograph."""
    pinned = entry.get("wd")
    if pinned:
        for row in rows:
            if row.get("wd") == pinned:
                return row
    names = [entry["n"]] + list(entry.get("alt") or [])
    hint = (entry.get("lat"), entry.get("lon"))
    limit = seed_radius(entry)
    best, best_km = None, None
    for row in rows:
        if not any(same_water(n, row["name"]) or same_water(n, row.get("name_local"))
                   for n in names):
            continue
        if hint[0] is None:
            return row
        km = haversine_km(hint[0], hint[1], row["lat"], row["lon"])
        if km > limit:
            continue
        if best_km is None or km < best_km:
            best, best_km = row, km
    return best


def resolve_seed(cc, rows, lang):
    """Pin every seeded water body of this country into `rows`.

    Returns (rows, resolved, missing). A seed entry that cannot be resolved is
    NOT invented: it is reported by name so somebody can look at it, because a
    row with a name and nothing else is worse than an absence."""
    entries = seed_lakes.by_country().get(cc) or []
    if not entries:
        return rows, 0, []
    by_qid = {r["wd"]: r for r in rows if r.get("wd")}
    resolved, missing, wanted = 0, [], []
    for entry in entries:
        hit = seed_match(entry, rows)
        if hit is not None:
            hit["seed"] = {k: entry[k] for k in ("swim", "kind", "why", "haz",
                                                 "note")
                           if entry.get(k)}
            hit["seed"]["name"] = entry["n"]
            resolved += 1
            continue
        wanted.append(entry)

    # Whatever the country passes missed gets a few searches each, then one
    # detail query for the lot: the search is cheap, the detail query is not.
    #
    # The qualified terms are what rescue the short generic names. "Una" is a
    # Spanish word, an album and a given name before it is a Bosnian river,
    # and wbsearchentities ranks it that way; "Una river" and "Una Bosnia and
    # Herzegovina" both put the river first.
    found = {}
    for entry in wanted:
        if entry.get("wd"):
            found.setdefault(entry["n"], []).append(entry["wd"])
            continue
        terms = [entry["n"]] + list(entry.get("alt") or [])
        kind = entry.get("kind") or ""
        if kind and kind not in ("lake",):
            terms.append(f"{entry['n']} {kind}")
        terms.append(f"{entry['n']} {COUNTRY_NAME.get(cc, cc)}")
        for term in terms:
            hits = [q for q in search_wikidata(term) if q not in by_qid]
            if hits:
                found.setdefault(entry["n"], []).extend(hits[:5])
        if entry["n"] not in found:
            missing.append(entry["n"])
    candidates = sorted({q for qs in found.values() for q in qs})
    if candidates:
        detail = details_for(candidates, cc, lang)
        for entry in wanted:
            if entry["n"] in missing:
                continue
            pool = [detail[q] for q in found.get(entry["n"], []) if q in detail]
            hit = seed_match(entry, pool)
            if hit is None:
                missing.append(entry["n"])
                continue
            hit = as_row(hit)
            hit["seed"] = {k: entry[k] for k in ("swim", "kind", "why", "haz",
                                                 "note") if entry.get(k)}
            hit["seed"]["name"] = entry["n"]
            # A cross border lake is filed under the country that seeded it,
            # whatever Wikidata's P17 says: Lake Ohrid belongs on the Albanian
            # page AND the Macedonian one, and each carries its own shore.
            hit["iso2"] = cc
            rows.append(hit)
            by_qid[hit["wd"]] = hit
            resolved += 1
    return rows, resolved, missing


# ---------------------------------------------------------------------------
# The country pass
# ---------------------------------------------------------------------------

def as_row(rec):
    """One Wikidata record in the shape every later stage reads.

    The wrapper fields are not decoration. `key` is what the enrich stage
    indexes its per lake cache by and what the Overpass batch assigns its
    results to, so a row without one takes the whole country down with a
    KeyError. A seeded lake resolved by search goes through here for exactly
    that reason: it arrives from the detail query in the same shape as any
    other, and it has to leave in the same shape too."""
    row = dict(rec)
    row.setdefault("wd", "")
    row["key"] = f"wd:{row['wd']}" if row["wd"] else f"name:{fold(row.get('name'))}"
    row.setdefault("sources", ["wikidata"])
    row.setdefault("osm_id", "")
    row.setdefault("osm_tags", {})
    return row


def make_rows(detail):
    return [as_row(rec) for rec in detail.values()]


def harvest_country(cc, refresh=False, classes=None, seed_only=False):
    """One country's water bodies, cached."""
    cached = None if refresh else load_cache(STAGE, cc)
    if cached and cached.get("lakes") and not refresh:
        print(f"  {cc}: {len(cached['lakes'])} water bodies (cached)")
        return cached

    lang = LOCAL_LANG.get(cc, "en")
    classes = classes or lake_classes()
    items = []
    if not seed_only:
        print(f"  {cc}: querying Wikidata")
        try:
            items = ranked_items(cc, classes, "wikibase:sitelinks", FAME_N)
        except SourceError as exc:
            print(f"    fame pass failed for {cc}: {str(exc)[:90]}")
        try:
            big = ranked_items(cc, classes, "wdt:P2046", AREA_N)
        except SourceError as exc:
            print(f"    area pass failed for {cc}: {str(exc)[:90]}")
            big = []
        for q in big:
            if q not in items:
                items.append(q)

    detail = details_for(items, cc, lang) if items else {}
    n_wikidata = len(detail)
    rows = make_rows(detail)
    if seed_only:
        # --seed-only skips the country passes, it does not forget what they
        # already found: without this, a --seed-only --refresh rewrote a
        # country's cache with nothing but its seed rows, because `cached` is
        # None under --refresh and the shrink guard below never fired. Same
        # lesson as enrich's --no-images: the switch controls the network,
        # never the data. Rows are repaired and their seed mark cleared the
        # way --fix-seeds does, so resolve_seed below re-decides the seed
        # under the current rules.
        prior = cached or load_cache(STAGE, cc) or {}
        n_wikidata = prior.get("n_wikidata") or 0
        for row in prior.get("lakes") or []:
            row = dict(row) if row.get("key") else as_row(row)
            row.pop("seed", None)
            rows.append(row)
    rows, seeded, missing = resolve_seed(cc, rows, lang)

    # Nothing replaces something, the same rule the beach harvest learned the
    # hard way: a run during an hour when the endpoint was refusing must not
    # turn a country's 300 lakes into its 4 seeded ones.
    if cached and len(rows) < len(cached.get("lakes") or []) * 0.5:
        print(f"  {cc}: only {len(rows)} came back against "
              f"{len(cached['lakes'])} cached, keeping the cache")
        return cached

    payload = {
        "country": cc,
        "harvested_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_wikidata": n_wikidata,
        "n_seeded": seeded,
        "seed_missing": missing,
        "lakes": rows,
    }
    save_cache(STAGE, cc, payload)
    note = f", {len(missing)} seed entries UNRESOLVED" if missing else ""
    print(f"  {cc}: {len(rows)} water bodies ({n_wikidata} from Wikidata, "
          f"{seeded} seeded){note}")
    if missing:
        print(f"    unresolved: {', '.join(missing)}")
    return payload


def fix_seeds(cc):
    """Re-run seed resolution over a cached country, without re-querying it.

    The country passes are the expensive half and they do not change when a
    seed entry is added or its name corrected. This re-resolves only what is
    still outstanding, which is what makes fixing one unresolved name a thirty
    second job rather than a re-harvest."""
    cached = load_cache(STAGE, cc)
    if not cached:
        print(f"  {cc}: nothing cached")
        return None
    # An EMPTY lake list is not the same as no cache. San Marino's country
    # passes returned nothing at all, because its one water body is typed
    # `body of water` rather than as any subclass of lake, and the seed search
    # is exactly what is supposed to rescue that case.
    cached.setdefault("lakes", [])
    before = set(cached.get("seed_missing") or [])
    # Repair first: an earlier build appended seed hits without the wrapper
    # fields, and a row with no `key` takes the whole enrich stage down.
    rows = []
    for row in cached["lakes"]:
        row = row if row.get("key") else as_row(row)
        # Clear the mark before re-resolving. A seed match made under an older
        # rule has to be able to go away when the rule is fixed, otherwise
        # correcting the matcher leaves its mistakes pinned in the cache.
        row.pop("seed", None)
        rows.append(row)
    rows, seeded, missing = resolve_seed(cc, rows, LOCAL_LANG.get(cc, "en"))
    cached["lakes"] = rows
    cached["n_seeded"] = seeded
    cached["seed_missing"] = missing
    save_cache(STAGE, cc, cached)
    fixed = before - set(missing)
    print(f"  {cc}: {seeded} seeded, {len(missing)} still unresolved"
          + (f", fixed {', '.join(sorted(fixed))}" if fixed else ""))
    return cached


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="",
                        help="comma separated ISO2 (default: every country)")
    parser.add_argument("--refresh", action="store_true",
                        help="re-query even when a country is cached")
    parser.add_argument("--seed-only", action="store_true",
                        help="skip the country passes, resolve the seed only")
    parser.add_argument("--fix-seeds", action="store_true",
                        help="re-resolve the seed against the cached harvest, "
                             "without re-querying any country")
    parser.add_argument("--reverse", action="store_true",
                        help="work the list from the end, so a second process "
                             "can meet this one in the middle")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES
    if args.reverse:
        countries = list(reversed(countries))

    classes = None if args.fix_seeds else lake_classes()
    total, unresolved = 0, []
    for cc in countries:
        try:
            payload = (fix_seeds(cc) if args.fix_seeds
                       else harvest_country(cc, refresh=args.refresh,
                                            classes=classes,
                                            seed_only=args.seed_only))
            if payload is None:
                continue
            total += len(payload["lakes"])
            unresolved += [f"{cc}: {n}" for n in payload.get("seed_missing") or []]
        except KeyboardInterrupt:
            raise
        except Exception as exc:                     # one country, not the run
            print(f"  {cc}: failed ({exc})")
    print(f"[lakes] {total} water bodies across {len(countries)} countries")
    if unresolved:
        print(f"[lakes] {len(unresolved)} seed entries did not resolve:")
        for line in unresolved:
            print(f"  {line}")


if __name__ == "__main__":
    main()
