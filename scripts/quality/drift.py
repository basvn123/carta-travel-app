"""Drift gate: compare the last published wire with a new build (D2, wave 2 step 8, G3).

    python scripts/quality/drift.py --old <dir or app_data.json> --new <dir or app_data.json> [--json]

The 2026-11-13 bed incident published a wire with 243 measured bed blocks
where the one before it had 3,340: every single record was valid, and only a
comparison of the two wires shows it. Per key field this prints PSI (population
stability index, 10 bins whose edges are the quantiles of the OLD wire, an
epsilon for an empty bin) and the share delta:

- bed price per tier (dorm, private, hotel2 to hotel5)
- measured-bed share (bed_rules.is_measured), places that a traveller can open
- ratings (rating.score)
- best months (climate.best, how often each calendar month is a best month)
- `_asof` age (days between each block's `_asof` and the wire's generated_at)
- photo share (places with a hero image)

Fails (exit 1) when a PSI is over `drift.psi_max` (0.25) or a share drops by
more than `drift.share_drop_points` (2), both in rules.yaml. A field with no
values in either wire is never a pass: it fails as "empty". The worst slice by
country (largest drop in the measured-bed share) is printed so the owner sees
where to look. Pure stdlib (rules.yaml is read when yaml is importable, else the
defaults below, which are the same numbers).
"""
from __future__ import annotations

import argparse
import bisect
import importlib.util
import json
import math
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RULES = HERE / "rules.yaml"
DEFAULTS = {"psi_max": 0.25, "share_drop_points": 2.0, "bins": 10, "epsilon": 1e-4}
TIERS = ("dorm", "private", "hotel2", "hotel3", "hotel4", "hotel5")
ASOF_BLOCKS = ("accommodation", "rating", "climate", "image", "costs", "crowding")


