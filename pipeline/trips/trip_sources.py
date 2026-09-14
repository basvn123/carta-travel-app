"""Shared ground for the trip layer: paths, the catalogue view, attribution.

The trip layer composes multi day itineraries out of things this repo already
knows, plus one new free harvest (Wikivoyage routes). Nothing here queries a
paid API and nothing here stores a byte we are not licensed to store, which is
the whole architectural point: the spine is the catalogue master, and every
extra signal is either public domain (Wikidata, Eurostat) or CC BY-SA with
attribution (Wikivoyage, Wikipedia, Commons photographs).

What the composer reads, and why each one earns its place:

    app_data/app_data.json      the spine. 3,038 places with a 0-10 traveller
                                rating, categories, city centre coordinates,
                                measured nightly stay prices, local transport
                                quality, climate normals, crowding, UNESCO and
                                other designations, a hero photograph, and up
                                to ~52 ranked POIs each (activities.items_full)
    cache/wikivoyage.json       which places a human travel editor wrote a
                                guide for, and what class that guide reached
    cache/wikivoyage_listings.json  the See/Do shortlists and the article class
                                (star, guide, usable, outline)
    cache/trips/routes.json     NEW: the "Go next" graph and the itinerary
                                articles, harvested by harvest_routes.py
    cache/dest_pageviews.json   attention, as a tie breaker only
    cache/eurostat_nights_nuts3.json  official visitor nights per NUTS3 region,
                                the demand check that stops the composer from
                                building a week around a place nobody visits
    continent-app/public/{beaches,lakes,mountains,trails}/  the published
                                natural layers, joined by distance so a trip
                                can say what is actually around a base

Attribution rides in index.json and is rendered in Account > Data sources, the
same contract the beach, lake and mountain layers ship under.
"""

import json
import os
import re
import sys
import unicodedata
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache"
TRIP_CACHE = CACHE / "trips"
PUBLIC = ROOT / "continent-app" / "public"
WIRE_DIR = PUBLIC / "trips"

MODEL_VERSION = "trips_v1"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}

ATTRIBUTION = [
    {"name": "Wikivoyage contributors", "url": "https://en.wikivoyage.org/",
     "license": "CC BY-SA 4.0",
     "note": "Guide status, See and Do shortlists, Go next links, itinerary articles"},
    {"name": "Wikidata", "url": "https://www.wikidata.org", "license": "CC0",
     "note": "Points of interest, designations, festivals"},
    {"name": "Wikimedia Commons contributors", "url": "https://commons.wikimedia.org",
     "license": "Free licenses, checked per file",
     "note": "Photographs"},
    {"name": "OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright",
     "license": "ODbL 1.0", "note": "Points of interest, parking, protected areas"},
    {"name": "Eurostat", "url": "https://ec.europa.eu/eurostat",
     "license": "Eurostat licence, attribution required",
     "note": "Tourist nights per NUTS3 region, used as a demand check"},
    {"name": "WorldClim 2.1", "url": "https://www.worldclim.org",
     "license": "CC BY-SA 4.0", "note": "Climate normals behind the best months"},
]


# ---------------------------------------------------------------- small tools

def haversine_km(lat1, lon1, lat2, lon2):
    """Great circle distance in km, or None when a coordinate is missing."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    r = 6371.0088
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    h = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * r * asin(sqrt(h))


# NFKD leaves these letters undecomposed, so name matching silently misses
# without an explicit table. Same fold the app's search uses.
_FOLD = {
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
    "ł": "l", "Ł": "l", "ð": "d", "Ð": "d",
    "þ": "th", "Þ": "th", "ß": "ss", "ı": "i",
}


def fold(text):
    """Lowercase, accent folded, punctuation free: the key names match on."""
    s = "".join(_FOLD.get(ch, ch) for ch in str(text or ""))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().strip()


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", fold(text))
    return s.strip("-") or "x"


def load_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path, data, *, compact=False):
    """Atomic write, through the pipeline's shared helper when it imports."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    kwargs = ({"indent": None, "separators": (",", ":")} if compact
              else {"indent": 1})
    try:
        from pipeline_io import atomic_write_json
        atomic_write_json(p, data, ensure_ascii=False, **kwargs)
        return
    except Exception:
        pass
    tmp = str(p) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, **kwargs)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)


# ------------------------------------------------------------- the catalogue

# A place whose name carries an airport in brackets is one city, not two. The
# suffix is flight speak and a trip card talks about towns.
_AIRPORT_SUFFIX = re.compile(r"\s*\([^)]*\)\s*$")


def base_city_name(city):
    return _AIRPORT_SUFFIX.sub("", str(city or "")).strip() or str(city or "")


