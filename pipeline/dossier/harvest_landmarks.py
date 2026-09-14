"""The landmarks a place is actually known for, from Wikidata.

Two faults in the shipped POI layer that no amount of ranking could fix:

  Paris ships 52 items and the Eiffel Tower is not among them. What is there
  instead: "Hippopotamus Bastille" and "Le Grenier de Notre-Dame" (restaurants),
  "Boutique Georges Pompidou" (a gift shop), and "Mona Lisa", "Venus de Milo"
  and "Winged Victory of Samothrace", which are objects inside the Louvre
  rather than places you can go. The 52-item cap then squeezes the icons out.

  466 destinations have no things-to-do section at all, because nothing in
  the existing layers attests anything about them.

Both are the same gap: we had no source for "what is this place known for",
ranked by how much of the world has written about it. Wikidata is exactly
that source. One `wikibase:around` query per destination returns every item
with coordinates nearby, with its sitelink count (the number of language
Wikipedias carrying an article, which is the least gameable fame signal
available), its P18 photograph and its P31 types.

The types are what make it usable: the same query also returns languages,
treaties, terrorist attacks and historical republics, all of which have
coordinates near Paris and none of which are somewhere to go. A visitable
place is decided by an ALLOW list over P31 labels, never a deny list, because
a deny list leaks a new nonsense class every time Wikidata grows.

  python pipeline/dossier/harvest_landmarks.py [--limit N] [--only ID] [--refresh]

Writes cache/dossier/landmarks.json, keyed by destination id. Resumable: a
cached destination is never refetched. Paced for WDQS.
ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from common import (  # noqa: E402
    DCACHE, PUB, atomic_write_json, haversine_km, load_json, norm_name,
)

OUT = os.path.join(DCACHE, "landmarks.json")
WDQS = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "CartaDossier/1.0 (https://carta-europetravel.com; "
                    "bas.vannieuwenhuyse123@gmail.com)",
      "Accept": "application/sparql-results+json"}
PACE_S = 1.2

# radius km, minimum sitelinks. A metro has thousands of candidates so the bar
# is high; a village has a handful and a bar that high returns nothing, which
# is how 466 destinations ended up with an empty section.
SCOPE = {
    "metro":   (9, 18),
    "city":    (11, 10),
    "town":    (16, 6),
    "village": (22, 5),
    "area":    (26, 5),
}

QUERY = """
SELECT ?item ?itemLabel ?lat ?lon ?n ?img
       (GROUP_CONCAT(DISTINCT ?tLabel; separator="|") AS ?types) WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(%(lon)f %(lat)f)"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "%(radius)d" .
  }
  ?item wikibase:sitelinks ?n . FILTER(?n >= %(minsl)d)
  OPTIONAL { ?item wdt:P18 ?img }
  ?item p:P625/psv:P625 ?cn .
  ?cn wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  OPTIONAL { ?item wdt:P31 ?t . ?t rdfs:label ?tLabel . FILTER(LANG(?tLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel ?lat ?lon ?n ?img
LIMIT 200
"""
# No ORDER BY: sorting server side cost 6.3s a query against 2.6s without it,
# because it forces a full sort of every match before the limit applies. We
# keep only the top 30 by sitelinks anyway, and sorting 200 rows locally is
# free. Measured over a village, two towns and a metro.

# P31 label fragment -> the kind we display. Order matters: the first match
# wins, so the specific classes sit above the generic ones.
ALLOW = [
    ("cathedral", "Cathedral"), ("basilica", "Basilica"),
    ("minor basilica", "Basilica"),
    ("church", "Church"), ("chapel", "Church"), ("mosque", "Mosque"),
    ("synagogue", "Synagogue"), ("temple", "Church"),
    ("abbey", "Monastery"), ("monastery", "Monastery"), ("priory", "Monastery"),
    ("art museum", "Museum"), ("museum", "Museum"), ("art gallery", "Museum"),
    ("castle", "Castle"), ("fortress", "Castle"), ("fortification", "Castle"),
    ("citadel", "Castle"), ("city walls", "Castle"), ("chateau", "Castle"),
    ("palace", "Palace"), ("official residence", "Palace"),
    ("stately home", "Palace"), ("villa", "Palace"),
    ("observation tower", "Tower"), ("bell tower", "Tower"),
    ("lattice tower", "Tower"), ("tower", "Tower"), ("lighthouse", "Lighthouse"),
    # Amphitheatre sits above monument on purpose: the Colosseum is typed
    # "amphitheatre|ancient monument", and the specific word is the useful one.
    ("amphitheatre", "Amphitheatre"), ("amphitheater", "Amphitheatre"),
    ("triumphal arch", "Monument"), ("monument", "Monument"),
    ("memorial", "Monument"), ("obelisk", "Monument"),
    ("fountain", "Monument"), ("statue", "Monument"),
    ("city gate", "Gate"), ("gate", "Gate"),
    ("bridge", "Bridge"), ("aqueduct", "Bridge"), ("viaduct", "Bridge"),
    ("opera house", "Theatre"), ("theatre", "Theatre"), ("theater", "Theatre"),
    ("concert hall", "Theatre"), ("arena", "Amphitheatre"),
    ("archaeological site", "Ruins"), ("ruins", "Ruins"),
    ("ancient city", "Ruins"), ("roman villa", "Ruins"),
    ("botanical garden", "Park"), ("public park", "Park"), ("garden", "Park"),
    ("urban park", "Park"), ("national park", "National park"),
    ("nature reserve", "Nature reserve"), ("protected area", "Nature reserve"),
    ("zoo", "Zoo"), ("aquarium", "Aquarium"),
    ("amusement park", "Theme park"), ("theme park", "Theme park"),
    ("water park", "Water park"),
    ("thermal bath", "Sauna & baths"), ("bathhouse", "Sauna & baths"),
    ("spa town", "Sauna & baths"), ("swimming pool", "Swimming"),
    ("market hall", "Market"), ("marketplace", "Market"),
    ("town square", "Square"), ("city square", "Square"), ("square", "Square"),
    ("pedestrian street", "Square"), ("boulevard", "Square"),
    ("avenue", "Square"), ("promenade", "Square"),
    ("old town", "Old town"), ("historic district", "Old town"),
    ("neighborhood", "Old town"), ("neighbourhood", "Old town"),
    ("quarter", "Old town"),
    ("cemetery", "Landmark"), ("necropolis", "Landmark"),
    ("windmill", "Landmark"), ("watermill", "Landmark"),
    ("library", "Landmark"), ("stadium", "Landmark"),
    ("cave", "Cave"), ("waterfall", "Waterfall"), ("glacier", "Glacier"),
    ("canyon", "Canyon"), ("gorge", "Canyon"),
    ("volcano", "Peak"), ("mountain", "Peak"), ("hill", "Peak"),
    ("mountain pass", "Peak"), ("summit", "Peak"),
    ("lake", "Lake"), ("reservoir", "Lake"),
    ("beach", "Beach"), ("island", "Island"), ("archipelago", "Island"),
    ("nature park", "Nature reserve"), ("forest", "Nature reserve"),
    ("viewpoint", "Viewpoint"), ("scenic viewpoint", "Viewpoint"),
    ("funicular", "Landmark"), ("cable car", "Landmark"),
    ("vineyard", "Landmark"), ("winery", "Landmark"),
    ("hot spring", "Sauna & baths"),
    ("world heritage site", "Landmark"),
]
# Even inside an allowed class, these are not a place a traveller goes.
DENY_HINT = re.compile(
    r"\b(human|person|family|language|treaty|attack|massacre|war|battle|"
    r"election|scandal|company|business|brand|band|album|film|book|"
    r"political party|organization|university|school|hospital|prison|"
    r"airport|railway station|metro station|bus station|road|motorway|"
    # "country" on its own denied "country house", which is exactly the kind
    # of place this list is for. Only the political senses belong here.
    r"commune of|municipality|department of|region of|sovereign state|"
    r"historical country|republic|"
    r"empire|dynasty|olympic|championship|tournament|conference|"
    r"newspaper|website|software|taxon|chemical|disease|award|"
    # Settlements are somewhere to STAY, and "Best trips from here" already
    # offers the neighbouring ones with a travel time. As highlights they were
    # noise, and the villa/village bug made them palaces.
    r"village|hamlet|human settlement|locality|borough|civil parish|"
    r"urban area|populated place)\b", re.I)


# Matching is on WHOLE WORDS, not substrings. Plain `in` made "villa" match
# "village" and typed 17,078 of 45,249 landmarks as palaces: every village in
# Europe became a stately home. Any fragment that is a prefix of a commoner
# word does the same damage, so the boundary is not optional.
_ALLOW_RE = [(re.compile(r"\b" + re.escape(frag) + r"\b", re.I), kind)
             for frag, kind in ALLOW]


def classify(types_blob):
    """Our display kind for a Wikidata item, or None when it is not a place."""
    types = [t.strip().lower() for t in (types_blob or "").split("|") if t.strip()]
    if not types:
        return None
    if any(DENY_HINT.search(t) for t in types):
        # A denied class beats an allowed one: "prison|castle" is the Bastille,
        # which is fine, but "university in France|building" is not a sight.
        allowed = [t for t in types if any(rx.search(t) for rx, _ in _ALLOW_RE)]
        denied = [t for t in types if DENY_HINT.search(t)]
        # Strictly outnumber, not tie: the Bastille is "prison|castle|
        # destroyed building" and a tie threw it away. A university that is
        # also a building still has nothing on the allow side, so it goes.
        if len(denied) > len(allowed):
            return None
    for rx, kind in _ALLOW_RE:
        for t in types:
            if rx.search(t):
                return kind
    return None


def sparql(query, tries=3):
    url = WDQS + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)["results"]["bindings"]
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            time.sleep(10 * (attempt + 1) if e.code in (429, 503) else 4)
        except Exception as e:  # noqa: BLE001 - resumable
            last = str(e)[:80]
            time.sleep(5)
    raise RuntimeError(last or "sparql failed")


def qid_of(uri):
    return uri.rsplit("/", 1)[-1]


def harvest_one(dest):
    lat = dest.get("city_lat", dest.get("lat"))
    lon = dest.get("city_lon", dest.get("lon"))
    cls = (dest.get("place") or {}).get("class", "town")
    radius, minsl = SCOPE.get(cls, SCOPE["town"])
    rows = sparql(QUERY % {"lat": lat, "lon": lon, "radius": radius,
                           "minsl": minsl})
    self_norm = norm_name(re.sub(r"\s*\([^)]*\)\s*$", "", dest.get("city") or ""))
    out, seen = [], set()
    for r in rows:
        kind = classify(r.get("types", {}).get("value"))
        if not kind:
            continue
        name = r["itemLabel"]["value"]
        if name.startswith("Q") and name[1:].isdigit():
            continue                       # no label in any language we asked for
        n = norm_name(name)
        if not n or n in seen or n == self_norm:
            continue
        seen.add(n)
        try:
            plat, plon = float(r["lat"]["value"]), float(r["lon"]["value"])
        except (KeyError, ValueError):
            continue
        out.append({
            "qid": qid_of(r["item"]["value"]),
            "name": name,
            "kind": kind,
            "lat": round(plat, 5),
            "lon": round(plon, 5),
            "sitelinks": int(r["n"]["value"]),
            "km": round(haversine_km(lat, lon, plat, plon), 2),
            "img": r.get("img", {}).get("value") or None,
        })
    out.sort(key=lambda x: -x["sitelinks"])
    return out[:30]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--only")
    ap.add_argument("--refresh", action="store_true")
    # A second worker started with --reverse --out <other file> halves the wall
    # clock. They must NOT share an output file: each writes the whole cache
    # atomically, so two of them would take turns clobbering each other. Merge
    # with --merge once both have finished.
    ap.add_argument("--reverse", action="store_true")
    # Sharding is the honest way to run several workers: each takes every Mth
    # destination, so they never duplicate a query. Four is comfortable for
    # WDQS (the concurrent-query limit is five) and cuts a three hour backfill
    # to under an hour.
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--merge", nargs="*", metavar="FILE",
                    help="merge these caches into the main one and exit")
    args = ap.parse_args()

    if args.merge is not None:
        merged = load_json(OUT, {}) or {}
        for path in args.merge:
            other = load_json(path, {}) or {}
            merged.update(other)
            print(f"  merged {len(other)} from {os.path.basename(path)}")
        atomic_write_json(OUT, merged)
        print(f"[landmarks] merged total: {len(merged)} destinations")
        return

    out_path = args.out
    dests = (load_json(os.path.join(PUB, "app_data.json")) or {}).get(
        "destinations", {})
    cache = {} if args.refresh else (load_json(out_path, {}) or {})
    # Skip anything either worker has already done.
    done = set(cache) | set(load_json(OUT, {}) or {})

    todo = [k for i, k in enumerate(dests) if k not in done
            and i % args.of == args.shard]
    if args.reverse:
        todo.reverse()
    if args.only:
        todo = [args.only]
    if args.limit:
        todo = todo[: args.limit]
    print(f"[landmarks] {len(todo)} destinations to query ({len(cache)} cached)")

    ok = fail = empty = 0
    for i, did in enumerate(todo):
        try:
            rows = harvest_one(dests[did])
        except Exception as e:  # noqa: BLE001 - resumable, retry next run
            fail += 1
            if fail % 20 == 1:
                print(f"  {did}: {e}", flush=True)
            continue
        cache[did] = rows
        ok += 1
        if not rows:
            empty += 1
        time.sleep(PACE_S)
        if (i + 1) % 50 == 0:
            atomic_write_json(out_path, cache)
            print(f"  {i + 1}/{len(todo)} ({ok} ok, {empty} with nothing, "
                  f"{fail} failed)", flush=True)

    atomic_write_json(out_path, cache)
    tot = sum(len(v) for v in cache.values())
    print(f"[landmarks] done: {len(cache)} destinations, {tot} landmarks, "
          f"{fail} failed -> {OUT}")


if __name__ == "__main__":
    main()
