#!/usr/bin/env python3
"""Spot-check the reach artifacts against known rail benchmarks and report coverage.

Benchmarks are station-to-station times for the fastest direct train. The
artifact stores door to door city centre times (urban access legs included),
so artifact values are expected to sit above the benchmark. The table prints
both the raw delta and the verdict against a plausibility window of
benchmark + 0 to benchmark + 60 minutes.

Usage: python tools/reachability/spot_check.py
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MASTER = ROOT / "app_data" / "app_data.json"
REACH = ROOT / "continent-app" / "public" / "reach"

# (origin, destId, label, station-to-station benchmark minutes)
BENCHMARKS = [
    ("BRU", "CDG", "Paris (Eurostar)", 85),
    ("BRU", "AMS", "Amsterdam (Eurostar/IC)", 110),
    ("BRU", "gem:antwerp", "Antwerp (IC)", 42),
    ("BRU", "gem:ghent", "Ghent (IC)", 33),
    ("BRU", "gem:lille", "Lille (Eurostar)", 38),
    ("BRU", "LUX", "Luxembourg (IC)", 185),
    ("BRU", "LHR", "London (Eurostar)", 116),
    ("CRL", "BRU", "Brussels (IC from Charleroi)", 53),
]
ACCESS_WINDOW = 60


def haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (0.5 - math.cos((lat2 - lat1) * p) / 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2)
    return 12742 * math.asin(math.sqrt(a))


def main():
    cfg = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
    dests = json.loads(MASTER.read_text(encoding="utf-8"))["destinations"]
    artifacts = {}
    for origin in cfg["origins"]:
        path = REACH / f"{origin['iata']}.json"
        if path.exists():
            artifacts[origin["iata"]] = json.loads(path.read_text(encoding="utf-8"))

    print("spot checks (artifact is door to door, benchmark is station to station):")
    deltas, ok = [], 0
    checked = 0
    for org, did, label, bench in BENCHMARKS:
        art = artifacts.get(org)
        if art is None:
            print(f"  {org} -> {label}: SKIP, no artifact")
            continue
        got = art["minutes"].get(did)
        if got is None:
            print(f"  {org} -> {label}: MISSING from artifact")
            continue
        checked += 1
        delta = got - bench
        verdict = "ok" if 0 <= delta <= ACCESS_WINDOW else "CHECK"
        if verdict == "ok":
            ok += 1
        deltas.append(delta)
        print(f"  {org} -> {label}: {got} min, benchmark {bench}, "
              f"delta +{delta} ({delta / bench * 100:.0f}%), {verdict}")
    if deltas:
        print(f"  {ok}/{checked} within benchmark + {ACCESS_WINDOW} min, "
              f"mean access overhead {sum(deltas) / len(deltas):.0f} min")

    print("coverage:")
    for origin in cfg["origins"]:
        iata = origin["iata"]
        art = artifacts.get(iata)
        if art is None:
            print(f"  {iata}: no artifact")
            continue
        candidates = 0
        for did, dest in dests.items():
            for la, lo in (("city_lat", "city_lon"), ("lat", "lon")):
                lat, lon = dest.get(la), dest.get(lo)
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                    break
            else:
                continue
            if haversine_km(origin["lat"], origin["lon"], lat, lon) <= cfg["radius_km"]:
                candidates += 1
        n = len(art["minutes"])
        print(f"  {iata}: {n}/{candidates} in-radius dests have a duration "
              f"({n / candidates * 100:.0f}%), computed_at {art['computed_at']}")


if __name__ == "__main__":
    main()
