"""Rating model audit - measure the model before (and after) changing it.

Reads the published ratings out of app_data.json and reports, per component:
min, p10, median, p90, max, standard deviation, the share of destinations
sitting at the modal value, and the component's realised contribution to the
score's standard deviation (weight x 10 x SD, since components are stored
0-1 and the score is 0-10). Adds per-country appeal coverage, tier counts,
and the curated-vs-fitted split.

Why it exists: rating_v3's stated weights say what each component is ALLOWED
to move, not what it actually moves. A component whose value is nearly
constant across the catalogue contributes nothing to the spread between
destinations whatever its weight says, and the only way to see that is to
measure dispersion on the shipped numbers. This audit is the instrument every
later model change is judged against.

The first run's output is frozen as reports/rating_audit_v3_baseline.json
(pass --freeze-baseline once). Later runs write reports/rating_audit.json and
are compared against the frozen file, so a regression is a diff rather than
an argument.

Curated vs fitted: a destination is "curated" when its rating.components
carries an appeal entry - rating_layer.blend_score only writes one when a
hand-scored appeal record existed. Everything else got the fitted fallback.

Usage:
    python pipeline/diagnostics/rating_audit.py
    python pipeline/diagnostics/rating_audit.py --input continent-app/public/app_data.json
    python pipeline/diagnostics/rating_audit.py --freeze-baseline
"""

import argparse
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "app_data" / "app_data.json"
DEFAULT_OUTPUT = ROOT / "reports" / "rating_audit.json"
BASELINE = ROOT / "reports" / "rating_audit_v3_baseline.json"

COMPONENTS = ("appeal", "beauty", "highlights", "acclaim")


def quantile(sorted_vals, q):
    """Linear-interpolated quantile on an already-sorted list."""
    if not sorted_vals:
        return None
    pos = q * (len(sorted_vals) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def stdev(vals):
    if len(vals) < 2:
        return 0.0
    mean = sum(vals) / len(vals)
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / (len(vals) - 1))


def dist_stats(vals):
    """min/p10/median/p90/p95/max/sd/mean for one list of numbers."""
    if not vals:
        return None
    s = sorted(vals)
    return {
        "n": len(s),
        "min": round(s[0], 4),
        "p10": round(quantile(s, 0.10), 4),
        "median": round(quantile(s, 0.50), 4),
        "p90": round(quantile(s, 0.90), 4),
        "p95": round(quantile(s, 0.95), 4),
        "max": round(s[-1], 4),
        "mean": round(sum(s) / len(s), 4),
        "sd": round(stdev(s), 4),
    }


def modal_share(vals):
    """The most common exact value and the share of rows carrying it."""
    if not vals:
        return None
    value, count = Counter(vals).most_common(1)[0]
    return {"value": value, "count": count, "share": round(count / len(vals), 4)}


def tier_counts(recs):
    c = Counter(r["rating"].get("tier", 0) for r in recs)
    return {str(t): c.get(t, 0) for t in (3, 2, 1, 0)}


