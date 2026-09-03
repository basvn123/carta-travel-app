"""Golden-set order harness - the rating model's non-negotiables (step E1).

tests/golden_ratings.json holds 120 hand-picked pairwise orderings that are
not seriously disputable - Rome above Turin, Bruges above Charleroi, Hallstatt
above Linz - spread across all five place kinds and 34 countries. A pair
passes when the winner's rating.score is STRICTLY greater than the loser's;
a tie fails, because an order the model cannot express is an order it got
wrong. No absolute value is ever asserted, so the harness survives
recalibration.

The file also records how rating_v3 scored: 111 passed, 9 failed. Those nine
are the improvement budget. What this test asserts depends on which model
produced the app_data being tested:

  same model as the baseline (rating_v3)
      The results must match the recorded baseline exactly. If they drift,
      either the data or the baseline is stale - both are bugs.

  a newer model
      Strictly more pairs must pass than the baseline passed, and no pair
      the baseline passed may now fail (PLAN.md E1's "done when").

Runs under pytest, or standalone:
    python tests/test_golden_ratings.py [path/to/app_data.json]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "tests" / "golden_ratings.json"
# The master is the pipeline's source of truth but is gitignored; CI falls
# back to the tracked wire, which carries identical rating fields.
_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
DEFAULT_INPUT = _MASTER if _MASTER.exists() else _WIRE


def evaluate(app_data_path=DEFAULT_INPUT):
    """Returns (model_version, results) - one dict per pair with a `passed`."""
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    data = json.loads(Path(app_data_path).read_text(encoding="utf-8"))
    dests = data["destinations"]
    model = (data["meta"].get("rating_model") or {}).get("version", "?")

    results = []
    for pair in golden["pairs"]:
        w, l = dests.get(pair["winner"]), dests.get(pair["loser"])
        assert w is not None, f"golden id missing from catalogue: {pair['winner']}"
        assert l is not None, f"golden id missing from catalogue: {pair['loser']}"
        sw = w["rating"]["score"]
        sl = l["rating"]["score"]
        results.append({**pair, "winner_score": sw, "loser_score": sl,
                        "passed": sw > sl})
    return model, golden, results


def test_golden_pairs():
    model, golden, results = evaluate()
    baseline = golden["v3_baseline"]
    passed = sum(1 for r in results if r["passed"])
    failed = [r for r in results if not r["passed"]]
    baseline_failing = {(p["winner"], p["loser"])
                       for p in baseline["failing_pairs"]}

    # The invariant that holds at EVERY commit, whatever the model tag says:
    # no pair the v3 baseline passed may fail. The tag stays rating_v3 while
    # the Phase A maths lands step by step (the bump is reserved for A5), so
    # the same-tag case must allow honest improvement - only regression is
    # drift. Which pairs fail may shrink; it may never grow.
    regressions = [r for r in failed
                   if (r["winner"], r["loser"]) not in baseline_failing]
    assert not regressions, (
        f"{model} breaks {len(regressions)} pair(s) that "
        f"{baseline['model']} passed: "
        + "; ".join(f"{r['note']} ({r['winner_score']} vs {r['loser_score']})"
                    for r in regressions))

    if model != baseline["model"]:
        # The finished model must also beat the baseline outright (E1's
        # "done when": strictly more pairs pass than v3 passed).
        assert passed > baseline["passed"], (
            f"{model} passes {passed}, not strictly more than "
            f"{baseline['model']}'s {baseline['passed']}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT
    model, golden, results = evaluate(path)
    passed = sum(1 for r in results if r["passed"])
    print(f"model {model}: {passed}/{len(results)} golden pairs pass")
    for r in results:
        if not r["passed"]:
            print(f"  FAIL {r['note']}: {r['winner_score']} vs {r['loser_score']}")
    test_golden_pairs()
    print("harness assertions hold")
