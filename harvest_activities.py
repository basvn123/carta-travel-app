"""
harvest_activities.py - the "things to do" layer (schema v10).

For every destination, fetch a short list of real, named attractions (sights /
museums / landmarks) and store them in `dest.activities`. Same data-driven,
citable, free ethos as the rest of the app.

Source tiers (auto-selected, best first):

  1. OpenTripMap (PREFERRED - the user's pick). Free POI API with an importance
     `rate` per place. Needs a free key (https://opentripmap.io/product ->
     dashboard). Provide it via OPENTRIPMAP_KEY env var OR a one-line file
     `cache/otm_key.txt`. When a key is present this is used for every dest.

  2. Wikivoyage "See / Do" listings (no key). The curated, human-written travel
     guide - the same source as the app's "Open the {city} travel guide" link.
     Excellent for towns and gems (real top sights, editorially ordered).

  3. Wikipedia GeoSearch at the CITY-CENTRE coordinates (no key). Rescues the
     mega-cities whose sights live in Wikivoyage district sub-pages (Madrid,
     Barcelona...). City-centre coords are resolved from the city's Wikipedia
     article - NOT the destination's stored lat/lon, which for airport-tier rows
     is the airport (so a naive geosearch returns airport-district noise).

All tiers emit the SAME shape so the app never cares which ran:
    dest.activities = {
      "source": "opentripmap" | "wikivoyage" | "wikipedia_geosearch",
      "items": [ {"name", "kind", "link"?}, ... up to TOP_N ],
      "items_full": [ {"name", "kind", "lat", "lon", "rate",     # OpenTripMap only
                       "active"?, "img"?, "desc"?, "wiki"?}, ... up to TOP_N_FULL + actives ]
    }

items_full extras (schema v12):
  rate      OpenTripMap popularity, normalized to 0..3 (3 = must-see tier,
            2 = very interesting, 1 = notable). The app's must-see gradation
            is driven by this, with `heritage` as the tie-break.
  heritage  True when the place is on a cultural-heritage register (OTM's
            "h"-rates / numeric 5..7).
  active  True for "get active" POIs (sport / amusements / natural kinds) fetched
          in a second, lower-rate query - beaches, trails, water parks, climbing...
  img     Wikipedia lead-image thumbnail URL, when the POI name resolves to an
          article whose coordinates sit within WIKI_MATCH_KM of the POI (guards
          against same-name places in other cities).
  desc    The article's one-line description, same validation.
  wiki    The article URL.

`items_full` is the Day Planner's data: more POIs, each with coordinates for
map pins. Only OpenTripMap returns per-item coordinates, so it's absent
(dest.activities has no "items_full" key) for Wikivoyage/geosearch-sourced
destinations - the Day Planner falls back to the name-only `items` list for
those, flagged as limited data.

Phases (idempotent, resumable - mirrors harvest_images.py):
  harvest()  -> cache/activities.json (one entry per dest id)
  patch()    -> writes dest.activities into both app_data.json files

Run:  python harvest_activities.py            # harvest, enrich, then patch
      python harvest_activities.py harvest    # harvest only
      python harvest_activities.py enrich     # Wikipedia cards for cached POIs, then patch
      python harvest_activities.py patch      # patch only (from cache)
      python harvest_activities.py refresh    # drop cache, re-fetch all, enrich, patch

ASCII-clean (no emoji/dingbats) per project convention.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

from pipeline_io import atomic_write_json

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent
CACHE = ROOT / "cache" / "activities.json"
KEY_FILE = ROOT / "cache" / "otm_key.txt"
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
PRIMARY = TARGETS[0]

TOP_N = 8
TOP_N_FULL = 40            # items_full cap (OpenTripMap only) - Day Planner's pool
TOP_N_ACTIVE = 12          # extra "get active" POIs appended to items_full
MIN_WIKIVOYAGE_SEE = 4     # below this, fall back to city-centre geosearch
GEO_RADIUS_M = 5000
OTM_RADIUS_M = 9000
DELAY_S = 1.1              # Wikimedia rate-limits hard; stay well under ~1 req/s
OTM_DELAY_S = 0.15         # OpenTripMap free tier allows ~10 req/s
WIKI_MATCH_KM = 30         # max POI<->article distance for name-match enrichment
ACTIVE_KINDS = "sport,amusements,natural"  # OTM kind groups for "get active"
BACKOFFS = [20, 45, 90]   # 429 cool-downs
HEADERS = {"User-Agent": "CartaTravelApp/1.0 (portfolio project)",
           "Accept": "application/json"}

OTM_BASE = "https://api.opentripmap.com/0.1/en/places/radius"
WIKI_API = "https://en.wikipedia.org/w/api.php"
VOY_API = "https://en.wikivoyage.org/w/api.php"

# A friendly single-word category from any free text (name/kinds/description).
# Active/experience needles come first so e.g. "dive_centers" doesn't fall
# through to a generic label.
KIND_LABEL = [
    ("sauna", "Sauna & baths"), ("baths", "Thermal baths"),
    ("pool", "Swimming"), ("ferris", "Ferris wheel"),
    ("water_park", "Water park"),
    ("amusement", "Theme park"), ("theme_park", "Theme park"),
    ("climb", "Climbing"), ("dive", "Diving"),
    ("snorkel", "Snorkeling"), ("surf", "Surfing"), ("kayak", "Kayaking"),
    ("raft", "Rafting"), ("skiing", "Skiing"), ("winter_sport", "Skiing"),
    ("golf", "Golf"), ("horse", "Horse riding"), ("cycling", "Cycling"),
    ("hiking", "Hiking"), ("trail", "Trail"), ("geyser", "Geyser"),
    ("canyon", "Canyon"), ("dune", "Dunes"), ("nature_reserve", "Nature reserve"),
    ("mountain_peak", "Peak"), ("glacier", "Glacier"),
    ("cathedral", "Cathedral"), ("basilica", "Basilica"), ("church", "Church"),
    ("monaster", "Monastery"), ("convent", "Convent"), ("chapel", "Chapel"),
    ("mosque", "Mosque"), ("synagogue", "Synagogue"), ("castle", "Castle"),
    ("fortress", "Fortress"), ("citadel", "Citadel"), ("palace", "Palace"),
    ("museum", "Museum"), ("galler", "Gallery"), ("theatre", "Theatre"),
    ("opera", "Opera"), ("library", "Library"), ("bridge", "Bridge"),
    ("tower", "Tower"), ("gate", "Gate"), ("square", "Square"),
    ("plaza", "Square"), ("plac", "Square"), ("monument", "Monument"),
    ("memorial", "Memorial"), ("statue", "Statue"), ("fountain", "Fountain"),
    ("archaeolog", "Ancient site"), ("ruins", "Ruins"), ("roman", "Roman site"),
    ("temple", "Temple"), ("garden", "Garden"), ("park", "Park"),
    ("market", "Market"), ("zoo", "Zoo"), ("aquarium", "Aquarium"),
    ("brewer", "Brewery"), ("winer", "Winery"), ("cave", "Cave"),
    ("waterfall", "Waterfall"), ("lake", "Lake"), ("beach", "Beach"),
    ("viewpoint", "Viewpoint"), ("view point", "Viewpoint"),
    ("lighthouse", "Lighthouse"), ("tour", "Tour"), ("festival", "Festival"),
]

# Geosearch keep/drop on the article's short description.
GEO_KEEP = ("church", "cathedral", "basilica", "abbey", "monaster", "convent",
            "chapel", "museum", "gallery", "palace", "castle", "fortress",
            "citadel", "park", "garden", "monument", "memorial", "square",
            "plaza", "tower", "theatre", "opera", "market", "bridge", "temple",
            "fountain", "gate", "library", "old town", "archaeolog", "ruins",
            "roman", "cathedral", "promenade", "lighthouse", "viewpoint",
            "waterfall", "beach", "spa", "thermal", "zoo", "aquarium")
GEO_DROP = ("railway station", "metro station", "tram stop", "bus station",
            "airport", "motorway", "highway", "road in", "street in", "avenue",
            "ward of", "district of", "neighbourhood", "neighborhood", "suburb",
            "administrative", "municipality", "university", "hospital", "school",
            "company", "headquarters", "office building", "football", "stadium")
VOY_DROP = ("tourist office", "tourist information", "airport", "railway",
            "train station", "bus station", "metro station", "card", "pass",
            "tour operator", "consulate", "embassy", "rental", "car hire")

# Local-language Wikipedia(s) to try, in order, once en.wikipedia has no
# match - most of this dataset's minor sights (small palazzi, parish
# churches...) only ever got written up in their own country's Wikipedia.
# Empty list = English-speaking, no second pass needed.
COUNTRY_LANG = {
    "Albania": ["sq"], "Andorra": ["ca"], "Austria": ["de"],
    "Belgium": ["nl", "fr"], "Bosnia and Herzegovina": ["bs", "hr", "sr"],
    "Bulgaria": ["bg"], "Croatia": ["hr"], "Cyprus": ["el"],
    "Czechia": ["cs"], "Denmark": ["da"], "Estonia": ["et"],
    "Faroe Islands": ["fo", "da"], "Finland": ["fi"], "France": ["fr"],
    "Germany": ["de"], "Greece": ["el"], "Hungary": ["hu"],
    "Iceland": ["is"], "Ireland": [], "Italy": ["it"],
    "Kosovo": ["sq", "sr"], "Latvia": ["lv"], "Liechtenstein": ["de"],
    "Lithuania": ["lt"], "Luxembourg": ["fr", "de"], "Malta": ["mt"],
    "Moldova": ["ro"], "Monaco": ["fr"], "Montenegro": ["sr", "hr"],
    "Netherlands": ["nl"], "North Macedonia": ["mk"], "Norway": ["no"],
    "Poland": ["pl"], "Portugal": ["pt"], "Romania": ["ro"],
    "San Marino": ["it"], "Serbia": ["sr"], "Slovakia": ["sk"],
    "Slovenia": ["sl"], "Spain": ["es", "ca"], "Sweden": ["sv"],
    "Switzerland": ["de", "fr", "it"], "United Kingdom": [],
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def otm_key():
    k = os.environ.get("OPENTRIPMAP_KEY")
    if not k and KEY_FILE.exists():
        k = KEY_FILE.read_text(encoding="utf-8").strip()
    return k or None


def get_json(url, base_headers=HEADERS):
    req = urllib.request.Request(url, headers=base_headers)
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


def label_from(text, default="Sight"):
    s = (text or "").lower()
    for needle, label in KIND_LABEL:
        if needle in s:
            return label
    return default


def haversine_km(lat1, lon1, lat2, lon2):
    import math
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def clean_city(city):
    """City name fit for a Wikivoyage/Wikipedia title: drop the airport qualifier
    in parens AND the trailing half of a compound gem name, so
    'Galway & Cliffs of Moher' -> 'Galway', 'Soca Valley (Bovec)' -> 'Soca Valley',
    'Spis Castle & Levoca' -> 'Spis Castle'."""
    s = re.sub(r"\s*\(.*?\)\s*", "", (city or "")).strip()
    s = re.split(r"\s*[/&]\s*|\s+&\s+", s)[0].strip()
    return s or (city or "")


# ---------------------------------------------------------------------------
# City-centre coordinates from the city's Wikipedia article.
# ---------------------------------------------------------------------------
def city_center(city, country):
    for title in (city, f"{city}, {country}"):
        d = get_json(WIKI_API + "?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "titles": title, "redirects": "1", "prop": "coordinates",
        }))
        pages = (d or {}).get("query", {}).get("pages", [])
        if pages and pages[0].get("coordinates"):
            c = pages[0]["coordinates"][0]
            return c.get("lat"), c.get("lon")
    return None, None


# ---------------------------------------------------------------------------
# Tier 1: OpenTripMap
# ---------------------------------------------------------------------------
def _rate_parts(r):
    """Normalize OTM's importance rate. The radius API returns 1..3 for plain
    popularity and 5..7 for the heritage variants (5=1h, 6=2h, 7=3h). String
    forms ('3h') from other endpoints are handled too. Returns (base, heritage)
    with base 0..3 - base is the popularity, heritage a boolean flag."""
    s = str(r.get("rate", "0"))
    v = int("".join(c for c in s if c.isdigit()) or 0)
    heritage = "h" in s or v >= 4
    base = v - 4 if v >= 4 else v
    return max(0, min(3, base)), heritage


# 'sport' includes venues that aren't traveller activities; skip them.
ACTIVE_DROP_KINDS = ("stadiums", "fitness", "gyms")


def otm_radius(lat, lon, key, kinds, rate_min, limit):
    url = OTM_BASE + "?" + urllib.parse.urlencode({
        "radius": OTM_RADIUS_M, "lon": lon, "lat": lat,
        "kinds": kinds, "rate": rate_min, "format": "json",
        "limit": limit, "apikey": key,
    })
    data = get_json(url)
    return data if isinstance(data, list) else None


def _otm_pick(data, cap, seen, extra=None, default_kind="Sight", drop_kinds=()):
    """Ranked, de-duplicated {name, kind, lat, lon, rate, heritage?, ...} list.
    Order: popularity base desc, heritage flag as tie-break (3h > 3 > 2h > 2),
    then the API's own order (distance from the centre - a sane final tie-break
    for a walking day)."""
    def sort_key(p):
        base, her = _rate_parts(p)
        return (base, her)
    out = []
    for p in sorted(data or [], key=sort_key, reverse=True):
        name = (p.get("name") or "").strip()
        kinds = p.get("kinds") or ""
        if not name or name.lower() in seen:
            continue
        if any(k in kinds for k in drop_kinds):
            continue
        seen.add(name.lower())
        point = p.get("point") or {}
        base, heritage = _rate_parts(p)
        it = {
            "name": name, "kind": label_from(kinds, default_kind),
            "lat": point.get("lat"), "lon": point.get("lon"),
            "rate": base,
        }
        if heritage:
            it["heritage"] = True
        if extra:
            it.update(extra)
        out.append(it)
        if len(out) >= cap:
            break
    return out


def otm_items(lat, lon, key):
    """Sights (interesting_places, rate>=2) + a second, lower-bar query for
    "get active" POIs (sport / amusements / natural). Both keep the importance
    rate - it drives the app's must-see gradation."""
    sights_raw = otm_radius(lat, lon, key, "interesting_places", "2", 60)
    if sights_raw is None:
        return None
    seen = set()
    full_items = _otm_pick(sights_raw, TOP_N_FULL, seen)
    if not full_items:
        return None
    time.sleep(OTM_DELAY_S)
    active_raw = otm_radius(lat, lon, key, ACTIVE_KINDS, "1", 40)
    full_items += _otm_pick(active_raw, TOP_N_ACTIVE, seen,
                            extra={"active": True}, default_kind="Activity",
                            drop_kinds=ACTIVE_DROP_KINDS)
    items = [{"name": i["name"], "kind": i["kind"]} for i in full_items[:TOP_N]]
    return {"source": "opentripmap", "items": items, "items_full": full_items}


