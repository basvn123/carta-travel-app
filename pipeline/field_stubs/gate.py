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
    master     app_data/app_data.json, key destinations    (T640 wiring: the
               airports[], car rule, monthly crowds and climate writers)

Layer rules on top of the two above (T640 wiring, from T642's fixes):
    LAYER_RANGES  ranges that only make sense in one layer (transfer minutes,
                  a crowd share), so a key name that means something else in
                  another layer is not judged by them.
    ENUMS         a key whose value must be one of a set (car_basis,
                  transfer_mode, trail difficulty).
    trails        difficulty never below the distance and ascent ladder of
                  pipeline/trails/attributes.py (T642-j), when that module
                  imports (it needs the trailslab venv).

The previous wire is a git ref by default (--ref HEAD). --prev-dir DIR reads
it from a snapshot instead, laid out like the repo (DIR/<repo path>). That is
how pipeline/field_stubs/publish.py gates a scheduled run: on the Hetzner box
the previous wire is what last week's run left in the working tree, not HEAD,
and the master is gitignored.

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
    # T640 wiring: the T641 key names as they ship (beach `sst`, climate `sun_h`).
    "sst": (0, 32, True), "sun_h": (0, 24 * 31, True),
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
    "master": ("app_data/app_data.json", ("destinations",), "dict"),
}

# layer -> {key name: (low, high, inclusive_low)}, on top of RANGES.
LAYER_RANGES = {
    "master": {
        "transfer_min": (0, 600, True), "minutes": (0, 1440, False),
        "straight_km": (0, 110, True), "road_km": (0, 200, False),
        "share": (0, 1, True),
    },
}

