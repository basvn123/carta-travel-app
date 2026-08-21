"""Stage 2 of the mountain layer: everything the shortlist needs to be ranked
and shown.

The harvest knows where a mountain is and roughly how big. That is not enough
to say whether somebody should go, so this stage adds the five things that
are, one source each and one cache file per country.

  Wikidata detail.   Prominence and isolation with their UNITS (isolation is
        recorded in kilometres and elevation is recorded in feet on plenty of
        British hills, so a unitless read is a wrong read), the Commons
        category, the range it belongs to, the classes it is an instance of,
        the protected area it stands in, and the Wikipedia titles.
  Photographs.       Up to six freely licensed pictures per mountain, chosen
        by relevance rather than by whatever the geosearch returned first. A
        mountain is a thing you look at, so the app shows a gallery and this
        is where the gallery comes from. The gate downstream refuses to
        publish a mountain we cannot show.
  Wikipedia.         Pageviews as the fame signal the brief asks for, and the
        FACTS in the article as reason codes: glacier, via ferrata, cable
        car, national park, first ascent. Never the prose. Facts are not
        copyrightable; the sentences that carry them are.
  OpenStreetMap.     The access layer, which is the whole reason the brief
        says to boost accessibility: cable cars, gondolas, funiculars, rack
        railways and chairlifts, with the DISTANCE from the summit, so a top
        station 200 m away can mean "you can ride to the top" and a lift 2 km
        down the valley cannot. Plus huts, viewpoints, summit restaurants,
        summit crosses, parking, and the graded paths (sac_scale and
        via_ferrata_scale) that say how hard the walk is.
  The catalogue.     The nearest place Carta prices, so a mountain can say
        which trip it belongs to.

One question per source per batch, never per mountain: Overpass is asked about
twenty summits at a time and Wikipedia about twenty.

Safety note, and it is the reason the OSM difficulty grades are stored with
their source rather than averaged into a number: sac_scale is widely misused,
and true alpine routes across glaciers are tagged highway=path. Nothing here
upgrades a difficulty, invents a route or asserts that a way exists. What the
wire carries is what a source said, with the source attached.

Idempotent, one cache file per country (cache/mountains/rich_CC.json).

Usage, from the repo root:
    python pipeline/mountains/enrich_peaks.py
    python pipeline/mountains/enrich_peaks.py --countries CH,AT
    python pipeline/mountains/enrich_peaks.py --countries IT --refresh
    python pipeline/mountains/enrich_peaks.py --no-context   # leave Overpass alone

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import math
import re
import statistics
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from peak_sources import (COMMONS_API, SourceError, cell,  # noqa: E402
                          haversine_km, load_cache, mediawiki, overpass,
                          save_cache, sparql, wikipedia_api)
from harvest_peaks import (COUNTRY_QID, LOCAL_LANG, fold,  # noqa: E402
                           name_tokens, qid_of)

ROOT = HERE.parents[1]
CACHE = ROOT / "cache"
DEST_INDEX = CACHE / "mountains" / "dest_index.json"
BEACH_DEST_INDEX = CACHE / "beaches" / "dest_index.json"
LAKE_DEST_INDEX = CACHE / "lakes" / "dest_index.json"
MASTER = ROOT / "app_data" / "app_data.json"

STAGE_IN = "raw"
STAGE_OUT = "rich"

IMAGES_WANTED = 6        # a mountain is a thing you look at: it gets a gallery

# Four rather than two, and it is not a politeness question. sources._wait
# claims its slot under a lock and sleeps OUTSIDE it, so the per host pace is
# a global 2.5 requests a second to Commons whatever the worker count; two
# workers simply never reached that ceiling, because each query spends most of
# its time waiting on the answer. Andorra took twelve minutes at two workers,
# which over 43 countries is most of a day.
IMAGE_WORKERS = 4
DETAIL_CHUNK = 70
WIKI_BATCH = 20
OSM_BATCH = 20
DEST_MAX_KM = 120.0

# How many of the harvest's shortlist actually earn the network calls.
#
# The harvest cuts each country to 110 rows on a pre score. The export gate
# publishes at most 60. Spending an Overpass sweep and six Commons queries on
# rows 76 to 110 buys nothing a reader will ever see, and Overpass is the slow
# stage of the whole build: at 20 summits a query it is four questions per
# country instead of six, which is two hours off a continent wide run.
#
# Seeded rows are never cut, whatever their pre score, because the seed is the
# one place a human decided this mountain matters.
ENRICH_TOP = 62

# How far from the summit a lift still counts as this mountain's lift. Both
# numbers are read by peak_index: inside SUMMIT_LIFT_M the wire says you can
# ride up, out to NEAR_LIFT_M it says there are lifts on the mountain.
SUMMIT_LIFT_M = 700
NEAR_LIFT_M = 3000


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _grid_key(lat, lon):
    return (int(math.floor(lat * 10)), int(math.floor(lon * 10)))


class NearIndex:
    """A 0.1 degree grid over point features, so every mountain can ask "what
    is near me" without a full scan apiece."""

    def __init__(self, points):
        self.cells = {}
        for p in points:
            self.cells.setdefault(_grid_key(p["lat"], p["lon"]), []).append(p)

    def _around(self, lat, lon, max_km, where=None):
        span = int(math.ceil(max_km / 8.0)) + 1
        base = _grid_key(lat, lon)
        for dy in range(-span, span + 1):
            for dx in range(-span, span + 1):
                for p in self.cells.get((base[0] + dy, base[1] + dx), ()):
                    if where and not where(p):
                        continue
                    km = haversine_km(lat, lon, p["lat"], p["lon"])
                    if km <= max_km:
                        yield p, km

    def nearest(self, lat, lon, max_km, where=None):
        best, best_km = None, None
        for p, km in self._around(lat, lon, max_km, where):
            if best_km is None or km < best_km:
                best, best_km = p, km
        return (best, best_km) if best else (None, None)


