"""Stage 2 of the lake layer: turn a name and a coordinate into a lake we can
rank, photograph, describe and answer "can I swim here" about.

Stage 1 found the water bodies. Most of them will never be published, so the
expensive work is spent on a shortlist. The free joins run over everything,
the shortlist is cut from those, and only then does anything cost a request.

  free, local, over every water body
    bathing water   the EEA WISE sites on THIS lake (cache/eea_bathing_water
                    .json): the class Excellent to Poor, and the COUNT of
                    officially designated bathing sites, which is the single
                    best evidence in Europe that swimming here is lawful and
                    monitored. Lake and River sites only: a coastal site two
                    kilometres away says nothing about an inland lake.
    protection      the nearest protected area (cache/osm_protected_areas.json)
    climate         WorldClim 2.1 monthly normals sampled at the lake's OWN
                    coordinate, which is what the swimming season estimate in
                    lake_index.py is built from. Local raster read, no network.
    walks           published hikes whose bounding box touches the lake
                    (continent-app/public/trails/CC.json), so "there is a
                    marked walk here" is a fact from our own wire rather than
                    an Overpass guess.
    catalogue       the nearest priced destination, which becomes the base
                    line on the card and the tap through to prices.

  paid for in requests, over the shortlist only
    photographs     up to five from Wikimedia Commons, found by category, by
                    name AND coordinate, and by geosearch at a radius scaled
                    to the lake, each with its licence and author kept.
    article facts   the Wikipedia extract read as a FACT source: origin,
                    surroundings, colour, what you can do, and the sentences
                    that say whether swimming is allowed. Its prose is never
                    shipped. The pageview count arrives in the same call.
    shore truth     one Overpass pass per batch for what is actually on the
                    shore: a lido, a beach, a marina, a dive centre, boat
                    rental, a ferry, a castle, a waterfall, a peak, parking,
                    and how much is built, which is the difference between a
                    wild tarn and a resort shore.

Writes cache/lakes/rich_CC.json. Idempotent per country and per lake: a re-run
only enriches what has no answer yet, so an interrupted run picks up.

Usage, from the repo root:
    python pipeline/lakes/enrich_lakes.py --countries SI
    python pipeline/lakes/enrich_lakes.py                  # every harvested
    python pipeline/lakes/enrich_lakes.py --countries IT --shortlist 90
    python pipeline/lakes/enrich_lakes.py --no-context     # leave Overpass be
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

from water_sources import (COMMONS_API, SourceError, haversine_km,  # noqa: E402
                           load_cache, mediawiki, overpass, save_cache,
                           wikipedia_api)
from harvest_lakes import COUNTRIES, LOCAL_LANG, fold, name_tokens  # noqa: E402

ROOT = HERE.parents[1]
CACHE = ROOT / "cache"
MASTER = ROOT / "app_data" / "app_data.json"
DEST_INDEX = CACHE / "lakes" / "dest_index.json"
BEACH_DEST_INDEX = CACHE / "beaches" / "dest_index.json"
TRAILS_DIR = ROOT / "continent-app" / "public" / "trails"
WORLDCLIM = CACHE / "worldclim"

STAGE_IN = "raw"
STAGE_OUT = "rich"

SHORTLIST = 120          # water bodies per country that earn the network calls
IMAGES_WANTED = 5        # a lake is a place you look at, so it gets a gallery
IMAGE_WORKERS = 2
PROTECTED_MAX_KM = 8.0
DEST_MAX_KM = 110.0
OSM_BATCH = 12           # lakes per Overpass request (the radius is large)
WIKI_BATCH = 20
TRAIL_MAX_KM = 6.0


# ---------------------------------------------------------------------------
# Geometry: how big is this lake, and how far out does "on the lake" reach
# ---------------------------------------------------------------------------

def shore_radius_km(lake):
    """A working radius for one water body, from its area.

    Everything spatial about a lake needs one: which bathing sites are on it,
    how far to look for photographs, how wide the Overpass sweep should be.
    A circle of the same area is the honest first approximation, widened a
    little because lakes are long rather than round, and clamped so a pond
    still sweeps its own village and Vanern does not sweep Sweden."""
    area = lake.get("area_km2") or 0.0
    if area <= 0:
        return 1.5
    radius = math.sqrt(area / math.pi) * 1.35
    return max(1.0, min(18.0, radius))


def _grid_key(lat, lon):
    return (int(math.floor(lat * 10)), int(math.floor(lon * 10)))


class NearIndex:
    """A 0.1 degree grid over point features, so every lake can ask "what is
    near me" without a 22,000 row scan apiece."""

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

    def within(self, lat, lon, max_km, where=None):
        return [(p, km) for p, km in self._around(lat, lon, max_km, where)]


