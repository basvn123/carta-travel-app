"""backfill_landmarks.py - add MISSING famous sights from Wikidata sitelinks.

Why: the OpenTripMap harvest keeps the ~60 nearest notable POIs, so in dense
centres (Brussels: 35 Grand Place guildhalls) a world-famous landmark a few km
out never makes the cut - the Atomium is absent from the entire catalogue.
Overture's 5 km radius + rank cutoff misses the same places. This pass asks
Wikidata one question per destination: "which entities near the city have many
Wikipedia sitelinks?" - sitelink count is a language-independent fame proxy
(the Atomium has ~90). Anything famous that the catalogue lacks gets appended
to items_full with name/kind/coords/rate/img/wiki, so search, the day planner
and the must-see tier can finally see it.

Two phases (idempotent, resumable, atomic writes), same shape as
harvest_pois_wikidata_images.py:

  harvest  One WDQS box query per destination (+-0.09 deg) for entities with
           sitelinks >= MIN_SITELINKS, their P625 coords, P18 image, English
           Wikipedia article, label, short description and P31 types.
           Cached per dest id in cache/wikidata_landmarks.json.

  apply    Filter out settlements/admin areas/streets/stations/etc, drop
           anything already in items_full (name-token overlap within 160 m, or
           any item within 70 m), rank by sitelinks and append at most
           MAX_ADD_PER_DEST new items per destination. Additive only.

Run:  python backfill_landmarks.py harvest [N]    # N = cap dests this run
      python backfill_landmarks.py apply [--dry-run]
      python backfill_landmarks.py all            # harvest then apply (default)
ASCII-clean per project convention.
"""
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "wikidata_landmarks.json"

WDQS = "https://query.wikidata.org/sparql"
UA = "CartaTravelApp-landmark-backfill/1.0 (data@carta-europetravel.com)"
BOX_DEG = 0.09           # +-0.09 deg (~10 km lat) around the city centre
MIN_SITELINKS = 10       # fame floor: keeps the query tiny and the adds famous
TOP_RATE_SITELINKS = 25  # >= this many wikis -> rate 3 (top tier)
MAX_ADD_PER_DEST = 10
MATCH_M = 160.0          # an existing item this close with a shared name token = same place
TIGHT_M = 70.0           # an existing item this close = same place, name or not
THUMB_PX = 640
DELAY_S = 1.1
BACKOFFS = [20, 45, 90]
QLIMIT = 400

# Entities that are places-you-are-IN or infrastructure, not sights to add.
# Parks (Q22698) and plain buildings (Q41176) deliberately stay allowed.
TYPE_BLACKLIST = {
    "Q515", "Q3957", "Q532", "Q486972", "Q1549591", "Q5119", "Q15284",
    "Q484170", "Q747074", "Q123705", "Q2983893", "Q252916",          # settlements, quarters
    "Q493522", "Q262166", "Q2074737", "Q2039348",                     # BE/DE/ES/AT municipalities
    "Q83057", "Q1907114", "Q3624078",                                 # arrondissement / metro area / state
    "Q6256", "Q10864048", "Q13220204", "Q56061", "Q82794",           # countries / admin areas
    "Q4167410", "Q13406463", "Q4167836",                              # disambig / list / category
    "Q79007", "Q34442", "Q1788454",                                   # streets / roads
    "Q4022", "Q47521", "Q355304",                                     # rivers / streams / watercourses
    "Q1248784", "Q55488", "Q928830", "Q55678", "Q2175765",           # airports / stations / stops
    "Q5",                                                             # humans
    "Q11446", "Q170382",                                              # ships, sports clubs
    "Q4830453", "Q891723", "Q6881511",                                # businesses / companies
    "Q13226383", "Q1656682", "Q1190554",                              # facilities / events
    "Q13418847", "Q2223653", "Q750215", "Q178561", "Q3839081", "Q198",  # events / attacks / battles
    "Q54935504",                                                      # hospital
    "Q3918", "Q484652", "Q48204", "Q7275", "Q3024240", "Q107390",     # universities / orgs / states
}

# Language-independent last resort: the English shortdesc of a settlement or
# tragedy names itself. Anything matching here is not a sight to append.
BAD_DESC_RE = re.compile(
    r"municipality|city in|town in|village|district|province|region of|commune|"
    r"neighbourhood|neighborhood|quarter|arrondissement|suburb|county|"
    r"settlement|deelgemeente|capital of|bombing|attack|massacre|battle|war|"
    r"riot|disaster|edition of|contest|festival|organisation|organization|"
    r"association|university|college|communit(?:y|ies) in|state of|empire|"
    r"kingdom|duchy|dynasty|possessions|football club|company|team|"
    r"conference|federation|trade union|department|agency|commission|committee",
    re.IGNORECASE)

