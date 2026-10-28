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

  Gates 3-5 are POOLED statistics, and pooled statistics move when the
  census moves: the 2026-09-04 register-village wave (708 small places,
  honestly measured, golden untouched) shifted the SD gap to 0.213 and the
  beauty correlation to 0.206 without a single pre-existing score changing.
  Per the user ruling of 2026-09-04 these three gates are asserted on the
  FIXED REFERENCE POPULATION in reports/rating_reference_population.json -
  the 3,038-destination catalogue the thresholds were derived on - so they
  measure the model, not the census. The full-catalogue values are printed
  beside them and stay worth reading; a model recalibration is the moment
  to re-freeze the reference. Gates 1-2 and 6-7 remain full-catalogue.
  6. Every country has >= min(3, destinations held) badged destinations
         (country_badge, from A6) - the min() because Liechtenstein, Monaco
         and San Marino hold one destination each, and three badges cannot
         exist where one place does. Skipped while the field does not exist
         yet; asserts as soon as the country-context layer publishes it.
  7. Tier-3 count stays between 35 and 70.
         "Worth the journey" means the continent's icons; the band keeps a
         recalibration from silently inflating or emptying the top shelf.
  T759 (formula v5, rating v5 batch R2) changes three gates, each for a
  reason given here and in Execution/P7/T757-T760-rating-v5-scoring.md:
  3. The SD gap compares hand scores with rubric scores ON THE SAME PLACES
     (the blind hand check of T758, 157 hand-scored places scored again by
     the rubric), per class, and asserts the worst class. The gate exists to
     catch a scale that squeezes toward the mean (v3's fitted fallback). The
     curated and rubric POPULATIONS differ by design (hand scores cover
     Paris at 10 down to a 2.5 transit stop; the rubric scored the long
     tail), so their pooled gap measures the catalogue, not the scale: 0.48
     for cities and 0.44 for 37 rubric areas, against 0.01 and 0.02 for
     towns and villages. That figure stays printed, unasserted.
  5. |corr(beauty, log population)| < 0.20 under v5 (0.12 under v4). Beauty
     v2 (T756) measures the urban fabric within 5 km, which grows with a
     town (measured 0.152 on the reference population when the owner
     switched it on, T756-a); the fairness claim belongs to gate 4, the
     score, which v5 holds at -0.09.
  7. Under v5 the top shelf is the Exceptional band, 9.0 or more, held per
     class between 0.5% and 4% (the plan's gate 3, config bands): a village
     reaches it on village terms, so one catalogue-wide count no longer
     says whether the shelf is right. The tier-3 count (8.7) stays printed:
     the wire tier keeps v4's cutoffs until T763.
  8. Under v5, every rated place has a confidence (curated, rubric or
     estimated) and a reason in six languages: the hand reasons in
     app_data/curated_why_i18n.json, the rubric reasons in
     app_data/rubric_appeal.json (the plan's gate 4; on the wire from T762).

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
MAX_BEAUTY_POP_CORR_V5 = 0.20
TOP_BAND = 9.0
TOP_SHARE_RANGE = (0.005, 0.04)     # per class, formula v5
CLASSES = ("metro", "city", "town", "village", "area")

BASELINE_MODEL = "rating_v3"

# The reference population for gates 3-5 (see docstring). Absent file means
# an old checkout: fall back to the full catalogue.
_REFERENCE = ROOT / "reports" / "rating_reference_population.json"
_DESTS = []      # set by measure()


def _corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not sx or not sy:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def _sd(xs):
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _class(d):
    return (d.get("place") or {}).get("class")


RUBRIC = ROOT / "app_data" / "rubric_appeal.json"
WHY_I18N = ROOT / "app_data" / "curated_why_i18n.json"
LANGS = ("en", "nl", "de", "fr", "es", "it")
HANDCHECK = ROOT / "data" / "rating" / "rubric_scores" / "handcheck.json"
CURATED = ROOT / "app_data" / "curated_appeal.json"


def _matched_sd_gap(dests_by_id):
    """Worst per-class |SD(hand) - SD(rubric)| over the blind hand check."""
    if not (HANDCHECK.exists() and CURATED.exists()):
        return None
    rows = json.loads(HANDCHECK.read_text(encoding="utf-8"))
    hand = json.loads(CURATED.read_text(encoding="utf-8"))
    gaps = {}
    for cls in CLASSES:
        pairs = [(hand[r["id"]]["appeal"], r["appeal"]) for r in rows
                 if r["id"] in hand and _class(dests_by_id.get(r["id"], {})) == cls]
        if len(pairs) > 2:
            gaps[cls] = abs(_sd([h for h, _ in pairs]) - _sd([a for _, a in pairs]))
    return gaps


def _population_stats(dests):
    """(sd_gap, score_pop_corr, beauty_pop_corr) over one set of dests.

    v4: curated against fitted, pooled. v5 (T759): curated against rubric,
    per class, the worst class (see rule 3 above)."""
    v5 = any((d.get("rating") or {}).get("confidence") == "rubric" for d in dests)
    if v5:
        gaps = []
        for cls in CLASSES:
            cur = [d["rating"]["score"] for d in dests if d.get("rating")
                   and _class(d) == cls and d["rating"]["confidence"] == "curated"]
            rub = [d["rating"]["score"] for d in dests if d.get("rating")
                   and _class(d) == cls and d["rating"]["confidence"] == "rubric"]
            if len(cur) > 1 and len(rub) > 1:
                gaps.append(abs(_sd(cur) - _sd(rub)))
        sd_gap = max(gaps) if gaps else 0.0
    else:
        cur, fit = [], []
        for d in dests:
            r = d.get("rating")
            if not r:
                continue
            (cur if "appeal" in (r.get("components") or {}) else fit).append(r["score"])
        sd_gap = abs(_sd(cur) - _sd(fit)) if len(cur) > 1 and len(fit) > 1 else 0.0

    pop_rows = [(d["rating"]["score"],
                 (d.get("beauty") or {}).get("score"),
                 (d.get("geonames") or {}).get("population"))
                for d in dests if d.get("rating")]
    pop_rows = [(s, b, p) for s, b, p in pop_rows if p and p > 0]
    logpop = [math.log(p) for _, _, p in pop_rows]
    score_pop = _corr([s for s, _, _ in pop_rows], logpop)
    beauty_rows = [(b, lp) for (_, b, _), lp in zip(pop_rows, logpop)
                   if b is not None]
    beauty_pop = _corr([b for b, _ in beauty_rows],
                       [lp for _, lp in beauty_rows])
    return sd_gap, score_pop, beauty_pop


def measure():
    global _DESTS
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    dests = data["destinations"]
    _DESTS = list(dests.values())
    model = (data["meta"].get("rating_model") or {}).get("version", "?")
    report = audit(data)

    # Gates 3-5 run on the frozen reference population (see docstring); the
    # full-catalogue values ride along for the printout.
    all_stats = _population_stats(list(dests.values()))
    if _REFERENCE.exists():
        ref_ids = set(json.loads(_REFERENCE.read_text(encoding="utf-8"))["ids"])
        ref_stats = _population_stats([d for i, d in dests.items()
                                       if i in ref_ids])
    else:
        ref_ids, ref_stats = None, all_stats

    # Country badges (A6). None until the country-context layer ships.
    badge_field_exists = any("country_badge" in d for d in dests.values())
    badged = {}
    if badge_field_exists:
        for d in dests.values():
            if d.get("country_badge"):
                badged[d["country"]] = badged.get(d["country"], 0) + 1
        for name in report["countries"]:
            badged.setdefault(name, 0)

    return (model, report, ref_stats, all_stats,
            ref_ids is not None, badge_field_exists, badged)


def test_rating_distribution():
    (model, report, ref_stats, all_stats,
     ref_pinned, badges_exist, badged) = measure()
    sd_gap, score_pop, beauty_pop = ref_stats
    v5 = (report.get("model") or {}).get("formula") == "v5" or model.startswith("v5") and         any((d.get("rating") or {}).get("confidence") == "rubric" for d in _DESTS)
    max_beauty_pop = MAX_BEAUTY_POP_CORR_V5 if v5 else MAX_BEAUTY_POP_CORR

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

    pop = "reference population" if ref_pinned else "full catalogue (no reference file)"
    lines.append(f"  gates 3-5 on the {pop}:")
    if v5:
        matched = _matched_sd_gap({d.get("id"): d for d in _DESTS})
        lines.append(f"  curated/rubric sd gap, populations per class (unasserted) {sd_gap:.3f}")
        if matched is None:
            problems.append("no blind hand check (data/rating/rubric_scores/handcheck.json)")
        else:
            worst = max(matched.values())
            lines.append("  hand/rubric sd gap on the same places: "
                         + "  ".join(f"{c} {g:.2f}" for c, g in matched.items()))
            if worst >= MAX_SD_GAP:
                problems.append(f"hand/rubric sd gap {worst:.3f} >= {MAX_SD_GAP}")
    else:
        lines.append(f"  curated/fitted sd gap {sd_gap:.3f}")
        if sd_gap >= MAX_SD_GAP:
            problems.append(f"curated/fitted sd gap {sd_gap:.3f} >= {MAX_SD_GAP}")

    lines.append(f"  corr(score, log pop) {score_pop:+.3f}  "
                 f"corr(beauty, log pop) {beauty_pop:+.3f}")
    if abs(score_pop) >= MAX_SCORE_POP_CORR:
        problems.append(f"|corr(score, log pop)| {abs(score_pop):.3f} >= {MAX_SCORE_POP_CORR}")
    if abs(beauty_pop) >= max_beauty_pop:
        problems.append(f"|corr(beauty, log pop)| {abs(beauty_pop):.3f} >= {max_beauty_pop}")
    if ref_pinned:
        a_gap, a_sp, a_bp = all_stats
        lines.append(f"  (full catalogue, unasserted: gap {a_gap:.3f}  "
                     f"score-pop {a_sp:+.3f}  beauty-pop {a_bp:+.3f})")

    tier3 = report["split"]["all"]["tiers"]["3"]
    lines.append(f"  tier-3 count {tier3}")
    if v5:
        for cls in CLASSES:
            rows = [d["rating"]["score"] for d in _DESTS if d.get("rating") and _class(d) == cls]
            share = sum(s >= TOP_BAND for s in rows) / len(rows)
            lines.append(f"  {cls:8s} at {TOP_BAND}+: {share:.1%} of {len(rows)}")
            if not TOP_SHARE_RANGE[0] <= share <= TOP_SHARE_RANGE[1]:
                problems.append(f"{cls} share at {TOP_BAND}+ {share:.1%} outside "
                                f"{TOP_SHARE_RANGE[0]:.1%} to {TOP_SHARE_RANGE[1]:.0%}")
    elif not TIER3_RANGE[0] <= tier3 <= TIER3_RANGE[1]:
        problems.append(f"tier-3 count {tier3} outside {TIER3_RANGE}")

    if v5:
        reasons = {}
        if WHY_I18N.exists():
            reasons.update(json.loads(WHY_I18N.read_text(encoding="utf-8")))
        if RUBRIC.exists():
            reasons.update({k: v["why"] for k, v in
                            json.loads(RUBRIC.read_text(encoding="utf-8")).items()})
        rated = [d for d in _DESTS if d.get("rating")]
        no_conf = [d["id"] for d in rated
                   if d["rating"].get("confidence") not in ("curated", "rubric", "estimated")]
        no_why = [d["id"] for d in rated
                  if not all((reasons.get(d["id"]) or {}).get(lang) for lang in LANGS)]
        lines.append(f"  reasons in six languages {len(rated) - len(no_why)}/{len(rated)}, "
                     f"confidence {len(rated) - len(no_conf)}/{len(rated)}")
        if no_conf:
            problems.append(f"{len(no_conf)} rated places without a v5 confidence: {no_conf[:5]}")
        if no_why:
            problems.append(f"{len(no_why)} rated places without a six-language reason: {no_why[:5]}")
    if badges_exist:
        held = {c: v["n"] for c, v in report["countries"].items()}
        thin = {c: n for c, n in badged.items()
                if n < min(MIN_BADGED_PER_COUNTRY, held.get(c, 1))}
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


def test_anchor_curve_meets_the_contract():
    """Gate 3 on the curve itself, not only on the scores it last produced.

    T321: the frozen curve in reports/rating_calibration_anchors.json did not
    reproduce the catalogue it was frozen on, and nothing checked it, so the
    next rating run shipped a fitted SD of 0.706 against a curated 0.987.
    Published scores only change when the data lane re-scores, so a bad
    curve reached the wire before anything measured it. This test projects
    the input's fitted places through the stored curve (raw outputs rebuilt
    from the stored components, as rating_layer computes them) and asserts
    the same gap threshold on the same reference population, so a bad curve
    fails the moment it is committed, before any rating run uses it.
    """
    import calibration_anchors as anchors   # pipeline/diagnostics, on path

    data = anchors.load_wire(INPUT)
    model = data["meta"].get("rating_model") or {}
    # T759: under formula v5 every scored place carries a hand or rubric
    # appeal, so no place on the wire went through the fitted curve; it only
    # waits for an estimated newcomer.
    no_fitted = not any("appeal" not in ((d.get("rating") or {}).get("components") or {"appeal": 1})
                        for d in data["destinations"].values())
    if model.get("version") == BASELINE_MODEL or "fallback_fit" not in model or no_fitted:
        msg = "no fitted calibration in this input; curve check idle"
        if pytest:
            pytest.skip(msg)
        print("SKIP:", msg)
        return
    curves = anchors.stored_curves()
    fig = anchors.contract_figures(data, anchors.project(data, curves))
    print(f"stored curve projected on {INPUT.name}: curated sd "
          f"{fig['curated_sd']:.3f}  fitted sd {fig['fitted_sd']:.3f}  "
          f"gap {fig['gap']:.3f}")
    assert fig["gap"] < MAX_SD_GAP, (
        f"the stored calibration curve gives a curated/fitted sd gap of "
        f"{fig['gap']:.3f} >= {MAX_SD_GAP} on the reference population")


if __name__ == "__main__":
    test_rating_distribution()
    print("distribution assertions hold")
    test_anchor_curve_meets_the_contract()
    print("anchor curve meets the contract")
