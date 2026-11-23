# Report: logic wave 0b, quick wins, golden harness and engine flags

Status: done · 2026-11-23 · L2 light wave (round 2, quota wave 1 of 4) · branch `p15-fix-logic`, merged into `p15-fix-programs`.

Every remaining app quick win of the logic audit is fixed with a test or proven moot on HEAD. Each later engine wave can now show its effect as a measured, switchable diff: an engine golden harness on the one eval runner (G1) and per-engine flags with a shadow diff script (G7). A fresh judge failed the first build on three lines (guard allowlist, docs, DOM check); after the fixes a second fresh judge scored every line 4 (`judgement-4.md`).

## The question (G12)
Can every logic engine wave from here show its effect as a measured, switchable diff? Yes: `node scripts/eval/run.mjs logic-engines --check` gates 59 current cases (all pass) and reports 29 target cases the engine waves close; `config/flags.json` holds E1 to E10 at `old`.

## What changed
- **G7 flags:** `continent-app/src/lib/flags.js`, `continent-app/config/flags.json`, `continent-app/scripts/eval/shadow-diff.mjs`, `continent-app/tests/flags.test.mjs`.
- **G1 harness:** `continent-app/scripts/eval/adapters/logic-engines.mjs`, one line each in `continent-app/scripts/eval/run.mjs` (FYI to ai in `RUN/requests.md`), golden sets in `continent-app/tests/fixtures/logic-golden/` (month fit, rank with P@k and nDCG@k, day feasibility; 60-place fixture). Slices in `slices.md` (worst: persona ski, 0 of 5); error analysis in `errors.md` (biggest group: a fine month missing from `climate.best`, fixed by E5).
- **RC16 guard over all of `lib/`:** euro numbers moved into `continent-app/config/pricing.json` (`budget.search`, `transport.value_of_time`, `alerts.drop_min_eur`, `trips.plan_nudge_min_eur`, `ask.budget_steps`, `months.price_band`); 22 rule numbers left on the allowlist, each tagged with the engine wave that moves it.
- **Parity tests PT-E1 to PT-E10** as `todo` (36 todo, 2 already passing made plain).
- **Quick wins:** B-17, B-16, A-18, A-21, H-3, H-9, H-11, H-12, H-14, E-10, E-12, E-6, F-6, F-9, F-10, F-16, G-20, G-10, G-16/J-13 pull half, D-7, C-15, I-11 name half, I-14, I-16, E-15, A-14 screen half, REQ-ai-1. Moot with evidence: A-8 (regression test added), REQ-orch-1 (date already pinned). G-12 half: `handleLoadTrip` is live, only `handleSaveTrip` deleted.
- **Screens:** one new string `when.hotOnly` in six languages; `design-check.md`; `continent-app/scripts/verify_logic_0b.mjs` 19/19 at 390, 820, 1440 and a sweep (`verify-logic-0b.out.txt`).
- **Docs:** `docs/HANDBOOK.md` (logic engines section, For you offer, rating tie order, Hot in), `docs/logic/` PRICE-048, REC-039, RATING-029, `ROADMAP.md` G4, D10, G12, `docs/owner/product-decisions.md` defaults 2, 7, 10, `docs/reference/config.md`.
- The full per-row table and every changed file: `changes.md`.

## Checks
- Touched test files pass locally (judge: 115 pass, 0 fail on the first build; 56 pass, 8 todo on the fix files). `logic-engines --check` pass. eslint clean. Fast build OK. Entry points OK, drift 0, config reference OK.
- GitHub CI run 45092807560 on `6f89bc9a61`: only baseline failures (design-lint motion-literal from main; data-owned pytest: 5 `DCACHE` launch-gate errors and the `stays` reference snapshot, sent to data in `RUN/requests.md`).
- Not run: the full `npm test` locally (over 2 hours on this machine); CI ran it.

## Deviations
- The first build's docs landed in a separate commit (`46efa3609e`); the fix commits keep docs with code.
- The builder edited a comment in the protected `.github/workflows/ci.yml`; I restored it before any commit.
- Merge of `origin/main`: decision record `0013-ai-cheapest-layer-first.md` renumbered to `0016`.

## Undo
`git revert` the wave commits `fa66ee39c0..6f89bc9a61` (10 commits), or revert the merge commit on `p15-fix-programs`. No migration, no data change.

## Next step
Wave 2: W1, E1 honest totals and E10 entitlement, with G11 idempotency.
