"""harvest_osm_wikidata.py - a second, non-Wikipedia data layer.

Two independent open sources feed this, on top of the existing Wikipedia /
Wikivoyage / OpenTripMap pipeline:

  1. OpenStreetMap (Overpass API)  ->  real POIs for destinations whose
     items_full is thin (< MIN_FULL). Fills the Day Planner's map pins for
     places OpenTripMap/Wikivoyage barely covered (e.g. Gallipoli, Kerry).
     Each OSM POI carries lat/lon and src="osm"; rate is capped at 2 so it
     never lands in the rate-3 "must see" tier reserved for OTM importance.

  2. Wikidata (Special:EntityData)  ->  an independent notability signal per
     destination: `wikidata.sitelinks` (how many language Wikipedias cover it -
     a fame proxy that does NOT depend on pageviews), plus P18 image and a
     heritage-designation flag (P1435). Stored under dest["wikidata"]; a
     cross-check for the rating layer's fame component and an image backstop.

Idempotent + resumable (cache/osm_wikidata.json). Patches app_data.json master
and continent-app/public copy. ASCII-clean, no em dashes, per project style.

Usage:
    python harvest_osm_wikidata.py osm         # fill thin items_full from OSM
    python harvest_osm_wikidata.py wikidata    # add wikidata block to new gems
    python harvest_osm_wikidata.py all         # both (default)
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
PUBLIC = ROOT / "continent-app" / "public" / "app_data.json"
CACHE = ROOT / "cache" / "osm_wikidata.json"
NEW_GEMS = ROOT / "app_data" / "new_gems_2026_07c.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)"}
OVERPASS = "https://overpass-api.de/api/interpreter"
WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{}.json"
WIKI_API = "https://en.wikipedia.org/w/api.php"

MIN_FULL = 6        # dests with fewer items_full than this get an OSM top-up
MAX_FULL = 20       # cap items_full after an OSM fill
BACKOFFS = [5, 15, 40]

# OSM tag -> (display kind, rate 0..2, is "get active" POI)
KIND_MAP = {
    ("historic", "castle"): ("Castle", 2, False),
    ("historic", "archaeological_site"): ("Archaeological site", 2, False),
    ("historic", "monument"): ("Monument", 1, False),
    ("historic", "ruins"): ("Ruins", 1, False),
    ("tourism", "attraction"): ("Attraction", 2, False),
    ("tourism", "museum"): ("Museum", 1, False),
    ("tourism", "artwork"): ("Artwork", 1, False),
    ("tourism", "viewpoint"): ("Viewpoint", 1, True),
    ("natural", "beach"): ("Beach", 1, True),
    ("natural", "peak"): ("Peak", 1, True),
    ("natural", "cave_entrance"): ("Cave", 1, True),
    ("waterway", "waterfall"): ("Waterfall", 1, True),
    ("leisure", "nature_reserve"): ("Nature reserve", 1, True),
}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def load_cache():
    if CACHE.exists():
        return load(CACHE)
    return {"osm": {}, "wikidata": {}}


def save_cache(c):
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")


def http(url, data=None):
    for i, back in enumerate([0] + BACKOFFS):
        if back:
            time.sleep(back)
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if i == len(BACKOFFS):
                print(f"    ! give up: {e}")
                return None
    return None


# --------------------------------------------------------------------------- #
# 1. OpenStreetMap (Overpass)                                                  #
# --------------------------------------------------------------------------- #
def overpass_pois(lat, lon, radius=5000):
    q = f"""[out:json][timeout:60];
