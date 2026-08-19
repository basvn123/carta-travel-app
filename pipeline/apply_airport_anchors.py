"""Make near-but-unserved destinations reachable by anchoring them to the nearest
Ryanair-served airport + a ground (bus/shuttle) transfer (schema v8).

Many catalogue places have no Ryanair route of their own and are too far to drive
from Brussels, so the app hid them. But a lot of them sit within a short hop of an
airport Ryanair DOES serve (e.g. Venice Marco Polo -> Treviso, Rome Ciampino ->
Fiumicino). This script gives each such place the nearest served airport's fare
calendar plus an estimated airport->destination transfer, exactly like the curated
"gem" destinations already do (anchor_airport + ground_transport_one_way_eur).

Rules
  - Served airport = a destination that has its own `routes` AND an `iata`
    (real Ryanair airports; curated gems have routes but no iata, so are skipped).
  - Candidate = a destination with no routes, not an island (a bus can't cross
    the sea), with coordinates. Anchoring no longer requires the place to be
    unreachable by direct long-haul drive from home - a place can be BOTH a
    (long) direct drive AND a short hop from a nearby airport (e.g. Lake Como:
    ~13h direct from Brussels, or fly into Milan Bergamo and rent a car for the
    last 50km). runtime_pricing.composeTrip already prices plane and car as two
    independent options and lets the traveller compare, so gating anchoring on
    "is it already drivable" only hid the better option for places near a hub.
  - Anchor only if the nearest served airport is within ANCHOR_MAX_STRAIGHT_KM of
    the destination - i.e. that airport basically *is* the city's airport (Venice
    Marco Polo <-> Treviso, Rome Ciampino <-> Fiumicino, Milan Bergamo <-> Lake
    Como). Anything farther is a real onward journey, not an airport transfer,
    so we do NOT anchor it; the app still shows the place, flagged unreachable
    via Ryanair (unless it's separately reachable by direct drive).

Cost model (researched June 2026; bus/shuttle tier, well below taxi rates)
  - road_km   = haversine(dest, airport) * detour 1.3
  - one-way   = clamp(0.15 EUR/road-km, floor 10, cap 60)  per person
  - minutes   = road_km / 65 km/h * 60
  The React runtime counts this round-trip, per person, and includes it in the
  plane total (runtime_pricing.composeTrip -> transfer_total).

Idempotent: previously auto-anchored dests (`anchor_estimated: true`) are reset
first, so re-running refreshes cleanly.

Usage:
    python apply_airport_anchors.py                 # both default data files
    python apply_airport_anchors.py path/to.json ...
"""

import copy
import json
import math
import sys
from pathlib import Path

import car_layer  # for the drivable() check (home, detour, max_drive_km)
from pipeline_io import atomic_write_json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

ANCHOR_MAX_STRAIGHT_KM = 60.0  # only anchor when the airport basically serves the city
DETOUR = 1.3
EUR_PER_ROAD_KM = 0.15
GROUND_FLOOR_EUR = 10
GROUND_CAP_EUR = 60
TRANSFER_KMH = 65.0


def haversine(a_lat, a_lon, b_lat, b_lon):
    p = math.radians
    dlat = p(b_lat - a_lat)
    dlon = p(b_lon - a_lon)
    x = math.sin(dlat / 2) ** 2 + math.cos(p(a_lat)) * math.cos(p(b_lat)) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def patch(path: Path) -> None:
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    ds = data.get("destinations", {})
    meta = data.get("meta", {})
    home = meta.get("home") or {"lat": 50.8466, "lon": 4.3528}
    cm = meta.get("car_model", {})
    max_drive = cm.get("max_drive_km", 3500)
    drive_detour = cm.get("road_detour_factor", 1.3)

    def drivable(v):
        lt = v.get("local_transport") or {}
        if lt.get("road_connected") is False or v.get("lat") is None:
            return False
        return haversine(home["lat"], home["lon"], v["lat"], v["lon"]) * drive_detour <= max_drive

    # 1. Reset any previous auto-anchors so the run is idempotent.
    for v in ds.values():
        if v.get("anchor_estimated"):
            v.pop("routes", None)
            v.pop("anchor_estimated", None)
            v["anchor_airport"] = None
            v["no_ryanair_route"] = True

    # 2. Real served airports (have own fares + an iata).
    served = [v for v in ds.values()
              if v.get("routes") and v.get("iata") and v.get("lat") is not None]

    # 3. Anchor every eligible candidate to its nearest served airport.
    anchored = 0
    still_unreachable = 0
    for v in ds.values():
        if v.get("routes") or v.get("lat") is None:
            continue
        if "island" in (v.get("categories") or []):
            if not drivable(v):
                still_unreachable += 1
            continue
        nearest = min(served, key=lambda a: haversine(v["lat"], v["lon"], a["lat"], a["lon"]))
        straight_km = haversine(v["lat"], v["lon"], nearest["lat"], nearest["lon"])
        if straight_km > ANCHOR_MAX_STRAIGHT_KM:
            if not drivable(v):
                still_unreachable += 1
            continue

        road_km = straight_km * DETOUR
        ground_eur = round(min(GROUND_CAP_EUR, max(GROUND_FLOOR_EUR, EUR_PER_ROAD_KM * road_km)))
        minutes = round(road_km / TRANSFER_KMH * 60)

        routes = copy.deepcopy(nearest["routes"])
        for r in routes.values():
            r["anchor_airport"] = nearest["iata"]
            r["ground_transport_one_way_eur"] = ground_eur
            r["ground_transport_minutes"] = minutes
        v["routes"] = routes
        v["anchor_airport"] = nearest["iata"]
        v["no_ryanair_route"] = False
        v["anchor_estimated"] = True
        anchored += 1

    # 4. Reachability-flag consistency pass (same definition as fix_data.py step E,
    #    so the two scripts agree): `no_ryanair_route` is True only when a dest has
    #    NEITHER its own/anchored Ryanair routes NOR a drivable option. Step 1 above
    #    blanket-resets prior auto-anchors to True; without this pass a dest that was
    #    anchored last run but is no longer eligible (now drivable, or re-tagged an
    #    island) would be stranded as True even though it is reachable by car. This
    #    enforces the invariant for every dest, so re-runs always converge.
    fixed_flags = 0
    for v in ds.values():
        unreachable = (not v.get("routes")) and (not drivable(v))
        if bool(v.get("no_ryanair_route")) != unreachable:
            v["no_ryanair_route"] = unreachable
            fixed_flags += 1

    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    print(f"  {path.name}: {len(ds)} dests | anchored {anchored} (<= {int(ANCHOR_MAX_STRAIGHT_KM)}km airport) | "
          f"still unreachable {still_unreachable} (shown, flagged no_ryanair_route) | "
          f"flag fixes {fixed_flags} | {path.stat().st_size / 1024 / 1024:.2f} MB")


def main() -> None:
    targets = [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS
    print("Anchoring unserved destinations to nearest airport + ground transfer:")
    for t in targets:
        patch(t)


if __name__ == "__main__":
    main()
