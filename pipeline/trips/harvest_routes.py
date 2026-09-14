"""Harvest the free routing evidence a multi city trip needs: Wikivoyage.

The catalogue already knows what every place is worth on its own. What it has
never known is which places BELONG TOGETHER, and that is exactly the question
a multi day itinerary asks. Guessing it from distance alone produces routes
that look sensible on a map and read as nonsense to anyone who has been there.

Wikivoyage answers it, for free, under CC BY-SA, in three ways:

  Go next     Every city guide ends with a "Go next" section listing where an
              editor thinks you should head from here. Across a country that
              is a hand drawn adjacency graph of real onward journeys, which
              is the single most useful signal for chaining bases.
  Get in      The same guides say whether a place is reached by train, bus,
              ferry, road or plane. Parsed coarsely (does the section mention
              a rail station, a ferry terminal), it is the sanity check that
              stops the composer routing a car-only island hop by train.
  Itineraries Wikivoyage has hundreds of hand written itinerary articles: the
              Romantic Road, the Ring Road, the Grand Tour of Switzerland, the
              Camino. Each links its stops in order. An itinerary whose stops
              resolve onto our catalogue is a human designed route we can
              corroborate a composed one against, and name it honestly after.

What is stored is link structure, article class and coordinates: facts and
references, never prose. That keeps the cache clear of any share-alike
question about text, and Wikivoyage is credited in the wire either way.

The harvest also EXTENDS cache/wikivoyage.json coverage: that cache was built
when the catalogue held 1,570 places and now holds 3,038, so roughly half the
catalogue has never been asked whether an editor wrote a guide for it.

Everything is resumable. Titles already resolved (hit or confirmed miss) are
skipped, so a run cut short by Wikimedia's throttling just needs running again.

Usage, from the repo root:
    python pipeline/trips/harvest_routes.py                 # everything
    python pipeline/trips/harvest_routes.py --countries AT,CH
    python pipeline/trips/harvest_routes.py --skip-itineraries
    python pipeline/trips/harvest_routes.py --limit 100     # pilot
    python pipeline/trips/harvest_routes.py --refresh       # ignore the cache
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from trip_sources import (  # noqa: E402
    ROOT, TRIP_CACHE, UA, fold, haversine_km, load_catalogue,
    load_wikivoyage, load_json, write_json)

API = "https://en.wikivoyage.org/w/api.php"
ROUTES_CACHE = TRIP_CACHE / "routes.json"
WV_CACHE = ROOT / "cache" / "wikivoyage.json"

TITLES_PER_REQ = 20          # MediaWiki caps extracts at 20 for anonymous callers
WIKITEXT_PER_REQ = 12        # content is heavy; keep responses under a few MB
COORD_TOL_KM = 90.0          # a guide whose centre is further away is a namesake
PACE_S = 0.12
RETRIES = 5
TIMEOUT_S = 60
CHECKPOINT_EVERY = 10        # batches between cache writes


# --------------------------------------------------------------- the API call

def api(params):
    """One GET with retry and backoff through Wikimedia's 429 throttling."""
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print("    HTTP 429, cooling down %ss (%s/%s)"
                      % (wait, attempt + 1, RETRIES))
                time.sleep(wait)
                continue
            if e.code in (500, 502, 503) and attempt < RETRIES - 1:
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt < RETRIES - 1:
                time.sleep(5 * (attempt + 1))
                continue
            return None
    return None


def resolve_map(query):
    """Input title to final page title, following normalized then redirect."""
    step = {}
    for n in query.get("normalized", []):
        step[n["from"]] = n["to"]
    for r in query.get("redirects", []):
        step[r["from"]] = r["to"]
    out = {}
    for t in list(step) + [p.get("title") for p in query.get("pages", [])]:
        cur, seen = t, set()
        while cur in step and cur not in seen:
            seen.add(cur)
            cur = step[cur]
        out[t] = cur
    return out


# ------------------------------------------------------------- article lookup

