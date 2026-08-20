"""Stage 2 of the beach layer: turn a name and a coordinate into a beach we
can actually rank, photograph and describe.

Stage 1 found every named beach in Europe. Most of them we will never publish,
so the expensive work is spent on a shortlist and nothing else. The cheap
joins run over everything, the shortlist is cut from those, and only then do
we spend a network call per beach.

  free, local, over every beach
    bathing water   the EEA WISE site nearest the beach (cache/eea_bathing_
                    water.json, already harvested): Excellent to Poor, the
                    only audited water quality signal that covers the
                    continent.
    protection      the nearest protected area (cache/osm_protected_areas
                    .json): national park, nature reserve, Natura 2000.
    catalogue       the nearest priced destination, which becomes the "base"
                    line on the card and the tap through to prices.

  paid for in requests, over the shortlist only
    photographs     three or four from Wikimedia Commons, found by name AND
                    coordinate, each with its licence and author kept for the
                    credit line.
    article facts   the Wikipedia extract read as a FACT source: substrate,
                    water colour, setting, access, what is famous about it.
                    Its prose is never shipped, and the pageview count comes
                    back in the same call as a second fame signal.
    ground truth    one Overpass pass per batch of beaches for what is
                    actually there: cliffs, dunes, pines, a cave, a pier, a
                    lighthouse, parking, toilets, showers, food, and how many
                    hotels stand within 400 m, which is the difference between
                    a wild cove and a resort strip.

Writes cache/beaches/rich_CC.json. Idempotent per country and per beach: a
re-run only enriches what has no answer yet, so an interrupted run picks up
where it stopped.

Usage, from the repo root:
    python pipeline/beaches/enrich_beaches.py --countries GR
    python pipeline/beaches/enrich_beaches.py                # every harvested
    python pipeline/beaches/enrich_beaches.py --countries HR --shortlist 300
    python pipeline/beaches/enrich_beaches.py --countries HR --refresh
"""

import argparse
import concurrent.futures
import json
import math
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from sources import (COMMONS_API, SourceError, haversine_km,  # noqa: E402
                     load_cache, mediawiki, overpass, save_cache,
                     wikipedia_api)
from harvest_beaches import COUNTRIES, LOCAL_LANG, fold, name_tokens  # noqa: E402

ROOT = HERE.parents[1]
CACHE = ROOT / "cache"
MASTER = ROOT / "app_data" / "app_data.json"
DEST_INDEX = CACHE / "beaches" / "dest_index.json"

STAGE_IN = "raw"
STAGE_OUT = "rich"

SHORTLIST = 170          # beaches per country that earn the network calls
IMAGES_WANTED = 4
IMAGE_WORKERS = 2        # Commons calls in flight during the photograph pass
BATHING_MAX_KM = 2.5     # a bathing water further out is not this beach's
PROTECTED_MAX_KM = 6.0
DEST_MAX_KM = 90.0
CONTEXT_RADIUS_M = 400
OSM_BATCH = 12           # beaches per Overpass request
# Twelve, not thirty. Each beach in a batch adds five spatial lookups, so
# thirty is a 150 clause query, and on a loaded endpoint that is the
# difference between an answer and a 504. Italy spent twenty five minutes
# failing every mirror at thirty and went through at twelve.
WIKI_BATCH = 20          # titles per MediaWiki request


# ---------------------------------------------------------------------------
# Local joins
# ---------------------------------------------------------------------------

def _grid_key(lat, lon):
    return (int(math.floor(lat * 10)), int(math.floor(lon * 10)))


