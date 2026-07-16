"""
enrich_images_commons.py - fill missing POI images from Wikimedia Commons
GEOTAGGED photos (not Wikipedia articles), so places without an article can
still get a real photo. Hotlinkable, CC-licensed thumbnails.

For every items_full POI with coordinates and no img:
  1. Commons geosearch (namespace 6 = File:) within GEO_RADIUS_M of the POI.
  2. Score candidates: name-token overlap with the POI name (diacritic-lax),
     distance, and a junk blocklist (maps, plaques, logos, documents...).
  3. Accept when tokens overlap OR the photo sits within TIGHT_M of the POI.
  4. Store a THUMB_PX thumbnail URL via Special:FilePath (server-side resize).

Politeness: same UA as the other enrichers, <= 6 workers, backoff on 429/5xx.
Resumable: app_data/commons_img_cache.json (key destId||name), incremental.

Run:  python enrich_images_commons.py           # fetch (resumes) then apply
      python enrich_images_commons.py apply     # cache -> app_data.json only
      python enrich_images_commons.py stats     # coverage, no network
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
CACHE = ROOT / "app_data" / "commons_img_cache.json"

UA = ("CartaTravelApp-enrich/1.0 "
      "(https://github.com/basvn123; contact: bas.vannieuwenhuyse123@gmail.com)")
HEADERS = {"User-Agent": UA, "Accept": "application/json"}

GEO_RADIUS_M = 250
TIGHT_M = 60
THUMB_PX = 640
MAX_WORKERS = 6
SAVE_EVERY = 200

JUNK = re.compile(
    r"map|plan\b|logo|coat[_ ]of[_ ]arms|wappen|escudo|plaque|tafel|sign\b|"
    r"schild|karte|diagram|document|scan|grab|grave|tomb?stone|interior[_ ]detail|"
    r"\.svg$|\.tif|\.pdf|\.ogg|\.webm", re.I)
GOOD_EXT = re.compile(r"\.(jpe?g|png)$", re.I)

_cache_lock = threading.Lock()
_dirty = 0


def get_json(url):
    delays = [0, 5, 15, 45]
    for dl in delays:
        if dl:
            time.sleep(dl)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"_404": True}
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


def geosearch(lat, lon):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
           f"&list=geosearch&gscoord={lat}%7C{lon}&gsradius={GEO_RADIUS_M}"
           "&gsnamespace=6&gslimit=20")
    data = get_json(url)
    if not data or "_404" in data:
        return []
    return ((data.get("query") or {}).get("geosearch")) or []


def pick(name, hits):
    toks = norm_tokens(name)
    best, best_score = None, -1
    for h in hits:
        title = h.get("title", "")
        fname = title[5:] if title.startswith("File:") else title
        if JUNK.search(fname) or not GOOD_EXT.search(fname):
            continue
        overlap = len(toks & norm_tokens(fname))
        dist = h.get("dist", 999)
        if overlap == 0 and dist > TIGHT_M:
            continue
        score = overlap * 100 - dist
        if score > best_score:
            best, best_score = fname, score
    return best


def thumb_url(fname):
    return ("https://commons.wikimedia.org/wiki/Special:FilePath/"
            f"{urllib.parse.quote(fname.replace(' ', '_'))}?width={THUMB_PX}")


def targets_of(data):
    out = []
    for dest_id, dest in data["destinations"].items():
        for it in (dest.get("activities") or {}).get("items_full") or []:
            if not it.get("img") and it.get("lat") is not None:
                out.append((dest_id, it))
    return out


def main():
    global _dirty
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    data = json.loads(DATA.read_text(encoding="utf-8"))
    todo_all = targets_of(data)
    if mode == "stats":
        total = sum(len((d.get("activities") or {}).get("items_full") or [])
                    for d in data["destinations"].values())
        print(f"POIs total: {total}, missing img (with coords): {len(todo_all)}")
        return

    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    if mode != "apply":
        todo = [(d, it) for d, it in todo_all if f"{d}||{it.get('name')}" not in cache]
        print(f"missing img: {len(todo_all)}, to fetch: {len(todo)}")

        def work(entry):
            d_id, it = entry
            time.sleep(0.05)
            hits = geosearch(it["lat"], it["lon"])
            fname = pick(it.get("name") or "", hits)
            return f"{d_id}||{it.get('name')}", ({"img": thumb_url(fname)} if fname
                                                 else {"_miss": True})

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
                if done % 1000 == 0:
                    print(f"  {done}/{len(todo)}")
        CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    filled = 0
    for d_id, it in targets_of(data):
        card = cache.get(f"{d_id}||{it.get('name')}")
        if card and card.get("img"):
            it["img"] = card["img"]
            filled += 1
    DATA.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    hitrate = 100 * filled // max(1, len(todo_all))
    print(f"applied: {filled} images filled ({hitrate}% of missing)")


if __name__ == "__main__":
    main()
