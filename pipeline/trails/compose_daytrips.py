"""Daytrip composer: turn catalogue POIs plus a staged hike into a timed day.

Input is an anchor destination id from the continent-app catalogue
(app_data/app_data.json), for example gem:interlaken, gem:chamonix or BGO.
The composer shortlists that destination's best POIs with the SAME ranking
the app's day planner uses, optionally puts one nearby staged hike under four
hours at the head of the day, sequences everything with a greedy
nearest-neighbour walk that honours dwell times and opening hours, and stores
the result as a trips row (category='daytrip') with one trip_stops row per
stop.

What is mirrored from continent-app/src/planner (so a composed daytrip and a
planner day agree on how long a day is):
  dayDraft.js     KIND_DWELL per-kind visit minutes, the visit-pace factors,
                  poiScore/isMustSee ranking, the commercial-noise and
                  transport-infrastructure exclusions, optimizeOrder's
                  nearest-neighbour sequencing, the 1.25 street factor and
                  4.5 km/h walking speed
  daySchedule.js  09:30 start, 18:00 "day is done" mark, a 45 minute lunch
                  slotted into the first pause after 12:30, never mid-visit

Opening hours are ASSUMED, not harvested: nothing in the catalogue carries an
opening_hours field, so KIND_HOURS below holds one documented high-season
window per POI kind and every stored stop is stamped hours_assumed=true.
Kinds that are not in the table are treated as open all day rather than given
invented hours. A stop is only scheduled when the whole visit finishes before
closing time, and the day waits at most MAX_WAIT_MIN for a place to open.

Legs, in cascade order per leg (the fallback used is recorded per stop):
  walk    local Valhalla, pedestrian costing (legs under WALK_MAX_KM always
          walk, whatever --transport says)
  transit public Transitous plan API, reusing tools/reachability/build_reach
          for the config, the one-request-per-second pacing and the paced
          fetch itself. Its two gotchas carry over: IncompleteRead and
          friends arrive as http.client.HTTPException and must be retried
          with backoff, and identical coordinates are collapsed (here into an
          on-disk cache key) so the same leg is never queried twice.
  drive   local Valhalla, auto costing
  estimate straight-line fallback when a router has no answer (Valhalla only
          holds ONE country's tiles at a time, so composing a French daytrip
          against Swiss tiles falls back here). Always flagged in the print
          out and in raw_tags, never silently passed off as a routed leg.

Nothing is ever auto-approved: composed daytrips land as status='draft'. A
recompose that changes the itinerary demotes an already approved or published
daytrip to needs_review instead of quietly rewriting live content.

Usage, from the repo root (DB up; Valhalla up for routed legs, see
tools/trailslab/valhalla/prepare.py):
    python pipeline/trails/compose_daytrips.py --pilot
    python pipeline/trails/compose_daytrips.py --dest gem:interlaken
    python pipeline/trails/compose_daytrips.py --dest BGO --transport drive
    python pipeline/trails/compose_daytrips.py --dest gem:chamonix --dry-run
"""

import argparse
import http.client
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "tools" / "reachability"))

from db import connect  # noqa: E402  (also puts pipeline/ on sys.path)
from repair import decode_polyline6, dist_m  # noqa: E402
import build_reach as br  # noqa: E402  (Transitous config, pacing, fetch)

APP_DATA = ROOT / "app_data" / "app_data.json"
ENRICH_CACHE = ROOT / "app_data" / "enrich_cache.json"
TRANSIT_CACHE = ROOT / "cache" / "daytrip_transit.json"

PILOT_DESTS = ["gem:interlaken", "gem:chamonix", "BGO"]

# ---------------------------------------------------------------------------
# The day's clock, mirroring continent-app/src/planner/daySchedule.js
# ---------------------------------------------------------------------------
DAY_START_MIN = 9 * 60 + 30
DAY_END_MIN = 18 * 60
LUNCH_EARLIEST_MIN = 12 * 60 + 30
LUNCH_BREAK_MIN = 45

# Per-kind visit minutes, copied from dayDraft.js KIND_DWELL. Keep the two in
# step: a composed daytrip that disagrees with the planner about how long a
# museum takes reads as a bug to anyone comparing them side by side.
KIND_DWELL = {
    "Museum": 90, "Gallery": 60, "Aquarium": 75, "Zoo": 120,
    "Castle": 75, "Palace": 80, "Fortress": 60, "Citadel": 60,
    "Church": 25, "Cathedral": 40, "Basilica": 35, "Chapel": 15,
    "Monastery": 45, "Convent": 30, "Synagogue": 30, "Mosque": 30,
    "Temple": 30, "Theatre": 25, "Opera": 25,
    "Square": 25, "Village": 90, "Town": 90, "Monument": 15, "Memorial": 15,
    "Statue": 10, "Fountain": 10, "Gate": 10, "Bridge": 15, "Tower": 45,
    "Lighthouse": 25, "Viewpoint": 25,
    "Ancient site": 60, "Ruins": 50, "Roman site": 60,
    "Market": 45, "Brewery": 60, "Winery": 75,
    "Park": 45, "Garden": 40, "Lake": 45, "Beach": 90, "Nature reserve": 90,
    "Waterfall": 30, "Cave": 60, "Mountain": 90, "Glacier": 90, "Canyon": 60,
    "Hot spring": 90, "Theme park": 240, "Water park": 180,
    "Sauna & baths": 120, "Thermal baths": 120,
    "Landmark": 30, "Attraction": 40, "Historic site": 50,
    "Archaeological site": 60, "Opera house": 25, "Performing arts": 25,
    "Sculpture": 10, "Fortification": 45, "City gate": 10, "Stadium": 60,
    "National park": 180, "River": 20, "Island": 120, "Cliffs": 45,
    "Geyser": 45, "Activity": 90,
}
DWELL_DEFAULT = 40      # dayDraft.js: unknown kinds fall through to 40 minutes
DWELL_MIN = 10

# Visit paces, copied from dayDraft.js VISIT_PACES.
VISIT_FACTORS = {"quick": 0.7, "standard": 1.0, "deep": 1.45}