class NearIndex:
    """A 0.1 degree grid over point features, so 30,000 beaches can each ask
    "what is near me" without a 22,000 row scan apiece."""

    def __init__(self, points):
        self.cells = {}
        for p in points:
            self.cells.setdefault(_grid_key(p["lat"], p["lon"]), []).append(p)

    def nearest(self, lat, lon, max_km, where=None):
        best, best_km = None, max_km
        span = int(math.ceil(max_km / 8.0)) + 1
        base = _grid_key(lat, lon)
        for dy in range(-span, span + 1):
            for dx in range(-span, span + 1):
                for p in self.cells.get((base[0] + dy, base[1] + dx), ()):
                    if where and not where(p):
                        continue
                    km = haversine_km(lat, lon, p["lat"], p["lon"])
                    if km < best_km:
                        best, best_km = p, km
        return (best, best_km) if best else (None, None)


def load_bathing():
    path = CACHE / "eea_bathing_water.json"
    if not path.exists():
        print("  note: no EEA bathing water cache, water quality skipped")
        return NearIndex([])
    rows = json.loads(path.read_text(encoding="utf-8"))
    return NearIndex([r for r in rows
                      if r.get("lat") is not None and r.get("lon") is not None])


def load_protected():
    path = CACHE / "osm_protected_areas.json"
    if not path.exists():
        return NearIndex([])
    raw = json.loads(path.read_text(encoding="utf-8"))
    points = [v for v in (raw.get("by_key") or {}).values()
              if v.get("lat") is not None and v.get("lon") is not None]
    return NearIndex(points)


def build_dest_index(refresh=False):
    """Slim {id, city, country, iso2, lat, lon} for every priced place.

    Read once from the 68 MB master and cached, because the enrich stage runs
    per country and nobody should pay that load 30 times."""
    if DEST_INDEX.exists() and not refresh:
        return json.loads(DEST_INDEX.read_text(encoding="utf-8"))
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
                    "country": d.get("country") or "", "iso2": d.get("iso2") or "",
                    "lat": float(lat), "lon": float(lon)})
    DEST_INDEX.parent.mkdir(parents=True, exist_ok=True)
    DEST_INDEX.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"  catalogue index: {len(out)} priced places")
    return out


BATHING_RANK = {"Excellent": 3, "Good": 2, "Sufficient": 1, "Poor": 0}


def join_local(beach, bathing, protected, dests):
    """The three joins that cost nothing but a lookup."""
    lat, lon = beach["lat"], beach["lon"]

    # Water quality. Coastal sites first: a lake site 2 km inland says nothing
    # about a sea beach, and the reverse is just as wrong.
    coastal = beach.get("_coastal", True)
    want = ("Coastal", "Transitional") if coastal else ("Lake", "River")
    site, km = bathing.nearest(lat, lon, BATHING_MAX_KM,
                               where=lambda p: p.get("type") in want)
    if site is None:
        site, km = bathing.nearest(lat, lon, BATHING_MAX_KM)
    if site is not None:
        beach["water"] = {
            "class": site.get("q") or "",
            "class_prev": site.get("q3") or "",
            "site": site.get("name") or "",
            "type": site.get("type") or "",
            "km": round(km, 2),
        }

    area, km = protected.nearest(lat, lon, PROTECTED_MAX_KM)
    if area is not None:
        beach["protected_area"] = {
            "name": area.get("name") or "",
            "kind": area.get("kind") or "",
            "national_park": bool(area.get("np")),
            "notable": bool(area.get("notable")),
            "km": round(km, 2),
        }

    dest, km = dests.nearest(lat, lon, DEST_MAX_KM)
    if dest is not None:
        beach["base"] = {"id": dest["id"], "city": dest["city"],
                         "country": dest["country"], "km": round(km, 1)}


# ---------------------------------------------------------------------------
# Shortlist: who earns the network calls
# ---------------------------------------------------------------------------

SURFACE_GOOD = {"sand", "fine_gravel", "pebblestone", "pebbles", "gravel",
                "shingle", "shells", "rock", "sand;pebblestone"}