def resolve_articles(cat, wv, only=None, limit=None, refresh=False):
    """Fill in which catalogue places have a Wikivoyage guide.

    Extends the existing cache in place rather than starting a new one, so the
    1,033 articles already resolved stay resolved and only the places added
    since that harvest cost a request.
    """
    todo = []
    for did, d in cat.items():
        if only and d["iso2"] not in only:
            continue
        if not refresh and did in wv:
            continue
        todo.append(did)
    todo.sort()
    if limit:
        todo = todo[:limit]
    if not todo:
        print("  articles: nothing new to resolve")
        return 0

    print("  articles: %s places to look up" % len(todo))
    found = 0
    for i in range(0, len(todo), TITLES_PER_REQ):
        batch = todo[i:i + TITLES_PER_REQ]
        titles = {}
        for did in batch:
            titles.setdefault(cat[did]["city"], []).append(did)
        res = api({
            "action": "query", "prop": "extracts|coordinates",
            "titles": "|".join(titles), "exintro": 1, "explaintext": 1,
            "exlimit": "max", "redirects": 1,
        })
        if not res:
            for did in batch:
                wv.setdefault(did, {"miss": True})
            continue
        q = res.get("query") or {}
        pages = {p["title"]: p for p in q.get("pages", []) if "title" in p}
        rmap = resolve_map(q)
        for want, dids in titles.items():
            page = pages.get(rmap.get(want, want))
            for did in dids:
                rec = _article_record(page, cat[did])
                if rec:
                    wv[did] = rec
                    found += 1
                else:
                    wv[did] = {"miss": True}
        if (i // TITLES_PER_REQ) % CHECKPOINT_EVERY == 0:
            write_json(WV_CACHE, wv)
            print("    %s/%s resolved, %s hits" % (i + len(batch), len(todo), found))
        time.sleep(PACE_S)
    write_json(WV_CACHE, wv)
    print("  articles: %s new guides found" % found)
    return found


def _article_record(page, dest):
    if not page or page.get("missing"):
        return None
    extract = (page.get("extract") or "").strip()
    if len(extract) < 40:
        return None
    coords = page.get("coordinates") or []
    coord = None
    if coords:
        coord = [coords[0]["lat"], coords[0]["lon"]]
        km = haversine_km(coord[0], coord[1], dest["lat"], dest["lon"])
        if km is not None and km > COORD_TOL_KM:
            return None                     # right name, wrong place
    title = page["title"]
    return {
        "title": title,
        "url": "https://en.wikivoyage.org/wiki/"
               + urllib.parse.quote(title.replace(" ", "_")),
        "extract": extract[:800],
        "coord": coord,
        "source": "wikivoyage",
    }


# ------------------------------------------------------- wikitext, the parsing

# [[Bruges]] and [[Bruges|the Venice of the North]] both name Bruges.
LINK_RE = re.compile(r"\[\[([^\]\|#<>{}]+?)(?:\|[^\]]*)?\]\]")
# Section heading of any depth: == Go next ==
HEAD_RE = re.compile(r"^\s*(={2,6})\s*(.+?)\s*\1\s*$", re.M)
STATUS_RE = re.compile(
    r"\{\{\s*(outline|usable|guide|star)(?:city|region|park|district|itinerary|"
    r"topic|phrasebook|airport|dive)?\b", re.I)

# Namespaced or meta links that are never a place.
BAD_PREFIX = ("file:", "image:", "category:", "template:", "wikipedia:",
              "wikivoyage:", "help:", "special:", "user:", "talk:", "media:",
              "w:", "commons:", "wikidata:", "wts:", "phrasebook:")

RAIL_HINTS = ("train", "railway station", "rail station", "hauptbahnhof",
              "gare ", "estaci", "stazione", "by rail", "railway")
BUS_HINTS = ("bus station", "coach", "by bus", "flixbus", "autobus", "busbahnhof")
FERRY_HINTS = ("ferry", "catamaran", "boat from", "by boat", "hydrofoil")
AIR_HINTS = ("airport", "flights", "by plane", "flughafen", "aeropuerto")
CAR_HINTS = ("by car", "motorway", "autobahn", "autoroute", "highway", "e ")


def sections(wikitext):
    """The article split into {heading: body}, headings lowercased.

    A section runs until the next heading of the SAME OR SHALLOWER depth, so
    "Get in" carries its "By train" and "By bus" subsections with it. Cutting
    at the next heading of any depth was the difference between reading a
    whole arrivals section and reading its first sentence.
    """
    text = wikitext or ""
    out = {}
    marks = list(HEAD_RE.finditer(text))
    for i, m in enumerate(marks):
        depth = len(m.group(1))
        end = len(text)
        for j in range(i + 1, len(marks)):
            if len(marks[j].group(1)) <= depth:
                end = marks[j].start()
                break
        out.setdefault(m.group(2).strip().lower(), text[m.end():end])
    return out


def links_in(text):
    """Ordered, de-duplicated place links in a chunk of wikitext."""
    seen, out = set(), []
    for m in LINK_RE.finditer(text or ""):
        title = m.group(1).strip()
        if not title or title.lower().startswith(BAD_PREFIX):
            continue
        key = fold(title)
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
    return out


def travel_modes(text):
    """Which ways in a Get in section actually mentions."""
    low = (text or "").lower()
    return {
        "rail": any(h in low for h in RAIL_HINTS),
        "bus": any(h in low for h in BUS_HINTS),
        "ferry": any(h in low for h in FERRY_HINTS),
        "air": any(h in low for h in AIR_HINTS),
        "car": any(h in low for h in CAR_HINTS),
    }


def fetch_wikitext(titles):
    """{title: wikitext} for up to WIKITEXT_PER_REQ titles."""
    res = api({
        "action": "query", "prop": "revisions", "rvprop": "content",
        "rvslots": "main", "titles": "|".join(titles), "redirects": 1,
    })
    if not res:
        return {}
    q = res.get("query") or {}
    rmap = resolve_map(q)
    by_final = {}
    for p in q.get("pages", []):
        if p.get("missing"):
            continue
        revs = p.get("revisions") or []
        if not revs:
            continue
        content = ((revs[0].get("slots") or {}).get("main") or {}).get("content")
        if content:
            by_final[p["title"]] = content
    return {t: by_final.get(rmap.get(t, t)) for t in titles}


# ------------------------------------------------------------ the Go next pass

GO_NEXT_HEADS = ("go next", "go onwards", "onward travel", "nearby",
                 "next destination", "go next / nearby")
GET_IN_HEADS = ("get in", "getting in", "arrive")


def harvest_gonext(cat, wv, routes, only=None, limit=None, refresh=False):
    """Read every resolved guide once and keep its Go next and Get in."""
    gonext = routes.setdefault("gonext", {})
    getin = routes.setdefault("getin", {})
    status = routes.setdefault("status", {})

    todo = []
    for did, d in cat.items():
        if only and d["iso2"] not in only:
            continue
        art = wv.get(did)
        if not isinstance(art, dict) or art.get("miss") or not art.get("title"):
            continue
        if not refresh and did in gonext:
            continue
        todo.append(did)
    todo.sort()
    if limit:
        todo = todo[:limit]
    if not todo:
        print("  go next: nothing new to read")
        return 0

    print("  go next: reading %s guides" % len(todo))
    linked = 0
    for i in range(0, len(todo), WIKITEXT_PER_REQ):
        batch = todo[i:i + WIKITEXT_PER_REQ]
        titles = []
        for did in batch:
            t = wv[did]["title"]
            if t not in titles:
                titles.append(t)
        texts = fetch_wikitext(titles)
        for did in batch:
            text = texts.get(wv[did]["title"])
            if not text:
                gonext[did] = []
                continue
            secs = sections(text)
            nxt = []
            for head in GO_NEXT_HEADS:
                if head in secs:
                    nxt = links_in(secs[head])
                    break
            gonext[did] = nxt[:14]
            linked += len(gonext[did])
            for head in GET_IN_HEADS:
                if head in secs:
                    getin[did] = travel_modes(secs[head])
                    break
            m = STATUS_RE.search(text)
            if m:
                status[did] = m.group(1).lower()
        if (i // WIKITEXT_PER_REQ) % CHECKPOINT_EVERY == 0:
            save(routes)
            print("    %s/%s guides read" % (i + len(batch), len(todo)))
        time.sleep(PACE_S)
    save(routes)
    print("  go next: %s onward links across %s guides" % (linked, len(todo)))
    return linked


# --------------------------------------------------------- itinerary articles

ITIN_CATS = ["Category:Itineraries"]
ITIN_SKIP_HEADS = ("understand", "prepare", "see also", "go next", "stay safe",
                   "respect", "cope", "sleep", "eat", "drink")

ROAD_HINTS = ("drive", "driving", "road trip", "by car", "motorway", "highway")
RAIL_ITIN_HINTS = ("by train", "by rail", "railway", "rail journey")
WALK_HINTS = ("hike", "hiking", "walk", "trail", "camino", "on foot", "trek")
BOAT_HINTS = ("cruise", "by boat", "ferry", "sail", "river")


def harvest_itineraries(routes, refresh=False):
    """Every itinerary article, with the places it links in order."""
    if routes.get("itineraries") and not refresh:
        print("  itineraries: %s cached" % len(routes["itineraries"]))
        return len(routes["itineraries"])

    titles = []
    seen_cat = set()
    queue = list(ITIN_CATS)
    while queue:
        cat = queue.pop(0)
        if cat in seen_cat:
            continue
        seen_cat.add(cat)
        cont = None
        while True:
            params = {"action": "query", "list": "categorymembers",
                      "cmtitle": cat, "cmlimit": "500", "cmtype": "page|subcat"}
            if cont:
                params["cmcontinue"] = cont
            res = api(params)
            if not res:
                break
            for m in (res.get("query") or {}).get("categorymembers", []):
                if m.get("ns") == 14 and len(seen_cat) < 40:
                    queue.append(m["title"])
                elif m.get("ns") == 0:
                    titles.append(m["title"])
            cont = (res.get("continue") or {}).get("cmcontinue")
            if not cont:
                break
            time.sleep(PACE_S)
    titles = sorted(set(titles))
    print("  itineraries: %s articles listed, reading them" % len(titles))

    out = []
    for i in range(0, len(titles), WIKITEXT_PER_REQ):
        batch = titles[i:i + WIKITEXT_PER_REQ]
        texts = fetch_wikitext(batch)
        for title in batch:
            text = texts.get(title)
            if not text:
                continue
            places = _itinerary_places(text)
            if len(places) < 2:
                continue
            m = STATUS_RE.search(text)
            out.append({
                "title": title,
                "url": "https://en.wikivoyage.org/wiki/"
                       + urllib.parse.quote(title.replace(" ", "_")),
                "status": m.group(1).lower() if m else None,
                "mode": _itinerary_mode(text),
                "places": places[:60],
            })
        if (i // WIKITEXT_PER_REQ) % CHECKPOINT_EVERY == 0:
            routes["itineraries"] = out
            save(routes)
            print("    %s/%s read, %s kept" % (i + len(batch), len(titles), len(out)))
        time.sleep(PACE_S)
    routes["itineraries"] = out
    save(routes)
    print("  itineraries: %s articles with two or more stops" % len(out))
    return len(out)


def _itinerary_places(text):
    """Stops in article order, skipping the boilerplate sections."""
    secs = sections(text)
    body = []
    head_order = list(secs)
    for head in head_order:
        if any(head.startswith(s) for s in ITIN_SKIP_HEADS):
            continue
        body.append(secs[head])
    if not body:
        body = [text]
    seen, out = set(), []
    for chunk in body:
        for t in links_in(chunk):
            key = fold(t)
            if key in seen:
                continue
            seen.add(key)
            out.append(t)
    return out


def _itinerary_mode(text):
    low = (text or "")[:4000].lower()
    scores = {
        "walk": sum(low.count(h) for h in WALK_HINTS),
        "road": sum(low.count(h) for h in ROAD_HINTS),
        "rail": sum(low.count(h) for h in RAIL_ITIN_HINTS),
        "boat": sum(low.count(h) for h in BOAT_HINTS),
    }
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "other"


# ---------------------------------------------------------------------- shell

def save(routes):
    routes["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_json(ROUTES_CACHE, routes)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="comma separated ISO2, default every one")
    ap.add_argument("--limit", type=int, help="stop after this many places, for a pilot")
    ap.add_argument("--refresh", action="store_true", help="ignore what is cached")
    ap.add_argument("--skip-articles", action="store_true")
    ap.add_argument("--skip-gonext", action="store_true")
    ap.add_argument("--skip-itineraries", action="store_true")
    args = ap.parse_args()

    only = None
    if args.countries:
        only = {c.strip().upper() for c in args.countries.split(",") if c.strip()}

    t0 = time.time()
    cat = load_catalogue()
    wv = load_wikivoyage()
    routes = load_json(ROUTES_CACHE, {}) or {}
    print("catalogue: %s places, %s guides already resolved"
          % (len(cat), sum(1 for v in wv.values()
                           if isinstance(v, dict) and not v.get("miss"))))

    if not args.skip_articles:
        resolve_articles(cat, wv, only, args.limit, args.refresh)
        wv = load_wikivoyage()
    if not args.skip_gonext:
        harvest_gonext(cat, wv, routes, only, args.limit, args.refresh)
    if not args.skip_itineraries:
        harvest_itineraries(routes, args.refresh)

    save(routes)
    print("done in %.1f min -> %s" % ((time.time() - t0) / 60, ROUTES_CACHE))


if __name__ == "__main__":
    main()