def build_dest_index(refresh=False):
    """Slim {id, city, country, iso2, lat, lon} for every priced place.

    The beach and lake layers build the identical index, so if either is on
    disk it is read rather than rebuilt: the source is one 68 MB file and
    nobody should pay that load a third time for the same answer."""
    if DEST_INDEX.exists() and not refresh:
        return json.loads(DEST_INDEX.read_text(encoding="utf-8"))
    for other in (BEACH_DEST_INDEX, LAKE_DEST_INDEX):
        if other.exists() and not refresh:
            rows = json.loads(other.read_text(encoding="utf-8"))
            DEST_INDEX.parent.mkdir(parents=True, exist_ok=True)
            DEST_INDEX.write_text(json.dumps(rows, ensure_ascii=False),
                                  encoding="utf-8")
            return rows
    if not MASTER.exists():
        return []
    print("  reading the catalogue master (once)")
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    out = []
    for did, d in (data.get("destinations") or {}).items():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if lat is None or lon is None:
            continue
        out.append({"id": did, "city": d.get("city") or "",
                    "country": d.get("country") or "",
                    "iso2": d.get("iso2") or "",
                    "lat": float(lat), "lon": float(lon)})
    DEST_INDEX.parent.mkdir(parents=True, exist_ok=True)
    DEST_INDEX.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"  catalogue index: {len(out)} priced places")
    return out


# ---------------------------------------------------------------------------
# Wikidata detail
# ---------------------------------------------------------------------------

# Quantity units, because these three properties are NOT all metric and the
# app would publish an 8,848 m Ben Nevis if it read the number alone.
LEN_TO_M = {
    "Q11573": 1.0,           # metre
    "Q3710": 0.3048,         # foot
    "Q828224": 1000.0,       # kilometre
    "Q253276": 1609.344,     # mile
    "Q218593": 0.0254,       # inch
}
LEN_TO_KM = {q: v / 1000.0 for q, v in LEN_TO_M.items()}

SCALAR_QUERY = """
SELECT ?item ?itemLabel ?localLabel ?commons ?enwiki ?locwiki ?img ?sl WHERE {
  VALUES ?item { %(items)s }
  OPTIONAL { ?item wdt:P373 ?commons }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
  OPTIONAL { ?item rdfs:label ?localLabel FILTER(LANG(?localLabel) = "%(lang)s") }
  OPTIONAL {
    ?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ;
         schema:name ?enwiki .
  }
  OPTIONAL {
    ?artl schema:about ?item ; schema:isPartOf <https://%(lang)s.wikipedia.org/> ;
          schema:name ?locwiki .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

# One property per query, and that is the fix rather than the first draft.
#
# The obvious version asks for elevation, prominence and isolation in one go
# with a three way UNION. Written that way it answered HTTP 504 for both of
# Switzerland's chunks: the query service planned the union badly and ran out
# of time on 70 items. Three separate queries, each a plain VALUES join on one
# statement node, answer in a second apiece and cost three requests instead of
# one, which is a trade worth making for a field that decides the ranking.
QUANTITY_QUERY = """
SELECT ?item ?val ?unit ?rank WHERE {
  VALUES ?item { %(items)s }
  ?item p:%(prop)s ?st .
  ?st psv:%(prop)s ?node ; wikibase:rank ?rank .
  ?node wikibase:quantityAmount ?val ; wikibase:quantityUnit ?unit .
  FILTER(?rank != wikibase:DeprecatedRank)
}
"""

# property -> the field it fills. Elevation last on purpose: the spine already
# carries one, so this is a correction rather than the only source.
QUANTITY_PROPS = (("P2660", "prom"), ("P2659", "iso"), ("P2044", "ele"))

LIST_QUERY = """
SELECT ?item
       (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?classes)
       (GROUP_CONCAT(DISTINCT ?rangeLabel; separator="|") AS ?ranges)
       (GROUP_CONCAT(DISTINCT ?parkLabel; separator="|") AS ?parks)
       (GROUP_CONCAT(DISTINCT ?country; separator="|") AS ?countries)
