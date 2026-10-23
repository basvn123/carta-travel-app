"""The publish gate for the explore data fill (T640).

Tier: On demand (python pipeline/field_stubs/gate.py --layer beaches)

Run it after a harvest or export has written its files and BEFORE they are
committed or synced to the app. It judges the working tree against the
previous wire (a git ref, HEAD by default) and answers with an exit code:

    0  gate passed, the new files may be published
    1  gate failed, keep the previous wire: `git checkout <ref> -- <paths>`

Two rules, both from the T640 batch prompt, rule 5:

  1. Coverage may not fall. For every key a row carries (top level and one
     level of nesting, as `a.b`), the number of rows that carry it, counted
     over the rows present in BOTH the previous and the new file, may not be
     lower than before. A row that disappears is a separate line (rows lost),
     and also fails unless --allow-row-loss is given.
  2. Values fall in plausible ranges. Water 0 to 32 C, wind 0 to 40 m/s, rain
     days 0 to 31, opening months 1 to 12, fares above 0. The ranges are keyed
     by KEY NAME (RANGES below) and applied wherever the key appears in a row,
     to a number or to a list of numbers. A key that never appears is skipped.

Layers:
    climate    cache/climate.json                              (dict id -> record)
    beaches    continent-app/public/beaches/{CC}.json  key beaches, listed
    lakes      continent-app/public/lakes/{CC}.json    key lakes, listed
    peaks      continent-app/public/mountains/{CC}.json key mountains, listed
    trails     continent-app/public/trails/{CC}.json   key trips, listed
    cycling    continent-app/public/cycling/{CC}.json  key routes, listed
    dossier    cache/dossier/*.json is NOT used; the dossier lives under
               continent-app/public/dossier/*.json     (dict id -> dossier)

Usage, from the repo root:
    python pipeline/field_stubs/gate.py --layer cycling
    python pipeline/field_stubs/gate.py --layer climate --ref HEAD~1
    python pipeline/field_stubs/gate.py --layer beaches --countries IT,ES --verbose
    python pipeline/field_stubs/gate.py --self-test

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# key name -> (low, high, inclusive_low). Applied to numbers and lists of numbers.
RANGES = {
    "water_c": (0, 32, True), "sst_c": (0, 32, True), "water_temp_c": (0, 32, True),
    "water_temp": (0, 32, True), "temp_c": (-60, 60, True),
    "wind_ms": (0, 40, True), "wind_mean_ms": (0, 40, True),
    "rain_days": (0, 31, True), "rd": (0, 31, True),
    "open_months": (1, 12, True), "months_open": (1, 12, True),
    "fare": (0, 100000, False), "fare_eur": (0, 100000, False),
    "price": (0, 100000, False), "value_eur": (0, 100000, False),
    "sunshine_h": (0, 24 * 31, True),
    "elev_m": (-450, 8900, True),
    "slope_deg": (0, 90, True), "slopeDeg": (0, 90, True),
}

# layer -> (relative dir or file, list keys inside a country file, kind)
LAYERS = {
    "climate": ("cache/climate.json", None, "dict"),
    "beaches": ("continent-app/public/beaches", ("beaches", "listed"), "country"),
    "lakes": ("continent-app/public/lakes", ("lakes", "listed"), "country"),
    "peaks": ("continent-app/public/mountains", ("mountains", "listed"), "country"),
    "trails": ("continent-app/public/trails", ("trips", "listed"), "country"),
    "cycling": ("continent-app/public/cycling", ("routes", "listed"), "country"),
    "dossier": ("continent-app/public/dossier", None, "dossierdir"),
}


def git_show(ref, rel):
    r = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=ROOT,
                       capture_output=True)
    if r.returncode != 0:
        return None
    raw = r.stdout
    if raw.startswith(b"version https://git-lfs"):
        # A tracked cache file: smudge the pointer to the real content.
        raw = subprocess.run(["git", "lfs", "smudge"], cwd=ROOT, input=raw,
                             capture_output=True).stdout
        if raw.startswith(b"version https://git-lfs"):
            raise SystemExit(f"[gate] {rel} at {ref} is an LFS pointer and could not be smudged")
    return json.loads(raw.decode("utf-8"))


def load(path):
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def rows_of(doc, keys, kind):
    """{row id: row} for one parsed file."""
    out = {}
    if doc is None:
        return out
    if kind in ("dict", "dossierdir"):
        src = doc.get("dests", doc) if isinstance(doc, dict) else {}
        for k, v in src.items():
            if isinstance(v, dict):
                out[str(k)] = v
        return out
    for key in keys:
        for r in doc.get(key, []) or []:
            if isinstance(r, dict) and r.get("id") is not None:
                out[str(r["id"])] = r
    return out


def present(v):
    return v is not None and v != "" and v != [] and v != {}


def flat_keys(row):
    """Every key of a row and one level of nesting, a.b, that holds a value."""
    ks = set()
    for k, v in row.items():
        if present(v):
            ks.add(k)
        if isinstance(v, dict):
            for k2, v2 in v.items():
                if present(v2):
                    ks.add(f"{k}.{k2}")
    return ks


def walk_numbers(node, key=None):
    """Yield (key name, number) for every number under a known-range key."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk_numbers(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from walk_numbers(v, key)
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        if key in RANGES:
            yield key, node


def range_failures(rows, limit=12):
    bad, total = [], 0
    for rid, row in rows.items():
        for key, num in walk_numbers(row):
            lo, hi, inc = RANGES[key]
            ok = (lo <= num <= hi) if inc else (lo < num <= hi)
            if not ok:
                total += 1
                if len(bad) < limit:
                    bad.append(f"{rid}: {key}={num} outside {lo}..{hi}")
    return total, bad


