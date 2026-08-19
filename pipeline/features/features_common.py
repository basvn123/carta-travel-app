"""features_common.py - shared helpers for the natural-features pipeline.

The features pipeline turns Carta's existing POI, bathing-water and protected-
area layers into two first-class entity sets, BEACHES and MOUNTAINS, so the
Destinations tab can stop inferring "beach" from the nearest town's tags.

Every stage reads and writes ONE artifact so a rerun is cheap and resumable:

    build_features.py    caches + catalogue  -> data/derived/features_raw.json
    enrich_wikidata.py   + Wikidata (cached) -> data/derived/features_raw.json
    enrich_images.py     + Commons  (cached) -> data/derived/features_raw.json
    rank_features.py     scores + tiers      -> data/derived/features.json
    validate_features.py the quality gate    -> data/reports/features_validation.json
    export_features.py   the shipped wire    -> continent-app/public/features/

Nothing here talks to the network; the harvesters own that.
ASCII-clean, no em dashes, per project style.
"""
import json
import re
import sys
import time
import unicodedata
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]

# Inputs (all already on disk; the pipeline never re-downloads them here).
APP_DATA = ROOT / "continent-app" / "public" / "app_data.json"
MASTER = ROOT / "app_data" / "app_data.json"
ACTIVITIES = ROOT / "continent-app" / "public" / "activities_full.json"
CACHE = ROOT / "cache"
BATHING_CACHE = CACHE / "eea_bathing_water.json"
PROTECTED_CACHE = CACHE / "osm_protected_areas.json"
SITELINKS_CACHE = CACHE / "wikidata_sitelinks.json"
POI_LICENSES = CACHE / "poi_image_licenses.json"

# Working artifacts.
DERIVED = ROOT / "data" / "derived"
RAW_FEATURES = DERIVED / "features_raw.json"
FEATURES = DERIVED / "features.json"
REPORTS = ROOT / "data" / "reports"
VALIDATION_REPORT = REPORTS / "features_validation.json"

# Per-harvester caches, so a rerun only fetches what is missing.
WIKIDATA_FEATURE_CACHE = CACHE / "features_wikidata.json"
IMAGE_FEATURE_CACHE = CACHE / "features_images.json"

# The shipped wire.
WIRE_DIR = ROOT / "continent-app" / "public" / "features"

KINDS = ("beach", "mountain")

# The 43 countries Carta prices. Anything outside this set is dropped rather
# than shipped as an orphan the UI has no country card for.
def catalogue_countries(app_data=None):
    """{iso2: country name} from the shipped catalogue."""
    data = app_data if app_data is not None else load_json(APP_DATA)
    out = {}
    for d in (data.get("destinations") or {}).values():
        iso2, name = d.get("iso2"), d.get("country")
        if iso2 and name:
            out.setdefault(iso2, name)
    return out


