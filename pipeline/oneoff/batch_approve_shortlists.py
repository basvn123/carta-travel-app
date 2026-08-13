"""Batch-approve the staged shortlist content through the review API.

2026-08-13, owner-directed: "use gemini for describe, and approve everything".
Approval is deliberately human-gated (the API is the only path to approved),
so this script exists as the owner's recorded batch action rather than a DB
side door: every approval goes through POST /api/trips/{id}/decision on the
running review server, which writes the trip_reviews ledger row with the
reviewer identity and this note.

Scope: the CURATED sets only - the flagship + dayhike shortlist CSVs
(CH/NO/AT/FR) and every citytrip currently at needs_review. The 236k raw
needs_review hike relations from the Europe-wide ingest are NOT touched:
the shortlists are the curation.

Usage, with the review API up on 127.0.0.1:8011:
    python pipeline/oneoff/batch_approve_shortlists.py --dry-run
    python pipeline/oneoff/batch_approve_shortlists.py
"""
import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "trails"))

API = "http://127.0.0.1:8011/api"
NOTE = ("batch approval of the staged seed shortlists, directed by the "
        "owner on 2026-08-13 (see docs/TRAILS_EXPANSION_PLAN.md)")
COUNTRIES = ("CH", "NO", "AT", "FR")


def api(path, payload=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
        method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def shortlist_ids():
    ids = []
    for cc in COUNTRIES:
        for suffix in ("", "_dayhikes"):
            p = ROOT / "data" / "reports" / "trails_seed" / f"{cc}{suffix}.csv"
            if not p.exists():
                continue
            with p.open(encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    ids.append(int(row["trip_id"]))
    return ids


def citytrip_ids():
    from db import connect
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM trips WHERE category = 'citytrip' "
                    "AND status = 'needs_review' ORDER BY id")
        return [r[0] for r in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    targets = shortlist_ids() + citytrip_ids()
    targets = list(dict.fromkeys(targets))          # de-dup, keep order
    print(f"{len(targets)} trips to approve")
    if args.dry_run:
        return

    ok = skipped = failed = 0
    for tid in targets:
        try:
            res = api(f"/trips/{tid}/decision",
                      {"action": "approve", "note": NOTE})
            ok += 1
            if ok % 25 == 0:
                print(f"  {ok}/{len(targets)}")
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:120]
            if e.code == 409:               # already published
                skipped += 1
            else:
                failed += 1
                print(f"  ! {tid}: HTTP {e.code} {body}")
        except Exception as e:
            failed += 1
            print(f"  ! {tid}: {type(e).__name__}: {e}")
    print(f"approved {ok}, skipped {skipped} (already published), "
          f"failed {failed}")


if __name__ == "__main__":
    main()