def audit(data):
    dests = data["destinations"]
    meta = data.get("meta", {})
    weights = (meta.get("rating_model") or {}).get("weights") or {}

    recs = [d for d in dests.values() if d.get("rating")]
    curated = [d for d in recs if "appeal" in (d["rating"].get("components") or {})]
    fitted = [d for d in recs if "appeal" not in (d["rating"].get("components") or {})]

    # Per-component dispersion, and what it actually moves in the score.
    # Components are stored 0-1; the score is 0-10, so realised contribution
    # to score SD is weight x 10 x SD(component). Measured over the rows the
    # component exists on (appeal only exists for curated destinations).
    components = {}
    for name in COMPONENTS:
        vals = [
            d["rating"]["components"][name]
            for d in recs
            if name in (d["rating"].get("components") or {})
        ]
        weight = weights.get(name)
        sd = stdev(vals)
        components[name] = {
            "weight": weight,
            "stats": dist_stats(vals),
            "modal": modal_share(vals),
            "modal_nonzero": modal_share([v for v in vals if v]),
            "score_sd_contribution": round(weight * 10 * sd, 4) if weight else None,
        }

    # Score distributions, whole catalogue and split by provenance. The split
    # is the heart of the audit: identical scoring claims should produce
    # comparable spreads on both halves, and v3 does not.
    scores = lambda rs: [r["rating"]["score"] for r in rs]
    split = {
        "all": {"scores": dist_stats(scores(recs)), "tiers": tier_counts(recs),
                "hidden_gems": sum(1 for r in recs if r["rating"].get("hidden_gem"))},
        "curated": {"scores": dist_stats(scores(curated)), "tiers": tier_counts(curated)},
        "fitted": {"scores": dist_stats(scores(fitted)), "tiers": tier_counts(fitted)},
    }
    # A5: tier distributions by published confidence, once the field exists.
    by_conf = {}
    for r in recs:
        conf = r["rating"].get("confidence")
        if conf:
            by_conf.setdefault(conf, []).append(r)
    if by_conf:
        split["by_confidence"] = {
            conf: {"n": len(rows), "tiers": tier_counts(rows),
                   "scores": dist_stats(scores(rows))}
            for conf, rows in sorted(by_conf.items())
        }
    for part in ("curated", "fitted"):
        tiers = split[part]["tiers"]
        n = split[part]["scores"]["n"]
        split[part]["tier2_plus_rate"] = round((tiers["3"] + tiers["2"]) / n, 4)
        split[part]["labelled_rate"] = round(
            (tiers["3"] + tiers["2"] + tiers["1"]) / n, 4)

    # Per-country appeal coverage and tier outcomes - the coverage-vs-label
    # correlation is a per-country fact before it is a catalogue-wide one.
    by_country = {}
    for d in recs:
        by_country.setdefault(d.get("country") or "?", []).append(d)
    countries = {}
    for name, rows in sorted(by_country.items(), key=lambda kv: -len(kv[1])):
        cur = sum(1 for r in rows if "appeal" in (r["rating"].get("components") or {}))
        tiers = tier_counts(rows)
        countries[name] = {
            "n": len(rows),
            "curated": cur,
            "appeal_coverage": round(cur / len(rows), 4),
            "tiers": tiers,
            "any_label": tiers["3"] + tiers["2"] + tiers["1"],
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input_meta": {
            "schema_version": meta.get("schema_version"),
            "rating_model": (meta.get("rating_model") or {}).get("version"),
            "generated_at": meta.get("generated_at"),
            "n_destinations": len(dests),
            "n_rated": len(recs),
        },
        "weights": weights,
        "components": components,
        "split": split,
        "countries": countries,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument("--freeze-baseline", action="store_true",
                    help=f"also write {BASELINE.name}; refuses to overwrite")
    args = ap.parse_args()

    data = json.loads(args.input.read_text(encoding="utf-8"))
    report = audit(data)
    report["input_path"] = str(args.input)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"wrote {args.output}")

    if args.freeze_baseline:
        if BASELINE.exists():
            raise SystemExit(f"{BASELINE} already exists - the baseline is "
                             "frozen and stays frozen. Delete it by hand if "
                             "you really mean to re-freeze.")
        BASELINE.write_text(json.dumps(report, indent=1), encoding="utf-8")
        print(f"froze {BASELINE}")

    # The headline figures, printed so a run leaves evidence in the log.
    hl = report["components"]["highlights"]
    ap_c = report["components"]["appeal"]
    print(f"highlights modal share  {hl['modal']['share']:.4f} "
          f"(value {hl['modal']['value']}, n {hl['modal']['count']})")
    print(f"appeal sd contribution  {ap_c['score_sd_contribution']:.4f}")
    print(f"curated score sd        {report['split']['curated']['scores']['sd']:.4f}")
    print(f"fitted  score sd        {report['split']['fitted']['scores']['sd']:.4f}")
    print(f"tiers (all)             {report['split']['all']['tiers']}")


if __name__ == "__main__":
    main()