# ---------------------------------------------------------------------------
# Local joins
# ---------------------------------------------------------------------------

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

    The beach layer builds the identical index, so if it is already on disk it
    is read rather than rebuilt: the source is one 68 MB file and nobody
    should pay that load twice for the same answer."""
    if DEST_INDEX.exists() and not refresh:
        return json.loads(DEST_INDEX.read_text(encoding="utf-8"))
    if BEACH_DEST_INDEX.exists() and not refresh:
        rows = json.loads(BEACH_DEST_INDEX.read_text(encoding="utf-8"))
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


BATHING_RANK = {"Excellent": 3, "Good": 2, "Sufficient": 1, "Poor": 0}
INLAND_TYPES = ("Lake", "River")


def join_bathing(lake, bathing):
    """The EEA sites ON this lake: the best class, and how many there are.

    The count is the point. One site says "somebody samples this water"; a
    dozen says "this is a lake people swim in, officially, in a dozen places",
    which is a stronger statement about swimming than any tag."""
    radius = max(2.5, shore_radius_km(lake) + 1.5)
    sites = bathing.within(lake["lat"], lake["lon"], radius,
                           where=lambda p: p.get("type") in INLAND_TYPES)
    if not sites:
        # No inland site. A coastal one within a kilometre still describes a
        # coastal lagoon, which is a real category here (Mljet, Grevelingen).
        sites = bathing.within(lake["lat"], lake["lon"], min(radius, 3.0))
    if not sites:
        return
    best = max(sites, key=lambda pair: (BATHING_RANK.get(pair[0].get("q"), -1),
                                        -pair[1]))
    site, km = best
    lake["water"] = {
        "class": site.get("q") or "",
        "class_prev": site.get("q3") or "",
        "site": site.get("name") or "",
        "type": site.get("type") or "",
        "km": round(km, 2),
        "sites": len(sites),
        "excellent": sum(1 for p, _ in sites if p.get("q") == "Excellent"),
    }


def join_local(lake, bathing, protected, dests):
    join_bathing(lake, bathing)

    area, km = protected.nearest(lake["lat"], lake["lon"], PROTECTED_MAX_KM)
    if area is not None:
        lake["protected_area"] = {
            "name": area.get("name") or "",
            "kind": area.get("kind") or "",
            "national_park": bool(area.get("np")),
            "notable": bool(area.get("notable")),
            "km": round(km, 2),
        }

    dest, km = dests.nearest(lake["lat"], lake["lon"], DEST_MAX_KM)
    if dest is not None:
        lake["base"] = {"id": dest["id"], "city": dest["city"],
                        "country": dest["country"], "km": round(km, 1)}


# ---------------------------------------------------------------------------
# Published walks: our own trails wire, joined by bounding box
# ---------------------------------------------------------------------------

_trails = {}


def load_trails(cc):
    """[(name, lat, lon, id)] of the published hikes in one country."""
    if cc in _trails:
        return _trails[cc]
    path = TRAILS_DIR / f"{cc}.json"
    rows = []
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            for trip in data.get("trips") or []:
                box = trip.get("bbox") or []
                if trip.get("category") != "hike" or len(box) != 4:
                    continue
                rows.append({
                    "id": trip.get("id"),
                    "name": trip.get("name") or "",
                    "lat": (box[1] + box[3]) / 2.0,
                    "lon": (box[0] + box[2]) / 2.0,
                    "km": round((trip.get("distance_m") or 0) / 1000.0, 1),
                })
        except (OSError, ValueError):
            rows = []
    _trails[cc] = NearIndex(rows)
    return _trails[cc]


def join_trails(lake, cc):
    radius = max(TRAIL_MAX_KM, shore_radius_km(lake) + 2.0)
    near = load_trails(cc).within(lake["lat"], lake["lon"], radius)
    if not near:
        return
    near.sort(key=lambda pair: pair[1])
    lake["walks"] = [{"id": p["id"], "name": p["name"], "km": p["km"]}
                     for p, _ in near[:3]]
    lake["n_walks"] = len(near)


# ---------------------------------------------------------------------------
# The published set, for a targeted shore sweep
# ---------------------------------------------------------------------------

WIRE_DIR = ROOT / "continent-app" / "public" / "lakes"


def published_ids(cc):
    """The Wikidata ids of the lakes currently SHIPPING for one country, or
    None when nothing has been exported yet.

    The shore sweep is the expensive half of this stage: one Overpass query
    per twelve lakes, with a radius in kilometres, against an endpoint that
    answers a 504 whenever it is busy. Over a 120 lake shortlist for 42
    countries that is 320 queries and most of a working day, and roughly three
    quarters of it is spent on lakes the export gate will drop anyway.

    So a WARM re-run can be told to sweep only what actually ships. On a cold
    build there is no wire to read and this returns None, which means "sweep
    the shortlist" and nothing changes."""
    path = WIRE_DIR / f"{cc}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    ids = {row.get("wd") for row in data.get("lakes") or [] if row.get("wd")}
    return ids or None


