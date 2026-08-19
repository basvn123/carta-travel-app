"""Recurring events, festivals and concert series per destination, from Wikidata.

The Explore page answers "what is happening in this place" without a paid
events API: Wikidata knows Europe's recurring cultural calendar (music
festivals, carnivals, film weeks, Christmas markets) with coordinates,
sitelink counts (a fame proxy this repo already trusts, see
harvest_osm_wikidata.py) and, for a decent slice, the month it happens in
(P2922, month of the year).

Two-step harvest, because one P31/P279* walk with a geo filter times WDQS out:
  1. one cheap query collects every subclass of festival (Q132241), plus a few
     explicit extras the tree misses (Christmas market Q543654);
  2. the class list is chunked into VALUES blocks and instances with a
     coordinate inside the Europe bbox and >= MIN_SITELINKS sitelinks are
     pulled per chunk.

Rows are then assigned to the nearest catalogue destination (city_lat first,
the POI dead-zone rule) within ASSIGN_KM, best-known first, capped per dest.

Writes cache/events_wikidata.json:
  { "generated_at": iso, "dests": { destId: [event, ...] } }
with event = { qid, name, desc, months:[1..12], links, lat, lon, km, wp, web }

Read by export_destinfo.py, which ships it as public/destinfo/{CC}.json.
Never touches the master. Safe to re-run any time; it rebuilds from scratch
(the whole run is a handful of minutes, so there is nothing to resume).
"""
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "cache" / "events_wikidata.json"

WDQS = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}

BBOX = (34.0, -25.0, 72.0, 45.0)   # S, W, N, E
MIN_SITELINKS = 2                   # below this it is a village fair stub
ASSIGN_KM = 35.0                    # an event further out is another town's event
MAX_PER_DEST = 8
CLASS_CHUNK = 60

# The festival tree plus recurring-event kinds the tree does not reach.
SEED_CLASSES = ["Q132241"]          # festival
EXTRA_CLASSES = ["Q543654"]         # Christmas market

# Antiquity is not a travel plan: the festival tree includes the religious
# calendar of ancient Rome and Greece (Larentalia, Saturnalia), which no
# traveller can attend. The English description names them reliably.
ANCIENT_DESC = re.compile(r"\bancient\b|^roman (religious )?festival$|\bmythology\b", re.I)

# wd month entity -> month number
MONTH_QID = {
    "Q108": 1, "Q109": 2, "Q110": 3, "Q118": 4, "Q119": 5, "Q120": 6,
    "Q121": 7, "Q122": 8, "Q123": 9, "Q124": 10, "Q125": 11, "Q126": 12,
}


def sparql(query, tries=4):
    url = WDQS + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={**UA, "Accept": "application/sparql-results+json"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))["results"]["bindings"]
        except Exception as e:
            if attempt == tries - 1:
                print(f"    give up: {e}")
                return None
            time.sleep(8 * (attempt + 1))
    return None


def subclasses(seed):
    rows = sparql(f"SELECT DISTINCT ?c WHERE {{ ?c wdt:P279* wd:{seed} . }}")
    if rows is None:
        return []
    return [r["c"]["value"].rsplit("/", 1)[-1] for r in rows]


def chunk_query(classes):
    s, w, n, e = BBOX
    values = " ".join(f"wd:{c}" for c in classes)
    return f"""SELECT ?item ?itemLabel ?desc ?lat ?lon ?links ?monthQ ?web ?article WHERE {{
  VALUES ?cls {{ {values} }}
  ?item wdt:P31 ?cls .
  ?item p:P625/psv:P625 ?cn .
  ?cn wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  FILTER(?lat > {s} && ?lat < {n} && ?lon > {w} && ?lon < {e})
  ?item wikibase:sitelinks ?links .
  FILTER(?links >= {MIN_SITELINKS})
  OPTIONAL {{ ?item wdt:P2922 ?monthQ . }}
  OPTIONAL {{ ?item wdt:P856 ?web . }}
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
  OPTIONAL {{ ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}"""


def _tree_members(qids, root, chunk=200):
    """Which of qids sit in root's P31/P279* tree. Best-effort per chunk."""
    out = set()
    ids = sorted(qids)
    for i in range(0, len(ids), chunk):
        values = " ".join(f"wd:{q}" for q in ids[i:i + chunk])
        rows = sparql(
            "SELECT DISTINCT ?item WHERE { VALUES ?item { " + values + " } "
            f"?item wdt:P31/wdt:P279* wd:{root} . }}")
        if rows is not None:
            out |= {r["item"]["value"].rsplit("/", 1)[-1] for r in rows}
        time.sleep(1.0)
    return out


