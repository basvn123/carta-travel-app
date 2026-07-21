"""
add_gems_from_json.py - add new gem destinations from a researched JSON list,
reusing the exact recipe of add_famous_small_gems.py (which it imports):
Wikipedia coordinate snap, routes/costs/accommodation copied from the anchor
airport, local_transport from car_layer. image/activities/beauty stay None and
are filled by the resumable harvest_images.py / harvest_activities.py /
apply_beauty_layer.py runs afterwards.

Usage: python add_gems_from_json.py app_data/new_gems_2026_07.json
Idempotent: gems whose id already exists are skipped.
"""
import json
import sys
from pathlib import Path

from add_famous_small_gems import MASTER, build_record, snap_coordinates


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "app_data/new_gems_2026_07.json")
    gems = json.loads(src.read_text(encoding="utf-8"))
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    dests = data["destinations"]
    home = data["meta"]["home"]
    max_drive_km = (data["meta"].get("car_model") or {}).get("max_drive_km", 3500)

    bad = [g["slug"] for g in gems if g["anchor"] not in dests]
    if bad:
        raise SystemExit(f"unknown anchor airports for: {bad}")

    todo = [g for g in gems if f"gem:{g['slug']}" not in dests]
    print(f"{len(gems)} specs, {len(todo)} new; snapping coordinates...")
    snap_coordinates(todo)

    for spec in todo:
        dests[f"gem:{spec['slug']}"] = build_record(spec, dests, home, max_drive_km)

    data["meta"]["n_destinations"] = len(dests)
    MASTER.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"added {len(todo)} gems -> {len(dests)} total destinations")
    for spec in todo:
        v = dests[f"gem:{spec['slug']}"]
        state = ("bookable" if v["routes"] and not v["no_ryanair_route"]
                 else "unreachable-browse" if v["no_ryanair_route"] else "drive/browse")
        print(f"  gem:{spec['slug']}: {v['city']}, {v['country']} (anchor {v['anchor_airport']}, {state})")


if __name__ == "__main__":
    main()