# P31 type -> human "kind" label, most-specific wins by list order.
KIND_MAP = [
    ("Q2977", "Cathedral"), ("Q163687", "Basilica"), ("Q16970", "Church"),
    ("Q32815", "Mosque"), ("Q34627", "Synagogue"), ("Q44613", "Monastery"),
    ("Q23413", "Castle"), ("Q16560", "Palace"), ("Q57821", "Fortification"),
    ("Q33506", "Museum"), ("Q207694", "Museum"), ("Q2772772", "Museum"),
    ("Q1440476", "Tower"), ("Q12518", "Tower"), ("Q39715", "Lighthouse"),
    ("Q12280", "Bridge"), ("Q4989906", "Monument"), ("Q839954", "Archaeological site"),
    ("Q194195", "Theme park"), ("Q43501", "Zoo"), ("Q2281788", "Aquarium"),
    ("Q167346", "Garden"), ("Q22698", "Park"), ("Q174782", "Square"),
    ("Q330284", "Market"), ("Q153562", "Opera house"), ("Q24354", "Theatre"),
    ("Q483110", "Stadium"), ("Q82117", "City gate"), ("Q16917", "Landmark"),
    ("Q860861", "Sculpture"), ("Q179700", "Statue"), ("Q26987258", "Square"),
]

COUNTRY_LANG = {
    "IT": "it", "DE": "de", "AT": "de", "CH": "de", "FR": "fr", "ES": "es",
    "PT": "pt", "PL": "pl", "NL": "nl", "BE": "nl", "GR": "el", "CZ": "cs",
    "HR": "hr", "HU": "hu", "RO": "ro", "BG": "bg", "SK": "sk", "SI": "sl",
    "DK": "da", "SE": "sv", "NO": "no", "FI": "fi", "EE": "et", "LV": "lv",
    "LT": "lt", "RS": "sr", "BA": "bs", "ME": "sr", "MK": "mk", "AL": "sq",
    "MT": "mt", "CY": "el", "LU": "fr",
}


def _atomic_write(path, text):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def fold(s):
    s = (s or "").translate(str.maketrans({"ł": "l", "Ł": "l", "ø": "o", "ß": "ss"}))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.lower()


STOP = {"the", "de", "la", "le", "il", "di", "van", "der", "den", "el", "san",
        "santa", "sant", "st", "saint", "und", "and", "of", "a", "l", "d"}


def tokens(s):
    return {t for t in fold(s).replace("-", " ").replace("'", " ").split()
            if len(t) >= 3 and t not in STOP}


def haversine_m(la1, lo1, la2, lo2):
    r = 6371000.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def dest_center(d):
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
    return lat, lon


# --------------------------------------------------------------------------- #
def query_box(lat, lon, lang, deg=BOX_DEG):
    """[(qid, lat, lon, sitelinks, img|None, article|None, label, shortdesc, types)]
    for famous entities in the box. One row per (item, img); deduped later."""
    w, s = lon - deg, lat - deg
    e, n = lon + deg, lat + deg
    langs = f"en,{lang},mul" if lang and lang != "en" else "en,mul"
    q = f"""
SELECT ?item ?loc ?sl ?img ?article ?itemLabel ?itemDescription
       (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=",") AS ?types)
WHERE {{
  SERVICE wikibase:box {{
    ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:cornerWest "Point({w} {s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point({e} {n})"^^geo:wktLiteral .
  }}
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl >= {MIN_SITELINKS})
  OPTIONAL {{ ?item wdt:P18 ?img . }}
  OPTIONAL {{ ?item wdt:P31 ?type . }}
  OPTIONAL {{ ?article schema:about ?item ;
              schema:isPartOf <https://en.wikipedia.org/> . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "{langs}". }}
}}
GROUP BY ?item ?loc ?sl ?img ?article ?itemLabel ?itemDescription
LIMIT {QLIMIT}"""
    url = WDQS + "?format=json&query=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=65) as r:
        body = r.read()
    data = json.loads(body)
    out = []
    for b in data["results"]["bindings"]:
        loc = b.get("loc", {}).get("value", "")
        if not loc.startswith("Point("):
            continue
        try:
            plon, plat = (float(x) for x in loc[6:-1].split())
        except ValueError:
            continue
        try:
            sl = int(float(b.get("sl", {}).get("value", "0")))
        except ValueError:
            continue
        qid = b.get("item", {}).get("value", "").rsplit("/", 1)[-1]
        img = b.get("img", {}).get("value") or None
        art = b.get("article", {}).get("value") or None
        label = b.get("itemLabel", {}).get("value") or ""
        sdesc = b.get("itemDescription", {}).get("value") or ""
        types = (b.get("types", {}).get("value") or "").split(",")
        out.append((qid, plat, plon, sl, img, art, label, sdesc, types))
    return out


