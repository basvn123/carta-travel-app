"""T915: the outdoor detail page redesign's new wire keys.

Tier: Scheduled (run_pipeline task outdoor_pages, after every nature export)

A post-pass over the published wires, the same way nature_tiers.py stamps v5:
each layer's export writes its files, then this adds the keys the redesigned
trail, beach, lake, mountain and cycling pages read. It reads the wires
themselves plus the caches named below, so it runs anywhere the wires are,
the trailslab lab included or not. It is idempotent: every key it owns is
removed first and written again, so a second run gives the same bytes.

Every key is optional and ABSENT when there is no data ("Sections are
independently absent"). Placeholder files hold what no offline source can
answer yet; each is {"_about": "...", "items": {id: {...}}}, keyed by the
layer's own id, and a value there wins over a derived one, so filling a file
later needs no code change. Keys starting with "_" inside an item are notes
and are never published.

Keys, per layer (shapes in docs/SCHEMA.md, "Outdoor page keys (T915)"):

  trails    detail file public/trails/trip/{id}.json
            start {name?, lat, lon, ele?}       derived: first vertex of the
                                                line, its DEM height, the
                                                nearest OSM village or town
                                                within START_NAME_M
            access {parking?, transit?}         parking derived from
                                                cache/parking_osm.json within
                                                PARKING_M of the start; transit
                                                placeholder
            dogs, permit                        placeholder
            huts[].season, huts[].booking       placeholder, merged by hut name
  beaches   country rows (beaches and listed)
            sea_temp [12]                       the row's `sst` (T641 NASA MUR
                                                harvest) or the overlay
                                                cache/sea_temp_beaches.json,
                                                else placeholder
            access {parking?, transit?}         parking derived, transit placeholder
            step_free                           derived: OSM wheelchair=yes is
                                                true, access by steps is false
            shade, sunbeds {eur_day},
            lifeguard_season [from, to], waves  placeholder
  lakes     country rows (lakes and listed)
            alt_m                               the export's Wikidata height
                                                (size.elevM) when present, else
                                                the lowest non-zero
                                                Copernicus GLO-30 vertex of a
                                                trail within ALT_TRAIL_M of the
                                                lake's swimming point
            access {parking?, transit?}         parking derived, transit placeholder
            entry_eur, rentals [{kind, eur_hour}],
            lifeguard_season                    placeholder
  mountains country rows (mountains and listed)
            routes [{id, cc, name, grade, km, ascent_m, duration_min}]
                                                derived from the trails wires:
                                                a hike whose line passes within
                                                SUMMIT_M of the summit and whose
                                                height there is within
                                                SUMMIT_DZ of it, best first, 4
            lift_info, hut_info                 placeholder
  cycling   detail file public/cycling/route/{id}.json
            stations {start?, end?: {name, m}}  derived from the route's own
                                                service towns (carta.services,
                                                enrich_cycling.py): the nearest
                                                town with a railway station
                                                within STATION_M of each end
            stages {prev?, next?: {id, name, km}}
                                                derived: the same numbered
                                                series ("part 29", "Etappe 4")
                                                or, for a stretch of a longer
                                                route, the same ref ending
                                                within STAGE_JOIN_M
            services {water?, repair?, cafes?}  water and repair derived from
                                                the service towns, cafes
                                                placeholder
            bike_trains, rental [{name, eur_day}] placeholder

access.parking is {name?, lat, lon, m, fee?: true|false, eur_day?}; transit is
[{name, mode: bus|train|tram|ferry, lat, lon, m}], nearest first, at most 3.
cache/parking_osm.json holds the spots within about 1.5 km of each Carta
destination, so a beach or trailhead far from every destination has no
parking row: absent means "not known", never "none".

Usage, from the repo root:
    python pipeline/outdoor/derive_outdoor_pages.py
    python pipeline/outdoor/derive_outdoor_pages.py --layers beaches,lakes --countries PT
    python pipeline/outdoor/derive_outdoor_pages.py --dry-run

ASCII clean, no em dashes, per project convention. Names with accents live in
the JSON data files, not here.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "continent-app" / "public"
PLACEHOLDERS = ROOT / "cache" / "outdoor"
sys.path.insert(0, str(ROOT / "pipeline"))

LAYERS = ("trails", "beaches", "lakes", "mountains", "cycling")

START_NAME_M = 1200      # a village this close to the first vertex names the start
PARKING_M = {"trails": 400, "beaches": 500, "lakes": 500}
PARKING_KINDS_SKIP = {"street_side", "lane"}   # kerbside, not a car park
SUMMIT_M = 150           # a route reaches the top when its line comes this close
SUMMIT_DZ = 60           # and its DEM height there is within this of the summit
ROUTES_MAX = 4
ALT_TRAIL_M = 150        # a trail vertex this close to a lake's swimming point
ALT_LAKE_KM2 = 1.0       # only for a lake small enough that its point is the shore
STATION_M = 3000         # a station town this close to an end of a cycle route
STAGE_JOIN_M = 1500      # two stretches of one ref meet when their ends are this close
SERVICE_OFF_M = 2000     # a service town counts for "along the way" this close
REPAIR_MAX = 5

# Keys this pass owns, per layer. Removed before every write so a rerun is
# exact. `access` is only removed when it is the T915 object: beaches and
# lakes carry an older string `access` ("road", "steps", "hike") on some rows,
# which this pass leaves alone (see SCHEMA.md).
OWNED = {
    "trails": ("start", "dogs", "permit"),
    "beaches": ("sea_temp", "step_free", "shade", "sunbeds", "lifeguard_season", "waves"),
    "lakes": ("alt_m", "entry_eur", "rentals", "lifeguard_season"),
    "mountains": ("routes", "lift_info", "hut_info"),
    "cycling": ("stations", "stages", "services", "bike_trains", "rental"),
}
HUT_KEYS = ("season", "booking")
TRANSIT_MODES = {"bus", "train", "tram", "ferry"}
RENTAL_KINDS = {"boat", "sup", "pedalo", "kayak"}
WAVES = {"calm", "moderate", "surf"}
DOGS = {"yes", "leash", "no"}


# ---------------------------------------------------------------- io

def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dumps(doc):
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":"))


def write_if_changed(path, doc, raw, dry):
    new = dumps(doc)
    if new == raw:
        return False
    if not dry:
        tmp = str(path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(new)
        os.replace(tmp, path)
    return True


def placeholder(layer):
    """{id: item} from cache/outdoor/{layer}.json, notes ("_" keys) removed."""
    path = PLACEHOLDERS / f"{layer}.json"
    try:
        items = load(path).get("items") or {}
    except (OSError, ValueError):
        return {}
    out = {}
    for key, item in items.items():
        if str(key).startswith("_") or not isinstance(item, dict):
            continue
        clean = {k: v for k, v in item.items() if not str(k).startswith("_")}
        if clean:
            out[str(key)] = clean
    return out


def country_files(layer_dir, countries):
    files = sorted(glob.glob(str(PUB / layer_dir / "[A-Z][A-Z].json")))
    if countries:
        files = [f for f in files if Path(f).stem in countries]
    return files


# ---------------------------------------------------------------- geometry

def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _xy(lat0, lon0, lat, lon):
    return ((lon - lon0) * 111320.0 * math.cos(math.radians(lat0)),
            (lat - lat0) * 110540.0)


def point_line_m(lat, lon, parts):
    """Closest distance in metres from a point to a MultiLineString's parts,
    plus the index path of the nearest vertex: (metres, part, vertex)."""
    best = (float("inf"), None, None)
    for pi, line in enumerate(parts):
        prev = None
        for vi, c in enumerate(line):
            x, y = _xy(lat, lon, c[1], c[0])
            d = math.hypot(x, y)
            if d < best[0]:
                best = (d, pi, vi)
            if prev is not None:
                (x1, y1), (x2, y2) = prev, (x, y)
                dx, dy = x2 - x1, y2 - y1
                L = dx * dx + dy * dy
                if L > 0:
                    t = max(0.0, min(1.0, -(x1 * dx + y1 * dy) / L))
                    d = math.hypot(x1 + t * dx, y1 + t * dy)
                    if d < best[0]:
                        best = (d, pi, vi if t > 0.5 else vi - 1)
            prev = (x, y)
    return best


def parts_of(geometry):
    if not geometry:
        return []
    if geometry.get("type") == "LineString":
        return [geometry.get("coordinates") or []]
    if geometry.get("type") == "MultiLineString":
        return [p for p in geometry.get("coordinates") or [] if p]
    return []


def ends_of(parts):
    if not parts:
        return None, None
    a, b = parts[0][0], parts[-1][-1]
    return (a[1], a[0]), (b[1], b[0])


class Grid:
    """Points in 0.01 degree cells, for a nearest-within-radius lookup."""

    def __init__(self, cell=0.01):
        self.cell = cell
        self.cells = defaultdict(list)

    def add(self, lat, lon, item):
        self.cells[(int(math.floor(lat / self.cell)), int(math.floor(lon / self.cell)))].append((lat, lon, item))

    def near(self, lat, lon, radius_m):
        """[(metres, item)] within radius, nearest first."""
        dlat = radius_m / 110540.0
        dlon = radius_m / (111320.0 * max(0.2, math.cos(math.radians(lat))))
        r0, r1 = int(math.floor((lat - dlat) / self.cell)), int(math.floor((lat + dlat) / self.cell))
        c0, c1 = int(math.floor((lon - dlon) / self.cell)), int(math.floor((lon + dlon) / self.cell))
        out = []
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                for plat, plon, item in self.cells.get((r, c), ()):
                    d = haversine_m(lat, lon, plat, plon)
                    if d <= radius_m:
                        out.append((d, item))
        out.sort(key=lambda x: x[0])
        return out


# ---------------------------------------------------------------- shared sources

_PARKING = None
_SETTLEMENTS = None


def parking_grid():
    """Car parks from cache/parking_osm.json (OSM, harvested around each
    destination), deduplicated, private and kerbside spots left out."""
    global _PARKING
    if _PARKING is None:
        _PARKING = Grid()
        try:
            dests = load(ROOT / "cache" / "parking_osm.json").get("dests") or {}
        except (OSError, ValueError):
            dests = {}
        seen = set()
        for spots in dests.values():
            for s in spots or []:
                key = (s.get("lat"), s.get("lon"))
                if None in key or key in seen:
                    continue
                seen.add(key)
                if s.get("pr") or s.get("type") in PARKING_KINDS_SKIP:
                    continue
                _PARKING.add(s["lat"], s["lon"], s)
    return _PARKING


def nearest_parking(lat, lon, radius_m):
    hits = parking_grid().near(lat, lon, radius_m)
    if not hits:
        return None
    d, s = hits[0]
    out = {}
    if s.get("name"):
        out["name"] = s["name"]
    out.update({"lat": round(s["lat"], 5), "lon": round(s["lon"], 5), "m": int(round(d / 10.0) * 10)})
    if s.get("fee") == "yes":
        out["fee"] = True
    elif s.get("fee") == "no":
        out["fee"] = False
    return out


def settlement_grid():
    global _SETTLEMENTS
    if _SETTLEMENTS is None:
        _SETTLEMENTS = Grid(0.02)
        try:
            doc = load(ROOT / "cache" / "osm_settlements.json")
        except (OSError, ValueError):
            doc = {}
        for cc, rows in doc.items():
            if cc.startswith("_") or not isinstance(rows, list):
                continue
            for r in rows:
                if isinstance(r, list) and len(r) >= 3 and r[0]:
                    _SETTLEMENTS.add(r[1], r[2], r[0])
    return _SETTLEMENTS


def access_of(parking, ph_access):
    """The access block: the placeholder's parking and transit win field by field."""
    out = {}
    ph_access = ph_access if isinstance(ph_access, dict) else {}
    park = ph_access.get("parking") or parking
    if isinstance(park, dict) and park.get("lat") is not None and park.get("lon") is not None:
        out["parking"] = park
    transit = [t for t in (ph_access.get("transit") or [])
               if isinstance(t, dict) and t.get("mode") in TRANSIT_MODES
               and t.get("lat") is not None and t.get("lon") is not None]
    if transit:
        out["transit"] = sorted(transit, key=lambda t: t.get("m", 0))[:3]
    return out or None