# ---------------------------------------------------------------------------
# Tier 2: Wikivoyage See / Do listings
# ---------------------------------------------------------------------------
def _templates(w):
    """Yield each {{...}} template body (brace-balanced)."""
    i, n = 0, len(w)
    while True:
        j = w.find("{{", i)
        if j < 0:
            break
        depth, k = 0, j
        while k < n:
            if w[k:k + 2] == "{{":
                depth += 1; k += 2; continue
            if w[k:k + 2] == "}}":
                depth -= 1; k += 2
            else:
                k += 1
            if depth == 0:
                break
        yield w[j:k]
        i = k


def _field(body, name):
    m = re.search(r"\|\s*" + name + r"\s*=\s*([^|}\n]*)", body, re.I)
    return (m.group(1).strip() if m else "")


def wikivoyage_items(city):
    d = get_json(VOY_API + "?" + urllib.parse.urlencode({
        "action": "parse", "page": city, "prop": "wikitext",
        "format": "json", "redirects": "1",
    }))
    w = ((d or {}).get("parse", {}).get("wikitext", {}) or {}).get("*", "")
    if not w:
        return [], []
    sees, dos = [], []
    for t in _templates(w):
        head = t[2:].lstrip().split("|", 1)[0].strip().lower()
        typ = _field(t, "type").lower()
        kind = "see" if head == "see" or (head == "listing" and typ == "see") else (
            "do" if head == "do" or (head == "listing" and typ == "do") else None)
        if not kind:
            continue
        nm = _field(t, "name") or _field(t, "alt")
        nm = re.sub(r"\[\[|\]\]|'{2,}", "", nm).strip()
        if not nm or any(x in nm.lower() for x in VOY_DROP):
            continue
        (sees if kind == "see" else dos).append(nm)
    return sees, dos