def _bed_rules():
    spec = importlib.util.spec_from_file_location("drift_bed_rules", ROOT / "pipeline" / "stays" / "bed_rules.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_config(path: Path = RULES) -> dict:
    cfg = dict(DEFAULTS)
    try:
        import yaml
        cfg.update((yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("drift") or {})
    except (ImportError, OSError):
        pass
    return cfg


def load_wire(where) -> dict:
    p = Path(where)
    if p.is_dir():
        p = p / "app_data.json"
    return json.loads(p.read_text(encoding="utf-8"))


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def psi(old: list, new: list, bins: int = 10, eps: float = 1e-4) -> float:
    """PSI of `new` against `old`: edges are the old quantiles (duplicates
    collapsed, so a field with few distinct values gets fewer bins), a bin with
    no value counts `eps`. Both samples must be non-empty."""
    xs = sorted(old)
    edges = sorted({xs[min(len(xs) - 1, int(len(xs) * i / bins))] for i in range(1, bins)})

    def shares(vals):
        counts = [0] * (len(edges) + 1)
        for v in vals:
            counts[bisect.bisect_left(edges, v)] += 1
        return [max(c / len(vals), eps) for c in counts]

    o, n = shares(old), shares(new)
    return sum((b - a) * math.log(b / a) for a, b in zip(o, n))


def _places(wire: dict):
    return {k: d for k, d in (wire.get("destinations") or {}).items()
            if isinstance(d, dict) and not d.get("gateway_of")}


def _days(asof, at):
    try:
        return (date.fromisoformat(at[:10]) - date.fromisoformat(str(asof)[:10])).days
    except (TypeError, ValueError):
        return None


def collect(wire: dict, br) -> dict:
    """The values drift compares, per field: lists for PSI, (hits, places) for shares."""
    places = _places(wire)
    at = str((wire.get("meta") or {}).get("generated_at") or "")
    out = {f"bed.{t}": [] for t in TIERS}
    out.update({"rating": [], "best_months": [], "asof_age_days": []})
    measured = photo = 0
    by_country = {}
    for d in places.values():
        acc = d.get("accommodation") or {}
        m = br.is_measured(acc)
        measured += m
        c = by_country.setdefault(d.get("iso2") or "??", [0, 0])
        c[0] += m
        c[1] += 1
        for t in TIERS:
            v = (acc.get("beds") or {}).get(t)
            if _num(v):
                out[f"bed.{t}"].append(v)
        score = (d.get("rating") or {}).get("score")
        if _num(score):
            out["rating"].append(score)
        for mth in (d.get("climate") or {}).get("best") or []:
            if _num(mth):
                out["best_months"].append(mth)
        for b in ASOF_BLOCKS:
            age = _days((d.get(b) or {}).get("_asof"), at)
            if age is not None:
                out["asof_age_days"].append(age)
        photo += bool((d.get("image") or {}).get("url"))
    out["_measured"] = (measured, len(places))
    out["_photo"] = (photo, len(places))
    out["_country"] = by_country
    return out


def compare(old: dict, new: dict, cfg: dict | None = None) -> dict:
    cfg = {**DEFAULTS, **(cfg or {})}
    br = _bed_rules()
    a, b = collect(old, br), collect(new, br)
    rows, failures = [], []

    def fail(field, why):
        failures.append({"field": field, "why": why})

    for f in [k for k in a if not k.startswith("_")]:
        ov, nv = a[f], b[f]
        if not ov or not nv:
            # Never a pass: nothing to compare means nothing was checked. A tier
            # absent in both wires is not a field of this data (skipped).
            if ov or nv:
                fail(f, f"{f} has {len(ov)} values in the old wire and {len(nv)} in the new")
                rows.append({"field": f, "old_n": len(ov), "new_n": len(nv), "psi": None, "ok": False})
            elif f in ("rating", "best_months", "asof_age_days", "bed.hotel3"):
                fail(f, f"{f} is empty in both wires")
                rows.append({"field": f, "old_n": 0, "new_n": 0, "psi": None, "ok": False})
            continue
        p = psi(ov, nv, int(cfg["bins"]), float(cfg["epsilon"]))
        ok = p <= cfg["psi_max"]
        rows.append({"field": f, "old_n": len(ov), "new_n": len(nv), "psi": round(p, 4), "ok": ok})
        if not ok:
            fail(f, f"PSI {p:.3f} is over {cfg['psi_max']}")
    shares = []
    for name, key in (("measured_bed_share", "_measured"), ("photo_share", "_photo")):
        (oh, op), (nh, np_) = a[key], b[key]
        if not op or not np_:
            fail(name, f"{name}: a wire with no places is not a comparison")
            shares.append({"field": name, "old": None, "new": None, "delta_points": None, "ok": False})
            continue
        if oh == 0 and nh == 0:
            # Zero hits in both wires is a field nobody fills, not a stable one.
            fail(name, f"{name} has no hits in either wire")
            shares.append({"field": name, "old": 0.0, "new": 0.0, "delta_points": 0.0, "old_n": 0, "new_n": 0, "ok": False})
            continue
        so, sn = oh / op, nh / np_
        delta = round((sn - so) * 100, 2)
        ok = -delta <= cfg["share_drop_points"]
        shares.append({"field": name, "old": round(so, 4), "new": round(sn, 4), "delta_points": delta,
                       "old_n": oh, "new_n": nh, "ok": ok})
        if not ok:
            fail(name, f"{name} fell {-delta:g} points ({oh} to {nh} places, limit {cfg['share_drop_points']:g})")
    slices = []
    for cc, (oh, on) in a["_country"].items():
        nh, nn = b["_country"].get(cc, [0, 0])
        if on and nn:
            slices.append({"country": cc, "old": round(oh / on, 4), "new": round(nh / nn, 4),
                           "delta_points": round((nh / nn - oh / on) * 100, 2), "places": nn})
    # A one-place country moving 100 points is noise: slices of 5+ places rank first.
    slices.sort(key=lambda s: (s["places"] < 5, s["delta_points"]))
    return {"ok": not failures, "failures": failures, "psi": rows, "shares": shares,
            "worst_country": slices[:5], "config": cfg}


def render(res: dict) -> str:
    lines = [f"{'field':<20}{'old n':>8}{'new n':>8}{'PSI':>9}  verdict"]
    for r in res["psi"]:
        lines.append(f"{r['field']:<20}{r['old_n']:>8}{r['new_n']:>8}{'-' if r['psi'] is None else r['psi']:>9}  "
                     f"{'ok' if r['ok'] else 'FAIL'}")
    for s in res["shares"]:
        lines.append(f"{s['field']:<20}{s.get('old_n', '-'):>8}{s.get('new_n', '-'):>8}"
                     f"{'':>9}  {s['old']} to {s['new']} ({s['delta_points']:+g} points) {'ok' if s['ok'] else 'FAIL'}")
    if res["worst_country"]:
        w = res["worst_country"][0]
        lines.append(f"worst slice by country (measured beds): {w['country']} {w['old']:.0%} to {w['new']:.0%} "
                     f"({w['delta_points']:+g} points, {w['places']} places)")
    for f in res["failures"]:
        lines.append(f"FAIL {f['field']}: {f['why']}")
    lines.append("drift: PASS" if res["ok"] else f"drift: FAIL ({len(res['failures'])})")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Drift gate between two wires (D2, G3)")
    ap.add_argument("--old", required=True, help="the last published wire (dir or app_data.json)")
    ap.add_argument("--new", required=True, help="the new build (dir or app_data.json)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    try:
        res = compare(load_wire(a.old), load_wire(a.new), load_config())
    except (OSError, ValueError) as e:
        print(f"drift: cannot read a wire: {e}", file=sys.stderr)
        return 2
    print(json.dumps(res, ensure_ascii=False) if a.json else render(res))
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
