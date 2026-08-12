"""harvest_pois_osm.py - maximal sightseeing-POI coverage from OpenStreetMap.

The existing pipeline caps items_full at 52 per destination (40 OpenTripMap
sights + 12 "get active"). For a real city that throws away most of what is
worth seeing: Barcelona alone has ~465 named, quality-tagged OSM POIs within
4 km beyond the 52 already stored (175 of them linked to Wikidata/Wikipedia).

This harvest pulls that long tail directly from OSM (Overpass), keyless and
free, for EVERY destination, and MERGES it into items_full:

  - existing items_full are kept untouched (they carry the OTM rate-3 "must see"
    tier plus enriched img/desc/pop cards) and always rank first;
  - net-new OSM POIs are appended, deduped by folded name, ranked
    Wikidata/Wikipedia-linked first, then by tag importance;
  - the merged list is capped at CAP_MERGED (150) per destination.

Taxonomy is SIGHTSEEING only - attractions, museums/culture, historic sites,
parks/nature, places of worship, theatres, markets, viewpoints, beaches. It
deliberately excludes commercial POIs (restaurants, shops, hotels): the app
prices food/lodging separately and those would be noise on the day-planner map.
OSM POIs keep rate <= 2 so they never enter the rate-3 must-see tier, exactly
like harvest_osm_wikidata.py.

Resumable: cache/osm_pois_full.json holds picked rows per destination, saved
after each query, so a re-run continues where it stopped. Endpoints rotate with
backoff. Patches app_data.json master on `apply`. ASCII-clean, no em dashes.

Usage:
    python harvest_pois_osm.py harvest      # query OSM for every dest (resumable)
    python harvest_pois_osm.py apply        # merge the cache into items_full
    python harvest_pois_osm.py all          # harvest then apply (default)
    python harvest_pois_osm.py harvest 300  # cap this run to 300 dests, then stop
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "osm_pois_full.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}
ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
BACKOFFS = [8, 20, 45]
CAP_MERGED = 150            # final items_full size per destination
OUT_LIMIT = 500            # Overpass element cap per query
SLEEP = 1.3                 # politeness between queries

# OSM tag -> (display kind, base rate 0..2, is "get active" POI). Sightseeing
# only; a Wikidata/Wikipedia link bumps rate by 1 (still capped at 2).
KIND_MAP = {
    ("tourism", "attraction"): ("Attraction", 2, False),
    ("tourism", "museum"): ("Museum", 1, False),
    ("tourism", "gallery"): ("Gallery", 1, False),
    ("tourism", "artwork"): ("Artwork", 1, False),
    ("tourism", "viewpoint"): ("Viewpoint", 1, True),
    ("tourism", "zoo"): ("Zoo", 1, True),
    ("tourism", "aquarium"): ("Aquarium", 1, True),
    ("tourism", "theme_park"): ("Theme park", 1, True),
    ("historic", "castle"): ("Castle", 2, False),
    ("historic", "fort"): ("Fort", 2, False),
    ("historic", "fortress"): ("Fortress", 2, False),
    ("historic", "archaeological_site"): ("Archaeological site", 2, False),
    ("historic", "monument"): ("Monument", 1, False),
    ("historic", "memorial"): ("Memorial", 1, False),
    ("historic", "ruins"): ("Ruins", 1, False),
    ("historic", "city_gate"): ("City gate", 1, False),
    ("historic", "tower"): ("Tower", 1, False),
    ("historic", "monastery"): ("Monastery", 1, False),
    ("historic", "church"): ("Church", 1, False),
    ("historic", "palace"): ("Palace", 2, False),
    ("historic", "manor"): ("Manor", 1, False),
    ("historic", "aqueduct"): ("Aqueduct", 1, False),
    ("leisure", "park"): ("Park", 1, True),
    ("leisure", "garden"): ("Garden", 1, True),
    ("leisure", "nature_reserve"): ("Nature reserve", 1, True),
    ("natural", "beach"): ("Beach", 1, True),
    ("natural", "peak"): ("Peak", 1, True),
    ("natural", "cave_entrance"): ("Cave", 1, True),
    ("natural", "volcano"): ("Volcano", 1, True),
    ("waterway", "waterfall"): ("Waterfall", 1, True),
    ("amenity", "place_of_worship"): ("Place of worship", 1, False),
    ("amenity", "theatre"): ("Theatre", 1, False),
    ("amenity", "arts_centre"): ("Arts centre", 1, False),
    ("amenity", "marketplace"): ("Market", 1, True),
    ("man_made", "lighthouse"): ("Lighthouse", 1, True),
    ("man_made", "tower"): ("Tower", 1, True),
    ("building", "cathedral"): ("Cathedral", 2, False),
    ("building", "church"): ("Church", 1, False),
}
# name folding for dedupe (matches app-side folding: strip accents/case)
_FOLD = str.maketrans({"ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "ß": "ss"})


def fold(name):
    import unicodedata
    s = (name or "").translate(_FOLD)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def load_cache():
    return load(CACHE) if CACHE.exists() else {}


def save_cache(c):
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")


def overpass(query):
    for ep in ENDPOINTS:
        for i, back in enumerate([0] + BACKOFFS):
            if back:
                time.sleep(back)
            try:
                req = urllib.request.Request(
                    ep, data=urllib.parse.urlencode({"data": query}).encode(), headers=UA)
                with urllib.request.urlopen(req, timeout=120) as r:
                    return json.loads(r.read().decode("utf-8")).get("elements", [])
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                code = getattr(e, "code", None)
                if code in (400, 429, 504) or isinstance(e, (urllib.error.URLError, TimeoutError)):
                    continue          # retry / next endpoint
                return None
    return None


# Node-only, explicit tag values. The catch-all `[historic]` plus ways/relations
# (nwr + out center) is 10x heavier and times out in dense cities; nodes carry
# the overwhelming majority of named sights and resolve in seconds even in Rome.
_HISTORIC = ("castle|fort|fortress|archaeological_site|monument|memorial|ruins|"
            "city_gate|tower|monastery|church|palace|manor|aqueduct|building")


def query_for(lat, lon, radius):
    return f"""[out:json][timeout:55];