# ---------------------------------------------------------------------------
# Tier 3: Wikipedia GeoSearch at the city centre
# ---------------------------------------------------------------------------
def geosearch_items(lat, lon, city):
    d = get_json(WIKI_API + "?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "geosearch", "ggscoord": f"{lat}|{lon}",
        "ggsradius": GEO_RADIUS_M, "ggslimit": 60, "ggsnamespace": "0",
        "prop": "description|info", "inprop": "url",
    }))
    pages = (d or {}).get("query", {}).get("pages", [])
    cityl = (city or "").lower()
    items, seen = [], set()
    for p in pages:
        title = p.get("title") or ""
        desc = (p.get("description") or "")
        dl = desc.lower()
        if not title or title.lower() == cityl or title.lower() in seen:
            continue
        if any(x in dl for x in GEO_DROP):
            continue
        if not any(x in dl for x in GEO_KEEP):
            continue
        seen.add(title.lower())
        items.append({"name": title, "kind": label_from(desc),
                      "link": p.get("fullurl")})
        if len(items) >= TOP_N:
            break
    return items


def activities_for(dest, key):
    """Calls are ordered to MINIMISE requests (Wikimedia rate-limits hard): most
    towns/gems resolve in ONE Wikivoyage call; only thin cities pay the extra
    coord + geosearch calls."""
    city = clean_city(dest.get("city"))
    country = (dest.get("country") or "").strip()

    # Tier 1: OpenTripMap (only when a key is configured). Needs centre coords.
    if key:
        clat, clon = city_center(city, country)
        if clat is None:
            clat, clon = dest.get("lat"), dest.get("lon")
        if clat is not None:
            res = otm_items(clat, clon, key)
            if res:
                return res

    # Tier 2: Wikivoyage curated See/Do - ONE call, great for towns + gems.
    sees, dos = wikivoyage_items(city)
    if len(sees) >= MIN_WIKIVOYAGE_SEE:
        names = (sees + dos)[:TOP_N]
        return {"source": "wikivoyage",
                "items": [{"name": n, "kind": label_from(n)} for n in names]}

    # Tier 3: Wikipedia geosearch at the city centre (rescues mega-cities whose
    # sights live in Wikivoyage district sub-pages). Two more calls - only here.
    clat, clon = city_center(city, country)
    if clat is None:
        clat, clon = dest.get("lat"), dest.get("lon")
    if clat is not None:
        items = geosearch_items(clat, clon, city)
        if items:
            return {"source": "wikipedia_geosearch", "items": items}

    # Last resort: whatever Wikivoyage gave, even if sparse.
    names = (sees + dos)[:TOP_N]
    if names:
        return {"source": "wikivoyage",
                "items": [{"name": n, "kind": label_from(n)} for n in names]}
    return None


