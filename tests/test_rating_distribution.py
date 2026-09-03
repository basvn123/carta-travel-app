"""Distribution assertions for the rating model (step E2).

Seven properties the shipped ratings must hold. Each threshold is documented
next to its assertion, and each exists because rating_v3 measurably violated
it (see reports/rating_audit_v3_baseline.json):

  1. No component's modal share exceeds 40%.
         v3: highlights sat at ONE value on 87.2% of the catalogue - a
         constant dressed as a measurement. For components where zero is a
         SEMANTIC ABSENCE rather than a measurement (acclaim: no register
         has judged the place, true for 63% of the catalogue and evenly so
         across curated and fitted halves), the share is measured over the
         nonzero values - a true absence is not a constant, and the B5
         coverage ratchet guards the zero side. Checkpoint decision (a),
         2026-09-03.
  2. Every component contributes at least 0.10 to score SD (weight x 10 x SD).
         v3: highlights contributed 0.063; below 0.10 a component is
         decoration, whatever its weight says.
  3. |curated SD - fitted SD| < 0.18.
         v3: 0.950 vs 0.615 (gap 0.335) - the fallback regressed to the mean
         and made half the catalogue 5.6x less likely to earn a label. The
         threshold was 0.08 until the 2026-09-03 checkpoint-2 decision: the
         approved calibration keeps the 12% shrink toward the class median
         and caps the map at the curated class p95, which by construction
         holds the fitted/curated SD ratio near 0.88x and measures a gap of
         0.175 on the shipped catalogue. The gate now guards against
         regression from that chosen design, not against the design itself.
  4. |corr(score, log population)| < 0.10.
         The model's core fairness claim: a place is not better for being
         large. v3 held this (-0.02) and v4 must keep holding it.
  5. |corr(beauty, log population)| < 0.12.
         v3: -0.158 - beauty quietly penalised cities.
  6. Every country has >= 3 badged destinations (country_badge, from A6).
         Skipped while the field does not exist yet; asserts as soon as the
         country-context layer publishes it.
  7. Tier-3 count stays between 35 and 70.
         "Worth the journey" means the continent's icons; the band keeps a
         recalibration from silently inflating or emptying the top shelf.

The suite is the rating_v4 contract. Under rating_v3 it reports the measured
values and skips - Phase A is what makes it pass, and gating on the model tag
means the build starts enforcing the moment A5 stamps rating_v4. After that,
any pipeline change that breaks a property fails CI.

Runs under pytest, or standalone:
    python tests/test_rating_distribution.py
"""

import json
import math
import sys
from pathlib import Path

try:
    import pytest
except ImportError:          # standalone run without pytest installed
    pytest = None

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "diagnostics"))
from rating_audit import audit  # noqa: E402  (stats live in one place)

# The master is the pipeline's source of truth but is gitignored; CI falls
# back to the tracked wire, which carries identical rating fields.
_MASTER = ROOT / "app_data" / "app_data.json"
_WIRE = ROOT / "continent-app" / "public" / "app_data.json"
INPUT = _MASTER if _MASTER.exists() else _WIRE

# Thresholds - the documented contract, not tuning knobs. Never loosen one to
# make a run pass; a violated threshold means the model changed for the worse.
MAX_MODAL_SHARE = 0.40
# Components whose zero encodes "input absent" rather than "measured zero";
# their modal share is asserted over nonzero values (see rule 1 above).
SEMANTIC_ZERO_COMPONENTS = {"acclaim"}
MIN_SD_CONTRIBUTION = 0.10
MAX_SD_GAP = 0.18
MAX_SCORE_POP_CORR = 0.10
MAX_BEAUTY_POP_CORR = 0.12
MIN_BADGED_PER_COUNTRY = 3
TIER3_RANGE = (35, 70)

BASELINE_MODEL = "rating_v3"


