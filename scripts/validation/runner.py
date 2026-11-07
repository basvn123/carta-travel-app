"""External validation runner: one method for every layer (ROADMAP D23, T1187).

A layer plugs in three things (a module named in LAYERS, see layer_trails.py):

  references(ctx)       the outside reference items, each a dict with an
                        `id` and a `countries` list (the first is its stratum);
  load(ctx)             Carta's side, read from disk;
  match(refs, carta)    one result per reference:
                          id, country,
                          flags  {name: True, False or None}: shares over the
                                 references (None leaves the item out);
                                 `matched` is required and is the coverage;
                          facts  {name: True, False or None}: facts checked on
                                 a matched item (pooled into fact_share);
                          rank   (reference value, Carta value) or None, for
                                 rank agreement (Kendall tau-b, Spearman rho);
                          error  (reference number, Carta number) or None, for
                                 numeric error (MAE, median absolute % error);
                          plus anything the layer wants to keep.
  CHECKS                the gate: [{metric, kind: hard|soft, direction:
                        higher|lower, tolerance_points, min_n}]. A hard check
                        that drops fails the run; a soft one warns.
  gaps(results)         optional: the largest gaps to review by hand.

The runner samples the references per country, measures, writes
`data/reports/validation/<layer>/<date>.json`, compares the metrics with
`<layer>/baseline.json` and rebuilds the scorecard
(`data/reports/validation/scorecard.json`, plus the admin snapshot read by
the Data health tab).

Sampling (research in T1187): proportional allocation per country with a
per-country minimum, selected by sha256(layer, salt, id) so the same items
stay in the sample from run to run. Shares are weighted back to the whole
list by country. With the whole list there is no sampling noise and a check
fails on any drop beyond its tolerance; on a sample a share fails only when
the upper end of its 95% Wilson interval is under the baseline minus the
tolerance (inside the interval it warns).

    python -I scripts/validation/runner.py trails                # report only
    python -I scripts/validation/runner.py trails --write        # result, scorecard, snapshot
    python -I scripts/validation/runner.py trails --check        # exit 1 when a hard check fails
    python -I scripts/validation/runner.py trails --write-baseline   # move the baseline, deliberately
    python -I scripts/validation/runner.py trails --share 0.5 --min-per-country 3

`scripts/quality/engine.py` calls gate_from_disk() so a failed hard check of
a layer's latest result fails the D2 quality run. No network, no model.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
VALID_DIR = Path(os.environ.get("CARTA_VALIDATION_DIR") or ROOT / "data" / "reports" / "validation")
SNAPSHOT = ROOT / "continent-app" / "src" / "components" / "admin" / "validationScorecard.json"
SCHEMA = "carta-validation/2"
CARD_SCHEMA = "carta-validation-scorecard/1"
LAYERS = {"trails": "layer_trails", "beaches": "layer_beaches",
          "beaches_blueflag": "layer_beaches_blueflag", "prices": "layer_prices",
          "prices_fares": "layer_prices_fares", "prices_sample": "layer_prices_sample"}
Z95 = 1.96
TREND_POINTS = 24


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

def stratum(ref) -> str:
    cs = ref.get("countries") or []
    return cs[0] if cs else "??"


def sample(refs, layer, share=1.0, min_per=5, salt="d23"):
    """(chosen refs, {country: (population, sampled)}). Deterministic: the
    items with the lowest sha256(layer|salt|id) in each country are taken."""
    by = {}
    for r in refs:
        by.setdefault(stratum(r), []).append(r)
    chosen, strata = [], {}
    for c in sorted(by):
        items = sorted(by[c], key=lambda r: hashlib.sha256(f"{layer}|{salt}|{r['id']}".encode()).hexdigest())
        n = len(items) if share >= 1 else min(len(items), max(min_per, math.ceil(share * len(items))))
        chosen += items[:n]
        strata[c] = (len(items), n)
    return chosen, strata


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def wilson(k, n, z=Z95):
    if not n:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (round(max(0.0, mid - half), 4), round(min(1.0, mid + half), 4))


def kendall_tau_b(pairs):
    """Kendall tau-b with ties, O(n^2); fine for a few hundred pairs."""
    n = len(pairs)
    if n < 2:
        return None
    conc = disc = tx = ty = 0
    for i in range(n):
        xi, yi = pairs[i]
        for j in range(i + 1, n):
            dx, dy = xi - pairs[j][0], yi - pairs[j][1]
            if dx == 0 and dy == 0:
                continue
            if dx == 0:
                tx += 1
            elif dy == 0:
                ty += 1
            elif (dx > 0) == (dy > 0):
                conc += 1
            else:
                disc += 1
    den = math.sqrt((conc + disc + tx) * (conc + disc + ty))
    return round((conc - disc) / den, 4) if den else None


def _ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(pairs):
    if len(pairs) < 2:
        return None
    rx, ry = _ranks([p[0] for p in pairs]), _ranks([p[1] for p in pairs])
    mx, my = statistics.fmean(rx), statistics.fmean(ry)
    sx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    sy = math.sqrt(sum((b - my) ** 2 for b in ry))
    if not sx or not sy:
        return None
    return round(sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / (sx * sy), 4)


def errors(pairs):
    if not pairs:
        return None, None
    mae = statistics.fmean(abs(c - r) for r, c in pairs)
    pct = [abs(c - r) / abs(r) for r, c in pairs if r]
    return round(mae, 3), (round(statistics.median(pct), 4) if pct else None)


def proportion(results, key, strata, where="flags"):
    """Weighted share of True over the items where the value is not None."""
    k = n = 0
    wk = wn = 0.0
    for r in results:
        v = (r.get(where) or {}).get(key)
        if v is None:
            continue
        pop, smp = strata.get(r["country"], (1, 1))
        w = pop / smp if smp else 1.0
        n += 1
        k += bool(v)
        wn += w
        wk += w * bool(v)
    lo, hi = wilson(k, n)
    return {"value": round(wk / wn, 4) if wn else None, "k": k, "n": n, "low": lo, "high": hi}


def measure(results, strata):
    flags = sorted({f for r in results for f in (r.get("flags") or {})})
    facts = sorted({f for r in results for f in (r.get("facts") or {})})
    m = {f: proportion(results, f, strata) for f in flags}
    if "matched" in m:
        m["coverage"] = m.pop("matched")
    for f in facts:
        m[f"fact.{f}"] = proportion(results, f, strata, "facts")
    known = [v for r in results for v in (r.get("facts") or {}).values() if v is not None]
    if known:
        k, n = sum(map(bool, known)), len(known)
        lo, hi = wilson(k, n)
        m["fact_share"] = {"value": round(k / n, 4), "k": k, "n": n, "low": lo, "high": hi}
    rank = [tuple(r["rank"]) for r in results if r.get("rank")]
    m["agreement_tau"] = {"value": kendall_tau_b(rank), "n": len(rank)}
    m["agreement_rho"] = {"value": spearman(rank), "n": len(rank)}
    err = [tuple(r["error"]) for r in results if r.get("error")]
    mae, mdape = errors(err)
    m["error_mae"] = {"value": mae, "n": len(err)}
    m["error_mdape"] = {"value": mdape, "n": len(err)}
    by_cc = {}
    for c, (pop, smp) in strata.items():
        rs = [r for r in results if r["country"] == c]
        hit = sum(bool((r.get("flags") or {}).get("matched")) for r in rs)
        by_cc[c] = {"population": pop, "sampled": smp, "matched": hit,
                    "coverage": round(hit / smp, 4) if smp else None}
    return m, by_cc


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------

def evaluate_gate(metrics, checks, baseline, sampled):
    """{'ok', 'failures', 'warnings', 'checks'}: each check against the baseline."""
    fails, warns, rows = [], [], []
    base = (baseline or {}).get("metrics") or {}
    for c in checks:
        key, kind = c["metric"], c.get("kind", "soft")
        tol = float(c.get("tolerance_points", 0)) / 100
        lower_better = c.get("direction") == "lower"
        cur = metrics.get(key) or {}
        now, was = cur.get("value"), base.get(key)
        row = {"metric": key, "kind": kind, "now": now, "baseline": was, "tolerance_points": c.get("tolerance_points", 0)}
        why, soft_why = None, None
        if not baseline:
            # A hard check with no baseline fails, so removing the file cannot
            # wave a run through (T1181's rule).
            if kind == "hard":
                why = "no baseline: run with --write-baseline once"
            else:
                soft_why = "no baseline yet: run with --write-baseline once"
        elif was is None:
            soft_why = "no baseline value for this metric"
        elif now is None or (cur.get("n") or 0) < int(c.get("min_n", 1)):
            soft_why = f"insufficient: {cur.get('n') or 0} items, needs {c.get('min_n', 1)}"
        elif lower_better:
            if now > was + tol:
                why = f"rose from {was} to {now} (tolerance {c.get('tolerance_points', 0)} points)"
        elif now < was - tol - 1e-9:
            hi = cur.get("high")
            if sampled and hi is not None and hi >= was - tol:
                soft_why = (f"fell from {was} to {now}, inside the sample's 95% interval "
                            f"({cur.get('low')} to {hi})")
            else:
                why = f"fell from {was} to {now} (tolerance {c.get('tolerance_points', 0)} points)"
        row["status"] = "fail" if why and kind == "hard" else "warn" if (why or soft_why) else "pass"
        rows.append(row)
        text = why or soft_why
        if row["status"] == "fail":
            fails.append({"metric": key, "why": text})
        elif row["status"] == "warn":
            warns.append({"metric": key, "kind": kind, "why": text})
    return {"ok": not fails, "failures": fails, "warnings": warns, "checks": rows}


def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def dated(layer_dir: Path):
    return sorted(p for p in layer_dir.glob("????-??-??.json"))


def gate_from_disk(valid_dir: Path = VALID_DIR):
    """The D2 hook: every layer's latest result, re-checked against its
    current baseline. Returns (failures, warnings) as D2 rows."""
    fails, warns = [], []
    valid_dir = Path(valid_dir)
    if not valid_dir.is_dir():
        return fails, warns
    for d in sorted(p for p in valid_dir.iterdir() if p.is_dir()):
        files = dated(d)
        if not files:
            continue
        res = load_json(files[-1], {}) or {}
        if res.get("schema") != SCHEMA:
            continue
        g = evaluate_gate(res.get("metrics") or {}, res.get("checks") or [],
                          load_json(d / "baseline.json"), bool(res.get("sample", {}).get("sampled")))
        for f in g["failures"]:
            fails.append({"id": f"validation.{d.name}.{f['metric']}", "layer": d.name, "kind": "hard",
                          "why": f"{f['why']} (validation {files[-1].stem})"})
        for w in g["warnings"]:
            warns.append({"id": f"validation.{d.name}.{w['metric']}", "layer": d.name, "kind": w["kind"],
                          "why": f"{w['why']} (validation {files[-1].stem})"})
    return fails, warns


# ---------------------------------------------------------------------------
# Run, write, scorecard
# ---------------------------------------------------------------------------

def plugin(name):
    if name not in LAYERS:
        raise SystemExit(f"validation: unknown layer {name}; known: {', '.join(sorted(LAYERS))}")
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    return importlib.import_module(LAYERS[name])


def run(layer_mod, ctx=None, share=1.0, min_per=5, salt="d23", baseline=None, now=None):
    ctx = ctx or {}
    name = layer_mod.NAME
    refs = layer_mod.references(ctx)
    chosen, strata = sample(refs, name, share, min_per, salt)
    carta = layer_mod.load(ctx)
    results = layer_mod.match(chosen, carta)
    metrics, by_cc = measure(results, strata)
    sampled = len(chosen) < len(refs)
    checks = [dict(c) for c in layer_mod.CHECKS]
    g = evaluate_gate(metrics, checks, baseline, sampled)
    at = (now or datetime.now(timezone.utc)).replace(microsecond=0)
    meta = layer_mod.describe(ctx, carta) if hasattr(layer_mod, "describe") else {}
    return {
        "schema": SCHEMA, "layer": name, "generated_at": at.isoformat().replace("+00:00", "Z"),
        "date": at.date().isoformat(),
        "reference": {**meta.get("reference", {}), "n": len(refs)},
        "carta": meta.get("carta", {}),
        "sample": {"sampled": sampled, "share": share, "min_per_country": min_per, "salt": salt,
                   "n": len(chosen), "population": len(refs), "countries": len(strata)},
        "metrics": metrics,
        "by_country": by_cc,
        "checks": checks,
        "gate": g,
        "gaps": layer_mod.gaps(results) if hasattr(layer_mod, "gaps") else [],
        "results": [{k: v for k, v in r.items() if k in ("id", "country", "flags", "facts", "rank", "error", "note")}
                    for r in results],
    }


HEADLINE = ("coverage", "fact_share", "agreement_tau", "error_mdape")


def scorecard(valid_dir: Path, at: str):
    layers = []
    for d in sorted(p for p in Path(valid_dir).iterdir() if p.is_dir()):
        files = dated(d)
        if not files:
            continue
        base = load_json(d / "baseline.json")
        trend, last = [], None
        for f in files[-TREND_POINTS:]:
            r = load_json(f, {}) or {}
            if r.get("schema") != SCHEMA:
                continue
            last = r
            trend.append({"date": r["date"], "gate_ok": r["gate"]["ok"],
                          "metrics": {k: (r["metrics"].get(k) or {}).get("value")
                                      for k in sorted(set(HEADLINE) | {c["metric"] for c in r.get("checks", [])})}})
        if not last:
            continue
        g = evaluate_gate(last["metrics"], last.get("checks") or [], base, last["sample"]["sampled"])
        layers.append({
            "layer": d.name, "latest": last["date"], "generated_at": last["generated_at"],
            "reference_n": last["reference"].get("n"), "sample": last["sample"],
            "baseline_at": (base or {}).get("date"),
            "gate": g,
            "metrics": {k: last["metrics"].get(k) for k in last["metrics"]},
            "gaps": len(last.get("gaps") or []),
            "trend": trend,
        })
    return {"schema": CARD_SCHEMA, "generated_at": at, "layers": layers,
            "ok": all(lay["gate"]["ok"] for lay in layers)}


def write(result, valid_dir: Path = VALID_DIR, snapshot: Path | None = SNAPSHOT):
    d = Path(valid_dir) / result["layer"]
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{result['date']}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    card = scorecard(valid_dir, result["generated_at"])
    text = json.dumps(card, ensure_ascii=False, indent=1) + "\n"
    (Path(valid_dir) / "scorecard.json").write_text(text, encoding="utf-8")
    if snapshot is not None:
        Path(snapshot).write_text(text, encoding="utf-8")
    return path, card


def write_baseline(result, valid_dir: Path = VALID_DIR):
    base = {"layer": result["layer"], "date": result["date"], "reference": result["reference"],
            "sample": result["sample"],
            "metrics": {k: v.get("value") for k, v in result["metrics"].items()}}
    p = Path(valid_dir) / result["layer"] / "baseline.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(base, indent=1) + "\n", encoding="utf-8")
    return base


def main(argv=None):
    ap = argparse.ArgumentParser(description="External validation runner (D23)")
    ap.add_argument("layer", choices=sorted(LAYERS))
    ap.add_argument("--share", type=float, default=None, help="share of references per country (default: the layer's)")
    ap.add_argument("--min-per-country", type=int, default=None)
    ap.add_argument("--salt", default="d23")
    ap.add_argument("--out", default=str(VALID_DIR))
    ap.add_argument("--now", help="ISO time for the result's date (tests)")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-snapshot", action="store_true")
    a = ap.parse_args(argv)
    mod = plugin(a.layer)
    out = Path(a.out)
    share = a.share if a.share is not None else getattr(mod, "SHARE", 1.0)
    min_per = a.min_per_country if a.min_per_country is not None else getattr(mod, "MIN_PER_COUNTRY", 5)
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else None
    res = run(mod, {}, share, min_per, a.salt, load_json(out / a.layer / "baseline.json"), now)
    if a.write_baseline:
        write_baseline(res, out)
        res["gate"] = evaluate_gate(res["metrics"], res["checks"], load_json(out / a.layer / "baseline.json"),
                                    res["sample"]["sampled"])
    if a.write:
        path, _ = write(res, out, None if a.no_snapshot else SNAPSHOT)
        print(f"wrote {path}")
    m, g = res["metrics"], res["gate"]
    s = res["sample"]
    print(f"{a.layer}: {s['n']} of {s['population']} references in {s['countries']} countries; "
          + ", ".join(f"{k} {(m.get(k) or {}).get('value')}" for k in HEADLINE))
    print(f"gate: {'pass' if g['ok'] else 'FAIL'}, {len(g['failures'])} failed, {len(g['warnings'])} warnings")
    for f in g["failures"]:
        print(f"  FAIL {f['metric']}: {f['why']}")
    for w in g["warnings"]:
        print(f"  warn [{w['kind']}] {w['metric']}: {w['why']}")
    return 1 if a.check and not g["ok"] else 0


if __name__ == "__main__":
    sys.exit(main())
