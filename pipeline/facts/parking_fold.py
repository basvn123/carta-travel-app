"""Fold the web-checked parking cache into public.facts rows, and back.

Tier: Manual. Read-only until T147: nothing here talks to a database.

pipeline/dossier/parking_check.py keeps one grounded parking record per
destination in cache/dossier/parking_web.json, with its sources and the date
it was checked, and build_dossier.py merges it into the dossier as
parking.web. The facts store T041 designed (public.facts, the migration T147
writes) is meant to be the one place a dated, sourced fact lives, so register
row T041-f asks for this cache to become store rows. T327 wrote the mapping;
T147 writes the rows once the table exists.

One record becomes one row, entity dest:<id>, field transport.parking (class
transport, 90-day TTL). It stays one row rather than one per car park
because the record came from one prompt with one source list: splitting it
would claim each part had its own citation, which it never had.

row_to_overlay() is the read half: it rebuilds exactly the parking.web block
build_dossier.parking_web_overlay() prints today, from a row as
facts_snapshot.json will carry it. --check runs every cached record through
record_to_row() and row_to_overlay() and compares the result with what
build_dossier prints from the cache today, so the fold is proven lossless on
the real file before anything is written.

One deliberate difference. A record with no source that counts as a
publisher (common.publisher) becomes status 'unsourced' with its value
withheld, as T041's status rules say, so its overlay disappears. Today such a
record still prints parking.web, often only {"restricted": false}: a claim
with no citation behind it.

Usage, from the repo root:
    python pipeline/facts/parking_fold.py --check
    python pipeline/facts/parking_fold.py --check --cache <dir holding parking_web.json>

ASCII clean, no em dashes, per project convention.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "dossier"))
sys.path.insert(0, os.path.join(HERE, ".."))
from common import DCACHE, load_json, publisher  # noqa: E402

FIELD = "transport.parking"
CLASS = "transport"
TTL_DAYS = 90  # fact_classes.transport in the T041 design; the table is the authority

# What the value carries: everything parking_check.py writes about the place
# itself. checked, sources and model have columns of their own.
VALUE_KEYS = ("official_url", "restricted", "restricted_note", "car_parks",
              "park_ride_names", "advice", "confidence")

# The keys build_dossier.parking_web_overlay() prints, in its order.
OVERLAY_KEYS = ("checked", "official_url", "restricted", "restricted_note",
                "advice", "sources", "park_ride_names", "car_parks")

EMPTY = (None, "", [], {})


def record_to_row(dest_id, rec, ttl_days=TTL_DAYS):
    """One parking_web.json record -> one public.facts row (a dict of columns).

    Returns None for a record that was never checked (no date), which the
    overlay ignores today too."""
    if not isinstance(rec, dict) or not rec.get("checked"):
        return None
    sources = [s for s in rec.get("sources") or [] if isinstance(s, str) and s]
    citable = [s for s in sources if publisher(s)]
    fetched = dt.datetime.strptime(rec["checked"], "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    value = {k: rec[k] for k in VALUE_KEYS if rec.get(k) not in EMPTY or k == "restricted"}
    official = rec.get("official_url")
    first = official if official in citable else (citable[0] if citable else None)
    text = rec.get("advice") or rec.get("restricted_note")
    ok = bool(citable)
    return {
        "entity_key": f"dest:{dest_id}",
        "field": FIELD,
        "class": CLASS,
        "value": value if ok else None,
        "value_text": (text[:400] if isinstance(text, str) and ok else None),
        # The record's own high / medium / low stays inside value; the column
        # speaks the store's vocabulary, and a cited record is 'sourced'.
        "confidence": "sourced" if ok else "estimated",
        "source_url": first,
        "source_urls": sources,
        "fetched_at": fetched.isoformat().replace("+00:00", "Z"),
        "expires_at": (fetched + dt.timedelta(days=ttl_days)).isoformat().replace("+00:00", "Z"),
        "status": "ok" if ok else "unsourced",
        "failures": 0,
        "demand": 0,
        "model": rec.get("model"),
        # Searches Google metered for this record. The cached records were
        # researched by hand in Cowork sessions, not by a grounded Gemini
        # call, so nothing was metered.
        "queries": 0,
    }


def row_to_overlay(row):
    """A public.facts row (or a facts_snapshot.json entry) -> the parking.web
    block build_dossier prints. None when the row has nothing to serve."""
    if not row or row.get("status") not in ("ok", "stale") or not row.get("value"):
        return None
    v = row["value"]
    full = {
        "checked": (row.get("fetched_at") or "")[:10],
        "official_url": v.get("official_url"),
        "restricted": v.get("restricted"),
        "restricted_note": v.get("restricted_note"),
        "advice": v.get("advice"),
        "sources": row.get("source_urls") or [],
        "park_ride_names": v.get("park_ride_names"),
        "car_parks": v.get("car_parks"),
    }
    keep = {k: full[k] for k in OVERLAY_KEYS if full[k] not in EMPTY}
    return keep or None


def check(cache_dir):
    """Compare today's overlay with the folded one for every cached record."""
    import build_dossier  # noqa: E402  (heavy-ish, only needed here)

    path = os.path.join(cache_dir, "parking_web.json")
    cache = load_json(path, {}) or {}
    build_dossier._PARKING_WEB = cache
    same = dropped = differ = 0
    examples = []
    for did in sorted(cache):
        today = build_dossier.parking_web_overlay({"id": did})
        folded = row_to_overlay(record_to_row(did, cache[did]))
        if today == folded:
            same += 1
        elif folded is None and today is not None:
            dropped += 1
        else:
            differ += 1
            if len(examples) < 5:
                examples.append((did, today, folded))
    rows = [record_to_row(d, r) for d, r in cache.items()]
    by_status = {}
    for r in rows:
        if r:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    report = {"file": path, "records": len(cache), "identical": same,
              "withheld_unsourced": dropped, "differ": differ, "rows_by_status": by_status}
    print(json.dumps(report, indent=1))
    for did, a, b in examples:
        print(f"  {did}: today {json.dumps(a)[:200]}  folded {json.dumps(b)[:200]}")
    return differ == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="round-trip every cached record and compare with build_dossier")
    ap.add_argument("--cache", default=DCACHE,
                    help="directory holding parking_web.json (default cache/dossier)")
    args = ap.parse_args()
    if not args.check:
        ap.error("nothing to do: this module only checks until T147 creates public.facts")
    sys.exit(0 if check(args.cache) else 1)


if __name__ == "__main__":
    main()