def coverage(rows, ids):
    counts = {}
    for rid in ids:
        for k in flat_keys(rows[rid]):
            counts[k] = counts.get(k, 0) + 1
    return counts


def judge(prev_rows, new_rows, allow_row_loss=False, label=""):
    """Return (fail_lines, info_lines) for one file or one whole layer."""
    fails, info = [], []
    lost = sorted(set(prev_rows) - set(new_rows))
    if lost:
        line = f"{label}rows lost: {len(lost)} (first {lost[:5]})"
        (info if allow_row_loss else fails).append(line)
    both = sorted(set(prev_rows) & set(new_rows))
    cp, cn = coverage(prev_rows, both), coverage(new_rows, both)
    for k in sorted(cp):
        if cn.get(k, 0) < cp[k]:
            fails.append(f"{label}coverage fell: {k} {cp[k]} -> {cn.get(k, 0)}")
    for k in sorted(cp):
        n_lost = sum(1 for r in both if k in flat_keys(prev_rows[r]) and k not in flat_keys(new_rows[r]))
        if n_lost and cn.get(k, 0) >= cp[k]:
            info.append(f"{label}{k}: {n_lost} row(s) lost it, offset by gains elsewhere")
    gained = {k: cn[k] - cp.get(k, 0) for k in cn if cn[k] > cp.get(k, 0)}
    if gained:
        top = sorted(gained.items(), key=lambda kv: -kv[1])[:8]
        info.append(label + "coverage gained: " + ", ".join(f"{k} +{n}" for k, n in top))
    n_bad, bad = range_failures(new_rows)
    if n_bad:
        fails.append(f"{label}{n_bad} value(s) out of range, e.g. " + "; ".join(bad[:5]))
    return fails, info


def run(layer, ref, countries, allow_row_loss, verbose, base=None):
    rel, keys, kind = LAYERS[layer]
    base = Path(base) if base else ROOT
    all_fail, all_info = [], []
    if kind == "dict":
        files = [rel]
    else:
        d = base / rel
        names = sorted(p.name for p in d.glob("*.json")) if d.exists() else []
        if kind == "country":
            names = [n for n in names if len(n) == 7 and n[:2].isupper()]
            if countries:
                names = [n for n in names if n[:2] in countries]
        files = [f"{rel}/{n}" for n in names]
    if not files:
        print(f"[gate:{layer}] no files found under {base / rel}")
        return 1
    tot_prev = tot_new = 0
    for f in files:
        new_doc = load(base / f)
        prev_doc = git_show(ref, f)
        new_rows = rows_of(new_doc, keys, kind)
        prev_rows = rows_of(prev_doc, keys, kind)
        tot_new += len(new_rows)
        tot_prev += len(prev_rows)
        if prev_doc is None:
            # No previous wire for this file: only the range rule can apply.
            n_bad, bad = range_failures(new_rows)
            if n_bad:
                all_fail.append(f"{f}: {n_bad} value(s) out of range, e.g. " + "; ".join(bad[:5]))
            continue
        fl, inf = judge(prev_rows, new_rows, allow_row_loss, label=f"{f}: ")
        all_fail += fl
        all_info += inf
    print(f"[gate:{layer}] {len(files)} file(s), rows {tot_prev} -> {tot_new}, ref {ref}")
    if verbose:
        for line in all_info:
            print("  info:", line)
    for line in all_fail:
        print("  FAIL:", line)
    print(f"[gate:{layer}] {'FAILED: keep the previous wire' if all_fail else 'passed'}")
    return 1 if all_fail else 0


def self_test():
    prev = {"a": {"rain_days": [5] * 12, "wind_ms": [3] * 12, "x": {"y": 1}},
            "b": {"rain_days": [4] * 12}}
    ok = {"a": {"rain_days": [5] * 12, "wind_ms": [3] * 12, "x": {"y": 1}},
          "b": {"rain_days": [4] * 12, "wind_ms": [2.5] * 12}}
    assert judge(prev, ok)[0] == [], judge(prev, ok)
    fell = {"a": {"rain_days": [5] * 12, "x": {"y": 1}}, "b": prev["b"]}
    assert any("wind_ms" in x for x in judge(prev, fell)[0])
    rng = {"a": {"rain_days": [5] * 11 + [32], "wind_ms": [3] * 12, "x": {"y": 1}}, "b": prev["b"]}
    assert any("out of range" in x for x in judge(prev, rng)[0])
    wind = {"a": {"rain_days": [5] * 12, "wind_ms": [41] + [3] * 11, "x": {"y": 1}}, "b": prev["b"]}
    assert any("wind_ms=41" in x for x in judge(prev, wind)[0])
    lost = {"a": ok["a"]}
    assert any("rows lost" in x for x in judge(prev, lost)[0])
    assert judge(prev, lost, allow_row_loss=True)[0] == []
    fare = {"a": {"fare": 0}}
    assert any("fare=0" in x for x in judge({}, fare)[0])
    print("gate self-test passed")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", choices=sorted(LAYERS))
    ap.add_argument("--ref", default="HEAD", help="git ref holding the previous wire")
    ap.add_argument("--base", help="root to read the NEW files from (default: this repo)")
    ap.add_argument("--countries", help="comma separated ISO2, country-file layers only")
    ap.add_argument("--allow-row-loss", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    if not a.layer:
        ap.error("--layer is required")
    cc = set(a.countries.split(",")) if a.countries else None
    sys.exit(run(a.layer, a.ref, cc, a.allow_row_loss, a.verbose, a.base))


if __name__ == "__main__":
    main()
