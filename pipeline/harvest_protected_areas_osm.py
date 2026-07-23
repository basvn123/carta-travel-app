"""harvest_protected_areas_osm.py - a nearby-nature layer from OpenStreetMap.

Same goal as harvest_protected_areas.py (national parks, nature reserves and
other protected areas near each destination) but sourced from the OSM Overpass
API instead of Wikidata's query service - because WDQS is currently in a hard
outage (persistent 502/504) while Overpass is healthy and much faster.

We sweep Europe in a bounding-box grid (Overpass times out on a single
continent-wide query for this many features) collecting, per tile:

    relation/way boundary=national_park
    relation      boundary=protected_area with an IUCN protect_class
    relation/way/node leisure=nature_reserve

Each feature keeps its representative centre (Overpass "out center"), a friendly
kind, and whether it carries a wikidata tag (a prominence proxy, since OSM has
no sitelink count). Features are de-duped across overlapping tiles by wikidata
id, else by normalised name + rounded centre.

For every destination we then find the protected areas within RADIUS_KM and
store, under dest["nature"], the same shape the Wikidata script used:

    "nature": {
      "nearest": {"name","kind","dist_km","osm":<url>,"wikidata":<qid|None>},
      "n_areas": 3, "kinds": [...], "has_national_park": true,
      "source": "osm_overpass"
    }

The "nearest" headline prefers a national park, then a wikidata-tagged (notable)
area, then the closest. Deduped areas are cached in
cache/osm_protected_areas.json so re-runs only re-match. Patches app_data.json
master; sync-data.mjs ships it. ASCII-clean, no em dashes.

Usage:
    python harvest_protected_areas_osm.py             # fetch-if-needed, match, apply
    python harvest_protected_areas_osm.py --refresh   # force a fresh Overpass sweep
    python harvest_protected_areas_osm.py --cache-only  # sweep to cache, do NOT
                                                        # touch app_data.json master
The sweep is resumable: the per-tile cache records which tiles are done, so a
stopped run just needs re-running (safe to run cache-only while another session
is rebuilding the master).
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from math import radians
from pathlib import Path

import numpy as np

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "osm_protected_areas.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)"}
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
RADIUS_KM = 30.0

# Europe bounding box, swept in TILE-degree squares (with a small overlap so a
# park straddling a tile edge is still caught in at least one tile centre).
BBOX = (34.0, -25.0, 72.0, 45.0)     # S, W, N, E
TILE = 6.0
OVERLAP = 0.2

IUCN_CLASSES = "^(1a|1b|2|3|4|5|6)$"  # strict reserve .. managed resource area

# protect_class (IUCN) -> friendly label when boundary=protected_area
CLASS_LABEL = {
    "1a": "Nature reserve", "1b": "Wilderness area", "2": "National park",
    "3": "Natural monument", "4": "Habitat reserve", "5": "Protected landscape",
    "6": "Nature park",
}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def tile_query(s, w, n, e):
    return f"""[out:json][timeout:180];
