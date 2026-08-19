"""enrich_wikidata.py - the identity pass: QIDs, articles, elevations.

Stage 2 of the natural-features pipeline (see features_common.py for the stage
map). build_features.py can say where a beach is and how clean its water is,
but it can not say how high a summit stands or how widely either is written
about: the POI layer carries no elevation field at all (the audit counted
9,794 "Peak" rows and not one metre of height), and four features in five
carry no article link. Wikidata knows both, under CC0, for the price of a
polite query.

What this stage fills, in place, on data/derived/features_raw.json:

    wikidata            the QID, when we can prove the item IS this feature
    wikipedia           "en:Title", when the item has an English article
    name_local          P1705 native label, or the label in the local language
    elevation_m         P2044, mountains only, unit-checked
    prominence_m        P2660, mountains only, unit-checked
    signals.sitelinks   language-neutral notability, straight from the item
    signals.pageviews   attention, via the same client harvest_pageviews.py uses
    provenance.wikidata the match itself: method, distance, confidence, and
                        the P31 classes when the item is not of the kind's own
                        class tree (a "peak" that Wikidata calls a wine region)

Matching is the whole job, and name alone can not do it: Europe has dozens of
"Playa Grande" and every valley has a Monte Rosso. Two paths, both recorded:

  1. QID. The POI layer resolved 3,322 features to a QID already, through the
     article its harvest found. That is an identity somebody else established,
     so it is used as-is, but the item's P31 is checked against the kind's
     class tree before any measurement is copied off it: an island filed as a
     summit must not lend the summit its elevation.
  2. Name plus distance. Per country, every Wikidata item of the kind's class
     tree with coordinates, matched to a feature when a name_core agrees AND
     the two sit within 2 km (beach) or 3 km (mountain). A weaker token-subset
     match is allowed at half that radius and scored lower, never above it.

The mountain class tree needs three roots, not one. Britain has 3,079 items
under Q8502 mountain, 2,809 under Q207326 summit and 5,155 under Q54050 hill:
querying only the first would throw away three quarters of the country.

Network shape, measured against the live endpoint before this was written:
a whole-country query for a small country costs 5 to 10 s, but Spain's 10,341
mountains time out at the service's 60 s ceiling. So the unit of work is a
country, and a country that times out is split into quadrants of its own
feature bounding box and retried, recursively. Every leaf that succeeds is
cached under its own key in cache/features_wikidata.json, so a killed run
resumes at the tile it died on and a rerun costs nothing.

Idempotent: matching is recomputed from the cache on every run and only ever
fills fields that are still None, so a rerun can not duplicate or drift. The
one field it does rewrite is signals.sitelinks, where the item's own count is
by definition fresher than the copy the POI layer cached.

Usage:
    python pipeline/features/enrich_wikidata.py
    python pipeline/features/enrich_wikidata.py --country ES,AD --verbose
    python pipeline/features/enrich_wikidata.py --limit 8
    python pipeline/features/enrich_wikidata.py --country ES --refresh
"""
import argparse
import gzip
import http.client
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from features_common import (GeoIndex, RAW_FEATURES, ROOT,
                             WIKIDATA_FEATURE_CACHE, catalogue_countries,
                             haversine_km, load_json, log, name_core,
                             save_json)

# The pageviews client is already written, already polite and already knows
# the 12-full-month window every other fame signal in this repo uses. Importing
# it beats a second implementation that would drift from the first.
sys.path.insert(0, str(ROOT / "pipeline"))
import enrich_activities as ea  # noqa: E402

ENDPOINT = "https://query.wikidata.org/sparql"
HEADERS = {
    "User-Agent": ("CartaTravelApp-features/1.0 "
                   "(https://carta-europetravel.com; "
                   "contact: data@carta-europetravel.com)"),
    "Accept": "application/sparql-results+json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
}

# Class roots per kind. Mountains need three: the trees do not overlap (0 QIDs
# shared between mountain and summit, 9 between mountain and hill), and Britain
# and Ireland file almost everything under the two that are not Q8502.
CLASS_ROOTS = {
    "beach": ["Q40080"],                          # beach
    "mountain": ["Q8502", "Q207326", "Q54050"],   # mountain, summit, hill
}

# Match radii. A beach is a line, not a point, and the two records may pin
# opposite ends of it; a summit is a point and both records should agree on it,
# but Wikidata rounds coordinates to the arcsecond and OSM pins the cairn.
MATCH_KM = {"beach": 2.0, "mountain": 3.0}
WEAK_FACTOR = 0.5                # token-subset matches must be twice as close
WEAK_MIN_CHARS = 5               # "Vai" may not be a token subset of anything

