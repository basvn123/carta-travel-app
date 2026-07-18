"""expand_towns_geonames.py - mass-generate destination records from GeoNames.

The catalogue is grown from the cities500 gazetteer already cached at
cache/geonames_cities500.txt: every populated place at or above a population
floor, in one of the app's 43 countries, that is not already a destination,
becomes a browsable "gem" record. This is the "capture every town" pass - it
turns ~1.5k curated destinations into tens of thousands of settlements.

Each generated record follows the exact skeleton the resumable enrichment
harvests expect (image / activities / beauty / rating left None, filled later
by harvest_images.py, harvest_activities.py, apply_beauty_layer.py,
apply_rating_layer.py). Pricing needs no per-dest fare copy: a gem prices via
its anchor_airport plus the shared top-level `fares` dict (routes stay {}).

For every GeoNames place we:
  * skip it if a destination already sits within DEDUPE_KM (same town),
  * snap the anchor to the nearest airport-tier dest that actually has fares,
  * derive ground-transport minutes/eur from the road distance to that airport,
  * carry the real population / settlement class / elevation / timezone across
    into the same `geonames` block harvest_geonames.py would have written,
  * copy costs + accommodation from the anchor, local_transport from car_layer.

Idempotent + resumable: a place whose generated id already exists is skipped,
so re-runs only add what is new. Only patches app_data/app_data.json (master);
continent-app's sync-data step ships it to the browser.

Usage:
    python expand_towns_geonames.py                # pop floor 2000 (default)
    python expand_towns_geonames.py --pop 5000     # a leaner, larger-towns cut
    python expand_towns_geonames.py --iso HR       # one country (dry-run scope)
    python expand_towns_geonames.py --limit 200    # cap for a quick trial
"""
import argparse
import copy
import json
import sys
from pathlib import Path

import numpy as np

import car_layer

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "geonames_cities500.txt"

DEDUPE_KM = 4.0        # a place this close to an existing dest IS that dest
MAX_TRANSFER_MIN = 180 # beyond this the airport->town leg is browse-only, no fly price
R = 6371.0

# GeoNames feature_code -> our coarse settlement tag (mirrors harvest_geonames).
CITY_CODES = {"PPLC", "PPLA", "PPLA2", "PPLG"}
VILLAGE_CODES = {"PPLL", "PPLX", "PPLF", "PPLH", "PPLW", "PPLQ", "PPLS"}

# Base categories per settlement class, using only the app's existing vocab.
CATS = {"city": ["city"], "town": ["town"], "village": ["village"]}


def settlement_tag(fcode, pop):
    if fcode in CITY_CODES or pop >= 100_000:
        return "city"
    if fcode in VILLAGE_CODES or pop < 5_000:
        return "village"
    return "town"


def load_places(iso_ok, iso_filter, pop_floor):
    """Parse cities500 into keep-list dicts for the target countries + floor."""
    places = []
    for line in CACHE.read_text(encoding="utf-8").splitlines():
        f = line.split("\t")
        if len(f) < 19:
            continue
        iso2 = f[8]
        if iso2 not in iso_ok:
            continue
        if iso_filter and iso2 != iso_filter:
            continue
        try:
            pop = int(f[14]) if f[14] else 0
        except ValueError:
            pop = 0
        if pop < pop_floor:
            continue
        try:
            lat, lon = float(f[4]), float(f[5])
        except ValueError:
            continue
        try:
            elev = int(f[15]) if f[15] else (int(f[16]) if f[16] else None)
        except ValueError:
            elev = None
        places.append({
            "geonameid": int(f[0]), "name": f[1], "lat": lat, "lon": lon,
            "fcode": f[7], "iso2": iso2, "admin1": f[10] or None,
            "pop": pop, "elev": elev, "tz": f[17] or None,
        })
    return places


