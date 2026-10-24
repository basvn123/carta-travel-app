"""The trails difficulty gate (T642's rule, made a script by T647).

Tier: On demand (the trailslab worker job and its orchestrator task run it
after pipeline/field_stubs/gate.py --layer trails)

T642 changed one thing on the trails wire: a row's `difficulty` is its
published grade `f.g` whenever it has one (export_wire.wire_difficulty), so
the two keys stop disagreeing (11,629 of 17,670 rows did). A re-export is
only a good one when that holds everywhere and nothing else moved:

  1. zero rows where `f.g` is present and `difficulty` differs from it
  2. the rows are unchanged: the same number of rows in the country files
     as the previous wire (17,619 when T642 measured it), and the same row
     ids. The worker exports with --no-promote, so a change here is not a
     newly approved trip but something that went wrong.

Exit codes, the same contract as gate.py:
    0  gate passed, the new files may be published
    1  gate failed, keep the previous wire

The previous wire is a git tree-ish (--ref, default HEAD), read with
`git show`, so a tree id made from a working tree with a temporary index
(what the worker and the orchestrator do) works as well as a commit.

Usage, from the repo root:
    python pipeline/trails/difficulty_gate.py
    python pipeline/trails/difficulty_gate.py --base /tmp/new --ref 3f2a9c1
    python pipeline/trails/difficulty_gate.py --allow-row-change   # report only
    python pipeline/trails/difficulty_gate.py --self-test

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REL = "continent-app/public/trails"
COUNTRY_FILE = re.compile(r"^[A-Z]{2}\.json$")


def git_names(ref, rel):
    """Country file names under rel at ref."""
    r = subprocess.run(["git", "ls-tree", "--name-only", f"{ref}:{rel}"], cwd=ROOT,
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    return sorted(n for n in r.stdout.split() if COUNTRY_FILE.match(n))


def git_json(ref, rel):
    r = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.decode("utf-8"))


def rows(doc):
    """{id: row} of the rated trips in one country file (`listed` rows are
    the short-list stubs and carry no grade)."""
    out = {}
    for t in (doc or {}).get("trips") or []:
        if isinstance(t, dict) and t.get("id") is not None:
            out[str(t["id"])] = t
    return out


def mismatches(new_rows):
    bad = []
    for rid, t in new_rows.items():
        g = (t.get("f") or {}).get("g")
        if g is not None and t.get("difficulty") != g:
            bad.append(f"{rid} difficulty={t.get('difficulty')!r} f.g={g!r}")
    return bad


def judge(prev, new, allow_row_change):
    """prev, new: {file name: {id: row}}. Returns (fails, info)."""
    fails, info = [], []
    prev_ids = {i for r in prev.values() for i in r}
    new_ids = {i for r in new.values() for i in r}
    n_bad, examples, no_grade = 0, [], 0
    for name, r in sorted(new.items()):
        b = mismatches(r)
        n_bad += len(b)
        examples += [f"{name}: {x}" for x in b[:2]]
        no_grade += sum(1 for t in r.values() if (t.get("f") or {}).get("g") is None)
    if n_bad:
        fails.append(f"{n_bad} row(s) where difficulty != f.g, e.g. " + "; ".join(examples[:5]))
    info.append(f"rows without f.g (difficulty from the T642 floors): {no_grade}")
    change = []
    if len(new_ids) != len(prev_ids):
        change.append(f"rows {len(prev_ids)} -> {len(new_ids)}")
    lost, gained = prev_ids - new_ids, new_ids - prev_ids
    if lost:
        change.append(f"{len(lost)} id(s) gone, e.g. {', '.join(sorted(lost)[:5])}")
    if gained:
        change.append(f"{len(gained)} id(s) new, e.g. {', '.join(sorted(gained)[:5])}")
    if change:
        (info if allow_row_change else fails).append("rows changed: " + "; ".join(change))
    return fails, info


def load_new(base):
    d = Path(base) / REL
    names = sorted(p.name for p in d.glob("*.json") if COUNTRY_FILE.match(p.name)) if d.exists() else []
    return {n: rows(json.loads((d / n).read_text(encoding="utf-8"))) for n in names}


def load_prev(ref):
    names = git_names(ref, REL)
    if names is None:
        return None
    return {n: rows(git_json(ref, f"{REL}/{n}")) for n in names}


def run(base, ref, allow_row_change):
    new = load_new(base)
    if not new:
        print(f"[difficulty_gate] no country files under {Path(base) / REL}")
        return 1
    prev = load_prev(ref)
    if prev is None:
        print(f"[difficulty_gate] {ref} has no {REL}; cannot compare the rows")
        return 1
    fails, info = judge(prev, new, allow_row_change)
    n_prev = sum(len(r) for r in prev.values())
    n_new = sum(len(r) for r in new.values())
    print(f"[difficulty_gate] {len(new)} country file(s), rows {n_prev} -> {n_new}, ref {ref}")
    for line in info:
        print("  info:", line)
    for line in fails:
        print("  FAIL:", line)
    print(f"[difficulty_gate] {'FAILED: keep the previous wire' if fails else 'passed'}")
    return 1 if fails else 0


def self_test():
    def row(i, d, g):
        return {"id": i, "difficulty": d, "f": ({"g": g} if g else {})}
    prev = {"CH.json": rows({"trips": [row(1, "easy", "hard"), row(2, "easy", None)]})}
    good = {"CH.json": rows({"trips": [row(1, "hard", "hard"), row(2, "moderate", None)]})}
    f, _ = judge(prev, good, False)
    assert not f, f
    bad = {"CH.json": rows({"trips": [row(1, "easy", "hard"), row(2, "easy", None)]})}
    f, _ = judge(prev, bad, False)
    assert any("difficulty != f.g" in x for x in f), f
    lost = {"CH.json": rows({"trips": [row(1, "hard", "hard")]})}
    f, _ = judge(prev, lost, False)
    assert any("rows changed" in x for x in f), f
    f, i = judge(prev, lost, True)
    assert not f and any("rows changed" in x for x in i), (f, i)
    print("difficulty gate self-test passed")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ref", default="HEAD", help="git tree-ish holding the previous wire")
    ap.add_argument("--base", default=str(ROOT), help="root to read the NEW files from")
    ap.add_argument("--allow-row-change", action="store_true",
                    help="report a changed row set instead of failing on it")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    sys.exit(run(a.base, a.ref, a.allow_row_change))


if __name__ == "__main__":
    main()
