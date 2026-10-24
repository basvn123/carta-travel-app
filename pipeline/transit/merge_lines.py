"""Merge the T641 transit overlays into the car rule's input (T640).

Tier: On demand

apply_car_layer.py --transit wants {dest_id: {train, bus, ferry}}. T641 writes
two overlays with exactly that row shape: cache/dest_transit.json (GTFS, all
modes) and cache/dest_transit_ferry.json (OSM ferries). This folds them into
cache/transit_lines.json: per destination and mode the GTFS legs first, then
the OSM ferry legs that are not already there (same from, to, name).

Usage, from the repo root:
    python pipeline/transit/merge_lines.py

ASCII clean, no em dashes, per project convention.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache"


def rows(name):
    p = CACHE / f"{name}.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8")).get("rows") or {}


def main():
    out = {}
    for name in ("dest_transit", "dest_transit_ferry"):
        for did, row in rows(name).items():
            tgt = out.setdefault(did, {})
            for mode, legs in (row or {}).items():
                have = tgt.setdefault(mode, [])
                seen = {(l.get("from"), l.get("to"), l.get("name")) for l in have}
                for leg in legs or []:
                    k = (leg.get("from"), leg.get("to"), leg.get("name"))
                    if k not in seen:
                        have.append(leg)
                        seen.add(k)
    out = {d: {m: l for m, l in r.items() if l} for d, r in out.items()}
    out = {d: r for d, r in out.items() if r}
    (CACHE / "transit_lines.json").write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("transit_lines:", len(out), "destinations")


if __name__ == "__main__":
    main()