def haversine_vec(lat, lon, lats, lons):
    """Distance (km) from one point to arrays of points, vectorised."""
    p1 = np.radians(lat)
    plat = np.radians(lats)
    dlat = plat - p1
    dlon = np.radians(lons) - np.radians(lon)
    a = np.sin(dlat / 2) ** 2 + np.cos(p1) * np.cos(plat) * np.sin(dlon / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


def coords_of(d):
    lat = d.get("city_lat") or d.get("lat")
    lon = d.get("city_lon") or d.get("lon")
    return lat, lon


def build_record(p, country, anchor_id, anchor, minutes, eur, unreachable):
    slug = f"g{p['geonameid']}"
    cats = list(CATS.get(settlement_tag(p["fcode"], p["pop"]), ["town"]))
    # The airport->town last leg. origins.js lastLeg() reads pricing from
    # `transfer` (NOT routes, which are rebuilt per-origin at runtime); without
    # a transfer the town is browse-only, exactly like a remote gem. We set one
    # when the ground leg is short enough to price an honest fly-in.
    transfer = None
    if not unreachable and minutes <= MAX_TRANSFER_MIN:
        transfer = {
            "transfer_minutes_one_way": minutes,
            "transfer_eur_one_way_pp": eur,
            "summary": f"~{minutes} min from {anchor_id}; EUR {eur}/person one-way",
            "closer_alternatives": [],
        }
    return {
        "id": f"gem:{slug}",
        "tier": "gem",
        "iata": None,
        "city": p["name"],
        "country": country,
        "iso2": p["iso2"],
        "lat": round(p["lat"], 4),
        "lon": round(p["lon"], 4),
        "categories": cats,
        "tags": [],
        "blurb": None,
        "no_ryanair_route": unreachable or transfer is None,
        "anchor_airport": anchor_id,
        "transfer": transfer,
        "routes": {},   # priced via anchor_airport + shared top-level fares
        "costs": copy.deepcopy(anchor["costs"]),
        "accommodation": copy.deepcopy(anchor["accommodation"]),
        "local_transport": car_layer.local_transport_for(
            p["name"], p["iso2"], "gem", cats),
        "beauty": None,       # apply_beauty_layer.py
        "image": None,        # harvest_images.py
        "activities": None,   # harvest_activities.py
        "rating": None,       # apply_rating_layer.py
        "geonames": {
            "population": p["pop"],
            "settlement": settlement_tag(p["fcode"], p["pop"]),
            "elevation_m": p["elev"],
            "timezone": p["tz"],
            "name": p["name"],
            "admin1": p["admin1"],
            "dist_km": 0.0,
            "geonameid": p["geonameid"],
            "source": "geonames_cities500",
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pop", type=int, default=2000, help="population floor")
    ap.add_argument("--iso", default=None, help="restrict to one iso2 (trial)")
    ap.add_argument("--limit", type=int, default=None, help="cap places added")
    ap.add_argument("--dry-run", action="store_true", help="count only, no write")
    args = ap.parse_args()

    data = json.loads(MASTER.read_text(encoding="utf-8"))
    dests = data["destinations"]
    home = data["meta"]["home"]
    car = data["meta"].get("car_model") or {}
    max_drive_km = car.get("max_drive_km", 3500)
    avg_speed = car.get("avg_speed_kmh", 90)
    detour = car.get("road_detour_factor", 1.3)

    iso_ok = {v["iso2"] for v in dests.values() if v.get("iso2")}
    iso2country = {}
    for v in dests.values():
        if v.get("iso2") and v.get("country"):
            iso2country.setdefault(v["iso2"], v["country"])

    # Existing destination coords (for dedupe) as arrays.
    ex_lat, ex_lon = [], []
    for v in dests.values():
        la, lo = coords_of(v)
        if la is not None and lo is not None:
            ex_lat.append(la); ex_lon.append(lo)
    ex_lat = np.array(ex_lat); ex_lon = np.array(ex_lon)

    # Anchor pool: airport-tier dests that actually have fares (bookable).
    airports = [v for v in dests.values()
                if v["tier"] == "airport" and v.get("routes")]
    ap_lat = np.array([a["lat"] for a in airports])
    ap_lon = np.array([a["lon"] for a in airports])
    print(f"anchor airports (with fares): {len(airports)}")

    places = load_places(iso_ok, args.iso, args.pop)
    print(f"cities500: {len(places)} places, iso {args.iso or 'ALL'}, pop>={args.pop}")

    added, skip_dupe, skip_exist = [], 0, 0
    for p in places:
        if args.limit and len(added) >= args.limit:
            break
        did = f"gem:g{p['geonameid']}"
        if did in dests:
            skip_exist += 1
            continue
        # dedupe against any existing destination centre
        if len(ex_lat):
            dmin = haversine_vec(p["lat"], p["lon"], ex_lat, ex_lon).min()
            if dmin <= DEDUPE_KM:
                skip_dupe += 1
                continue
        country = iso2country.get(p["iso2"])
        if not country:
            continue
        # nearest bookable airport
        da = haversine_vec(p["lat"], p["lon"], ap_lat, ap_lon)
        ai = int(da.argmin())
        anchor = airports[ai]
        road_km = float(da[ai]) * detour
        minutes = int(round(road_km / max(avg_speed, 1) * 60))
        eur = int(round(road_km * 0.12))   # rough coach/transfer proxy, EUR
        # anchor has fares -> bookable; else drivable-from-home check
        anchor_has_fares = any((r.get("outbound_fare") or {})
                               for r in anchor.get("routes", {}).values())
        if anchor_has_fares:
            unreachable = False
        else:
            hk = haversine_vec(p["lat"], p["lon"],
                               np.array([home["lat"]]), np.array([home["lon"]]))[0]
            unreachable = not (p["iso2"] not in car_layer.NON_ROAD_ISO2
                               and hk * detour <= max_drive_km)

        rec = build_record(p, country, anchor["id"], anchor, minutes, eur, unreachable)
        if not args.dry_run:
            dests[did] = rec
            # grow dedupe arrays so later places dedupe against new ones too
            ex_lat = np.append(ex_lat, p["lat"])
            ex_lon = np.append(ex_lon, p["lon"])
        added.append(did)

    print(f"new: {len(added)}   skipped (already gem): {skip_exist}   "
          f"skipped (dupe of existing dest <= {DEDUPE_KM}km): {skip_dupe}")
    if args.dry_run:
        print("dry-run: nothing written")
        return

    data["meta"]["n_destinations"] = len(dests)
    data["meta"].setdefault("data_sources", {})["geonames_expand"] = {
        "provider": "GeoNames cities500",
        "license": "CC BY 4.0",
        "used_for": f"mass town/village catalogue expansion (pop>={args.pop})",
    }
    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"added {len(added)} -> {len(dests)} total destinations")
    print("next: harvest_images.py / harvest_activities.py / harvest_pageviews.py "
          "/ apply_beauty_layer.py / apply_rating_layer.py, then npm run data")


if __name__ == "__main__":
    main()
