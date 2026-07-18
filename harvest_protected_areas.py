"""harvest_protected_areas.py - a nearby-nature layer from Wikidata (CC0).

Adds a named protected-nature signal independent of the app's fame/rating data:
national parks, nature reserves, biosphere reserves, natural monuments and
marine protected areas across Europe, each a real, Wikipedia-linkable place.

Source is one cached Wikidata SPARQL query (CC0 - the cleanest license to
redistribute) restricted to a European bounding box via the wikibase:box GEO
service, over a fixed VALUES list of protected-area types. For every destination
we find the protected areas within RADIUS_KM and store, under dest["nature"]:

    "nature": {
      "nearest": {
        "name": "Plitvice Lakes National Park",
        "kind": "National park",
        "dist_km": 4.2,
        "wikidata": "https://www.wikidata.org/wiki/Q131018",
        "qid": "Q131018"
      },
      "n_areas": 3,                 // protected areas within the radius
      "kinds": ["National park", "Nature reserve"],
      "has_national_park": true,    // a national park is within the radius
      "source": "wikidata_protected_areas"
    }

When several areas are nearby the "nearest" headline prefers a national park,
then the most notable (Wikidata sitelink count), then the closest - so a marquee
park a few km out wins over a tiny reserve next door. Destinations with nothing
protected within the radius get no block.

The SPARQL result is cached in cache/wikidata_protected_areas.json, so re-runs
only re-match. Wikidata is currently rate-limited to ~1 request/minute during a
WDQS outage, so the fetch retries patiently on HTTP 429. Idempotent; patches
app_data.json master; sync-data.mjs ships it. ASCII-clean, no em dashes.

Usage:
    python harvest_protected_areas.py            # fetch-if-needed, match, apply
    python harvest_protected_areas.py --refresh  # force a fresh SPARQL fetch
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from math import radians
from pathlib import Path

import numpy as np

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "wikidata_protected_areas.json"

UA = {
    "User-Agent": "CartaTravelApp/1.0 (portfolio project; bas.vannieuwenhuyse123@gmail.com)",
    "Accept": "application/sparql-results+json",
}
ENDPOINT = "https://query.wikidata.org/sparql"
RADIUS_KM = 30.0                 # protected nature is a regional draw, wide catchment

# Protected-area instance-of types -> friendly UI label. National park first so
# it wins the "nearest" tie-break; the rest are notable nature designations.
TYPES = {
    "Q46169": "National park",
    "Q9309389": "National nature reserve",
    "Q179049": "Nature reserve",
    "Q1054813": "Marine protected area",
    "Q1377575": "Wildlife refuge",
    "Q23790": "Biosphere reserve",
    "Q1526071": "Natural monument",
    "Q2519134": "Regional nature park",
}
# Europe-ish bounding box (west/south .. east/north) for the wikibase:box service.
BOX_WEST = "Point(-25 34)"
BOX_EAST = "Point(45 72)"


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def build_query(tqid):
    """One lightweight per-type query - a single UNION over 8 types 504s on the
    degraded endpoint, so we ask for one type at a time (English label +
    sitelinks only, no Wikipedia join)."""
    return f"""
