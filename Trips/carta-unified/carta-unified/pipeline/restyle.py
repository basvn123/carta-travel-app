"""restyle.py - apply the trip style names and re-types to the built dataset.

T448 (2026-10-14) renamed nine of the ten styles to plain words and moved two
trips to the style they are written for. build.py cannot be re-run on this
machine (it reads the raw batches from /root/carta/raw), so this script edits
what build.py wrote, the same way build.py would have written it:

    data/trips.master.json    tripTypes, and each trip's tripType fields
    data/trips/{id}.json      the same three fields per trip
    data/trips.flat.csv       the trip_type and trip_type_id columns

The names come from common.TRIP_TYPES. RETYPE moves a trip to another style
by slug. A trip keeps its id even when the id names its old style: the id is
in shared links and saved favourites, and the validator only checks its shape.

Idempotent: a second run changes nothing. Run from the dataset root:

    python pipeline/restyle.py            # write
    python pipeline/restyle.py --check    # report what would change, write nothing
"""
import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# trip id -> the style it is written for (T448 review, sections 3 and 4)
RETYPE = {
    # chata to chata over 75 to 95 km and 3,000 m of ascent: a walking week
    "cz-nature-escape-jeseniky-cabin": "hiking",
    # five of seven days are train trips to Riviera towns
    "mc-city-riviera-week": "cozy-towns",
}

BY_SLUG = {slug: (i, name) for i, name, slug in C.TRIP_TYPES}


def restyle(t):
    """Set the trip's three style fields; True when anything changed."""
    slug = RETYPE.get(t["id"], t["tripTypeSlug"])
    tid, name = BY_SLUG[slug]
    before = (t.get("tripType"), t.get("tripTypeId"), t.get("tripTypeSlug"))
    t["tripType"], t["tripTypeId"], t["tripTypeSlug"] = name, tid, slug
    return before != (name, tid, slug)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    master_path = os.path.join(DATA, "trips.master.json")
    with open(master_path, encoding="utf-8") as fh:
        master = json.load(fh)
    changed = [t["id"] for t in master["trips"] if restyle(t)]
    master["tripTypes"] = [{"id": i, "name": n, "slug": s} for i, n, s in C.TRIP_TYPES]
    master["trips"].sort(key=lambda t: (t["tripTypeId"], t["countryCode"], t["id"]))
    moved = sorted(set(RETYPE) & {t["id"] for t in master["trips"]})
    print(f"{len(changed)} trips renamed or re-typed; re-typed: {', '.join(moved) or 'none'}")
    if args.check:
        return

    with open(master_path, "w", encoding="utf-8") as fh:
        json.dump(master, fh, ensure_ascii=False, indent=2)

    by_id = {t["id"]: t for t in master["trips"]}
    trips_dir = os.path.join(DATA, "trips")
    n_files = 0
    for name in sorted(os.listdir(trips_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(trips_dir, name)
        with open(path, encoding="utf-8") as fh:
            t = json.load(fh)
        if t["id"] in by_id and restyle(t):
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(t, fh, ensure_ascii=False, indent=2)
            n_files += 1

    csv_path = os.path.join(DATA, "trips.flat.csv")
    with open(csv_path, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        cols, rows = reader.fieldnames, list(reader)
    for r in rows:
        t = by_id.get(r["id"])
        if t:
            r["trip_type"], r["trip_type_id"] = t["tripType"], str(t["tripTypeId"])
    order = {t["id"]: i for i, t in enumerate(master["trips"])}
    rows.sort(key=lambda r: order.get(r["id"], len(order)))
    with open(csv_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote master, {n_files} trip files, {len(rows)} csv rows")


if __name__ == "__main__":
    main()
