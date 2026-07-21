"""harvest_pois_wikidata_images.py - bulk POI images from Wikidata (P18).

The per-POI Commons/Wikipedia geosearch (enrich_images_commons/web) is
throttled to a crawl by Wikimedia when run over the full ~87k image-less POI
set. Wikidata's Query Service (WDQS) is a different endpoint and lets us pull
EVERY imaged entity near a place in ONE query, so we do ONE box query per
destination (~1,500 total) instead of ~87k per-POI lookups.

Two phases (idempotent, resumable, atomic writes):

  harvest  For each destination with image-less items_full POIs, a WDQS
           `wikibase:box` geosearch (~+-0.12deg around the city) returns every
           Wikidata item in the box that has a P18 image, with its coordinate
           and label. Cached per dest id in cache/wikidata_poi_images.json.

  assign   Match each image-less POI to the nearest cached Wikidata entity
           within MATCH_M metres that shares a name token (diacritic-lax), and
           fill it["img"] with a hotlinkable Commons thumbnail (P18 FilePath +
           ?width=). Additive - never nulls, never overwrites an existing img.

WDQS is a shared community endpoint: single-threaded, polite delay + backoff,
a descriptive User-Agent with contact (per the WMF UA policy). Run:
    python harvest_pois_wikidata_images.py harvest [N]   # N = cap dests this run
    python harvest_pois_wikidata_images.py assign [--dry-run]
    python harvest_pois_wikidata_images.py all            # harvest then assign (default)
ASCII-clean per project convention.
"""
import json
import math
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "wikidata_poi_images.json"

WDQS = "https://query.wikidata.org/sparql"
UA = "CartaTravelApp-wikidata-images/1.0 (bas.vannieuwenhuyse123@gmail.com)"
BOX_DEG = 0.08          # +-0.08 deg box (~9 km lat) around each city centre
QLIMIT = 6000           # cap rows so a dense-city box can't overflow the WDQS response
MATCH_M = 120.0         # a POI accepts a Wikidata image within this distance if names overlap
TIGHT_M = 55.0          # ...or this distance even without a name-token overlap
THUMB_PX = 640
DELAY_S = 1.1           # polite base delay between WDQS queries
BACKOFFS = [20, 45, 90]

# local Wikipedia/Wikidata label language per country (falls back to en)
COUNTRY_LANG = {
    "IT": "it", "DE": "de", "AT": "de", "CH": "de", "FR": "fr", "ES": "es",
    "PT": "pt", "PL": "pl", "NL": "nl", "BE": "nl", "GR": "el", "CZ": "cs",
    "HR": "hr", "HU": "hu", "RO": "ro", "BG": "bg", "SK": "sk", "SI": "sl",
    "DK": "da", "SE": "sv", "NO": "no", "FI": "fi", "IE": "en", "GB": "en",
    "EE": "et", "LV": "lv", "LT": "lt", "RS": "sr", "BA": "bs", "ME": "sr",
    "MK": "mk", "AL": "sq", "MT": "mt", "CY": "el", "LU": "fr", "TR": "tr",
    "MA": "fr",
}


def _atomic_write(path, text):
    """temp + Path.replace: a concurrent read / AV scan / crash can't truncate
    the file mid-write (the OSError 22 that killed the per-POI sweep)."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def fold(s):
    s = (s or "").translate(str.maketrans({"ł": "l", "Ł": "l",
                                            "ø": "o", "ß": "ss"}))
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


def image_less_pois(d):
    """(name, lat, lon, index) for every items_full POI with coords and no img."""
    out = []
    for i, it in enumerate((d.get("activities") or {}).get("items_full") or []):
        if it.get("lat") is not None and it.get("lon") is not None and not it.get("img"):
            out.append((it.get("name"), it["lat"], it["lon"], i))
    return out


def dest_center(d):
    lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
    lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
    return lat, lon


# --------------------------------------------------------------------------- #
def img_name_tokens(thumb):
    """Name tokens from a Commons FilePath thumb URL - the filename is usually
    descriptive (Grand_Place_Brussels.jpg), giving a free name signal without the
    (too-slow) WDQS label service."""
    if "Special:FilePath/" not in thumb:
        return set()
    fn = urllib.parse.unquote(thumb.split("Special:FilePath/", 1)[1].split("?", 1)[0])
    return tokens(fn.rsplit(".", 1)[0])


def query_box(lat, lon, deg=BOX_DEG):
    """Return [(qid, lat, lon, thumb_url)] for imaged Wikidata items in the +-deg
    box around (lat, lon). LABEL-FREE on purpose: the wikibase:label service makes
    dense-metro boxes exceed the WDQS stream/timeout and truncates the response;
    we name-match on the Commons filename in assign instead. Raises on transport
    errors (incl. timeout on a too-dense box) so the caller can shrink the box."""
    w, s = lon - deg, lat - deg
    e, n = lon + deg, lat + deg
    q = f"""
