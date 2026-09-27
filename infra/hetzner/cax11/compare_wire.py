#!/usr/bin/env python3
"""Compare two Carta wire builds by shape, not by content.

Task report: Execution/P3/T048-pipeline-cron-migration.md. Written for the
move of the weekly pipeline from the laptop to the Linux orchestrator: the done
condition is a wire built on the CAX11 that is "identical in shape" to the
laptop's. Prices, dates and ratings will differ between two runs a week apart,
or even an hour apart; what must not differ is what the app parses.

What "shape" means here, and why each part:

  file set     every file under the root, by relative path, except assets/
               (Vite's hashed bundles, whose names change on every build). A
               file on one side and not the other is always a difference,
               because the app fetches wire files by name (public/fares/CRL.json,
               public/poi/<id>.json) and a missing one is a 404 in production.
  keys         for every JSON file, the keys of the root object, the keys of
               its children and one level further, inferred as a merged schema.
               Objects whose keys are data (IATA codes, destination ids, dates)
               are treated as maps: their keys are not compared, their size is,
               and the shape of their values is.
  schema       schema_version / version / schema / v at the root or under
               meta, compared exactly. The app hydrates by these.
  counts       the size of every map and list at the top two levels of a file
               (destinations in app_data.json, anchors in a fare slice),
               compared within a relative tolerance (default 5 percent).

Directories with many files of one kind (fares/, poi/, trails/, dossier/ ...)
are compared as a group: the whole file-name set, plus a merged shape over an
evenly spaced sample of their files (default 200 per directory), so a 17,000
file directory costs seconds, not minutes. The sample is taken from the sorted
names, so two identical name sets sample the same files on both machines.

Either side can be a directory or a summary file written by `summarize`, so the
two builds never have to be on the same machine: summarise on the box, copy the
small JSON to the laptop, compare there.

Usage:
  python compare_wire.py summarize continent-app/dist -o box_wire.json
  python compare_wire.py compare laptop_wire.json box_wire.json
  python compare_wire.py compare continent-app/public /path/to/other/public
Options for both: --sample N (files per directory), --exclude DIR (repeatable,
default assets). compare: --count-tolerance F (default 0.05).

Exit codes: 0 same shape, 1 differences found, 2 usage or input error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

SUMMARY_KIND = "carta-wire-shape"
SUMMARY_VERSION = 1
DEPTH = 3                # root keys, their children, one level further
MAX_VALUES = 256         # values sampled per map or list when merging a shape
MAP_MIN_KEYS = 64        # an object with more keys than this is a map
VERSION_KEYS = ("schema_version", "version", "schema", "v")

# Keys that are data rather than field names: IATA and ISO codes, region codes
# (AL01, FRK21), numeric ids, dates, Wikidata ids, and the dunder sidecars the
# fare slices carry (__window).
_MAP_KEY = re.compile(
    r"^(?:[A-Z0-9]{2,6}|[A-Z]{2}[A-Z0-9_-]+|\d+|\d{4}-\d{2}(?:-\d{2})?|Q\d+|__\w+)$")


# --------------------------------------------------------------------------- #
# Shape inference
# --------------------------------------------------------------------------- #
def _tname(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "num"
    if isinstance(v, str):
        return "str"
    if isinstance(v, list):
        return "list"
    return "obj"


def _is_map(d: dict) -> bool:
    if len(d) > MAP_MIN_KEYS:
        return True
    if not d:
        return False
    hits = sum(1 for k in d if _MAP_KEY.match(k))
    return hits / len(d) >= 0.8


def _spread(items: list, n: int = MAX_VALUES) -> list:
    """Evenly spaced, deterministic sample of a sorted sequence."""
    if len(items) <= n:
        return items
    step = len(items) / n
    return [items[int(i * step)] for i in range(n)]


def shape_of(v, depth: int = DEPTH) -> dict:
    t = _tname(v)
    if t == "obj":
        if _is_map(v):
            keys = sorted(v)
            s = {"t": {"map"}, "n": [len(v)], "seen": 1}
            if depth > 1:
                s["v"] = merge_all([shape_of(v[k], depth - 1) for k in _spread(keys)])
            return s
        s = {"t": {"obj"}, "seen": 1, "k": {}}
        for k, child in v.items():
            s["k"][k] = shape_of(child, depth - 1) if depth > 1 else {"t": {_tname(child)}, "seen": 1}
        return s
    if t == "list":
        s = {"t": {"list"}, "n": [len(v)], "seen": 1}
        if depth > 1 and v:
            s["v"] = merge_all([shape_of(x, depth - 1) for x in _spread(v)])
        return s
    return {"t": {t}, "seen": 1}


def merge(a: dict | None, b: dict | None) -> dict | None:
    if a is None:
        return b
    if b is None:
        return a
    out = {"t": a["t"] | b["t"], "seen": a["seen"] + b["seen"]}
    if "n" in a or "n" in b:
        out["n"] = a.get("n", []) + b.get("n", [])
    if "v" in a or "v" in b:
        out["v"] = merge(a.get("v"), b.get("v"))
    if "k" in a or "k" in b:
        ka, kb = a.get("k", {}), b.get("k", {})
        out["k"] = {k: merge(ka.get(k), kb.get(k)) for k in set(ka) | set(kb)}
    return out


def merge_all(shapes: list) -> dict | None:
    out = None
    for s in shapes:
        out = merge(out, s)
    return out


def to_json(s: dict | None, total: int | None = None) -> dict | None:
    """Freeze a shape for the summary file. `seen` becomes `share`, the fraction
    of sampled parents in which the key was present, so an optional key can be
    told apart from a vanished one."""
    if s is None:
        return None
    total = total or s["seen"]
    out = {"t": sorted(s["t"]), "share": round(s["seen"] / total, 3)}
    if s.get("n"):
        ns = s["n"]
        out["n"] = round(sum(ns) / len(ns), 2)
    if s.get("v") is not None:
        out["v"] = to_json(s["v"])
    if s.get("k") is not None:
        out["k"] = {k: to_json(c, s["seen"]) for k, c in sorted(s["k"].items())}
    return out


def versions_in(obj) -> dict:
    found = {}
    if isinstance(obj, dict):
        for k in VERSION_KEYS:
            if k in obj and _tname(obj[k]) in ("str", "num"):
                found[k] = obj[k]
        meta = obj.get("meta")
        if isinstance(meta, dict):
            for k in VERSION_KEYS:
                if k in meta and _tname(meta[k]) in ("str", "num"):
                    found["meta." + k] = meta[k]
    return found


# --------------------------------------------------------------------------- #
# Summarise a directory
# --------------------------------------------------------------------------- #
def _load(p: Path):
    with open(p, "r", encoding="utf-8") as fh:
        return json.load(fh)


def summarize(root: Path, sample: int, excludes: list[str]) -> dict:
    if not root.is_dir():
        raise SystemExit(f"not a directory: {root}")
    files: dict[str, dict] = {}
    groups: dict[str, list[str]] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        top = rel_dir.split("/", 1)[0] if rel_dir != "." else ""
        if top in excludes:
            dirnames[:] = []
            continue
        dirnames.sort()
        for name in sorted(filenames):
            rel = name if rel_dir == "." else f"{rel_dir}/{name}"
            if top:
                groups.setdefault(top, []).append(rel)
            else:
                files[rel] = {}

    errors = []
    for rel in sorted(files):
        entry = files[rel]
        if rel.endswith(".json"):
            try:
                obj = _load(root / rel)
                entry["shape"] = to_json(shape_of(obj))
                entry["versions"] = versions_in(obj)
            except Exception as e:  # a broken file is a finding, not a crash
                entry["error"] = f"{type(e).__name__}: {e}"[:200]
                errors.append(rel)

    dirs = {}
    for top, names in sorted(groups.items()):
        names.sort()
        jsons = [n for n in names if n.endswith(".json")]
        picked = _spread(jsons, sample) if sample else jsons
        shapes, versions, bad = [], {}, []
        for rel in picked:
            try:
                obj = _load(root / rel)
            except Exception as e:
                bad.append(f"{rel}: {type(e).__name__}")
                continue
            shapes.append(shape_of(obj))
            for k, v in versions_in(obj).items():
                versions.setdefault(k, set()).add(json.dumps(v))
        dirs[top] = {
            "n_files": len(names),
            "n_json": len(jsons),
            "sampled": len(picked),
            "names": names,
            "shape": to_json(merge_all(shapes)),
            "versions": {k: sorted(v) for k, v in sorted(versions.items())},
            "unreadable": bad,
        }
        errors += bad

    return {
        "kind": SUMMARY_KIND,
        "version": SUMMARY_VERSION,
        "root": str(root),
        "host": socket.gethostname(),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sample": sample,
        "excludes": excludes,
        "files": files,
        "dirs": dirs,
        "unreadable": errors,
    }


def load_side(arg: str, sample: int, excludes: list[str]) -> dict:
    p = Path(arg)
    if p.is_dir():
        return summarize(p, sample, excludes)
    if p.is_file():
        s = _load(p)
        if not isinstance(s, dict) or s.get("kind") != SUMMARY_KIND:
            raise SystemExit(f"{p} is not a summary written by `compare_wire.py summarize`")
        return s
    raise SystemExit(f"no such directory or summary file: {p}")


# --------------------------------------------------------------------------- #
# Compare two summaries
# --------------------------------------------------------------------------- #
class Report:
    def __init__(self):
        self.fails, self.infos = [], []

    def fail(self, where, msg):
        self.fails.append(f"{where}: {msg}")

    def info(self, where, msg):
        self.infos.append(f"{where}: {msg}")


def _rel_diff(a: float, b: float) -> float:
    return abs(a - b) / max(abs(a), abs(b), 1.0)


def compare_shapes(a, b, where, rep: Report, tol: float, level: int = 0):
    if a is None or b is None:
        if a is not b:
            rep.fail(where, "present on one side only")
        return
    ta, tb = set(a["t"]), set(b["t"])
    if ta != tb:
        # str|null against str is an optional value, not a new type, and a
        # side where every sampled value was null says nothing about the type.
        na, nb = ta - {"null"}, tb - {"null"}
        if na == nb or not na or not nb or (na & nb):
            rep.info(where, f"types {sorted(ta)} vs {sorted(tb)}")
        else:
            rep.fail(where, f"type {sorted(ta)} vs {sorted(tb)}")
            return
    if "n" in a and "n" in b and level <= 1:
        d = _rel_diff(a["n"], b["n"])
        if d > tol:
            rep.fail(where, f"size {a['n']:g} vs {b['n']:g} ({d:.1%} apart, tolerance {tol:.0%})")
    if a.get("v") is not None or b.get("v") is not None:
        compare_shapes(a.get("v"), b.get("v"), where + "[*]", rep, tol, level + 1)
    ka, kb = a.get("k") or {}, b.get("k") or {}
    for k in sorted(set(ka) | set(kb)):
        sub = f"{where}.{k}"
        if k not in kb or k not in ka:
            have = ka.get(k) or kb.get(k)
            side = "left" if k in ka else "right"
            # A key present in most sampled parents on one side and in none on
            # the other is a vanished field. A rare optional key is noise.
            if have.get("share", 1) >= 0.5:
                rep.fail(sub, f"key only on the {side} (in {have.get('share', 1):.0%} of samples)")
            else:
                rep.info(sub, f"optional key only on the {side} (in {have.get('share', 1):.0%} of samples)")
            continue
        compare_shapes(ka[k], kb[k], sub, rep, tol, level + 1)


def compare(A: dict, B: dict, tol: float) -> Report:
    rep = Report()
    fa, fb = set(A["files"]), set(B["files"])
    for rel in sorted(fa - fb):
        rep.fail(rel, "file only on the left")
    for rel in sorted(fb - fa):
        rep.fail(rel, "file only on the right")
    for rel in sorted(fa & fb):
        ea, eb = A["files"][rel], B["files"][rel]
        if ea.get("error") or eb.get("error"):
            rep.fail(rel, f"unreadable: {ea.get('error') or eb.get('error')}")
            continue
        if ea.get("versions", {}) != eb.get("versions", {}):
            rep.fail(rel, f"schema version {ea.get('versions')} vs {eb.get('versions')}")
        compare_shapes(ea.get("shape"), eb.get("shape"), rel, rep, tol)

    da, db = set(A["dirs"]), set(B["dirs"])
    for d in sorted(da - db):
        rep.fail(d + "/", f"directory only on the left ({A['dirs'][d]['n_files']} files)")
    for d in sorted(db - da):
        rep.fail(d + "/", f"directory only on the right ({B['dirs'][d]['n_files']} files)")
    for d in sorted(da & db):
        ga, gb = A["dirs"][d], B["dirs"][d]
        na, nb = set(ga["names"]), set(gb["names"])
        only_a, only_b = sorted(na - nb), sorted(nb - na)
        if only_a or only_b:
            show = ", ".join(only_a[:5] + only_b[:5])
            rep.fail(d + "/", f"{len(only_a)} file(s) only on the left, {len(only_b)} only on "
                              f"the right ({len(na)} vs {len(nb)}): {show}"
                              + (" ..." if len(only_a) + len(only_b) > 10 else ""))
        if ga["versions"] != gb["versions"]:
            rep.fail(d + "/", f"schema versions {ga['versions']} vs {gb['versions']}")
        for bad in ga["unreadable"] + gb["unreadable"]:
            rep.fail(d + "/", f"unreadable {bad}")
        compare_shapes(ga["shape"], gb["shape"], d + "/*", rep, tol)
    return rep


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s1 = sub.add_parser("summarize", help="write the shape summary of one build")
    s1.add_argument("root")
    s1.add_argument("-o", "--out", help="summary file (default: stdout)")
    s2 = sub.add_parser("compare", help="compare two builds or two summaries")
    s2.add_argument("left")
    s2.add_argument("right")
    s2.add_argument("--count-tolerance", type=float, default=0.05)
    s2.add_argument("--show-info", action="store_true",
                    help="also print the differences that do not fail (optional keys)")
    for p in (s1, s2):
        p.add_argument("--sample", type=int, default=200,
                       help="JSON files sampled per directory for the merged shape (0 = all)")
        p.add_argument("--exclude", action="append", default=None,
                       help="top-level directory to leave out (default: assets)")
    try:
        args = ap.parse_args()
    except SystemExit as e:
        return 2 if e.code else 0
    excludes = args.exclude if args.exclude is not None else ["assets"]

    try:
        if args.cmd == "summarize":
            s = summarize(Path(args.root), args.sample, excludes)
            text = json.dumps(s, indent=1, sort_keys=True)
            if args.out:
                Path(args.out).write_text(text, encoding="utf-8")
                print(f"summary of {args.root}: {len(s['files'])} top-level files, "
                      f"{len(s['dirs'])} directories, "
                      f"{sum(d['n_files'] for d in s['dirs'].values())} files in them "
                      f"-> {args.out}")
            else:
                sys.stdout.write(text + "\n")
            return 0
        A = load_side(args.left, args.sample, excludes)
        B = load_side(args.right, args.sample, excludes)
    except SystemExit as e:
        print(f"compare_wire: {e}", file=sys.stderr)
        return 2

    rep = compare(A, B, args.count_tolerance)
    n_files = len(A["files"]) + sum(d["n_files"] for d in A["dirs"].values())
    print(f"left:  {A['root']} ({A['host']}, {A['generated_at']})")
    print(f"right: {B['root']} ({B['host']}, {B['generated_at']})")
    print(f"compared {len(A['files'])} top-level files and {len(A['dirs'])} directories "
          f"({n_files} files on the left), count tolerance {args.count_tolerance:.0%}")
    if args.show_info:
        for line in rep.infos:
            print(f"INFO  {line}")
    for line in rep.fails:
        print(f"DIFF  {line}")
    if rep.fails:
        print(f"SHAPE DIFFERS: {len(rep.fails)} difference(s)"
              + (f", {len(rep.infos)} informational" if rep.infos else ""))
        return 1
    print("SAME SHAPE" + (f" ({len(rep.infos)} informational note(s); --show-info)"
                          if rep.infos else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