def prelim_score(b):
    """Cheap pre score, used ONLY to pick who gets enriched.

    Fame is capped hard on purpose. If this were the ranking it would return
    the ten beaches everyone already knows; here it just has to keep the
    obviously publishable ones in, and it leans as much on "somebody mapped
    this carefully" and "the water is clean and the coast is protected" as on
    "an encyclopedia wrote about it"."""
    score = 0.0
    sl = b.get("sitelinks") or 0
    score += min(3.0, math.log1p(sl) * 1.1)
    if b.get("wd_img"):
        score += 1.2
    if b.get("commons_cat"):
        score += 0.9
    if b.get("enwiki"):
        score += 0.8
    if b.get("localwiki"):
        score += 0.4

    tags = b.get("osm_tags") or {}
    if tags.get("surface") in SURFACE_GOOD:
        score += 0.5
    if tags.get("wikidata") or tags.get("wikipedia"):
        score += 0.4
    if tags.get("nudism") in ("yes", "designated", "customary"):
        score += 0.2
    if tags.get("supervised") == "yes" or tags.get("lifeguard") == "yes":
        score += 0.2
    if tags.get("blue_flag") == "yes":
        score += 0.6
    if len(tags) >= 5:
        score += 0.3

    water = b.get("water") or {}
    score += 0.45 * BATHING_RANK.get(water.get("class"), 0)
    area = b.get("protected_area") or {}
    if area:
        score += 0.8 if area.get("national_park") else 0.45
        if area.get("notable"):
            score += 0.3
    if b.get("protected"):
        score += 0.4
    base = b.get("base") or {}
    if base and base.get("km", 999) <= 45:
        score += 0.3
    # A beach nobody can reach and nobody has heard of, with no water reading
    # and no tags, is a polygon. Distinctive names still get a look in.
    if name_tokens(b.get("name")):
        score += 0.2
    return round(score, 3)


# ---------------------------------------------------------------------------
# Wikimedia Commons: the photographs
# ---------------------------------------------------------------------------

BAD_FILE_RE = re.compile(
    r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu)$|"
    r"\b(map|karte|carte|mapa|plan|blazon|coat[ _]of[ _]arms|flag|logo|"
    r"diagram|chart|graph|sign|schild|panneau|stamp|briefmarke|poster|"
    r"screenshot|portrait|grave|tomb)\b", re.I)

# Species pages get filed under the beach they were photographed on, so a
# search for Elafonissi returns a spider. Two capitalised Latin looking words
# at the head of a file name is the tell.
SPECIES_RE = re.compile(r"^[A-Z][a-z]{3,}\s+[a-z]{4,}\b")


def commons_filename(url_or_name):
    if not url_or_name:
        return ""
    text = str(url_or_name)
    if "Special:FilePath/" in text:
        text = text.split("Special:FilePath/", 1)[1]
    text = urllib.parse.unquote(text)
    return text.replace("_", " ").strip()


IMAGE_PROPS = {
    "prop": "imageinfo",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|ImageDescription",
}

# How close a photograph has to have been taken for its subject to be this
# beach even when nothing in its title says so. 300 m is about the length of a
# cove: at that range, on a coast, the camera was pointed at the water.
GEO_NEAR_M = 300


def image_candidates(beach, lang):
    """Commons files that plausibly show THIS beach, best first.

    Three passes, all anchored on the coordinate.

    The Commons category and the name-plus-nearcoord search are the precise
    ones: a name search alone returns every Playa de la Concha in the Spanish
    speaking world, and nearcoord pins it to this one. But they only find
    beaches somebody has NAMED a file after, which on the first Albanian run
    was 22 of 141: the small coves, the ones this layer exists to surface,
    have photographs on Commons under the name of the bay, the village or the
    photographer's holiday.

    So the third pass is a plain geosearch with a tight radius, and the
    relevance test moves from the file name to the camera position. Whatever
    it returns is still scored and filtered by score_image()."""
    seen, out = set(), []
    queries = []
    for name in (beach.get("name"), beach.get("name_local")):
        if name and fold(name) not in {fold(q) for q in queries}:
            queries.append(name)
    cat = beach.get("commons_cat")

    def collect(params, near=False):
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
            out.append({"title": title, "info": info, "near": near})

    if cat:
        collect({"generator": "categorymembers", "gcmtitle": f"Category:{cat}",
                 "gcmtype": "file", "gcmlimit": 12, **IMAGE_PROPS})
    for name in queries[:2]:
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 10,
                 "gsrsearch": f"{name} filetype:bitmap "
                              f"nearcoord:4km,{beach['lat']},{beach['lon']}",
                 **IMAGE_PROPS})
        if len(out) >= IMAGES_WANTED + 3:
            break
    if len(out) < IMAGES_WANTED:
        collect({"generator": "geosearch", "ggsnamespace": 6,
                 "ggscoord": f"{beach['lat']}|{beach['lon']}",
                 "ggsradius": GEO_NEAR_M, "ggslimit": 12, **IMAGE_PROPS},
                near=True)
    return out