# ---------------------------------------------------------------------------
# Climate: WorldClim monthly normals at the lake's own coordinate
# ---------------------------------------------------------------------------

WIN = (-32.0, 26.0, 46.0, 72.0)          # W, S, E, N, the same window the
RES = "5m"                                # catalogue climate harvest reads
_clim_cache = {}


def load_climate_stacks():
    """(tmin, tmax, transform), each a masked (12, H, W) array over Europe.

    Read once per process and held. Twenty-four GeoTIFF windows is about a
    second and 60 MB, which is cheap against a network call per lake, and it
    is the difference between a modelled swimming season and none."""
    if "stacks" in _clim_cache:
        return _clim_cache["stacks"]
    try:
        import numpy as np
        import rasterio
        from rasterio.windows import from_bounds
    except ImportError:
        print("  note: rasterio not installed, the swimming season is skipped")
        _clim_cache["stacks"] = (None, None, None)
        return _clim_cache["stacks"]

    def load(var):
        stack, transform = [], None
        for month in range(1, 13):
            path = WORLDCLIM / f"wc2.1_{RES}_{var}_{month:02d}.tif"
            if not path.exists():
                return None, None
            with rasterio.open(path) as ds:
                win = from_bounds(WIN[0], WIN[1], WIN[2], WIN[3], ds.transform)
                stack.append(ds.read(1, window=win, masked=True))
                transform = ds.window_transform(win)
        return np.ma.stack(stack), transform

    tmin, transform = load("tmin")
    tmax, _ = load("tmax")
    if tmin is None or tmax is None:
        print("  note: no WorldClim rasters, the swimming season is skipped")
        _clim_cache["stacks"] = (None, None, None)
    else:
        _clim_cache["stacks"] = (tmin, tmax, transform)
        print("  WorldClim normals loaded")
    return _clim_cache["stacks"]


def _sample12(stack, transform, lon, lat, maxr=6):
    """The 12 month vector at the nearest valid pixel, or None.

    The ring search matters here more than it does for cities: a lake IS a
    water pixel, and a 5 arc-minute raster over a big lake is masked out in
    the middle of it. Without the fallback, Vattern and Balaton would have no
    climate at all."""
    import numpy as np
    height, width = stack.shape[1], stack.shape[2]
    col = int((lon - transform.c) / transform.a)
    row = int((lat - transform.f) / transform.e)
    for rad in range(0, maxr + 1):
        for d_row in range(-rad, rad + 1):
            for d_col in range(-rad, rad + 1):
                if max(abs(d_row), abs(d_col)) != rad:
                    continue
                r, c = row + d_row, col + d_col
                if 0 <= r < height and 0 <= c < width and not stack.mask[0, r, c]:
                    return stack[:, r, c].astype("float64").filled(np.nan)
    return None


def join_climate(lake):
    tmin, tmax, transform = load_climate_stacks()
    if tmin is None:
        return
    low = _sample12(tmin, transform, lake["lon"], lake["lat"])
    high = _sample12(tmax, transform, lake["lon"], lake["lat"])
    if low is None or high is None:
        return
    means = [round((float(high[i]) + float(low[i])) / 2.0, 1) for i in range(12)]
    lake["climate"] = {
        "source": "WorldClim 2.1 (1970-2000 normals, 5 arc-min)",
        "t_mean": means,
    }


# ---------------------------------------------------------------------------
# Shortlist: who earns the network calls
# ---------------------------------------------------------------------------