# ASSUMED opening windows (minutes from midnight), European high season. The
# catalogue carries no opening_hours, so these are the composer's own honest
# guess, stamped hours_assumed on every stop. Kinds absent from the table are
# open all day: better no constraint than an invented one. Midday closures
# (common for southern churches) are deliberately NOT modelled; that needs
# real data, not a second layer of guessing.
KIND_HOURS = {
    "Museum": (10 * 60, 17 * 60), "Gallery": (10 * 60, 17 * 60),
    "Aquarium": (10 * 60, 18 * 60), "Zoo": (9 * 60, 18 * 60),
    "Castle": (9 * 60 + 30, 17 * 60 + 30), "Palace": (9 * 60 + 30, 17 * 60 + 30),
    "Fortress": (9 * 60 + 30, 17 * 60 + 30), "Citadel": (9 * 60 + 30, 17 * 60 + 30),
    "Tower": (10 * 60, 18 * 60), "Lighthouse": (10 * 60, 17 * 60),
    "Church": (9 * 60, 18 * 60), "Cathedral": (9 * 60, 18 * 60),
    "Basilica": (9 * 60, 18 * 60), "Chapel": (9 * 60, 18 * 60),
    "Monastery": (9 * 60, 17 * 60), "Convent": (9 * 60, 17 * 60),
    "Synagogue": (10 * 60, 16 * 60), "Mosque": (9 * 60, 17 * 60),
    "Temple": (9 * 60, 17 * 60),
    "Theatre": (10 * 60, 17 * 60), "Opera": (10 * 60, 17 * 60),
    "Opera house": (10 * 60, 17 * 60), "Performing arts": (10 * 60, 17 * 60),
    "Market": (8 * 60, 14 * 60),        # European market halls wind down early
    "Brewery": (10 * 60, 18 * 60), "Winery": (10 * 60, 18 * 60),
    "Ancient site": (9 * 60, 18 * 60), "Ruins": (9 * 60, 18 * 60),
    "Roman site": (9 * 60, 18 * 60), "Archaeological site": (9 * 60, 18 * 60),
    "Historic site": (9 * 60, 18 * 60),
    "Cave": (10 * 60, 17 * 60), "Stadium": (10 * 60, 17 * 60),
    "Theme park": (10 * 60, 18 * 60), "Water park": (10 * 60, 18 * 60),
    "Sauna & baths": (9 * 60, 21 * 60), "Thermal baths": (9 * 60, 21 * 60),
    "Garden": (9 * 60, 19 * 60),
}
MAX_WAIT_MIN = 30       # never idle longer than this for a place to open

# ---------------------------------------------------------------------------
# Leg estimation constants
# ---------------------------------------------------------------------------
WALK_MAX_KM = 1.5       # straight-line: below this the day always walks
WALK_STREET_FACTOR = 1.25   # dayDraft.js: straight km -> street km
WALK_KMH = 4.5              # dayDraft.js
ROAD_DETOUR = 1.3           # transport.js DETOUR (and car_layer.py)
DRIVE_KMH = 65              # transport.js carHours, short-leg band
DRIVE_OVERHEAD_MIN = 5      # daytrip-scale parking and egress allowance
TRANSIT_PREFER_WALK_KM = 4.0  # above this, never second-guess transit with a walk
VALHALLA_SNAP_M = 150       # repair.py: POI coords sit off the routable network
# Valhalla holds ONE country's tiles at a time, and asked for a point outside
# them it does not answer "no": it snaps to the nearest edge it does have,
# which can be tens of kilometres away, and returns a confident route between
# two places nobody asked about. A Chamonix leg came back snapped onto a Swiss
# road 12 km away. So every routed leg is checked against where it was
# actually routed from, and anything snapped further than this is refused in
# favour of an honest estimate.
VALHALLA_MAX_SNAP_M = 1000

# ---------------------------------------------------------------------------
# Candidate filters, mirroring dayDraft.js
# ---------------------------------------------------------------------------
COMMERCIAL_RE = re.compile(
    r"\b(apartments?|aparthotel|hostels?|hotels?|b&b|guesthouse|guest house|"
    r"residence|suites?|rooms|store|shops?|boutique|bar|pub|lounge|"
    r"restaurants?|ristorante|pizzeria|trattoria|osteria|bistro|brasserie|"
    r"tavern|taverna|cafe|caff[eè]|coffee|helader[ií]a|gelateria|"
    r"ice cream|takeaway|kebab|camping|campsite|parking|garage|car park|"
    r"offices?|agency|rentals?|hire|barber|hairdresser|nightclub|casino|"
    r"supermarket|shopping cent(?:er|re)|mall)\b", re.I)
LOOSE_KINDS = {"Landmark", "Attraction", "Glacier", "Theme park", ""}
AIRPORT_RE = re.compile(r"airport|aerodrome|airfield|heliport|air base", re.I)
STATION_RE = re.compile(
    r"railway station|train station|bus station|bus stop|tram stop|"
    r"metro station|ferry terminal|park[- ]and[- ]ride|parking", re.I)

# Accent folding: NFKD alone misses o-slash and l-stroke (the POI dedupe
# gotcha), hence the explicit map first. Same table as popularity.py.
_FOLD_MAP = str.maketrans({
    "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
    "ß": "ss", "ł": "l", "Ł": "l", "đ": "d",
    "Đ": "d", "œ": "oe", "Œ": "oe", "þ": "th",
    "Þ": "th", "ð": "d", "Ð": "d",
})
# Near-duplicate POIs. The harvests genuinely ship Bryggen four times, as
# "Bryggen", "Bryggen Hanseatic Wharf", "Escape Bryggen" and a visitor centre
# named after it, and a day that visits it four times is not a day. Same
# folded name merges over a wide radius (one named feature sampled twice);
# a name whose words are contained in the other's merges over a tight one.
DEDUPE_SAME_NAME_M = 750
DEDUPE_SUBSET_M = 250
# Words that carry no identity, dropped before the containment test.
NAME_STOPWORDS = {
    "the", "of", "de", "del", "della", "di", "da", "du", "des", "la", "le",
    "les", "el", "il", "lo", "and", "et", "og", "og", "i", "a", "an", "at",
    "site", "world", "heritage", "visitor", "centre", "center", "museum",
    "house", "old", "new", "gamle",
}


def fold(text):
    text = (text or "").translate(_FOLD_MAP)
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).lower().strip()


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", fold(text)).strip("-") or "poi"


def haversine_km(lat1, lon1, lat2, lon2):
    return br.haversine_km(lat1, lon1, lat2, lon2)


def fmt_clock(minutes):
    m = max(0, int(round(minutes)))
    return f"{(m // 60) % 24:02d}:{m % 60:02d}"