SELECT ?item ?loc ?img WHERE {{
  SERVICE wikibase:box {{
    ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:cornerWest "Point({w} {s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point({e} {n})"^^geo:wktLiteral .
  }}
  ?item wdt:P18 ?img .
}}
LIMIT {QLIMIT}"""
    url = WDQS + "?format=json&query=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=65) as r:
        body = r.read()            # read fully, then parse (a streamed json.load can tear on a big/slow response)
    data = json.loads(body)
    out = []
    for b in data["results"]["bindings"]:
        loc = b.get("loc", {}).get("value", "")           # "Point(lon lat)"
        if not loc.startswith("Point("):
            continue
        try:
            plon, plat = (float(x) for x in loc[6:-1].split())
        except ValueError:
            continue
        img = b.get("img", {}).get("value")               # commons FilePath URL
        if not img:
            continue
        thumb = img + ("&" if "?" in img else "?") + f"width={THUMB_PX}"
        qid = b.get("item", {}).get("value", "").rsplit("/", 1)[-1]
        out.append((qid, plat, plon, thumb))
    return out


def harvest(limit=None):
    data = load(DATA)
    dests = data["destinations"]
    cache = load(CACHE) if CACHE.exists() else {}

    todo = [(i, d) for i, d in dests.items()
            if i not in cache and image_less_pois(d) and all(dest_center(d))]
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} destinations to query (cache has {len(cache)})")

    done = 0
    for i, d in todo:
        lat, lon = dest_center(d)
        result, got = [], False
        # Try the full box; on a timeout (too-dense metro) shrink and retry so we
        # still capture the centre cluster instead of losing the dest entirely.
        for deg in (BOX_DEG, BOX_DEG / 2, BOX_DEG / 4):
            for attempt in range(len(BACKOFFS) + 1):
                try:
                    result = query_box(lat, lon, deg); got = True; break
                except urllib.error.HTTPError as e:
                    if e.code == 429 and attempt < len(BACKOFFS):
                        time.sleep(BACKOFFS[attempt]); continue
                    got = e.code in (400, 404)     # bad query -> accept empty, stop
                    break
                except Exception:
                    break                          # timeout/URL error -> shrink the box
            if got:
                break
        cache[i] = result
        done += 1
        if done % 25 == 0:
            _atomic_write(CACHE, json.dumps(cache, ensure_ascii=False))
            got = sum(len(v) for v in cache.values())
            print(f"  {done}/{len(todo)} dests; {got} imaged entities cached")
        time.sleep(DELAY_S)

    _atomic_write(CACHE, json.dumps(cache, ensure_ascii=False))
    print(f"harvest complete: {len(cache)} dests, "
          f"{sum(len(v) for v in cache.values())} imaged Wikidata entities")


def assign(dry_run=False):
    if not CACHE.exists():
        sys.exit("no cache; run harvest first")
    cache = load(CACHE)
    data = load(DATA)
    dests = data["destinations"]

    filled = 0
    dests_touched = 0
    for i, d in dests.items():
        ents = cache.get(i)
        if not ents:
            continue
        pois = image_less_pois(d)
        if not pois:
            continue
        items_full = d["activities"]["items_full"]
        etoks = [img_name_tokens(e[3]) for e in ents]     # filename tokens per entity
        used = set()                                       # one entity image -> one POI
        local = 0
        for name, plat, plon, idx in pois:
            ptoks = tokens(name)
            best = None  # (rank_key, ent_idx, thumb)
            for j, (qid, elat, elon, thumb) in enumerate(ents):
                if j in used:
                    continue
                dm = haversine_m(plat, plon, elat, elon)
                if dm > MATCH_M:
                    continue
                overlap = bool(ptoks & etoks[j])
                if dm <= TIGHT_M or overlap:
                    key = (0 if overlap else 1, dm)        # name-confirmed first, then nearest
                    if best is None or key < best[0]:
                        best = (key, j, thumb)
            if best:
                items_full[idx]["img"] = best[2]
                items_full[idx]["img_src"] = "wikidata"
                used.add(best[1])
                local += 1
        if local:
            d["activities"]["wikidata_img_added"] = local
            filled += local
            dests_touched += 1

    print(f"assign: {filled} POI images filled across {dests_touched} destinations")
    if dry_run:
        print("  --dry-run: NOT writing app_data.json")
        return
    data.setdefault("meta", {}).setdefault("data_sources", {})["wikidata_p18_images"] = {
        "provider": "Wikidata Query Service (P18 images, geosearch)",
        "license": "CC0 1.0 (Wikidata) / image files per their own Commons licence",
        "used_for": "bulk POI images where per-POI Commons geosearch is rate-limited",
        "match_m": MATCH_M,
    }
    _atomic_write(DATA, json.dumps(data, ensure_ascii=False))
    print(f"  wrote {DATA}. Run `npm run data` to ship it.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "harvest":
        n = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        harvest(n)
    elif cmd == "assign":
        assign("--dry-run" in sys.argv)
    else:
        harvest()
        assign()


if __name__ == "__main__":
    main()