def prelim_score(lake):
    """Cheap pre score, used ONLY to pick who gets enriched.

    Fame is capped on purpose. If this were the ranking it would return the
    ten lakes everyone already knows; here it only has to keep the plausibly
    publishable ones in, and it leans as much on size, height and protection
    as on "an encyclopedia wrote about it". A seeded lake skips the question
    entirely."""
    if lake.get("seed"):
        return 99.0
    score = 0.0
    score += min(3.2, math.log1p(lake.get("sitelinks") or 0) * 1.15)
    if lake.get("wd_img"):
        score += 1.1
    if lake.get("commons_cat"):
        score += 0.9
    if lake.get("enwiki"):
        score += 0.8
    if lake.get("localwiki"):
        score += 0.4

    area = lake.get("area_km2") or 0
    if area >= 50:
        score += 1.3
    elif area >= 8:
        score += 0.9
    elif area >= 1:
        score += 0.5
    elev = lake.get("elev_m") or 0
    if elev >= 1200:
        score += 0.7
    elif elev >= 500:
        score += 0.3
    if (lake.get("depth_m") or 0) >= 40:
        score += 0.3

    water = lake.get("water") or {}
    score += 0.4 * BATHING_RANK.get(water.get("class"), 0)
    score += min(0.8, 0.15 * (water.get("sites") or 0))
    area_p = lake.get("protected_area") or {}
    if area_p:
        score += 0.8 if area_p.get("national_park") else 0.4
    if lake.get("protected"):
        score += 0.4
    if lake.get("walks"):
        score += 0.3
    base = lake.get("base") or {}
    if base and base.get("km", 999) <= 60:
        score += 0.3
    if name_tokens(lake.get("name")):
        score += 0.2
    return round(score, 3)


# ---------------------------------------------------------------------------
# Wikimedia Commons: the photographs
# ---------------------------------------------------------------------------

BAD_FILE_RE = re.compile(
    r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu)$|"
    r"\b(map|karte|carte|mapa|plan|blazon|coat[ _]of[ _]arms|flag|logo|"
    r"diagram|chart|graph|bathymetr|profile|sign|schild|panneau|stamp|"
    r"briefmarke|poster|screenshot|portrait|grave|tomb)\b", re.I)
SPECIES_RE = re.compile(r"^[A-Z][a-z]{3,}\s+[a-z]{4,}\b")

IMAGE_PROPS = {
    "prop": "imageinfo",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|ImageDescription",
}

LAKE_WORD_RE = re.compile(
    r"\b(lake|see|meer|loch|lough|llyn|lago|laghi|lac|lacul|lagoa|laguna|"
    r"lagoon|jezero|jezioro|ezero|jarv|jarvi|vatn|vann|sjo|embalse|barragem|"
    r"pleso|stausee|reservoir|shore|panorama|sunset|reflect)\b", re.I)


def commons_filename(url_or_name):
    """The Commons file title behind a Wikidata P18 value.

    P18 arrives as a Special:FilePath URL with the name percent encoded, and
    the API wants "File:Lago di Faetano.jpg"."""
    if not url_or_name:
        return ""
    text = str(url_or_name)
    if "Special:FilePath/" in text:
        text = text.split("Special:FilePath/", 1)[1]
    text = urllib.parse.unquote(text).replace("_", " ").strip()
    return f"File:{text}" if text and not text.startswith("File:") else text


def image_candidates(lake, lang):
    """Commons files that plausibly show THIS lake, best first.

    Four passes. The first is the strongest claim anybody makes about an
    image, and it was missing from the first build: Wikidata's P18 is a
    curated statement that this picture depicts this item, and 302 of the 618
    lakes the image gate dropped had one. The rest are anchored on the
    coordinate, the same shape the beach layer uses and for the same reason: a
    name search alone returns every Schwarzsee in the German speaking world,
    and nearcoord pins it to this one.

    The difference from the beach layer is the radius. A beach is 300 m of
    sand; a lake can be forty kilometres long, so the geosearch radius is the
    lake's own shore radius rather than a constant, and the name search widens
    with it. A SEEDED lake widens further still: a human has vouched for the
    subject, so a wider net is worth casting, and the relevance filter is
    still what decides. San Marino's one lake has no geotagged photograph
    inside a kilometre."""
    seen, out = set(), []
    queries = []
    for name in (lake.get("name"), lake.get("name_local"),
                 (lake.get("seed") or {}).get("name")):
        if name and fold(name) not in {fold(q) for q in queries}:
            queries.append(name)
    radius_km = shore_radius_km(lake)
    near_m = int(max(600, min(9500, radius_km * 1000)))
    if lake.get("seed"):
        near_m = max(near_m, 3500)
    cat = lake.get("commons_cat")

    def collect(params, near=False, pinned=False):
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
                        "pinned": pinned})

    p18 = commons_filename(lake.get("wd_img"))
    if p18:
        collect({"titles": p18, **IMAGE_PROPS}, pinned=True)
    if cat:
        collect({"generator": "categorymembers", "gcmtitle": f"Category:{cat}",
                 "gcmtype": "file", "gcmlimit": 20, **IMAGE_PROPS})
    for name in queries[:2]:
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 14,
                 "gsrsearch": f"{name} filetype:bitmap "
                              f"nearcoord:{max(2, int(radius_km * 2))}km,"
                              f"{lake['lat']},{lake['lon']}",
                 **IMAGE_PROPS})
        if len(out) >= IMAGES_WANTED + 6:
            break
    if len(out) < IMAGES_WANTED + 2:
        collect({"generator": "geosearch", "ggsnamespace": 6,
                 "ggscoord": f"{lake['lat']}|{lake['lon']}",
                 "ggsradius": near_m, "ggslimit": 20, **IMAGE_PROPS},
                near=True)
    return out


