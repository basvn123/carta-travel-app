"""
harvest_activities.py - the "things to do" layer (schema v10).

For every destination, fetch a short list of the top real, named attractions
(sights / museums / landmarks / parks) near its coordinates and store them in
`dest.activities`. Same data-driven, citable, free ethos as the rest of the app.

TWO sources, auto-selected:

  1. OpenTripMap (PREFERRED - the user's pick). Free POI API with an importance
     `rate` per place. Needs a free key (https://opentripmap.io/product ->
     dashboard). Provide it via the OPENTRIPMAP_KEY env var OR a one-line file
     `cache/otm_key.txt`. Endpoint:
       GET .../0.1/en/places/radius?radius&lon&lat&kinds=interesting_places
           &rate=2&format=json&limit=50&apikey=...

  2. Wikipedia GeoSearch (FALLBACK - no key). Real nearby Wikipedia articles with
     their short Wikidata descriptions, filtered to attraction-like places. Lets
     the feature ship today; re-run with a key to upgrade to OpenTripMap data.

Both paths emit the SAME shape so the app never cares which ran:
    dest.activities = {
      "source": "opentripmap" | "wikipedia_geosearch",
      "items": [ {"name", "kind", "link"?}, ... up to TOP_N ]
    }

Phases (idempotent, resumable - mirrors reharvest_flights.py / harvest_images.py):
  harvest()  -> cache/activities.json (one entry per dest id)
  patch()    -> writes dest.activities into both app_data.json files

Run:  python harvest_activities.py            # harvest then patch
      python harvest_activities.py harvest    # harvest only
      python harvest_activities.py patch      # patch only (from cache)
      python harvest_activities.py refresh    # drop cache, re-fetch all, patch

ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).parent
CACHE = ROOT / "cache" / "activities.json"
KEY_FILE = ROOT / "cache" / "otm_key.txt"
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
PRIMARY = TARGETS[0]

TOP_N = 8
RADIUS_M = 12000
DELAY_S = 0.25
BACKOFFS = [5, 15, 30]
HEADERS = {"User-Agent": "CartaTravelApp/1.0 (portfolio project)",
           "Accept": "application/json"}

OTM_BASE = "https://api.opentripmap.com/0.1/en/places/radius"
WIKI_API = "https://en.wikipedia.org/w/api.php"

# ---------------------------------------------------------------------------
# OpenTripMap "kinds" -> a friendly single-word category for the UI.
# ---------------------------------------------------------------------------
KIND_LABEL = [
    ("cathedral", "Cathedral"), ("church", "Church"), ("monasteries", "Monastery"),
    ("mosque", "Mosque"), ("synagogue", "Synagogue"), ("castle", "Castle"),
    ("fortress", "Fortress"), ("fort", "Fort"), ("palace", "Palace"),
    ("museum", "Museum"), ("galler", "Gallery"), ("theatre", "Theatre"),
    ("bridge", "Bridge"), ("tower", "Tower"), ("square", "Square"),
    ("monument", "Monument"), ("memorial", "Memorial"), ("statue", "Statue"),
    ("archaeolog", "Ancient site"), ("ruins", "Ruins"), ("historic", "Historic site"),
    ("garden", "Garden"), ("park", "Park"), ("nature_reserve", "Nature"),
    ("view_point", "Viewpoint"), ("beach", "Beach"), ("lake", "Lake"),
    ("waterfall", "Waterfall"), ("cave", "Cave"), ("mountain", "Mountain"),
    ("zoo", "Zoo"), ("aquarium", "Aquarium"), ("amusement", "Park"),
    ("winer", "Winery"), ("brewer", "Brewery"), ("market", "Market"),
    ("architecture", "Landmark"), ("interesting_places", "Sight"),
]

# Fallback (Wikipedia) - keep only articles whose description reads like a place
# worth visiting; drop transport/admin noise.
WIKI_KEEP = ("church", "cathedral", "basilica", "abbey", "monaster", "chapel",
             "castle", "fortress", "palace", "citadel", "tower", "gate",
             "museum", "gallery", "theatre", "opera", "library", "monument",
             "memorial", "statue", "fountain", "square", "plaza", "market",
             "park", "garden", "zoo", "aquarium", "bridge", "cathedral",
             "beach", "lake", "waterfall", "mountain", "hill", "viewpoint",
             "old town", "historic", "archaeolog", "ruins", "roman", "temple",
             "harbour", "harbor", "promenade", "lighthouse", "spa", "thermal")
WIKI_DROP = ("railway station", "metro station", "tram stop", "bus station",
             "airport", "motorway", "highway", "road in", "street in",
             "neighbourhood", "neighborhood", "district of", "suburb",
             "administrative", "municipality", "university", "hospital",
             "football", "stadium", "company", "river in")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def otm_key():
    k = os.environ.get("OPENTRIPMAP_KEY")
    if not k and KEY_FILE.exists():
        k = KEY_FILE.read_text(encoding="utf-8").strip()
    return k or None


def _get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            time.sleep(back)
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if i == len(BACKOFFS):
                print(f"    ! give up: {e}")
                return None
    return None


def label_for_kinds(kinds_csv):
    s = (kinds_csv or "").lower()
    for needle, label in KIND_LABEL:
        if needle in s:
            return label
    return "Sight"


# ---------------------------------------------------------------------------
# Source 1: OpenTripMap
# ---------------------------------------------------------------------------
def otm_activities(lat, lon, key):
    url = OTM_BASE + "?" + urllib.parse.urlencode({
        "radius": RADIUS_M, "lon": lon, "lat": lat,
        "kinds": "interesting_places", "rate": "2", "format": "json",
        "limit": 60, "apikey": key,
    })
    data = _get(url)
    if not isinstance(data, list):
        return None
    seen, items = set(), []
    # sort by rate descending ("3h" > "3" > "2h" > "2"); rate is like "1".."7" + 'h'
    def rate_val(r):
        s = str(r.get("rate", "0"))
        base = int("".join(c for c in s if c.isdigit()) or 0)
        return base + (0.5 if "h" in s else 0)
    for p in sorted(data, key=rate_val, reverse=True):
        name = (p.get("name") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        items.append({"name": name, "kind": label_for_kinds(p.get("kinds"))})
        if len(items) >= TOP_N:
            break
    return {"source": "opentripmap", "items": items} if items else None


# ---------------------------------------------------------------------------
# Source 2: Wikipedia GeoSearch (no key)
# ---------------------------------------------------------------------------
def wiki_activities(lat, lon, city):
    url = WIKI_API + "?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "geosearch", "ggscoord": f"{lat}|{lon}",
        "ggsradius": 10000, "ggslimit": 50, "ggsnamespace": "0",
        "prop": "description|info", "inprop": "url",
    })
    data = _get(url)
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or []
    cityl = (city or "").lower()
    scored = []
    for p in pages:
        title = p.get("title") or ""
        desc = (p.get("description") or "").lower()
        if not title or title.lower() == cityl:
            continue
        if any(d in desc for d in WIKI_DROP):
            continue
        keep = any(k in desc for k in WIKI_KEEP)
        if not keep:
            continue
        kind = p.get("description") or "Sight"
        # Trim the description to a short kind label (first clause).
        kind = kind.split(" in ")[0].split(",")[0].strip().title()[:28]
        scored.append({"name": title, "kind": kind or "Sight",
                       "link": p.get("fullurl")})
    items = scored[:TOP_N]
    return {"source": "wikipedia_geosearch", "items": items} if items else None


def harvest(dests, resume=True):
    key = otm_key()
    print("Activities source:",
          "OpenTripMap (key found)" if key else
          "Wikipedia GeoSearch fallback (no OPENTRIPMAP_KEY / cache/otm_key.txt)")
    cache = {}
    if resume and CACHE.exists():
        cache = load_json(CACHE)
    todo = [(i, d) for i, d in dests.items()
            if d.get("lat") is not None and (i not in cache or not cache[i])]
    print(f"Harvesting activities: {len(todo)} to fetch, {len(cache)} cached")
    for n, (did, d) in enumerate(todo, 1):
        lat, lon = d["lat"], d["lon"]
        res = None
        if key:
            res = otm_activities(lat, lon, key)
        if not res:
            res = wiki_activities(lat, lon, d.get("city"))
        cache[did] = res
        cnt = len(res["items"]) if res else 0
        print(f"  [{n}/{len(todo)}] {d.get('city')}, {d.get('country')}: "
              f"{cnt} ({res['source'] if res else 'MISS'})")
        if n % 25 == 0:
            CACHE.parent.mkdir(exist_ok=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(DELAY_S)
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    hits = sum(1 for v in cache.values() if v)
    print(f"Harvest done: {hits}/{len(cache)} have activities. Cache: {CACHE}")
    return cache


def patch(cache=None):
    if cache is None:
        cache = load_json(CACHE) if CACHE.exists() else {}
    for path in TARGETS:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        data = load_json(path)
        dests = data.get("destinations", {})
        n_act = 0
        srcs = {}
        for did, d in dests.items():
            rec = cache.get(did)
            if rec and rec.get("items"):
                d["activities"] = rec
                n_act += 1
                srcs[rec["source"]] = srcs.get(rec["source"], 0) + 1
            else:
                d["activities"] = None
        data.setdefault("meta", {})["activities_model"] = {
            "providers": srcs,
            "top_n": TOP_N, "radius_m": RADIUS_M,
            "note": "OpenTripMap when OPENTRIPMAP_KEY set; else Wikipedia GeoSearch",
            "coverage": f"{n_act}/{len(dests)}",
        }
        data["meta"]["schema_version"] = max(10, data["meta"].get("schema_version", 0))
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: {n_act}/{len(dests)} dests have activities "
              f"(sources: {srcs})")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    data = load_json(PRIMARY)
    dests = data.get("destinations", {})
    if cmd == "refresh" and CACHE.exists():
        CACHE.unlink()
    cache = None
    if cmd in ("all", "harvest", "refresh"):
        cache = harvest(dests, resume=(cmd != "refresh"))
    if cmd in ("all", "patch", "refresh"):
        patch(cache)


if __name__ == "__main__":
    main()
