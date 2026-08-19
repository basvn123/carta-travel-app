"""Ship the per-destination info layer: cache -> public/destinfo/{CC}.json.

One file per country, fetched lazily the first time a destination of that
country is opened on the Explore page (the same shape as public/reach and
public/trails: a wire the app reads, never the caches themselves).

Merges, per destination:
  parking   cache/parking_osm.json      (harvest_parking.py, OSM Overpass)
  events    cache/events_wikidata.json  (harvest_events.py, Wikidata)

A destination with neither is simply absent from its country file, and a
country with no rows still gets a file with an empty dests map, so the app
can tell "layer not built" (fetch misses, SPA fallback) from "nothing here".

Writes compact JSON (the served-file convention) plus destinfo/index.json
with per-country counts and the generation stamp, which is what the
freshness ledger and the verify harness read.

Safe to run at any moment, including while a parking harvest is mid-run:
it ships whatever the caches hold today, and the next run ships more.
"""
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
PARKING = ROOT / "cache" / "parking_osm.json"
EVENTS = ROOT / "cache" / "events_wikidata.json"
OUT_DIR = ROOT / "continent-app" / "public" / "destinfo"

SOURCES = {
    "parking": {"name": "OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright"},
    "events": {"name": "Wikidata", "url": "https://www.wikidata.org"},
}


CENTRE_RADIUS_M = 1500      # must match harvest_parking.py


def spot_score(s):
    """What "best" means: free beats unknown beats paid, but a place a driver
    can actually find and fit into matters more in a big city, so a name and
    real capacity weigh heavily and an anonymous scrap of tarmac is docked.
    Distance is a straight penalty. Tuned so a named 500-space garage at 600 m
    beats an unnamed free 6-space lot at 450 m, while a small town's named
    free lot still wins over everything."""
    v = {"no": 3.0, None: 1.0, "yes": 0.0}[s.get("fee")]
    if s.get("name"):
        v += 1.8
    if s.get("cap"):
        v += min(2.2, math.log10(max(s["cap"], 1)) * 0.9)
    if s.get("type") in ("multi-storey", "underground"):
        v += 0.4                     # signposted, all-weather, findable
    if not s.get("name") and (s.get("cap") or 0) < 10:
        v -= 0.8
    v -= (s.get("dist_m", 0) / 1000.0) * 2.0
    return v


def pick_parking(spots):
    """The shipped record for one destination's raw spot list, or None when
    the centre truly has nothing public."""
    centre = [s for s in spots if not s.get("pr") and s.get("dist_m", 1e9) <= CENTRE_RADIUS_M]
    prs = [s for s in spots if s.get("pr")]
    if not centre and not prs:
        return None
    rec = {"n": len(centre)}
    if centre:
        ranked = sorted(centre, key=spot_score, reverse=True)
        rec["best"] = ranked[0]
        if ranked[0].get("fee") != "no":
            free = [s for s in ranked if s.get("fee") == "no"]
            if free:
                rec["free"] = free[0]
    if prs:
        prs.sort(key=lambda s: (s.get("dist_m", 1e9), -(s.get("cap") or 0)))
        best_pr = prs[0]
        # A P+R is advice about skipping the centre; it may repeat the best
        # pick only when the best pick IS the P+R.
        if not centre or best_pr is not rec.get("best"):
            rec["park_ride"] = best_pr
    return rec


def slim_spot(s):
    """Drop nulls, the wire does not ship what it does not know."""
    out = {"lat": s["lat"], "lon": s["lon"], "dist_m": s["dist_m"]}
    for k in ("name", "fee", "type", "cap"):
        if s.get(k) is not None:
            out[k] = s[k]
    return out


def slim_parking(rec):
    out = {"n": rec.get("n", 0)}
    for k in ("best", "free", "park_ride"):
        if rec.get(k):
            out[k] = slim_spot(rec[k])
    return out


def slim_event(e):
    out = {"name": e["name"], "links": e["links"], "km": e["km"]}
    if e.get("months"):
        out["months"] = e["months"]
    if e.get("desc"):
        out["desc"] = e["desc"]
    if e.get("wp"):
        out["wp"] = e["wp"]
    if e.get("web"):
        out["web"] = e["web"]
    return out


def main():
    master = load_json(MASTER)
    dests = master.get("destinations") or {}
    if not dests:
        print("no master"); sys.exit(1)

    parking_cache = load_json(PARKING) or {}
    # The cache holds RAW spot lists (format spots_v2); older picks-era caches
    # are ignored rather than half-understood.
    parking_raw = parking_cache.get("dests") if parking_cache.get("format") == "spots_v2" else {}
    parking = {did: pick_parking(spots) for did, spots in (parking_raw or {}).items()}
    events = (load_json(EVENTS) or {}).get("dests") or {}

    by_cc = {}
    for did, d in dests.items():
        cc = d.get("iso2")
        if not cc:
            continue
        by_cc.setdefault(cc, {})
        row = {}
        p = parking.get(did)
        if p:
            row["parking"] = slim_parking(p)
        ev = events.get(did)
        if ev:
            row["events"] = [slim_event(e) for e in ev]
        if row:
            by_cc[cc][did] = row

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    index = {"generated_at": stamp, "countries": {}}
    ccs = sorted({d.get("iso2") for d in dests.values() if d.get("iso2")})
    for cc in ccs:
        rows = by_cc.get(cc, {})
        atomic_write_json(OUT_DIR / f"{cc}.json", {
            "country": cc,
            "generated_at": stamp,
            "sources": SOURCES,
            "dests": rows,
        }, indent=None, separators=(",", ":"))
        n_park = sum(1 for r in rows.values() if "parking" in r)
        n_ev = sum(1 for r in rows.values() if "events" in r)
        index["countries"][cc] = {"parking": n_park, "events": n_ev}
    atomic_write_json(OUT_DIR / "index.json", index, indent=None, separators=(",", ":"))

    t_park = sum(c["parking"] for c in index["countries"].values())
    t_ev = sum(c["events"] for c in index["countries"].values())
    print(f"wrote {len(ccs)} country files: {t_park} dests with parking, "
          f"{t_ev} with events")


if __name__ == "__main__":
    main()
