#!/usr/bin/env python3
"""Push the box's run status to R2 after every scheduled run (T1107, ROADMAP H9).

run_pipeline.sh calls this at the end of every run, good or failed. It

  1. writes the wire freshness report (scripts/freshness_report.py, T1099) to
     logs/status/freshness_wires.json;
  2. writes logs/status/last_run.json: tier, exit code, start and end, host,
     commit, and which of the files below were present;
  3. copies to the archive bucket, under status/ (never pulled by a box):
       status/pipeline_state.json     logs/pipeline_state.json (last_success per task)
       status/freshness_report.json   data/derived/freshness_report.json (run_pipeline.py)
       status/freshness_wires.json    logs/status/freshness_wires.json (step 1)
       status/last_run.json           logs/status/last_run.json (step 2)
       status/runs/<stamp>-<tier>.json  the same last_run record, one per run

Why a prefix of its own. archive/state/pipeline_state.json travels with the
master and is pushed only after a good run, because a rebuilt box pulls it
(T048-k). status/ is for people and the admin Data health panel (D2): it is
written after every run, a failed one included, and no box ever pulls it.

The bucket and the rclone remote come from pipeline/archive/manifest.yml, the
same ones push.py uses. A missing file is skipped and listed in last_run.json,
never an error; a failed upload exits 1 (run_pipeline.sh then exits 3).

    python infra/hetzner/cax11/push_status.py --tier weekly --rc 0 --started 1762419600 [--dry-run]

ASCII only, no em dashes.
"""
import argparse
import json
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / "pipeline" / "archive" / "manifest.yml"
DERIVED = ROOT / "data" / "derived"
# Box-local copies live in logs/status/ (gitignored; logs/ is never cleaned
# wholesale), so weekly.sh's git reset leaves them and git status stays clean.
STATUS_DIR = ROOT / "logs" / "status"
WIRES_OUT = STATUS_DIR / "freshness_wires.json"
LAST_RUN = STATUS_DIR / "last_run.json"
PREFIX = "status/"
RCLONE_FLAGS = ["--s3-no-check-bucket", "--header-upload", "Cache-Control: no-store"]

# local file -> key under status/
FILES = [
    (ROOT / "logs" / "pipeline_state.json", "pipeline_state.json"),
    (DERIVED / "freshness_report.json", "freshness_report.json"),
    (WIRES_OUT, "freshness_wires.json"),
    (LAST_RUN, "last_run.json"),
]


def remote_base(manifest_path=MANIFEST):
    """'<remote>:<bucket>/status/' from the manifest (plain key lookups, so the
    status push does not depend on PyYAML being importable)."""
    remote = bucket = None
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("rclone_remote:"):
            remote = line.split(":", 1)[1].strip()
        elif line.startswith("bucket:"):
            bucket = line.split(":", 1)[1].strip()
    if not remote or not bucket:
        raise SystemExit(f"push_status: no rclone_remote or bucket in {manifest_path}")
    return f"{remote}:{bucket}/{PREFIX}"


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def commit():
    try:
        return subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, timeout=10, check=False).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def freshness_wires():
    """Run the T1099 report into WIRES_OUT. Returns its summary or an error."""
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        import freshness_report
        rep = freshness_report.build_report(str(ROOT / "continent-app" / "public"))
        WIRES_OUT.write_text(json.dumps(rep, indent=1), encoding="utf-8")
        return rep["meta"]
    except Exception as e:  # noqa: BLE001  a broken report must not stop the state push
        return {"error": f"{type(e).__name__}: {e}"}


def build_record(tier, rc, started, now=None, wires_meta=None):
    now = now if now is not None else datetime.now(timezone.utc).timestamp()
    return {
        "schema": "carta-box-status/1",
        "tier": tier,
        "exit": rc,
        "ok": rc == 0,
        "started_at": iso(started) if started else None,
        "finished_at": iso(now),
        "host": socket.gethostname(),
        "commit": commit(),
        "freshness_wires": wires_meta,
        "files": {key: path.is_file() for path, key in FILES if path != LAST_RUN},
    }


def plan(base, record):
    """The rclone commands, in order: the run record goes last, so a reader that
    sees a new last_run.json also sees the files it describes."""
    cmds = []
    for path, key in FILES:
        if path == LAST_RUN or not path.is_file():
            continue
        cmds.append(["rclone", "copyto", str(path), base + key, *RCLONE_FLAGS])
    stamp = record["finished_at"].replace(":", "").replace("-", "")
    cmds.append(["rclone", "copyto", str(LAST_RUN), f"{base}runs/{stamp}-{record['tier']}.json", *RCLONE_FLAGS])
    cmds.append(["rclone", "copyto", str(LAST_RUN), base + "last_run.json", *RCLONE_FLAGS])
    return cmds


def main(argv=None):
    ap = argparse.ArgumentParser(description="push the run status to R2 status/")
    ap.add_argument("--tier", required=True)
    ap.add_argument("--rc", type=int, required=True)
    ap.add_argument("--started", type=float, default=None, help="run start, epoch seconds")
    ap.add_argument("--dry-run", action="store_true", help="write the local files, print the uploads")
    a = ap.parse_args(argv)

    wires = freshness_wires()
    record = build_record(a.tier, a.rc, a.started, wires_meta=wires)
    STATUS_DIR.mkdir(parents=True, exist_ok=True)
    LAST_RUN.write_text(json.dumps(record, indent=1), encoding="utf-8")
    missing = [k for k, present in record["files"].items() if not present]
    print(f"push_status: {a.tier} run, exit {a.rc}; freshness_wires "
          f"{wires.get('error') or str(wires.get('n_over_cadence')) + ' over cadence'}"
          + (f"; not present, skipped: {', '.join(missing)}" if missing else ""))

    failed = 0
    for cmd in plan(remote_base(), record):
        print("  + " + " ".join(cmd[:4]))
        if a.dry_run:
            continue
        try:
            if subprocess.run(cmd, timeout=300, check=False).returncode != 0:
                failed += 1
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"  ! {type(e).__name__}: {e}")
            failed += 1
    if failed:
        print(f"push_status: {failed} upload(s) failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