def _resolve_map(requested, normalized, redirects):
    """MediaWiki normalises titles and follows redirects; build a
    requested-title -> final-page-title map from the response's hint arrays."""
    step = {}
    for n in (normalized or []):
        step[n["from"]] = n["to"]
    for r in (redirects or []):
        step[r["from"]] = r["to"]
    out = {}
    for t in requested:
        cur, seen = t, set()
        while cur in step and cur not in seen:
            seen.add(cur)
            cur = step[cur]
        out[t] = cur
    return out


def _chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def batch_voy_wikitext(titles):
    """{title -> wikitext} for many Wikivoyage pages, 50 per request."""
    out = {}
    for chunk in _chunks(list(titles), 50):
        d = get_json(VOY_API + "?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "revisions", "rvprop": "content", "rvslots": "main",
            "redirects": "1", "titles": "|".join(chunk),
        }))
        q = (d or {}).get("query", {})
        rmap = _resolve_map(chunk, q.get("normalized"), q.get("redirects"))
        final = {}
        for p in q.get("pages", []):
            if p.get("missing"):
                continue
            revs = p.get("revisions") or []
            if not revs:
                continue
            content = (revs[0].get("slots", {}).get("main", {}) or {}).get("content", "")
            final[p.get("title")] = content
        for t in chunk:
            out[t] = final.get(rmap.get(t, t), "")
        time.sleep(DELAY_S)
    return out


