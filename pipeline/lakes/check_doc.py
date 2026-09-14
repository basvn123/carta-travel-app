# -*- coding: utf-8 -*-
"""Check that every pointer LAKES.md gives a reader actually resolves.

The doc names files, modules, symbols and wire fields. Each is a promise that
a reader can go and look, and each was true when it was written, which is
precisely why nobody re-reads them.

This exists because that promise was broken once, on 2026-08-30, in the
paragraph most pleased with itself. The doc told a reader to check a field in
`index.json` to see whether a table had drifted, and the field did not exist:
it was to be written by the export that follows the change, and the wire on
disk predated it. (That field has since gone entirely, along with the constant
it fed, which is its own lesson about pointing at things that are still
moving.) A pointer to a field a future build will write is not verifiable at
the moment you write it and reads identically to one that is, so the only way
to tell them apart is to go and look.

Run it after editing docs/LAKES.md, and after any rename in pipeline/lakes:

    python pipeline/lakes/check_doc.py

Exits non-zero if anything the doc names cannot be found. A field the doc
explicitly says arrives from a later export is reported, not failed.

Two properties worth keeping if this is ever rewritten. The list of wire
fields is READ FROM THE DOC rather than kept here: a hardcoded copy would
drift silently in the worst direction, since a new pointer the doc makes
would simply go unchecked, which is this script's own fault one level in.
And its correctness is a FACT rather than a judgement, which is why it was
worth adding on an evening whose finding was that guards are the least
examined code in the repo. A path resolves or it does not. There is no
neighbouring pair to check by mistake and no vintage to be stale against.
Verified by planting three faults, one of each kind, and confirming it
caught all three and exited 1.

ASCII clean, no em dashes, per project convention.
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(".")
doc = (ROOT / "docs" / "LAKES.md").read_text(encoding="utf-8")

ok, bad = [], []


def check(label, condition, note=""):
    (ok if condition else bad).append(f"{label}{(' -> ' + note) if note else ''}")


# 1. Every backticked path that looks like a file in this repo.
paths = set(re.findall(r"`((?:pipeline|continent-app|docs|cache|data)/[\w./{}-]+)`", doc))
for raw in sorted(paths):
    if "{" in raw:                      # templated, e.g. cache/lakes/raw_CC.json
        stem = raw.split("{")[0]
        parent = Path(stem).parent
        check(raw, parent.exists(), f"parent {parent} missing" if not parent.exists() else "")
        continue
    if "CC" in Path(raw).name and raw.endswith(".json"):
        parent = Path(raw).parent
        check(raw, parent.exists(), "" if parent.exists() else f"{parent} missing")
        continue
    check(raw, (ROOT / raw).exists(), "" if (ROOT / raw).exists() else "MISSING")

# 2. Python symbols the doc names as living in a module.
symbols = [
    ("pipeline/lakes/lake_index.py", ["WEIGHTS", "TIER_CUTOFFS", "WALKS_TERM",
                                      "WALKS_DEFAULT", "photo_raw",
                                      "water_temp_estimate", "swim_rule"]),
    ("pipeline/lakes/export_lakes.py", ["MIN_SCORE", "MIN_IMAGES", "BASIN_FLOOR",
                                        "COUNTRY_FLOOR", "PUBLISH_MAX", "TOP_N",
                                        "TOP_PER_COUNTRY", "HERO_TIERS",
]),
    ("pipeline/lakes/seed_lakes.py", ["SEED", "NO_WATER"]),
    ("pipeline/lakes/enrich_lakes.py", ["shortlist_for"]),
    ("pipeline/lakes/osm_water.py", ["sweep_country", "keepable"]),
    ("pipeline/regions/quotas.py", ["QUOTA", "published_target", "floor"]),
]
for path, names in symbols:
    src = (ROOT / path).read_text(encoding="utf-8")
    for n in names:
        if n not in doc:
            continue                    # only check what the doc actually names
        check(f"{path}::{n}", re.search(rf"(^|\s|def ){n}\b", src, re.M) is not None,
              "not found in module")

# 3. Wire fields the doc tells a reader to look at.
#
# The list is READ FROM THE DOC, not kept here. A hardcoded copy would be one
# more thing to drift, and it would drift silently in the direction that
# matters: a new pointer the doc makes would simply go unchecked, which is the
# fault this script exists to catch, one level in. The regions harness makes
# the same move by reading a pointers block out of REGIONS.md.
idx_path = ROOT / "continent-app" / "public" / "lakes" / "index.json"
idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {}
model = idx.get("model") or {}

# A field the doc explicitly says arrives from a later export is REPORTED,
# never failed: "not built yet" and "does not exist" are different answers and
# only the second is a fault. The doc marks them by naming the boundary.
deferred_marker = "from the first export after"
deferred = set()
if deferred_marker in doc:
    for para in doc.split(chr(10) + chr(10)):
        if deferred_marker in para:
            deferred.update(re.findall(r"`(\w+)`", para))

for field in sorted(set(re.findall(r"model[.](\w+)", doc))):
    if field in model:
        check(f"index.json model.{field}", True)
    elif field in deferred:
        print(f"  deferred: model.{field} arrives from the next export "
              f"(the doc says so)")
    else:
        check(f"index.json model.{field}", False, "ABSENT from the wire")

print()
print(f"{len(ok)} pointers resolve, {len(bad)} do not")
for b in bad:
    print("  FAIL", b)
if bad:
    raise SystemExit(1)