def harvest(limit=None):
    data = load(DATA)
    dests = data["destinations"]
    cache = load(CACHE) if CACHE.exists() else {}

    todo = [(i, d) for i, d in dests.items()
            if i not in cache and all(c is not None for c in dest_center(d))]
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} destinations to query (cache has {len(cache)})")

    done = 0
    for i, d in todo:
        lat, lon = dest_center(d)
        lang = COUNTRY_LANG.get(d.get("iso2") or "", "en")
        result, got = [], False
        for deg in (BOX_DEG, BOX_DEG / 2):
            for attempt in range(len(BACKOFFS) + 1):
                try:
                    result = query_box(lat, lon, lang, deg); got = True; break
                except urllib.error.HTTPError as e:
                    if e.code == 429 and attempt < len(BACKOFFS):
                        time.sleep(BACKOFFS[attempt]); continue
                    got = e.code in (400, 404)
                    break
                except Exception:
                    break
            if got:
                break
        cache[i] = result
        done += 1
        if done % 25 == 0:
            _atomic_write(CACHE, json.dumps(cache, ensure_ascii=False))
            print(f"  {done}/{len(todo)} dests; "
                  f"{sum(len(v) for v in cache.values())} famous entities cached")
        time.sleep(DELAY_S)

    _atomic_write(CACHE, json.dumps(cache, ensure_ascii=False))
    print(f"harvest complete: {len(cache)} dests, "
          f"{sum(len(v) for v in cache.values())} famous entities cached")


# --------------------------------------------------------------------------- #
def kind_for(types):
    for qid, label in KIND_MAP:
        if qid in types:
            return label
    return "Landmark"


def already_have(items, name, lat, lon):
    ntoks = tokens(name)
    for it in items:
        ilat, ilon = it.get("lat"), it.get("lon")
        if ilat is None or ilon is None:
            continue
        dm = haversine_m(lat, lon, ilat, ilon)
        if dm <= TIGHT_M:
            return True
        if dm <= MATCH_M and ntoks & tokens(it.get("name")):
            return True
    return False


def apply(dry_run=False):
    if not CACHE.exists():
        sys.exit("no cache; run harvest first")
    cache = load(CACHE)
    data = load(DATA)
    dests = data["destinations"]

    added = 0
    dests_touched = 0
    for i, d in dests.items():
        rows = cache.get(i)
        if not rows:
            continue
        acts = d.setdefault("activities", {})
        items = acts.setdefault("items_full", [])
        # Dedupe WDQS rows (one per (item, img)) down to one per entity.
        best = {}
        for (qid, plat, plon, sl, img, art, label, sdesc, types) in rows:
            if qid not in best or sl > best[qid][2]:
                best[qid] = (plat, plon, sl, img, art, label, sdesc, types)
        cand = []
        for qid, (plat, plon, sl, img, art, label, sdesc, types) in best.items():
            if not label or label == qid:
                continue
            if any(t in TYPE_BLACKLIST for t in types):
                continue
            if sdesc and BAD_DESC_RE.search(sdesc):
                continue
            if BAD_DESC_RE.search(label):
                continue
            if already_have(items, label, plat, plon):
                continue
            cand.append((sl, qid, plat, plon, img, art, label, sdesc, types))
        cand.sort(key=lambda c: -c[0])
        local = 0
        for (sl, qid, plat, plon, img, art, label, sdesc, types) in cand[:MAX_ADD_PER_DEST]:
            item = {
                "name": label,
                "kind": kind_for(types),
                "lat": round(plat, 5),
                "lon": round(plon, 5),
                "rate": 3 if sl >= TOP_RATE_SITELINKS else 2,
                "src": "wikidata_landmark",
            }
            if img:
                item["img"] = img + ("&" if "?" in img else "?") + f"width={THUMB_PX}"
                item["img_src"] = "wikidata"
            if art:
                item["wiki"] = art
            if sdesc and len(sdesc) >= 12:
                item["desc"] = sdesc[0].upper() + sdesc[1:]
            items.append(item)
            local += 1
        if local:
            added += local
            dests_touched += 1

    print(f"apply: {added} famous sights appended across {dests_touched} destinations")
    if dry_run:
        print("  --dry-run: NOT writing app_data.json")
        return
    data.setdefault("meta", {}).setdefault("data_sources", {})["wikidata_landmarks"] = {
        "provider": "Wikidata Query Service (sitelink-ranked famous places)",
        "license": "CC0 1.0 (Wikidata) / image files per their own Commons licence",
        "used_for": "backfilling famous sights the OTM/Overture harvests missed",
        "min_sitelinks": MIN_SITELINKS,
    }
    _atomic_write(DATA, json.dumps(data, ensure_ascii=False))
    print(f"  wrote {DATA}. Run enrich_must_descs + sync-data to ship rich cards.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "harvest":
        n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        harvest(n)
    elif cmd == "apply":
        apply("--dry-run" in sys.argv)
    else:
        harvest()
        apply()


if __name__ == "__main__":
    main()
