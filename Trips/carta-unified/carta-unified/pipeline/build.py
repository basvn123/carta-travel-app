#!/usr/bin/env python3
"""Build the unified Carta dataset from the four raw source batches.

Usage:  python3 pipeline/build.py [--raw DIR] [--out DIR]
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parsers  # noqa: E402
from geocode import geocode_trip  # noqa: E402
from normalize import build_record  # noqa: E402

DEFAULT_RAW = "/root/carta/raw"
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

SOURCES = {
    "western-central": ("9512a811-cartatripsv1", parsers.parse_western),
    "southern-mediterranean": ("c90d0ee5-cartasouthernmedeuropedataset/carta-dataset", parsers.parse_southern),
    "eastern-southeastern": ("7deb9454-cartaeasterneuropetrips", parsers.parse_eastern),
    "northern-baltics": ("ebfc9d4b-carta_northern_europe_baltics_trips.md", parsers.parse_northern),
}

NORTHERN_UPLOAD = ("/root/.claude/uploads/9a14a1df-a60f-50d9-8c53-1af621be540a/"
                   "ebfc9d4b-carta_northern_europe_baltics_trips.md")

CSV_COLUMNS = [
    "id", "title", "country", "country_code", "region", "sub_region",
    "trip_type", "trip_type_id", "duration_days", "best_period_months",
    "best_period_window", "budget_tier", "budget_low_eur", "budget_high_eur",
    "acc_low", "acc_high", "food_low", "food_high", "trans_low", "trans_high",
    "act_low", "act_high", "difficulty", "fitness_level", "basecamps",
    "gateway_airport", "gateway_airport_code", "currency", "languages", "tags",
    "lat", "lon", "coord_precision", "verify_flag_count", "word_count", "source_batch", "source_file",
]


def to_csv_row(t):
    b = t["budget"]["breakdown"]
    coords = t.get("coordinates") or {}
    return {
        "id": t["id"], "title": t["title"], "country": t["country"],
        "country_code": t["countryCode"], "region": t["region"],
        "sub_region": t["subRegion"], "trip_type": t["tripType"],
        "trip_type_id": t["tripTypeId"], "duration_days": t["durationDays"],
        "best_period_months": "|".join(t["bestPeriod"]["monthNames"]),
        "best_period_window": t["bestPeriod"]["window"] or t["bestPeriod"]["note"],
        "budget_tier": t["budgetTier"],
        "budget_low_eur": t["budget"]["totalEur"]["low"],
        "budget_high_eur": t["budget"]["totalEur"]["high"],
        "acc_low": b["accommodation"]["lowEur"], "acc_high": b["accommodation"]["highEur"],
        "food_low": b["food"]["lowEur"], "food_high": b["food"]["highEur"],
        "trans_low": b["transport"]["lowEur"], "trans_high": b["transport"]["highEur"],
        "act_low": b["activities"]["lowEur"], "act_high": b["activities"]["highEur"],
        "difficulty": t["profile"]["difficulty"], "fitness_level": t["profile"]["fitnessLevel"],
        "basecamps": "|".join(t["basecamps"]), "gateway_airport": t["gatewayAirport"],
        "gateway_airport_code": t["gatewayAirportCode"], "currency": t["currency"],
        "languages": "|".join(t["languages"]), "tags": "|".join(t["tags"]),
        "lat": coords.get("lat"), "lon": coords.get("lon"),
        "coord_precision": coords.get("precision"),
        "verify_flag_count": t["verifyFlagCount"], "word_count": t["wordCount"],
        "source_batch": t["provenance"]["batch"], "source_file": t["provenance"]["sourceFile"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=DEFAULT_RAW)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--northern", default=NORTHERN_UPLOAD)
    args = ap.parse_args()

    seen_ids = set()
    trips, errors = [], []
    counts = {}

    for batch, (rel, fn) in SOURCES.items():
        path = args.northern if batch == "northern-baltics" else os.path.join(args.raw, rel)
        if not os.path.exists(path):
            errors.append(f"missing source for {batch}: {path}")
            continue
        n = 0
        for raw in fn(path):
            try:
                trips.append(build_record(raw, seen_ids))
                n += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{batch} {raw.get('sourceFile')}: {exc}")
        counts[batch] = n

    for t in trips:
        t["coordinates"] = geocode_trip(t)

    trips.sort(key=lambda t: (t["tripTypeId"], t["countryCode"], t["id"]))

    os.makedirs(args.out, exist_ok=True)
    trips_dir = os.path.join(args.out, "trips")
    os.makedirs(trips_dir, exist_ok=True)
    for stale in os.listdir(trips_dir):
        if stale.endswith(".json"):
            os.remove(os.path.join(trips_dir, stale))

    master = {
        "schemaVersion": "2.0",
        "dataset": "Carta — unified European trip dataset",
        "generated": __import__("datetime").date.today().isoformat(),
        "tripCount": len(trips),
        "regions": counts,
        "tripTypes": [{"id": i, "name": n, "slug": s} for i, n, s in
                      __import__("common").TRIP_TYPES],
        "trips": trips,
    }
    with open(os.path.join(args.out, "trips.master.json"), "w", encoding="utf-8") as fh:
        json.dump(master, fh, ensure_ascii=False, indent=2)

    for t in trips:
        with open(os.path.join(trips_dir, f"{t['id']}.json"), "w", encoding="utf-8") as fh:
            json.dump(t, fh, ensure_ascii=False, indent=2)

    with open(os.path.join(args.out, "trips.flat.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for t in trips:
            w.writerow(to_csv_row(t))

    print(f"parsed {len(trips)} trips: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    if errors:
        print(f"{len(errors)} parse errors:")
        for e in errors[:20]:
            print("  -", e)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