def fmt_dur(minutes):
    m = int(round(minutes))
    if m < 60:
        return f"{m} min"
    rest = m % 60
    return f"{m // 60} h {rest} min" if rest else f"{m // 60} h"


def parse_clock(text):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", (text or "").strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise argparse.ArgumentTypeError(f"expected HH:MM, got {text!r}")
    return int(m.group(1)) * 60 + int(m.group(2))


# ---------------------------------------------------------------------------
# Catalogue: destination, POI shortlist
# ---------------------------------------------------------------------------

def poi_kind(item):
    return item.get("kind") or ""


def dwell_minutes(kind, factor=1.0):
    """dayDraft.js dwellMinutes: per-kind estimate scaled by the visit pace."""
    return max(DWELL_MIN, int(round(KIND_DWELL.get(kind, DWELL_DEFAULT) * factor)))


def poi_hours(kind):
    """(open, close) assumed window in minutes, or None for open all day."""
    return KIND_HOURS.get(kind)


def poi_score(item):
    """dayDraft.js poiScore: importance rate sharpened by other evidence."""
    s = float(item.get("rate") or 0)
    if item.get("heritage"):
        s += 0.6
    if item.get("wiki"):
        s += 0.35
    if item.get("img"):
        s += 0.15
    pop = item.get("pop") or 0
    if pop > 0:
        s += min(1.0, math.log10(pop + 1) / 3.3)
    return s


def is_must_see(item):
    return (item.get("rate") or 0) >= 3 and poi_score(item) >= 3.5


def is_commercial_noise(item):
    if poi_kind(item) not in LOOSE_KINDS:
        return False
    return bool(COMMERCIAL_RE.search(item.get("name") or ""))


def is_transport_infra(item):
    text = f"{poi_kind(item)} {item.get('name') or ''}"
    if AIRPORT_RE.search(text):
        return True
    if STATION_RE.search(text):
        return not item.get("heritage")
    return False


_CATALOGUE = {}


def load_catalogue(dest_id):
    """(destination dict, its POIs with pop filled in) or exit with a hint.

    The master is 100 MB plus, so it is read once per process however many
    anchors a run composes.
    """
    if not _CATALOGUE:
        _CATALOGUE["dests"] = json.loads(
            APP_DATA.read_text(encoding="utf-8"))["destinations"]
        _CATALOGUE["pop"] = (
            json.loads(ENRICH_CACHE.read_text(encoding="utf-8")).get("pop", {})
            if ENRICH_CACHE.exists() else {})
    dests = _CATALOGUE["dests"]
    dest = dests.get(dest_id)
    if dest is None:
        wanted = fold(dest_id)
        near = [f"{k} ({v.get('city')})" for k, v in dests.items()
                if wanted and (wanted in fold(k) or wanted in fold(v.get("city") or ""))]
        hint = ("did you mean " + ", ".join(sorted(near)[:6])) if near else \
            "run with an id from app_data.json destinations"
        sys.exit(f"no destination {dest_id!r} in the catalogue; {hint}")

    pop = _CATALOGUE["pop"]
    items = []
    for it in (dest.get("activities") or {}).get("items_full", []) or []:
        if it.get("lat") is None or it.get("lon") is None:
            continue
        it = dict(it)
        it["pop"] = int(pop.get(it.get("wiki") or "") or 0)
        items.append(it)
    return dest, items


def name_tokens(name):
    """Identity-carrying words of a POI name, folded."""
    words = re.split(r"[^a-z0-9]+", fold(name))
    return {w for w in words if w and w not in NAME_STOPWORDS and len(w) > 2}


def is_same_place(a, b):
    """Do these two harvested POIs describe one place?

    A light version of the app's union-find POI dedupe (canonicalPoiIndices):
    identical names over a wide radius, or one name's words contained in the
    other's over a tight one.
    """
    metres = dist_m((a["lon"], a["lat"]), (b["lon"], b["lat"]))
    if fold(a.get("name") or "") == fold(b.get("name") or ""):
        return metres <= DEDUPE_SAME_NAME_M
    if metres > DEDUPE_SUBSET_M:
        return False
    ta, tb = name_tokens(a.get("name") or ""), name_tokens(b.get("name") or "")
    if not ta or not tb:
        return False
    return ta <= tb or tb <= ta


def dedupe_pois(items):
    """Keep the first (strongest ranked) POI of each real place."""
    kept = []
    for it in items:
        if not any(is_same_place(it, other) for other in kept):
            kept.append(it)
    return kept


def shortlist(items, centre, radius_km, want):
    """The best `want` POIs around the anchor, strongest first.

    Two phases, exactly like the planner: rank by evidence here, sequence by
    proximity later (draftDays picks, optimizeOrder orders).
    """
    pool = []
    for it in items:
        if is_commercial_noise(it) or is_transport_infra(it):
            continue
        km = haversine_km(centre[0], centre[1], it["lat"], it["lon"])
        if km > radius_km:
            continue
        it = dict(it)
        it["_km"] = km
        it["_score"] = poi_score(it)
        it["_must"] = is_must_see(it)
        pool.append(it)
    # Rank before deduping so the strongest of a set of duplicates survives.
    pool.sort(key=lambda x: (not x["_must"], -x["_score"], x["_km"]))
    return dedupe_pois(pool)[:want]


# ---------------------------------------------------------------------------
# Routing: Valhalla (walk, drive) and Transitous (transit)
# ---------------------------------------------------------------------------

