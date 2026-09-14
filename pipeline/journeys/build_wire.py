"""
build_wire.py - the curated trip library ("journeys") as a browsable wire.

Reads the unified 253-trip dataset (Trips/carta-unified, schema v2.0: ten
canonical trip types, one 7-day itinerary per record, everything editorial)
and writes the three artifacts the Destinations tab browses:

    continent-app/public/journeys/index.json          the ten trip styles,
                                                      each with a hero photo
    continent-app/public/journeys/type/{slug}.json    cards for one style
    continent-app/public/journeys/journey/{id}.json   one trip in full

The dataset ships no photography at all, so this script also harvests one
hero per trip and one per style from the Wikipedia API (lead images, which
are Commons files with a page to credit). Candidates are the places the
record itself names - the resolved coordinate place, the basecamp towns, the
sub-region - so a photograph is always of somewhere the trip actually goes.
Records whose coordinate is only a gateway- or capital-city pin never take a
photograph from that pin: the schema flags those pins as "a map pin rather
than a location" and a picture of Sofia on a Bansko ski week would be a lie.

Harvest results are cached in cache/journey_images.json so re-runs are
offline and idempotent.

House rules applied to every shipped string (mirrors lib/format.js
stripDashes): no em/en dashes; numeric ranges and tight joins become a plain
hyphen, spaced prose dashes a comma. Inline [VERIFY: ...] markers are lifted
out of display prose (they already live in verifyFlags[]).

Run from the repo root:  python pipeline/journeys/build_wire.py
Offline re-export:       python pipeline/journeys/build_wire.py --no-fetch
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Trips" / "carta-unified" / "carta-unified" / "data" / "trips.master.json"
OUT = ROOT / "continent-app" / "public" / "journeys"
CACHE_PATH = ROOT / "cache" / "journey_images.json"

API = "https://en.wikipedia.org/w/api.php"
UA = "CartaTravelApp/1.0 (https://carta-europetravel.com; hero image harvest)"
THUMB_W = 1280          # a width upload.wikimedia.org actually renders
MIN_W = 640             # a hero narrower than this reads as a thumbnail
FETCH_PAUSE = 0.15      # polite gap between API calls

# The ten canonical types, in schema id order, with the articles whose lead
# image may front the style card. First candidate with a wide landscape lead
# wins; every one of them is an iconic, recognisable place for that style.
TYPE_HERO_CANDIDATES = {
    "cycling": ["Passo dello Stelvio", "Sella Pass", "Col du Galibier",
                "Danube Cycle Path"],
    "trail-running": ["Mont Blanc massif", "Chamonix",
                      "Ultra-Trail du Mont-Blanc"],
    "city": ["Charles Bridge", "Prague", "Grand-Place"],
    "cozy-towns": ["Hallstatt", "Colmar", "Rothenburg ob der Tauber"],
    "road-trip": ["Transfăgărășan",
                  "Grossglockner High Alpine Road", "Amalfi Coast"],
    "hiking": ["Tre Cime di Lavaredo", "Matterhorn", "Lac Blanc (Chamonix)"],
    "culinary": ["Wachau", "Lavaux", "Douro"],
    "winter-sports": ["Zermatt", "St. Moritz", "Kitzbühel"],
    "nature-escape": ["Lofoten", "Lake Bled", "Black Forest"],
    "water-sports": ["Navagio", "Calanques National Park", "Costa Brava"],
}
TYPE_ORDER = ["cycling", "trail-running", "city", "cozy-towns", "road-trip",
              "hiking", "culinary", "winter-sports", "nature-escape",
              "water-sports"]

VERIFY_RE = re.compile(r"\s*`?\[VERIFY[^\]]*\]`?", re.IGNORECASE)

# Hand-named places for the trips whose own vocabulary only reaches articles
# with map leads (the Peloponnese article opens on an SVG locator). The name
# is still somewhere the trip goes; only the article choice is manual.
MANUAL_PLACES = {
    "gr-cycling-peloponnese-arcadia": ["Dimitsana", "Nafplio"],
    "gr-road-trip-peloponnese-loop": ["Monemvasia", "Nafplio"],
    "ad-hiking-coma-pedrosa-madriu": ["Coma Pedrosa",
                                      "Madriu-Perafita-Claror Valley"],
}


def strip_dashes(s):
    """lib/format.js stripDashes, in Python, so shipped copy obeys the house
    rule at build time rather than at render time."""
    s = re.sub(r"(\d)\s*[—–]\s*(\d)", r"\1-\2", s)
    s = re.sub(r"(\w)[—–](\w)", r"\1-\2", s)
    s = re.sub(r"\s*[—–]\s*", ", ", s)
    return s


def clean_text(x):
    """Recursively clean every string: dashes out, [VERIFY] markers out."""
    if isinstance(x, str):
        return strip_dashes(VERIFY_RE.sub("", x)).strip()
    if isinstance(x, list):
        return [clean_text(v) for v in x]
    if isinstance(x, dict):
        # Keys too: the source batches used em-dash headings as raw slot
        # names ("Remote access — the tracks that matter"), and a key is as
        # shipped as a value.
        return {clean_text(k): clean_text(v) for k, v in x.items()}
    return x


# ── Wikipedia lead images ────────────────────────────────────────────────────

def load_cache():
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1),
                          encoding="utf-8")


def api_call(params):
    qs = urllib.parse.urlencode({**params, "format": "json",
                                 "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))
    return None


def fetch_lead_images(titles, cache, allow_fetch):
    """title -> {url, w, h, credit, page} | None, batched 50 a call.
    The cache key is the exact queried title; redirects resolve inside the
    API call, and the answer is stored under what was asked."""
    missing = [t for t in titles if t not in cache]
    if missing and not allow_fetch:
        for t in missing:
            cache[t] = None
    for i in range(0, len(missing) if allow_fetch else 0, 50):
        batch = missing[i:i + 50]
        try:
            data = api_call({
                "action": "query", "redirects": "1",
                "prop": "pageimages|info", "inprop": "url",
                "piprop": "thumbnail|name", "pithumbsize": str(THUMB_W),
                "titles": "|".join(batch),
            })
        except Exception as e:  # noqa: BLE001 - a failed batch is just uncached
            print(f"  ! pageimages batch failed: {e}", file=sys.stderr)
            continue
        # Map redirected/normalized names back to what was asked.
        back = {}
        q = data.get("query", {})
        for r in q.get("normalized", []) + q.get("redirects", []):
            back[r["to"]] = back.get(r["from"], r["from"])
        for page in q.get("pages", []):
            asked = back.get(page.get("title"), page.get("title"))
            thumb = page.get("thumbnail")
            if not thumb or page.get("missing"):
                cache[asked] = None
                continue
            cache[asked] = {
                "url": thumb["source"],
                "w": thumb.get("width"), "h": thumb.get("height"),
                "credit": page.get("title"),
                "page": page.get("fullurl")
                or f"https://en.wikipedia.org/wiki/{urllib.parse.quote(page['title'].replace(' ', '_'))}",
            }
        for t in batch:
            cache.setdefault(t, None)
        time.sleep(FETCH_PAUSE)
    return {t: cache.get(t) for t in titles}


# A hero must be a photograph. Lead images that are maps, flags, seals or
# locator diagrams (almost always PNG/SVG, or named as what they are) would
# put a cartogram on a card that promises a place.
NOT_A_PHOTO_RE = re.compile(
    r"\.(png|svg|gif)(\?|$)|map|karte|locator|locat(?:ion)?_|flag_|"
    r"coat_of|escudo|logo|banner_of", re.IGNORECASE)


def usable(img, min_w=MIN_W, landscape=True):
    if not img or not img.get("url") or not img.get("w"):
        return False
    if NOT_A_PHOTO_RE.search(img["url"].rsplit("/", 1)[-1]):
        return False
    if img["w"] < min_w:
        return False
    if landscape and img.get("h") and img["h"] > img["w"]:
        return False
    return True


PLACE_JUNK_RE = re.compile(
    r"point.to.point|multi.base|various|rotating|see below|n/a", re.IGNORECASE)


def place_candidates(trip):
    """The places whose photograph may front this trip, best claim first."""
    out = []

    def add(name):
        name = re.sub(r"\s*\(.*?\)\s*", " ", str(name or "")).strip(" ,.")
        if not name or len(name) > 60 or PLACE_JUNK_RE.search(name):
            return
        if name not in out:
            out.append(name)

    def add_split(text):
        # "Point-to-point: A -> B -> C", "A to B", "Zealand / Øresund" and
        # "Theth & Plav" all name several places; split on every separator
        # the batches used and keep the parts that read as one place name.
        for part in re.split(r"[:;,/→>&+]|\bto\b|\band\b|\bthe\b", str(text)):
            part = part.strip()
            if part and len(part.split()) <= 4:
                add(part)

    for name in MANUAL_PLACES.get(trip.get("id"), []):
        add(name)
    coords = trip.get("coordinates") or {}
    if coords.get("precision") in ("source", "city"):
        add(coords.get("matchedPlace"))
    for base in trip.get("basecamps") or []:
        add_split(base)
    add_split(trip.get("subRegion") or "")
    # The gateway city is last resort ONLY when the schema says the pin is
    # honest; a capital fallback pin stays photograph-less by design.
    if coords.get("precision") == "gateway" and trip.get("gatewayAirport"):
        add(re.sub(r"\s*\([A-Z]{3}\)", "", trip["gatewayAirport"]))
    return out


def search_hero(trip, cache, allow_fetch):
    """Last resort for a trip none of whose named places carried a lead
    image: full-text search Wikipedia for the sub-region (or first basecamp)
    plus the country, then take the first hit whose lead is a usable
    photograph. Cached under the query so re-runs stay offline."""
    what = (trip.get("subRegion") or "").split(",")[0].strip() \
        or (trip.get("basecamps") or [""])[0]
    if not what:
        return None
    query = f"{what} {trip.get('country') or ''}".strip()
    key = f"search::{query}"
    if key in cache:
        hit = cache[key]
        return strip_utm(hit) if usable(hit, landscape=False) else None
    if not allow_fetch:
        return None
    try:
        data = api_call({"action": "query", "list": "search",
                         "srsearch": query, "srlimit": "5",
                         "srnamespace": "0"})
        titles = [r["title"] for r in data["query"]["search"]]
        time.sleep(FETCH_PAUSE)
        found = fetch_lead_images(titles, cache, allow_fetch)
        pick = pick_hero(titles, found)
        cache[key] = pick
        return pick
    except Exception as e:  # noqa: BLE001
        print(f"  ! search fallback failed for {trip['id']}: {e}",
              file=sys.stderr)
        cache[key] = None
        return None


def strip_utm(img):
    """The API stamps ?utm_source=... onto thumb URLs; shipped URLs carry
    none (house rule, and srcset rewrites assume a bare thumb path)."""
    if not img:
        return img
    return {**img, "url": img["url"].split("?")[0]}


def pick_hero(candidates, images):
    for name in candidates:
        if usable(images.get(name)):
            return strip_utm(images[name])
    # Second pass: accept portrait rather than ship a grey card.
    for name in candidates:
        if usable(images.get(name), landscape=False):
            return strip_utm(images[name])
    return None


# ── Cards and details ────────────────────────────────────────────────────────

def month_short(months):
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [names[m - 1] for m in months if 1 <= m <= 12]


def to_card(trip, hero):
    budget = trip.get("budget") or {}
    total = budget.get("totalEur") or {}
    per_day = budget.get("perDayEur") or {}
    profile = trip.get("profile") or {}
    coords = trip.get("coordinates") or {}
    best = trip.get("bestPeriod") or {}
    return {
        "id": trip["id"],
        "title": trip.get("title") or trip["id"],
        "cc": trip.get("countryCode"),
        "country": trip.get("country"),
        "countries": [c.get("code") for c in trip.get("countries") or []],
        "sub": trip.get("subRegion"),
        "days": trip.get("durationDays") or 7,
        "tier": trip.get("budgetTier"),
        "eur": {"low": total.get("low"), "high": total.get("high")},
        "pd": {"low": per_day.get("low"), "high": per_day.get("high")},
        "diff": profile.get("difficulty"),
        "diffLabel": profile.get("difficultyLabel"),
        "months": best.get("months") or [],
        "summary": trip.get("summary"),
        "lat": coords.get("lat"), "lon": coords.get("lon"),
        "prec": coords.get("precision"),
        "gw": trip.get("gatewayAirportCode"),
        "hero": hero,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true",
                    help="cache only; never touch the network")
    args = ap.parse_args()

    master = json.loads(SRC.read_text(encoding="utf-8"))
    trips = [clean_text(t) for t in master["trips"]]
    print(f"{len(trips)} trips in, schema {master.get('schemaVersion')}")

    cache = load_cache()
    allow = not args.no_fetch

    # One flat list of every place any trip names, fetched in batches.
    per_trip = {t["id"]: place_candidates(t) for t in trips}
    all_titles = []
    for names in per_trip.values():
        for n in names:
            if n not in all_titles:
                all_titles.append(n)
    for names in TYPE_HERO_CANDIDATES.values():
        for n in names:
            if n not in all_titles:
                all_titles.append(n)
    print(f"{len(all_titles)} candidate places to look up "
          f"({sum(1 for t in all_titles if t not in cache)} not yet cached)")
    images = fetch_lead_images(all_titles, cache, allow)
    save_cache(cache)

    heroes = {tid: pick_hero(names, images) for tid, names in per_trip.items()}
    for t in trips:
        if not heroes.get(t["id"]):
            heroes[t["id"]] = search_hero(t, cache, allow)
    save_cache(cache)
    n_img = sum(1 for h in heroes.values() if h)
    print(f"{n_img}/{len(trips)} trips have a hero photograph")

    # Style heroes: wide landscape leads only; a style card must not open on
    # a portrait crop.
    type_heroes = {}
    for slug, names in TYPE_HERO_CANDIDATES.items():
        pick = None
        for n in names:
            if usable(images.get(n), min_w=1000):
                pick = strip_utm(images[n])
                break
        type_heroes[slug] = pick or pick_hero(names, images)
        if not type_heroes[slug]:
            print(f"  ! no hero for style {slug}", file=sys.stderr)

    by_type = {slug: [] for slug in TYPE_ORDER}
    for t in trips:
        by_type.setdefault(t["tripTypeSlug"], []).append(t)

    (OUT / "type").mkdir(parents=True, exist_ok=True)
    (OUT / "journey").mkdir(parents=True, exist_ok=True)

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    index_types = []
    for slug in TYPE_ORDER:
        rows = by_type.get(slug, [])
        rows.sort(key=lambda t: ((t.get("country") or ""),
                                 (t.get("title") or "")))
        cards = [to_card(t, heroes.get(t["id"])) for t in rows]
        (OUT / "type" / f"{slug}.json").write_text(
            json.dumps({"slug": slug, "trips": cards}, ensure_ascii=False),
            encoding="utf-8")
        index_types.append({
            "slug": slug,
            "id": rows[0]["tripTypeId"] if rows else None,
            "name": rows[0]["tripType"] if rows else slug,
            "n": len(rows),
            "countries": sorted({t.get("countryCode") for t in rows if t.get("countryCode")}),
            "hero": type_heroes.get(slug),
        })
        for t in rows:
            detail = dict(t)
            detail["hero"] = heroes.get(t["id"])
            (OUT / "journey" / f"{t['id']}.json").write_text(
                json.dumps(detail, ensure_ascii=False), encoding="utf-8")

    (OUT / "index.json").write_text(json.dumps({
        "generated_at": generated,
        "model": "journeys_v1",
        "n_trips": len(trips),
        "types": index_types,
        "attribution": ["Photographs from Wikimedia Commons via Wikipedia; "
                        "each image credits and links its source page."],
    }, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(trips)} journeys, {len(index_types)} styles)")


if __name__ == "__main__":
    main()
