"""The seed worklist for ranges and regions the registry cannot see (T322, row T113-e).

Tier: On-demand (reads the committed coverage report and the published wire)

The T113 coverage report lists 367 GMBA ranges and 217 NUTS3 regions where the
wire publishes walks and the registry holds none. The top-three gate has
nothing to hold such a unit to, so it passes by having nothing to fail. This
script turns that list into a worklist a person or a portal pass can act on:
one entry per unit, with the country, how many walks the wire publishes there
and the best-rated of them by name.

The published walks are CANDIDATES FOR A HUMAN TO CONFIRM, never evidence. A
registry built from our own wire would make the gate compare the wire with
itself. What goes into the registry is only what pipeline/trails/
seeds_blind_spots.py names, and the registry resolver still checks each name
against Wikidata and OSM (an unresolved seed ships as unresolved_seed and is
reported, not gated).

Reads the wire from CARTA_DATA_ROOT when set (a sparse worktree has no
continent-app), like coverage_report.py. Writes
data/reports/trails_blind_spots.json beside this code.

Usage, from the repo root:
    python pipeline/trails/blind_spot_worklist.py

ASCII clean, no em dashes, per project convention.
"""

import json
import os
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT)
WIRE = DATA_ROOT / "continent-app" / "public" / "trails"
COVERAGE = DATA_ROOT / "data" / "reports" / "trails_coverage.json"
OUT = ROOT / "data" / "reports" / "trails_blind_spots.json"
TOP = 3


def build(gap, wire_trips):
    """Pure part. gap is trails_coverage.json["registry_gap"]; wire_trips is
    [(country, trip dict)]. Returns the worklist dict."""
    by_unit = defaultdict(list)
    for cc, t in wire_trips:
        rg = t.get("rg") or {}
        for key in (rg.get("ra"), rg.get("n3")):
            if key:
                by_unit[key].append((cc, t))

    def entry(kind, uid, name, published):
        trips = by_unit.get(uid, [])
        counts = defaultdict(int)
        for cc, _ in trips:
            counts[cc] += 1
        best = sorted(trips, key=lambda ct: -(ct[1].get("rating") or 0))[:TOP]
        return {
            "kind": kind, "id": uid, "name": name, "published": published,
            "country": max(counts, key=counts.get) if counts else None,
            "countries": dict(sorted(counts.items())),
            "best_published": [
                {"name": t.get("name"), "rating": t.get("rating"),
                 "km": round((t.get("distance_m") or 0) / 1000, 1),
                 "network": t.get("net")} for _, t in best],
        }

    units = [entry("range", x["range"], x.get("name"), x["published"])
             for x in gap["blind_ranges"]]
    units += [entry("nuts3", x["nuts3"], None, x["published"])
              for x in gap["blind_nuts3"]]
    return units


def main():
    gap = json.loads(COVERAGE.read_text(encoding="utf-8"))["registry_gap"]
    trips = []
    for path in sorted(WIRE.glob("*.json")):
        cc = path.stem.upper()
        if cc in ("INDEX", "TOP"):
            continue
        blob = json.loads(path.read_text(encoding="utf-8"))
        trips += [(cc, t) for t in blob.get("trips") or []]
    units = build(gap, trips)
    OUT.write_text(json.dumps({
        "note": "Candidates for a human to confirm; not registry evidence. "
                "See pipeline/trails/blind_spot_worklist.py.",
        "ranges": sum(1 for u in units if u["kind"] == "range"),
        "nuts3": sum(1 for u in units if u["kind"] == "nuts3"),
        "units": units}, ensure_ascii=True, indent=1), encoding="utf-8")
    print(f"{len(units)} units written to {OUT}")


if __name__ == "__main__":
    main()