# Units seen on P2044/P2660 in the live data. Anything else stays None: an
# elevation whose unit we can not read is not an elevation we can publish.
UNIT_M = {
    "Q11573": 1.0,               # metre
    "Q3710": 0.3048,             # foot
    "Q828224": 1000.0,           # kilometre
    "Q110272053": 1.0,           # elevation above sea level in metres
}
ELEVATION_MAX_M = 5000           # Mont Blanc is 4,808; above this is a unit bug

# Local-language labels to ask for, per catalogue country, on top of English.
# A Galician beach is logged as "Praia de ...", a Basque summit as "-mendi";
# without the local label the name match has nothing to compare against.
LOCAL_LANGS = {
    "AD": ["ca"], "AL": ["sq"], "AT": ["de"], "BA": ["bs", "hr", "sr"],
    "BE": ["nl", "fr", "de"], "BG": ["bg"], "CH": ["de", "fr", "it", "rm"],
    "CY": ["el", "tr"], "CZ": ["cs"], "DE": ["de"], "DK": ["da"], "EE": ["et"],
    "ES": ["es", "ca", "gl", "eu"], "FI": ["fi", "sv"], "FO": ["fo", "da"],
    "FR": ["fr"], "GB": ["cy", "gd", "ga"], "GR": ["el"], "HR": ["hr"],
    "HU": ["hu"], "IE": ["ga"], "IS": ["is"], "IT": ["it", "de"], "LI": ["de"],
    "LT": ["lt"], "LU": ["fr", "de", "lb"], "LV": ["lv"], "MC": ["fr"],
    "MD": ["ro"], "ME": ["sr", "hr"], "MK": ["mk"], "MT": ["mt"], "NL": ["nl"],
    "NO": ["no", "nn"], "PL": ["pl"], "PT": ["pt"], "RO": ["ro"], "RS": ["sr"],
    "SE": ["sv"], "SI": ["sl"], "SK": ["sk"], "SM": ["it"], "XK": ["sq", "sr"],
}
LABEL_SLOTS = 4                  # lab_a..lab_d, one OPTIONAL each

# Query budget. The service kills a query at 60 s, so a country that fails is
# split rather than retried forever; only a rate limit is worth waiting out.
HTTP_TIMEOUT_S = 180
POLITE_S = 2.0                   # between queries, one client, no threads
RETRY_BACKOFF = [5, 20]          # transient 5xx: the endpoint is flaky at load
MAX_SPLIT_DEPTH = 3              # country -> 4 -> 16 -> 64 tiles, then give up
BOX_PAD_DEG = 0.2                # ~22 km, wider than any match radius
QID_BATCH = 200                  # VALUES chunk for the by-QID lookups

PV_WORKERS = 8                   # the politeness cap harvest_pageviews.py uses
PV_DELAY_S = 0.05

WIKIDATA_SOURCE = {"name": "Wikidata (CC0)", "url": "https://www.wikidata.org"}


class QueryTooBig(Exception):
    """The endpoint could not finish this scope: split it, do not retry it."""