SELECT ?x ?xLabel ?coord ?sitelinks WHERE {{
  ?x wdt:P31 wd:{tqid} .
  SERVICE wikibase:box {{
    ?x wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest "{BOX_WEST}"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "{BOX_EAST}"^^geo:wktLiteral .
  }}
  OPTIONAL {{ ?x wikibase:sitelinks ?sitelinks. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""


POINT_RE = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


def fetch_type(tqid):
    """Fetch one protected-area type, retrying through the WDQS outage."""
    q = build_query(tqid)
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 7:
                wait = 65 if e.code == 429 else 20
                print(f"    HTTP {e.code}; waiting {wait}s then retrying "
                      f"(attempt {attempt + 1}/8)...")
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 7:
                print(f"    {e}; retry in 20s..."); time.sleep(20); continue
            raise

    out = []
    for b in raw["results"]["bindings"]:
        m = POINT_RE.search(b.get("coord", {}).get("value", ""))
        if not m:
            continue
        lon, lat = float(m.group(1)), float(m.group(2))
        qid = b["x"]["value"].rsplit("/", 1)[-1]
        name = b.get("xLabel", {}).get("value") or qid
        if name == qid:            # unlabelled placeholder - skip, not useful in UI
            continue
        out.append({
            "qid": qid,
            "name": name,
            "kind": TYPES[tqid],
            "np": tqid == "Q46169",
            "lat": lat, "lon": lon,
            "sitelinks": int(b.get("sitelinks", {}).get("value", 0) or 0),
        })
    return out


def _dedupe(by_type):
    """Collapse per-type lists; an area can carry several instance-of types, so
    keep the national-park / most-linked incarnation of each QID."""
    best = {}
    for tqid, lst in by_type.items():
        for a in lst:
            cur = best.get(a["qid"])
            if cur is None or (a["np"] and not cur["np"]) or a["sitelinks"] > cur["sitelinks"]:
                best[a["qid"]] = a
    return list(best.values())


def load_areas(refresh):
    """Per-type, resumable: cache stores {type_qid: [areas]} so a rate-limited
    run can be re-run to fill in the types it did not reach."""
    by_type = {} if refresh else (load(CACHE) if CACHE.exists() else {})
    CACHE.parent.mkdir(exist_ok=True)
    remaining = [t for t in TYPES if t not in by_type]
    if remaining:
        print(f"Fetching {len(remaining)} protected-area type(s) from Wikidata "
              f"(Europe box); {len(by_type)} already cached...")
    for i, tqid in enumerate(remaining):
        try:
            lst = fetch_type(tqid)
        except Exception as e:
            print(f"  {TYPES[tqid]} ({tqid}): FAILED ({e}); re-run to retry")
            continue
        by_type[tqid] = lst
        CACHE.write_text(json.dumps(by_type, ensure_ascii=False), encoding="utf-8")
        print(f"  {TYPES[tqid]:24} {len(lst):5} areas")
        if i < len(remaining) - 1:
            time.sleep(62)         # respect the outage's ~1 req/min ceiling
    areas = _dedupe(by_type)
    print(f"Wikidata: {len(areas)} distinct protected areas "
          f"({len(by_type)}/{len(TYPES)} types cached) -> cache/{CACHE.name}")
    return areas


def match(dests, areas):
    if not areas:
        print("  no areas fetched; nothing to match"); return 0
    alat = np.radians(np.array([a["lat"] for a in areas]))
    alon = np.radians(np.array([a["lon"] for a in areas]))
    R = 6371.0

    matched = 0
    for d in dests.values():
        lat = d.get("city_lat") or d.get("lat")
        lon = d.get("city_lon") or d.get("lon")
        if lat is None or lon is None:
            d.pop("nature", None); continue
        p1, l1 = radians(lat), radians(lon)
        dlat = alat - p1
        dlon = alon - l1
        hav = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(alat) * np.sin(dlon / 2) ** 2
        dist = 2 * R * np.arcsin(np.sqrt(hav))
        idx = np.where(dist <= RADIUS_KM)[0]
        if len(idx) == 0:
            d.pop("nature", None); continue

        near = [(areas[i], float(dist[i])) for i in idx]
        # headline: national park first, then most notable, then closest
        near.sort(key=lambda t: (not t[0]["np"], -t[0]["sitelinks"], t[1]))
        top, tkm = near[0]
        kinds = sorted({a["kind"] for a, _ in near})
        d["nature"] = {
            "nearest": {
                "name": top["name"],
                "kind": top["kind"],
                "dist_km": round(tkm, 1),
                "wikidata": "https://www.wikidata.org/wiki/" + top["qid"],
                "qid": top["qid"],
            },
            "n_areas": len(near),
            "kinds": kinds,
            "has_national_park": any(a["np"] for a, _ in near),
            "radius_km": int(RADIUS_KM),
            "source": "wikidata_protected_areas",
        }
        matched += 1
    return matched


def main():
    refresh = "--refresh" in sys.argv[1:]
    areas = load_areas(refresh)
    data = load(MASTER)
    dests = data["destinations"]

    matched = match(dests, areas)
    print(f"Matched: {matched}/{len(dests)} destinations carry a nature block "
          f"(protected area within {int(RADIUS_KM)} km)")
    np_dests = sum(1 for d in dests.values()
                   if d.get("nature", {}).get("has_national_park"))
    print(f"  of which {np_dests} have a national park within the radius")

    data["meta"].setdefault("data_sources", {})["wikidata_protected_areas"] = {
        "provider": "Wikidata (SPARQL) - national parks, nature reserves and other protected areas",
        "license": "CC0",
        "used_for": "nearest protected nature area and park presence per destination",
        "radius_km": int(RADIUS_KM),
    }

    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {MASTER}")
    print("done. Run `npm run data` (or dev/build) to ship it to the app.")


if __name__ == "__main__":
    main()
