"""Calibration anchors - rebuild the frozen fitted-score curve, and check it.

Tier: Manual

rating_layer scores a place with no curated appeal by looking its raw
regression output up on a frozen per-class curve,
reports/rating_calibration_anchors.json (appeal_scale.apply_anchor_curves).
The 2026-09-04 ruling froze that curve on the 3,746-destination catalogue
shipped in 798f1b84, so that growing the catalogue rates the newcomers and
moves no existing score.

T321 found that the stored curve does not reproduce the catalogue it names.
Replayed on 798f1b84's own fitted places it misses their scores by 0.10 to
0.47 points on average per class, its city raw axis ends at 7.566 where the
inputs reach 7.922, and it holds 108 distinct city knots where the inputs
give 239. Applied in the next rating run (eb2797c3), it re-rated 1,133 of the
3,038 reference places and narrowed the fitted SD on the reference
population from 0.833 to 0.706, which is what broke the distribution
contract (tests/test_rating_distribution.py, gap 0.157 to 0.280).

Everything a curve needs is on the tracked wire: each fitted place's
components and the run's fallback coefficients give its raw output, and the
curated places' scores give the target distribution. So the curve can be
rebuilt from a named git revision with no pipeline run and no cache, and
checked against that revision's own scores before it is written.

Usage:
    python pipeline/diagnostics/calibration_anchors.py --check
        Project the current wire's ratings through the stored curve and print
        the gates the distribution contract asserts. Reads only.
    python pipeline/diagnostics/calibration_anchors.py --rebuild-from 798f1b84
        Rebuild the curve from that revision's tracked wire, replay it on the
        same wire, and write the anchor file only if the replay holds.

Neither mode touches app_data/, the wire or any cache. A rebuilt curve
reaches the published scores only when the data lane re-runs
pipeline/apply_rating_layer.py and rebuilds the wire.
"""

import argparse
import json
import math
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
import appeal_scale  # noqa: E402

ANCHOR_PATH = ROOT / appeal_scale.ANCHOR_FILE
GOLDEN = ROOT / "tests" / "golden_ratings.json"
REFERENCE = ROOT / "reports" / "rating_reference_population.json"
WIRE_PATH = "continent-app/public/app_data.json"
_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / WIRE_PATH

# The replay must reproduce the reference revision's own fitted scores this
# closely, or the rebuild refuses to write. 0.05 is ANCHOR_KNOTS' own design
# figure (appeal_scale.py); the share bound leaves room for the places the
# golden guard clamped and the multi-airport siblings that inherit a score.
MAX_REPLAY_MEAN_ABS = 0.05
MIN_REPLAY_WITHIN_01 = 0.97


def load_wire(path=None, rev=None):
    """The app data, from a file or from a git revision's tracked wire."""
    if rev:
        out = subprocess.run(["git", "show", f"{rev}:{WIRE_PATH}"], cwd=ROOT,
                             capture_output=True, check=True)
        return json.loads(out.stdout.decode("utf-8"))
    p = Path(path) if path else (_MASTER if _MASTER.exists() else _WIRE)
    return json.loads(p.read_text(encoding="utf-8"))


def _class(dest):
    return (dest.get("place") or {}).get("class") or appeal_scale.class_of(dest)


def raw_output(comps, fb):
    """The fallback regression's raw output, rebuilt from the stored
    components exactly as rating_layer.blend_score computes it."""
    return (fb[0] * comps["acclaim"] * 10.0 + fb[1] * comps["beauty"] * 10.0
            + fb[2] * comps["highlights"] * 10.0 + fb[3])


def split(data):
    """(fitted_by_class {cls: [(did, raw)]}, curated_by_class {cls: [score]},
    shipped {did: score}) for one wire."""
    fb = data["meta"]["rating_model"]["fallback_fit"]["coefficients"]
    fitted, curated, shipped = defaultdict(list), defaultdict(list), {}
    for did, d in data["destinations"].items():
        r = d.get("rating")
        if not r:
            continue
        shipped[did] = r["score"]
        comps = r.get("components") or {}
        if "appeal" in comps:
            curated[_class(d)].append(r["score"])
        else:
            fitted[_class(d)].append((did, raw_output(comps, fb)))
    return fitted, curated, shipped


def golden_guard(scores, curated_ids):
    """rating_layer's editorial anchor guard: where a golden pair puts a
    curated place above a fitted one, clamp the fitted score below it."""
    if not GOLDEN.exists():
        return 0
    n = 0
    for pair in json.loads(GOLDEN.read_text(encoding="utf-8"))["pairs"]:
        w, l = pair["winner"], pair["loser"]
        if w in scores and l in scores and w in curated_ids and l not in curated_ids:
            cap = round(scores[w], 1) - 0.1
            if scores[l] > cap:
                scores[l] = cap
                n += 1
    return n


def project(data, curves):
    """{did: score} the stored curve would give this wire's places."""
    fitted, _curated, shipped = split(data)
    scores = dict(shipped)
    for did, s in appeal_scale.apply_anchor_curves(fitted, curves).items():
        scores[did] = s
    curated_ids = {did for did, d in data["destinations"].items()
                   if "appeal" in ((d.get("rating") or {}).get("components") or {})}
    golden_guard(scores, curated_ids)
    return {did: round(s, 1) for did, s in scores.items()}


def replay(data, curves):
    """Per class: (n, mean abs error, share within 0.1) of the curve against
    the wire's own fitted scores."""
    fitted, _c, shipped = split(data)
    proj = project(data, curves)
    out = {}
    for cls, rows in fitted.items():
        errs = [abs(proj[did] - shipped[did]) for did, _ in rows]
        out[cls] = (len(errs), statistics.mean(errs),
                    sum(e <= 0.1 + 1e-9 for e in errs) / len(errs))
    allerrs = [abs(proj[did] - shipped[did])
               for rows in fitted.values() for did, _ in rows]
    out["__all__"] = (len(allerrs), statistics.mean(allerrs),
                      sum(e <= 0.1 + 1e-9 for e in allerrs) / len(allerrs))
    return out