# --------------------------------------------------------------------------- #
# the client
# --------------------------------------------------------------------------- #
def sparql(query, label=""):
    """POST a query, return its bindings. POST because the class-tree and
    VALUES queries run past what a URL should carry, and because WDQS caches
    nothing for us either way."""
    body = urllib.parse.urlencode({"query": query,
                                   "format": "json"}).encode("utf-8")
    for attempt, back in enumerate([0] + RETRY_BACKOFF):
        if back:
            time.sleep(back)
        try:
            req = urllib.request.Request(ENDPOINT, data=body, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as r:
                try:
                    raw = r.read()
                except http.client.IncompleteRead as e:
                    # WDQS streams results chunked and truncates a slow one.
                    # The salvaged prefix is not valid JSON, so treat it as a
                    # scope that is too big rather than as data.
                    raise QueryTooBig(f"{label}: truncated after "
                                      f"{len(e.partial)} bytes")
                if (r.headers.get("Content-Encoding") or "") == "gzip":
                    raw = gzip.decompress(raw)
            return json.loads(raw.decode("utf-8"))["results"]["bindings"]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 60
                try:
                    wait = min(float(e.headers.get("Retry-After") or 60), 120)
                except ValueError:
                    pass
                log(f"    rate limited, waiting {wait:.0f}s")
                time.sleep(wait)
                continue
            if e.code == 504:
                # The service's own verdict that this scope does not fit in
                # its 60 s budget. Retrying buys another 60 s wait and the
                # same answer, so split instead.
                raise QueryTooBig(f"{label}: HTTP 504, over the query budget")
            if e.code in (500, 502, 503):
                if attempt >= len(RETRY_BACKOFF):
                    raise QueryTooBig(f"{label}: HTTP {e.code}")
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt >= len(RETRY_BACKOFF):
                raise QueryTooBig(f"{label}: {type(e).__name__}")
    raise QueryTooBig(f"{label}: out of retries")


# --------------------------------------------------------------------------- #
# queries
# --------------------------------------------------------------------------- #
_MEASURES = """
  OPTIONAL { ?item wdt:P1705 ?native }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item p:P2044/psv:P2044 [ wikibase:quantityAmount ?ele ;
                                       wikibase:quantityUnit ?eleU ] }
  OPTIONAL { ?item p:P2660/psv:P2660 [ wikibase:quantityAmount ?prom ;
                                       wikibase:quantityUnit ?promU ] }
  OPTIONAL { ?item wikibase:sitelinks ?links }
  OPTIONAL { ?article schema:about ?item ;
                      schema:isPartOf <https://en.wikipedia.org/> }"""

# One column per language rather than one grouped string: a label may contain
# any separator character we could pick, and a mis-split label is a wrong name
# match, which is exactly the failure this stage exists to avoid.
_HEAD = """SELECT ?item ?coord ?links ?article
       (SAMPLE(?native) AS ?nat) (SAMPLE(?img) AS ?image)
       %(labelsel)s
       (GROUP_CONCAT(DISTINCT CONCAT(STR(?ele), "^", STR(?eleU));
                     separator="~") AS ?eles)
       (GROUP_CONCAT(DISTINCT CONCAT(STR(?prom), "^", STR(?promU));
                     separator="~") AS ?proms)
WHERE {"""
_TAIL = "\n} GROUP BY ?item ?coord ?links ?article"

_BOX = """
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest
      "Point(%(w).4f %(s).4f)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast
      "Point(%(e).4f %(n).4f)"^^geo:wktLiteral . }"""


def _label_parts(langs):
    """(select columns, optional blocks) for English plus the local languages."""
    sel, opt = [], []
    for i, lang in enumerate(["en"] + list(langs)[:LABEL_SLOTS]):
        var = f"lab{i}"
        sel.append(f"(SAMPLE(?{var}) AS ?l{i})")
        opt.append(f'  OPTIONAL {{ ?item rdfs:label ?{var} '
                   f'FILTER(lang(?{var}) = "{lang}") }}')
    return " ".join(sel), "\n".join(opt)


def scope_query(kind, country_qids, langs, box=None):
    """Every item of the kind's class tree in one country, optionally clipped
    to a box. The class and country patterns come first on purpose: they are
    what makes the scope small enough for the service to finish."""
    sel, opt = _label_parts(langs)
    roots = " ".join("wd:" + q for q in CLASS_ROOTS[kind])
    ctys = " ".join("wd:" + q for q in country_qids)
    spine = [f"  VALUES ?root {{ {roots} }}",
             f"  VALUES ?cty {{ {ctys} }}"]
    if box:
        # The box service binds ?coord itself; asking for P625 twice makes the
        # optimiser scan the coordinate index instead of the class join.
        spine.append("  ?item wdt:P31/wdt:P279* ?root ; wdt:P17 ?cty .")
        w, s, e, n = box
        spine.append(_BOX % {"w": w, "s": s, "e": e, "n": n})
    else:
        spine.append("  ?item wdt:P31/wdt:P279* ?root ; wdt:P17 ?cty ; "
                     "wdt:P625 ?coord .")
    return (_HEAD % {"labelsel": sel} + "\n" + "\n".join(spine) + "\n"
            + opt + _MEASURES + _TAIL)


def items_query(qids, langs):
    """The same row shape for a known QID, plus its P31 classes: a QID the POI
    layer resolved is an identity we did not establish, so the class is the
    only thing that says whether it may lend an elevation."""
    sel, opt = _label_parts(langs)
    vals = " ".join("wd:" + q for q in qids)
    head = _HEAD % {"labelsel": sel}
    head = head.replace("WHERE {",
                        '(GROUP_CONCAT(DISTINCT STR(?cls); separator="~") '
                        'AS ?classes)\nWHERE {')
    return (head + f"\n  VALUES ?item {{ {vals} }}\n"
            "  ?item wdt:P625 ?coord .\n"
            "  OPTIONAL { ?item wdt:P31 ?cls }\n" + opt + _MEASURES + _TAIL)


def tree_query(root):
    return f"SELECT ?c WHERE {{ ?c wdt:P279* wd:{root} }}"


# --------------------------------------------------------------------------- #
# row parsing
# --------------------------------------------------------------------------- #
def _v(row, key):
    return (row.get(key) or {}).get("value") or None


def _point(wkt):
    """"Point(lon lat)" -> (lat, lon), or None when the value is a shape."""
    if not wkt or not wkt.startswith("Point("):
        return None
    try:
        lon, lat = wkt[6:-1].split()
        return float(lat), float(lon)
    except ValueError:
        return None


def _measure(packed, kind_max=None):
    """"2588^http://...Q11573~..." -> metres, or None when no value carries a
    unit we can convert. Multiple statements are common (one per source); the
    smallest is the least likely to be the one with the unit bug."""
    best = None
    for part in (packed or "").split("~"):
        amount, _, unit = part.partition("^")
        factor = UNIT_M.get(unit.rsplit("/", 1)[-1])
        if factor is None:
            continue
        try:
            metres = float(amount) * factor
        except ValueError:
            continue
        if kind_max is not None and not (-500 <= metres <= kind_max):
            continue
        best = metres if best is None else min(best, metres)
    return None if best is None else int(round(best))


def parse_row(row, langs, with_classes=False):
    """The wire row we cache: small, ASCII keys, no SPARQL vocabulary.

        q     QID            names  {lang: label}, English plus the locals
        lat   latitude       nat    P1705 native label
        lon   longitude      en     enwiki title (names["en"] is the LABEL,
        sl    sitelinks             which is often a different string)
        ele   metres         img    Commons file name from P18
        prom  metres         cls    P31 QIDs, by-QID rows only

    with_classes belongs to the by-QID path only. A scope row needs no class
    list, the query already proved it; a by-QID row without one is an item
    whose type nobody has stated, and an unstated type is not a licence to
    copy an elevation off it, so the empty list is recorded rather than
    dropped."""
    pt = _point(_v(row, "coord"))
    if not pt:
        return None
    names = {}
    for i, lang in enumerate(["en"] + list(langs)[:LABEL_SLOTS]):
        label = _v(row, f"l{i}")
        if label:
            names[lang] = label
    article = _v(row, "article")
    img = _v(row, "image")
    rec = {
        "q": _v(row, "item").rsplit("/", 1)[-1],
        "lat": round(pt[0], 6), "lon": round(pt[1], 6),
        "names": names,
    }
    if _v(row, "nat"):
        rec["nat"] = _v(row, "nat")
    if article:
        rec["en"] = urllib.parse.unquote(
            article.rsplit("/wiki/", 1)[-1]).replace("_", " ")
    if img:
        rec["img"] = urllib.parse.unquote(
            img.rsplit("/Special:FilePath/", 1)[-1]).replace("_", " ")
    if _v(row, "links") is not None:
        rec["sl"] = int(_v(row, "links"))
    ele = _measure(_v(row, "eles"), ELEVATION_MAX_M)
    if ele is not None:
        rec["ele"] = ele
    prom = _measure(_v(row, "proms"), ELEVATION_MAX_M)
    if prom is not None:
        rec["prom"] = prom
    if with_classes:
        classes = _v(row, "classes") or ""
        rec["cls"] = sorted({c.rsplit("/", 1)[-1]
                             for c in classes.split("~") if c})
    return rec


# --------------------------------------------------------------------------- #
# cache
# --------------------------------------------------------------------------- #
def load_cache():
    c = load_json(WIKIDATA_FEATURE_CACHE) or {}
    for key in ("countries", "trees", "tiles", "units", "items", "pageviews"):
        c.setdefault(key, {})
    return c


def save_cache(cache):
    cache["updated_at"] = stamp()
    save_json(WIKIDATA_FEATURE_CACHE, cache)


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def country_qids(cache, iso2s):
    """ISO2 -> [QID], from Wikidata's own P297 codes rather than a hand-typed
    map. Cyprus carries the code twice (the republic and the island); both are
    kept, because an item is tagged with whichever the editor chose."""
    missing = [c for c in iso2s if c not in cache["countries"]]
    if missing:
        rows = sparql('SELECT ?c ?code WHERE { ?c wdt:P297 ?code }', "P297")
        found = defaultdict(list)
        for r in rows:
            found[_v(r, "code")].append(_v(r, "c").rsplit("/", 1)[-1])
        for iso2 in iso2s:
            qids = sorted(found.get(iso2) or [],
                          key=lambda q: int(q[1:]))   # the older entity first
            cache["countries"][iso2] = qids
        save_cache(cache)
    return {c: cache["countries"].get(c) or [] for c in iso2s}


def class_tree(cache, kind):
    """The QIDs the kind's roots subsume, so a by-QID row can be class-checked
    offline. 108 + 32 + 135 QIDs for mountains, 49 for beaches."""
    out = set()
    for root in CLASS_ROOTS[kind]:
        if root not in cache["trees"]:
            rows = sparql(tree_query(root), f"tree {root}")
            cache["trees"][root] = sorted(
                {_v(r, "c").rsplit("/", 1)[-1] for r in rows})
            save_cache(cache)
            time.sleep(POLITE_S)
        out.update(cache["trees"][root])
    return out


# --------------------------------------------------------------------------- #
# fetching a country
# --------------------------------------------------------------------------- #
def feature_box(features):
    lats = [f["lat"] for f in features]
    lons = [f["lon"] for f in features]
    return (min(lons) - BOX_PAD_DEG, min(lats) - BOX_PAD_DEG,
            max(lons) + BOX_PAD_DEG, max(lats) + BOX_PAD_DEG)


def tile_key(iso2, kind, box):
    if box is None:
        return f"{iso2}|{kind}|country"
    return "%s|%s|%.2f,%.2f,%.2f,%.2f" % ((iso2, kind) + box)


def quadrants(box):
    w, s, e, n = box
    mx, my = (w + e) / 2.0, (s + n) / 2.0
    return [(w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)]


def fetch_tile(iso2, kind, qids, langs, box, root_box, cache, refresh, depth,
               stats):
    """One scope, split into quadrants when the endpoint can not finish it.
    box is None for the first attempt, which is the whole country and the
    cheapest query there is; root_box is what a split falls back to.
    Returns (rows, leaf tile keys). Every leaf is cached the moment it lands,
    so a kill costs at most the tile in flight."""
    key = tile_key(iso2, kind, box)
    hit = cache["tiles"].get(key)
    if hit and not refresh:
        stats["tiles_cached"] += 1
        return hit["rows"], [key]

    try:
        rows = sparql(scope_query(kind, qids, langs, box), key)
    except QueryTooBig as e:
        stats["tiles_split"] += 1
        if depth >= MAX_SPLIT_DEPTH:
            log(f"    ! {e}; at max depth, this scope is skipped")
            stats["tiles_lost"] += 1
            return [], []
        log(f"    {e}; splitting into quadrants")
        out, leaves = [], []
        for quad in quadrants(box or root_box):
            time.sleep(POLITE_S)
            r, k = fetch_tile(iso2, kind, qids, langs, quad, root_box, cache,
                              refresh, depth + 1, stats)
            out += r
            leaves += k
        return out, leaves

    parsed = [p for p in (parse_row(r, langs) for r in rows) if p]
    cache["tiles"][key] = {"at": stamp(), "rows": parsed}
    save_cache(cache)
    stats["tiles_fetched"] += 1
    stats["rows_fetched"] += len(parsed)
    log(f"    {key}: {len(parsed)} items")
    time.sleep(POLITE_S)
    return parsed, [key]


def fetch_scope(iso2, kind, features, qids, langs, cache, refresh, stats):
    """All Wikidata rows for one country and kind, cached per leaf tile."""
    unit = f"{iso2}|{kind}"
    known = cache["units"].get(unit) if not refresh else None
    # An empty tile list means every scope was lost at max depth; that is a
    # failure to retry next run, not a result to serve from the cache.
    if known and known["tiles"] and all(t in cache["tiles"]
                                        for t in known["tiles"]):
        rows = [r for t in known["tiles"] for r in cache["tiles"][t]["rows"]]
        stats["units_cached"] += 1
        return dedupe_rows(rows)

    rows, leaves = fetch_tile(iso2, kind, qids, langs, None,
                              feature_box(features), cache, refresh, 0, stats)
    rows = dedupe_rows(rows)
    cache["units"][unit] = {"at": stamp(), "tiles": leaves, "rows": len(rows)}
    save_cache(cache)
    return rows


def dedupe_rows(rows):
    """A quadrant split double-counts nothing, but a QID with two coordinate
    statements arrives twice; keep the first and let the match sort it out."""
    seen, out = set(), []
    for r in rows:
        if r["q"] in seen:
            continue
        seen.add(r["q"])
        out.append(r)
    return out


def fetch_items(qids, langs, cache, refresh, stats):
    """By-QID rows for features the country scope did not return, batched."""
    todo = sorted(q for q in qids
                  if refresh or q not in cache["items"])
    for i in range(0, len(todo), QID_BATCH):
        chunk = todo[i:i + QID_BATCH]
        try:
            rows = sparql(items_query(chunk, langs), f"items[{i}]")
        except QueryTooBig as e:
            log(f"    ! by-qid batch failed: {e}")
            stats["qid_batches_lost"] += 1
            continue
        got = {}
        for r in rows:
            p = parse_row(r, langs, with_classes=True)
            if p:
                got[p["q"]] = p
        for q in chunk:
            # A QID with no coordinate is a real answer: remember it as empty
            # so the next run does not ask again.
            cache["items"][q] = got.get(q) or None
        save_cache(cache)
        stats["qid_fetched"] += len(got)
        time.sleep(POLITE_S)
    return {q: cache["items"].get(q) for q in qids if cache["items"].get(q)}


# --------------------------------------------------------------------------- #
# matching
# --------------------------------------------------------------------------- #
def row_names(row):
    """Every name the item is known by, deduped on its identity core."""
    out = {}
    for name in list((row.get("names") or {}).values()) + \
            [row.get("nat"), row.get("en")]:
        core = name_core(name)
        if core:
            out.setdefault(core, name)
    return out


def token_subset(a, b):
    """One core's tokens contained in the other's, both non-trivial. "Cala
    Llombards" matches "Cala des Llombards"; "San" matches nothing."""
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return False
    short = a if len(a) <= len(b) else b
    if len(short) < WEAK_MIN_CHARS:
        return False
    return ta <= tb or tb <= ta


def candidates(features, rows, kind):
    """[(rank, dist, feature, row, method)] for every plausible pairing, best
    first. Ranked rather than assigned here so one item can not be handed to
    two features: the closest exact match wins it."""
    radius = MATCH_KM[kind]
    index = GeoIndex(rows)
    out = []
    for f in features:
        core = name_core(f["name"])
        if not core:
            continue
        for km, row in index.near(f["lat"], f["lon"], radius):
            names = row_names(row)
            if core in names:
                out.append((0, km, f, row, "sparql_exact", names[core]))
                continue
            if km > radius * WEAK_FACTOR:
                continue
            hit = next((n for c, n in names.items() if token_subset(core, c)),
                       None)
            if hit:
                out.append((1, km, f, row, "sparql_token", hit))
    out.sort(key=lambda t: (t[0], t[1]))
    return out


# How far a QID the POI layer handed us may sit from the feature before the
# pairing is worth a human look. It is not a rejection: the identity was
# established elsewhere (enrich_activities validated the article within 30 km),
# and a long beach legitimately has its two records a few km apart.
QID_FAR_KM = 10.0


def confidence(method, km, kind):
    """A QID is an identity somebody else established, so distance does not
    weaken it; a name match is our own inference, so distance does."""
    if method == "qid":
        return 1.0
    base = {"sparql_exact": 0.9, "sparql_token": 0.6}[method]
    return round(max(0.0, base - 0.3 * (km / MATCH_KM[kind])), 2)


def apply_row(f, row, method, km, tree, stats, verbose_sink):
    """Fill what is still empty, and never take a measurement off an item that
    is not of this kind: the POI layer's QID for a "peak" is sometimes the
    island, the bus line or the wine region it sat next to."""
    kind = f["kind"]
    classes = row.get("cls")
    class_ok = True if not classes else bool(set(classes) & tree)

    # A rerun that reaches the same verdict keeps the original timestamp, so
    # the artifact does not churn on every run for no new knowledge.
    was = f["provenance"].get("wikidata") or {}
    same = was.get("qid") == row["q"] and was.get("method") == method
    prov = {"method": method, "qid": row["q"],
            "at": was.get("at") if same else stamp(),
            "confidence": confidence(method, km, kind),
            "dist_km": round(km, 2)}
    if method == "qid" and km > QID_FAR_KM:
        stats["qid_far"] += 1
    if not class_ok:
        prov["class_ok"] = False
        prov["classes"] = classes
        stats["class_rejected"] += 1

    if not f.get("wikidata"):
        f["wikidata"] = row["q"]
        stats["gained_qid"] += 1
    if not f.get("wikipedia") and row.get("en"):
        f["wikipedia"] = "en:" + row["en"]
        stats["gained_wikipedia"] += 1
    if row.get("sl") is not None:
        if f["signals"].get("sitelinks") is None:
            stats["gained_sitelinks"] += 1
        f["signals"]["sitelinks"] = row["sl"]

    if class_ok:
        if not f.get("name_local"):
            local = row.get("nat") or next(
                (v for k, v in (row.get("names") or {}).items()
                 if k != "en" and v != f["name"]), None)
            if local and local != f["name"]:
                f["name_local"] = local
                stats["gained_name_local"] += 1
        if kind == "mountain":
            if f.get("elevation_m") is None and row.get("ele") is not None:
                f["elevation_m"] = row["ele"]
                stats["gained_elevation"] += 1
            if f.get("prominence_m") is None and row.get("prom") is not None:
                f["prominence_m"] = row["prom"]
                stats["gained_prominence"] += 1
        # The photo is not this stage's to publish (the licence gate lives in
        # enrich_images.py), but re-querying for it later would be a second
        # trip for something already in hand.
        if row.get("img"):
            prov["image"] = row["img"]

    f["provenance"]["wikidata"] = prov
    if not any(s.get("name") == WIKIDATA_SOURCE["name"] for s in f["sources"]):
        f["sources"].append(dict(WIKIDATA_SOURCE))
    if method != "qid":
        verbose_sink.append((prov["confidence"], f, row, method, km))


def enrich_country(iso2, kind, features, qids, langs, cache, args, stats,
                   sink):
    """One country and kind: fetch the scope, take the QID identities we were
    given, then match the rest by name and distance."""
    rows = fetch_scope(iso2, kind, features, qids, langs, cache, args.refresh,
                       stats)
    tree = class_tree(cache, kind)
    by_qid = {r["q"]: r for r in rows}

    known = {f["wikidata"] for f in features if f.get("wikidata")}
    missing = sorted(known - set(by_qid))
    if missing:
        by_qid.update(fetch_items(missing, langs, cache, args.refresh, stats))

    matched, claimed = set(), set()
    for f in features:
        qid = f.get("wikidata")
        row = by_qid.get(qid) if qid else None
        if not row:
            continue
        km = haversine_km(f["lat"], f["lon"], row["lat"], row["lon"])
        apply_row(f, row, "qid", km, tree, stats, sink)
        matched.add(f["id"])
        claimed.add(qid)
        stats["matched_qid"] += 1

    todo = [f for f in features if f["id"] not in matched]
    for rank, km, f, row, method, name in candidates(todo, rows, kind):
        if f["id"] in matched or row["q"] in claimed:
            continue
        apply_row(f, row, method, km, tree, stats, sink)
        f["provenance"]["wikidata"]["matched_name"] = name
        matched.add(f["id"])
        claimed.add(row["q"])
        stats[f"matched_{method}"] += 1

    stats["features"] += len(features)
    stats["matched"] += len(matched)
    return len(rows), len(matched)


# --------------------------------------------------------------------------- #
# pageviews
# --------------------------------------------------------------------------- #
def article_url(ref):
    """"en:Pen y Fan" -> the article URL ea.pageviews_avg expects."""
    lang, _, title = (ref or "").partition(":")
    if not lang or not title:
        return None
    return (f"https://{lang}.wikipedia.org/wiki/"
            + urllib.parse.quote(title.replace(" ", "_"), safe="/:()',!-"))


def harvest_pageviews(features, cache, stats):
    """The fame signal for every feature that now has an article and did not
    have a view count. Same client, window and worker cap as
    harvest_pageviews.py; the counts are cached here rather than in
    app_data/enrich_cache.json so this stage never writes a shared cache."""
    pv = cache["pageviews"]
    todo, wanted = [], []
    for f in features:
        if f["signals"].get("pageviews") is not None or not f.get("wikipedia"):
            continue
        url = article_url(f["wikipedia"])
        if not url:
            continue
        wanted.append((f, url))
        if url not in pv:
            todo.append(url)
    todo = sorted(set(todo))
    log(f"pageviews: {len(wanted)} features need one, {len(todo)} to fetch "
        f"({len(pv)} cached), window {ea.PV_START}..{ea.PV_END}")

    def work(url):
        time.sleep(PV_DELAY_S)
        return url, ea.pageviews_avg(url)

    done = fails = 0
    if todo:
        with ThreadPoolExecutor(max_workers=PV_WORKERS) as ex:
            for fut in as_completed([ex.submit(work, u) for u in todo]):
                url, v = fut.result()
                if v is None:
                    fails += 1
                else:
                    pv[url] = v
                done += 1
                if done % 250 == 0:
                    save_cache(cache)
                    log(f"    {done}/{len(todo)} ({fails} failures)")
        save_cache(cache)

    for f, url in wanted:
        if pv.get(url) is not None:
            f["signals"]["pageviews"] = pv[url]
            stats["gained_pageviews"] += 1
    log(f"pageviews: {stats['gained_pageviews']} features gained a view count, "
        f"{fails} lookups failed")


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def summarise(features, scope, per_scope, stats, sink, countries, verbose):
    log("")
    log(f"matched {stats['matched']}/{stats['features']} features in scope "
        f"({pct(stats['matched'], stats['features'])})")
    log(f"  by QID already on the row: {stats['matched_qid']}")
    log(f"  by name + distance, exact: {stats['matched_sparql_exact']}")
    log(f"  by name + distance, token: {stats['matched_sparql_token']}")
    log(f"  new QIDs:      {stats['gained_qid']}")
    log(f"  new articles:  {stats['gained_wikipedia']}")
    log(f"  new sitelinks: {stats['gained_sitelinks']}")
    log(f"  new local names: {stats['gained_name_local']}")
    log(f"  elevations:    {stats['gained_elevation']}   "
        f"prominences: {stats['gained_prominence']}")
    log(f"  items refused as off-class: {stats['class_rejected']}")
    log(f"  QID rows more than {QID_FAR_KM:.0f} km from the feature: "
        f"{stats['qid_far']}")
    log(f"  wikidata rows fetched: {stats['rows_fetched']} "
        f"({stats['tiles_fetched']} tiles, {stats['tiles_cached']} cached, "
        f"{stats['tiles_split']} split, {stats['tiles_lost']} lost)")

    mtn = [f for f in features if f["kind"] == "mountain" and f["iso2"] in scope]
    with_ele = sum(1 for f in mtn if f.get("elevation_m") is not None)
    log(f"  mountains in scope with an elevation: {with_ele}/{len(mtn)} "
        f"({pct(with_ele, len(mtn))})")

    log("")
    log("match rate per country and kind (matched / features, wikidata rows):")
    for iso2 in sorted(per_scope):
        for kind in sorted(per_scope[iso2]):
            n_feat, n_match, n_rows = per_scope[iso2][kind]
            log(f"  {iso2} {countries.get(iso2, ''):<18} {kind:<9} "
                f"{n_match:>5}/{n_feat:<5} {pct(n_match, n_feat):>5}  "
                f"rows {n_rows}")

    log("")
    log("least confident matches (name + distance only):")
    for conf, f, row, method, km in sorted(sink, key=lambda t: t[0])[:10]:
        names = list((row.get("names") or {}).values()) + [row.get("nat")]
        label = next((n for n in names if n), row.get("en") or "?")
        log(f"  {conf:.2f} [{method}] {f['iso2']} {f['kind']:<8} "
            f"{f['name']} -> {row['q']} {label} ({km:.2f} km)")
    if verbose:
        log("")
        log("every token match, for review:")
        for conf, f, row, method, km in sorted(sink, key=lambda t: t[0]):
            if method == "sparql_token":
                log(f"  {conf:.2f} {f['iso2']} {f['name']} -> {row['q']} "
                    f"{f['provenance']['wikidata'].get('matched_name')} "
                    f"({km:.2f} km)")


def pct(a, b):
    return f"{100.0 * a / b:.0f}%" if b else "n/a"


# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--country", help="ISO2 list, e.g. ES,AD,GR. Default: all "
                                      "countries in the artifact")
    ap.add_argument("--limit", type=int, default=0,
                    help="only the first N countries in scope, for a fast loop")
    ap.add_argument("--refresh", action="store_true",
                    help="re-query Wikidata even where the cache has the scope")
    ap.add_argument("--skip-pageviews", action="store_true",
                    help="Wikidata only, no pageviews API calls")
    ap.add_argument("--verbose", action="store_true",
                    help="print every weak match")
    ap.add_argument("--dry", action="store_true",
                    help="report only, write nothing")
    args = ap.parse_args()

    doc = load_json(RAW_FEATURES)
    if not doc:
        log(f"no {RAW_FEATURES}: run build_features.py first")
        return 1
    features = doc["features"]
    countries = catalogue_countries()
    log(f"read {len(features)} features from {RAW_FEATURES} "
        f"(built {doc.get('generated_at')})")

    by_country = defaultdict(lambda: defaultdict(list))
    for f in features:
        by_country[f["iso2"]][f["kind"]].append(f)
    scope = sorted(by_country)
    if args.country:
        want = {c.strip().upper() for c in args.country.split(",") if c.strip()}
        scope = [c for c in scope if c in want]
    if args.limit:
        scope = scope[:args.limit]
    if not scope:
        log("nothing in scope")
        return 1

    cache = load_cache()
    qids = country_qids(cache, scope)
    unknown = [c for c in scope if not qids.get(c)]
    if unknown:
        log(f"! no Wikidata country QID for {unknown}, skipped")
        scope = [c for c in scope if c not in unknown]

    log(f"scope: {len(scope)} countries, "
        f"{sum(len(v) for c in scope for v in by_country[c].values())} features")

    stats = Counter()
    sink, per_scope = [], defaultdict(dict)
    for iso2 in scope:
        langs = LOCAL_LANGS.get(iso2) or []
        for kind in sorted(by_country[iso2]):
            feats = by_country[iso2][kind]
            log(f"  {iso2} {kind}: {len(feats)} features")
            n_rows, n_match = enrich_country(iso2, kind, feats, qids[iso2],
                                             langs, cache, args, stats, sink)
            per_scope[iso2][kind] = (len(feats), n_match, n_rows)

    if not args.skip_pageviews:
        in_scope = [f for f in features if f["iso2"] in scope]
        harvest_pageviews(in_scope, cache, stats)

    summarise(features, set(scope), per_scope, stats, sink, countries,
              args.verbose)

    if args.dry:
        log("\ndry run: nothing written")
        return 0
    # The stage runs country by country, so the artifact keeps the cumulative
    # fact (which countries have been through it) next to this run's numbers.
    # Overwriting the list would make a two-batch run look like a one-batch one.
    prev = doc.get("wikidata") or {}
    doc["wikidata"] = {
        "at": stamp(),
        "countries_done": sorted(set(prev.get("countries_done") or [])
                                 | set(scope)),
        "last_run": {
            "countries": scope,
            "matched": stats["matched"],
            "features_in_scope": stats["features"],
            "gained": {k[7:]: v for k, v in stats.items()
                       if k.startswith("gained_")},
            "by_method": {k[8:]: v for k, v in stats.items()
                          if k.startswith("matched_")},
        },
    }
    save_json(RAW_FEATURES, doc)
    log(f"\nwrote {RAW_FEATURES}  ({len(features)} features, "
        f"{stats['matched']} enriched this run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