def score_image(cand, beach):
    """How likely this file is to be a usable photograph OF the beach."""
    title = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    info = cand["info"]
    if BAD_FILE_RE.search(title) or SPECIES_RE.match(title):
        return -1
    width, height = info.get("width") or 0, info.get("height") or 0
    if width < 800 or height < 500:
        return -1
    score = 0.0
    tokens = name_tokens(beach.get("name")) | name_tokens(beach.get("name_local"))
    folded = fold(title)
    if tokens and any(t in folded for t in tokens):
        score += 3.0
    if re.search(r"\b(beach|strand|playa|praia|plage|spiaggia|cala|plaza|"
                 r"paralia|bay|cove|coast|kust)\b", folded):
        score += 1.0
    # Taken within GEO_NEAR_M of the beach. On a coast that is close enough to
    # be the beach even when the file name says nothing, which is the only way
    # an unnamed cove ever gets a picture. Worth less than a name match on
    # purpose: it is the weaker claim, and it loses to one when both exist.
    if cand.get("near"):
        score += 1.6
    if width >= 2000:
        score += 0.6
    if width > height:
        score += 0.8                     # a hero card is a landscape crop
    if "panoramio" in folded:
        score -= 0.4                     # bulk import, often mediocre
    if re.search(r"\b(aerial|from above|drone|panorama)\b", folded):
        score += 0.5
    return score


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def pick_images(beach, lang):
    cands = image_candidates(beach, lang)
    ranked = sorted(((score_image(c, beach), c) for c in cands),
                    key=lambda pair: -pair[0])
    picked = []
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
        picked.append({
            "file": cand["title"],
            "url": info.get("thumburl") or info.get("url"),
            "full": info.get("url"),
            "w": info.get("thumbwidth") or info.get("width"),
            "h": info.get("thumbheight") or info.get("height"),
            "license": licence,
            "license_url": meta_val("LicenseUrl"),
            "author": meta_val("Artist")[:120],
            "caption": meta_val("ImageDescription")[:200],
            "page": "https://commons.wikimedia.org/wiki/"
                    + urllib.parse.quote(cand["title"].replace(" ", "_")),
        })
    return picked


# ---------------------------------------------------------------------------
# Wikipedia: facts and pageviews, never prose
# ---------------------------------------------------------------------------

def wiki_title(url):
    if not url:
        return ""
    return urllib.parse.unquote(url.rsplit("/", 1)[-1]).replace("_", " ")


def fetch_articles(items, lang):
    """[{beach, title}] -> {title: {extract, views}} for one wiki."""
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
            print(f"    wikipedia {lang} batch failed: {exc}")
            continue
        query = data.get("query") or {}
        # Redirects mean the answer can come back under a different title.
        alias = {r["from"]: r["to"] for r in query.get("redirects") or []}
        for page in query.get("pages") or []:
            title = page.get("title") or ""
            views = [v for v in (page.get("pageviews") or {}).values()
                     if isinstance(v, int)]
            out[title] = {
                "extract": (page.get("extract") or "")[:2400],
                "views": sum(views),
            }
        for src, dst in alias.items():
            if dst in out:
                out[src] = out[dst]
    return out


