# explore-v4 changelog

Working log for the Explore rebuild and rating_v4 (PLAN.md). One entry per
phase: steps completed, measured numbers, decisions taken along the way.

## Phase 1 - Measure (A1, E1, E2, B5) - 2026-09-03

**Steps.** A1 rating audit + frozen v3 baseline; E1 golden order set;
E2 distribution contract in CI; B5 coverage report with register ratchet.

**Measured.** The audit reproduces every Part 0 figure exactly: highlights
modal share 0.8720 (2,649 of 3,038 at h=0.909), appeal contribution to score
SD 0.7503, fitted SD 0.6152, curated SD 0.9502. Golden set: rating_v3 passes
111 of 120 pairs; the nine failures are the improvement budget. Coverage:
thinnest appeal curation is Netherlands 27%, Sweden 30%, Germany 30%.

**Beyond PLAN.md's figures.** corr(score, log population) measures +0.111 on
the shipped catalogue - the -0.02 recorded in rating_layer.py's docstring no
longer holds at 3,038 destinations, and v3 would fail its own size-fairness
claim under the E2 contract. Acclaim's modal share is 0.627 (the no-designation
zero), a second violation of the 40% rule PLAN.md did not call out.

**Decisions.**
- Branched `explore-v4` from `map-transport-glyphs` HEAD, not `main`: main is
  142 commits stale and is itself a deploy-merge of an older state of this
  branch; the plan's target files differ heavily between the two, and the
  figures in PLAN.md were produced by this branch's catalogue.
- E1 delivers 120 *pairs* (over 173 destinations, all five kinds, 34
  countries), matching the checkpoint's "120 golden pairs" reading of the step.
- E2 gates on the model tag: it measures and skips under rating_v3, and
  enforces from the commit that stamps rating_v4 (A5). The country-badge
  assertion arms itself when A6 first publishes the field.
- B5's ratchet locks per-country *held* register counts; true membership
  denominators (coverage as a percentage of the register) arrive with B3.
- Every pipeline path PLAN.md names existed as described; no path corrections
  were needed.