def valhalla_leg(session, base_url, a, b, costing):
    """Routed leg a -> b. Returns (leg dict, None) or (None, reason).

    a and b are (lon, lat). The generous snapping radius is repair.py's: a
    hilltop fortress or a beach sits well off the nearest routable edge, and
    without it Valhalla answers "no suitable edges" for the whole request.
    """
    payload = {
        "locations": [
            {"lat": a[1], "lon": a[0], "type": "break", "radius": VALHALLA_SNAP_M},
            {"lat": b[1], "lon": b[0], "type": "break", "radius": VALHALLA_SNAP_M},
        ],
        "costing": costing,
        "directions_type": "none",
        "units": "kilometers",
    }
    try:
        resp = session.post(base_url.rstrip("/") + "/route", json=payload, timeout=60)
    except requests.ConnectionError:
        return None, "valhalla unreachable"
    except requests.RequestException as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if resp.status_code != 200:
        try:
            err = resp.json()
            return None, f"code {err.get('error_code')}: {err.get('error')}"
        except ValueError:
            return None, f"HTTP {resp.status_code}"
    trip = resp.json().get("trip") or {}
    summary = trip.get("summary") or {}
    coords = []
    for leg in trip.get("legs") or []:
        coords.extend(decode_polyline6(leg.get("shape") or ""))
    if len(coords) < 2 or not summary.get("time"):
        # Both ends snapped to the same routable edge, which happens when a
        # POI sits inside a courtyard or a pedestrian block near the centre.
        # A zero-minute leg would be a lie, so the straight-line estimate
        # takes over.
        return None, "both ends snap to one point"
    off = max(dist_m(a, coords[0]), dist_m(b, coords[-1]))
    if off > VALHALLA_MAX_SNAP_M:
        return None, (f"routed from {off / 1000:.1f} km away, outside the "
                      f"loaded tiles")
    return {
        "mode": "walk" if costing == "pedestrian" else "drive",
        "minutes": max(1, int(round(summary["time"] / 60))),
        "km": round(float(summary.get("length") or 0), 3),
        "coords": coords,
        "source": "valhalla",
    }, None


def _transit_cache():
    if TRANSIT_CACHE.exists():
        try:
            return json.loads(TRANSIT_CACHE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def _save_transit_cache(cache):
    TRANSIT_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TRANSIT_CACHE.write_text(json.dumps(cache, separators=(",", ":")),
                             encoding="utf-8")


def transit_leg(a, b, depart_iso, cfg, cache, offline=False):
    """Best public-transport itinerary a -> b leaving at depart_iso.

    Returns (leg dict, None) or (None, reason). The retry loop is
    build_reach.plan_minutes': IncompleteRead and its siblings surface as
    http.client.HTTPException, so they are caught and backed off rather than
    killing the compose. Requests are cached (and paced by build_reach at one
    per second) on a rounded-coordinate key, which is the same
    coordinate-dedupe trick the reach builder uses to collapse identical
    queries.
    """
    key = (f"{a[1]:.5f},{a[0]:.5f}|{b[1]:.5f},{b[0]:.5f}|{depart_iso}")
    if key in cache:
        hit = cache[key]
        return (hit, None) if hit else (None, "no itinerary (cached)")
    if offline:
        return None, "offline, not cached"

    url = cfg["api"] + "?" + urllib.parse.urlencode({
        "fromPlace": f"{a[1]},{a[0]}",
        "toPlace": f"{b[1]},{b[0]}",
        "time": depart_iso,
        "numItineraries": cfg["num_itineraries"],
        "searchWindow": cfg["search_window_s"],
        "maxPostTransitTime": cfg.get("max_post_transit_s", 3600),
    })
    last_err = None
    for attempt in range(len(cfg["backoff_s"]) + 1):
        try:
            payload = br.paced_fetch(url, cfg)
            break
        except urllib.error.HTTPError as exc:
            last_err = f"http {exc.code}"
            if exc.code not in (429, 500, 502, 503, 504):
                return None, last_err
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError,
                json.JSONDecodeError, OSError) as exc:
            last_err = type(exc).__name__
        if attempt < len(cfg["backoff_s"]):
            time.sleep(cfg["backoff_s"][attempt])
    else:
        return None, last_err or "unknown"

    options = [it for it in (payload.get("itineraries") or [])
               if not any(lg.get("mode") == "AIRPLANE" for lg in it.get("legs") or [])]
    options += list(payload.get("direct") or [])
    options = [it for it in options if (it.get("duration") or 0) > 0]
    if not options:
        cache[key] = None
        return None, "no itinerary"
    best = min(options, key=lambda it: it["duration"])

    coords, modes = [], []
    for lg in best.get("legs") or []:
        geom = lg.get("legGeometry") or {}
        pts = geom.get("points")
        if pts:
            scale = 10 ** int(geom.get("precision") or 6)
            coords.extend([(x * 1e6 / scale, y * 1e6 / scale)
                           for x, y in decode_polyline6(pts)])
        name = lg.get("routeShortName") or ""
        mode = (lg.get("mode") or "").lower()
        if mode and mode != "walk":
            modes.append(f"{mode} {name}".strip())
    # Distance comes from the drawn geometry: the API reports `distance` on
    # walking legs only, so summing that field would price a two-bus,
    # 40 kilometre journey as the 900 metres spent on foot between stops.
    km = sum(dist_m(p, q) for p, q in zip(coords, coords[1:])) / 1000.0
    leg = {
        "mode": "transit",
        "minutes": max(1, int(round(best["duration"] / 60))),
        "km": round(km, 3),
        "coords": coords,
        "source": "transitous",
        "services": modes[:6],
        "transfers": best.get("transfers"),
    }
    cache[key] = leg
    return leg, None


def estimated_leg(a, b, mode):
    """Straight-line fallback, flagged as an estimate wherever it surfaces.

    Walking mirrors the planner (straight km x 1.25 street factor at
    4.5 km/h); driving mirrors transport.js (x1.3 detour at the short-leg
    65 km/h band) plus a parking and egress allowance.
    """
    km = haversine_km(a[1], a[0], b[1], b[0]) or 0.0
    if mode == "drive":
        road = km * ROAD_DETOUR
        minutes = road / DRIVE_KMH * 60 + DRIVE_OVERHEAD_MIN
    else:
        mode = "walk"
        road = km * WALK_STREET_FACTOR
        minutes = road / WALK_KMH * 60
    return {
        "mode": mode,
        "minutes": max(1, int(round(minutes))),
        "km": round(road, 3),
        "coords": [tuple(a), tuple(b)],
        "source": "estimate",
    }