def load_catalogue(master=None):
    """Every priced place as a flat record the composer can score directly.

    Coordinates are the CITY centre wherever the master has one: an itinerary
    that walks you from the runway is a worse itinerary, and nine destinations
    in the catalogue are deliberately anchored on their airport instead.
    """
    raw = load_json(master or MASTER)
    if not raw or "destinations" not in raw:
        raise SystemExit("no catalogue master at %s" % (master or MASTER))
    out = {}
    for did, d in raw["destinations"].items():
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        acts = d.get("activities") or {}
        rating = d.get("rating") or {}
        place = d.get("place") or {}
        guide = d.get("guide")
        out[did] = {
            "id": did,
            "city": base_city_name(d.get("city")),
            "raw_city": d.get("city"),
            "country": d.get("country"),
            "iso2": d.get("iso2"),
            "lat": lat, "lon": lon,
            "rating": rating.get("score"),
            "tier": rating.get("tier"),
            "hidden_gem": bool(rating.get("hidden_gem")),
            "fame": rating.get("fame") or 0,
            "categories": d.get("categories") or [],
            "place_class": place.get("class"),
            "visit_h": place.get("visit_h"),
            "depth": place.get("depth"),
            "pop": (d.get("geonames") or {}).get("population"),
            "climate": d.get("climate") or None,
            "crowding": d.get("crowding") or None,
            "accommodation": d.get("accommodation") or None,
            "costs": d.get("costs") or None,
            "transit": d.get("local_transport") or {},
            "image": d.get("image") or None,
            "designations": d.get("designations") or [],
            "beauty": d.get("beauty") or {},
            "guide": guide.get("text") if isinstance(guide, dict) else None,
            "pois": acts.get("items_full") or [],
        }
    return out


def catalogue_meta(master=None):
    raw = load_json(master or MASTER) or {}
    return raw.get("meta") or {}


# ----------------------------------------------------------- published layers

_LAYER_KEY = {"beaches": "beaches", "lakes": "lakes",
              "mountains": "mountains", "trails": "trips"}
# Singular, spelled out rather than sliced: "beaches"[:-1] is "beache".
_LAYER_ONE = {"beaches": "beach", "lakes": "lake", "mountains": "mountain"}


def load_layer(kind, cc):
    """One country of a published natural layer, or an empty list."""
    raw = load_json(PUBLIC / kind / ("%s.json" % cc))
    if not raw:
        return []
    rows = raw.get(_LAYER_KEY[kind]) or []
    return [r for r in rows if isinstance(r, dict)]


def layer_index(cc):
    """The natural layer rows of one country, each reduced to what a trip card
    needs: a name, a point, a score and which layer it came from."""
    out = []
    for kind in ("beaches", "lakes", "mountains"):
        for r in load_layer(kind, cc):
            if r.get("lat") is None or r.get("lon") is None:
                continue
            images = r.get("images") or []
            out.append({
                "kind": _LAYER_ONE[kind],
                "id": r.get("id"), "name": r.get("name"),
                "lat": r["lat"], "lon": r["lon"],
                "score": r.get("score") or 0,
                "img": (images[0] or {}).get("url") if images else None,
            })
    for r in load_layer("trails", cc):
        bbox = r.get("bbox") or []
        if len(bbox) != 4:
            continue
        img = r.get("img")
        rating = r.get("rating")
        out.append({
            "kind": "trail", "id": r.get("id"), "name": r.get("name"),
            "lat": (bbox[1] + bbox[3]) / 2, "lon": (bbox[0] + bbox[2]) / 2,
            # The trails wire scores a walk with a bare float, the natural
            # layers with an object. Take whichever this row carries.
            "score": (rating.get("score") if isinstance(rating, dict) else rating) or 0,
            "km": round((r.get("distance_m") or 0) / 1000, 1),
            "category": r.get("category"),
            # trails ship {u,w,h}; the natural layers ship {url,...}
            "img": (img.get("u") or img.get("url")) if isinstance(img, dict) else img,
        })
    return out


# -------------------------------------------------------------- demand signal

def load_demand():
    """Official visitor nights per NUTS3 region, keyed by region code.

    Eurostat publishes tourist nights spent per NUTS3; the catalogue already
    carries the NUTS3 code on dest.crowding, so this joins without geometry.
    It is a demand CHECK, not a ranking: a beautiful place in a quiet region
    still ships, it just does not get the "people really go here" credit.
    """
    return load_json(CACHE / "eurostat_nights_nuts3.json", {}) or {}


def load_pageviews():
    return load_json(CACHE / "dest_pageviews.json", {}) or {}


def load_wikivoyage():
    return load_json(CACHE / "wikivoyage.json", {}) or {}


def load_wv_listings():
    return load_json(CACHE / "wikivoyage_listings.json", {}) or {}


def load_routes():
    """The Go next graph and the itinerary articles, from harvest_routes.py."""
    return load_json(TRIP_CACHE / "routes.json", {}) or {}