(
  node[tourism~"attraction|museum|gallery|artwork|viewpoint|zoo|aquarium|theme_park"](around:{radius},{lat},{lon});
  node[historic~"{_HISTORIC}"](around:{radius},{lat},{lon});
  node[leisure~"park|garden|nature_reserve"](around:{radius},{lat},{lon});
  node[natural~"beach|peak|cave_entrance|volcano"](around:{radius},{lat},{lon});
  node[waterway=waterfall](around:{radius},{lat},{lon});
  node[amenity~"place_of_worship|theatre|arts_centre|marketplace"](around:{radius},{lat},{lon});
  node[man_made~"lighthouse|tower"](around:{radius},{lat},{lon});
);
out {OUT_LIMIT};"""


def classify(tags):
    for (k, v), meta in KIND_MAP.items():
        if tags.get(k) == v:
            return meta
    return None


def pick(els):
    rows, seen = [], set()
    for e in els or []:
        t = e.get("tags") or {}
        name = t.get("name") or t.get("name:en")
        if not name:
            continue
        f = fold(name)
        if not f or f in seen:
            continue
        meta = classify(t)
        if not meta:
            continue
        kind, rate, active = meta
        plat = e.get("lat") or (e.get("center") or {}).get("lat")
        plon = e.get("lon") or (e.get("center") or {}).get("lon")
        if plat is None or plon is None:
            continue
        linked = bool(t.get("wikidata") or t.get("wikipedia"))
        seen.add(f)
        rows.append({
            "name": name, "kind": kind,
            "lat": round(plat, 5), "lon": round(plon, 5),
            "rate": min(2, rate + (1 if (linked and rate < 2) else 0)),
            "active": active, "src": "osm", "_linked": linked,
        })
    # notable (wikidata/wikipedia-linked) first, then by rate
    rows.sort(key=lambda r: (r["_linked"], r["rate"]), reverse=True)
    return rows


def radius_for(d):
    # Kept modest: node queries in dense cities balloon past ~4.5 km. Big cities
    # already saturate 600 named POIs within 4.5 km; villages get their whole area.
    cats = set(d.get("categories") or [])
    return 4500 if (cats & {"city", "capital"}) else 4000


def harvest(dests, cache, limit=None):
    todo = [(i, d) for i, d in dests.items()
            if i not in cache and (d.get("city_lat") or d.get("lat")) is not None]
    if limit:
        todo = todo[:limit]
    print(f"Harvest: {len(todo)} destinations to query "
          f"({len(cache)} already cached of {len(dests)})")
    for n, (did, d) in enumerate(todo, 1):
        lat = d.get("city_lat") or d["lat"]
        lon = d.get("city_lon") or d["lon"]
        els = overpass(query_for(lat, lon, radius_for(d)))
        if els is None:
            print(f"  [{n}/{len(todo)}] {d['city']}: query failed, will retry next run")
            continue
        rows = pick(els)
        cache[did] = rows
        save_cache(cache)
        linked = sum(1 for r in rows if r.get("_linked"))
        print(f"  [{n}/{len(todo)}] {d['city']}, {d['country']}: "
              f"{len(rows)} quality POIs ({linked} wiki-linked)")
        time.sleep(SLEEP)
    return cache


def apply(dests, cache):
    grown = 0
    added_total = 0
    for did, rows in cache.items():
        d = dests.get(did)
        if not d or not rows:
            continue
        a = d.setdefault("activities", {}) or {}
        if a is None:
            a = {}
            d["activities"] = a
        existing = a.get("items_full") or []
        have = {fold(it.get("name")) for it in existing}
        add = []
        for r in rows:
            f = fold(r["name"])
            if f in have:
                continue
            have.add(f)
            add.append({k: v for k, v in r.items() if k != "_linked"})
        if not add:
            continue
        merged = existing + add
        a["items_full"] = merged[:CAP_MERGED]
        real_added = len(a["items_full"]) - len(existing)
        a["osm_full_added"] = real_added
        # keep the name-only fallback list modestly topped up too
        items = a.get("items") or []
        inames = {fold(it.get("name")) for it in items}
        for r in add:
            if len(items) >= 12:
                break
            if fold(r["name"]) not in inames:
                items.append({"name": r["name"], "kind": r["kind"]})
                inames.add(fold(r["name"]))
        a["items"] = items
        a["source"] = a.get("source") or "osm"
        if real_added > 0:
            grown += 1
            added_total += real_added
    print(f"Apply: grew {grown} destinations by {added_total} POIs "
          f"(merged cap {CAP_MERGED})")
    return grown


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
    cache = load_cache()

    if what in ("all", "harvest"):
        dests = load(MASTER)["destinations"]
        cache = harvest(dests, cache, limit)

    if what in ("all", "apply"):
        data = load(MASTER)                 # re-read fresh (concurrent safety)
        dests = data["destinations"]
        apply(dests, cache)
        tot = sum(len((d.get("activities") or {}).get("items_full") or [])
                  for d in dests.values())
        print(f"  total items_full POIs now: {tot}")
        data["meta"].setdefault("data_sources", {})["osm_pois"] = {
            "provider": "OpenStreetMap via Overpass API (comprehensive sightseeing pull)",
            "license": "ODbL 1.0 (c) OpenStreetMap contributors",
            "used_for": "maximal items_full sightseeing coverage (attractions, culture, historic, nature, worship)",
            "cap_per_dest": CAP_MERGED,
        }
        MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"  wrote {MASTER}")
        print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