def strip(row, layer):
    for k in OWNED[layer]:
        row.pop(k, None)
    if isinstance(row.get("access"), dict):
        row.pop("access")


def set_access(row, access):
    """Writes the access object unless the row carries the older string."""
    if access and not isinstance(row.get("access"), str):
        row["access"] = access
        return True
    return False


def month_pair(v):
    if (isinstance(v, list) and len(v) == 2 and all(isinstance(x, int) and 1 <= x <= 12 for x in v)):
        return v
    return None


def fold(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# ---------------------------------------------------------------- trails

def derive_trails(countries, dry, stats):
    ph = placeholder("trails")
    files = country_files("trails", countries)
    changed = 0
    for f in files:
        for row in load(f).get("trips") or []:
            path = PUB / "trails" / "trip" / f"{row['id']}.json"
            if not path.exists():
                continue
            with open(path, encoding="utf-8") as fh:
                raw = fh.read()
            doc = json.loads(raw)
            strip(doc, "trails")
            for hut in doc.get("huts") or []:
                for k in HUT_KEYS:
                    hut.pop(k, None)
            item = ph.get(str(doc["id"])) or {}

            parts = parts_of(doc.get("geometry"))
            start = None
            if parts:
                c = parts[0][0]
                start = {"lat": round(c[1], 5), "lon": round(c[0], 5)}
                prof = (doc.get("elevation") or {}).get("profile") or []
                ele = c[2] if len(c) > 2 and c[2] is not None else (prof[0][1] if prof else None)
                if ele is not None:
                    start["ele"] = int(round(ele))
                hits = settlement_grid().near(c[1], c[0], START_NAME_M)
                if hits:
                    start = {"name": hits[0][1], **start}
            if isinstance(item.get("start"), dict):
                start = {**(start or {}), **item["start"]}
            if start:
                doc["start"] = start
                stats["start"] += 1
                if start.get("name"):
                    stats["start.name"] += 1

            parking = nearest_parking(start["lat"], start["lon"], PARKING_M["trails"]) if start else None
            access = access_of(parking, item.get("access"))
            if set_access(doc, access):
                stats["access"] += 1
                stats["access.parking"] += 1 if "parking" in access else 0
                stats["access.transit"] += 1 if "transit" in access else 0
            if item.get("dogs") in DOGS:
                doc["dogs"] = item["dogs"]
                stats["dogs"] += 1
            if isinstance(item.get("permit"), str) and item["permit"].strip():
                doc["permit"] = item["permit"].strip()
                stats["permit"] += 1
            hut_ph = {fold(k): v for k, v in (item.get("huts") or {}).items() if isinstance(v, dict)}
            for hut in doc.get("huts") or []:
                extra = hut_ph.get(fold(hut.get("name"))) or hut_ph.get(fold(hut.get("id")))
                if not extra:
                    continue
                if month_pair(extra.get("season")):
                    hut["season"] = extra["season"]
                    stats["huts.season"] += 1
                if isinstance(extra.get("booking"), bool):
                    hut["booking"] = extra["booking"]
                    stats["huts.booking"] += 1
            if write_if_changed(path, doc, raw, dry):
                changed += 1
    return changed


# ---------------------------------------------------------------- beaches

def derive_beaches(countries, dry, stats):
    ph = placeholder("beaches")
    try:
        import explore_overlay as xov
        sst_rows = xov.load_rows("sea_temp_beaches")
    except Exception:  # noqa: BLE001 - the overlay is optional
        sst_rows = {}
    changed = 0
    for f in country_files("beaches", countries):
        with open(f, encoding="utf-8") as fh:
            raw = fh.read()
        doc = json.loads(raw)
        for key in ("beaches", "listed"):
            for row in doc.get(key) or []:
                strip(row, "beaches")
                item = ph.get(row["id"]) or {}
                sea = item.get("sea_temp") or row.get("sst") or (sst_rows.get(row["id"]) or {}).get("c")
                if isinstance(sea, list) and len(sea) == 12 and all(isinstance(x, (int, float)) for x in sea):
                    row["sea_temp"] = [round(float(x), 1) if x % 1 else int(x) for x in sea]
                    stats["sea_temp"] += 1
                parking = nearest_parking(row["lat"], row["lon"], PARKING_M["beaches"])
                access = access_of(parking, item.get("access"))
                if set_access(row, access):
                    stats["access"] += 1
                    stats["access.parking"] += 1 if "parking" in access else 0
                    stats["access.transit"] += 1 if "transit" in access else 0
                elif access:
                    stats["access.skipped_string"] += 1
                step = item.get("step_free")
                if not isinstance(step, bool):
                    step = True if row.get("wheelchair") is True else (False if row.get("access") == "steps" else None)
                if isinstance(step, bool):
                    row["step_free"] = step
                    stats["step_free"] += 1
                if isinstance(item.get("shade"), bool):
                    row["shade"] = item["shade"]
                    stats["shade"] += 1
                sun = item.get("sunbeds")
                if isinstance(sun, dict) and isinstance(sun.get("eur_day"), (int, float)):
                    row["sunbeds"] = {"eur_day": sun["eur_day"]}
                    stats["sunbeds"] += 1
                if month_pair(item.get("lifeguard_season")):
                    row["lifeguard_season"] = item["lifeguard_season"]
                    stats["lifeguard_season"] += 1
                if item.get("waves") in WAVES:
                    row["waves"] = item["waves"]
                    stats["waves"] += 1
        if write_if_changed(f, doc, raw, dry):
            changed += 1
    return changed


# ---------------------------------------------------------------- lakes

def lowest_trail_z(points):
    """{point key: lowest Copernicus GLO-30 trail vertex height within
    ALT_TRAIL_M}, read from the trail detail files whose box holds a point."""
    grid = Grid(0.01)
    for key, (lat, lon) in points.items():
        grid.add(lat, lon, key)
    if not points:
        return {}
    pad = ALT_TRAIL_M / 80000.0
    out = {}
    for f in country_files("trails", None):
        for r in load(f).get("trips") or []:
            b = r.get("bbox")
            if not b:
                continue
            hit = False
            for cy in range(int(math.floor((b[1] - pad) / 0.01)), int(math.floor((b[3] + pad) / 0.01)) + 1):
                for cx in range(int(math.floor((b[0] - pad) / 0.01)), int(math.floor((b[2] + pad) / 0.01)) + 1):
                    if grid.cells.get((cy, cx)):
                        hit = True
                        break
                if hit:
                    break
            if not hit:
                continue
            path = PUB / "trails" / "trip" / f"{r['id']}.json"
            if not path.exists():
                continue
            for line in parts_of(load(path).get("geometry")):
                for c in line:
                    if len(c) < 3 or not c[2]:
                        continue
                    for _, key in grid.near(c[1], c[0], ALT_TRAIL_M):
                        if key not in out or c[2] < out[key]:
                            out[key] = c[2]
    return out


def lake_point(row, beach_pts):
    """Where a visitor meets the lake: its first linked bathing beach, else
    the lake's own point when the lake is small enough for that to be shore."""
    for b in row.get("beaches") or []:
        p = beach_pts.get(b.get("id"))
        if p:
            return p, True
    area = (row.get("size") or {}).get("areaKm2")
    if area is not None and area <= ALT_LAKE_KM2:
        return (row["lat"], row["lon"]), True
    return (row["lat"], row["lon"]), False


def derive_lakes(countries, dry, stats):
    ph = placeholder("lakes")
    beach_pts = {}
    for f in country_files("beaches", None):
        d = load(f)
        for key in ("beaches", "listed"):
            for b in d.get(key) or []:
                beach_pts[b["id"]] = (b["lat"], b["lon"])
    files = country_files("lakes", countries)
    need = {}
    for f in files:
        d = load(f)
        for key in ("lakes", "listed"):
            for row in d.get(key) or []:
                pt, shore = lake_point(row, beach_pts)
                if shore and (row.get("size") or {}).get("elevM") is None:
                    need[row["id"]] = pt
    trail_z = lowest_trail_z(need)
    changed = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            raw = fh.read()
        doc = json.loads(raw)
        for key in ("lakes", "listed"):
            for row in doc.get(key) or []:
                strip(row, "lakes")
                item = ph.get(row["id"]) or {}
                (plat, plon), shore = lake_point(row, beach_pts)
                if isinstance(item.get("alt_m"), (int, float)):
                    row["alt_m"] = int(round(item["alt_m"]))
                elif isinstance((row.get("size") or {}).get("elevM"), (int, float)):
                    row["alt_m"] = int(row["size"]["elevM"])
                elif row["id"] in trail_z:
                    row["alt_m"] = int(round(trail_z[row["id"]]))
                if row.get("alt_m") is not None:
                    stats["alt_m"] += 1
                parking = nearest_parking(plat, plon, PARKING_M["lakes"]) if shore else None
                access = access_of(parking, item.get("access"))
                if set_access(row, access):
                    stats["access"] += 1
                    stats["access.parking"] += 1 if "parking" in access else 0
                    stats["access.transit"] += 1 if "transit" in access else 0
                elif access:
                    stats["access.skipped_string"] += 1
                if isinstance(item.get("entry_eur"), (int, float)) and item["entry_eur"] >= 0:
                    row["entry_eur"] = item["entry_eur"]
                    stats["entry_eur"] += 1
                rentals = [{"kind": r["kind"], "eur_hour": r["eur_hour"]} if isinstance(r.get("eur_hour"), (int, float))
                           else {"kind": r["kind"]}
                           for r in item.get("rentals") or []
                           if isinstance(r, dict) and r.get("kind") in RENTAL_KINDS]
                if rentals:
                    row["rentals"] = rentals
                    stats["rentals"] += 1
                if month_pair(item.get("lifeguard_season")):
                    row["lifeguard_season"] = item["lifeguard_season"]
                    stats["lifeguard_season"] += 1
        if write_if_changed(f, doc, raw, dry):
            changed += 1
    return changed


# ---------------------------------------------------------------- mountains

def trail_rows():
    """Every published hike row with its simplified line, for the route search."""
    rows = []
    for f in country_files("trails", None):
        for r in load(f).get("trips") or []:
            if r.get("category") != "hike" or not r.get("bbox"):
                continue
            rows.append(r)
    return rows


def route_key(r):
    v5 = (r.get("v5") or {}).get("score")
    return (-(v5 if v5 is not None else -1), -(r.get("rating") or 0), r.get("distance_m") or 0)


def routes_to(peak, trails, by_cell, detail_cache):
    lat, lon = peak["lat"], peak["lon"]
    top = peak.get("ele")
    tol = SUMMIT_DZ + abs(peak.get("eleGap") or 0)
    pad = 0.004
    seen, hits = set(), []
    for idx in by_cell.get((int(math.floor(lat * 20)), int(math.floor(lon * 20))), ()):
        r = trails[idx]
        if idx in seen:
            continue
        seen.add(idx)
        b = r["bbox"]
        if not (b[0] - pad <= lon <= b[2] + pad and b[1] - pad <= lat <= b[3] + pad):
            continue
        # The simplified line is within 90 m of the true one: a 300 m prefilter is safe.
        if point_line_m(lat, lon, parts_of(r.get("geometry")))[0] > SUMMIT_M + 150:
            continue
        rid = str(r["id"])
        if rid not in detail_cache:
            p = PUB / "trails" / "trip" / f"{rid}.json"
            detail_cache[rid] = parts_of(load(p).get("geometry")) if p.exists() else []
        parts = detail_cache[rid] or parts_of(r.get("geometry"))
        d, pi, vi = point_line_m(lat, lon, parts)
        if d > SUMMIT_M:
            continue
        if top:
            # An exact 0 is a DEM nodata or water pixel (elevation.py), not a height.
            zs = [c[2] for line in parts for c in line
                  if len(c) > 2 and c[2]
                  and haversine_m(lat, lon, c[1], c[0]) <= SUMMIT_M + 30]
            if zs:
                if max(zs) < top - tol:
                    continue
            elif ((r.get("ele") or {}).get("max") or top) < top - tol:
                continue
        hits.append(r)
    hits.sort(key=route_key)
    out = []
    for r in hits[:ROUTES_MAX]:
        o = {"id": r["id"], "cc": r.get("country"), "name": r.get("name")}
        g = (r.get("f") or {}).get("g") or r.get("difficulty")
        if g:
            o["grade"] = g
        if r.get("distance_m"):
            o["km"] = round(r["distance_m"] / 1000.0, 1)
        if r.get("ascent_m") is not None:
            o["ascent_m"] = r["ascent_m"]
        if r.get("duration_min"):
            o["duration_min"] = r["duration_min"]
        out.append(o)
    return out


def derive_mountains(countries, dry, stats):
    ph = placeholder("mountains")
    trails = trail_rows()
    by_cell = defaultdict(list)          # 0.05 degree cells, each trail in every cell its bbox touches
    for i, r in enumerate(trails):
        b = r["bbox"]
        for cy in range(int(math.floor((b[1] - 0.004) * 20)), int(math.floor((b[3] + 0.004) * 20)) + 1):
            for cx in range(int(math.floor((b[0] - 0.004) * 20)), int(math.floor((b[2] + 0.004) * 20)) + 1):
                by_cell[(cy, cx)].append(i)
    detail_cache = {}
    changed = 0
    for f in country_files("mountains", countries):
        with open(f, encoding="utf-8") as fh:
            raw = fh.read()
        doc = json.loads(raw)
        for key in ("mountains", "listed"):
            for row in doc.get(key) or []:
                strip(row, "mountains")
                item = ph.get(row["id"]) or {}
                routes = routes_to(row, trails, by_cell, detail_cache)
                if routes:
                    row["routes"] = routes
                    stats["routes"] += 1
                lift = item.get("lift_info")
                if isinstance(lift, dict) and lift.get("name"):
                    row["lift_info"] = {k: v for k, v in lift.items()
                                        if k in ("name", "season", "return_eur", "top_ele")
                                        and (k != "season" or month_pair(v))}
                    stats["lift_info"] += 1
                hut = item.get("hut_info")
                if isinstance(hut, dict) and hut.get("name"):
                    row["hut_info"] = {k: v for k, v in hut.items()
                                       if k in ("name", "ele", "season", "booking")
                                       and (k != "season" or month_pair(v))}
                    stats["hut_info"] += 1
        if write_if_changed(f, doc, raw, dry):
            changed += 1
    return changed


# ---------------------------------------------------------------- cycling

SERIES_RE = re.compile(
    r"^(?P<stem>.*?)[\s,:;.\-]*\b(?:part|section|stage|leg|etappe|etape|\u00e9tape|tappa|"
    r"etapa|deel|teil|abschnitt|odcinek|osa|del)\b\.?\s*(?P<mid>[^\d\s]\S*\s+)?(?P<n>\d{1,3})\s*$", re.I)


def series_of(name):
    """(series key, number) for "... part 7", "..., Etappe 4" or "... part
    Portugal 30"; the word between ("Portugal") stays in the key, so the
    national parts of one EuroVelo route are separate series."""
    m = SERIES_RE.match(name or "")
    if not m or not m.group("stem").strip():
        return None
    return fold(m.group("stem") + " " + (m.group("mid") or "")), int(m.group("n"))


def stage_ref(r):
    return {"id": r["id"], "name": r.get("name"), "km": r.get("km")}


def cycle_index(rows):
    """Lookup tables for the stage neighbours of every published route."""
    series = {}
    by_ref = defaultdict(list)
    for r in rows:
        s = series_of(r.get("name"))
        if s:
            series.setdefault(s, r)
        ref = (r.get("ref") or "").strip().lower()
        if ref and r.get("net") in ("icn", "ncn", "rcn"):
            a, b = ends_of(parts_of(r.get("geometry")))
            if a:
                by_ref[ref].append((r, a, b))
    return series, by_ref


def stages_of(r, series, by_ref):
    out = {}
    s = series_of(r.get("name"))
    if s:
        stem, n = s
        if (stem, n - 1) in series:
            out["prev"] = stage_ref(series[(stem, n - 1)])
        if (stem, n + 1) in series:
            out["next"] = stage_ref(series[(stem, n + 1)])
        if out:
            return out
    ref = (r.get("ref") or "").strip().lower()
    if not (r.get("sec") and ref and r.get("net") in ("icn", "ncn", "rcn")):
        return out
    a, b = ends_of(parts_of(r.get("geometry")))
    if not a:
        return out

    def best_at(pt, exclude):
        best = None
        for o, oa, ob in by_ref.get(ref, ()):
            if o["id"] == r["id"] or o["id"] in exclude:
                continue
            d = min(haversine_m(pt[0], pt[1], oa[0], oa[1]), haversine_m(pt[0], pt[1], ob[0], ob[1]))
            if d <= STAGE_JOIN_M and (best is None or d < best[0]):
                best = (d, o)
        return best[1] if best else None

    nxt = best_at(b, set())
    prv = best_at(a, {nxt["id"]} if nxt else set())
    if prv:
        out["prev"] = stage_ref(prv)
    if nxt:
        out["next"] = stage_ref(nxt)
    return out


def stations_of(detail):
    services = ((detail.get("carta") or {}).get("services")) or []
    a, b = ends_of(parts_of((detail.get("osm") or {}).get("geometry")))
    out = {}
    for label, pt in (("start", a), ("end", b)):
        if not pt:
            continue
        best = None
        for s in services:
            if not (s.get("station") and s.get("station_name")) or s.get("lat") is None:
                continue
            d = haversine_m(pt[0], pt[1], s["lat"], s["lon"])
            if d <= STATION_M and (best is None or d < best[0]):
                best = (d, s)
        if best:
            out[label] = {"name": best[1]["station_name"], "m": int(round(best[0] / 100.0) * 100)}
    return out


def services_of(detail):
    towns = [s for s in ((detail.get("carta") or {}).get("services")) or []
             if (s.get("off_m") or 0) <= SERVICE_OFF_M]
    out = {}
    water = sum(int(s.get("water") or 0) for s in towns)
    if water:
        out["water"] = water
    repair = []
    for s in sorted(towns, key=lambda s: s.get("at_m") or 0):
        if (s.get("repair") or s.get("shop")) and s.get("name") and s["name"] not in repair:
            repair.append(s["name"])
    if repair:
        out["repair"] = repair[:REPAIR_MAX]
    return out


def derive_cycling(countries, dry, stats):
    ph = placeholder("cycling")
    all_rows = []
    for f in country_files("cycling", None):
        d = load(f)
        for key in ("routes", "listed"):
            all_rows.extend(d.get(key) or [])
    series, by_ref = cycle_index(all_rows)
    changed = 0
    for f in country_files("cycling", countries):
        d = load(f)
        for key in ("routes", "listed"):
            for row in d.get(key) or []:
                path = PUB / "cycling" / "route" / f"{row['id']}.json"
                if not path.exists():
                    continue
                with open(path, encoding="utf-8") as fh:
                    raw = fh.read()
                doc = json.loads(raw)
                strip(doc, "cycling")
                item = ph.get(str(doc["id"])) or {}
                st = stations_of(doc)
                for k in ("start", "end"):
                    v = (item.get("stations") or {}).get(k)
                    if isinstance(v, dict) and v.get("name"):
                        st[k] = v
                if st:
                    doc["stations"] = st
                    stats["stations"] += 1
                stg = stages_of(row, series, by_ref)
                for k in ("prev", "next"):
                    v = (item.get("stages") or {}).get(k)
                    if isinstance(v, dict) and v.get("id") is not None:
                        stg[k] = v
                if stg:
                    doc["stages"] = stg
                    stats["stages"] += 1
                sv = services_of(doc)
                for k, v in (item.get("services") or {}).items():
                    if k in ("water", "repair", "cafes") and v not in (None, [], ""):
                        sv[k] = v
                if sv:
                    doc["services"] = sv
                    stats["services"] += 1
                if isinstance(item.get("bike_trains"), str) and item["bike_trains"].strip():
                    doc["bike_trains"] = item["bike_trains"].strip()
                    stats["bike_trains"] += 1
                rental = [r for r in item.get("rental") or [] if isinstance(r, dict) and r.get("name")]
                if rental:
                    doc["rental"] = rental
                    stats["rental"] += 1
                if write_if_changed(path, doc, raw, dry):
                    changed += 1
    return changed


RUN = {"trails": derive_trails, "beaches": derive_beaches, "lakes": derive_lakes,
       "mountains": derive_mountains, "cycling": derive_cycling}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--layers", default=",".join(LAYERS))
    ap.add_argument("--countries", default="")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    layers = [x.strip() for x in args.layers.split(",") if x.strip()]
    countries = {c.strip().upper() for c in args.countries.split(",") if c.strip()} or None
    for layer in layers:
        if layer not in RUN:
            raise SystemExit(f"unknown layer {layer}; one of {', '.join(LAYERS)}")
        stats = defaultdict(int)
        n = RUN[layer](countries, args.dry_run, stats)
        print(f"[outdoor] {layer}: {n} files {'would change' if args.dry_run else 'written'}; "
              + ", ".join(f"{k} {v}" for k, v in sorted(stats.items())))


if __name__ == "__main__":
    main()