# The vocabulary the description is built from. Every entry is a fact we can
# point at a sentence in the article for, which is the whole reason the layer
# reads Wikipedia as data and never as text: facts are not copyrightable, the
# sentences that carry them are.
FACT_WORDS = {
    "sand": r"\bsand(y|s)?\b|\bsable|\barena\b|\bsabbia\b|\bareia\b|\bsandstrand",
    "white_sand": r"\bwhite sand|\bwhite[- ]sanded|\barena blanca|\bareia branca",
    "golden_sand": r"\bgolden sand|\byellow sand|\barena dorada",
    "black_sand": r"\bblack sand|\bvolcanic sand|\bblack[- ]pebble",
    "pink_sand": r"\bpink sand|\bpink[- ]tinged|\brosa\b.{0,12}arena",
    "pebble": r"\bpebble|\bshingle|\bciottol|\bgalets|\bkiesel",
    "rocky": r"\brocky\b|\brock (?:slabs|platform)|\bboulder",
    "turquoise": r"\bturquoise|\bazure|\bemerald|\btürkis|\bturchese",
    "clear_water": r"\bclear water|\bcrystal[- ]clear|\btranspar",
    "shallow": r"\bshallow|\bwaist[- ]deep|\bgently shelv",
    "lagoon": r"\blagoon|\blaguna|\blimni\b",
    "cliffs": r"\bcliff|\bfalaise|\bscogliera|\bsteilküste|\blimestone wall",
    "cave": r"\bcave|\bgrotto|\bgrotta|\bcueva|\bhöhle",
    "arch": r"\barch\b|\bnatural arch|\brock arch|\bstack\b",
    "dunes": r"\bdune",
    "pines": r"\bpine|\bpinède|\bpineta|\bpinar|\bcypress|\bcedar",
    "boat_only": r"\bonly by boat|\baccessible by boat|\bboat[- ]only|"
                 r"\bno road access|\bonly on foot",
    "steps": r"\bsteps\b|\bstaircase|\bstairway|\bescaleras|\bwooden stairs",
    "hike_in": r"\bhike\b|\bfootpath|\btrail\b|\bwalk down|\bdescent on foot",
    "shipwreck": r"\bshipwreck|\bwreck of|\brusting hull",
    "nudist": r"\bnudist|\bnaturist|\bclothing[- ]optional|\bfkk\b",
    "surf": r"\bsurf(ing|ers)?\b|\bwaves\b|\bswell\b|\bwindsurf|\bkitesurf",
    "snorkel": r"\bsnorkel|\bdiving\b|\bscuba",
    "protected": r"\bnatura 2000|\bnature reserve|\bnational park|"
                 r"\bprotected area|\bunesco",
    "turtles": r"\bturtle|\bcaretta|\bloggerhead|\bmonk seal",
    "famous_photo": r"\bmost photographed|\bpostcard|\bposter\b|\bemblematic|"
                    r"\bmost famous beach|\bbest[- ]known beach|\biconic\b",
    "blue_flag": r"\bblue flag",
    "island": r"\bislet|\bisland\b|\bisola\b|\bisla\b|\bnisi\b",
    "sunset": r"\bsunset|\bsunrise",
    "long_beach": r"\b\d{3,} ?(m|metre|meter)s? long|\bkilometres? long|"
                  r"\bkilometers? long",
    "quiet": r"\bsecluded|\bremote\b|\bquiet\b|\bunspoil|\bwild\b|\bhidden\b",
    "busy": r"\bcrowded|\bbusy\b|\bpacked\b|\bmass tourism|\bresort town",
}


def article_facts(extract):
    """Which of the vocabulary above the article actually supports."""
    text = (extract or "").lower()
    if not text:
        return []
    return sorted(k for k, pattern in FACT_WORDS.items()
                  if re.search(pattern, text, re.I))


# ---------------------------------------------------------------------------
# Overpass: what is really on the ground
# ---------------------------------------------------------------------------

