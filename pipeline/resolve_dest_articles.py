"""resolve_dest_articles.py - find the Wikipedia article for a destination that
has no photograph.

harvest_pageviews reads its article URL from `dest.image.page`, which the image
harvester happens to leave behind. That works for 2,977 of 3,038 destinations
and silently skips the rest: no photo, no URL, no article, no fame measurement.
Those 61 then trip the rating layer's obscure-star gate, because a fame of 0
looks identical to "nobody reads about this place" when it really means "nobody
asked".

Three routes are tried in order, because no single one covers Europe:

  1. exact title  Varese, Algeciras and Luanco resolve straight off.
  2. search       the English names all fail route 1, because Keswick,
                  Rochester, Chesterfield, Stamford and Rugby are
                  DISAMBIGUATION pages, which carry no coordinates. Searching
                  "{city} {country}" returns "Keswick, Cumbria" and
                  "Chesterfield, Derbyshire", which is what was wanted.
  3. geosearch    last resort, for a place whose article is titled nothing
                  like the name the gazetteer uses.

Every candidate is verified against the destination's own coordinates before
it is accepted, because route 2 will cheerfully offer "Stamford Bridge, East
Riding of Yorkshire" for Stamford in Lincolnshire, and "United Kingdom" for
Rugby. Geography is the referee; the name only proposes.

Writes cache/dest_articles.json, which harvest_pageviews reads as a fallback.

Usage:
    python pipeline/resolve_dest_articles.py            # only the unmeasured
    python pipeline/resolve_dest_articles.py --all      # every missing article
"""
import argparse
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
DEST_PV = ROOT / "cache" / "dest_pageviews.json"
OUT = ROOT / "cache" / "dest_articles.json"

UA = "CartaTravelApp/1.0 (open-data destination catalogue)"
RADIUS_M = 10000         # geosearch sweep for the last-resort route
LIMIT = 50
DELAY_S = 0.8
VERIFY_KM = 25.0         # an article further than this from the dest is not it
# An article whose title looks NOTHING like the place is only believable when
# it is practically on top of it. Without this the name-blind fallback handed
# Podgorzyn the article for Jelenia Gora, Ciritei the article for Piatra-Neamt
# and Lukov the article for Stipa - each a larger neighbour, each with its own
# much bigger readership, which would have been recorded as the small place's
# fame. Measuring the wrong town is worse than measuring nothing.
UNRELATED_MAX_KM = 3.0
# ...and it is only believable from geosearch, which answers "what is HERE".
# The search engine answers "what is RELATED", and a bigger nearby town is
# exactly what it likes to offer.
UNRELATED_ROUTES = {"geo"}

# Which Wikipedia to ask. English for the British Isles and Malta, the local
# language elsewhere, mirroring harvest_place_signals.COUNTRY_WIKI: readership
# and article quality both live on the local edition.
COUNTRY_WIKI = {
    "AD": "ca", "AL": "sq", "AT": "de", "BA": "bs", "BE": "nl", "BG": "bg",
    "CH": "de", "CY": "el", "CZ": "cs", "DE": "de", "DK": "da", "EE": "et",
    "ES": "es", "FI": "fi", "FO": "fo", "FR": "fr", "GB": "en", "GR": "el",
    "HR": "hr", "HU": "hu", "IE": "en", "IS": "is", "IT": "it", "LI": "de",
    "LT": "lt", "LU": "fr", "LV": "lv", "MC": "fr", "MD": "ro", "ME": "sr",
    "MK": "mk", "MT": "en", "NL": "nl", "NO": "no", "PL": "pl", "PT": "pt",
    "RO": "ro", "RS": "sr", "SE": "sv", "SI": "sl", "SK": "sk", "SM": "it",
    "XK": "sq",
}

# Article titles that are never a destination, however close they sit.
BAD_TITLE = re.compile(
    r"(geograph|panoramio|\.jpg|\.png|List of |Category:|File:|"
    r"railway station|Bahnhof|gare de|estación de)", re.I)


def is_article(url):
    """A Wikipedia ARTICLE url, as opposed to whatever the image layer left.

    `dest.image.page` is set by the image harvester, and when it falls back to
    a Wikimedia Commons photograph it stores the Commons File: page. That is a
    picture, not an article about the place, and it has no readership to
    measure - which is why Keswick, Rochester and Rugby looked like they had an
    article and still came back unmeasured.
    """
    if not url:
        return False
    return ".wikipedia.org/wiki/" in url and "commons.wikimedia.org" not in url


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2)
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


# Every failure here used to be swallowed and returned as an empty result,
# which the caller then recorded as "this place has no article". That is a lie
# a retry would have caught: a run of 61 destinations makes up to three calls
# each, Wikipedia throttled it partway through, and 50 towns that plainly do
# have articles - Varese, Algeciras, Luanco - were written down as unresolvable.
# A transient error must never be indistinguishable from a real absence.
API_TRIES = 4
API_BACKOFF_S = 2.0
_api_errors = []