class Router:
    """Per-leg mode cascade with one place to count what actually happened."""

    def __init__(self, args, cfg, cache):
        self.args = args
        self.cfg = cfg
        self.cache = cache
        self.session = requests.Session()
        self.notes = []

    def _valhalla(self, a, b, costing):
        leg, err = valhalla_leg(self.session, self.args.valhalla_url, a, b, costing)
        if err:
            self.notes.append(f"valhalla {costing}: {err}")
        return leg

    def leg(self, a, b, depart_min, depart_date):
        """The leg from a to b (both (lon, lat)) leaving at depart_min."""
        km = haversine_km(a[1], a[0], b[1], b[0]) or 0.0
        if km < 0.02:
            return {"mode": "walk", "minutes": 0, "km": 0.0,
                    "coords": [tuple(a), tuple(b)], "source": "same place"}

        if km <= WALK_MAX_KM or self.args.transport == "walk":
            return self._valhalla(a, b, "pedestrian") or estimated_leg(a, b, "walk")

        if self.args.transport == "transit":
            depart_iso = self.depart_iso(depart_date, depart_min)
            leg, err = transit_leg(a, b, depart_iso, self.cfg, self.cache,
                                   offline=self.args.offline)
            if err:
                self.notes.append(f"transit: {err}")
            if leg is not None:
                # Under a few kilometres a bus that needs two transfers loses
                # to simply walking, which is what a traveller would do.
                if km <= TRANSIT_PREFER_WALK_KM:
                    on_foot = (self._valhalla(a, b, "pedestrian")
                               or estimated_leg(a, b, "walk"))
                    if on_foot["minutes"] <= leg["minutes"]:
                        return on_foot
                return leg

        return (self._valhalla(a, b, "auto")
                or self._valhalla(a, b, "pedestrian")
                or estimated_leg(a, b, "drive" if km > WALK_MAX_KM else "walk"))

    def depart_iso(self, depart_date, depart_min):
        """Schedule clock (local) -> the UTC instant Transitous wants.

        The pilot countries all sit at UTC+2 in high season; --utc-offset
        exists so a winter or non-pilot run can say so instead of silently
        querying the wrong hour.
        """
        t = depart_date + timedelta(minutes=depart_min - self.args.utc_offset * 60)
        return t.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Staged hikes
# ---------------------------------------------------------------------------

# Staging titles that are upstream bookkeeping, not names. A daytrip called
# "Holewang - fixme" or "WHR*" is not a product; those routes wait for a
# curator to name them, so they are passed over here rather than published
# into a title.
UNREADY_TITLE_RE = re.compile(r"fixme|to ?do|unnamed|^OSM route \d", re.I)
TITLE_MIN_LETTERS = 4


def unready_title(title):
    if UNREADY_TITLE_RE.search(title or ""):
        return True
    return sum(c.isalpha() for c in fold(title)) < TITLE_MIN_LETTERS


def find_hikes(conn, centre, args, limit=8):
    """Candidate short hikes near the anchor, most curation-worthy first.

    Ranked by popularity.py's curation_rank when it has run (validation_runs
    check_name='popularity'), then quality_score, then proximity. Only hikes
    with a real duration are eligible: without elevation.py having run there
    is no honest way to know a route fits inside a day. Several come back
    because rank alone cannot tell whether a trailhead is reachable before
    lunch; the composer routes to them in order and keeps the first that fits.
    """
    statuses = args.hike_status
    with conn.cursor() as cur:
        cur.execute("""
            WITH centre AS (
                SELECT ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3035) AS g
            ), pop AS (
                SELECT DISTINCT ON (subject_id) subject_id, score
                FROM validation_runs
                WHERE subject_type = 'trip' AND check_name = 'popularity'
                ORDER BY subject_id, run_at DESC
            )
            SELECT t.id, t.title, t.country, t.duration_min, t.distance_m,
                   t.ascent_m, t.difficulty, t.status::text, t.quality_score,
                   pop.score,
                   ST_Distance(ST_Transform(t.geom, 3035), centre.g)::int,
                   ST_X(ST_StartPoint(ST_GeometryN(ST_Force2D(t.geom), 1))),
                   ST_Y(ST_StartPoint(ST_GeometryN(ST_Force2D(t.geom), 1))),
                   ST_X(ST_EndPoint(ST_GeometryN(ST_Force2D(t.geom),
                                                 ST_NumGeometries(t.geom)))),
                   ST_Y(ST_EndPoint(ST_GeometryN(ST_Force2D(t.geom),
                                                 ST_NumGeometries(t.geom))))
            FROM trips t
            LEFT JOIN pop ON pop.subject_id = t.id
            CROSS JOIN centre
            WHERE t.category = 'hike'
              AND t.status::text = ANY(%s)
              AND t.duration_min IS NOT NULL
              AND t.duration_min <= %s
              AND ST_DWithin(ST_Transform(t.geom, 3035), centre.g, %s)
            ORDER BY pop.score DESC NULLS LAST,
                     t.quality_score DESC NULLS LAST,
                     ST_Distance(ST_Transform(t.geom, 3035), centre.g)
            LIMIT %s""",
            (centre[1], centre[0], statuses, args.hike_max_min,
             args.hike_radius_km * 1000.0, limit * 4))
        rows = cur.fetchall()

    hikes = []
    for row in rows:
        (tid, title, country, duration, distance, ascent, difficulty, status,
         quality, rank, from_centre_m, sx, sy, ex, ey) = row
        if unready_title(title):
            continue
        hikes.append({
            "trip_id": tid, "title": title, "country": country,
            "duration_min": int(duration), "distance_m": distance,
            "ascent_m": ascent, "difficulty": difficulty, "status": status,
            "quality_score": float(quality) if quality is not None else None,
            "curation_rank": float(rank) if rank is not None else None,
            "from_centre_km": round(from_centre_m / 1000.0, 1),
            "start": (float(sx), float(sy)), "end": (float(ex), float(ey)),
        })
        if len(hikes) >= limit:
            break
    return hikes


# ---------------------------------------------------------------------------
# The time-budget solver
# ---------------------------------------------------------------------------

