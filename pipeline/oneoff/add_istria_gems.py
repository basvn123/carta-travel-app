"""One-off: add Motovun and Groznjan (Istria hill towns) as new gem destinations
to the existing app_data.json (both targets), matching the same shape/pipeline
every other gem went through:

  1. Insert the base record (routes copied from the anchor airport PUY's own
     Ryanair fare calendar + ground-transport fields; costs/accommodation
     reused from Croatia's country-level block, same as Rovinj/Pula).
  2. local_transport via car_layer.local_transport_for (real heuristic).
  3. Leaves image/activities/beauty as None/placeholder - filled by running
     the existing harvest_images.py / harvest_activities.py / apply_beauty_layer.py
     afterwards (resumable, so only these 2 new ids are actually fetched).

Usage: python add_istria_gems.py
"""
import copy
import json
from pathlib import Path

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # pipeline/ (car_layer etc.)
import car_layer

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]

NEW_GEMS = [
    {
        "slug": "motovun",
        "city": "Motovun",
        "country": "Croatia",
        "iso2": "HR",
        "lat": 45.3325,
        "lon": 13.8322,
        "categories": ["village", "medieval", "valley", "fairytale", "wine", "quiet"],
        "blurb": "Istria's iconic hilltop village above a vineyard-striped valley, truffle country",
        "anchor_airport": "PUY",
        "ground_transport_minutes": 55,
        "ground_transport_eur": 15,
    },
    {
        "slug": "groznjan",
        "city": "Grožnjan",
        "country": "Croatia",
        "iso2": "HR",
        "lat": 45.3796,
        "lon": 13.7186,
        "categories": ["village", "medieval", "valley", "fairytale", "art", "quiet"],
        "blurb": "Tiny stone hill-town of artists' studios and panoramic Istrian views",
        "anchor_airport": "PUY",
        "ground_transport_minutes": 70,
        "ground_transport_eur": 18,
    },
]


def build_record(spec, dests):
    anchor = dests[spec["anchor_airport"]]
    routes = {}
    for origin, route in (anchor.get("routes") or {}).items():
        r = copy.deepcopy(route)
        r["anchor_airport"] = spec["anchor_airport"]
        r["ground_transport_one_way_eur"] = spec["ground_transport_eur"]
        r["ground_transport_minutes"] = spec["ground_transport_minutes"]
        routes[origin] = r

    # Croatia has no city-specific Numbeo/Airbnb data beyond the country level
    # (Rovinj and Pula itself both carry the identical country-level block) -
    # reuse it rather than inventing numbers.
    costs = copy.deepcopy(anchor["costs"])
    accommodation = copy.deepcopy(anchor["accommodation"])

    local_transport = car_layer.local_transport_for(
        spec["city"], spec["iso2"], "gem", spec["categories"]
    )

    return {
        "id": f"gem:{spec['slug']}",
        "tier": "gem",
        "iata": None,
        "city": spec["city"],
        "country": spec["country"],
        "iso2": spec["iso2"],
        "lat": spec["lat"],
        "lon": spec["lon"],
        "categories": spec["categories"],
        "tags": [],
        "blurb": spec["blurb"],
        "no_ryanair_route": False,
        "anchor_airport": spec["anchor_airport"],
        "transfer": None,
        "routes": routes,
        "costs": costs,
        "accommodation": accommodation,
        "local_transport": local_transport,
        "beauty": None,   # filled by apply_beauty_layer.py
        "image": None,    # filled by harvest_images.py
        "activities": None,  # filled by harvest_activities.py
    }


def main():
    for path in TARGETS:
        if not path.exists():
            print(f"  skip (missing): {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        dests = data["destinations"]

        added = []
        for spec in NEW_GEMS:
            did = f"gem:{spec['slug']}"
            if did in dests:
                print(f"  {path.name}: {did} already present, skipping")
                continue
            dests[did] = build_record(spec, dests)
            added.append(did)

        data["meta"]["n_destinations"] = len(dests)
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {path.name}: added {added} -> {len(dests)} total destinations")


if __name__ == "__main__":
    main()
