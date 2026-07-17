"""
enrich_images_web.py - second-pass POI image fill for items the Commons
geosearch (enrich_images_commons.py) could not match.

For every items_full POI that still has no img (all have coords):
  1. If it carries a `wiki` link -> pull that exact article's lead image.
  2. Local-language Wikipedia geosearch (one generator=geosearch+pageimages
     request), pick the nearby article whose title shares >=1 name token
     with the POI, best token overlap then nearest.
  3. English Wikipedia as a fallback for the same.

Only name-matched articles are accepted, so images stay on-topic (no
coordinate-lucky mismatches). Natural features use a wide radius; built POIs
a tight one. Thumbnails are upload.wikimedia.org URLs (hotlinkable, CC).

Politeness: shared UA, <=6 workers, backoff on 429/5xx.
Resumable: app_data/web_img_cache.json keyed by rounded coords + name, so a
POI that repeats across destinations is fetched once.

Run:  python enrich_images_web.py          # fetch (resumes) then apply
      python enrich_images_web.py apply     # cache -> app_data.json only
      python enrich_images_web.py stats      # coverage, no network
ASCII-clean per project convention.
"""
import json
import math
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "app_data" / "web_img_cache.json"

UA = ("CartaTravelApp-enrich/1.0 "
      "(https://github.com/basvn123; contact: bas.vannieuwenhuyse123@gmail.com)")
HEADERS = {"User-Agent": UA, "Accept": "application/json"}

MAX_WORKERS = 6
SAVE_EVERY = 200
THUMB_PX = 640

# country iso2 -> primary Wikipedia language edition
ISO_LANG = {
    "ES": "es", "IT": "it", "FR": "fr", "DE": "de", "AT": "de", "CH": "de",
    "PT": "pt", "NL": "nl", "BE": "nl", "PL": "pl", "CZ": "cs", "SK": "sk",
    "HU": "hu", "GR": "el", "HR": "hr", "SI": "sl", "RO": "ro", "BG": "bg",
    "RS": "sr", "BA": "bs", "MK": "mk", "AL": "sq", "ME": "sr", "SE": "sv",
    "NO": "no", "DK": "da", "FI": "fi", "EE": "et", "LV": "lv", "LT": "lt",
    "IE": "en", "GB": "en", "MT": "mt", "CY": "el", "LU": "fr", "TR": "tr",
    "MA": "fr", "IS": "is", "UA": "uk",
}
NATURE = {"Peak", "Nature reserve", "Lake", "Glacier", "Canyon", "Waterfall",
          "Dunes", "Viewpoint", "Ancient site", "Mountain"}
NATURE_RADIUS = 6000
BUILT_RADIUS = 800

JUNK = re.compile(
    r"map|logo|coat[_ ]of[_ ]arms|wappen|escudo|plaque|karte|diagram|"
    r"[-_]loc\b|locator|location[_ ]map|positionskarte|mapa|\.svg\.|"
    r"bandera|bandiera|flagge|drapeau|\bflag\b|blason|blazon|stemma|seal\b|"
    r"siegel|gonfalone|\.svg$|\.tif|\.pdf|\.ogg|\.webm", re.I)

# generic place-type words (multi-lingual) that must NOT be the token a match
# hinges on -- otherwise "Church of X" wrongly matches any nearby "Church of Y".
GENERIC = {
    "church", "iglesia", "igreja", "chiesa", "kirche", "eglise", "kerk",
    "kostel", "biserica", "crkva", "chapel", "capilla", "capela", "cappella",
    "kapelle", "chapelle", "ermita", "cathedral", "catedral", "cattedrale",
    "cathedrale", "kathedrale", "duomo", "basilica", "basilique",
    "museo", "museu", "museum", "musee", "muzeum", "museet",
    "plaza", "placa", "piazza", "platz", "place", "plein", "plac", "namesti",
    "palacio", "palau", "palazzo", "palais", "palast", "palace", "paleis",
    "castillo", "castell", "castello", "chateau", "schloss", "castle",
    "kasteel", "zamek", "burg", "kastel",
    "monasterio", "monastero", "monastere", "kloster", "monastery",
    "convento", "couvent", "convent", "abadia", "abbaye", "abbazia", "abbey",
    "parque", "parc", "park", "parco", "jardin", "jardim", "giardino",
    "garten", "garden", "tuin", "puente", "pont", "ponte", "bridge", "brucke",
    "torre", "tour", "turm", "tower", "toren", "teatro", "teatre", "theatre",
    "theater", "teatr", "mercado", "mercat", "mercato", "market", "markt",
    "fuente", "font", "fontaine", "fontana", "brunnen", "fountain", "calle",
    "rue", "strasse", "street", "avenida", "avenue", "centro", "center",
    "centre", "centrum", "ciudad", "cidade", "citta", "stadt", "ville",
    "estacion", "station", "gare", "bahnhof", "iglesias",
}

_cache_lock = threading.Lock()
_dirty = 0


def get_json(url):
    for dl in (0, 5, 15, 45):
        if dl:
            time.sleep(dl)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After")
                if ra:
                    try:
                        time.sleep(min(float(ra), 90))
                    except ValueError:
                        pass
                continue
            return None
        except Exception:
            continue
    return None


