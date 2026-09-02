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
    climate         CHELSA V2.1 monthly normals sampled at the lake's OWN
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

# Windows consoles and redirected pipes default to cp1252, which cannot encode
# a Latvian, Icelandic or Polish lake name. A print of one then raises
# UnicodeEncodeError and takes the stage down; the lake export died on
# "Lielais Baltezers" halfway through a logged run. The data was never the
# problem, the terminal was, so say so once here.
if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass



def _regions_assign():
    """pipeline/regions/assign.py under a neutral name, loaded on first use.
    Enrich owns the region assignment (stored in the cache, never recomputed
    at export); the load is lazy so a clone without the spine still
    enriches, and stamp_rows degrades to a warning in that case."""
    import importlib.util
    mod = sys.modules.get("carta_regions_assign")
    if mod is None:
        path = HERE.parents[1] / "pipeline" / "regions" / "assign.py"
        spec = importlib.util.spec_from_file_location("carta_regions_assign", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["carta_regions_assign"] = mod
        spec.loader.exec_module(mod)
    return mod

from water_sources import (COMMONS_API, SourceError, get_json,  # noqa: E402
                           haversine_km, load_cache, mediawiki, overpass,
                           request, save_cache, wikipedia_api)
from harvest_lakes import COUNTRIES, LOCAL_LANG, fold, name_tokens  # noqa: E402
import lake_climate  # noqa: E402
import lake_images  # noqa: E402

# The photo engine's shared halves, loaded by path like lake_images is
# loaded by the other layers: the takedown ledger every candidate pass
# must honour, and the Wikidata view properties beyond P18.
import importlib.util  # noqa: E402

def _photo_module(name):
    key = f"carta_photo_{name}"
    if key not in sys.modules:
        spec = importlib.util.spec_from_file_location(
            key, HERE.parent / "photos" / f"{name}.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules[key] = mod
        spec.loader.exec_module(mod)
    return sys.modules[key]

photo_takedown = _photo_module("takedown")
photo_views = _photo_module("wikidata_views")
photo_credit = _photo_module("credit")

ROOT = HERE.parents[1]
CACHE = ROOT / "cache"
MASTER = ROOT / "app_data" / "app_data.json"
DEST_INDEX = CACHE / "lakes" / "dest_index.json"
BEACH_DEST_INDEX = CACHE / "beaches" / "dest_index.json"
TRAILS_DIR = ROOT / "continent-app" / "public" / "trails"

STAGE_IN = "raw"
STAGE_OUT = "rich"

# Water bodies per country that earn the network calls. 120 until the OSM
# spine landed, and 120 was a country level cap on a layer whose whole
# coverage problem was country level caps: it gave Luxembourg and France the
# same budget, and it is why the Netherlands published exactly 60 while Great
# Britain published 8. The number is now a CEILING on a selection made region
# by region (see shortlist_for). None means "size it from how many regions
# this country actually has water in", which is the honest answer; a number
# on the command line still overrides it for a targeted run.
SHORTLIST = None
IMAGES_WANTED = 5        # a lake is a place you look at, so it gets a gallery
IMAGE_WORKERS = 2
PROTECTED_MAX_KM = 8.0
DEST_MAX_KM = 110.0
GATE_HEADROOM = 6.0   # ~1 in 6 shortlisted lakes clears both gates
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
    answers a 504 whenever it is busy. Over the v1 shortlist of 120 a country,
    for 42
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
# Climate: CHELSA monthly normals at the lake's own coordinate
#
# WorldClim 2.1 stood here until 2026-08-30 and is licensed for
# NON-COMMERCIAL use only, which a number printed under an affiliate link and
# inside a redistributable PDF cannot stand on. CHELSA V2.1 is CC BY 4.0,
# commercial use permitted with attribution, and at 30 arc seconds it is three
# times finer than the grid it replaces. The reader is pipeline/lakes/
# lake_climate.py; this is only the join.
# ---------------------------------------------------------------------------


def join_climate(lake):
    months = lake_climate.sample(lake["lat"], lake["lon"])
    if not months:
        return
    lake["climate"] = {
        "source": lake_climate.MODEL_SOURCE,
        "t_mean": months,
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

    # The OSM spine. Without these lines the second spine would be pointless:
    # a water body found by the extract sweep has no sitelinks, no Commons
    # category and no article, so it would score under two on the clauses
    # above and never reach the shortlist that earns the network calls. What
    # OSM knows instead is what is ON the shore, and a lake with a path round
    # it, a beach and a car park is a lake people go to whatever Wikidata
    # says about it.
    shore = lake.get("osm_shore") or {}
    if shore:
        if (shore.get("path_m") or 0) >= 300:
            score += 0.6
        if shore.get("beach"):
            score += 0.8
        if shore.get("swim_place"):
            score += 0.8
        if shore.get("marina") or shore.get("slipway"):
            score += 0.4
        if shore.get("parking"):
            score += 0.25
        if shore.get("camp"):
            score += 0.2
        if shore.get("viewpoint"):
            score += 0.3
    tags = lake.get("osm_tags") or {}
    if tags.get("wikipedia") and not lake.get("enwiki"):
        score += 0.5
    if tags.get("leisure") == "swimming_area":
        score += 0.6
    return round(score, 3)


# ---------------------------------------------------------------------------
# The shortlist, region by region
#
# `lakes[:120]` was the whole selection until the region programme, and it is
# the same mistake the publication cap made one stage later: a country is the
# wrong unit. Sorted by prelim score, a flat cut hands the entire Scottish
# budget to the Great Glen and never reaches Galloway, and it hands the
# Norwegian budget to the lakes near Oslo that somebody wrote an article
# about.
#
# So the cut is made per NUTS3 region and then interleaved, exactly as the
# export gate cuts the published rows: every region's first pick outranks any
# region's second, so the country ceiling below trims the deepest tails first
# rather than whichever lakeland happened to sort last. A row the region spine
# has not reached keeps its country as its group, which is the old behaviour
# for exactly the rows the old behaviour was right for.
# ---------------------------------------------------------------------------

REGION_SHORTLIST = 40    # per NUTS3 region, before the country ceiling
PER_REGION_BUDGET = 8    # what the automatic ceiling allows each region
CEILING_MIN = 120
CEILING_MAX = 900


def _quota_sum(groups):
    """What this country's regions are collectively owed by the region quota.

    Zero when the quota module or its measures are unavailable, which makes
    the caller fall back to the old region-count budget rather than fail."""
    try:
        mod = _regions_assign()
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "carta_region_quotas_enrich",
            HERE.parents[1] / "pipeline" / "regions" / "quotas.py")
        q = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(q)
        total = 0
        for key in groups:
            try:
                total += max(0, q.published_target(key, "lake"))
            except Exception:
                continue
        return total
    except Exception:
        return 0


def shortlist_for(lakes, ceiling=None, per_region=REGION_SHORTLIST):
    """The water bodies that earn the network calls, region by region.

    `ceiling` of None sizes the country's budget from how many regions it
    actually has water in, which is the whole difference between Luxembourg
    and Great Britain and is the number a flat 120 was pretending did not
    exist."""
    groups = {}
    for lake in lakes:
        key = (lake.get("rg") or {}).get("n3") or lake.get("iso2") or "?"
        groups.setdefault(key, []).append(lake)
    if ceiling is None:
        # Sized from OPPORTUNITY, not from a count of regions. A flat budget
        # per region is the same fault as a flat cap per country, one level
        # down: Norway's 21 regions hold 24,808 named water bodies and
        # Belgium's 11 hold a few hundred, and PER_REGION_BUDGET gave both
        # eight apiece. Norway shortlisted 168 candidates out of 26,339 and
        # published 30 against a target of 80, because the gate can only
        # choose from what was photographed.
        #
        # The region quota already measures the opportunity, so the budget is
        # a multiple of the quota this country's regions are owed. The
        # multiple is headroom for the gate: about one shortlisted lake in
        # six clears both the 5.4 score and the four-photograph bar, so a
        # budget equal to the quota would publish a sixth of it.
        quota = _quota_sum(groups)
        ceiling = max(CEILING_MIN,
                      min(CEILING_MAX,
                          max(len(groups) * PER_REGION_BUDGET,
                              int(quota * GATE_HEADROOM))))
    # A country with few regions must still be allowed to spend its budget.
    # Iceland is two NUTS3 regions and Faroe is one, so a flat 40 a region
    # would cap Iceland at 80 whatever its ceiling said, and the brief names
    # Iceland as one of the four holes this pass exists to close.
    per_region = max(per_region, -(-ceiling // max(1, len(groups))))
    ranked = []
    for key, group in groups.items():
        group.sort(key=lambda b: (-b["prelim"], b["name"]))
        for rank, lake in enumerate(group[:per_region]):
            ranked.append((rank, -lake["prelim"], lake["name"], lake))
    ranked.sort(key=lambda t: t[:3])
    short = [lake for _r, _p, _n, lake in ranked[:ceiling]]
    # A seeded entry is pinned whatever the region budget said. That is the
    # whole point of the seed, and San Marino is the proof: its one water
    # body is a pond that scores 3.7 and a human put it on the list knowing
    # exactly that.
    have = {id(lake) for lake in short}
    for lake in lakes:
        if lake.get("seed") and id(lake) not in have:
            short.append(lake)
    return short


# ---------------------------------------------------------------------------
# Wikimedia Commons: the photographs
# ---------------------------------------------------------------------------

# Every image query asks for the CATEGORIES too, and they are the reason this
# stage got strict. A Commons file name is very often silent ("01 Soline.jpg")
# and its categories never are: they say what the picture is of ("Views of
# Lake Bled", "Panoramics of Lake Bled"), what it is not ("Aircraft in
# Slovenia", "Memorials in Hungary"), and whether Commons' own reviewers
# thought it was any good ("Quality images", "Featured pictures on Wikimedia
# Commons"). All of that arrives in the same request that was already being
# made. See lake_images.py for what is done with it.
IMAGE_PROPS = {
    "prop": "imageinfo|categories",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    # Artist alone is empty on a large minority of older uploads, which is
    # how photographs came to ship a licence with nobody named. The credit
    # fields and the flag that says whether a credit is owed at all live
    # in pipeline/photos/credit.py, so the three layers cannot drift.
    "iiextmetadatafilter": photo_credit.EXTMETA_CREDIT
                           + "|ImageDescription|ObjectName",
    "cllimit": 500,
    "clshow": "!hidden",
}

# How many surviving candidates get a thumbnail downloaded and looked at. The
# pixel probe is one HTTP request each, so it runs only on the shortlist of
# the shortlist: the files that already passed the subject gate, in beauty
# order.
PIXEL_PROBE_MAX = 7


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

    def collect(params, near=False, pinned=False, from_cat=False):
        try:
            data = mediawiki(params, api=COMMONS_API)
        except (SourceError, ValueError):
            return
        for page in (data.get("query") or {}).get("pages") or []:
            title = page.get("title") or ""
            if title in seen:
                continue
            seen.add(title)
            # A file in the takedown ledger never re-enters the funnel,
            # whatever asserts it: that is what makes a takedown permanent
            # rather than lasting until the next enrich.
            if photo_takedown.is_taken_down(title):
                continue
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("url"):
                continue
            out.append({
                "title": title, "info": info, "near": near, "pinned": pinned,
                "from_cat": from_cat,
                "cats": [c.get("title", "").replace("Category:", "")
                         for c in (page.get("categories") or [])],
            })

    p18 = commons_filename(lake.get("wd_img"))
    if p18:
        collect({"titles": p18, **IMAGE_PROPS}, pinned=True)
    # The other curated view properties, same claim as P18 for the same
    # cost: P4640 panoramic, P8592 aerial (P5252 winter is mountains
    # only). Community-picked single bests the first build never asked
    # for. A failure here costs candidates, never the enrich.
    if lake.get("wd"):
        for _prop, title in photo_views.view_images(
                lambda u: get_json(u), lake["wd"], "lake"):
            if title not in seen:
                collect({"titles": title, **IMAGE_PROPS}, pinned=True)
    if cat:
        # Commons files the good pictures in subcategories, and names them
        # after what they show: "Views of Lake Bled", "Panoramics of Lake
        # Bled", "Aerial views of Lake Bled with Bled Island", "Sunsets over
        # ...". Those are precisely the photographs a card wants, sorted for
        # us by the people who uploaded them, so they are read FIRST and the
        # parent category second.
        for sub in view_subcategories(cat):
            collect({"generator": "categorymembers",
                     "gcmtitle": f"Category:{sub}", "gcmtype": "file",
                     "gcmlimit": 12, **IMAGE_PROPS}, from_cat="viewcat")
            if len(out) >= IMAGES_WANTED + 8:
                break
        collect({"generator": "categorymembers", "gcmtitle": f"Category:{cat}",
                 "gcmtype": "file", "gcmlimit": 20, **IMAGE_PROPS},
                from_cat=True)
        # Depth 2, because Commons files the pictures where they fit and
        # not where a harvester looks: Category:Loch Maree holds a handful
        # of files while "Loch Maree in winter" holds the corpus. Only
        # runs while the funnel is still short, only through subcategory
        # names that do not announce a non-subject (maps, coats of arms),
        # and everything it adds still faces the same subject gate.
        if len(out) < IMAGES_WANTED + 6:
            for sub in all_subcategories(cat):
                if len(out) >= IMAGES_WANTED + 10:
                    break
                collect({"generator": "categorymembers",
                         "gcmtitle": f"Category:{sub}", "gcmtype": "file",
                         "gcmlimit": 12, **IMAGE_PROPS}, from_cat=True)
    for name in queries[:2]:
        if len(out) >= IMAGES_WANTED + 8:
            break
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 14,
                 "gsrsearch": f"{name} filetype:bitmap "
                              f"nearcoord:{max(2, int(radius_km * 2))}km,"
                              f"{lake['lat']},{lake['lon']}",
                 **IMAGE_PROPS})
    # The blind geosearch stays, and it is the weakest source by a distance:
    # everything it returns has to earn its place through the subject gate,
    # which refuses anything nothing names. It is kept because for a small
    # lake with no Commons category it is the only source there is.
    if len(out) < IMAGES_WANTED + 2:
        # 50, up from 20: gslimit's real ceiling is 500 (5000 with a bot
        # flag), and a wider blind net costs nothing extra per call while
        # the subject gate still refuses everything nothing names.
        collect({"generator": "geosearch", "ggsnamespace": 6,
                 "ggscoord": f"{lake['lat']}|{lake['lon']}",
                 "ggsradius": near_m, "ggslimit": 50, **IMAGE_PROPS},
                near=True)
    return out


def view_subcategories(cat, limit=3):
    """Subcategories of a lake's Commons category that hold VIEWS of it.

    Commons is a filing system maintained by people who care, and it already
    separates "Views of Lake Bled" from "Boats on Lake Bled" and "Maps of Lake
    Bled". Asking for the subcategories costs one request and points the
    picker straight at the pictures somebody else already decided were the
    scenic ones."""
    try:
        data = mediawiki({"generator": "categorymembers",
                          "gcmtitle": f"Category:{cat}", "gcmtype": "subcat",
                          "gcmlimit": 50}, api=COMMONS_API)
    except (SourceError, ValueError):
        return []
    names = [(p.get("title") or "").replace("Category:", "")
             for p in (data.get("query") or {}).get("pages") or []]
    wanted = [n for n in names if lake_images.VIEW_WORD.search(n)]
    # Longest last: "Views of X" beats "Views of X from the north shore in
    # winter", and the shorter name is almost always the broader category.
    wanted.sort(key=len)
    return wanted[:limit]


def all_subcategories(cat, limit=8):
    """Subcategories of a Commons category, walked one level further down
    than view_subcategories and NOT filtered to view words: "Loch Maree
    in winter" names no view and holds the photographs. Names that
    announce a non-subject (maps of, coats of arms of) are skipped to
    save the requests; every file collected still faces the subject gate,
    which is what actually guards against category drift."""
    found, frontier = [], [cat]
    for _hop in range(2):
        next_frontier = []
        for parent in frontier:
            try:
                data = mediawiki({"generator": "categorymembers",
                                  "gcmtitle": f"Category:{parent}",
                                  "gcmtype": "subcat", "gcmlimit": 40},
                                 api=COMMONS_API)
            except (SourceError, ValueError):
                continue
            for page in (data.get("query") or {}).get("pages") or []:
                name = (page.get("title") or "").replace("Category:", "")
                if not name or name in found:
                    continue
                if lake_images.NOT_THE_SUBJECT.search(name):
                    continue
                found.append(name)
                next_frontier.append(name)
                if len(found) >= limit:
                    return found
        frontier = next_frontier[:4]
        if not frontier:
            break
    return found


def lake_tokens(lake):
    return (name_tokens(lake.get("name"))
            | name_tokens(lake.get("name_local"))
            | name_tokens((lake.get("seed") or {}).get("name")))


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


MIN_W, MIN_H = 800, 500
PINNED_MIN_W, PINNED_MIN_H = 400, 300


def big_enough(cand):
    """A P18 clears the size floor that exists to throw out the thumbnails and
    icons a blind search returns. It still has to be a photograph."""
    info = cand.get("info") or {}
    width, height = info.get("width") or 0, info.get("height") or 0
    if cand.get("pinned"):
        return width >= PINNED_MIN_W and height >= PINNED_MIN_H
    return width >= MIN_W and height >= MIN_H


def pick_images(lake, lang, probe=True):
    """The photographs of this lake, best first.

    Three gates, cheapest first, and the order matters because only the last
    one costs a download.

      subject   does anything ASSERT this file is this lake, and is it a
                photograph of a place rather than of a plaque
      beauty    Commons' own review categories, then the ones that describe a
                view, then shape and size
      pixels    the top few get their thumbnail looked at, and a passing
                mention that turns out to be a photograph of a car park is
                dropped

    Every picture keeps the evidence that let it in, so a reviewer reading the
    cache can see why it is there."""
    tokens = lake_tokens(lake)
    kept = []
    for cand in image_candidates(lake, lang):
        if not big_enough(cand):
            continue
        info = cand.get("info") or {}
        # A shape that crops to garbage in the 25/12 card is refused before
        # anything else is asked of it. The soft preference for frames that
        # fit lives in beauty_score, through the same helper.
        if lake_images.aspect_term(info.get("width") or 0,
                                   info.get("height") or 0)[0]:
            continue
        ok, evidence = lake_images.subject_verdict(cand, tokens)
        if not ok:
            continue
        # A file pulled out of "Views of <lake>" keeps that as its evidence:
        # somebody filed it there precisely because it is a view of the water.
        if evidence == "category" and cand.get("from_cat") == "viewcat":
            evidence = "viewcat"
        cand["evidence"] = evidence
        cand["score"] = lake_images.beauty_score(cand, tokens, evidence)
        kept.append(cand)
    kept.sort(key=lambda c: -c["score"])

    picked = []
    for cand in kept[:PIXEL_PROBE_MAX if probe else IMAGES_WANTED]:
        info = cand["info"]
        meta = info.get("extmetadata") or {}

        def meta_val(key):
            return strip_html((meta.get(key) or {}).get("value", ""))

        licence = meta_val("LicenseShortName")
        if re.search(r"fair use|non[- ]free|copyright", licence, re.I):
            continue

        seen_pixels = None
        if probe:
            try:
                seen_pixels = lake_images.probe_pixels(
                    request(info.get("thumburl") or info.get("url"), timeout=45))
            except (SourceError, ValueError, OSError):
                seen_pixels = None
        accepted, delta, why = lake_images.pixel_verdict(seen_pixels,
                                                         cand["evidence"])
        if not accepted and lake_images.pixel_veto_applies(cand["evidence"]):
            continue
        picked.append({
            "file": cand["title"],
            "url": info.get("thumburl") or info.get("url"),
            "full": info.get("url"),
            "w": info.get("thumbwidth") or info.get("width"),
            "h": info.get("thumbheight") or info.get("height"),
            "license": licence,
            "license_url": meta_val("LicenseUrl"),
            "author": photo_credit.author_of(info.get("extmetadata")),
            "caption": meta_val("ImageDescription")[:200],
            "page": "https://commons.wikimedia.org/wiki/"
                    + urllib.parse.quote(cand["title"].replace(" ", "_")),
            # Kept so the export stage can order without re-deriving anything,
            # and so a human can audit a choice without re-running the stage.
            "why": cand["evidence"],
            "score": round(cand["score"] + delta, 3),
            "seen": seen_pixels,
        })
        # Commons already told us whether a name is owed; store the
        # answer so a gate reads a column rather than parsing a licence
        # string (pipeline/photos/credit.py stamp()).
        photo_credit.stamp(picked[-1], info.get("extmetadata"))
        if len(picked) >= IMAGES_WANTED:
            break
    picked.sort(key=lambda i: -i["score"])
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
                   rephotograph=0, context_published=False,
                   photos_published=False):
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

    # Region ids first, because the shortlist is now cut region by region and
    # a row with no rg would be grouped under its country. Stamping the WHOLE
    # harvest rather than the shortlist also gives the coverage audit an
    # honest denominator: it can say which region a rejected candidate was in.
    try:
        _regions_assign().stamp_rows(lakes)
    except Exception as exc:  # the spine is optional at enrich time
        print(f"    rg stamping skipped ({type(exc).__name__}: {exc})")

    lakes.sort(key=lambda b: (-b["prelim"], b["name"]))
    short = shortlist_for(lakes, shortlist_n)
    seeded = sum(1 for b in short if b.get("seed"))
    regions = len({(b.get("rg") or {}).get("n3") for b in short})
    print(f"  {cc}: {len(lakes)} harvested, enriching {len(short)} "
          f"({seeded} seeded, {regions} regions)")

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
        if lake.get("rg") is None and was.get("rg") is not None:
            # Only ever FILLS. The fresh stamp above is the current spine's
            # answer, and a carry-over that overwrote it would pin whatever
            # the spine said the first time this row was enriched.
            lake["rg"] = was["rg"]

    if images:
        shipping = published_ids(cc) if photos_published else None
        todo_img = []
        for lake in short:
            was = previous.get(lake["key"]) or {}
            kept = was.get("images")
            # `rephotograph` re-shoots ONLY the lakes that came back thin,
            # which is what makes a change to the candidate rules worth a
            # run: adding Wikidata's P18 as a source rescued 302 of the 618
            # lakes the image gate had dropped, and re-photographing all
            # 3,809 on the v1 shortlist to reach them would have been two
            # and a half hours of
            # somebody else's bandwidth for nothing.
            thin = rephotograph and len(kept or []) < rephotograph
            # `photos_published` re-shoots the lakes a traveller can actually
            # see, and only those. The strict picker costs about fifteen
            # requests a lake, so running it over the whole shortlist to
            # improve the published cards would be an hour of Wikimedia's
            # bandwidth spent on rows nobody will ever open.
            if photos_published and shipping is not None:
                # Only lakes the CURRENT picker has not seen. Every picture it
                # chooses carries the evidence that let it in, so a missing
                # `why` is exactly "this was picked by the old rules".
                #
                # Written this way so the flag converges instead of looping:
                # tightening the picker changes which lakes get published, so
                # the published set is a moving target and the pass has to be
                # run twice. If the second run re-shot every published
                # lakes again rather than the handful the first export
                # promoted, converging would cost another four hours. Use
                # --refresh when the rules change and everything must be redone.
                stale = not kept or kept[0].get("why") is None
                thin = thin or (stale and lake.get("wd") in shipping)
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

    # The rg block was stamped over the whole harvest before the shortlist was
    # cut, so nothing is recomputed here; export reads what enrich stored.
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
    parser.add_argument("--photos-published", action="store_true",
                        help="re-photograph the lakes already in "
                             "continent-app/public/lakes, and only "
                             "those. Use after a change to the image "
                             "rules: it improves every card a traveller "
                             "can reach without re-shooting the tail")
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
                           context_published=args.context_published,
                           photos_published=args.photos_published)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
