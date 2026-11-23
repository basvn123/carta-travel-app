# Run report · AI fix program wave 2: eval statistics, planted errors and the any-question eval (E1)
Status: built on p15-fix-ai (bb9232529b, judge fixes 5d20f677fb), judged by the program session before merge. Items A2 (part 1) and A2q. Source: north-star decision 7.1 and 7.3 (E-plant), RUN programs.md (any kind of question), guide gaps G2, G4, G5, G9, G12.

## Result
Carta now measures how Ask handles 14 kinds of question offline. On 326 drafted cases the rules path is accurate 55.2%, kept 84.0% and graceful 84.4% (graceful is type-aware after judge 1). It never refuses a harmful request (0 of 24, at most 12.5% by the rule of three). Out-of-scope questions are graceful in only 10.7% of cases. Places Carta lacks mostly get "isn't in it yet" or are called outside Europe, never with a nearest covered place (accurate 0 of 22). The biggest root causes (no refusal path 24, outside place not recognised 20, day counts not read as a plan 19, lacking place called outside Europe 19) are wave 3's targets. Details: `baseline.md`, `errors.md` in this folder.

## What changed
- `continent-app/scripts/eval/lib/stats.mjs`: seeded paired bootstrap, non-inferiority, cluster bootstrap, Wilson, rule of three, planned n (470 at q 0.15, 5 points). A seeded 10-point loss fails; an identical pair passes.
- `continent-app/scripts/eval/lib/results.mjs`: optional per-case `cases.items`, written to `latest/<eval>.cases.jsonl`, never into history.
- `continent-app/scripts/eval/planted/plant.mjs`: the six E-plant kinds, deterministic by seed (4,039 plants over 297 packs). Scoring the verifier on them is wave A3.
- `evals/any-question/set.json`, `build_set.mjs`, `README.md`: 326 cases (5 covered places relabelled after judge 1; the builder now refuses a lacking name that matches any destination or member), 14 types with at least 20 each, six languages, 11 six-language and 10 two-country counterfactual groups; every label a draft (G2).
- `continent-app/scripts/eval/adapters/any-question.mjs`, `any-question-lib.mjs`, `any-question-report.mjs`, `any-question-sheet.mjs`; `run.mjs` lists `any-question` (not gated this wave).
- `continent-app/scripts/eval/ask-eval.mjs`: `offlineKit`, `catalogueAvailable`, `CARTA_PUBLIC`; the Ask eval gives the same numbers before and after (rules nDCG@10 0.6026, recall@10 0.5717; `ask-before.txt`, `ask-after.txt`).
- Tests: `continent-app/tests/evalStats.test.mjs`, `evalPlanted.test.mjs`, `anyQuestion.test.mjs`, `anyQuestionSheet.test.mjs`; `evalPlatform.test.mjs` EVALS list.
- Docs: `docs/HANDBOOK.md` (Ask eval, Evals), `docs/reference/evals.md`, `ROADMAP.md` E1, `docs/owner/ai.md` AI-11 (owner verifies a 50-row sample; kappa).

## Checks
Targeted tests 54 pass; lint 0 errors; docs checks pass; full suite in CI (see judgement).

## Undo
`git revert 5d20f677fb bb9232529b`. No data, schema or migration change.