CONTEXT_QUERY_HEAD = "[out:json][timeout:180];\n(\n"
CONTEXT_QUERY_TAIL = ");\nout tags center;\n"

# Five clauses, not eight. Every clause is a separate spatial lookup on the
# server and the shortlist runs to thousands of beaches, so the ones that only
# ever coloured a sentence (historic, spring, sports_centre) were dropped in
# favour of finishing the pass. What is left is what the index actually reads.
CONTEXT_CLAUSES = (
    'nwr(around:{r},{lat},{lon})'
    '["amenity"~"^(parking|toilets|shower|drinking_water|cafe|restaurant|bar|'
    'ice_cream)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["natural"~"^(cliff|cave_entrance|arch|dune|reef|wood)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["man_made"~"^(pier|lighthouse)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["tourism"~"^(hotel|apartment|camp_site|viewpoint|guest_house|hostel)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["leisure"~"^(marina|nature_reserve)$"];\n'
)


def context_for(batch, radius=CONTEXT_RADIUS_M):
    """{beach key: {feature: count}} for a batch of beaches.

    Overpass answers one blob for the whole query with no way to say which
    around clause produced which element, so every element is assigned to the
    nearest beach of the batch. At a 400 m radius that is right except where
    two beaches share a car park, and sharing a car park is true of both."""
    if not batch:
        return {}
    query = CONTEXT_QUERY_HEAD + "".join(
        CONTEXT_CLAUSES.format(r=radius, lat=b["lat"], lon=b["lon"])
        for b in batch) + CONTEXT_QUERY_TAIL
    try:
        elements = overpass(query)
    except SourceError as exc:
        print(f"    context batch failed: {exc}")
        return {}
    out = {b["key"]: {} for b in batch}
    for el in elements:
        tags = el.get("tags") or {}
        centre = el.get("center") or {}
        lat = el.get("lat", centre.get("lat"))
        lon = el.get("lon", centre.get("lon"))
        if lat is None or lon is None:
            continue
        best, best_km = None, (radius / 1000.0) * 1.6
        for b in batch:
            km = haversine_km(b["lat"], b["lon"], lat, lon)
            if km < best_km:
                best, best_km = b, km
        if best is None:
            continue
        bucket = out[best["key"]]
        for key in ("amenity", "natural", "man_made", "leisure", "tourism"):
            value = tags.get(key)
            if value:
                bucket[value] = bucket.get(value, 0) + 1
    return out


# ---------------------------------------------------------------------------
# The country pass
# ---------------------------------------------------------------------------

def coastal_guess(beach, bathing):
    """Sea or lake, decided before the water quality join so the join can
    prefer the right kind of site. A beach whose nearest EEA site of ANY type
    is a lake, and which has no sea word about it, is treated as a lake."""
    site, _ = bathing.nearest(beach["lat"], beach["lon"], 4.0)
    if site is None:
        return True
    return site.get("type") in ("Coastal", "Transitional")


