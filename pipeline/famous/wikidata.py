"""Famous references from Wikidata (CC0): the fame list per outdoor kind.

D23/D24 famous coverage (2026-11-20). One question per kind: "which European
items of this type have articles in N languages?" Sitelinks are the fame
proxy because they are open, cover every kind and every country, and carry a
stable id (the QID) that the mountains, lakes and beaches wires already ship
as `wd`. The cuts per kind were tested against the public endpoints on
2026-11-20 (explore-web-sources.md in the run folder).

Two lessons from pipeline/trails/famous_registry.py are kept:
- one query per country (a Europe-wide P17 join times out on WDQS);
- no OPTIONAL cross-products: the candidate query asks only for item,
  sitelinks and one coordinate, and every detail comes in QID batches.
QLever first, WDQS second, both through the same paced getter."""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINTS = ["https://qlever.dev/api/wikidata",
             "https://query.wikidata.org/sparql"]
HEADERS = {"User-Agent": "CartaTravelApp/1.0 (portfolio project)",
           "Accept": "application/sparql-results+json"}
PREFIXES = ("PREFIX wd: <http://www.wikidata.org/entity/> "
            "PREFIX wdt: <http://www.wikidata.org/prop/direct/> "
            "PREFIX wikibase: <http://wikiba.se/ontology#> "
            "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> "
            "PREFIX skos: <http://www.w3.org/2004/02/skos/core#> ")
PACE_S = 1.5
BACKOFFS = [20, 60, 120]
BATCH = 250

# ISO2 -> country QID; the same 44 countries as the trails registry.
COUNTRY_QID = {
    "AD": "Q228", "AL": "Q222", "AT": "Q40", "BA": "Q225", "BE": "Q31",
    "BG": "Q219", "CH": "Q39", "CY": "Q229", "CZ": "Q213", "DE": "Q183",
    "DK": "Q35", "EE": "Q191", "ES": "Q29", "FI": "Q33", "FO": "Q4628",
    "FR": "Q142", "GB": "Q145", "GR": "Q41", "HR": "Q224", "HU": "Q28",
    "IE": "Q27", "IS": "Q189", "IT": "Q38", "LI": "Q347", "LT": "Q37",
    "LU": "Q32", "LV": "Q211", "MC": "Q235", "MD": "Q217", "ME": "Q236",
    "MK": "Q221", "MT": "Q233", "NL": "Q55", "NO": "Q20", "PL": "Q36",
    "PT": "Q45", "RO": "Q218", "RS": "Q403", "SE": "Q34", "SI": "Q215",
    "SK": "Q214", "SM": "Q238", "TR": "Q43", "UA": "Q212", "XK": "Q1246",
}
CC_OF_QID = {q: cc for cc, q in COUNTRY_QID.items()}

# Europe as Carta maps it, Azores and Canaries to the Urals edge of the
# catalogue: P17 France also answers for Martinique and Réunion.
EUROPE_BBOX = (-32.0, 27.0, 45.0, 72.0)   # west, south, east, north


def in_europe(lat, lon):
    """True for a point in EUROPE_BBOX; True when there is no point (a
    route without a coordinate is judged by its country alone)."""
    if lat is None or lon is None:
        return True
    w, s, e, n = EUROPE_BBOX
    return w <= lon <= e and s <= lat <= n


# Languages whose labels are kept for name matching: English plus every
# national language of the countries above, because wire names are local
# ("Hallstätter See", "Lago di Braies").
LABEL_LANGS = ("en de fr it es pt nl pl cs sk sl hr sr bs el sv nb nn no da "
               "fi is hu ro bg ca eu gl ga cy gd tr sq mk et lv lt lb mt "
               "uk fo rm").split()

# Classes that alone do not make an item a walk (see tier_of), and the words
# that do: a name with one of them is a walk whatever its class.
WEAK_TRAIL_CLASSES = frozenset({"Q628179", "Q3352369", "Q337912"})
WALK_WORDS = ("trail", " way", "path", "walk", "weg", "steig", "pfad",
              "sentiero", "sendero", "camino", "cami ", "caminho", "ruta ",
              "leden", "stigen", "stezka", "szlak", "chodnik", "staza",
              "pot ", "polku", "reitti", "hohenweg", "alta via", "gr ",
              "grande randonnee", "randonnee", "wanderweg", "ronda")

