"""Write the stays build into app_data and bake the fallback wire (schema v18).

  dest.accommodation   becomes the compact block every first paint needs:
                       {beds (annual medians, EUR), q, captured, supply}
                       The month curves, weekend and peak factors stay in the
                       stays wire (stays/v1/{cc}.json), which the app fetches.
  meta.stays           {v, built, url, fees}: where the live wire lives and the
                       Airbnb fee constants bedPrice applies.
  public/stays/v1/     a copy of the build that ships with the app (Pages, or
                       data/stays/ on R2 after a cut-over). The app also asks
                       meta.stays.url (the monthly refresh) and keeps whichever
                       copy has the newer `built`.

Removes the v17 fields (per_person_night_eur, entire_home_night_eur,
seasonality, capacity_buckets, tiers, ...) and meta.stay_tiers_available.

Usage:  python pipeline/stays/apply_stays.py [--dry-run]
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MASTER, OUT, ROOT, SERVED, read_json, write_json  # noqa: E402

V = OUT / "v1"
PUBLIC = ROOT / "continent-app" / "public" / "stays" / "v1"
# The monthly Actions refresh writes here (r2:carta/data/stays-live/v1/); a
# deploy re-uploads public/stays/ under data/stays/, so the two never collide.
LIVE_URL = "https://data.carta-europetravel.com/data/stays-live/v1/"

# Airbnb pricing on top of the listed nightly price (kept from schema v17's
# accommodation_model, which measured them on Inside Airbnb and Airbnb's
# published fee pages).
FEES = {"service_fee_pct": 14, "cleaning_fee_frac_of_night": 0.5,
        "weekly_discount_pct": 8, "min_nights_for_weekly": 7}


def compact(rec):
    return {"beds": rec["beds"], "q": rec["q"], "captured": rec.get("captured"),
            "supply": rec.get("supply", {})}


def patch(path, records, manifest):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    n = 0
    for did, d in data["destinations"].items():
        rec = records.get(did)
        if rec and rec.get("beds"):
            d["accommodation"] = compact(rec)
            n += 1
        else:
            d.pop("accommodation", None)
    meta = data.setdefault("meta", {})
    meta.pop("stay_tiers_available", None)
    meta.pop("accommodation_model", None)
    meta.pop("accommodation_validation", None)
    meta["stays"] = {"v": 1, "built": manifest.get("built"), "url": LIVE_URL,
                     "fees": FEES}
    meta["schema_version"] = max(meta.get("schema_version", 17), 18)
    write_json(path, data, compact=path == SERVED)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    manifest = read_json(V / "manifest.json")
    if not manifest:
        sys.exit("no stays build: run build_stays.py first")
    records = {}
    for f in V.glob("*.json"):
        if f.name != "manifest.json":
            records.update(read_json(f)["dests"])
    with_beds = sum(1 for r in records.values() if r.get("beds"))
    print(f"{with_beds}/{len(records)} destinations have bed prices "
          f"(built {manifest['built']})")
    if a.dry_run:
        return
    for path in (MASTER, SERVED):
        if path.exists():
            print(f"{path.relative_to(ROOT)}: {patch(path, records, manifest)} blocks")
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    shutil.copytree(V, PUBLIC)
    print(f"baked {len(list(PUBLIC.glob('*.json')))} files into "
          f"{PUBLIC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