def batch_coords(titles):
    """{title -> (lat,lon)} for many Wikipedia articles, 50 per request."""
    out = {}
    for chunk in _chunks(list(titles), 50):
        d = get_json(WIKI_API + "?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "coordinates", "redirects": "1", "titles": "|".join(chunk),
        }))
        q = (d or {}).get("query", {})
        rmap = _resolve_map(chunk, q.get("normalized"), q.get("redirects"))
        final = {}
        for p in q.get("pages", []):
            c = (p.get("coordinates") or [{}])[0]
            if c.get("lat") is not None:
                final[p.get("title")] = (c["lat"], c["lon"])
        for t in chunk:
            out[t] = final.get(rmap.get(t, t))
        time.sleep(DELAY_S)
    return out


def batch_wiki_cards(titles, lang="en"):
    """{requested title -> {img?, desc?, wiki?, lat?, lon?}} for many Wikipedia
    articles in one 50-per-request query (lead thumbnail + one-line description
    + coordinates + canonical URL). `lang` picks the Wikipedia edition (e.g.
    "it" for Italian) so local-only sights can be found once en.wikipedia has
    no article for them."""
    api = f"https://{lang}.wikipedia.org/w/api.php"
    out = {}
    for chunk in _chunks(list(titles), 50):
        d = get_json(api + "?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "pageimages|description|coordinates|info", "inprop": "url",
            "piprop": "thumbnail", "pithumbsize": "400",
            "redirects": "1", "titles": "|".join(chunk),
        }))
        q = (d or {}).get("query", {})
        rmap = _resolve_map(chunk, q.get("normalized"), q.get("redirects"))
        final = {}
        for p in q.get("pages", []):
            if p.get("missing"):
                continue
            card = {}
            thumb = (p.get("thumbnail") or {}).get("source")
            if thumb:
                card["img"] = thumb
            if p.get("description"):
                card["desc"] = p["description"]
            if p.get("fullurl"):
                card["wiki"] = p["fullurl"]
            c = (p.get("coordinates") or [{}])[0]
            if c.get("lat") is not None:
                card["lat"], card["lon"] = c["lat"], c["lon"]
            if card:
                final[p.get("title")] = card
        for t in chunk:
            card = final.get(rmap.get(t, t))
            if card:
                out[t] = card
        time.sleep(DELAY_S)
    return out