# Words in a cove's or bay's label that make it a beach (Cala Goloritzè is
# a cove, Rhossili a bay, Durdle Door an arch; all are beach days).
BEACH_WORDS = ("beach", "praia", "playa", "plage", "spiaggia", "strand",
               "plaža", "plaza", "plaja", "plaża", "platja", "cala ",
               "paralia", "παραλία", "hondartza", "traeth", "tràigh")

# Per kind:
#   classes  - P31 values, subclasses included (resolved once per run);
#   direct   - P31 values taken as they are, without their subclasses;
#   exclude  - an item typed only with these classes is dropped;
#   fetch    - the lowest sitelink count asked for (= the tier B floor);
#   tier     - function(row) -> "A" | "B" | None, the fame rule;
#   props    - numeric facts fetched per item.
KINDS = {
    "trails": {
        # hiking trail, long-distance trail, pilgrims' way (Camino Francés
        # is typed only as a pilgrims' way), via ferrata (Orla Perć).
        # Class ids checked on QLever 2026-11-20.
        "classes": ["Q2143825", "Q13405588", "Q337912", "Q648116"],
        # trail and footpath as direct types only: their subclass trees hold
        # bridges, stairs, streets and stoas (Charles Bridge came in as a
        # "trail" on the first run).
        "direct": ["Q628179", "Q3352369"],
        # sculpture trail, calvary: under hiking trail and pilgrims' way in
        # Wikidata, but a sculpture park or the Stations of the Cross on a
        # town hill is not a walk a traveller looks for.
        # Q174713 (scale model) brought the Sweden Solar System in.
        "exclude": ["Q2293148", "Q231685", "Q174713"],
        "extra_classes": [],
        "fetch": 2,
        "props": {"P2043": "length_km", "P1427": "start", "P1444": "end",
                  "P402": "osm_rel"},
    },
    "cycling": {
        # long-distance cycling route, cycling route.
        "classes": ["Q353027", "Q102307360"],
        "extra_classes": [],
        "fetch": 2,
        "props": {"P2043": "length_km", "P402": "osm_rel"},
    },
    "beaches": {
        "classes": ["Q40080"],
        # cove, bay, natural arch: beach-like places a guide lists as beaches
        "extra_classes": ["Q31615", "Q39594", "Q954501"],
        "fetch": 3,
        "props": {"P402": "osm_rel"},
    },
    "lakes": {
        "classes": ["Q23397"],
        # lagoon, liman, ria: under "lake" in Wikidata, but the Venetian
        # Lagoon and the Bay of Kotor are not lakes to a traveller.
        "exclude": ["Q187223", "Q156030", "Q554394"],
        "extra_classes": [],
        "fetch": 12,
        "props": {"P2046": "area_km2", "P2044": "elev_m", "P402": "osm_rel"},
    },
    "mountains": {
        # mountain, summit, volcano
        "classes": ["Q8502", "Q207326", "Q8072"],
        "extra_classes": [],
        "fetch": 8,
        "props": {"P2044": "elev_m", "P2660": "prom_m", "P402": "osm_rel"},
    },
}


