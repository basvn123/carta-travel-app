"""Write the stays build into app_data and bake the fallback wire (layer since schema v18).

  dest.accommodation   becomes the compact block every first paint needs:
                       {beds (annual medians, EUR), q, captured, supply}; a
                       destination the scrape did not price loses it (T1021)
                       The month curves, weekend and peak factors stay in the
                       stays wire (stays/v1/{cc}.json), which the app fetches.
  meta.stays           {v, built, url, fees, tiers}: where the live wire lives,
                       the Airbnb fee constants bedPrice applies and the tiers
                       some destination can price (the pickers offer these).
  public/stays/v1/     a copy of the build that ships with the app (Pages, or
                       data/stays/ on R2 after a cut-over). The app also asks
                       meta.stays.url (the monthly refresh) and keeps whichever
                       copy has the newer `built`.

Removes the v17 fields (per_person_night_eur, entire_home_night_eur,
seasonality, capacity_buckets, tiers, ...) and meta.stay_tiers_available.

Refuses (exit 1, nothing written) when the measured share of the master
would fall by more than MAX_MEASURED_LOSS; --override "reason" applies anyway.
box_stays.py calls write_all() after its publish, so the box master gets the
same blocks the live stays wire carries (D10, wave 1).

Usage:  python pipeline/stays/apply_stays.py [--dry-run] [--override "reason"]
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
# The box's monthly build writes here (r2:carta/data/stays-live/v1/); a
# deploy re-uploads public/stays/ under data/stays/, so the two never collide.
LIVE_URL = "https://data.carta-europetravel.com/data/stays-live/v1/"
OVERRIDE = ""        # the reason given with --override, kept in meta.stays

# Airbnb pricing on top of the listed nightly price (kept from schema v17's
# accommodation_model, which measured them on Inside Airbnb and Airbnb's
# published fee pages).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pricing_config import rule  # noqa: E402

# T693: the Airbnb fees the wire ships as meta.stays.fees, from the one
# config (stay.fees), the copy the app's DEFAULT_FEES reads too.
FEES = rule("stay.fees")


from bed_rules import bed_stats, clean_beds  # noqa: E402

# D10 (wave 1, 0.1): an apply may not lose more than this share of measured
# places. A partial build pops every block it does not price (T1021), so
# without this a half-finished scrape wipes half the master's beds.
MAX_MEASURED_LOSS = 0.02


def compact(rec):
    # A build made before bed_rules (or by hand) may still carry a dorm above
    # hotel3; the block every first paint reads never does.
    beds, _, _ = clean_beds(rec["beds"])
    return {"beds": beds, "q": rec["q"], "captured": rec.get("captured"),
            "supply": rec.get("supply", {})}


TIER_OF = {"dorm": "dorm", "private": "private", "bnb_room": "room", "bnb_home": "home",
           "hotel2": "hotel2", "hotel3": "hotel3", "hotel4": "hotel4", "hotel5": "hotel5"}


def loss_problem(before, after):
    """Why this apply loses too many measured places, or None."""
    if after["measured_share"] < before["measured_share"] - MAX_MEASURED_LOSS:
        return (f"measured beds would fall from {before['measured_share']:.1%} "
                f"({before['measured']}) to {after['measured_share']:.1%} ({after['measured']}), "
                f"more than {MAX_MEASURED_LOSS:.0%} points")
    return None


def apply_build(data, records, manifest):
    """Write the build into a loaded app_data dict. Returns (n, before, after).

    Pure on the dict, so the box (box_stays), the CLI and a replay on a copy
    of a master all run the same code.
    """
    before = bed_stats(data["destinations"])
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
    tiers = sorted({TIER_OF[k] for r in records.values() for k in (r.get("beds") or {})
                    if k in TIER_OF}, key=list(TIER_OF.values()).index)
    meta["stays"] = {"v": 1, "built": manifest.get("built"), "build": manifest.get("build"),
                     "url": LIVE_URL, "fees": FEES, "tiers": tiers}
    if OVERRIDE:
        meta["stays"]["override"] = OVERRIDE
    meta["schema_version"] = max(meta.get("schema_version", 17), 18)
    return n, before, bed_stats(data["destinations"])


def patch(path, records, manifest):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    n, before, after = apply_build(data, records, manifest)
    problem = loss_problem(before, after)
    if problem and not OVERRIDE:
        sys.exit(f"apply_stays refused for {path.name}: {problem}. "
                 "Nothing was written. --override \"reason\" to apply anyway.")
    if problem:
        print(f"OVERRIDE ({problem}): {OVERRIDE}")
    print(f"{path.name}: measured {before['measured_share']:.1%} -> {after['measured_share']:.1%}, "
          f"dorm above hotel3 {before['dorm_above_hotel3']} -> {after['dorm_above_hotel3']}")
    write_json(path, data, compact=path == SERVED)
    return n


def stamp_problem(manifest, folder):
    """Why a build may not be published, or None (T646)."""
    from build_stays import files_hash
    gate = (manifest or {}).get("gate") or {}
    if not gate.get("passed"):
        return "the gate did not pass (see cache/stays/gate_report.md)"
    if not gate.get("hash"):
        return "no gate stamp: built before T646"
    if files_hash(folder) != gate["hash"]:
        return "the files changed after the gate stamped them"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--override", default="", help="publish a build the gate did not pass; give the reason")
    a = ap.parse_args()
    manifest = read_json(V / "manifest.json")
    if not manifest:
        sys.exit("no stays build: run build_stays.py first")
    # T646: one publish path. Only a build whose gate passed, with the files
    # that gate stamped, is published; --override is the documented way round
    # it (the reason is printed and kept in meta.stays.override).
    problem = stamp_problem(manifest, V)
    if problem and not a.override:
        sys.exit(f"apply_stays refused: {problem}. Run build_stays.py --gate "
                 "(run_pipeline.py --only stays), or --override \"reason\".")
    if problem:
        print(f"OVERRIDE ({problem}): {a.override}")
        global OVERRIDE
        OVERRIDE = a.override
    records = load_records()
    with_beds = sum(1 for r in records.values() if r.get("beds"))
    print(f"{with_beds}/{len(records)} destinations have bed prices "
          f"(built {manifest['built']})")
    if a.dry_run:
        return
    write_all(records, manifest)


def load_records(folder=None):
    records = {}
    for f in (folder or V).glob("*.json"):
        if f.name != "manifest.json":
            records.update(read_json(f)["dests"])
    return records


def write_all(records, manifest):
    """The master, the served copy and the baked stays wire (main and box_stays)."""
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
