"""merge_curation.py - fill the last POI-sparse destinations.

Two sources, merged into cache/activities.json (then patch via harvest_activities):
  1. Hand-curated agent JSON files (scratchpad/curation_*.json): real named POIs
     with verified coordinates for wetlands / remote islands / sparse villages.
  2. Wikipedia geosearch top-up: for any destination still < MIN_FULL items_full,
     pull nearby articles (each carries coordinates + a lead thumbnail + a one-line
     description) and add them as items_full. Coordinate-bearing and verifiable, so
     the Day Planner gets real map pins for places OpenTripMap/OSM barely covered.

Idempotent: re-running dedupes by POI name and never lowers an existing count.

Usage: python merge_curation.py [curation_dir]
"""
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "activities.json"
MASTER = ROOT / "app_data" / "app_data.json"
CUR_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    "C:/Users/GEBRUI~1/AppData/Local/Temp/claude/"
    "c--Users-Gebruiker-Documents-Portfolio-Travel-App/"
    "68938d7a-a645-42d2-b8b2-18a21d2ff61c/scratchpad")

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio; data@carta-europetravel.com)"}
WIKI_API = "https://en.wikipedia.org/w/api.php"
MIN_FULL = 8          # top up anything below this
GEO_RADIUS_M = 10000  # Wikipedia geosearch hard cap is 10 km
GEO_LIMIT = 50
TARGET_FULL = 14      # aim for this many after top-up

ACTIVE_HINT = re.compile(
    r"beach|lake|waterfall|fall|mountain|peak|cape|island|park|trail|"
    r"cliff|fjord|lagoon|bay|dune|forest|reserve|gorge|valley|hot spring|"
    r"canyon|glacier|nature|volcano|crater|river|coast|hike|viewpoint",
    re.I)
SKIP = re.compile(r"list of|\(disambiguation\)|airport|railway station", re.I)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8")) if Path(p).exists() else {}


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def haversine(a, b, c, d):
    R = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dphi = math.radians(c - a)
    dl = math.radians(d - b)
    x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def kind_from_desc(name, desc):
    t = f"{name} {desc}".lower()
    for key, lab in [("waterfall", "Waterfall"), ("lighthouse", "Lighthouse"),
                     ("monastery", "Monastery"), ("abbey", "Abbey"),
                     ("castle", "Castle"), ("church", "Church"),
                     ("museum", "Museum"), ("beach", "Beach"), ("lagoon", "Lagoon"),
                     ("lake", "Lake"), ("island", "Island"), ("cliff", "Cliffs"),
                     ("cape", "Cape"), ("national park", "National park"),
                     ("nature reserve", "Nature reserve"), ("village", "Village"),
                     ("town", "Town"), ("mountain", "Mountain"), ("peak", "Peak"),
                     ("fortress", "Fortress"), ("palace", "Palace"),
                     ("viewpoint", "Viewpoint"), ("river", "River")]:
        if key in t:
            return lab
    return "Attraction"


def geosearch(lat, lon, exclude_name=""):
    q = {"action": "query", "format": "json", "generator": "geosearch",
         "ggscoord": f"{lat}|{lon}", "ggsradius": GEO_RADIUS_M,
         "ggslimit": GEO_LIMIT, "ggsnamespace": 0,
         "prop": "coordinates|pageimages|description", "piprop": "thumbnail",
         "pithumbsize": 400, "colimit": "max"}
    url = WIKI_API + "?" + urllib.parse.urlencode(q)
    for back in (0, 5, 15):
        if back:
            time.sleep(back)
        try:
            req = urllib.request.Request(url, headers=UA)
            data = json.loads(urllib.request.urlopen(req, timeout=30).read())
            break
        except Exception as e:
            print(f"    geosearch retry ({e})")
    else:
        return []
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    exn = norm(exclude_name)
    for p in pages.values():
        title = p.get("title", "")
        if SKIP.search(title) or norm(title) == exn:
            continue
        coord = (p.get("coordinates") or [{}])[0]
        if "lat" not in coord:
            continue
        desc = p.get("description") or ""
        item = {
            "name": title, "kind": kind_from_desc(title, desc),
            "lat": coord["lat"], "lon": coord["lon"],
            "rate": 1, "src": "wikipedia_geosearch",
            "active": bool(ACTIVE_HINT.search(f"{title} {desc}")),
            "wiki": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
            "_dist": haversine(lat, lon, coord["lat"], coord["lon"]),
        }
        if desc:
            item["desc"] = desc[:120]
        thumb = (p.get("thumbnail") or {}).get("source")
        if thumb:
            item["img"] = thumb
        out.append(item)
    out.sort(key=lambda i: i["_dist"])
    for i in out:
        i.pop("_dist", None)
    return out


def merge_into(entry, new_items):
    """Append new_items to entry.items_full, dedupe by name, keep <=40."""
    if not entry:
        entry = {"source": "curated", "items": [], "items_full": []}
    entry.setdefault("items_full", [])
    entry.setdefault("items", [])
    entry.setdefault("source", "curated")
    have = {norm(i.get("name")) for i in entry["items_full"]}
    for it in new_items:
        n = norm(it.get("name"))
        if n and n not in have:
            entry["items_full"].append(it)
            have.add(n)
    entry["items_full"] = entry["items_full"][:40]
    # refresh name-only items list (top 8)
    entry["items"] = [{"name": i["name"], "kind": i.get("kind", "Attraction")}
                      for i in entry["items_full"][:8]]
    return entry


def main():
    cache = load(CACHE)
    dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]

    # 1) hand-curated agent files
    curated = {}
    for f in sorted(CUR_DIR.glob("curation_*.json")):
        try:
            j = load(f)
        except Exception as e:
            print(f"  skip {f.name}: {e}")
            continue
        for did, items in j.items():
            curated.setdefault(did, []).extend(items)
        print(f"  loaded {f.name}: {sum(len(v) for v in j.values())} POIs "
              f"across {len(j)} dests")

    for did, items in curated.items():
        # tag source and ensure fields
        for it in items:
            it.setdefault("src", "curated")
            it.setdefault("rate", 1)
        cache[did] = merge_into(cache.get(did), items)
        print(f"  curated {did}: now {len(cache[did]['items_full'])} items_full")

    # 2) geosearch top-up for anything still thin
    thin = [did for did, dd in dests.items()
            if len((cache.get(did) or {}).get("items_full") or []) < MIN_FULL
            and did not in curated
            and dd.get("lat") is not None]
    # include curated ones still short of TARGET
    for did in curated:
        if len((cache.get(did) or {}).get("items_full") or []) < MIN_FULL:
            thin.append(did)
    print(f"\nGeosearch top-up: {len(thin)} destinations still < {MIN_FULL}")
    for did in thin:
        dd = dests.get(did, {})
        lat = dd.get("city_lat") or dd.get("lat")
        lon = dd.get("city_lon") or dd.get("lon")
        if lat is None:
            continue
        found = geosearch(lat, lon, dd.get("city", ""))
        need = TARGET_FULL - len((cache.get(did) or {}).get("items_full") or [])
        cache[did] = merge_into(cache.get(did), found[:max(need, 0)])
        print(f"  {did} ({dd.get('city')}): +{min(len(found), max(need,0))} -> "
              f"{len(cache[did]['items_full'])} items_full")
        time.sleep(0.5)

    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nWrote {CACHE}")


if __name__ == "__main__":
    main()
