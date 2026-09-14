"""The best place to leave a car, per destination, from OpenStreetMap.

The Explore page promises a parking answer for every destination: where to
park, whether it is free, and how far from the centre that is. OSM's
amenity=parking coverage in Europe is dense enough to answer honestly, and it
is the only open source that knows fee=no.

Per destination (city_lat first, same rule as every proximity layer here):
  - amenity=parking within CENTRE_RADIUS_M of the centre, publicly accessible
    (access private/customers/no is dropped: a hotel garage is not an answer);
  - park_ride=yes within PR_RADIUS_M, because the honest advice for a city
    like Florence is to not drive to the centre at all.

The cache stores the RAW candidate spots per destination (format spots_v2);
ranking and the best/free/park-and-ride picks live in export_destinfo.py, so
retuning what "best" means is a re-export, never a re-harvest.

Overpass queries are batched BATCH destinations at a time as an around()
union; elements are assigned back to the nearest centre in the batch. Writes
through a resumable per-destination cache (cache/parking_osm.json), flushed
every batch, so an interrupted run resumes where it stopped. Never touches
the master; export_destinfo.py ships the result.
"""
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "cache" / "parking_osm.json"

UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; data@carta-europetravel.com)"}
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

CENTRE_RADIUS_M = 1500
PR_RADIUS_M = 6000
BATCH = 20
SLEEP_S = 2.0

BAD_ACCESS = {"private", "customers", "no", "permit", "employees", "military"}
TYPE_KEYS = {"surface", "multi-storey", "underground", "rooftop", "street_side", "lane"}


def overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(6):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=body, headers=UA)
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.loads(r.read().decode("utf-8")).get("elements", [])
        except urllib.error.HTTPError as e:
            wait = 20 * (attempt + 1) if e.code in (429, 502, 503, 504) else 10
            if attempt < 5:
                time.sleep(wait); continue
            print(f"    batch give up: {e}"); return None
        except Exception as e:
            # Everything transient a mirror can throw: URLError, timeouts,
            # truncated JSON, and the bare RemoteDisconnected that killed a run
            # on 2026-08-19 by arriving OUTSIDE the URLError wrapper.
            if attempt < 5:
                time.sleep(12 * (attempt + 1)); continue
            print(f"    batch give up: {e}"); return None
    return None


def batch_query(batch):
    lines = []
    for _, lat, lon in batch:
        lines.append(f'  nwr["amenity"="parking"](around:{CENTRE_RADIUS_M},{lat},{lon});')
        lines.append(f'  nwr["amenity"="parking"]["park_ride"]["park_ride"!="no"](around:{PR_RADIUS_M},{lat},{lon});')
    body = "\n".join(lines)
    return f"[out:json][timeout:180];\n(\n{body}\n);\nout tags center qt;"


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def el_coords(el):
    if el.get("type") == "node":
        return el.get("lat"), el.get("lon")
    c = el.get("center") or {}
    return c.get("lat"), c.get("lon")


def spot_of(el, dist_m):
    tags = el.get("tags") or {}
    fee = tags.get("fee")
    fee_val = "no" if fee in ("no", "free") else ("yes" if fee else None)
    ptype = tags.get("parking")
    if ptype not in TYPE_KEYS:
        ptype = None
    cap = None
    try:
        cap = int(str(tags.get("capacity", "")).split(";")[0])
    except (ValueError, TypeError):
        pass
    return {
        "name": tags.get("name") or None,
        "lat": None, "lon": None,          # filled by caller (el_coords)
        "fee": fee_val,                     # 'no' | 'yes' | None (unknown)
        "type": ptype,                      # surface | multi-storey | underground | ...
        "cap": cap,
        "pr": tags.get("park_ride") not in (None, "no"),
        "dist_m": int(dist_m),
    }


def main():
    limit = None
    for a in sys.argv[1:]:
        if a.startswith("--limit="):
            limit = int(a.split("=", 1)[1])

    master = load_json(MASTER)
    dests = master.get("destinations") or {}
    if not dests:
        print("no master"); sys.exit(1)

    cache = load_json(OUT, default={})
    if cache.get("format") != "spots_v2":
        cache = {}                      # picks-era cache: raw spots were not kept
    done = cache.get("dests") or {}
    print(f"resuming: {len(done)} destinations already cached" if done else "fresh run")

    # Famous places first, so a partial run already covers what people open.
    todo = []
    for did, d in dests.items():
        if did in done:
            continue
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if lat is None or lon is None:
            continue
        todo.append((did, lat, lon, (d.get("rating") or {}).get("fame") or 0))
    todo.sort(key=lambda r: -r[3])
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} destinations to fetch, {BATCH} per query")

    processed = 0
    for i in range(0, len(todo), BATCH):
        batch = [(did, lat, lon) for did, lat, lon, _ in todo[i:i + BATCH]]
        els = overpass(batch_query(batch))
        if els is None:
            print("  batch failed, continuing with the next one")
            time.sleep(30)
            continue
        per_dest = {did: [] for did, _, _ in batch}
        for el in els:
            lat, lon = el_coords(el)
            if lat is None or lon is None:
                continue
            tags = el.get("tags") or {}
            if (tags.get("access") or "").split(";")[0] in BAD_ACCESS:
                continue
            best_id, best_m = None, float("inf")
            for did, dlat, dlon in batch:
                m = haversine_m(dlat, dlon, lat, lon)
                if m < best_m:
                    best_id, best_m = did, m
            s = spot_of(el, best_m)
            if s["pr"]:
                if best_m > PR_RADIUS_M:
                    continue
            elif best_m > CENTRE_RADIUS_M:
                continue
            s["lat"], s["lon"] = round(lat, 5), round(lon, 5)
            per_dest[best_id].append(s)
        for did, _, _ in batch:
            done[did] = per_dest[did]
        processed += len(batch)
        cache["dests"] = done
        cache["format"] = "spots_v2"
        cache["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        cache["source"] = "osm_overpass"
        atomic_write_json(OUT, cache)
        covered = sum(1 for v in done.values() if v)
        print(f"  {processed}/{len(todo)} fetched, {covered}/{len(done)} with parking")
        time.sleep(SLEEP_S)

    print(f"done: {len(done)} destinations in {OUT}")


if __name__ == "__main__":
    main()