# layer -> {key name: allowed values}. None is always allowed (absent value).
ENUMS = {
    "master": {
        "car_basis": {"category", "transit_lines"},
        "transfer_mode": {"car", "train", "bus", "ferry"},
    },
    "trails": {"difficulty": {"easy", "moderate", "hard", "very_hard", "alpine"}},
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
        if not isinstance(doc, dict):
            src = {}
        elif keys:
            src = doc.get(keys[0]) or {}
        else:
            src = doc.get("dests", doc)
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


def walk_numbers(node, key=None, ranges=None):
    """Yield (key name, number) for every number under a known-range key."""
    ranges = RANGES if ranges is None else ranges
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk_numbers(v, k, ranges)
    elif isinstance(node, list):
        for v in node:
            yield from walk_numbers(v, key, ranges)
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        if key in ranges:
            yield key, node


def walk_values(node, keys, key=None):
    """Yield (key name, scalar) for every scalar under one of `keys`."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk_values(v, keys, k)
    elif isinstance(node, list):
        for v in node:
            yield from walk_values(v, keys, key)
    elif key in keys and node is not None:
        yield key, node


def without_anchor_distance(row):
    """T740: airports_for (pipeline/airport_access.py) keeps a place's anchor
    airport whatever its distance, by design, because its flights are priced
    through it (up to 514 km, Flores via PDL). The within-reach range of
    straight_km and road_km is for the other airports, all within
    MAX_STRAIGHT_KM; the anchor entry's two distances are left out of it."""
    anchor = row.get("anchor_airport") if isinstance(row, dict) else None
    lst = row.get("airports") if anchor else None
    if not isinstance(lst, list):
        return row
    out = dict(row)
    out["airports"] = [
        {k: v for k, v in a.items() if k not in ("straight_km", "road_km")}
        if isinstance(a, dict) and a.get("iata") == anchor else a
        for a in lst
    ]
    return out


def range_failures(rows, limit=12, layer=None):
    ranges = dict(RANGES, **LAYER_RANGES.get(layer, {}))
    enums = ENUMS.get(layer, {})
    bad, total = [], 0
    for rid, row in rows.items():
        if layer == "master":
            row = without_anchor_distance(row)
        for key, num in walk_numbers(row, ranges=ranges):
            lo, hi, inc = ranges[key]
            ok = (lo <= num <= hi) if inc else (lo < num <= hi)
            if not ok:
                total += 1
                if len(bad) < limit:
                    bad.append(f"{rid}: {key}={num} outside {lo}..{hi}")
        for key, val in walk_values(row, enums):
            if val not in enums[key]:
                total += 1
                if len(bad) < limit:
                    bad.append(f"{rid}: {key}={val!r} not one of {sorted(enums[key])}")
    if layer == "trails":
        n, ex = difficulty_floor_failures(rows)
        total += n
        bad += ex[:max(0, limit - len(bad))]
    return total, bad


_EFFORT = []


def _effort_grade():
    """(attributes.effort_grade, attributes.GRADE_RANK), or None when the
    trails module cannot import (it needs the trailslab venv)."""
    if not _EFFORT:
        try:
            sys.path.insert(0, str(ROOT / "pipeline" / "trails"))
            import attributes  # noqa: E402
            _EFFORT.append((attributes.effort_grade, attributes.GRADE_RANK))
        except Exception as exc:  # environment dependent
            print(f"[gate:trails] difficulty floor not checked: attributes.py "
                  f"did not import ({type(exc).__name__}: {exc})")
            _EFFORT.append(None)
    return _EFFORT[0]


def difficulty_floor_failures(rows, limit=5):
    """T642-j: a published difficulty is never below the distance and ascent
    ladder. Rows without a known difficulty or a distance are not judged."""
    eg = _effort_grade()
    if not eg:
        return 0, []
    effort, rank = eg
    bad, n = [], 0
    for rid, row in rows.items():
        d = row.get("difficulty")
        if d not in rank or not row.get("distance_m"):
            continue
        floor = effort(row)
        if rank.get(floor, -1) > rank[d]:
            n += 1
            if len(bad) < limit:
                bad.append(f"{rid}: difficulty={d} below the effort floor {floor}")
    return n, bad


def coverage(rows, ids):
    counts = {}
    for rid in ids:
        for k in flat_keys(rows[rid]):
            counts[k] = counts.get(k, 0) + 1
    return counts


def judge(prev_rows, new_rows, allow_row_loss=False, label="", layer=None):
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
    n_bad, bad = range_failures(new_rows, layer=layer)
    if n_bad:
        fails.append(f"{label}{n_bad} value(s) out of range, e.g. " + "; ".join(bad[:5]))
    return fails, info


def run(layer, ref, countries, allow_row_loss, verbose, base=None, prev_dir=None):
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
        prev_doc = load(Path(prev_dir) / f) if prev_dir else git_show(ref, f)
        new_rows = rows_of(new_doc, keys, kind)
        prev_rows = rows_of(prev_doc, keys, kind)
        tot_new += len(new_rows)
        tot_prev += len(prev_rows)
        if prev_doc is None:
            # No previous wire for this file: only the range rule can apply.
            n_bad, bad = range_failures(new_rows, layer=layer)
            if n_bad:
                all_fail.append(f"{f}: {n_bad} value(s) out of range, e.g. " + "; ".join(bad[:5]))
            continue
        fl, inf = judge(prev_rows, new_rows, allow_row_loss, label=f"{f}: ", layer=layer)
        all_fail += fl
        all_info += inf
    print(f"[gate:{layer}] {len(files)} file(s), rows {tot_prev} -> {tot_new}, "
          + (f"previous from {prev_dir}" if prev_dir else f"ref {ref}"))
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
    # T640 wiring: layer ranges and enums apply in their own layer only.
    m_prev = {"X": {"airports": [{"iata": "MXP", "transfer_min": 70}]}}
    m_bad = {"X": {"airports": [{"iata": "MXP", "transfer_min": 900}]}}
    assert any("transfer_min=900" in x for x in judge(m_prev, m_bad, layer="master")[0])
    assert judge(m_prev, m_bad, layer="beaches")[0] == []
    # T740: the anchor airport may be far; any other airport may not.
    far_anchor = {"X": {"anchor_airport": "PDL", "airports": [
        {"iata": "PDL", "straight_km": 514.1, "road_km": 668.3, "transfer_min": 90}]}}
    assert judge({}, far_anchor, layer="master")[0] == [], judge({}, far_anchor, layer="master")
    far_other = {"X": {"anchor_airport": "PDL", "airports": [
        {"iata": "HOR", "straight_km": 240.0, "road_km": 312.0, "transfer_min": 90},
        {"iata": "PDL", "straight_km": 514.1, "road_km": 668.3, "transfer_min": 90}]}}
    assert any("straight_km=240.0" in x for x in judge({}, far_other, layer="master")[0])
    lt = {"X": {"local_transport": {"car_basis": "guess"}}}
    assert any("car_basis" in x for x in judge({}, lt, layer="master")[0])
    lt_ok = {"X": {"local_transport": {"car_basis": "transit_lines"}}}
    assert judge({}, lt_ok, layer="master")[0] == []
    tr = {"1": {"difficulty": "medium"}}
    assert any("difficulty" in x for x in judge({}, tr, layer="trails")[0])
    # master rows come from the destinations key, not the top level.
    doc = {"meta": {"x": 1}, "destinations": {"A": {"x": 1}}}
    assert set(rows_of(doc, ("destinations",), "dict")) == {"A"}
    print("gate self-test passed")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", choices=sorted(LAYERS))
    ap.add_argument("--ref", default="HEAD", help="git ref holding the previous wire")
    ap.add_argument("--base", help="root to read the NEW files from (default: this repo)")
    ap.add_argument("--countries", help="comma separated ISO2, country-file layers only")
    ap.add_argument("--prev-dir", help="read the previous wire from this snapshot "
                    "(laid out like the repo) instead of --ref")
    ap.add_argument("--allow-row-loss", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())
    if not a.layer:
        ap.error("--layer is required")
    cc = set(a.countries.split(",")) if a.countries else None
    sys.exit(run(a.layer, a.ref, cc, a.allow_row_loss, a.verbose, a.base, a.prev_dir))


if __name__ == "__main__":
    main()