def tier_of(kind, row):
    """The fame rule, kept in one place so the cut is a number, not logic
    spread across files. Returns "A" (headline famous), "B" (measured, one
    step below the cut) or None (dropped)."""
    sl = row.get("sitelinks") or 0
    if kind == "trails":
        t = "A" if sl >= 3 else "B" if sl >= 2 else None
        # Typed only as a generic trail, footpath or pilgrims' way: Rue
        # Crémieux, Via Krupp and the Sweden Solar System came in that way,
        # and so did the Sentiero Azzurro. Sitelinks do not tell them apart,
        # a walking word in the name does.
        if t == "A" and row.get("weak_class") and not row.get("walk_word"):
            t = "B"
        return t
    if kind == "cycling":
        km = row.get("length_km") or 0
        # Czech local routes have 3 sitelinks from one bot import; at 3 a
        # route needs some length or the long-distance class to count.
        long_class = "Q353027" in (row.get("classes") or [])
        if sl >= 4 or (sl >= 3 and (km >= 100 or long_class)):
            return "A"
        return "B" if sl >= 2 else None
    if kind == "beaches":
        beachy = row.get("class_kind") == "core" or row.get("beach_word")
        if not beachy:
            return "B" if sl >= 8 else None
        # A Spanish beach gets the es, ca, eu, gl and ast Wikipedias from
        # one regional fame; the first run had 199 of 368 famous beaches in
        # Spain, mostly town beaches. Spain needs three more languages.
        cut = 8 if row.get("countries") == ["ES"] else 5
        return "A" if sl >= cut else "B" if sl >= 3 else None
    if kind == "lakes":
        return "A" if sl >= 20 else "B" if sl >= 12 else None
    if kind == "mountains":
        # Ferdinandea, a submarine volcano at -8 m, came in as a volcano.
        if row.get("elev_m") is not None and row["elev_m"] <= 0:
            return None
        prom = row.get("prom_m") or 0
        if row.get("highpoint") or sl >= 30 or (prom >= 1000 and sl >= 8):
            return "A"
        if (prom >= 600 and sl >= 10) or sl >= 15:
            return "B"
        return None
    raise ValueError(kind)


def sparql(query, verbose=False):
    """Bindings from the first endpoint that answers, or None."""
    for endpoint in ENDPOINTS:
        url = endpoint + "?" + urllib.parse.urlencode(
            {"query": query, "format": "json"})
        req = urllib.request.Request(url, headers=HEADERS)
        for i, back in enumerate([0] + BACKOFFS):
            if back:
                time.sleep(back)
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.loads(r.read().decode("utf-8"))
                time.sleep(PACE_S)
                return data["results"]["bindings"]
            except urllib.error.HTTPError as e:
                if verbose:
                    print(f"    ! {endpoint.split('/')[2]}: HTTP {e.code}",
                          file=sys.stderr)
                if e.code not in (429, 500, 502, 503, 504):
                    break
            except (urllib.error.URLError, TimeoutError, ValueError,
                    KeyError) as e:
                if verbose:
                    print(f"    ! {endpoint.split('/')[2]}: {e}",
                          file=sys.stderr)
                break
    return None


def qid_of(uri):
    return uri.rsplit("/", 1)[-1]


POINT_RE = re.compile(r"Point\(\s*(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s*\)", re.I)


def parse_point(wkt):
    m = POINT_RE.search(wkt or "")
    return (float(m.group(2)), float(m.group(1))) if m else (None, None)


def subclasses(classes, verbose=False):
    """Every class under the given ones (P279*), the roots included."""
    values = " ".join("wd:" + c for c in classes)
    got = sparql(PREFIXES + f"SELECT DISTINCT ?c WHERE {{ VALUES ?root "
                 f"{{ {values} }} ?c wdt:P279* ?root }}", verbose)
    if got is None:
        return None
    return sorted({qid_of(b["c"]["value"]) for b in got} | set(classes))


def candidates(classes, country_qid, min_sl, verbose=False):
    """{qid: {sitelinks, lat, lon, cls}} for one country and class set."""
    values = " ".join("wd:" + c for c in classes)
    q = (PREFIXES + "SELECT ?item ?cls ?sl ?coord WHERE { "
         f"VALUES ?cls {{ {values} }} "
         "?item wdt:P31 ?cls . "
         f"?item wdt:P17 wd:{country_qid} . "
         "?item wikibase:sitelinks ?sl . "
         f"FILTER(?sl >= {int(min_sl)}) "
         # Optional: many routes (EuroVelo lines, long-distance trails) have
         # no single coordinate; one OPTIONAL is not a cross-product.
         "OPTIONAL { ?item wdt:P625 ?coord } } LIMIT 50000")
    got = sparql(q, verbose)
    if got is None:
        return None
    out = {}
    for b in got:
        qid = qid_of(b["item"]["value"])
        lat, lon = parse_point((b.get("coord") or {}).get("value"))
        if not in_europe(lat, lon):
            continue
        r = out.setdefault(qid, {"sitelinks": int(b["sl"]["value"]),
                                 "lat": lat, "lon": lon, "cls": set()})
        r["cls"].add(qid_of(b["cls"]["value"]))
    return out