def _missing_cards(cache, dests, lang_round=None):
    """Yield (dest_id, item) for every items_full POI still lacking a
    Wikipedia card. `lang_round` is None for the en.wikipedia pass (every
    destination), or an int N for the Nth local-language fallback pass
    (only destinations whose country has an (N+1)th candidate language)."""
    for did, rec in cache.items():
        if not rec:
            continue
        if lang_round is not None:
            langs = COUNTRY_LANG.get((dests.get(did) or {}).get("country"), [])
            if lang_round >= len(langs):
                continue
        for it in rec.get("items_full") or []:
            if it.get("wiki") or it.get("lat") is None:
                continue
            yield did, it


def _run_enrich_pass(cache, lang, items):
    """Batch-fetch `lang`.wikipedia cards for the given (dest_id, item) pairs
    and merge matches (coordinate-validated) straight into the cache's item
    dicts. Returns the number of matches."""
    wanted = {}
    for _did, it in items:
        wanted.setdefault(it["name"], []).append(it)
    names = sorted(wanted)
    if not names:
        return 0
    print(f"Enriching {len(names)} unique POI names from {lang}.wikipedia "
          f"(~{(len(names) + 49) // 50} batched calls)...")
    hits = 0
    for gi, group in enumerate(_chunks(names, 50 * 20), 1):  # checkpoint block
        cards = batch_wiki_cards(group, lang)
        for name, card in cards.items():
            if card.get("lat") is None:
                continue  # no coords -> can't validate the match
            for it in wanted[name]:
                if haversine_km(it["lat"], it["lon"], card["lat"], card["lon"]) > WIKI_MATCH_KM:
                    continue
                for k in ("img", "desc", "wiki"):
                    if card.get(k):
                        it[k] = card[k]
                hits += 1
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        done = min(gi * 50 * 20, len(names))
        print(f"  {lang}: block {gi}: {done}/{len(names)} names, {hits} matches so far")
    return hits