def compose(dest_id, dest, pois, hikes, router, args, depart_date):
    """Greedy nearest-neighbour day, honouring dwell times and opening hours.

    Sequencing mirrors optimizeOrder: from where you stand, go to the nearest
    remaining stop. Feasibility is checked against the REAL leg, so a stop
    that the router puts out of reach (a lake in the way, a closing time
    missed) is put back and the next-nearest tried. Stops that never fit are
    reported rather than silently dropped.
    """
    centre = (dest.get("city_lat", dest.get("lat")),
              dest.get("city_lon", dest.get("lon")))
    factor = VISIT_FACTORS[args.visit]
    day_end = args.start + args.budget_min
    here = (centre[1], centre[0])       # (lon, lat)
    clock = args.start
    stops, skipped = [], []
    reasons = {}        # POI name -> why the day could not take it
    lunch = None

    remaining = list(pois)
    hike = None
    for cand in hikes or []:
        # The hike leads the day: mountain weather and light are both better
        # early, and a 3 hour walk cannot be squeezed in after lunch. The
        # best-ranked hike is not always the one a morning can reach, so the
        # candidates are tried in rank order until one fits.
        leg = router.leg(here, cand["start"], clock, depart_date)
        arrive = clock + leg["minutes"]
        dwell = cand["duration_min"]
        if leg["minutes"] > args.max_leg_min:
            skipped.append((cand["title"],
                            f"trailhead is {fmt_dur(leg['minutes'])} away"))
            continue
        if arrive + dwell > day_end:
            skipped.append((cand["title"], "does not fit the day budget"))
            continue
        hike = cand
        stops.append({
            "name": cand["title"], "kind": "Hike",
            "poi_ref": f"trip:{cand['trip_id']}",
            "lon": cand["start"][0], "lat": cand["start"][1],
            "leg": leg, "arrive": arrive, "dwell": dwell,
            "depart": arrive + dwell, "hours": None, "wait": 0,
            "hike_id": cand["trip_id"],
        })
        clock = arrive + dwell
        here = cand["end"]              # loops end where they started
        break

    while remaining and len(stops) < args.stops:
        # Lunch lands in the first pause after 12:30, never mid-visit
        # (daySchedule.js buildDaySchedule).
        if lunch is None and clock >= LUNCH_EARLIEST_MIN and stops:
            lunch = {"after_index": len(stops) - 1, "start": clock,
                     "end": clock + LUNCH_BREAK_MIN}
            clock += LUNCH_BREAK_MIN

        # A point-to-point hike ends up a valley, so the leg back into
        # civilisation is allowed to be longer than an ordinary hop between
        # sights. Without this the whole afternoon dies on the mountain.
        cap = (args.max_return_min
               if (stops and stops[-1]["kind"] == "Hike") else args.max_leg_min)
        order = sorted(remaining, key=lambda it: haversine_km(
            here[1], here[0], it["lat"], it["lon"]) or 1e9)
        placed = False
        for cand in order:
            target = (cand["lon"], cand["lat"])
            leg = router.leg(here, target, clock, depart_date)
            if leg["minutes"] > cap:
                # A day out is not an afternoon of buses.
                reasons[cand["name"]] = f"{fmt_dur(leg['minutes'])} away"
                continue
            arrive = clock + leg["minutes"]
            dwell = dwell_minutes(poi_kind(cand), factor)
            hours = poi_hours(poi_kind(cand))
            wait = 0
            if hours:
                if arrive < hours[0]:
                    wait = hours[0] - arrive
                    if wait > MAX_WAIT_MIN:
                        reasons[cand["name"]] = f"opens at {fmt_clock(hours[0])}"
                        continue
                if arrive + wait + dwell > hours[1]:
                    reasons[cand["name"]] = f"closes at {fmt_clock(hours[1])}"
                    continue
            if arrive + wait + dwell > day_end:
                reasons[cand["name"]] = "no time left in the day"
                continue
            stops.append({
                "name": cand["name"], "kind": poi_kind(cand),
                "poi_ref": f"poi:{dest_id}:{slug(cand['name'])}",
                "lon": cand["lon"], "lat": cand["lat"],
                "leg": leg, "arrive": arrive, "wait": wait, "dwell": dwell,
                "depart": arrive + wait + dwell, "hours": hours,
                "score": round(cand["_score"], 2), "must": cand["_must"],
            })
            clock = arrive + wait + dwell
            here = target
            remaining.remove(cand)
            placed = True
            break
        if not placed:
            break

    default_reason = (f"the day is full at {len(stops)} stops"
                      if len(stops) >= args.stops else "no time left in the day")
    for cand in remaining:
        skipped.append((cand["name"], reasons.get(cand["name"], default_reason)))

    return {
        "dest_id": dest_id,
        "city": dest.get("city") or dest_id,
        "country": (dest.get("iso2") or "").upper(),
        "centre": centre,
        "start": args.start,
        "end": clock,
        "stops": stops,
        "lunch": lunch,
        "skipped": skipped,
        "hike": hike,
        "free_min": max(0, DAY_END_MIN - clock),
        "day_end": day_end,
    }


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------

MODE_VERB = {"walk": "walk", "drive": "drive", "transit": "transit"}


def leg_label(leg):
    if leg["minutes"] == 0:
        return "on the spot"
    text = f"{MODE_VERB.get(leg['mode'], leg['mode'])} {fmt_dur(leg['minutes'])}"
    if leg.get("km"):
        text += f", {leg['km']:.1f} km"
    if leg.get("services"):
        text += " (" + ", ".join(leg["services"]) + ")"
    if leg["source"] == "estimate":
        text += " [estimated]"
    return text


def print_itinerary(plan, args):
    hike = plan["hike"]
    title = plan_title(plan)
    print()
    print(f"{title}  [{plan['country']}, anchor {plan['dest_id']}]")
    print(f"  {len(plan['stops'])} stops, day budget {fmt_dur(args.budget_min)} "
          f"from {fmt_clock(plan['start'])}, visit pace {args.visit}, "
          f"legs prefer {args.transport}")
    if hike:
        rank = hike["curation_rank"]
        print(f"  hike: {hike['title']} ({hike['status']}, "
              f"{fmt_dur(hike['duration_min'])}"
              + (f", {hike['distance_m'] / 1000:.1f} km" if hike["distance_m"] else "")
              + (f", curation rank {rank:.0f}" if rank is not None else "")
              + ")")
    elif not args.no_hike:
        # Say why, because "no hike" usually means a pipeline step has not
        # run here yet (elevation.py fills duration_min), not that the
        # mountains are empty.
        print(f"  no hike: nothing {'/'.join(args.hike_status)} with a known "
              f"duration under {fmt_dur(args.hike_max_min)} within "
              f"{args.hike_radius_km:g} km that a morning can reach")
    print(f"  {fmt_clock(plan['start'])}  set off from the centre of {plan['city']}")
    for i, s in enumerate(plan["stops"]):
        lunch = plan["lunch"]
        if lunch and lunch["after_index"] == i - 1:
            print(f"  {fmt_clock(lunch['start'])}  lunch, {LUNCH_BREAK_MIN} min")
        wait = f", wait {fmt_dur(s['wait'])}" if s.get("wait") else ""
        hours = (f"opens {fmt_clock(s['hours'][0])} to {fmt_clock(s['hours'][1])}"
                 if s["hours"] else "open all day")
        print(f"  {fmt_clock(s['arrive'])}  {leg_label(s['leg'])}{wait}")
        print(f"         -> {s['name']} ({s['kind'] or 'sight'}), "
              f"{fmt_dur(s['dwell'])} until {fmt_clock(s['depart'])}  [{hours}]")
    print(f"  {fmt_clock(plan['end'])}  day ends, {fmt_dur(plan['free_min'])} "
          f"still open before {fmt_clock(DAY_END_MIN)}")

    legs = [s["leg"] for s in plan["stops"]]
    travel = sum(leg["minutes"] for leg in legs)
    km = sum(leg["km"] for leg in legs)
    by_mode = {}
    for leg in legs:
        by_mode[leg["mode"]] = by_mode.get(leg["mode"], 0) + 1
    est = sum(1 for leg in legs if leg["source"] == "estimate")
    modes = ", ".join(f"{n} {m}" for m, n in sorted(by_mode.items()))
    print(f"  totals: {fmt_dur(travel)} travelling over {km:.1f} km "
          f"({modes or 'no legs'}), {est} leg(s) estimated, "
          f"{sum(s['dwell'] for s in plan['stops'])} min at the stops")
    if plan["skipped"]:
        shown = "; ".join(f"{n} ({why})" for n, why in plan["skipped"][:4])
        print(f"  left out: {shown}"
              + (f" and {len(plan['skipped']) - 4} more" if len(plan["skipped"]) > 4 else ""))