def _corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def measure():
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    dests = data["destinations"]
    model = (data["meta"].get("rating_model") or {}).get("version", "?")
    report = audit(data)

    # Size-fairness correlations, over destinations with a real population.
    pop_rows = [(d["rating"]["score"],
                 (d.get("beauty") or {}).get("score"),
                 (d.get("geonames") or {}).get("population"))
                for d in dests.values() if d.get("rating")]
    pop_rows = [(s, b, p) for s, b, p in pop_rows if p and p > 0]
    logpop = [math.log(p) for _, _, p in pop_rows]
    score_pop = _corr([s for s, _, _ in pop_rows], logpop)
    beauty_rows = [(b, lp) for (_, b, _), lp in zip(pop_rows, logpop)
                   if b is not None]
    beauty_pop = _corr([b for b, _ in beauty_rows],
                       [lp for _, lp in beauty_rows])

    # Country badges (A6). None until the country-context layer ships.
    badge_field_exists = any("country_badge" in d for d in dests.values())
    badged = {}
    if badge_field_exists:
        for d in dests.values():
            if d.get("country_badge"):
                badged[d["country"]] = badged.get(d["country"], 0) + 1
        for name in report["countries"]:
            badged.setdefault(name, 0)

    return model, report, score_pop, beauty_pop, badge_field_exists, badged


def test_rating_distribution():
    model, report, score_pop, beauty_pop, badges_exist, badged = measure()

    lines = [f"model {model}  (input {INPUT.name})"]
    problems = []

    for name, comp in report["components"].items():
        share = comp["modal"]["share"]
        note = ""
        if name in SEMANTIC_ZERO_COMPONENTS and comp["modal"]["value"] == 0:
            share = comp["modal_nonzero"]["share"] if comp.get("modal_nonzero") else 0.0
            note = " (nonzero)"
        contrib = comp["score_sd_contribution"]
        lines.append(f"  {name:10s} modal share {share:.3f}{note}  "
                     f"sd contribution {contrib:.3f}")
        if share > MAX_MODAL_SHARE:
            problems.append(f"{name} modal share{note} {share:.3f} > {MAX_MODAL_SHARE}")
        if contrib < MIN_SD_CONTRIBUTION:
            problems.append(f"{name} sd contribution {contrib:.3f} < {MIN_SD_CONTRIBUTION}")

    cur_sd = report["split"]["curated"]["scores"]["sd"]
    fit_sd = report["split"]["fitted"]["scores"]["sd"]
    gap = abs(cur_sd - fit_sd)
    lines.append(f"  curated sd {cur_sd:.3f}  fitted sd {fit_sd:.3f}  gap {gap:.3f}")
    if gap >= MAX_SD_GAP:
        problems.append(f"curated/fitted sd gap {gap:.3f} >= {MAX_SD_GAP}")

    lines.append(f"  corr(score, log pop) {score_pop:+.3f}  "
                 f"corr(beauty, log pop) {beauty_pop:+.3f}")
    if abs(score_pop) >= MAX_SCORE_POP_CORR:
        problems.append(f"|corr(score, log pop)| {abs(score_pop):.3f} >= {MAX_SCORE_POP_CORR}")
    if abs(beauty_pop) >= MAX_BEAUTY_POP_CORR:
        problems.append(f"|corr(beauty, log pop)| {abs(beauty_pop):.3f} >= {MAX_BEAUTY_POP_CORR}")

    tier3 = report["split"]["all"]["tiers"]["3"]
    lines.append(f"  tier-3 count {tier3}")
    if not TIER3_RANGE[0] <= tier3 <= TIER3_RANGE[1]:
        problems.append(f"tier-3 count {tier3} outside {TIER3_RANGE}")

    if badges_exist:
        thin = {c: n for c, n in badged.items() if n < MIN_BADGED_PER_COUNTRY}
        lines.append(f"  countries below {MIN_BADGED_PER_COUNTRY} badges: "
                     f"{thin or 'none'}")
        if thin:
            problems.append(f"countries with < {MIN_BADGED_PER_COUNTRY} "
                            f"badged destinations: {thin}")
    else:
        lines.append("  country_badge not published yet (A6) - badge check idle")

    print("\n".join(lines))

    if model == BASELINE_MODEL:
        # Phase A has not run; this suite is the contract it must meet.
        msg = (f"{model} is the pre-v4 baseline; contract violations "
               f"measured, not enforced: {problems or 'none'}")
        if pytest:
            pytest.skip(msg)
        print("SKIP:", msg)
        return

    assert not problems, "rating distribution contract broken:\n  " + \
        "\n  ".join(problems)


if __name__ == "__main__":
    test_rating_distribution()
    print("distribution assertions hold")
