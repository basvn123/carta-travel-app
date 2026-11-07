"""Accessibility facts per destination from OpenStreetMap tags (ROADMAP D21).

Tier: Scheduled (run_pipeline task access_facts)

Step-free access and accessible toilets at the key places and stations of a
destination, taken only from what mappers tagged:
  - railway=station|halt carrying `wheelchair` within STATION_RADIUS_M;
  - toilets: amenity=toilets with `wheelchair`, or any feature with
    `toilets:wheelchair`, within CENTRE_RADIUS_M;
  - key places: tourism=museum|attraction|gallery with `wheelchair`, within
    CENTRE_RADIUS_M.
An untagged feature is not reported at all: absent means "not mapped", never
"not accessible". The app words every fact as "Mapped as" and never as a
guarantee.

The cache keeps RAW tagged features per destination (format access_v1);
what is shipped (the nearest station, counts, a few named places) lives in
export_destinfo.py, so retuning it is a re-export, never a re-harvest.
Resumable per-destination cache cache/access_osm.json, flushed every batch.
Never touches the master. The run is an owner step (Overpass is not
reachable from the build container).
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json, load_json
from harvest_parking import overpass, haversine_m, el_coords

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
OUT = ROOT / "cache" / "access_osm.json"

FORMAT = "access_v1"
CENTRE_RADIUS_M = 1500
STATION_RADIUS_M = 2500
BATCH = 20
SLEEP_S = 2.0
VALUES = {"yes", "limited", "no", "designated"}
PLACE_TOURISM = ("museum", "attraction", "gallery")


def batch_query(batch):
    lines = []
    for _, lat, lon in batch:
        lines.append(f'  nwr["railway"~"^(station|halt)$"]["wheelchair"](around:{STATION_RADIUS_M},{lat},{lon});')
        lines.append(f'  nwr["amenity"="toilets"]["wheelchair"](around:{CENTRE_RADIUS_M},{lat},{lon});')
        lines.append(f'  nwr["toilets:wheelchair"](around:{CENTRE_RADIUS_M},{lat},{lon});')
        lines.append(f'  nwr["tourism"~"^({"|".join(PLACE_TOURISM)})$"]["wheelchair"](around:{CENTRE_RADIUS_M},{lat},{lon});')
    return "[out:json][timeout:180];\n(\n" + "\n".join(lines) + "\n);\nout tags center qt;"


def norm(v):
    """A wheelchair value we understand, or None (free text is not a fact)."""
    v = (v or "").strip().lower()
    return v if v in VALUES else None


def classify(tags):
    """(kind, wheelchair value, toilets value) of one element, kind None to drop."""
    wc = norm(tags.get("wheelchair"))
    tw = norm(tags.get("toilets:wheelchair"))
    if tags.get("railway") in ("station", "halt"):
        return ("station", wc, tw) if wc else (None, None, None)
    if tags.get("amenity") == "toilets":
        return ("toilets", wc or tw, wc or tw) if (wc or tw) else (None, None, None)
    if tw:
        return "toilets_at", wc, tw
    if tags.get("tourism") in PLACE_TOURISM:
        return ("place", wc, tw) if wc else (None, None, None)
    return None, None, None


def feature_of(el, dist_m):
    tags = el.get("tags") or {}
    kind, wc, tw = classify(tags)
    if not kind:
        return None
    lat, lon = el_coords(el)
    if lat is None or lon is None:
        return None
    f = {"kind": kind, "wc": wc, "dist_m": int(dist_m),
         "lat": round(lat, 5), "lon": round(lon, 5)}
    if tw and kind != "toilets":
        f["tw"] = tw
    name = tags.get("name")
    if name:
        f["name"] = name
    return f


def assign(els, batch):
    """Per-destination feature lists, each element to the nearest centre."""
    per = {did: [] for did, _, _ in batch}
    for el in els:
        lat, lon = el_coords(el)
        if lat is None or lon is None:
            continue
        best_id, best_m = None, float("inf")
        for did, dlat, dlon in batch:
            m = haversine_m(dlat, dlon, lat, lon)
            if m < best_m:
                best_id, best_m = did, m
        f = feature_of(el, best_m)
        if not f:
            continue
        limit = STATION_RADIUS_M if f["kind"] == "station" else CENTRE_RADIUS_M
        if best_m <= limit:
            per[best_id].append(f)
    return per


def main():
    limit = None
    for a in sys.argv[1:]:
        if a.startswith("--limit="):
            limit = int(a.split("=", 1)[1])
    dests = (load_json(MASTER) or {}).get("destinations") or {}
    if not dests:
        print("no master")
        sys.exit(1)
    cache = load_json(OUT, default={})
    if cache.get("format") != FORMAT:
        cache = {}
    done = cache.get("dests") or {}
    todo = []
    for did, d in dests.items():
        lat = d.get("city_lat", d.get("lat"))
        lon = d.get("city_lon", d.get("lon"))
        if did in done or lat is None or lon is None:
            continue
        todo.append((did, lat, lon, (d.get("rating") or {}).get("fame") or 0))
    todo.sort(key=lambda r: -r[3])
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} destinations to fetch, {BATCH} per query")
    for i in range(0, len(todo), BATCH):
        batch = [(did, lat, lon) for did, lat, lon, _ in todo[i:i + BATCH]]
        els = overpass(batch_query(batch))
        if els is None:
            print("  batch failed, continuing")
            time.sleep(30)
            continue
        done.update(assign(els, batch))
        cache.update({"dests": done, "format": FORMAT, "source": "osm_overpass",
                      "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        atomic_write_json(OUT, cache)
        print(f"  {len(done)} cached, {sum(1 for v in done.values() if v)} with tagged features")
        time.sleep(SLEEP_S)
    print(f"done: {len(done)} destinations in {OUT}")


if __name__ == "__main__":
    main()
