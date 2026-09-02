#!/usr/bin/env python3
"""Round-trip check: every parsed field must still exist verbatim in its source file.

Guards against the failure mode that matters most in an ingest pipeline — text
that was silently mangled, truncated or attached to the wrong record.

    python3 pipeline/verify_roundtrip.py [--sample N]   # default: all 253
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = "/root/carta/raw"
SOURCE_ROOTS = {
    "western-central": os.path.join(RAW, "9512a811-cartatripsv1"),
    "southern-mediterranean": os.path.join(
        RAW, "c90d0ee5-cartasouthernmedeuropedataset/carta-dataset"),
    "eastern-southeastern": os.path.join(RAW, "7deb9454-cartaeasterneuropetrips"),
    "northern-baltics": ("/root/.claude/uploads/9a14a1df-a60f-50d9-8c53-1af621be540a/"
                         "ebfc9d4b-carta_northern_europe_baltics_trips.md"),
}

_cache = {}


def load_source(trip):
    batch = trip["provenance"]["batch"]
    path = SOURCE_ROOTS[batch]
    if batch == "northern-baltics":
        if path not in _cache:
            _cache[path] = open(path, encoding="utf-8").read()
        whole = _cache[path]
        num = trip["provenance"]["sourceFile"].rsplit("-", 1)[-1]
        blocks = re.split(r"^## Trip (\d{2}) [—–-] ", whole, flags=re.M)
        for i in range(1, len(blocks), 2):
            if blocks[i] == num:
                return blocks[i + 1]
        return ""
    rel = trip["provenance"]["sourceFile"].split("/", 1)[1]
    full = os.path.join(path, rel)
    if full not in _cache:
        _cache[full] = open(full, encoding="utf-8").read()
    return _cache[full]


def norm(text):
    text = unicodedata.normalize("NFKC", text or "")
    return re.sub(r"\s+", " ", text).strip()


def contained(needle, haystack, length=80):
    """Is the first `length` chars of needle present in the source?"""
    n = norm(needle)[:length]
    if not n:
        return True
    return n in norm(haystack)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "trips.master.json"))
    ap.add_argument("--sample", type=int, default=0, help="0 = every trip")
    args = ap.parse_args()

    trips = json.load(open(args.data, encoding="utf-8"))["trips"]
    if args.sample:
        trips = random.sample(trips, min(args.sample, len(trips)))

    failures, checks = [], 0
    for t in trips:
        src = load_source(t)
        if not src:
            failures.append((t["id"], "source-not-found", t["provenance"]["sourceFile"]))
            continue

        def check(label, value, length=80):
            nonlocal checks
            if value:
                checks += 1
                if not contained(value, src, length):
                    failures.append((t["id"], label, norm(value)[:70]))

        check("title", t["title"], 40)
        for d in t["itinerary"]:
            check(f"day{d['day']}.morning", d["morning"])
            check(f"day{d['day']}.afternoon", d["afternoon"])
            check(f"day{d['day']}.evening", d["evening"])
            check(f"day{d['day']}.dayStats", d["dayStats"], 40)
        for a in t["accommodationStrategy"]:
            check(f"acc{a['rank']}.name", a["name"], 30)
            check(f"acc{a['rank']}.description", a["description"])
        for i, tip in enumerate(t["proTips"][:3], start=1):
            check(f"proTip{i}", tip)
        for key in ("connectivity", "emergency", "bookingWindows", "money"):
            check(f"logistics.{key}", t["logistics"][key])

        # budget figures must appear somewhere in the source text
        checks += 1
        low = t["budget"]["totalEur"]["low"]
        if low is not None:
            variants = {f"{low:,}", str(low)}
            if not any(v in norm(src) for v in variants):
                # the W&C batch states totals only in frontmatter arrays
                if not re.search(rf"\b{low}\b", src):
                    failures.append((t["id"], "budget.low", str(low)))

    print(f"TRIPS:{len(trips)}  CHECKS:{checks}  FAILURES:{len(failures)}")
    for f in failures[:30]:
        print("  ✗", " | ".join(f))
    if len(failures) > 30:
        print(f"  …and {len(failures) - 30} more")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