def _batches(qids):
    qids = sorted(qids)
    for i in range(0, len(qids), BATCH):
        yield qids[i:i + BATCH]


def labels(qids, verbose=False):
    """{qid: {"en": label, "names": [labels and en aliases in LABEL_LANGS]}}"""
    langs = ", ".join(f"'{lang}'" for lang in LABEL_LANGS)
    out = {q: {"en": None, "names": set()} for q in qids}
    for chunk in _batches(qids):
        values = " ".join("wd:" + q for q in chunk)
        for pred in ("rdfs:label", "skos:altLabel"):
            got = sparql(PREFIXES + f"SELECT ?item ?l WHERE {{ VALUES ?item "
                         f"{{ {values} }} ?item {pred} ?l . "
                         f"FILTER(LANG(?l) IN ({langs})) }}", verbose)
            for b in got or []:
                q = qid_of(b["item"]["value"])
                lab = b["l"]["value"]
                lang = b["l"].get("xml:lang")
                if pred == "skos:altLabel" and lang != "en":
                    continue
                out[q]["names"].add(lab)
                if pred == "rdfs:label" and lang == "en":
                    out[q]["en"] = lab
    return {q: {"en": v["en"], "names": sorted(v["names"])}
            for q, v in out.items()}


def values_of(qids, prop, verbose=False):
    """{qid: [values]} for one direct property, in QID batches."""
    out = {}
    for chunk in _batches(qids):
        values = " ".join("wd:" + q for q in chunk)
        got = sparql(PREFIXES + f"SELECT ?item ?v WHERE {{ VALUES ?item "
                     f"{{ {values} }} ?item wdt:{prop} ?v }}", verbose)
        for b in got or []:
            out.setdefault(qid_of(b["item"]["value"]), []).append(
                b["v"]["value"])
    return out


def by_label(names, verbose=False):
    """{name: [(qid, sitelinks, (lat, lon), [cc])]} for items whose English
    label or alias is exactly the name, in a covered country, best known
    first. For the canaries, which Wikidata types as islands, villages,
    cliffs or parks rather than beaches or lakes."""
    if not names:
        return {}
    vals = " ".join(json.dumps(n, ensure_ascii=False) + "@en" for n in names)
    countries = " ".join("wd:" + q for q in COUNTRY_QID.values())
    got = sparql(PREFIXES + "SELECT ?l ?item ?sl ?c ?coord WHERE { "
                 f"VALUES ?l {{ {vals} }} VALUES ?c {{ {countries} }} "
                 "{ ?item rdfs:label ?l } UNION { ?item skos:altLabel ?l } "
                 "?item wdt:P17 ?c . ?item wikibase:sitelinks ?sl . "
                 "?item wdt:P625 ?coord . }", verbose)
    out = {}
    for b in got or []:
        lat, lon = parse_point(b["coord"]["value"])
        if not in_europe(lat, lon):
            continue
        q = qid_of(b["item"]["value"])
        cur = out.setdefault(b["l"]["value"], {}).setdefault(
            q, [q, int(b["sl"]["value"]), (lat, lon), set()])
        cur[3].add(CC_OF_QID[qid_of(b["c"]["value"])])
    return {n: sorted(([q, sl, pt, sorted(cc)] for q, sl, pt, cc
                       in d.values()), key=lambda x: -x[1])
            for n, d in out.items()}


def country_highpoints(verbose=False):
    """{qid of the highest point: cc} for the countries (P610)."""
    values = " ".join("wd:" + q for q in COUNTRY_QID.values())
    got = sparql(PREFIXES + f"SELECT ?c ?h WHERE {{ VALUES ?c {{ {values} }} "
                 "?c wdt:P610 ?h }", verbose)
    return {qid_of(b["h"]["value"]): CC_OF_QID[qid_of(b["c"]["value"])]
            for b in got or []}


def number(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