def enrich_country(cc, shortlist_n=SHORTLIST, refresh=False, bathing=None,
                   protected=None, dests=None, images=True, context=True):
    raw = load_cache(STAGE_IN, cc)
    if not raw or not raw.get("beaches"):
        print(f"  {cc}: nothing harvested")
        return None
    previous = {} if refresh else {
        b["key"]: b for b in (load_cache(STAGE_OUT, cc) or {}).get("beaches", [])
    }

    beaches = [dict(b) for b in raw["beaches"]]
    for b in beaches:
        b["_coastal"] = coastal_guess(b, bathing)
        join_local(b, bathing, protected, dests)
        b["coastal"] = b.pop("_coastal")
        b["prelim"] = prelim_score(b)

    beaches.sort(key=lambda b: -b["prelim"])
    short = beaches[:shortlist_n]
    print(f"  {cc}: {len(beaches)} harvested, enriching {len(short)}")

    # 1. Article facts and pageviews, one batch per wiki.
    lang = LOCAL_LANG.get(cc, "en")
    for wiki_lang, field in (("en", "enwiki"), (lang, "localwiki")):
        wanted = []
        for b in short:
            if b.get(field) and not (previous.get(b["key"], {}).get("article")):
                wanted.append({"beach": b, "title": wiki_title(b[field])})
        if not wanted:
            continue
        pages = fetch_articles(wanted, wiki_lang)
        for item in wanted:
            page = pages.get(item["title"])
            if not page or not page.get("extract"):
                continue
            beach = item["beach"]
            article = beach.get("article") or {}
            # English first: its extract is the one the fact vocabulary was
            # written against, and a local extract only fills the gap.
            if not article.get("facts"):
                beach["article"] = {
                    "lang": wiki_lang,
                    "title": item["title"],
                    "facts": article_facts(page["extract"]),
                    "chars": len(page["extract"]),
                }
            beach["views60"] = max(beach.get("views60") or 0, page["views"])

    # 2. Photographs.
    #
    # The one phase worth threading. Each beach costs two or three Commons
    # calls and nothing else in the run depends on the order, so a small pool
    # hides the round trip latency. Two workers against a 0.4 s shared pacer,
    # not four against 0.2 s: that was tried, and Wikimedia answered a wall of
    # 429s within a minute.
    if images:
        todo_img = []
        for b in short:
            was = previous.get(b["key"]) or {}
            if was.get("images") is not None and not refresh:
                b["images"] = was["images"]
            else:
                todo_img.append(b)

        def shoot(beach):
            try:
                return beach, pick_images(beach, lang)
            except (SourceError, ValueError) as exc:
                print(f"    images failed for {beach['name']}: {exc}")
                return beach, []

        done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=IMAGE_WORKERS) as pool:
            for beach, shots in pool.map(shoot, todo_img):
                beach["images"] = shots
                done += 1
                if done % 60 == 0:
                    print(f"    {done}/{len(todo_img)} photographed")

    # 3. Ground truth, batched.
    #
    # The only phase that touches Overpass, which is why it can be switched
    # off: the harvest stage is on the same endpoint and the same slot budget,
    # so during a long harvest this pass is skipped and picked up afterwards.
    # It is per beach idempotent, so a later run fills exactly the beaches
    # that have no context yet.
    todo = [] if not context else [
        b for b in short
        if refresh or (previous.get(b["key"]) or {}).get("context") is None]
    for b in short:
        was = previous.get(b["key"]) or {}
        if was.get("context") is not None and not refresh:
            b["context"] = was["context"]
    for i in range(0, len(todo), OSM_BATCH):
        chunk = todo[i:i + OSM_BATCH]
        found = context_for(chunk)
        for b in chunk:
            b["context"] = found.get(b["key"], {})
        print(f"    context {min(i + OSM_BATCH, len(todo))}/{len(todo)}")

    payload = {
        "country": cc,
        "enriched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_harvested": len(beaches),
        "beaches": short,
    }
    save_cache(STAGE_OUT, cc, payload)
    with_img = sum(1 for b in short if b.get("images"))
    print(f"  {cc}: enriched {len(short)}, {with_img} with photographs")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--countries", default="")
    parser.add_argument("--shortlist", type=int, default=SHORTLIST)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--no-images", action="store_true",
                        help="skip Commons, for a quick structural run")
    parser.add_argument("--no-context", action="store_true",
                        help="skip the Overpass ground truth pass, so this can "
                             "run alongside a harvest without fighting it for "
                             "the same Overpass slot")
    args = parser.parse_args()

    wanted = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    countries = wanted or COUNTRIES

    bathing = load_bathing()
    protected = load_protected()
    dests = NearIndex(build_dest_index())

    for cc in countries:
        if load_cache(STAGE_IN, cc) is None:
            continue
        try:
            enrich_country(cc, shortlist_n=args.shortlist, refresh=args.refresh,
                           bathing=bathing, protected=protected, dests=dests,
                           images=not args.no_images,
                           context=not args.no_context)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