(
  relation["boundary"="national_park"]({s},{w},{n},{e});
  way["boundary"="national_park"]({s},{w},{n},{e});
  relation["boundary"="protected_area"]["protect_class"~"{IUCN_CLASSES}"]({s},{w},{n},{e});
  relation["leisure"="nature_reserve"]({s},{w},{n},{e});
  way["leisure"="nature_reserve"]({s},{w},{n},{e});
  node["leisure"="nature_reserve"]({s},{w},{n},{e});
);
out tags center;"""


def overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(5):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=body, headers=UA)
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.loads(r.read().decode("utf-8")).get("elements", [])
        except urllib.error.HTTPError as e:
            if e.code in (429, 504, 502, 503) and attempt < 4:
                time.sleep(15 * (attempt + 1)); continue
            if attempt < 4:
                time.sleep(10); continue
            print(f"    tile give up: {e}"); return None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 4:
                time.sleep(10 * (attempt + 1)); continue
            print(f"    tile give up: {e}"); return None
    return None


def kind_of(tags):
    if tags.get("boundary") == "national_park":
        return "National park", True
    if tags.get("boundary") == "protected_area":
        lbl = CLASS_LABEL.get(str(tags.get("protect_class", "")), "Protected area")
        return lbl, lbl == "National park"
    if tags.get("leisure") == "nature_reserve":
        return "Nature reserve", False
    return "Protected area", False


def _norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum())


def _tiles():
    s0, w0, n0, e0 = BBOX
    tiles = []
    lat = s0
    while lat < n0:
        lon = w0
        while lon < e0:
            tiles.append((round(lat - OVERLAP, 3), round(lon - OVERLAP, 3),
                          round(min(lat + TILE, n0) + OVERLAP, 3),
                          round(min(lon + TILE, e0) + OVERLAP, 3)))
            lon += TILE
        lat += TILE
    return tiles


def _absorb(by_key, els):
    for el in els:
        tags = el.get("tags") or {}
        name = (tags.get("name") or tags.get("official_name") or "").strip()
        if not name:
            continue
        if el["type"] == "node":
            lat_c, lon_c = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat_c, lon_c = c.get("lat"), c.get("lon")
        if lat_c is None or lon_c is None:
            continue
        kind, is_np = kind_of(tags)
        qid = tags.get("wikidata")
        key = "wd:" + qid if qid else f"nm:{_norm(name)}:{round(lat_c,2)}:{round(lon_c,2)}"
        rec = {
            "name": name, "kind": kind, "np": is_np,
            "lat": float(lat_c), "lon": float(lon_c),
            "wikidata": qid,
            "osm": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
            "notable": bool(qid),
        }
        cur = by_key.get(key)
        if cur is None or (is_np and not cur["np"]):
            by_key[key] = rec


def sweep(refresh):
    """Resumable Overpass sweep. Cache is {"by_key": {...}, "done": ["s,w,n,e"]};
    tiles already in `done` are skipped, so a stopped run just re-runs."""
    state = {} if refresh else (load(CACHE) if CACHE.exists() else {})
    by_key = state.get("by_key", {})
    done = set(state.get("done", []))
    tiles = _tiles()
    CACHE.parent.mkdir(exist_ok=True)

    todo = [t for t in tiles if ",".join(map(str, t)) not in done]
    print(f"Overpass sweep: {len(tiles)} tiles total, {len(done)} done, "
          f"{len(todo)} to go ({len(by_key)} areas cached)")
    for i, (s, w, n, e) in enumerate(todo):
        els = overpass(tile_query(s, w, n, e))
        if els is None:
            print(f"  tile [{s:.0f},{w:.0f}]: FAILED, will retry on re-run")
            continue
        _absorb(by_key, els)
        done.add(",".join(map(str, (s, w, n, e))))
        CACHE.write_text(json.dumps({"by_key": by_key, "done": sorted(done)},
                                    ensure_ascii=False), encoding="utf-8")
        print(f"  tile {i + 1}/{len(todo)} [{s:.0f},{w:.0f}]: "
              f"{len(els)} elements, {len(by_key)} unique so far")
        time.sleep(1.0)
    return list(by_key.values()), len(todo) == 0 or all(
        ",".join(map(str, t)) in done for t in tiles)


def load_areas(refresh):
    """Return the deduped area list, sweeping (resumably) if needed."""
    if CACHE.exists() and not refresh:
        state = load(CACHE)
        tiles = _tiles()
        if len(state.get("done", [])) >= len(tiles):
            areas = list(state.get("by_key", {}).values())
            print(f"OSM cache: {len(areas)} protected areas (all tiles done)")
            return areas
    areas, _ = sweep(refresh)
    print(f"OSM sweep: {len(areas)} unique protected areas -> cache/{CACHE.name}")
    return areas


def match(dests, areas):
    if not areas:
        print("  no areas fetched; nothing to match"); return 0
    alat = np.radians(np.array([a["lat"] for a in areas]))
    alon = np.radians(np.array([a["lon"] for a in areas]))
    R = 6371.0

    matched = 0
    for d in dests.values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            d.pop("nature", None); continue
        p1, l1 = radians(lat), radians(lon)
        dlat = alat - p1
        dlon = alon - l1
        hav = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(alat) * np.sin(dlon / 2) ** 2
        dist = 2 * R * np.arcsin(np.sqrt(hav))
        idx = np.where(dist <= RADIUS_KM)[0]
        if len(idx) == 0:
            d.pop("nature", None); continue

        near = [(areas[i], float(dist[i])) for i in idx]
        # headline: national park first, then notable (wikidata-tagged), then closest
        near.sort(key=lambda t: (not t[0]["np"], not t[0]["notable"], t[1]))
        top, tkm = near[0]
        kinds = sorted({a["kind"] for a, _ in near})
        d["nature"] = {
            "nearest": {
                "name": top["name"],
                "kind": top["kind"],
                "dist_km": round(tkm, 1),
                "osm": top["osm"],
                "wikidata": ("https://www.wikidata.org/wiki/" + top["wikidata"])
                if top["wikidata"] else None,
            },
            "n_areas": len(near),
            "kinds": kinds,
            "has_national_park": any(a["np"] for a, _ in near),
            "radius_km": int(RADIUS_KM),
            "source": "osm_overpass",
        }
        matched += 1
    return matched


def main():
    args = sys.argv[1:]
    refresh = "--refresh" in args
    cache_only = "--cache-only" in args

    if cache_only:
        # Sweep to cache without ever reading or writing the master - safe to run
        # while another session is rebuilding app_data.json.
        areas, complete = sweep(refresh)
        print(f"[cache-only] {len(areas)} unique protected areas cached "
              f"({'all tiles done' if complete else 'more tiles remain, re-run to finish'})")
        return

    areas = load_areas(refresh)
    data = load(MASTER)
    dests = data["destinations"]

    matched = match(dests, areas)
    print(f"Matched: {matched}/{len(dests)} destinations carry a nature block "
          f"(protected area within {int(RADIUS_KM)} km)")
    np_dests = sum(1 for d in dests.values()
                   if d.get("nature", {}).get("has_national_park"))
    print(f"  of which {np_dests} have a national park within the radius")

    data["meta"].setdefault("data_sources", {})["osm_protected_areas"] = {
        "provider": "OpenStreetMap via Overpass API - national parks, nature reserves, protected areas",
        "license": "ODbL (c) OpenStreetMap contributors",
        "used_for": "nearest protected nature area and park presence per destination",
        "radius_km": int(RADIUS_KM),
    }

    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}")
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