def sd_gap(data, scores, ids=None):
    """(curated SD, fitted SD, |gap|) over ids (default: everyone rated)."""
    cur, fit = [], []
    for did, d in data["destinations"].items():
        r = d.get("rating")
        if not r or (ids is not None and did not in ids) or did not in scores:
            continue
        (cur if "appeal" in (r.get("components") or {}) else fit).append(scores[did])
    c, f = statistics.pstdev(cur), statistics.pstdev(fit)
    return c, f, abs(c - f)


def _corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return 0.0 if not sx or not sy else \
        sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def contract_figures(data, scores):
    """The figures the distribution contract asserts, for one score set."""
    ref = set(json.loads(REFERENCE.read_text(encoding="utf-8"))["ids"])
    cuts = data["meta"]["rating_model"]["tier_cutoffs"]
    c, f, gap = sd_gap(data, scores, ref)
    rows = [(scores[did], (d.get("geonames") or {}).get("population"))
            for did, d in data["destinations"].items()
            if did in ref and did in scores]
    rows = [(s, p) for s, p in rows if p and p > 0]
    tier3 = sum(1 for s in scores.values() if s >= cuts["3"])
    fitted_ids = [did for did, d in data["destinations"].items()
                  if d.get("rating") and "appeal" not in d["rating"]["components"]]
    t2 = sum(1 for did in fitted_ids if scores[did] >= cuts["2"]) / len(fitted_ids)
    return {"curated_sd": c, "fitted_sd": f, "gap": gap,
            "score_pop": _corr([s for s, _ in rows], [math.log(p) for _, p in rows]),
            "tier3": tier3, "fitted_tier2_rate": t2}


def print_figures(label, fig):
    print(f"  {label}: curated sd {fig['curated_sd']:.3f}  fitted sd "
          f"{fig['fitted_sd']:.3f}  gap {fig['gap']:.3f}  score-pop "
          f"{fig['score_pop']:+.3f}  tier-3 {fig['tier3']}  fitted tier>=2 "
          f"{fig['fitted_tier2_rate']:.1%}")


def check(path=None):
    data = load_wire(path)
    curves = json.loads(ANCHOR_PATH.read_text(encoding="utf-8"))["curves"]
    shipped = split(data)[2]
    proj = project(data, curves)
    moved = sum(1 for did in shipped if abs(proj[did] - shipped[did]) > 1e-9)
    print("gates on the reference population:")
    print_figures("shipped scores  ", contract_figures(data, shipped))
    print_figures("stored curve    ", contract_figures(data, proj))
    print(f"  scores the stored curve would move on this wire: {moved}")


def rebuild(rev, write=True):
    data = load_wire(rev=rev)
    fitted, curated, _shipped = split(data)
    curves = appeal_scale.build_anchor_curves(fitted, curated)
    stats = replay(data, curves)
    print(f"replay of the rebuilt curve on {rev}'s own fitted scores:")
    for cls, (n, mae, within) in sorted(stats.items()):
        print(f"  {cls:8s} n {n:5d}  mean abs {mae:.3f}  within 0.1 {within:.1%}")
    n, mae, within = stats["__all__"]
    if mae > MAX_REPLAY_MEAN_ABS or within < MIN_REPLAY_WITHIN_01:
        print(f"REFUSED: replay mean abs {mae:.3f} (max {MAX_REPLAY_MEAN_ABS}) "
              f"within 0.1 {within:.1%} (min {MIN_REPLAY_WITHIN_01:.0%})")
        return 1
    old = json.loads(ANCHOR_PATH.read_text(encoding="utf-8")) \
        if ANCHOR_PATH.exists() else {}
    depth_p99 = data["meta"]["rating_model"]["highlights_model"]["depth_p99"]
    out = {
        "frozen": old.get("frozen", "2026-09-04"),
        "rebuilt": f"{date.today().isoformat()} by T321 "
                   "(pipeline/diagnostics/calibration_anchors.py)",
        "model": "fitted_quantile_v2_frozen",
        "fitted_on": (f"the {len(data['destinations']):,}-destination catalogue "
                      f"in the tracked wire at {rev}: raw outputs rebuilt from "
                      "each fitted place's stored components and that run's "
                      "fallback coefficients, targets from its curated scores"),
        "why": old.get("why", ""),
        "replay": {"revision": rev, "fitted": n,
                   "mean_abs_error": round(mae, 4),
                   "share_within_0_1": round(within, 4)},
        "knots_per_class": appeal_scale.ANCHOR_KNOTS,
        "n_reference_fitted": sum(len(v) for v in fitted.values()),
        "n_reference_curated": sum(len(v) for v in curated.values()),
        "depth_p99": depth_p99,
        "depth_p99_note": old.get("depth_p99_note", ""),
        "curves": curves,
    }
    if write:
        ANCHOR_PATH.write_text(json.dumps(out, indent=1), encoding="utf-8")
        print(f"wrote {ANCHOR_PATH.relative_to(ROOT)}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--rebuild-from", metavar="REV")
    ap.add_argument("--input", help="app data to check (default master, else wire)")
    ap.add_argument("--dry-run", action="store_true",
                    help="with --rebuild-from: replay, but do not write")
    a = ap.parse_args()
    if a.check:
        check(a.input)
        return 0
    return rebuild(a.rebuild_from, write=not a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
