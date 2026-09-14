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
import importlib.util
import json
import math
import re
import sys
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

from sources import (COMMONS_API, SourceError, get_json,  # noqa: E402
                     haversine_km, load_cache, mediawiki, overpass, request,
                     save_cache, wikipedia_api)


def _regions_assign():
    """pipeline/regions/assign.py under a neutral name, loaded on first use.
    Enrich owns the region assignment (stored in the cache, never recomputed
    at export), and the load is lazy so a clone without the spine still
    enriches; stamp_rows itself degrades to a warning in that case."""
    mod = sys.modules.get("carta_regions_assign")
    if mod is None:
        path = HERE.parents[1] / "pipeline" / "regions" / "assign.py"
        spec = importlib.util.spec_from_file_location("carta_regions_assign", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["carta_regions_assign"] = mod
        spec.loader.exec_module(mod)
    return mod
from harvest_beaches import COUNTRIES, LOCAL_LANG, fold, name_tokens  # noqa: E402
import eea_spine  # noqa: E402

# The lake layer's image lore, loaded by path the same way the mountain layer
# loads this layer's clients (pipeline/mountains/peak_sources.py): every layer
# names its modules inside its own folder, so whichever directory happened to
# sit first on sys.path would decide what a bare `import lake_images` meant.
# What this layer wants from it is the pixel probe (a beach card must show
# water, and only pixels can prove there is any) and the shared card-shape
# term, so the thresholds live in exactly one file.
_LAKE_IMAGES = HERE.parent / "lakes" / "lake_images.py"
_lake_spec = importlib.util.spec_from_file_location("carta_lake_images",
                                                    _LAKE_IMAGES)
lake_images = importlib.util.module_from_spec(_lake_spec)
sys.modules["carta_lake_images"] = lake_images
_lake_spec.loader.exec_module(lake_images)


# The photo engine's shared halves, same loading convention: the takedown
# ledger every candidate pass must honour, and the Wikidata view
# properties beyond P18.
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
DEST_INDEX = CACHE / "beaches" / "dest_index.json"

STAGE_IN = "raw"
STAGE_OUT = "rich"

# How many beaches per country earn the network calls. 170 was a flat number
# from the era of a flat PUBLISH_MAX=120, and it is the wrong shape for the
# same reason the cap was: Spain and Belgium do not have the same amount of
# coast. Since 03-BEACHES.md the shortlist is sized from the country's own
# publication target, which is the sum of its coastal stretches' quotas, so
# the expensive work lands where there is something to publish.
SHORTLIST = 170                  # the floor, and the fallback with no spine
SHORTLIST_PER_QUOTA = 3.0        # candidates enriched per rated row wanted
SHORTLIST_MAX = 2600             # a ceiling, so one country cannot eat a run
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
    # The harvest's spine merge already stamped the register's own row onto
    # every beach it could match by name, which is a better claim than "the
    # nearest point within 2.5 km". Only a NEARER site may replace it.
    held = beach.get("water") or {}
    if site is not None and held and (held.get("km") or 99) <= (km or 99):
        site = None
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

def _quotas():
    """pipeline/regions/quotas.py, loaded lazily and tolerated missing."""
    mod = sys.modules.get("carta_region_quotas")
    if mod is None:
        path = HERE.parents[1] / "pipeline" / "regions" / "quotas.py"
        try:
            spec = importlib.util.spec_from_file_location("carta_region_quotas",
                                                          path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules["carta_region_quotas"] = mod
            spec.loader.exec_module(mod)
        except Exception:
            return None
    return mod


def shortlist_size(beaches, floor=SHORTLIST):
    """How many of this country's beaches to enrich.

    The sum of the quotas of every coastal stretch the country's beaches
    actually sit on, times a headroom factor, because the score gate and the
    photo gate will both refuse a share of what is enriched. A country with no
    region assignment yet, or a run on a clone with no spine, falls back to the
    flat floor."""
    qmod = _quotas()
    if qmod is None or not qmod.has_data():
        return floor
    seen, target = set(), 0
    for beach in beaches:
        key = (beach.get("rg") or {}).get("co") or (beach.get("rg") or {}).get("n3")
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            target += qmod.published_target(key, "beach")
        except Exception:
            continue
    if not target:
        return floor
    return int(max(floor, min(SHORTLIST_MAX, target * SHORTLIST_PER_QUOTA)))

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
    # A site in the bathing water register is a place a government designated
    # for swimming and has sampled for up to ten seasons. That is a stronger
    # statement about "somebody swims here" than any tag, and the length of
    # the record is the strength of it.
    if "eea" in (b.get("sources") or []):
        score += 0.5 + 0.1 * min(4, water.get("years") or 0)
    # A measured length means the geometry is digitised, which correlates with
    # a beach somebody cared enough to map properly, and it is the one input
    # the v2 `space` component cannot do without.
    if b.get("length_m"):
        score += 0.3
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
#
# The rule this section is built around: a photograph may only be published if
# something EVIDENCES that it shows this beach. Not "was taken near it".
#
# The first version accepted anything geotagged within 300 m, and 41 per cent
# of published pictures turned out not to name their beach anywhere. The
# sample included a playground, castle ruins, a reed bed and a village square,
# all perfectly real photographs taken a few hundred metres from a beach and
# all useless on a card that promises the beach. Proximity is not depiction.
#
# So every candidate has to earn one of four kinds of evidence, and the kind
# it earned rides into the wire on the image row:
#
#   p18   the Wikidata main image of this beach: somebody curated it
#   cat   a member of the beach's own Commons category
#   name  the beach's distinctive name in the file's title, description or
#         categories
#   geo   geotagged within GEO_STRICT_M AND carrying a coastal word of its
#         own, which is what separates "the sea at Ksamil" from "playground in
#         Kustermann-Park"
#
# Nothing else is publishable, and a beach with fewer than MIN_IMAGES survivors
# is dropped by the export gate. Fewer beaches with true pictures beats more
# beaches with pictures of the car park.
# ---------------------------------------------------------------------------

IMAGE_PROPS = {
    "prop": "imageinfo",
    "iiprop": "url|size|extmetadata",
    "iiurlwidth": 1280,
    # Artist alone is empty on a large minority of older uploads, which is
    # how photographs came to ship a licence with nobody named. The credit
    # fields and the flag that says whether a credit is owed at all live
    # in pipeline/photos/credit.py, so the three layers cannot drift.
    "iiextmetadatafilter": photo_credit.EXTMETA_CREDIT
                           + "|ImageDescription|Categories|ObjectName",
}

# Tight on purpose. 4 km used to be the name-search radius and it let a photo
# of the village of the same name stand in for its beach.
NAME_NEAR_KM = 2
GEO_STRICT_M = 250

MIN_IMAGE_W = 1000          # a card is 500 px wide on a 2x screen
# Shape is judged by lake_images.aspect_term against the shared 25/12 card
# frame: a hard reject only at the extremes that crop to garbage, a strong
# penalty for portraits and strips, a nudge for the frames that fit.

# The pixel probe, borrowed whole from the lake layer: one small thumbnail per
# surviving candidate, and the question is whether the lower frame holds any
# water at all. The floor sits well below the lake's 0.12 because a beach
# photograph is legitimately mostly sand with a strip of sea, so what this
# refuses is the file with NO water band anywhere in the lower frame, which is
# the car park, the dune walk and the village square. The Wikidata P18 is
# exempt from the veto, exactly as it is for lakes: a person stated that
# picture depicts this beach.
BEACH_MIN_WATER = 0.07
PIXEL_PROBE_MAX = 6         # thumbs fetched per beach, IMAGES_WANTED survive
PROBE_PX = 500              # a width upload.wikimedia.org actually serves

# Words that make a file about the coast, in the languages the layer harvests.
# Used two ways: as the corroboration a geotagged file needs, and as a small
# ranking bonus everywhere else.
COASTAL_RE = re.compile(
    r"\b(beach|beaches|strand|strande|straende|playa|platja|praia|plage|"
    r"spiaggia|spiagge|cala|caleta|calanque|paralia|plaza|plazha|plaz|pludmale|"
    r"ranta|sandur|bay|cove|coast|coastline|shore|shoreline|seaside|sea|"
    r"seascape|ocean|meer|mer|mare|mar|kust|kyst|rannik|zatoka|more|kalliot)\b",
    re.I)

# A view of the beach, rather than a thing that happens to stand on one.
VIEW_RE = re.compile(
    r"\b(aerial|drone|from above|birds?[- ]eye|panorama|panoramic|view|views|"
    r"vista|viewpoint|overlook|looking|skyline|landscape|seen from)\b", re.I)

# Rejected outright: the file is of something else that stands near a beach.
# Kept tight and word bounded, because half of these words also appear in
# perfectly good beach photographs as a background detail. The test runs on
# the TITLE only for that reason, never on the description.
NOT_A_VIEW_RE = re.compile(
    r"\b(playground|spielplatz|ruin|ruins|ruiny|ruine|castle|schloss|zamek|"
    r"church|kirche|kosciol|chapel|monastery|cathedral|mosque|synagogue|"
    r"monument|memorial|statue|museum|library|school|hospital|station|"
    r"bahnhof|airport|factory|windmill|watermill|market|markt|shop|store|"
    r"menu|restaurant interior|hotel room|bedroom|kitchen|toilet|wc|"
    r"parking|car park|roadworks|construction|baustelle|excavation|"
    r"portrait|selfie|wedding|funeral|concert|festival|parade|match|"
    r"football|stadium|racing|regatta start|scoreboard|"
    r"information board|infotafel|noticeboard|plaque|milestone|"
    r"reed|schilf|mushroom|fungus|beetle|spider|butterfly|moth|"
    r"flower|blossom|orchid|lichen|moss)\b", re.I)

# Conditions nobody chooses a beach for. Not rejected, just ranked down: a
# storm photograph is still that beach.
POOR_CONDITION_RE = re.compile(
    r"\b(storm|sturm|flood|litter|rubbish|garbage|pollution|oil spill|"
    r"snow|schnee|ice|frozen|fog|nebel|night|nacht|construction)\b", re.I)

BAD_FILE_RE = re.compile(
    r"\.(svg|pdf|tif|tiff|ogv|webm|ogg|mid|djvu)$|"
    r"\b(map|karte|carte|mapa|plan|blazon|coat[ _]of[ _]arms|flag|logo|"
    r"diagram|chart|graph|sign|schild|panneau|stamp|briefmarke|poster|"
    r"screenshot|grave|tomb)\b", re.I)

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


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _meta(info, key):
    meta = info.get("extmetadata") or {}
    return strip_html((meta.get(key) or {}).get("value", ""))


def _haystack(title, info):
    """Everything the file says about itself: title, caption, categories."""
    return " ".join([
        title,
        _meta(info, "ObjectName"),
        _meta(info, "ImageDescription"),
        _meta(info, "Categories").replace("|", " "),
    ])


def image_candidates(beach, lang):
    """Commons files that might show THIS beach, each tagged with how it was
    found, because how it was found is most of the evidence.

    Four passes in falling order of trust: the Wikidata main image, the
    beach's own Commons category, a name search pinned to the coordinate, and
    a tight geosearch. Everything is still filtered by score_image()."""
    seen, out = set(), []

    def collect(params, source):
        try:
            data = mediawiki(params, api=COMMONS_API)
        except (SourceError, ValueError):
            return
        for page in (data.get("query") or {}).get("pages") or []:
            title = page.get("title") or ""
            if title in seen:
                continue
            # A file in the takedown ledger never re-enters the funnel,
            # whatever asserts it: that is what makes a takedown permanent
            # rather than lasting until the next enrich.
            if photo_takedown.is_taken_down(title):
                continue
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("url"):
                continue
            seen.add(title)
            out.append({"title": title, "info": info, "source": source})

    # 1. The Wikidata main image (P18). Somebody chose this one to represent
    #    the beach, which is a stronger statement than any search can make,
    #    and until now the harvest collected it and nothing read it. The
    #    other curated view properties (P4640 panoramic, P8592 aerial) are
    #    the same claim for the same cost, so they enter at the same rank.
    p18 = commons_filename(beach.get("wd_img"))
    if p18:
        collect({"titles": f"File:{p18}", **IMAGE_PROPS}, "p18")
    if beach.get("wd"):
        for _prop, title in photo_views.view_images(
                lambda u: get_json(u), beach["wd"], "beach"):
            if title not in seen:
                collect({"titles": title, **IMAGE_PROPS}, "p18")

    cat = beach.get("commons_cat")
    if cat:
        collect({"generator": "categorymembers", "gcmtitle": f"Category:{cat}",
                 "gcmtype": "file", "gcmlimit": 12, **IMAGE_PROPS}, "cat")
        # Depth 2, because Commons files the pictures where they fit:
        # the parent category often holds a handful of files while a
        # subcategory holds the corpus. Only while the funnel is short;
        # names announcing a non-subject are skipped; every file still
        # faces score_image(), which is what guards against drift.
        if len(out) < IMAGES_WANTED + 4:
            for sub in subcategories_of(cat):
                if len(out) >= IMAGES_WANTED + 8:
                    break
                collect({"generator": "categorymembers",
                         "gcmtitle": f"Category:{sub}", "gcmtype": "file",
                         "gcmlimit": 10, **IMAGE_PROPS}, "cat")

    queries = []
    for name in (beach.get("name"), beach.get("name_local")):
        if name and fold(name) not in {fold(q) for q in queries}:
            queries.append(name)
    for name in queries[:2]:
        collect({"generator": "search", "gsrnamespace": 6, "gsrlimit": 10,
                 "gsrsearch": f"{name} filetype:bitmap "
                              f"nearcoord:{NAME_NEAR_KM}km,"
                              f"{beach['lat']},{beach['lon']}",
                 **IMAGE_PROPS}, "search")

    # 4. The small cove nobody named a file after. This pass only produces
    #    publishable candidates when the file describes itself as coastal, so
    #    it is worth running even when the others already found something.
    #    30, up from 12: gslimit's real ceiling is 500, and a wider blind
    #    net costs nothing extra per call while the coastal-description
    #    gate still refuses everything else.
    collect({"generator": "geosearch", "ggsnamespace": 6,
             "ggscoord": f"{beach['lat']}|{beach['lon']}",
             "ggsradius": GEO_STRICT_M, "ggslimit": 30, **IMAGE_PROPS}, "geo")
    return out


def subcategories_of(cat, limit=6):
    """Subcategories of a beach's Commons category, two hops down.

    Commons files the photographs where they fit and not where a
    harvester looks, so the parent often holds a handful while a
    subcategory holds the corpus. Names that announce a non-subject
    (maps of, coats of arms of) are skipped to save the requests; every
    file collected still faces score_image(), which is what actually
    guards against category drift."""
    found, frontier = [], [cat]
    for _hop in range(2):
        next_frontier = []
        for parent in frontier:
            try:
                data = mediawiki({"generator": "categorymembers",
                                  "gcmtitle": f"Category:{parent}",
                                  "gcmtype": "subcat", "gcmlimit": 30},
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
        frontier = next_frontier[:3]
        if not frontier:
            break
    return found


def image_evidence(cand, beach):
    """Which of the four evidence kinds this file earns, or "" for none.

    This is the gate. Everything below it is only ordering."""
    if cand["source"] == "p18":
        return "p18"
    title = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    hay = fold(_haystack(title, cand["info"]))
    tokens = name_tokens(beach.get("name")) | name_tokens(beach.get("name_local"))
    if tokens and any(t in hay for t in tokens):
        return "name"
    if cand["source"] == "cat":
        return "cat"
    if cand["source"] == "geo" and COASTAL_RE.search(hay):
        return "geo"
    # A name search hit that never names the beach is a coincidence of words.
    return ""


def score_image(cand, beach):
    """How good a VIEW of the beach this is, once it has cleared the gate.

    Returns -1 for anything that must not be published, so the caller can sort
    and cut in one pass."""
    title = cand["title"][5:] if cand["title"].startswith("File:") else cand["title"]
    info = cand["info"]

    evidence = image_evidence(cand, beach)
    if not evidence:
        return -1, ""
    if BAD_FILE_RE.search(title) or SPECIES_RE.match(title):
        return -1, ""
    # The subject test runs on the title only. Half these words turn up in the
    # description of a perfectly good beach photograph as background detail.
    if NOT_A_VIEW_RE.search(title) and evidence != "p18":
        return -1, ""
    licence = _meta(info, "LicenseShortName")
    if not licence or re.search(r"fair use|non[- ]free|copyright", licence, re.I):
        return -1, ""

    width, height = info.get("width") or 0, info.get("height") or 0
    if width < MIN_IMAGE_W or height < 500:
        return -1, ""
    shape_reject, fit_delta = lake_images.aspect_term(width, height)
    if shape_reject:
        return -1, ""              # crops to garbage in the 25/12 card

    hay = _haystack(title, info)
    folded = fold(hay)
    score = 0.0
    score += {"p18": 4.0, "cat": 2.2, "name": 2.6, "geo": 1.4}[evidence]
    if COASTAL_RE.search(hay):
        score += 1.2
    if VIEW_RE.search(hay):
        score += 1.0
    # The card frame preference: photographs near 25/12 fill the hero slot,
    # portraits and strips fight it, and comparable pictures now sort by that.
    score += fit_delta
    if width >= 2000:
        score += 0.5
    if POOR_CONDITION_RE.search(hay):
        score -= 1.5
    if "panoramio" in folded:
        score -= 0.3               # bulk import, mediocre on average
    return score, evidence


def probe_url(info):
    """The small thumbnail the pixel probe downloads.

    The API was asked for 1280 px thumbs, which are the right size to publish
    and four times the download the probe needs, so the width in the thumb
    path is swapped for PROBE_PX. Only fixed widths are served, and 500 is on
    the list; anything that is not a thumb is fetched as it is. The API's own
    utm tracking parameters come off first, per the standing repo rule about
    editing Commons thumb paths."""
    url = (info.get("thumburl") or info.get("url") or "").split("?", 1)[0]
    if "/thumb/" in url:
        url = re.sub(r"/\d+px-", f"/{PROBE_PX}px-", url, count=1)
    return url


def pick_images(beach, lang, probe=True):
    """Up to IMAGES_WANTED photographs of this beach, best view first.

    Two passes, cheapest first. The metadata gate (score_image) decides which
    files EVIDENCE being of this beach; then the top few get their thumbnail
    looked at by the lake layer's probe, and a candidate with no water band in
    the lower frame is dropped unless it is the Wikidata P18. That is the gate
    that tells "the sea at Ksamil" from a true photograph of the promenade,
    and it is why a beach named in a car park file no longer leads a card.
    The probe result rides into the cache as `seen`, so a re-run that keeps
    the cached picks never fetches the thumbnail again."""
    cands = image_candidates(beach, lang)
    scored = []
    for cand in cands:
        score, evidence = score_image(cand, beach)
        if score >= 0:
            scored.append((score, evidence, cand))
    # Sort on score, then on the file name, so a re-run with the same answers
    # produces the same four pictures in the same order.
    scored.sort(key=lambda row: (-row[0], row[2]["title"]))

    picked = []
    for score, evidence, cand in scored[:PIXEL_PROBE_MAX if probe else IMAGES_WANTED]:
        info = cand["info"]
        seen_pixels, delta = None, 0.0
        if probe:
            try:
                seen_pixels = lake_images.probe_pixels(
                    request(probe_url(info), timeout=45))
            except (SourceError, ValueError, OSError):
                seen_pixels = None
            accepted, delta, _why = lake_images.water_verdict(
                seen_pixels, BEACH_MIN_WATER, abstain_on_grey=True)
            if not accepted and evidence != "p18":
                continue
        picked.append({
            "file": cand["title"],
            "url": info.get("thumburl") or info.get("url"),
            "full": info.get("url"),
            "w": info.get("thumbwidth") or info.get("width"),
            "h": info.get("thumbheight") or info.get("height"),
            "license": _meta(info, "LicenseShortName"),
            "license_url": _meta(info, "LicenseUrl"),
            "author": photo_credit.author_of(info.get("extmetadata")),
            "caption": _meta(info, "ImageDescription")[:200],
            "evidence": evidence,
            "score": round(score + delta, 2),
            # What the probe measured, kept in the cache like the lake layer
            # keeps it: the export can be audited without a re-fetch, and a
            # re-run that reuses these picks never downloads the thumb again.
            "seen": seen_pixels,
            "page": "https://commons.wikimedia.org/wiki/"
                    + urllib.parse.quote(cand["title"].replace(" ", "_")),
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


def uk_bathing_covers(cc):
    """Whether the UK bathing water harvest has landed for this country.

    Kept as its own function rather than inlined because the answer is
    expected to change: the Defra and Natural Resources Wales feeds are OGL
    and documented, and are currently unreachable from this network (see
    pipeline/beaches/uk_bathing.py). The moment the cache exists, Great
    Britain stops being a no-source country and its beaches get a real class
    instead of a dropped component."""
    try:
        import uk_bathing
        return uk_bathing.covers(cc)
    except Exception:
        return False


def enrich_country(cc, shortlist_n=None, refresh=False, bathing=None,
                   protected=None, dests=None, images=True, context=True,
                   refresh_images=False, rephotograph=0, aspect_reader=None,
                   protection_reader=None):
    raw = load_cache(STAGE_IN, cc)
    if not raw or not raw.get("beaches"):
        print(f"  {cc}: nothing harvested")
        return None
    previous = {} if refresh else {
        b["key"]: b for b in (load_cache(STAGE_OUT, cc) or {}).get("beaches", [])
    }

    # Whether the country has any bathing water source at all. Where it has
    # none the water component is DROPPED and the weights renormalised, rather
    # than defaulted to a class nobody measured (invariant 9). The flag rides
    # in the cache so the export and the index both read the same answer.
    no_water_source = not eea_spine.covers(cc) and not uk_bathing_covers(cc)

    beaches = [dict(b) for b in raw["beaches"]]
    for b in beaches:
        # A row that came out of the register already knows whether it is sea
        # or lake, from the register's own water category. Only guess for the
        # rows that do not.
        if b.get("coastal") is None:
            b["_coastal"] = coastal_guess(b, bathing)
        else:
            b["_coastal"] = b["coastal"]
        join_local(b, bathing, protected, dests)
        b["coastal"] = b.pop("_coastal")
        if no_water_source:
            b["no_water_source"] = True
        b["prelim"] = prelim_score(b)

    beaches.sort(key=lambda b: -b["prelim"])
    if shortlist_n is None:
        shortlist_n = shortlist_size(beaches)
    short = beaches[:shortlist_n]
    print(f"  {cc}: {len(beaches)} harvested, enriching {len(short)}"
          + (" [no bathing water source for this country]"
             if no_water_source else ""))

    # What the previous cache already knows, carried across before any phase
    # runs. This list is rebuilt from the HARVEST cache every time, so anything
    # a phase decides not to fetch again has to be copied here or the rewritten
    # cache simply loses it.
    #
    # Straight out of the lake layer's scar tissue (docs/LAKES.md), and there
    # are two holes here rather than one:
    #
    #   photographs   the reuse sat inside the `if images:` branch, so
    #                 --no-images meant "throw the pictures away" rather than
    #                 "do not fetch new ones". A context-only sweep emptied a
    #                 country and it vanished from the next export, because the
    #                 gate wants two photographs.
    #   article facts an article is only ever fetched for a beach the previous
    #                 cache has NO article for, and nothing copied the ones it
    #                 did have. So every warm re-run stripped the facts and the
    #                 pageviews off exactly the beaches that had them, which is
    #                 how 429 of the 788 wiki-linked beaches in cache/beaches
    #                 ended up with a Wikipedia link and no facts behind it.
    #
    # A switch controls the network. It has never controlled the data.
    for b in short:
        was = previous.get(b["key"]) or {}
        if was.get("article") is not None:
            b["article"] = was["article"]
        if was.get("views60") is not None:
            b["views60"] = max(b.get("views60") or 0, was["views60"])
        if was.get("images") is not None:
            b["images"] = was["images"]
        if was.get("rg") is not None:
            b["rg"] = was["rg"]
        # Everything a phase may decide not to recompute has to be copied
        # before the phases run, or the rewritten cache simply loses it. This
        # list grew with v2 and the rule has not changed: a switch controls
        # the network, never the data.
        for field in ("aspect", "aspect_done", "shore_km", "sunset_facing",
                      "protection", "sst", "approach"):
            if was.get(field) is not None:
                b[field] = was[field]

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
            # `rephotograph` re-shoots ONLY the beaches that came back thin,
            # which is what makes a change to the picture rules affordable:
            # the full pass is seven hours of Wikimedia's bandwidth, and after
            # the grey water abstention was added the beaches that needed
            # asking again were the hundred the pixel gate had emptied, not
            # all 4,700. --rephotograph 2 targets exactly what the export
            # gate drops, the same lever pipeline/lakes/enrich_lakes.py has.
            thin = rephotograph and len(was.get("images") or []) < rephotograph
            if (was.get("images") is not None
                    and not (refresh or refresh_images) and not thin):
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

    # 4. Region ids, local and free. Stored here so export reads, never
    # recomputes; rows the carry-over already stamped are skipped.
    try:
        _regions_assign().stamp_rows(short)
    except Exception as exc:  # the spine is optional at enrich time
        print(f"    rg stamping skipped ({type(exc).__name__}: {exc})")

    # 5. Which way the beach faces, and whether the sun sets over its water.
    # Local, free and cached per row, so this is idempotent like everything
    # above it. Skipped entirely on a clone with no EEA coastline.
    if aspect_reader is not None and aspect_reader.ready:
        stamped = aspect_reader.stamp(short)
        if stamped:
            facing = sum(1 for b in short if b.get("sunset_facing"))
            print(f"    aspect on {stamped} beaches, {facing} face the sunset")

    # 6. Protection, including outside the EU. Natura 2000 is the EU half and
    # the Emerald Network is its non-EU twin, so the chip works in Norway and
    # the Balkans rather than stopping at the EU border.
    if protection_reader is not None and protection_reader.ready:
        protection_reader.stamp(short)

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
    parser.add_argument("--shortlist", type=int, default=None,
                        help="beaches per country to enrich. Default: sized "
                             "from the country's own region quotas.")
    parser.add_argument("--no-aspect", action="store_true",
                        help="skip the coastline aspect and sunset pass")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--no-images", action="store_true",
                        help="skip Commons, for a quick structural run")
    parser.add_argument("--refresh-images", action="store_true",
                        help="re-run the photograph pass only, keeping the "
                             "article facts and the Overpass ground truth. "
                             "This is the one to use after changing what "
                             "counts as a picture OF the beach.")
    parser.add_argument("--rephotograph", type=int, default=0, metavar="N",
                        help="re-shoot only the beaches now holding fewer "
                             "than N photographs, leaving the rest of the "
                             "cache alone; --rephotograph 2 targets exactly "
                             "the beaches the export gate drops")
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

    # Both readers hold a continent of geometry, so they are built once for
    # the whole run rather than once per country.
    aspect_reader = None
    if not args.no_aspect:
        try:
            import coastline
            aspect_reader = coastline.AspectReader()
            if not aspect_reader.ready:
                print("  note: coastline unavailable, aspect skipped")
        except Exception as exc:
            print(f"  note: aspect pass unavailable ({type(exc).__name__}: {exc})")
    protection_reader = None
    try:
        import protection
        protection_reader = protection.ProtectionReader()
        if not protection_reader.ready:
            protection_reader = None
    except Exception:
        protection_reader = None

    for cc in countries:
        if load_cache(STAGE_IN, cc) is None:
            continue
        try:
            enrich_country(cc, shortlist_n=args.shortlist, refresh=args.refresh,
                           bathing=bathing, protected=protected, dests=dests,
                           images=not args.no_images,
                           context=not args.no_context,
                           refresh_images=args.refresh_images,
                           rephotograph=args.rephotograph,
                           aspect_reader=aspect_reader,
                           protection_reader=protection_reader)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"  {cc}: failed ({exc})")


if __name__ == "__main__":
    main()