(
  node[tourism~"attraction|viewpoint|museum|artwork"](around:{radius},{lat},{lon});
  node[historic~"castle|monument|ruins|archaeological_site"](around:{radius},{lat},{lon});
  node[natural~"beach|peak|cave_entrance"](around:{radius},{lat},{lon});
  way[natural=beach](around:{radius},{lat},{lon});
  node[waterway=waterfall](around:{radius},{lat},{lon});
  way[leisure=nature_reserve](around:{radius},{lat},{lon});
);
out center 80;"""
    j = http(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode())
    return (j or {}).get("elements", [])


def classify(tags):
    for (k, v), meta in KIND_MAP.items():
        if tags.get(k) == v:
            return meta
    return None


def osm_items(lat, lon):
    els = overpass_pois(lat, lon)
    rows = []
    seen = set()
    for e in els:
        t = e.get("tags") or {}
        name = t.get("name") or t.get("name:en")
        if not name or name.lower() in seen:
            continue
        meta = classify(t)
        if not meta:
            continue
        kind, rate, active = meta
        plat = e.get("lat") or (e.get("center") or {}).get("lat")
        plon = e.get("lon") or (e.get("center") or {}).get("lon")
        if plat is None:
            continue
        # notability nudge: a POI OSM has linked to Wikidata/Wikipedia is a real
        # sight, not a bench - bump it above unlinked nodes when we rank/cut.
        linked = bool(t.get("wikidata") or t.get("wikipedia"))
        seen.add(name.lower())
        rows.append({
            "name": name, "kind": kind, "lat": round(plat, 5), "lon": round(plon, 5),
            "rate": rate + (1 if (linked and rate < 2) else 0), "active": active,
            "src": "osm", "_linked": linked,
        })
    # rank: linked first, then rate, keep the best MAX_FULL
    rows.sort(key=lambda r: (r["_linked"], r["rate"]), reverse=True)
    for r in rows:
        r.pop("_linked", None)
    return rows[:MAX_FULL]


def fill_thin_from_osm(dests, cache):
    targets = []
    for did, d in dests.items():
        a = d.get("activities") or {}
        if len(a.get("items_full") or []) < MIN_FULL and d.get("lat") is not None:
            targets.append((did, d))
    print(f"OSM fill: {len(targets)} thin destinations (items_full < {MIN_FULL})")
    for n, (did, d) in enumerate(targets, 1):
        if did in cache["osm"]:
            rows = cache["osm"][did]
        else:
            lat = d.get("city_lat") or d["lat"]
            lon = d.get("city_lon") or d["lon"]
            rows = osm_items(lat, lon)
            cache["osm"][did] = rows
            save_cache(cache)
            time.sleep(1.0)
        print(f"  [{n}/{len(targets)}] {d['city']}, {d['country']}: +{len(rows)} OSM POIs")
    return cache


def apply_osm(dests, cache):
    filled = 0
    for did, rows in cache["osm"].items():
        d = dests.get(did)
        if not d or not rows:
            continue
        a = d.setdefault("activities", {}) or {}
        if a is None:
            a = {}
            d["activities"] = a
        existing = a.get("items_full") or []
        have = {(it.get("name") or "").lower() for it in existing}
        add = [r for r in rows if r["name"].lower() not in have]
        merged = existing + add
        a["items_full"] = merged[:MAX_FULL]
        # keep the name-only list in sync (fallback for non-map views)
        items = a.get("items") or []
        inames = {(it.get("name") or "").lower() for it in items}
        for r in add:
            if len(items) >= 8:
                break
            if r["name"].lower() not in inames:
                items.append({"name": r["name"], "kind": r["kind"]})
        a["items"] = items
        a["source"] = (a.get("source") or "osm")
        a["osm_filled"] = len(add)
        if add:
            filled += 1
    print(f"OSM apply: topped up {filled} destinations")
    return filled


# --------------------------------------------------------------------------- #
# 2. Wikidata                                                                  #
# --------------------------------------------------------------------------- #
def qid_for_title(title):
    p = {"action": "query", "prop": "pageprops", "titles": title,
         "redirects": 1, "format": "json"}
    j = http(WIKI_API + "?" + urllib.parse.urlencode(p))
    if not j:
        return None
    pages = (j.get("query") or {}).get("pages") or {}
    for pg in pages.values():
        qid = (pg.get("pageprops") or {}).get("wikibase_item")
        if qid:
            return qid
    return None


def wikidata_block(qid):
    j = http(WIKIDATA_ENTITY.format(qid))
    if not j:
        return None
    e = (j.get("entities") or {}).get(qid) or {}
    claims = e.get("claims") or {}
    img = None
    if "P18" in claims:
        try:
            img = claims["P18"][0]["mainsnak"]["datavalue"]["value"]
        except (KeyError, IndexError, TypeError):
            img = None
    return {
        "qid": qid,
        "sitelinks": len(e.get("sitelinks") or {}),
        "heritage": "P1435" in claims,       # heritage designation
        "protected": "P3018" in claims or "P1435" in claims,
        "image_p18": img,
        "source": "wikidata",
    }


def enrich_wikidata(dests, cache, ids):
    print(f"Wikidata: {len(ids)} destinations")
    for n, did in enumerate(ids, 1):
        d = dests.get(did)
        if not d:
            continue
        if did in cache["wikidata"]:
            continue
        title = (d.get("image") or {}).get("credit") or d.get("city")
        qid = qid_for_title(title)
        block = wikidata_block(qid) if qid else None
        cache["wikidata"][did] = block or {"qid": None, "sitelinks": 0,
                                           "heritage": False, "source": "wikidata"}
        b = cache["wikidata"][did]
        print(f"  [{n}/{len(ids)}] {d['city']}: {b.get('qid')} "
              f"sitelinks={b.get('sitelinks')} heritage={b.get('heritage')}")
        save_cache(cache)
        time.sleep(0.4)
    return cache


def apply_wikidata(dests, cache):
    n = 0
    for did, block in cache["wikidata"].items():
        d = dests.get(did)
        if d and block and block.get("qid"):
            d["wikidata"] = {k: block[k] for k in
                             ("qid", "sitelinks", "heritage", "protected", "image_p18", "source")
                             if k in block}
            n += 1
    print(f"Wikidata apply: {n} destinations carry a wikidata block")
    return n


# --------------------------------------------------------------------------- #
def write_out(data):
    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}")


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    data = load(MASTER)
    dests = data["destinations"]
    cache = load_cache()

    if what in ("all", "osm"):
        cache = fill_thin_from_osm(dests, cache)
        apply_osm(dests, cache)
        data["meta"].setdefault("data_sources", {})["osm"] = {
            "provider": "OpenStreetMap via Overpass API",
            "license": "ODbL 1.0 (c) OpenStreetMap contributors",
            "used_for": "items_full POIs for destinations OpenTripMap/Wikivoyage covered thinly",
        }

    if what in ("all", "wikidata"):
        new_ids = [f"gem:{g['slug']}" for g in load(NEW_GEMS)]
        cache = enrich_wikidata(dests, cache, new_ids)
        apply_wikidata(dests, cache)
        data["meta"].setdefault("data_sources", {})["wikidata"] = {
            "provider": "Wikidata (Special:EntityData)",
            "license": "CC0 1.0",
            "used_for": "independent fame signal (sitelinks), heritage flag, P18 image backstop",
        }

    write_out(data)
    print("done.")


if __name__ == "__main__":
    main()