def venue_qids(qids):
    """The subset of qids that are structures and NOT events: the town hall
    that borrowed its market's class, the fairground.

    Screening the COLLECTED set afterwards is cheap and reliable; an inline
    MINUS on the collection query proved expensive enough to time chunks out.
    The event-tree exception matters because a Christmas market's own class
    chain can wander into venue territory (market -> marketplace): a thing
    that is both stays, a thing that is only a structure goes.
    """
    structures = _tree_members(qids, "Q811979")
    if not structures:
        return set()
    happenings = _tree_members(structures, "Q1656682")   # event
    happenings |= _tree_members(structures - happenings, "Q1190554")  # occurrence
    return structures - happenings


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    master = load_json(MASTER)
    dests = master.get("destinations") or {}
    if not dests:
        print("no master, nothing to assign against"); sys.exit(1)

    print(f"collecting the festival class tree...")
    classes = sorted(set(subclasses("Q132241")) | set(SEED_CLASSES) | set(EXTRA_CLASSES))
    print(f"  {len(classes)} classes")

    events = {}   # qid -> merged row
    for i in range(0, len(classes), CLASS_CHUNK):
        chunk = classes[i:i + CLASS_CHUNK]
        rows = sparql(chunk_query(chunk))
        if rows is None:
            continue
        for r in rows:
            qid = r["item"]["value"].rsplit("/", 1)[-1]
            name = r.get("itemLabel", {}).get("value", "")
            # A label that is just the QID means no readable name anywhere.
            if not name or name == qid:
                continue
            desc = r.get("desc", {}).get("value") or ""
            if ANCIENT_DESC.search(desc):
                continue
            ev = events.setdefault(qid, {
                "qid": qid, "name": name,
                "desc": r.get("desc", {}).get("value") or None,
                "months": set(),
                "links": int(r["links"]["value"]),
                "lat": float(r["lat"]["value"]),
                "lon": float(r["lon"]["value"]),
                "wp": r.get("article", {}).get("value") or None,
                "web": r.get("web", {}).get("value") or None,
            })
            mq = r.get("monthQ", {}).get("value")
            if mq:
                m = MONTH_QID.get(mq.rsplit("/", 1)[-1])
                if m:
                    ev["months"].add(m)
        done = min(i + CLASS_CHUNK, len(classes))
        print(f"  classes {done}/{len(classes)}, events so far {len(events)}")
        time.sleep(1.5)

    print("screening the collected set for tagged-as-structure venues...")
    bad = venue_qids(set(events))
    if bad:
        print(f"  dropped {len(bad)} venue entities")
        for q in bad:
            events.pop(q, None)

    # Nearest destination within ASSIGN_KM. City-centre coordinates first: the
    # airport point can sit 40 km out of town and would misfile city festivals.
    centres = []
    for did, d in dests.items():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if lat is None or lon is None:
            continue
        centres.append((did, lat, lon))

    by_dest = {}
    for ev in events.values():
        best_id, best_km = None, ASSIGN_KM
        for did, lat, lon in centres:
            # cheap prefilter: 1 deg lat ~ 111 km
            if abs(lat - ev["lat"]) > 0.5 or abs(lon - ev["lon"]) > 0.8:
                continue
            km = haversine_km(lat, lon, ev["lat"], ev["lon"])
            if km < best_km:
                best_id, best_km = did, km
        if best_id:
            row = dict(ev)
            row["months"] = sorted(ev["months"])
            row["km"] = round(best_km, 1)
            by_dest.setdefault(best_id, []).append(row)

    for did, rows in by_dest.items():
        rows.sort(key=lambda r: -r["links"])
        by_dest[did] = rows[:MAX_PER_DEST]

    n_events = sum(len(v) for v in by_dest.values())
    with_month = sum(1 for v in by_dest.values() for e in v if e["months"])
    print(f"assigned {n_events} events to {len(by_dest)} destinations "
          f"({with_month} carry a month)")
    atomic_write_json(OUT, {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "wikidata_sparql",
        "dests": by_dest,
    })
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