# --------------------------------------------------------------------------- #
# io
# --------------------------------------------------------------------------- #
def load_json(path, default=None):
    p = Path(path)
    if not p.exists():
        return default
    with p.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path, obj, indent=None):
    """Atomic write: a killed run never leaves a half-written artifact.

    Windows makes "atomic" conditional: os.replace raises WinError 5 while any
    other process holds the destination open, and these caches are read by
    other stages, by an editor, and by whatever indexer happens to be awake. A
    full Wikidata sweep died on exactly that after 16 countries, so a lock is
    retried rather than allowed to throw away an hour of harvesting."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".part")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=indent)
    last = None
    for wait in (0, 0.2, 0.5, 1.0, 2.0, 4.0):
        if wait:
            time.sleep(wait)
        try:
            tmp.replace(p)
            return
        except PermissionError as e:            # reader holds the target
            last = e
    # Still locked after ~8 seconds: write in place rather than lose the run.
    # Less safe (a kill here truncates), but the alternative is dropping work
    # that took hours to gather.
    try:
        with p.open("w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=indent)
        tmp.unlink(missing_ok=True)
        log(f"  (wrote {p.name} in place: {last})")
    except OSError:
        raise last


def log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #
EARTH_KM = 6371.0088


def haversine_km(lat1, lon1, lat2, lon2):
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (sin(dlat / 2) ** 2
         + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2)
    return 2 * EARTH_KM * asin(min(1.0, sqrt(a)))


class GeoIndex:
    """Degree-cell grid for nearest-neighbour lookups over tens of thousands of
    points. A full scan of 22k bathing sites per beach is 150M haversines; this
    keeps it to the nine cells around the query."""

    def __init__(self, points, cell_deg=0.25):
        self.cell = cell_deg
        self.grid = {}
        for p in points:
            lat, lon = p.get("lat"), p.get("lon")
            if lat is None or lon is None:
                continue
            self.grid.setdefault(self._key(lat, lon), []).append(p)

    def _key(self, lat, lon):
        return (int(lat // self.cell), int(lon // self.cell))

    def near(self, lat, lon, max_km):
        """[(km, point)] within max_km, nearest first."""
        span = max(1, int(max_km / (111.0 * self.cell)) + 1)
        ci, cj = self._key(lat, lon)
        out = []
        for i in range(ci - span, ci + span + 1):
            for j in range(cj - span, cj + span + 1):
                for p in self.grid.get((i, j), ()):
                    km = haversine_km(lat, lon, p["lat"], p["lon"])
                    if km <= max_km:
                        out.append((km, p))
        out.sort(key=lambda t: t[0])
        return out

    def nearest(self, lat, lon, max_km):
        hits = self.near(lat, lon, max_km)
        return hits[0] if hits else (None, None)


# --------------------------------------------------------------------------- #
# which country a point is actually in
# --------------------------------------------------------------------------- #
# A POI inherits its country from the destination it was harvested under, and
# that is wrong wherever a border is closer than the next town: Saranda in
# Albania collected four Corfu beaches, so Greek sand shipped on Albania's tab.
# A bounding box cannot catch it (Corfu sits inside Albania's box), so the
# check is a real point-in-polygon against the app's own country shapes.
COUNTRY_SHAPES = ROOT / "continent-app" / "public" / "country_shapes.json"

_SHAPES = None      # [(iso2, [ (bbox, [rings...]) ... ])]


def _ring_contains(lat, lon, ring):
    """Ray casting. Rings are GeoJSON [lon, lat] pairs."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            x_at = (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
            if lon < x_at:
                inside = not inside
        j = i
    return inside


def _load_shapes():
    global _SHAPES
    if _SHAPES is not None:
        return _SHAPES
    gj = load_json(COUNTRY_SHAPES) or {}
    out = []
    for feat in gj.get("features", []):
        iso2 = (feat.get("properties") or {}).get("iso2")
        geom = feat.get("geometry") or {}
        polys = []
        if geom.get("type") == "Polygon":
            polys = [geom.get("coordinates") or []]
        elif geom.get("type") == "MultiPolygon":
            polys = geom.get("coordinates") or []
        parts = []
        for poly in polys:
            if not poly or not poly[0]:
                continue
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            parts.append(((min(xs), min(ys), max(xs), max(ys)), poly))
        if iso2 and parts:
            out.append((iso2, parts))
    _SHAPES = out
    return _SHAPES


def point_in_country(lat, lon, iso2, margin_deg=0.0):
    """True when the point falls inside that country's shape. `margin_deg`
    widens the bounding-box prefilter only, so a coastal point a few hundred
    metres offshore (where a beach polygon's centroid often lands) still
    resolves to its own country rather than to nobody."""
    for code, parts in _load_shapes():
        if code != iso2:
            continue
        for (x0, y0, x1, y1), poly in parts:
            if not (x0 - margin_deg <= lon <= x1 + margin_deg
                    and y0 - margin_deg <= lat <= y1 + margin_deg):
                continue
            if _ring_contains(lat, lon, poly[0]):
                # Holes: a point inside an inner ring is outside the polygon.
                if any(_ring_contains(lat, lon, hole) for hole in poly[1:]):
                    continue
                return True
        return False
    return False        # no shape for that code: caller decides