def norm_tokens(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return {t for t in re.split(r"[^a-z0-9]+", s.lower()) if len(t) >= 4}


def haversine(la1, lo1, la2, lo2):
    r = 6371000.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def ok_thumb(url):
    return bool(url) and not JUNK.search(url)


def geo_pick(lat, lon, name, drop, lang, radius):
    """One request: nearby articles + their lead thumbnails. Accept only when
    the POI shares a DISTINCTIVE token (proper noun) with the article -- city,
    country and generic place-type words are stripped from both sides first, so
    a hit never hinges on 'Madrid', 'church' or the like."""
    poi = norm_tokens(name) - drop - GENERIC
    if not poi:
        return None
    url = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json"
           f"&generator=geosearch&ggscoord={lat}%7C{lon}&ggsradius={radius}"
           "&ggslimit=20&prop=pageimages%7Ccoordinates"
           f"&piprop=thumbnail&pithumbsize={THUMB_PX}")
    data = get_json(url)
    pages = ((data or {}).get("query") or {}).get("pages") or {}
    best, best_score = None, -1
    for p in pages.values():
        art = norm_tokens(p.get("title", "")) - drop
        shared = poi & art
        if not shared:
            continue
        th = (p.get("thumbnail") or {}).get("source")
        if not ok_thumb(th):
            continue
        co = (p.get("coordinates") or [{}])[0]
        dist = 9999.0
        if co.get("lat") is not None:
            dist = haversine(lat, lon, co["lat"], co["lon"])
        # A "strong" hit shares a distinctive proper token (>=6 chars) and is
        # trusted anywhere in the radius. A "weak" hit rests only on short or
        # common names (e.g. "santa clara"): require >=2 shared tokens AND that
        # the article sit right on top of the POI, so a far-off same-named
        # entity (a lagoon vs a convent) cannot win.
        strong = any(len(t) >= 6 for t in shared)
        if not strong and not (len(shared) >= 2 and dist <= 150):
            continue
        score = len(shared) * 100000 - dist
        if score > best_score:
            best, best_score = th, score
    return best


def wiki_lead(wiki_url):
    """Lead image of the exact article a POI links to."""
    m = re.match(r"https?://([a-z]{2,3})\.wikipedia\.org/wiki/(.+)$", wiki_url or "")
    if not m:
        return None
    lang, title = m.group(1), urllib.parse.unquote(m.group(2))
    url = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json"
           "&prop=pageimages&piprop=thumbnail&pithumbsize="
           f"{THUMB_PX}&titles={urllib.parse.quote(title)}")
    data = get_json(url)
    pages = ((data or {}).get("query") or {}).get("pages") or {}
    for p in pages.values():
        th = (p.get("thumbnail") or {}).get("source")
        if ok_thumb(th):
            return th
    return None


def cascade(iso2, it, drop):
    lat, lon, name = it["lat"], it["lon"], it.get("name") or ""
    if it.get("wiki"):
        r = wiki_lead(it["wiki"])
        if r:
            return r
    radius = NATURE_RADIUS if it.get("kind") in NATURE else BUILT_RADIUS
    for lang in dict.fromkeys([ISO_LANG.get(iso2, "en"), "en"]):
        r = geo_pick(lat, lon, name, drop, lang, radius)
        if r:
            return r
    return None


def ckey(it):
    return f"{round(it['lat'], 4)},{round(it['lon'], 4)}||{it.get('name')}"


def targets_of(data):
    out = []
    for dest_id, dest in data["destinations"].items():
        iso2 = dest.get("iso2")
        drop = norm_tokens(dest.get("city")) | norm_tokens(dest.get("country"))
        for it in (dest.get("activities") or {}).get("items_full") or []:
            if not it.get("img") and it.get("lat") is not None:
                out.append((iso2, it, drop))
    return out


def main():
    global _dirty
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    data = json.loads(DATA.read_text(encoding="utf-8"))
    todo_all = targets_of(data)
    if mode == "stats":
        total = sum(len((d.get("activities") or {}).get("items_full") or [])
                    for d in data["destinations"].values())
        print(f"POIs total: {total}, still missing img: {len(todo_all)}")
        return

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    if mode != "apply":
        # unique by coords+name so a repeated POI is fetched once
        todo = {}
        for iso2, it, drop in todo_all:
            k = ckey(it)
            if k not in cache and k not in todo:
                todo[k] = (iso2, it, drop)
        todo = list(todo.values())
        print(f"still missing: {len(todo_all)}, unique to fetch: {len(todo)}")

        def work(entry):
            iso2, it, drop = entry
            time.sleep(0.05)
            img = cascade(iso2, it, drop)
            return ckey(it), ({"img": img} if img else {"_miss": True})

        done = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futs = [ex.submit(work, e) for e in todo]
            for fut in as_completed(futs):
                key, card = fut.result()
                with _cache_lock:
                    cache[key] = card
                    _dirty += 1
                    done += 1
                    if _dirty >= SAVE_EVERY:
                        CACHE.write_text(json.dumps(cache, ensure_ascii=False),
                                         encoding="utf-8")
                        _dirty = 0
                if done % 500 == 0:
                    hits = sum(1 for v in cache.values() if v.get("img"))
                    print(f"  {done}/{len(todo)}  (cache hits: {hits})")
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # re-read fresh: a concurrent harvest may have rewritten app_data.json
    # during the (long) fetch phase, so never apply onto a stale in-memory copy.
    data = json.loads(DATA.read_text(encoding="utf-8"))
    todo_all = targets_of(data)
    filled = 0
    for iso2, it, drop in targets_of(data):
        card = cache.get(ckey(it))
        if card and card.get("img"):
            it["img"] = card["img"]
            filled += 1
    DATA.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    rate = 100 * filled // max(1, len(todo_all))
    print(f"applied: {filled} images filled ({rate}% of still-missing)")


if __name__ == "__main__":
    main()
