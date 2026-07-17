"""
harvest_images.py - the destination image layer (schema v10).

For every destination, fetch the canonical Wikipedia lead image (the postcard
skyline/landmark photo at the top of the city's article) and store it in
`dest.image`. Free, no API key, license-clean source - same ethos as the rest of
the app (Numbeo / UNESCO / Inside Airbnb / Ryanair / Eurostat).

One Wikipedia action-API call per destination resolves the best-matching article
AND returns a sized thumbnail + the full-res original + the canonical page URL
(used as the attribution/credit link), in a single request:

    action=query & generator=search (gsrsearch="{city} {country}")
      & prop=pageimages|info & piprop=thumbnail|original & pithumbsize=900

Two phases (idempotent, resumable - mirrors reharvest_flights.py):
  harvest()  -> fills cache/wiki_images.json (one entry per dest id)
  patch()    -> writes dest.image into both app_data.json files

Run:  python harvest_images.py            # harvest then patch (resumes cache)
      python harvest_images.py harvest    # harvest only
      python harvest_images.py patch      # patch only (from existing cache)
      python harvest_images.py refresh    # drop cache, re-fetch all, patch

Everything ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

# The Windows console is cp1252; city names (Krakow, Malmo...) carry accents.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
CACHE = ROOT / "cache" / "wiki_images.json"
TARGETS = [
    ROOT / "app_data" / "app_data.json",                  # real dataset
    ROOT / "continent-app" / "public" / "app_data.json",  # what the dev app serves
]
PRIMARY = TARGETS[0]

API = "https://en.wikipedia.org/w/api.php"
THUMB_PX = 900
DELAY_S = 0.3
BACKOFFS = [5, 15, 30]
IMAGE_MODEL = "wikipedia_pageimage_v1"

HEADERS = {
    "User-Agent": "CartaTravelApp/1.0 (portfolio project; contact bas.vannieuwenhuyse123@gmail.com)",
    "Accept": "application/json",
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch(params):
    url = API + "?" + urllib.parse.urlencode(params)
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


def _page_image(p):
    thumb = (p.get("thumbnail") or {}).get("source")
    original = (p.get("original") or {}).get("source")
    if not (thumb or original):
        return None
    return {
        "title": p.get("title"),
        "url": p.get("fullurl") or p.get("canonicalurl"),
        "thumb": thumb,
        "original": original,
        "source": "wikipedia",
    }


def by_exact_title(title):
    """Resolve an EXACT article (following redirects) and return its image.
    Preferred: 'Warsaw' -> the city article, not 'Warsaw Chopin Airport'."""
    data = fetch({
        "action": "query", "format": "json", "formatversion": "2",
        "titles": title, "redirects": "1",
        "prop": "pageimages|info|pageprops", "inprop": "url",
        "piprop": "thumbnail|original", "pithumbsize": str(THUMB_PX),
    })
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or []
    if not pages:
        return None
    p = pages[0]
    if p.get("missing"):
        return None
    # Skip disambiguation pages (no real lead image of the place).
    if (p.get("pageprops") or {}).get("disambiguation") is not None:
        return None
    return _page_image(p)


def by_rest_summary(title):
    """Fallback for pages where `pageimages` assigns no lead image (e.g. Alghero,
    Spis Castle): the REST summary endpoint derives the lead image differently and
    often returns the infobox photo. Returns the same shape as the others."""
    t = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{t}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return None
    if data.get("type") == "disambiguation":
        return None
    thumb = (data.get("thumbnail") or {}).get("source")
    original = (data.get("originalimage") or {}).get("source")
    if not (thumb or original):
        return None
    return {
        "title": data.get("title"),
        "url": (data.get("content_urls") or {}).get("desktop", {}).get("page"),
        "thumb": thumb,
        "original": original,
        "source": "wikipedia",
    }


def by_search(query):
    """Fallback: best-matching article for a free-text query."""
    data = fetch({
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "search", "gsrsearch": query, "gsrlimit": "1",
        "gsrnamespace": "0",
        "prop": "pageimages|info", "inprop": "url",
        "piprop": "thumbnail|original", "pithumbsize": str(THUMB_PX),
        "redirects": "1",
    })
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or []
    return _page_image(pages[0]) if pages else None


# Ambiguous / compound names where the plain city string resolves to a
# disambiguation page or the wrong place. Maps city -> the exact Wikipedia title
# of the best lead-image article.
TITLE_OVERRIDES = {
    # Alghero & Spis Castle have no API-exposed lead image; fall back to their
    # region / the paired UNESCO town, which do.
    "Alghero": "Sardinia",
    "Kerry": "Ring of Kerry",
    "Newcastle": "Newcastle upon Tyne",
    "St Ives": "St Ives, Cornwall",
    "Auschwitz / Wieliczka": "Wieliczka Salt Mine",
    "Spis Castle & Levoca": "Levoca",
    "Spiš Castle & Levoča": "Levoča",
    # Nordic / parenthetical names whose plain string hits a disambiguation page
    # or an article with no API-exposed lead image; point at the real one.
    "Roros": "Røros (town)",
    "Fort William (Glencoe)": "Ben Nevis",
    "Glen Coe": "Glencoe, Highland",
    "Tarifa": "Baelo Claudia",                 # town article has no API lead image
    "Camargue": "Saintes-Maries-de-la-Mer",    # park article has no lead image
}


def clean_city(dest):
    """City name without airport qualifiers: 'Warsaw (Chopin)' -> 'Warsaw'."""
    city = (dest.get("city") or "").strip()
    return re.sub(r"\s*\(.*?\)\s*", "", city).strip() or city


def best_page(dest):
    """Exact city article first (most reliable), then a city+country search."""
    raw_city = (dest.get("city") or "").strip()
    city = clean_city(dest)
    country = (dest.get("country") or "").strip()
    override = TITLE_OVERRIDES.get(raw_city) or TITLE_OVERRIDES.get(city)
    if override:
        hit = by_exact_title(override) or by_rest_summary(override)
        if hit:
            return hit
    # Compound names ("Auschwitz / Wieliczka") - try the leading part too.
    head = re.split(r"\s*[\/&]\s*|\s+and\s+", city)[0].strip()
    return (by_exact_title(city)
            or by_rest_summary(city)               # pages with no pageimages lead
            or by_exact_title(f"{city}, {country}")
            or by_search(f"{city} {country}")
            or (by_exact_title(head) if head != city else None)
            or (by_rest_summary(head) if head != city else None)
            or (by_search(f"{head} {country}") if head != city else None))


def harvest(dests, resume=True):
    cache = {}
    if resume and CACHE.exists():
        cache = load_json(CACHE)
    todo = [(i, d) for i, d in dests.items() if i not in cache or cache[i] is None]
    print(f"Harvesting Wikipedia images: {len(todo)} to fetch, {len(cache)} cached")
    for n, (did, d) in enumerate(todo, 1):
        res = best_page(d)
        cache[did] = res
        tag = "ok " if res else "MISS"
        print(f"  [{n}/{len(todo)}] {tag} {d.get('city')}, {d.get('country')}"
              + (f" -> {res['title']}" if res else ""))
        if n % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(DELAY_S)
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    hits = sum(1 for v in cache.values() if v)
    print(f"Harvest done: {hits}/{len(cache)} have an image. Cache: {CACHE}")
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
        n_img = 0
        for did, d in dests.items():
            rec = cache.get(did)
            if rec:
                d["image"] = {
                    "url": rec.get("thumb") or rec.get("original"),
                    "hires": rec.get("original"),
                    "credit": rec.get("title"),
                    "page": rec.get("url"),
                    "source": "wikipedia",
                }
                n_img += 1
            else:
                d["image"] = None
        data.setdefault("meta", {})["image_model"] = {
            "source": IMAGE_MODEL,
            "provider": "Wikipedia REST/action API (pageimages)",
            "license": "per-image (Wikimedia Commons); page linked for attribution",
            "thumb_px": THUMB_PX,
            "coverage": f"{n_img}/{len(dests)}",
        }
        data["meta"]["schema_version"] = max(10, data["meta"].get("schema_version", 0))
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: {n_img}/{len(dests)} dests have an image "
              f"({path.stat().st_size / 1024 / 1024:.2f} MB)")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    data = load_json(PRIMARY)
    dests = data.get("destinations", {})
    if cmd == "refresh" and CACHE.exists():
        CACHE.unlink()
    if cmd in ("all", "harvest", "refresh"):
        cache = harvest(dests, resume=(cmd != "refresh"))
    else:
        cache = None
    if cmd in ("all", "patch", "refresh"):
        patch(cache)


if __name__ == "__main__":
    main()