def country_at(lat, lon):
    """The iso2 whose shape contains the point, or None. Used to REASSIGN a
    feature the harvest filed under the wrong country rather than to drop it:
    a Corfu beach is not junk, it is Greek."""
    for code, parts in _load_shapes():
        for (x0, y0, x1, y1), poly in parts:
            if not (x0 <= lon <= x1 and y0 <= lat <= y1):
                continue
            if _ring_contains(lat, lon, poly[0]) and not any(
                    _ring_contains(lat, lon, hole) for hole in poly[1:]):
                return code
    return None


def has_country_shapes():
    return bool(_load_shapes())


# --------------------------------------------------------------------------- #
# names
# --------------------------------------------------------------------------- #
_PUNCT = re.compile(r"[^a-z0-9]+")

# Words that carry no identity: two beaches called "Playa Grande" 400 km apart
# are different beaches, but "Playa de X" and "Praia de X" fold to the same
# core so the dedupe can see them.
GENERIC_TOKENS = {
    "beach", "beaches", "playa", "playas", "praia", "praias", "plage", "plages",
    "spiaggia", "spiagge", "strand", "strandje", "paralia", "plaza", "plaja",
    "plaj", "ranta", "strond", "traeth", "trai", "mount", "mt", "monte", "mont",
    "monti", "berg", "bjerg", "fjell", "pico", "pic", "puig", "peak", "summit",
    "spitze", "gipfel", "vrh", "vrch", "vrf", "vf", "cima", "cim", "punta",
    "de", "del", "della", "dello", "des", "du", "da", "das", "dos", "la", "le",
    "les", "el", "los", "las", "il", "lo", "gli", "der", "die", "das", "den",
    "the", "of", "and", "et", "y", "e", "i", "a", "an", "d", "l", "sur", "am",
}


def fold(s):
    """Diacritic-folded lowercase, l-with-stroke handled (it does not
    decompose under NFD, the POI dedupe hit this too)."""
    s = str(s or "").replace("ł", "l").replace("Ł", "L")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


def slugify(s):
    return _PUNCT.sub("-", fold(s)).strip("-")


def name_core(s):
    """The identity tokens of a feature name, generic words removed."""
    toks = [t for t in _PUNCT.split(fold(s)) if t and t not in GENERIC_TOKENS]
    return " ".join(toks)


def feature_id(kind, iso2, name):
    """Stable id. Same name in the same country collapses on purpose: the
    dedupe runs before ids are handed out."""
    return f"{kind}:{iso2}:{slugify(name)[:60]}"


# --------------------------------------------------------------------------- #
# the record
# --------------------------------------------------------------------------- #
def blank_feature(kind, iso2, country, name, lat, lon):
    """The canonical shape every stage reads and writes. Stages fill fields in;
    none of them invent one, so a missing value stays None and the validator
    can see it."""
    return {
        "id": feature_id(kind, iso2, name),
        "kind": kind,                  # beach | mountain
        "name": name,
        "name_local": None,
        "iso2": iso2,
        "country": country,
        "lat": round(float(lat), 6),
        "lon": round(float(lon), 6),
        # nearest priced destination, for the "reachable from" line and photos
        "near": None,                  # {dest_id, city, km}
        "wikidata": None,              # QID
        "wikipedia": None,             # "en:Title"
        "elevation_m": None,           # mountain
        "prominence_m": None,          # mountain
        "water": None,                 # beach: {class, site, dist_km, year, profile_url}
        "protected": None,             # {name, kind, dist_km, wikidata}
        "designations": [],            # natura2000 | national_park | unesco | ramsar ...
        "signals": {},                 # sitelinks, pageviews, poi_rate, commons_assessed
        "score": None,                 # 0..1, rank_features.py
        "rank_in_country": None,
        "tier": None,                  # 1 top pick, 2 strong, 3 listed
        "image": None,                 # {url, thumb, author, licence, licence_url,
                                       #  source, binding, file}
        "sources": [],                 # [{name, url}]
        "provenance": {},              # {spine, harvested, dedupe_of: [...]}
    }
