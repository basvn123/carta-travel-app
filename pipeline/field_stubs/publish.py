"""Run a layer's writer behind its publish gate (T640 wiring).

Tier: Scheduled (run_pipeline.py wraps the explore data fill exports in it)

    python pipeline/field_stubs/publish.py --layer beaches -- \
        python pipeline/beaches/export_beaches.py
    python pipeline/field_stubs/publish.py --layer climate --layer master \
        --keep continent-app/public/app_data.json -- \
        python pipeline/harvest_climate_power.py --daily :: python pipeline/apply_climate.py

What it does, in order:

  1. snapshots every file of each --layer (gate.py LAYERS) and every --keep
     path into logs/publish_prev/<name>/, laid out like the repo;
  2. runs the commands after `--`, one after the other (`::` separates them);
  3. runs gate.py for each layer with the snapshot as the previous wire;
  4. on a failed command or a failed gate, puts the snapshot back (files the
     run created are deleted, files it changed are copied back), says why,
     and exits 1. On a pass it deletes the snapshot and exits 0.

Why a snapshot and not `git checkout HEAD -- <paths>`: on the Hetzner box the
previous wire is what last week's run left in the working tree (the box never
commits), the master app_data/app_data.json is gitignored, and the overlay
caches are untracked. A snapshot covers all three the same way.

The run_pipeline.py tasks that call this are `soft`, so exit 1 is logged as a
SOFT-FAIL: the ship still runs with the previous wire, and the task is due
again next week (its resumable caches make the retry cheap).

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
import gate  # noqa: E402

SNAP_ROOT = ROOT / "logs" / "publish_prev"


def layer_paths(layer):
    rel = gate.LAYERS[layer][0]
    return [rel]


def files_under(rel):
    """Repo-relative files at rel (a file, or every file under a dir)."""
    p = ROOT / rel
    if p.is_file():
        return [rel]
    if p.is_dir():
        return sorted(q.relative_to(ROOT).as_posix() for q in p.rglob("*") if q.is_file())
    return []


def snapshot(rels, snap):
    if snap.exists():
        shutil.rmtree(snap)
    snap.mkdir(parents=True)
    n = size = 0
    for rel in rels:
        for f in files_under(rel):
            dst = snap / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / f, dst)
            n += 1
            size += dst.stat().st_size
    print(f"[publish] snapshot of {', '.join(rels)}: {n} file(s), {size / 1e6:.1f} MB -> "
          f"{snap.relative_to(ROOT).as_posix()}")


def restore(rels, snap):
    """Put the snapshot back without removing any directory: a directory may
    be a junction in a worktree, and rmtree through one deletes its target."""
    put = gone = 0
    for rel in rels:
        before = set()
        sp = snap / rel
        if sp.is_file():
            before = {rel}
        elif sp.is_dir():
            before = {q.relative_to(snap).as_posix() for q in sp.rglob("*") if q.is_file()}
        for f in files_under(rel):
            if f not in before:
                (ROOT / f).unlink()
                gone += 1
        for f in sorted(before):
            dst = ROOT / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(snap / f, dst)
            put += 1
    print(f"[publish] previous wire restored: {put} file(s) put back, {gone} new file(s) removed")


def split_cmds(argv):
    cmds, cur = [], []
    for a in argv:
        if a == "::":
            if cur:
                cmds.append(cur)
            cur = []
        else:
            cur.append(a)
    if cur:
        cmds.append(cur)
    return cmds


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if "--" not in argv:
        print("publish.py: give the commands after --", file=sys.stderr)
        return 2
    i = argv.index("--")
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", action="append", required=True, choices=sorted(gate.LAYERS))
    ap.add_argument("--keep", action="append", default=[],
                    help="another repo path to snapshot and restore with the layer")
    ap.add_argument("--allow-row-loss", action="store_true")
    ap.add_argument("--name", help="snapshot folder name (default: the layers)")
    a = ap.parse_args(argv[:i])
    cmds = split_cmds(argv[i + 1:])
    if not cmds:
        print("publish.py: no command after --", file=sys.stderr)
        return 2

    rels = []
    for layer in a.layer:
        rels += layer_paths(layer)
    rels += a.keep
    snap = SNAP_ROOT / (a.name or "+".join(a.layer))
    snapshot(rels, snap)

    for c in cmds:
        print(f"[publish] $ {' '.join(c)}", flush=True)
        rc = subprocess.run(c, cwd=str(ROOT)).returncode
        if rc != 0:
            print(f"[publish] command failed (exit {rc}); keeping the previous wire")
            restore(rels, snap)
            return 1

    failed = []
    for layer in a.layer:
        rc = gate.run(layer, "HEAD", None, a.allow_row_loss, False, prev_dir=snap)
        if rc != 0:
            failed.append(layer)
    if failed:
        print(f"[publish] gate FAILED for {', '.join(failed)}: keeping the previous wire "
              f"(the FAIL lines above say why)")
        restore(rels, snap)
        return 1
    shutil.rmtree(snap, ignore_errors=True)
    print(f"[publish] gate passed for {', '.join(a.layer)}: the new files stand")
    return 0


def self_test():
    """Snapshot, change, restore, in a scratch folder under logs/."""
    global ROOT
    old = ROOT
    tmp = old / "logs" / "publish_selftest"
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        ROOT = tmp
        (tmp / "w").mkdir(parents=True)
        (tmp / "w" / "a.json").write_text("1", encoding="utf-8")
        snap = tmp / "snap"
        snapshot(["w", "f.json"], snap)
        (tmp / "w" / "a.json").write_text("2", encoding="utf-8")
        (tmp / "w" / "b.json").write_text("3", encoding="utf-8")
        (tmp / "f.json").write_text("4", encoding="utf-8")
        restore(["w", "f.json"], snap)
        assert (tmp / "w" / "a.json").read_text(encoding="utf-8") == "1"
        assert not (tmp / "w" / "b.json").exists()
        assert not (tmp / "f.json").exists()
        assert split_cmds(["a", "b", "::", "c"]) == [["a", "b"], ["c"]]
    finally:
        ROOT = old
        shutil.rmtree(tmp, ignore_errors=True)
    print("publish self-test passed")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        sys.exit(self_test())
    sys.exit(main())