WHERE {
  VALUES ?item { %(items)s }
  OPTIONAL { ?item wdt:P31 ?cls . ?cls rdfs:label ?clsLabel
             FILTER(LANG(?clsLabel) = "en") }
  OPTIONAL { ?item wdt:P4552 ?range . ?range rdfs:label ?rangeLabel
             FILTER(LANG(?rangeLabel) = "en") }
  OPTIONAL { ?item wdt:P3018 ?park . ?park rdfs:label ?parkLabel
             FILTER(LANG(?parkLabel) = "en") }
  OPTIONAL { ?item wdt:P17 ?country }
}
GROUP BY ?item
"""


COUNTRY_QUERY = """
SELECT ?item (GROUP_CONCAT(DISTINCT ?country; separator="|") AS ?countries)
WHERE {
  VALUES ?item { %(items)s }
  ?item wdt:P17 ?country .
}
GROUP BY ?item
"""


def quantities_for(by_qid, values):
    """Elevation, prominence and isolation for one chunk, with their units.

    Its own function because two callers need it: the full detail pass, and
    the cheap recheck that repairs a cache enriched before the rank rule
    existed without paying Commons a second time."""
    for prop, key in QUANTITY_PROPS:
        try:
            rows = sparql(QUANTITY_QUERY % {"items": values, "prop": prop})
        except (SourceError, ValueError) as exc:
            print(f"    detail {key} failed: {str(exc)[:90]}")
            continue
        # One item can carry six elevations. Mont Blanc has 4805.59,
        # 4807.02, 4807.81, 4808.06, 4808.72 and 4810.02, every one of
        # them a real survey, and reading "the last row Wikidata sent"
        # picks whichever the query planner felt like. So: the preferred
        # rank if there is one, and the median of the rest if there is
        # not, which is the value a reader would recognise.
        bucket = {}
        for row in rows:
            qid = qid_of(cell(row, "item"))
            if qid not in by_qid:
                continue
            unit = qid_of(cell(row, "unit"))
            try:
                value = float(cell(row, "val"))
            except (TypeError, ValueError):
                continue
            factor = (LEN_TO_M if key in ("ele", "prom") else LEN_TO_KM).get(unit)
            if factor is None:
                continue
            preferred = cell(row, "rank", "").endswith("PreferredRank")
            bucket.setdefault(qid, []).append((preferred, value * factor))
        for qid, values_seen in bucket.items():
            peak = by_qid[qid]
            best = [v for pref, v in values_seen if pref]
            chosen = (best[0] if len(best) == 1
                      else statistics.median([v for _p, v in values_seen]))
            if key == "ele" and 0 < chosen < 9000:
                peak["ele"] = round(chosen)
            elif key == "prom" and 0 <= chosen < 9000:
                peak["prom"] = round(chosen)
            elif key == "iso" and 0 <= chosen < 4000:
                peak["iso_km"] = round(chosen, 2)


def details_for(peaks, cc):
    """Fill prominence, isolation, Commons category, range, classes, park and
    the Wikipedia titles onto the shortlist, in place.

    Three queries rather than one. A single query with six OPTIONALs over a
    multi valued property is a cross product, and Wikidata answers a cross
    product by truncating it: the lake layer learned that the expensive way."""
    lang = LOCAL_LANG.get(cc, "en")
    by_qid = {p["wd"]: p for p in peaks if p.get("wd")}
    qids = list(by_qid)
    for i in range(0, len(qids), DETAIL_CHUNK):
        chunk = qids[i:i + DETAIL_CHUNK]
        values = " ".join(f"wd:{q}" for q in chunk)

        try:
            for row in sparql(SCALAR_QUERY % {"items": values, "lang": lang}):
                peak = by_qid.get(qid_of(cell(row, "item")))
                if not peak:
                    continue
                if cell(row, "commons"):
                    peak["commons_cat"] = cell(row, "commons")
                if cell(row, "localLabel") and not peak.get("name_local"):
                    peak["name_local"] = cell(row, "localLabel")
                if cell(row, "enwiki"):
                    peak["wiki_en"] = cell(row, "enwiki")
                if cell(row, "locwiki"):
                    peak["wiki_local"] = cell(row, "locwiki")
                if cell(row, "img") and not peak.get("wd_img"):
                    peak["wd_img"] = cell(row, "img")
                if cell(row, "sl"):
                    peak["sitelinks"] = max(peak.get("sitelinks") or 0,
                                            int(cell(row, "sl")))
        except (SourceError, ValueError) as exc:
            print(f"    detail scalars failed: {str(exc)[:90]}")

        quantities_for(by_qid, values)

        try:
            for row in sparql(LIST_QUERY % {"items": values}):
                peak = by_qid.get(qid_of(cell(row, "item")))
                if not peak:
                    continue
                classes = [c for c in (cell(row, "classes") or "").split("|") if c]
                ranges = [c for c in (cell(row, "ranges") or "").split("|") if c]
                parks = [c for c in (cell(row, "parks") or "").split("|") if c]
                # P17, kept as ids rather than labels because it is a
                # membership test rather than a sentence. The spine is tiled
                # by bounding box for the big countries, so Mont Blanc arrives
                # in Switzerland's tile and Triglav in Italy's. Both are true
                # statements about a rectangle and wrong answers on a country
                # page, and this is the field the export gate checks.
                countries = [qid_of(c) for c in
                             (cell(row, "countries") or "").split("|") if c]
                if classes:
                    peak["classes"] = classes[:6]
                if ranges:
                    peak["range"] = ranges[0]
                if parks:
                    peak["parks"] = parks[:3]
                if countries:
                    peak["countries"] = countries[:6]
        except (SourceError, ValueError) as exc:
            print(f"    detail lists failed: {str(exc)[:90]}")


# ---------------------------------------------------------------------------
# Wikimedia Commons: the photographs
# ---------------------------------------------------------------------------

BAD_FILE_RE = re.compile(
    r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu)$|"
    r"\b(map|karte|carte|mapa|topo|plan|blazon|coat[ _]of[ _]arms|flag|logo|"
    r"diagram|chart|graph|profile|section|sign|schild|panneau|stamp|"
    r"briefmarke|poster|screenshot|portrait|grave|tomb|monument to)\b", re.I)
SPECIES_RE = re.compile(r"^[A-Z][a-z]{3,}\s+[a-z]{4,}\b")

IMAGE_PROPS = {
    "prop": "imageinfo",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|ImageDescription",
}

# Words that say a photograph is OF a mountain rather than merely near one.
PEAK_WORD_RE = re.compile(
    r"\b(mount|mountain|peak|summit|berg|spitze|gipfel|horn|kogel|massif|"
    r"monte|cima|punta|corno|sasso|pizzo|pic|puy|aiguille|dent|pico|sierra|"
    r"vrh|planina|gora|hora|szczyt|hegy|varf|maja|tunturi|fjell|fjellet|"
    r"fjall|tind|topp|beinn|sgurr|mynydd|jokull|fell|volcano|vulkan|crater|"
    r"north face|nordwand|ridge|glacier|panorama|sunrise|sunset|alpenglow|"
    r"seen from|view of|from the)\b", re.I)


def commons_filename(url_or_name):
    """The Commons file title behind a Wikidata P18 value.

    P18 arrives either as a bare file name (the spine stores it that way) or
    as a Special:FilePath URL with the name percent encoded, and the API wants
    "File:Matterhorn.jpg"."""
    if not url_or_name:
        return ""
    text = str(url_or_name)
    if "Special:FilePath/" in text:
        text = text.split("Special:FilePath/", 1)[1]
    text = urllib.parse.unquote(text).replace("_", " ").strip()
    return f"File:{text}" if text and not text.startswith("File:") else text


# How wide to look for photographs, by what kind of thing this is. A summit
# photograph is usually geotagged where the photographer STOOD, which for a
# mountain is a valley away, so the circle is wide. A lowland hill or a sea
# cliff is small and specific and a wide circle would collect the next town.
GEO_RADIUS_M = {
    "peak": 5000, "volcano": 6000, "massif": 8000, "ridge": 6000,
    "plateau": 7000, "cliff": 2500, "rock": 2500, "hill": 2500,
}


def kind_hint(peak):
    seed = peak.get("seed") or {}
    if seed.get("kind"):
        return seed["kind"]
    classes = " ".join(peak.get("classes") or []).lower()
    if "volcano" in classes:
        return "volcano"
    if "hill" in classes:
        return "hill"
    if "cliff" in classes or "escarpment" in classes:
        return "cliff"
    if "massif" in classes or "mountain range" in classes:
        return "massif"
    if "plateau" in classes:
        return "plateau"
    return "peak"


def image_candidates(peak):
    """Commons files that plausibly show THIS mountain, best first.

    Four passes, strongest claim first. P18 is a curated statement that this
    picture depicts this item. A Commons CATEGORY is the second strongest and
    matters far more for mountains than it did for lakes: a famous summit has
    a category with two hundred photographs in it, and the category is the
    only place the good ones reliably are. Then a name search pinned to the
    coordinate, because a bare name search returns every Schwarzhorn in the
    Alps, and last a geosearch."""
    seen, out = set(), []
    queries = []
    for name in (peak.get("name"), peak.get("name_local"),
                 (peak.get("seed") or {}).get("name")):
        if name and fold(name) not in {fold(q) for q in queries}:
            queries.append(name)
    near_m = GEO_RADIUS_M.get(kind_hint(peak), 5000)
    if peak.get("seed"):
        near_m = int(near_m * 1.4)

    def collect(params, near=False, pinned=False, cat=False):
        try:
            data = mediawiki(params, api=COMMONS_API)
        except (SourceError, ValueError):
            return
        for page in (data.get("query") or {}).get("pages") or []:
            title = page.get("title") or ""
            if title in seen:
                continue
            seen.add(title)
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("url"):
                continue
            out.append({"title": title, "info": info, "near": near,
                        "pinned": pinned, "cat": cat})

    p18 = commons_filename(peak.get("wd_img"))
    if p18:
        collect({"titles": p18, **IMAGE_PROPS}, pinned=True)
    cat = peak.get("commons_cat")
    if cat:
        collect({"generator": "categorymembers", "gcmtitle": f"Category:{cat}",
                 "gcmtype": "file", "gcmlimit": 30, **IMAGE_PROPS}, cat=True)
    for name in queries[:2]:
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 16,
                 "gsrsearch": f"{name} filetype:bitmap "
                              f"nearcoord:25km,{peak['lat']},{peak['lon']}",
                 **IMAGE_PROPS})
        if len(out) >= IMAGES_WANTED + 8:
            break
    if len(out) < IMAGES_WANTED + 4:
        collect({"generator": "geosearch", "ggsnamespace": 6,
                 "ggscoord": f"{peak['lat']}|{peak['lon']}",
                 "ggsradius": near_m, "ggslimit": 24, **IMAGE_PROPS},
                near=True)
    return out


def score_image(cand, peak):
    """How likely this file is to be a usable photograph OF the mountain."""
    title = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    info = cand["info"]
    if BAD_FILE_RE.search(title) or SPECIES_RE.match(title):
        return -1
    width, height = info.get("width") or 0, info.get("height") or 0
    # A P18 outranks everything computable here, and 4.5 was not enough.
    #
    # It is the single strongest statement anybody has made about which
    # picture shows this item: a human put it on the Wikidata entity and it is
    # what Wikipedia leads with. Scored mid table it lost to whatever the
    # Commons category happened to return first, which is alphabetical, which
    # is how Spain's Teide ended up illustrated by "At Teide Observatory 2019
    # 054" while "Teide von Nordosten", 7,897 pixels of the mountain itself,
    # was not picked at all.
    if cand.get("pinned"):
        return 9.0 if width >= 400 and height >= 300 else -1
    if width < 800 or height < 500:
        return -1
    score = 0.0
    tokens = (name_tokens(peak.get("name")) | name_tokens(peak.get("name_local"))
              | name_tokens((peak.get("seed") or {}).get("name")))
    folded = fold(title)
    if tokens and any(t in folded for t in tokens):
        score += 3.0
        # A file NAMED after the mountain is a photograph of the mountain. A
        # file that mentions it three words in is usually a photograph of
        # something else with the mountain behind it.
        head = " ".join(folded.split()[:3])
        if any(t in head for t in tokens):
            score += 1.2
    if cand.get("cat"):
        score += 2.2          # somebody filed this under this mountain
    if re.search(r"\b(in the background|hintergrund|sfondo)\b", folded):
        score -= 1.6
    # A view FROM the summit is a fine third picture and a poor first one: it
    # shows everything except the mountain the card is about.
    if re.search(r"\b(from the summit|view from|blick vom|panorama from|"
                 r"gipfelblick|vom gipfel)\b", folded):
        score -= 0.7
    if PEAK_WORD_RE.search(folded):
        score += 0.9
    # A geosearch hit is a photograph taken AT the coordinate, which on a lake
    # shore means a picture of the lake and on a summit means a picture of
    # whatever is built up there: the mast, the sign, the terrace. Worth
    # something, worth much less than it was.
    if cand.get("near"):
        score += 0.4
    if width >= 2000:
        score += 0.6
    if width > height:
        score += 0.8                    # a hero card is a landscape crop
    if "panoramio" in folded:
        score -= 0.4
    if re.search(r"\b(aerial|drone|panorama|reflection|alpenglow|sunrise|"
                 r"sunset)\b", folded):
        score += 0.5
    # Snow is not a defect on a mountain the way it was on a lake, so there is
    # no winter penalty here. A ski lift photograph is, though: it is a
    # picture of a machine.
    if re.search(r"\b(chairlift|sessellift|gondola cabin|piste|ski slope|"
                 r"skilift|seilbahn kabine)\b", folded):
        score -= 0.5
    return score


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def pick_images(peak):
    cands = image_candidates(peak)
    ranked = sorted(((score_image(c, peak), c) for c in cands),
                    key=lambda pair: -pair[0])
    picked, seen_author = [], {}
    for score, cand in ranked:
        if score < 1.0 or len(picked) >= IMAGES_WANTED:
            continue
        info = cand["info"]
        meta = info.get("extmetadata") or {}

        def meta_val(key):
            return strip_html((meta.get(key) or {}).get("value", ""))

        licence = meta_val("LicenseShortName")
        if re.search(r"fair use|non[- ]free|copyright", licence, re.I):
            continue
        author = meta_val("Artist")[:120]
        # One photographer's whole afternoon is not a gallery. Two per author,
        # so a set of six is a set of angles rather than a contact sheet.
        if author:
            seen_author[author] = seen_author.get(author, 0) + 1
            if seen_author[author] > 2:
                continue
        picked.append({
            "file": cand["title"],
            "url": info.get("thumburl") or info.get("url"),
            "full": info.get("url"),
            "w": info.get("thumbwidth") or info.get("width"),
            "h": info.get("thumbheight") or info.get("height"),
            "license": licence,
            "license_url": meta_val("LicenseUrl"),
            "author": author,
            "caption": meta_val("ImageDescription")[:200],
            "pinned": bool(cand.get("pinned")),
            "page": "https://commons.wikimedia.org/wiki/"
                    + urllib.parse.quote(cand["title"].replace(" ", "_")),
        })
    return picked


# ---------------------------------------------------------------------------
# Wikipedia: facts and pageviews, never prose
# ---------------------------------------------------------------------------

def fetch_articles(items, lang):
    """[{peak, title}] -> {title: {extract, views}} for one wiki."""
    out = {}
    for i in range(0, len(items), WIKI_BATCH):
        chunk = items[i:i + WIKI_BATCH]
        try:
            data = mediawiki({
                "prop": "extracts|pageviews",
                "exintro": 1, "explaintext": 1, "exlimit": "max",
                "pvipdays": 60,
                "titles": "|".join(c["title"] for c in chunk),
                "redirects": 1,
            }, api=wikipedia_api(lang))
        except (SourceError, ValueError) as exc:
            print(f"    wikipedia {lang} batch failed: {str(exc)[:90]}")
            continue
        query = data.get("query") or {}
        alias = {r["from"]: r["to"] for r in query.get("redirects") or []}
        for page in query.get("pages") or []:
            title = page.get("title") or ""
            views = [v for v in (page.get("pageviews") or {}).values()
                     if isinstance(v, int)]
            out[title] = {
                "extract": (page.get("extract") or "")[:3000],
                "views": sum(views),
            }
        for src, dst in alias.items():
            if dst in out:
                out[src] = out[dst]
    return out


# The vocabulary the reasons are built from. Every entry is a fact we can
# point at a sentence in the article for, which is why this layer reads
# Wikipedia as data and never as text.
FACT_WORDS = {
    "glacier": r"\bglacier|\bglacial\b|\bicefield|\bgletscher|\bghiacciai|"
               r"\bjokull|\bsnowfield",
    "volcano": r"\bvolcano|\bvolcanic|\berupt|\bcrater|\bcaldera|\blava\b",
    "active_volcano": r"\bactive volcano|\bmost recent eruption|\berupted in "
                      r"(?:19|20)\d\d|\bcontinuously (?:erupt|active)",
    "limestone": r"\blimestone|\bdolomit|\bkarst|\bcalcare",
    "granite": r"\bgranite|\bgabbro|\bgneiss|\bquartzite",
    "cable_car": r"\bcable car|\bcablecar|\baerial tramway|\bgondola|"
                 r"\bseilbahn|\bfunivia|\btelepherique|\bteleferic",
    "funicular": r"\bfunicular|\bcog railway|\brack railway|\bstandseilbahn|"
                 r"\bzahnradbahn|\bcremagliera",
    "road_to_top": r"\broad (?:to|leads to) the (?:summit|top)|\btoll road|"
                   r"\bpanoramic road|\bauto route to",
    "hut": r"\bmountain hut|\brefuge\b|\bhutte\b|\brifugio|\bbothy|\bhostel "
           r"at the|\bshelter near the summit",
    "via_ferrata": r"\bvia ferrata|\bklettersteig|\bfixed rope|\bcables? (?:are|"
                   r"were) (?:fixed|installed)|\bchains? (?:help|assist)",
    "climbing": r"\bclimbing route|\brock climb|\balpinis|\bmountaineer|"
                r"\bfirst ascent|\bnorth face",
    "hiking": r"\bhiking (?:trail|route|path)|\bwaymarked|\bfootpath to the "
              r"summit|\bwalk(?:ing route)? to the top|\btrailhead",
    "ski": r"\bski resort|\bski area|\bpiste|\bdownhill skiing|\bski lift",
    "national_park": r"\bnational park|\bnature (?:park|reserve)|\bnatura 2000|"
                     r"\bprotected area|\bbiosphere",
    "unesco": r"\bunesco|\bworld heritage",
    "highest": r"\bhighest (?:mountain|peak|point|summit)",
    "prominent": r"\bmost prominent|\bultra[- ]prominent|\btopographic prominence",
    "observatory": r"\bobservatory|\bweather station|\btelescope",
    "chapel": r"\bchapel|\bcross (?:on|at) the summit|\bsummit cross|"
              r"\bmonastery|\bpilgrimage|\bshrine",
    "restaurant": r"\brestaurant (?:at|on) the (?:top|summit)|\bsummit "
                  r"restaurant|\brevolving restaurant|\bpanorama restaurant",
    "viewpoint": r"\bviewing platform|\bobservation (?:deck|platform|tower)|"
                 r"\bskywalk|\bpanoramic view|\bviewpoint",
    "lake_below": r"\blake (?:below|beneath|at its foot)|\btarn\b|\bcirque lake|"
                  r"\bglacial lake",
    # "Most visited" belongs here as much as "most photographed". Preikestolen's
    # article calls it one of the most visited natural attractions in Norway
    # and never uses the word iconic, and without this line the layer read that
    # as an ordinary cliff.
    "famous_photo": r"\bmost photographed|\bpostcard|\bemblematic|\biconic\b|"
                    r"\bsymbol of|\bbest[- ]known mountain|\bmost famous mountain|"
                    r"\bmost visited|\bmajor tourist attraction|\blandmark\b|"
                    r"\bone of the most (?:visited|popular|photographed)",
    "film": r"\bfilmed|\bfilm location|\bmovie was shot|\bjames bond",
    "crowded": r"\bcrowded|\bbusy\b|\bmass tourism|\bovertourism|\bqueue",
    "remote": r"\bremote\b|\bwilderness|\buninhabited|\bnearest road is",
    "dangerous": r"\bfatalit|\bdeaths?\b|\bavalanche|\brockfall|\baccidents",
    "wildlife": r"\bibex|\bchamois|\bgolden eagle|\bmarmot|\breindeer|\bvulture",
}


def article_facts(extract):
    text = extract or ""
    if not text:
        return []
    return sorted(k for k, pattern in FACT_WORDS.items()
                  if re.search(pattern, text, re.I))


# ---------------------------------------------------------------------------
# Overpass: the access layer
# ---------------------------------------------------------------------------

CONTEXT_HEAD = "[out:json][timeout:240];\n(\n"
CONTEXT_TAIL = ");\nout tags center;\n"

# Six clauses, and the list is short on purpose. highway=path unbounded was
# what nearly killed the lake layer's context pass, so paths are asked for
# only where they carry a GRADE: sac_scale and via_ferrata_scale are the two
# tags that say how hard this is, and they are rare enough to be affordable.
CONTEXT_CLAUSES = (
    'nwr(around:{r},{lat},{lon})'
    '["aerialway"~"^(cable_car|gondola|chair_lift|mixed_lift|drag_lift|'
    'j-bar|t-bar|platter|rope_tow|magic_carpet|station|pylon)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["railway"~"^(funicular|rack|narrow_gauge)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["tourism"~"^(alpine_hut|wilderness_hut|viewpoint|attraction|'
    'information|camp_site|hotel)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["amenity"~"^(restaurant|cafe|shelter|parking|toilets|bar)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["natural"~"^(peak|volcano|glacier|cliff|arete|saddle|ridge|'
    'cave_entrance|hot_spring|rock)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["man_made"~"^(tower|observatory|cross|survey_point|antenna)$"];\n'
    'way(around:{r},{lat},{lon})["sac_scale"];\n'
    'way(around:{r},{lat},{lon})["via_ferrata_scale"];\n'
    'nwr(around:{r},{lat},{lon})["boundary"="national_park"];\n'
)

CONTEXT_KEYS = ("aerialway", "railway", "tourism", "amenity", "natural",
                "man_made", "sac_scale", "via_ferrata_scale", "boundary",
                "leisure")

# The tags whose DISTANCE matters, not just their presence.
DISTANCE_KEYS = {
    "aerialway": "lift_m",
    "railway": "rail_m",
}
DISTANCE_TOURISM = {"alpine_hut": "hut_m", "wilderness_hut": "hut_m",
                    "viewpoint": "viewpoint_m"}
DISTANCE_AMENITY = {"restaurant": "food_m", "cafe": "food_m",
                    "parking": "parking_m", "shelter": "shelter_m"}

CONTEXT_RADIUS = {
    "peak": 2600, "volcano": 3200, "massif": 4000, "ridge": 3200,
    "plateau": 3600, "cliff": 1800, "rock": 1500, "hill": 1800,
}


def context_radius_m(peak):
    return CONTEXT_RADIUS.get(kind_hint(peak), 2600)


def context_for(batch):
    """{peak key: {counts, near}} for a batch.

    Overpass answers one blob for the whole query with no way to say which
    around clause produced which element, so every element goes to the nearest
    peak of the batch that could plausibly own it, and the distance is kept.
    Batches are built from summits that are far apart for exactly that reason
    (see split_batches)."""
    if not batch:
        return {}
    query = CONTEXT_HEAD + "".join(
        CONTEXT_CLAUSES.format(r=context_radius_m(b), lat=b["lat"], lon=b["lon"])
        for b in batch) + CONTEXT_TAIL
    try:
        elements = overpass(query, timeout=300)
    except SourceError as exc:
        print(f"    context batch failed: {str(exc)[:90]}")
        return {}
    out = {b["wd"]: {"tags": {}, "near": {}, "names": {}} for b in batch}
    for el in elements:
        tags = el.get("tags") or {}
        centre = el.get("center") or {}
        lat = el.get("lat", centre.get("lat"))
        lon = el.get("lon", centre.get("lon"))
        if lat is None or lon is None:
            continue
        best, best_km = None, None
        for b in batch:
            km = haversine_km(b["lat"], b["lon"], lat, lon)
            if km > context_radius_m(b) / 1000.0 * 1.3:
                continue
            if best_km is None or km < best_km:
                best, best_km = b, km
        if best is None:
            continue
        bucket = out[best["wd"]]
        metres = int(best_km * 1000)
        for key in CONTEXT_KEYS:
            value = tags.get(key)
            if not value:
                continue
            bucket["tags"][f"{key}={value}"] = bucket["tags"].get(f"{key}={value}", 0) + 1
            field = None
            if key in DISTANCE_KEYS:
                field = DISTANCE_KEYS[key]
            elif key == "tourism":
                field = DISTANCE_TOURISM.get(value)
            elif key == "amenity":
                field = DISTANCE_AMENITY.get(value)
            if field and (field not in bucket["near"] or metres < bucket["near"][field]):
                bucket["near"][field] = metres
            # The name of the lift or the hut is worth keeping: "you can ride
            # the Nordkettenbahn" is a better sentence than "there is a lift".
            name = tags.get("name")
            if name and key == "aerialway" and value in ("cable_car", "gondola",
                                                         "station", "chair_lift"):
                bucket["names"].setdefault("lift", name[:60])
            if name and key == "railway" and value in ("funicular", "rack"):
                bucket["names"].setdefault("rail", name[:60])
            if name and key == "tourism" and value in ("alpine_hut", "wilderness_hut"):
                bucket["names"].setdefault("hut", name[:60])
            if name and key == "boundary" and value == "national_park":
                bucket["names"].setdefault("park", name[:60])
        # A summit node for this mountain carries facts nothing else does.
        if tags.get("natural") in ("peak", "volcano") and best_km < 0.35:
            if tags.get("ele"):
                bucket.setdefault("osm_ele", tags["ele"][:12])
            if tags.get("summit:cross") == "yes":
                bucket["tags"]["summit:cross=yes"] = 1
            if tags.get("summit:register") == "yes":
                bucket["tags"]["summit:register=yes"] = 1
            if tags.get("prominence"):
                bucket.setdefault("osm_prom", tags["prominence"][:12])
    return out


BATCH_MIN_KM = 9.0


def split_batches(peaks, size=OSM_BATCH):
    """Batches whose members are far enough apart that the nearest-peak
    assignment above is not a coin toss.

    Two summits 2 km apart in one batch share every cable car between them,
    and in the Alps that is the normal case rather than the exception.
    Sorting by longitude and dealing round robin puts neighbours in DIFFERENT
    batches, which is the cheap version of the right answer."""
    ordered = sorted(peaks, key=lambda b: (b["lon"], b["lat"]))
    n_batches = max(1, math.ceil(len(ordered) / size))
    buckets = [[] for _ in range(n_batches)]
    for i, peak in enumerate(ordered):
        buckets[i % n_batches].append(peak)
    out = []
    for bucket in buckets:
        keep, spill = [], []
        for peak in bucket:
            if any(haversine_km(peak["lat"], peak["lon"], k["lat"], k["lon"])
                   < BATCH_MIN_KM for k in keep):
                spill.append(peak)
            else:
                keep.append(peak)
        out.append(keep)
        while spill:
            out.append(spill[:size])
            spill = spill[size:]
    return [b for b in out if b]


# ---------------------------------------------------------------------------
# Season, estimated and said to be
# ---------------------------------------------------------------------------

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep",
          "oct", "nov", "dec"]


def season_estimate(peak):
    """The months a walker would normally find this summit snow free.

    An ESTIMATE, from elevation and latitude, and the wire says so: the app
    labels it "typically" and never as a condition report. Snow line in the
    Alps sits near 2,400 m in July and near 1,000 m in April, and every 10
    degrees of latitude north is worth roughly 500 m of it. A lift served
    summit is a different question and is not answered here: the lift's own
    season is operator data this layer does not have.
    """
    ele = peak.get("ele")
    if ele is None:
        return None
    lat = abs(peak.get("lat") or 45.0)
    # Effective height, and the latitude term runs BOTH ways. The first
    # version only added height going north, which gave Teide, a 3,715 m
    # volcano at 28 degrees where people walk up in February, the two month
    # season of a 3,715 m Alp. 45 degrees is the pivot because that is where
    # the Alps are, which is where the snow line figures come from.
    effective = ele + (lat - 45.0) * 55.0
    if effective < 900:
        return {"from": "jan", "to": "dec", "n": 12, "est": True}
    if effective < 1500:
        return {"from": "apr", "to": "nov", "n": 8, "est": True}
    if effective < 2200:
        return {"from": "jun", "to": "oct", "n": 5, "est": True}
    if effective < 3000:
        return {"from": "jul", "to": "sep", "n": 3, "est": True}
    return {"from": "jul", "to": "aug", "n": 2, "est": True}


# ---------------------------------------------------------------------------
# The country pass
# ---------------------------------------------------------------------------

def join_local(peak, dests):
    """The nearest priced place, so a mountain can say which trip it is on."""
    if not dests:
        return
    hit, km = dests.nearest(peak["lat"], peak["lon"], DEST_MAX_KM)
    if hit:
        peak["near"] = {"city": hit["city"], "dest_id": hit["id"],
                        "km": round(km, 1), "iso2": hit.get("iso2") or ""}


def context_only(cc):
    """Run the Overpass pass over a country that is already enriched.

    Overpass is the one source in this layer that is regularly unreachable:
    the public instance refused every connection for an hour during this
    build, and the two mirrors answered a bare 500. Everything else here
    (Wikidata, Commons, Wikipedia) was fine throughout.

    So the two are separable. `--no-context` publishes a country without the
    access layer, and this fills it in later without paying for the
    photographs again. It is also the honest shape for the wire: a mountain
    with no OSM sweep says nothing about lifts rather than guessing."""
    rich = load_cache(STAGE_OUT, cc)
    if rich is None or not rich.get("peaks"):
        print(f"  {cc}: nothing enriched yet")
        return None
    peaks = rich["peaks"]
    todo = [p for p in peaks if not p.get("osm")]
    if not todo:
        print(f"  {cc}: context already complete")
        return rich
    batches = split_batches(todo)
    print(f"  {cc}: {len(todo)} without context, {len(batches)} batches")
    got_any = False
    for i, batch in enumerate(batches, 1):
        found = context_for(batch)
        for peak in batch:
            hit = found.get(peak["wd"])
            if hit:
                peak["osm"] = hit
                got_any = True
        if i % 3 == 0:
            print(f"      {i}/{len(batches)}")
    if not got_any:
        print(f"  {cc}: Overpass gave nothing back, cache left alone")
        return rich
    rich["context_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_cache(STAGE_OUT, cc, rich)
    have = sum(1 for p in peaks if p.get("osm"))
    print(f"  {cc}: {have}/{len(peaks)} with context")
    return rich


def resync_seeds(cc):
    """Re-apply the harvest's seed pins to a rich cache already on disk.

    The seed decides which row is the Jungfrau and what its way up is, and
    both of those live in the harvest. When the matcher improves, the raw
    cache changes and the rich cache is suddenly pinning the wrong item, but
    every photograph in it is still perfectly good. This copies the pins
    across rather than paying Commons a second time for the same six files.

    Rows that are no longer in the raw shortlist are dropped, which is also
    how a country repairs itself after the pool stops leaking foreign
    mountains into it."""
    raw = load_cache(STAGE_IN, cc)
    rich = load_cache(STAGE_OUT, cc)
    if raw is None or rich is None or not rich.get("peaks"):
        print(f"  {cc}: nothing to resync")
        return None
    pins = {}
    for row in raw.get("peaks") or []:
        if row.get("wd"):
            pins[row["wd"]] = row
    kept, dropped, changed = [], 0, 0
    for peak in rich["peaks"]:
        pin = pins.get(peak.get("wd"))
        if pin is None:
            dropped += 1
            continue
        before = peak.get("seed")
        if pin.get("seed"):
            if before != pin["seed"]:
                changed += 1
            peak["seed"] = pin["seed"]
        elif before:
            peak.pop("seed", None)
            changed += 1
        # The pre score, the provenance and the NAME move across too, so a
        # later reader of the rich cache sees the same row the harvest
        # published. The name matters: it is a harvest-owned field, and a
        # harvest fix (a label that came back as a bare Wikidata id, say)
        # would otherwise never reach a cache that already has its
        # photographs.
        for key in ("pre", "src", "highpoint_of", "name", "name_local"):
            if key in pin and pin[key]:
                peak[key] = pin[key]
        kept.append(peak)
    rich["peaks"] = kept
    save_cache(STAGE_OUT, cc, rich)
    print(f"  {cc}: {len(kept)} kept, {dropped} dropped, {changed} pins changed")
    return rich


def recheck_country(cc):
    """Re-read the cheap Wikidata fields onto a rich cache already on disk.

    Four queries per 70 rows and nothing else: the country (P17), which the
    export gate needs to keep Mont Blanc out of Switzerland, and the three
    measurements, which want re-reading whenever the rank rule changes. A
    country that already cost an hour of Commons time does not pay it again
    to answer either question."""
    rich = load_cache(STAGE_OUT, cc)
    if rich is None or not rich.get("peaks"):
        print(f"  {cc}: nothing enriched yet")
        return None
    peaks = rich["peaks"]
    todo = [p for p in peaks if p.get("wd")]
    if not todo:
        print(f"  {cc}: nothing with a Wikidata id")
        return rich
    by_qid = {p["wd"]: p for p in todo}
    qids = list(by_qid)
    found = 0
    for i in range(0, len(qids), DETAIL_CHUNK):
        values = " ".join(f"wd:{q}" for q in qids[i:i + DETAIL_CHUNK])
        # The measurements are re-read at the same time. They are three cheap
        # queries on ids we already have, and they repair every cache enriched
        # before the preferred-rank rule existed, where "the last elevation
        # Wikidata happened to send" put 4,887 m on Mont Blanc's card.
        quantities_for(by_qid, values)
        try:
            rows = sparql(COUNTRY_QUERY % {"items": values})
        except (SourceError, ValueError) as exc:
            print(f"    country check failed: {str(exc)[:90]}")
            save_cache(STAGE_OUT, cc, rich)
            return rich
        for row in rows:
            peak = by_qid.get(qid_of(cell(row, "item")))
            if not peak:
                continue
            countries = [qid_of(c) for c in
                         (cell(row, "countries") or "").split("|") if c]
            if countries:
                peak["countries"] = countries[:6]
                found += 1
    # The articles too. Facts are derived from the text, which this layer
    # never stores, so a widened vocabulary only reaches an existing cache by
    # reading them again. Twenty titles a request, six requests a country.
    wikipedia_facts(peaks, cc)
    # The season falls out of elevation and latitude, so it is recomputed
    # after the measurements have been repaired rather than left stale.
    for peak in peaks:
        peak["season"] = season_estimate(peak)
    save_cache(STAGE_OUT, cc, rich)
    print(f"  {cc}: {found}/{len(todo)} rows carry a country, measurements, "
          f"facts and season refreshed")
    return rich


def wikipedia_facts(peaks, cc):
    """Pageviews and article facts onto a list of peaks, in place.

    English first because pageviews there are the comparable signal across 43
    countries, then the local wiki because a mountain nobody wrote about in
    English can still be famous at home.

    Its own function because the recheck pass needs it: facts are derived from
    the article text, which is deliberately never cached (it is CC BY-SA prose
    and this layer stores facts, not sentences), so widening the vocabulary
    means reading the articles again. They are cheap. The photographs are not.
    """
    lang = LOCAL_LANG.get(cc, "en")
    for wiki_lang, key in (("en", "wiki_en"), (lang, "wiki_local")):
        items = [{"peak": p, "title": p[key]} for p in peaks if p.get(key)]
        if not items or (wiki_lang == "en" and key == "wiki_local"):
            continue
        found = fetch_articles(items, wiki_lang)
        for item in items:
            hit = found.get(item["title"])
            if not hit:
                continue
            peak = item["peak"]
            if wiki_lang == "en":
                peak["views_en"] = hit["views"]
                peak["facts"] = article_facts(hit["extract"])
                peak["extract_len"] = len(hit["extract"])
            else:
                peak["views_local"] = hit["views"]
                local_facts = set(peak.get("facts") or []) | set(
                    article_facts(hit["extract"]))
                peak["facts"] = sorted(local_facts)


def enrich_country(cc, refresh=False, dests=None, images=True, context=True,
                   top=ENRICH_TOP):
    raw = load_cache(STAGE_IN, cc)
    if raw is None:
        print(f"  {cc}: no raw cache, harvest first")
        return None
    if not refresh:
        done = load_cache(STAGE_OUT, cc)
        if done is not None:
            print(f"  {cc}: cached")
            return done

    # What the previous cache already knows, kept even when this run is told
    # to skip the source that produced it.
    #
    # Straight out of the lake layer's scar tissue (docs/LAKES.md): --no-images
    # there put the REUSE of cached photographs inside the same branch as the
    # fetching, so a run started with --no-images rewrote two countries with no
    # pictures in them and both silently vanished from the next export. A
    # switch controls the network. It does not control the data.
    previous = {}
    old_cache = load_cache(STAGE_OUT, cc)
    for row in (old_cache or {}).get("peaks") or []:
        if row.get("wd"):
            previous[row["wd"]] = row

    everything = [dict(p) for p in raw.get("peaks") or []]
    if not everything:
        print(f"  {cc}: nothing shortlisted")
        return None
    ranked = sorted(everything, key=lambda p: -(p.get("pre") or 0))
    peaks = ranked[:top]
    have = {p.get("wd") for p in peaks}
    peaks += [p for p in ranked[top:] if p.get("seed") and p.get("wd") not in have]
    lang = LOCAL_LANG.get(cc, "en")
    print(f"  {cc}: {len(peaks)} of {len(everything)} shortlisted rows enriched")

    details_for(peaks, cc)
    for peak in peaks:
        peak["season"] = season_estimate(peak)
        join_local(peak, dests)

    wikipedia_facts(peaks, cc)

    if not context:
        kept = 0
        for peak in peaks:
            got = (previous.get(peak.get("wd")) or {}).get("osm")
            if got:
                peak["osm"] = got
                kept += 1
        if kept:
            print(f"    overpass skipped, {kept} sweeps carried over")

    if context:
        batches = split_batches(peaks)
        print(f"    overpass: {len(batches)} batches")
        for i, batch in enumerate(batches, 1):
            found = context_for(batch)
            for peak in batch:
                got = found.get(peak["wd"])
                if got:
                    peak["osm"] = got
            if i % 3 == 0:
                print(f"      {i}/{len(batches)}")

    if images:
        print("    photographs")
        with ThreadPoolExecutor(max_workers=IMAGE_WORKERS) as pool:
            for peak, shots in zip(peaks, pool.map(pick_images, peaks)):
                peak["images"] = shots
        have = sum(1 for p in peaks if len(p.get("images") or []) >= 2)
        print(f"      {have}/{len(peaks)} with two or more")
    else:
        kept = 0
        for peak in peaks:
            shots = (previous.get(peak.get("wd")) or {}).get("images")
            if shots:
                peak["images"] = shots
                kept += 1
        print(f"    photographs skipped, {kept} sets carried over")

    payload = {
        "cc": cc,
        "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "harvested_at": raw.get("harvested_at"),
        "pool": raw.get("pool"),
        "seed_missing": raw.get("seed_missing") or [],
        "peaks": peaks,
    }
    save_cache(STAGE_OUT, cc, payload)
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--no-images", action="store_true")
    parser.add_argument("--no-context", action="store_true")
    parser.add_argument("--top", type=int, default=ENRICH_TOP)
    parser.add_argument("--resync-seeds", action="store_true",
                        help="re-apply the harvest seed pins to the "
                             "rich caches, dropping rows the "
                             "shortlist no longer holds")
    parser.add_argument("--recheck-country", action="store_true",
                        help="fill P17 onto caches enriched before "
                             "the country check existed")
    parser.add_argument("--context-only", action="store_true",
                        help="run only the Overpass pass over what is "
                             "already enriched")
    args = parser.parse_args()

    from harvest_peaks import COUNTRIES
    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES
    dests = NearIndex(build_dest_index())
    for cc in countries:
        try:
            if args.resync_seeds:
                resync_seeds(cc)
                continue
            if args.recheck_country:
                recheck_country(cc)
                continue
            if args.context_only:
                context_only(cc)
                continue
            enrich_country(cc, refresh=args.refresh, dests=dests,
                           images=not args.no_images,
                           context=not args.no_context, top=args.top)
        except KeyboardInterrupt:
            raise
        except Exception as exc:                      # noqa: BLE001
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