def enrich(cache, dests):
    """Attach Wikipedia img/desc/wiki to every items_full POI whose name
    resolves to an article with coordinates within WIKI_MATCH_KM of the POI
    (rejects same-name places elsewhere and coordinate-less disambiguation
    pages). Tries en.wikipedia first for every POI, then falls back to each
    destination's own country's Wikipedia edition(s) (COUNTRY_LANG) for
    whatever's still missing - most minor local sights (small palazzi, parish
    churches...) were only ever written up in their own language. Skips items
    already enriched, so a resumed run only fetches the remainder."""
    total = _run_enrich_pass(cache, "en", list(_missing_cards(cache, dests)))
    max_rounds = max((len(v) for v in COUNTRY_LANG.values()), default=0)
    for round_idx in range(max_rounds):
        by_lang = {}
        for did, it in _missing_cards(cache, dests, lang_round=round_idx):
            lang = COUNTRY_LANG[dests[did]["country"]][round_idx]
            by_lang.setdefault(lang, []).append((did, it))
        for lang, items in by_lang.items():
            total += _run_enrich_pass(cache, lang, items)
    print(f"Enrich done: {total} POI occurrences got a Wikipedia card.")
    return cache


def _voy_from_wikitext(w):
    sees, dos = [], []
    for t in _templates(w or ""):
        head = t[2:].lstrip().split("|", 1)[0].strip().lower()
        typ = _field(t, "type").lower()
        kind = "see" if head == "see" or (head == "listing" and typ == "see") else (
            "do" if head == "do" or (head == "listing" and typ == "do") else None)
        if not kind:
            continue
        nm = _field(t, "name") or _field(t, "alt")
        nm = re.sub(r"\[\[|\]\]|'{2,}", "", nm).strip()
        if not nm or any(x in nm.lower() for x in VOY_DROP):
            continue
        (sees if kind == "see" else dos).append(nm)
    return sees, dos


def harvest_batched(dests, todo):
    """No-key path: resolve almost everything in batched 50-per-call requests
    (Wikimedia rate-limits hard), and only fall back to per-destination geosearch
    for the handful of thin cities. ~30 calls instead of ~500."""
    cache = load_json(CACHE) if CACHE.exists() else {}
    cities = {did: clean_city(d.get("city")) for did, d in todo}
    print(f"Batched Wikivoyage fetch for {len(set(cities.values()))} titles...")
    voy = batch_voy_wikitext(sorted(set(cities.values())))

    thin = []          # (did, dest, city) needing the geosearch fallback
    for did, d in todo:
        city = cities[did]
        sees, dos = _voy_from_wikitext(voy.get(city, ""))
        if len(sees) >= MIN_WIKIVOYAGE_SEE:
            names = (sees + dos)[:TOP_N]
            cache[did] = {"source": "wikivoyage",
                          "items": [{"name": n, "kind": label_from(n)} for n in names]}
        else:
            cache[did] = {"_voy_spare": (sees + dos)[:TOP_N]}  # placeholder
            thin.append((did, d, city))

    print(f"Wikivoyage covered {len(todo) - len(thin)}; {len(thin)} thin cities "
          f"need centre-coords + geosearch")
    coords = batch_coords(sorted({c for _, _, c in thin}))

    for n, (did, d, city) in enumerate(thin, 1):
        clat, clon = (coords.get(city) or (d.get("lat"), d.get("lon")))
        res = None
        if clat is not None:
            items = geosearch_items(clat, clon, city)
            if items:
                res = {"source": "wikipedia_geosearch", "items": items}
        if not res:
            spare = cache[did].get("_voy_spare") or []
            res = ({"source": "wikivoyage",
                    "items": [{"name": x, "kind": label_from(x)} for x in spare]}
                   if spare else None)
        cache[did] = res
        print(f"  geosearch [{n}/{len(thin)}] {d.get('city')}: "
              f"{len(res['items']) if res else 0}")
        if n % 20 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(DELAY_S)

    # Clean any leftover placeholders (dests with neither sees nor geosearch).
    for did, v in list(cache.items()):
        if isinstance(v, dict) and "_voy_spare" in v:
            cache[did] = None
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    hits = sum(1 for v in cache.values() if v)
    print(f"Harvest done: {hits}/{len(cache)} have activities. Cache: {CACHE}")
    return cache