def _api(lang, params):
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(API_TRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:                       # throttling, 5xx, timeout
            last = e
            time.sleep(API_BACKOFF_S * (attempt + 1))
    _api_errors.append(f"{lang}: {type(last).__name__}: {last}")
    return {}


def _pages(data):
    """Every returned page that carries coordinates."""
    out = []
    for p in ((data.get("query") or {}).get("pages") or {}).values():
        c = (p.get("coordinates") or [None])[0]
        title = p.get("title")
        if not c or not title or BAD_TITLE.search(title):
            continue
        out.append({"title": title, "lat": c["lat"], "lon": c["lon"],
                    "url": p.get("fullurl"), "rank": p.get("index", 99)})
    return out


def by_title(city, lang):
    return _pages(_api(lang, {
        "action": "query", "format": "json", "redirects": "1",
        "prop": "coordinates|info", "inprop": "url", "colimit": "max",
        "titles": city}))


def by_search(city, country, lang):
    return _pages(_api(lang, {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"{city} {country}", "gsrlimit": "8",
        "prop": "coordinates|info", "inprop": "url", "colimit": "max"}))


def geosearch(lat, lon, lang):
    """Articles near a point, with their distance in metres."""
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "geosearch",
        "ggscoord": f"{lat}|{lon}", "ggsradius": str(RADIUS_M),
        "ggslimit": str(LIMIT), "prop": "coordinates|info", "inprop": "url",
        "colimit": "max",
    })
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception:
        return []
    return _pages(data)


def pick(city, lat, lon, cands, route="title"):
    """Best article for `city`, verified against where the place actually is.

    Name agreement decides first and distance breaks ties, but anything beyond
    VERIFY_KM is dropped however well the name reads. That single rule is what
    rejects "Stamford Bridge, East Riding of Yorkshire" for Stamford in
    Lincolnshire, and "United Kingdom" for Rugby.
    """
    want = norm(city)
    best, best_key = None, None
    for c in cands:
        km = haversine(lat, lon, c["lat"], c["lon"])
        if km > VERIFY_KM:
            continue
        t = norm(c["title"])
        if t == want:
            score = 0                       # "Varese"
        elif t.startswith(want):
            score = 1                       # "Keswick, Cumbria"
        elif want in t:
            score = 2                       # "Camerino (Italia)"
        else:
            # Unrelated name. Believable only from geosearch, and only when it
            # is right on the spot. Greek is why this branch exists at all:
            # "Spilion" and its article "Spili Rethymnis" share no characters,
            # because one is a transliteration and the other is Greek script.
            if route not in UNRELATED_ROUTES or km > UNRELATED_MAX_KM:
                continue
            score = 3
        key = (score, round(km, 1), c["rank"])
        if best_key is None or key < best_key:
            best, best_key = c, key
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true",
                    help="resolve every destination lacking image.page")
    args = ap.parse_args()

    data = load_json(MASTER)
    dests = data["destinations"]
    pv = load_json(DEST_PV)
    out = load_json(OUT)

    todo = []
    for did, d in dests.items():
        if is_article((d.get("image") or {}).get("page")):
            continue                        # harvest_pageviews already has one
        if did in out:
            continue
        if not args.all and did in pv:
            continue                        # already measured somehow
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        if lat is None or lon is None:
            continue
        todo.append((did, d, float(lat), float(lon)))

    print(f"{len(todo)} destinations have no article to measure")
    hits = 0
    for n, (did, d, lat, lon) in enumerate(todo, 1):
        lang = COUNTRY_WIKI.get(d.get("iso2"), "en")
        city, country = d.get("city"), d.get("country")
        best, route = pick(city, lat, lon, by_title(city, lang), "title"), "title"
        if not best:
            best = pick(city, lat, lon, by_search(city, country, lang), "search")
            route = "search"
        if not best:
            best = pick(city, lat, lon, geosearch(lat, lon, lang), "geo")
            route = "geo"
        if best and best.get("url"):
            out[did] = {"url": best["url"], "title": best["title"],
                        "wiki": lang, "via": route}
            hits += 1
            print(f"  [{n}/{len(todo)}] {city[:26]:26s} -> {best['title']} ({route})")
        else:
            print(f"  [{n}/{len(todo)}] {city[:26]:26s} -> no match")
        if n % 20 == 0:
            atomic_write_json(OUT, out)
        time.sleep(DELAY_S)

    atomic_write_json(OUT, out)
    print(f"\nresolved {hits}/{len(todo)}; cache holds {len(out)} articles -> {OUT.name}")
    if _api_errors:
        print(f"! {len(_api_errors)} API calls failed after {API_TRIES} tries; "
              f"those places are UNKNOWN, not article-less. Re-run to retry.")
        for e in _api_errors[:5]:
            print(f"    {e}")
    print("now run: python pipeline/harvest_pageviews.py dests")


if __name__ == "__main__":
    main()