def score_image(cand, lake):
    """How likely this file is to be a usable photograph OF the lake."""
    title = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    info = cand["info"]
    if BAD_FILE_RE.search(title) or SPECIES_RE.match(title):
        return -1
    width, height = info.get("width") or 0, info.get("height") or 0
    # A P18 is a curated statement that this image depicts this item, so it
    # clears the size floor that exists to throw out thumbnails and icons
    # found by a blind search. It still has to be a photograph.
    if cand.get("pinned"):
        return 4.0 if width >= 400 and height >= 300 else -1
    if width < 800 or height < 500:
        return -1
    score = 0.0
    tokens = (name_tokens(lake.get("name")) | name_tokens(lake.get("name_local"))
              | name_tokens((lake.get("seed") or {}).get("name")))
    folded = fold(title)
    if tokens and any(t in folded for t in tokens):
        score += 3.0
        # A file NAMED after the lake is a photograph of the lake. A file that
        # mentions it three words in is usually a photograph of something else
        # with the lake behind it, which is how Lake Ohrid's hero card became a
        # snowfield ("Magaro, Mountain Galichica, in the background Ohrid
        # lake"). Position is the cheapest signal that separates the two.
        head = " ".join(folded.split()[:3])
        if any(t in head for t in tokens):
            score += 1.2
    if re.search(r"\b(in the background|background|seen from|from the summit|"
                 r"from mount|view towards)\b", folded):
        score -= 1.6
    if LAKE_WORD_RE.search(folded):
        score += 1.0
    if cand.get("near"):
        score += 1.4
    if width >= 2000:
        score += 0.6
    if width > height:
        score += 0.8                    # a hero card is a landscape crop
    if "panoramio" in folded:
        score -= 0.4
    if re.search(r"\b(aerial|from above|drone|panorama|view)\b", folded):
        score += 0.5
    if re.search(r"\b(winter|snow|ice|frozen|gefroren)\b", folded):
        score -= 0.5                    # true, and not what the card is for
    return score


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def pick_images(lake, lang):
    cands = image_candidates(lake, lang)
    ranked = sorted(((score_image(c, lake), c) for c in cands),
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
    """[{lake, title}] -> {title: {extract, views}} for one wiki."""
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


# The vocabulary the description is built from. Every entry is a fact we can
# point at a sentence in the article for, which is the whole reason this layer
# reads Wikipedia as data and never as text: facts are not copyrightable, the
# sentences that carry them are.
FACT_WORDS = {
    "glacier": r"\bglacial\b|\bglacier|\bmoraine|\bgletscher|\bghiacciai",
    "glacial_fed": r"\bfed by (?:a )?glacier|\bglacier[- ]fed|\bmeltwater",
    "crater": r"\bcrater|\bcaldera|\bvolcanic lake|\bmaar\b",
    "karst": r"\bkarst|\bsinkhole|\bdoline|\bpolje\b",
    "tectonic": r"\btectonic|\brift (?:lake|valley)|\bgraben",
    "oxbow": r"\boxbow|\bbillabong|\bmeander cut",
    "mountains": r"\bmountain|\balpine\b|\bmassif|\bpeaks? (?:of|above|rise)|"
                 r"\bsurrounded by (?:the )?(?:mountains|peaks|alps)",
    "cliffs": r"\bcliff|\bsteep (?:walls|sides|rock)|\bescarpment|\bsheer",
    "forest": r"\bforest|\bwoodland|\bpine|\bspruce|\bbeech wood",
    "islands": r"\bisland|\bislet|\bisola\b|\bisla\b|\botok\b",
    "waterfall": r"\bwaterfall|\bcascade|\bfalls\b",
    "castle": r"\bcastle|\bchateau|\bburg\b|\bfortress",
    "church": r"\bchurch|\bchapel|\bmonaster|\babbey|\bpilgrimage",
    "turquoise": r"\bturquoise|\bazure|\bemerald|\bturkis|\bturchese|\bcobalt",
    "clear_water": r"\bclear water|\bcrystal[- ]clear|\btranspar|\bvisibility of",
    "shallow": r"\bshallow|\bgently shelv|\bwaist[- ]deep",
    "eutrophic": r"\beutrophic|\bnutrient[- ]rich",
    "algae": r"\balgal bloom|\bcyanobacteria|\bblue[- ]green algae",
    "drinking_water": r"\bdrinking water|\bwater supply|\bpotable|\btrinkwasser",
    "dam": r"\bdam\b|\bhydroelectric|\bimpound|\breservoir was (?:created|built)",
    "swim_ban": r"swimming is (?:strictly )?(?:prohibited|forbidden|banned|"
                r"not (?:allowed|permitted))|\bno swimming\b|"
                r"bathing is (?:prohibited|forbidden|not allowed)",
    "swim_ok": r"\bpopular (?:for|with) swimm|\bswimming (?:is )?(?:allowed|"
               r"permitted|popular)|\bbathing (?:beach|area|resort)|\blido\b",
    "beach": r"\bbeach|\bsandy shore|\bstrand\b|\bspiaggia|\bplage\b",
    "kayak": r"\bkayak|\bcanoe|\bpaddle|\bsup\b|\bstand[- ]up paddle",
    "sailing": r"\bsailing|\byacht|\bregatta|\bwindsurf|\bkitesurf",
    "diving": r"\bdiving\b|\bscuba|\bsnorkel|\bdive site",
    "fishing": r"\bfishing|\bangling|\btrout|\bpike\b|\bperch\b",
    "boat_trip": r"\bboat trip|\bferry|\bpleasure (?:boat|craft)|\bsteamer|"
                 r"\bcruise",
    "hiking": r"\bhiking|\bfootpath|\btrail (?:around|along)|\bwalking route",
    "hike_in": r"\breached (?:only )?on foot|\bno road|\bhike (?:in|up) to|"
               r"\baccessible only by",
    "remote": r"\bremote\b|\bwilderness|\bunspoil|\buninhabited",
    "busy": r"\bcrowded|\bbusy\b|\bmass tourism|\bresort town|\bovertourism",
    "currents": r"\bcurrent|\bundertow|\brapids\b|\bwhitewater",
    "protected": r"\bnature reserve|\bnational park|\bnatura 2000|"
                 r"\bprotected area|\bramsar",
    "unesco": r"\bunesco|\bworld heritage|\bbiosphere reserve",
    "famous_photo": r"\bmost photographed|\bpostcard|\bemblematic|\biconic\b|"
                    r"\bbest[- ]known lake|\bmost famous lake",
    "film": r"\bfilmed|\bfilm location|\bmovie was shot",
}


def article_facts(extract):
    text = (extract or "")
    if not text:
        return []
    return sorted(k for k, pattern in FACT_WORDS.items()
                  if re.search(pattern, text, re.I))


# The sentences that mention swimming, kept verbatim in the CACHE only so that
# lake_index.swim_rule can read a prohibition it has a phrase for. Never
# shipped, never rendered: the wire carries the verdict, not the sentence.
SWIM_SENTENCE_RE = re.compile(
    r"[^.]*\b(swim|swimming|bathing|baden|baignade|balneac|nuoto|banarse)\b[^.]*\.",
    re.I)


def swim_sentences(extract):
    hits = SWIM_SENTENCE_RE.findall(extract or "")
    if not hits:
        return ""
    found = SWIM_SENTENCE_RE.finditer(extract or "")
    return " ".join(m.group(0).strip() for m in found)[:900]


# ---------------------------------------------------------------------------
# Overpass: what is really on the shore
# ---------------------------------------------------------------------------

CONTEXT_HEAD = "[out:json][timeout:240];\n(\n"
CONTEXT_TAIL = ");\nout tags center;\n"

# Seven clauses. Each is a separate spatial lookup on the server and the
# radius here is kilometres rather than the beach layer's 400 m, so the list
# is kept to what the index actually reads. highway=path was in it for one
# run and brought back a hundred thousand ways around Lake Constance alone;
# "is there a walk here" is answered instead by our own published trails wire,
# which is free and already on disk.
CONTEXT_CLAUSES = (
    'nwr(around:{r},{lat},{lon})'
    '["leisure"~"^(swimming_area|marina|slipway|nature_reserve|water_park|'
    'beach_resort|sauna|fishing|swimming_pool)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["sport"~"^(swimming|canoe|sailing|scuba_diving|fishing|surfing|'
    'windsurfing|water_ski|rowing)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["natural"~"^(beach|cliff|peak|glacier|wood)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["amenity"~"^(parking|toilets|cafe|restaurant|bar|boat_rental|'
    'ferry_terminal)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["tourism"~"^(hotel|apartment|camp_site|viewpoint|guest_house|hostel|'
    'resort)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["historic"~"^(castle|monastery|church|ruins)$"];\n'
    'nwr(around:{r},{lat},{lon})'
    '["waterway"="waterfall"];\n'
)

# The tag values the index reads, folded to one bucket each. Anything else
# Overpass hands back is counted under its own value and simply ignored.
CONTEXT_KEYS = ("leisure", "sport", "natural", "amenity", "tourism",
                "historic", "waterway", "man_made", "aerialway")


def context_radius_m(lake):
    """How wide to sweep one lake. The shore radius plus a margin for the
    village at the end of it, capped so a batch of large lakes cannot ask
    Overpass for half a country."""
    return int(max(800, min(4000, shore_radius_km(lake) * 1000 + 700)))


def context_for(batch):
    """{lake key: {feature: count}} for a batch.

    Overpass answers one blob for the whole query with no way to say which
    around clause produced which element, so every element goes to the nearest
    lake of the batch that could plausibly own it. Batches are built from
    lakes that are far apart for exactly this reason (see split_batches)."""
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
    out = {b["key"]: {} for b in batch}
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
            if km > context_radius_m(b) / 1000.0 * 1.25:
                continue
            if best_km is None or km < best_km:
                best, best_km = b, km
        if best is None:
            continue
        bucket = out[best["key"]]
        for key in CONTEXT_KEYS:
            value = tags.get(key)
            if value:
                bucket[value] = bucket.get(value, 0) + 1
    return out


BATCH_MIN_KM = 12.0


def split_batches(lakes, size=OSM_BATCH):
    """Batches whose members are far enough apart that the nearest-lake
    assignment above is not a coin toss.

    Two lakes 3 km apart in one batch share every marina between them. Sorting
    by longitude and then dealing round robin puts neighbours in DIFFERENT
    batches, which is the cheap version of the right answer."""
    ordered = sorted(lakes, key=lambda b: (b["lon"], b["lat"]))
    n_batches = max(1, math.ceil(len(ordered) / size))
    buckets = [[] for _ in range(n_batches)]
    for i, lake in enumerate(ordered):
        buckets[i % n_batches].append(lake)
    # A bucket that still holds two close neighbours splits them out.
    out = []
    for bucket in buckets:
        keep, spill = [], []
        for lake in bucket:
            if any(haversine_km(lake["lat"], lake["lon"], k["lat"], k["lon"])
                   < BATCH_MIN_KM for k in keep):
                spill.append(lake)
            else:
                keep.append(lake)
        out.append(keep)
        while spill:
            out.append(spill[:size])
            spill = spill[size:]
    return [b for b in out if b]


# ---------------------------------------------------------------------------
# The country pass
# ---------------------------------------------------------------------------

def enrich_country(cc, shortlist_n=SHORTLIST, refresh=False, bathing=None,
                   protected=None, dests=None, images=True, context=True,
                   rephotograph=0, context_published=False):
    raw = load_cache(STAGE_IN, cc)
    if not raw or not raw.get("lakes"):
        print(f"  {cc}: nothing harvested")
        return None
    previous = {} if refresh else {
        b["key"]: b for b in (load_cache(STAGE_OUT, cc) or {}).get("lakes", [])
    }

    lakes = [dict(b) for b in raw["lakes"]]
    for lake in lakes:
        join_local(lake, bathing, protected, dests)
        join_trails(lake, cc)
        join_climate(lake)
        lake["prelim"] = prelim_score(lake)

    lakes.sort(key=lambda b: (-b["prelim"], b["name"]))
    short = lakes[:shortlist_n]
    seeded = sum(1 for b in short if b.get("seed"))
    print(f"  {cc}: {len(lakes)} harvested, enriching {len(short)} "
          f"({seeded} seeded)")

    # 1. Article facts and pageviews, one batch per wiki.
    lang = LOCAL_LANG.get(cc, "en")
    for wiki_lang, field in (("en", "enwiki"), (lang, "localwiki")):
        wanted = []
        for lake in short:
            if lake.get(field) and not (previous.get(lake["key"], {}).get("article")):
                wanted.append({"lake": lake, "title": wiki_title(lake[field])})
        if not wanted:
            continue
        pages = fetch_articles(wanted, wiki_lang)
        for item in wanted:
            page = pages.get(item["title"])
            if not page or not page.get("extract"):
                continue
            lake = item["lake"]
            article = lake.get("article") or {}
            # English first: the fact vocabulary was written against it, and
            # a local extract only fills the gap.
            if not article.get("facts"):
                lake["article"] = {
                    "lang": wiki_lang,
                    "title": item["title"],
                    "facts": article_facts(page["extract"]),
                    "swim_text": swim_sentences(page["extract"]),
                    "chars": len(page["extract"]),
                }
            lake["views60"] = max(lake.get("views60") or 0, page["views"])
    for lake in short:
        was = previous.get(lake["key"]) or {}
        if not lake.get("article") and was.get("article"):
            lake["article"] = was["article"]
            lake["views60"] = max(lake.get("views60") or 0, was.get("views60") or 0)

    # 2. Photographs. The one phase worth threading: each lake costs two or
    # three Commons calls and nothing depends on the order. Two workers
    # against the shared 0.4 s pacer, not four against 0.2 s, which the beach
    # layer tried and met a wall of 429s within a minute.
    #
    # The REUSE of what is already cached sits outside the `images` switch, and
    # that is not a style choice. It was inside it for one run, and
    # `--no-images` therefore meant "throw the photographs away" rather than
    # "do not fetch new ones": a shore sweep started with --no-images rewrote
    # Andorra's and Albania's caches with no pictures in them, and both
    # countries silently vanished from the published wire at the next export.
    # The switch controls the NETWORK. It has never controlled the data.
    for lake in short:
        was = previous.get(lake["key"]) or {}
        if was.get("images") is not None:
            lake["images"] = was["images"]

    if images:
        todo_img = []
        for lake in short:
            was = previous.get(lake["key"]) or {}
            kept = was.get("images")
            # `rephotograph` re-shoots ONLY the lakes that came back thin,
            # which is what makes a change to the candidate rules worth a
            # run: adding Wikidata's P18 as a source rescued 302 of the 618
            # lakes the image gate had dropped, and re-photographing all
            # 3,809 to reach them would have been two and a half hours of
            # somebody else's bandwidth for nothing.
            thin = rephotograph and len(kept or []) < rephotograph
            if kept is not None and not refresh and not thin:
                lake["images"] = kept
            else:
                todo_img.append(lake)

        def shoot(lake):
            try:
                return lake, pick_images(lake, lang)
            except (SourceError, ValueError) as exc:
                print(f"    images failed for {lake['name']}: {exc}")
                return lake, []

        done = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=IMAGE_WORKERS) as pool:
            for lake, shots in pool.map(shoot, todo_img):
                lake["images"] = shots
                done += 1
                if done % 40 == 0:
                    print(f"    {done}/{len(todo_img)} photographed")

    # 3. Shore truth, batched. The only phase that touches Overpass, which is
    # why it can be switched off: during a long harvest elsewhere in the repo
    # this pass is skipped and picked up afterwards. It is per lake
    # idempotent, so a later run fills exactly what has no context yet.
    for lake in short:
        was = previous.get(lake["key"]) or {}
        if was.get("context") is not None and not refresh:
            lake["context"] = was["context"]
    todo = [] if not context else [
        lake for lake in short if lake.get("context") is None]
    if todo and context_published:
        shipping = published_ids(cc)
        if shipping is not None:
            before = len(todo)
            todo = [lake for lake in todo if lake.get("wd") in shipping]
            print(f"    shore sweep narrowed to what ships: "
                  f"{len(todo)} of {before}")
    batches = split_batches(todo)
    for i, chunk in enumerate(batches, 1):
        found = context_for(chunk)
        for lake in chunk:
            lake["context"] = found.get(lake["key"], {})
        print(f"    context batch {i}/{len(batches)}")

    payload = {
        "country": cc,
        "enriched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_harvested": len(lakes),
        "lakes": short,
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
    parser.add_argument("--rephotograph", type=int, default=0,
                        metavar="N",
                        help="re-shoot only the lakes holding fewer than N "
                             "photographs, leaving the rest of the cache "
                             "alone. Use after a change to the candidate "
                             "rules; --rephotograph 2 targets exactly what "
                             "the export gate drops")
    parser.add_argument("--context-published", action="store_true",
                        help="sweep the shore only for the lakes already "
                             "in continent-app/public/lakes, which on a "
                             "warm re-run is about a quarter of the "
                             "shortlist and all of what a traveller sees")
    parser.add_argument("--no-context", action="store_true",
                        help="skip the Overpass shore pass, so this can run "
                             "alongside another layer's harvest without "
                             "fighting it for the same Overpass slot")
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
                           context=not args.no_context,
                           rephotograph=args.rephotograph,
                           context_published=args.context_published)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
