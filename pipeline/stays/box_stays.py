"""The box's monthly stay-price refresh (T1021): scrape journal in, live wire out.

The laptop scrapes Booking and Hostelworld (Booking turns away datacenter
addresses like the box's) and, after every run, uploads its journal to the
private bucket (r2:carta-stays-state/state/journal_scrape.sqlite). Each month
the box:

  1. downloads that journal (rclone copyto: only when R2 holds a different
     file; a run still in progress on the laptop never uploads, so what R2
     holds is always a finished run)
  2. downloads the live build (r2:carta/data/stays-live/v1/) as the one the
     gate judges against (with nothing live yet: the copy the app ships)
  3. runs build_stays.py --gate (scrape only)
  4. on a passed gate, publishes the country files to data/stays-live/v1/,
     which the app already reads (staysData keeps whichever copy is newer),
     so no app deploy is needed; on a failed gate the live files stay

Exit codes: 0 published, 2 gate failed (nothing published), 1 an rclone step
failed. Needs the rclone remote `r2` (CARTA_RCLONE names another binary):
on the box, `set -a; . ~/.config/carta/env; set +a` first.

Usage:  python pipeline/stays/box_stays.py [--dry-run]
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import JOURNAL_SCRAPE, OUT, ROOT, STATE, read_json  # noqa: E402

RCLONE = os.environ.get("CARTA_RCLONE", "rclone")
JOURNAL_R2 = "r2:carta-stays-state/state/journal_scrape.sqlite"
LIVE_R2 = "r2:carta/data/stays-live/v1/"
PREV = STATE / "live_prev"
V = OUT / "v1"
HEADERS = ["--header-upload", "Content-Type: application/json",
           "--header-upload", "Cache-Control: public, max-age=3600, stale-while-revalidate=86400"]


def run(cmd, dry=False):
    print("+", " ".join(cmd), flush=True)
    if dry:
        return 0
    return subprocess.run(cmd, cwd=ROOT).returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the rclone steps, publish nothing")
    a = ap.parse_args()
    STATE.mkdir(parents=True, exist_ok=True)
    if run([RCLONE, "copyto", JOURNAL_R2, str(JOURNAL_SCRAPE)], a.dry_run):
        sys.exit("box_stays: could not download the scrape journal")
    if run([RCLONE, "sync", LIVE_R2, str(PREV)], a.dry_run):
        sys.exit("box_stays: could not download the live build")
    # Judge against the live build; with nothing live yet, against the copy
    # the app ships (build_stays' default).
    env = dict(os.environ)
    if any(f.name != "manifest.json" for f in PREV.glob("*.json")):
        env["STAYS_PREV"] = str(PREV)
    rc = subprocess.run([sys.executable, str(Path(__file__).with_name("build_stays.py")), "--gate"],
                        cwd=ROOT, env=env).returncode
    if rc:
        print("box_stays: the gate did not pass; the live files stay (cache/stays/gate_report.md)")
        sys.exit(2)
    from build_stays import files_hash
    gate = (read_json(V / "manifest.json") or {}).get("gate") or {}
    if not gate.get("passed") or files_hash(V) != gate.get("hash"):
        print("box_stays: the build carries no passed gate stamp; nothing published")
        sys.exit(2)
    if run([RCLONE, "sync", str(V), LIVE_R2, *HEADERS], a.dry_run):
        sys.exit("box_stays: the publish failed")
    print(f"box_stays: published {len(list(V.glob('*.json')))} files to {LIVE_R2}")


if __name__ == "__main__":
    main()