def harvest(dests, resume=True):
    key = otm_key()
    if not key:
        cache = load_json(CACHE) if (resume and CACHE.exists()) else {}

        def _needs(i):
            v = cache.get(i, None)
            return (i not in cache) or (not v) or (not v.get("items"))
        todo = [(i, d) for i, d in dests.items()
                if d.get("lat") is not None and _needs(i)]
        print(f"Harvesting activities (batched, no key): {len(todo)} to fetch, "
              f"{len(cache)} cached")
        if not todo:
            return cache
        return harvest_batched(dests, todo)
    # --- keyed (OpenTripMap) path ---
    print("Activities tier-1: OpenTripMap (key found)")
    cache = {}
    if resume and CACHE.exists():
        cache = load_json(CACHE)
    todo = [(i, d) for i, d in dests.items()
            if d.get("lat") is not None and (i not in cache or not cache[i])]
    print(f"Harvesting activities: {len(todo)} to fetch, {len(cache)} cached")
    if not todo:
        return cache
    # City-centre coords for every city in one batched pass (~1 call per 50
    # cities) instead of two Wikipedia calls per destination.
    cities = {did: clean_city(d.get("city")) for did, d in todo}
    centers = batch_coords(sorted(set(cities.values())))
    for n, (did, d) in enumerate(todo, 1):
        clat, clon = centers.get(cities[did]) or (d.get("lat"), d.get("lon"))
        res = otm_items(clat, clon, key) if clat is not None else None
        if not res:
            # OTM had nothing here - fall back to the keyless tiers (Wikivoyage
            # See/Do, then city-centre geosearch), same as a no-key run.
            res = activities_for(d, None)
        cache[did] = res
        cnt = len(res["items"]) if res else 0
        print(f"  [{n}/{len(todo)}] {d.get('city')}, {d.get('country')}: "
              f"{cnt} ({res['source'] if res else 'MISS'})")
        if n % 25 == 0:
            CACHE.parent.mkdir(exist_ok=True)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        time.sleep(OTM_DELAY_S)
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
        n_act, n_full, srcs = 0, 0, {}
        for did, d in dests.items():
            rec = cache.get(did)
            if rec and rec.get("items"):
                d["activities"] = rec
                n_act += 1
                srcs[rec["source"]] = srcs.get(rec["source"], 0) + 1
                if rec.get("items_full"):
                    n_full += 1
            elif rec is not None:
                # In the cache but genuinely empty (checked, none found): reflect
                # the empty result so re-runs stay idempotent.
                d["activities"] = None
            # else: not in this cache at all (e.g. a partial/resumed harvest).
            # Leave whatever is already there - do NOT wipe it to None, or a
            # `patch` with a cache that covers fewer dests than the master
            # silently destroys activities for every dest it doesn't mention.
        data.setdefault("meta", {})["activities_model"] = {
            "providers": srcs, "top_n": TOP_N, "top_n_full": TOP_N_FULL,
            "top_n_active": TOP_N_ACTIVE,
            "note": "OpenTripMap when OPENTRIPMAP_KEY set; "
                    "else Wikivoyage See/Do + city-centre Wikipedia geosearch. "
                    "items_full (with coordinates, for Day Planner map pins) is "
                    "OpenTripMap-only and carries: rate 0..3 (3=must-see tier) "
                    "+ heritage flag, active=true for sport/amusements/natural "
                    "POIs, and img/desc/wiki from coordinate-validated "
                    "Wikipedia name matches.",
            "coverage": f"{n_act}/{len(dests)}",
            "items_full_coverage": f"{n_full}/{len(dests)}",
        }
        data["meta"]["schema_version"] = max(12, data["meta"].get("schema_version", 0))
        atomic_write_json(path, data)
        print(f"  {path.name}: {n_act}/{len(dests)} have activities (sources: {srcs}); "
              f"{n_full}/{len(dests)} have items_full (map pins)")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    data = load_json(PRIMARY)
    dests = data.get("destinations", {})
    if cmd == "refresh" and CACHE.exists():
        CACHE.unlink()
    cache = None
    if cmd in ("all", "harvest", "refresh"):
        cache = harvest(dests, resume=(cmd != "refresh"))
    if cmd in ("all", "enrich", "refresh"):
        if cache is None:
            cache = load_json(CACHE) if CACHE.exists() else {}
        cache = enrich(cache, dests)
    if cmd in ("all", "patch", "enrich", "refresh"):
        patch(cache)


if __name__ == "__main__":
    main()