def plan_title(plan):
    if plan["hike"]:
        return f"A day in {plan['city']} with the {plan['hike']['title']}"
    return f"A day in {plan['city']}"


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def multiline_wkt(parts):
    body = ",".join("(" + ",".join(f"{x:.7f} {y:.7f}" for x, y in part) + ")"
                    for part in parts)
    return "MULTILINESTRING(" + body + ")"


def linestring_wkt(coords):
    return "LINESTRING(" + ",".join(f"{x:.7f} {y:.7f}" for x, y in coords) + ")"


def store(conn, plan, args, router):
    """Upsert the daytrip and its stops in one transaction.

    trips.geom holds the LEG geometry only: the hike's own line stays on its
    own trips row, one join away through trip_stops.poi_ref. distance_m is
    therefore travel distance, with the hike's kilometres in raw_tags.

    Per the schema, trip_stops.leg_* describes how you reach that stop from
    the previous one; on seq 1 that means the leg from the anchor's centre,
    where the day starts.
    """
    from psycopg.types.json import Jsonb

    stops = plan["stops"]
    if not plan["country"]:
        print("  not stored: the anchor has no iso2 country in the catalogue")
        return None
    parts = [s["leg"]["coords"] for s in stops
             if len(s["leg"]["coords"] or []) >= 2]
    if not parts:
        print("  not stored: no leg geometry (every stop is on the spot)")
        return None
    travel_km = sum(s["leg"]["km"] for s in stops)
    source_ref = f"daytrip:{plan['dest_id']}"
    raw_tags = {
        "anchor_dest": plan["dest_id"],
        "anchor_city": plan["city"],
        "anchor_centre": {"lat": plan["centre"][0], "lon": plan["centre"][1]},
        "composed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "params": {
            "start": fmt_clock(plan["start"]), "budget_min": args.budget_min,
            "stops_max": args.stops, "visit": args.visit,
            "transport": args.transport, "radius_km": args.radius_km,
            "utc_offset": args.utc_offset,
        },
        "assumptions": {
            # Said out loud so nobody mistakes the hours for harvested data.
            "hours_assumed": True,
            "hours_note": "KIND_HOURS in compose_daytrips.py, European high "
                          "season; the catalogue carries no opening hours",
            "dwell_source": "continent-app dayDraft.js KIND_DWELL",
            "clock_source": "continent-app daySchedule.js",
        },
        "lunch": plan["lunch"],
        "free_min": plan["free_min"],
        "skipped": [{"name": n, "why": w} for n, w in plan["skipped"][:20]],
        "legs_estimated": sum(1 for s in stops if s["leg"]["source"] == "estimate"),
        "router_notes": router.notes[:20],
    }
    if plan["hike"]:
        raw_tags["hike"] = {k: plan["hike"][k] for k in
                            ("trip_id", "title", "status", "duration_min",
                             "distance_m", "ascent_m", "difficulty",
                             "curation_rank")}
    attribution = ("Routing and trail data (c) OpenStreetMap contributors, "
                   "ODbL. Public transport times via Transitous.")

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO trips (country, category, title, geom, distance_m,
                               duration_min, source, source_ref, license,
                               attribution_text, raw_tags)
            VALUES (%(country)s, 'daytrip', %(title)s,
                    ST_Force3D(ST_GeomFromText(%(wkt)s, 4326)),
                    %(distance_m)s, %(duration_min)s, 'carta_compose',
                    %(source_ref)s, %(license)s, %(attribution)s, %(raw_tags)s)
            ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL
            DO UPDATE SET
                country = EXCLUDED.country, title = EXCLUDED.title,
                geom = EXCLUDED.geom, distance_m = EXCLUDED.distance_m,
                duration_min = EXCLUDED.duration_min,
                license = EXCLUDED.license,
                attribution_text = EXCLUDED.attribution_text,
                raw_tags = EXCLUDED.raw_tags,
                -- Recomposing rewrites the itinerary under whoever approved
                -- the old one, so a reviewed daytrip goes back to the queue
                -- instead of quietly changing in place. Never auto-approved.
                status = CASE WHEN trips.status IN ('approved', 'published')
                              THEN 'needs_review'::trip_status
                              ELSE trips.status END
            RETURNING id, status::text""",
            {"country": plan["country"], "title": plan_title(plan),
             "wkt": multiline_wkt(parts),
             "distance_m": int(round(travel_km * 1000)),
             "duration_min": int(plan["end"] - plan["start"]),
             "source_ref": source_ref, "license": "ODbL 1.0",
             "attribution": attribution, "raw_tags": Jsonb(raw_tags)})
        trip_id, status = cur.fetchone()

        cur.execute("DELETE FROM trip_stops WHERE trip_id = %s", (trip_id,))
        for seq, s in enumerate(stops, start=1):
            leg = s["leg"]
            coords = leg["coords"] if len(leg["coords"] or []) >= 2 else None
            cur.execute("""
                INSERT INTO trip_stops (trip_id, seq, poi_ref, dwell_min,
                                        leg_mode, leg_duration_min, leg_geom)
                VALUES (%s, %s, %s, %s, %s, %s,
                        ST_GeomFromText(%s, 4326))""",
                (trip_id, seq, s["poi_ref"], s["dwell"], leg["mode"],
                 leg["minutes"], linestring_wkt(coords) if coords else None))

        cur.execute("""
            INSERT INTO validation_runs (subject_type, subject_id, check_name,
                                         passed, score, details)
            VALUES ('trip', %s, 'daytrip_compose', %s, %s, %s)""",
            (trip_id, len(stops) >= 2, 100.0 * sum(
                1 for s in stops if s["leg"]["source"] != "estimate")
                / max(1, len(stops)),
             Jsonb({"stops": len(stops),
                    "legs_estimated": raw_tags["legs_estimated"],
                    "hours_assumed": True,
                    "hike_trip_id": (plan["hike"] or {}).get("trip_id"),
                    "free_min": plan["free_min"],
                    "router_notes": router.notes[:20]})))
    conn.commit()
    print(f"  stored trip id={trip_id} ({status}), {len(stops)} stops, "
          f"source_ref={source_ref}")
    return trip_id


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(
        description="Compose daytrips from catalogue POIs and staged hikes.")
    ap.add_argument("--dest", action="append", default=[],
                    help="anchor destination id, repeatable "
                         "(e.g. gem:interlaken, BGO)")
    ap.add_argument("--pilot", action="store_true",
                    help=f"compose the pilot set: {', '.join(PILOT_DESTS)}")
    ap.add_argument("--start", type=parse_clock, default=DAY_START_MIN,
                    metavar="HH:MM", help="day start (default 09:30)")
    ap.add_argument("--budget-min", type=int, default=7 * 60,
                    help="minutes the day may run (default 420, the planner's "
                         "balanced pace)")
    ap.add_argument("--stops", type=int, default=6,
                    help="max stops including the hike (default 6)")
    ap.add_argument("--visit", choices=sorted(VISIT_FACTORS), default="standard",
                    help="visit pace, scales every dwell (default standard)")
    ap.add_argument("--radius-km", type=float, default=10.0,
                    help="how far from the anchor centre POIs may sit "
                         "(default 10)")
    ap.add_argument("--candidates", type=int, default=14,
                    help="POI shortlist size the solver sequences (default 14)")
    ap.add_argument("--max-leg-min", type=int, default=45,
                    help="longest single leg between stops (default 45); a "
                         "day out is not an afternoon of buses")
    ap.add_argument("--max-return-min", type=int, default=90,
                    help="longest leg back off a hike, which ends where it "
                         "ends (default 90)")
    ap.add_argument("--transport", choices=("transit", "drive", "walk"),
                    default="transit",
                    help="preferred mode for legs above %g km (default transit)"
                         % WALK_MAX_KM)
    ap.add_argument("--no-hike", action="store_true",
                    help="catalogue POIs only, do not attach a staged hike")
    ap.add_argument("--hike-status", default="approved",
                    help="comma-separated statuses a hike may have "
                         "(default approved; widen only for pilot demos)")
    ap.add_argument("--hike-max-min", type=int, default=240,
                    help="longest hike that may join a day (default 240)")
    ap.add_argument("--hike-radius-km", type=float, default=25.0,
                    help="how far the trailhead may sit from the anchor "
                         "(default 25)")
    ap.add_argument("--utc-offset", type=int, default=2,
                    help="hours the anchor is ahead of UTC, for transit "
                         "departure times (default 2, pilot high season)")
    ap.add_argument("--depart-date", default=None,
                    help="service date for transit queries, YYYY-MM-DD "
                         "(default the reach builder's next Tuesday)")
    ap.add_argument("--valhalla-url", default=None,
                    help="Valhalla base URL (default TRAILSLAB_VALHALLA_URL "
                         "or http://localhost:8002)")
    ap.add_argument("--offline", action="store_true",
                    help="no Transitous requests; cached legs only")
    ap.add_argument("--dry-run", action="store_true",
                    help="compose and print only, no DB writes")
    args = ap.parse_args()

    if args.valhalla_url is None:
        args.valhalla_url = os.environ.get("TRAILSLAB_VALHALLA_URL",
                                           "http://localhost:8002")
    args.hike_status = [s.strip() for s in args.hike_status.split(",") if s.strip()]
    dest_ids = list(dict.fromkeys((PILOT_DESTS if args.pilot else []) + args.dest))
    if not dest_ids:
        sys.exit("nothing to compose: pass --dest <id> or --pilot")

    if args.depart_date:
        depart_date = datetime.strptime(args.depart_date, "%Y-%m-%d").replace(
            tzinfo=timezone.utc)
    else:
        depart_date = br.next_tuesday_5utc().replace(hour=0, minute=0)
    cfg = br.load_config()
    cache = _transit_cache()

    print(f"anchors: {', '.join(dest_ids)}")
    print(f"transit service date {depart_date:%Y-%m-%d} (UTC{args.utc_offset:+d}), "
          f"valhalla {args.valhalla_url}")

    conn = connect()
    try:
        for dest_id in dest_ids:
            dest, items = load_catalogue(dest_id)
            centre = (dest.get("city_lat", dest.get("lat")),
                      dest.get("city_lon", dest.get("lon")))
            if centre[0] is None or centre[1] is None:
                print(f"\n{dest_id}: no coordinates, skipped")
                continue
            pois = shortlist(items, centre, args.radius_km, args.candidates)
            hikes = [] if args.no_hike else find_hikes(conn, centre, args)
            router = Router(args, cfg, cache)
            plan = compose(dest_id, dest, pois, hikes, router, args, depart_date)
            print_itinerary(plan, args)
            if router.notes:
                seen = list(dict.fromkeys(router.notes))
                print(f"  router fallbacks: {'; '.join(seen[:4])}")
            if not plan["stops"]:
                print("  nothing fitted the day; not stored")
                continue
            if args.dry_run:
                print("  dry run: not stored")
            else:
                store(conn, plan, args, router)
    finally:
        _save_transit_cache(cache)
        conn.close()


if __name__ == "__main__":
    main()
