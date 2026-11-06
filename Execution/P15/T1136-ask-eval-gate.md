# T1136: Ask eval gate (ROADMAP E1, round 2 session S52)

## Date

2026-11-06.

## What changed

Ask now has a score, and a change that lowers it cannot pass CI. `continent-app/scripts/eval/ask-set.json` holds 200 labelled questions in six languages: the 140 of the golden set, 30 written from the pipeline's multilingual `MULTI` set, and 30 that must get "Carta does not know". 142 carry expected places and every in-scope one carries expected facts. `scripts/eval/ask-eval.mjs` runs each question through the real Ask code once per retriever (rules, BM25, and dense and hybrid where the index is built). It writes one score file per run: recall@5 and @10, hit@10, MRR and nDCG@10 for the cards and for the retriever's own list, grounding (the share of fact checks that pass) and abstention. `--check` fails when a gated number falls more than 2 points under `scripts/eval/ask-baseline.json`. `.github/workflows/ask-eval.yml` runs on every push and pull request that touches Ask. It needs no secret and no model, and it first proves that a seeded drop fails. Before: 5 golden questions had expected places (rules-only recall 3 of 5) and nothing gated retrieval. After: rules recall@10 0.568, MRR 0.828, nDCG@10 0.600; BM25 recall@10 0.569; grounding 0.996; abstention 0.965. A seeded drop takes recall@10 to 0.332 and fails the gate. The run also found four real Ask defects, logged as register rows.

## Research

None chosen in this session. The metric set follows the ROADMAP E1 item: recall@5 and @10, MRR and nDCG@10, the standard BEIR set, with binary relevance. Reading the E-R1 research (RAGAS, DeepEval, promptfoo) is still its own item. Grounding is measured deterministically: labelled facts must reach the cards and the notes the model gets. No model judges anything, so CI runs without a key. The optional model-judged part stays `scripts/ask-eval-live.mjs` (Workers AI, manual). The Claude API is never used.

## Files touched

- `continent-app/scripts/eval/ask-set.json` (new): the 200 questions.
- `continent-app/scripts/eval/ask-eval.mjs` (new): the runner.
- `continent-app/scripts/eval/ask-eval-lib.mjs` (new): metrics, grounding checks, summary, gate.
- `continent-app/scripts/eval/ask-baseline.json` (new): the blessed baseline.
- `continent-app/tests/askEval.test.mjs` (new): set shape, metric arithmetic, gate rules, and a seeded drop on the real catalogue.
- `.github/workflows/ask-eval.yml` (new).
- `docs/HANDBOOK.md`: Ask section, item 12 and two Limits lines.
- `ROADMAP.md`: E1 status.
- `Execution/_OPEN.md`: rows T1136-a to T1136-g appended.
- `Execution/P15/T1136-ask-eval-gate.md` (this report).

## Commands run

From `continent-app/`:

- `npm ci`
- `node scripts/eval/ask-eval.mjs --verbose` (first scores and labelling misses)
- `node scripts/eval/ask-eval.mjs --dump g045,...` (the notes for about and when questions, used to write `notes` facts)
- `node scripts/eval/ask-eval.mjs --bless`
- `node scripts/eval/ask-eval.mjs --check` (pass)
- `node scripts/eval/ask-eval.mjs --seed-drop --check` (FAIL, exit 1)
- `npx eslint --no-ignore scripts/eval/*.mjs` (clean; `scripts/` is ignored by the repo's lint config)
- `npm test` (1577 tests: 1565 pass, 0 fail, 12 skipped)

The workflow was also replayed in a sparse clone with the job's exact cone list: unit checks, self-test and gate all pass. That replay is what found the missing `continent-app/config`.

## Config and secrets set

None. The workflow reads no secret.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Labelled Ask questions with expected places | 5 (golden `expectAny`) | 142 (of 200; 30 abstain, 28 facts only) | +137 |
| Out-of-scope questions in a set | 0 | 30 | +30 |
| rules: recall@5 / recall@10 / hit@10 / MRR / nDCG@10 | rules-only recall 3/5 on 5 cases | 0.579 / 0.568 / 0.930 / 0.828 / 0.600 | new |
| bm25 (rebuilt): recall@10 / MRR / nDCG@10, cards | not measured | 0.569 / 0.802 / 0.596 | new |
| bm25 own list: recall@10 / MRR | not measured | 0.323 / 0.360 | new |
| Grounding (689 checks) | not measured | 0.996 (3 checks fail) | new |
| Abstention: caught / false refusals / correct | not measured | 25 of 30 / 2 / 0.965 | new |
| Seeded drop: rules recall@10 | not applicable | 0.568 to 0.332, gate FAIL | -23.6 points |
| Gate tolerance | none | 2 points absolute on each gated number | new |
| Runtime, full run (rules + bm25) | none | about 11 s | new |
| `npm test` | 1571 tests (the 1577 minus the 6 new) | 1577 tests: 1565 pass, 0 fail, 12 skipped | +6 tests |

Dense and hybrid: not measured. The index is not in this container or in git (T1136-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `tests/priceSources.test.mjs` failed | The runner priced places with `computeCosts`, and the rule allows prices only from the engine | Uses `priceDays` from `src/lib/price/` like `ask-eval-live.mjs`; scores unchanged |
| Sparse CI replay crashed on load | `src/lib/rating.js` imports `continent-app/config/rating.json` | `continent-app/config` added to the job's cone list |
| A crash on load also exits 1, which would have passed the seeded-drop self-test | Node exits 1 on an import error, the same code as a gate failure | The self-test checks for exit 1 and the line `ask eval gate: FAIL` |
| The step summary would show FAIL for the self-test | The runner wrote the summary on every `--check` | No summary on a seeded drop |

Gotcha: a shipped `bm25.json` (main checkout, after `ask_index`) and the index rebuilt in CI give different BM25 numbers. The gate skips the sparse keys when the baseline and the run used different indexes, and the baseline records which one it used (`"bm25": "rebuilt"`). Bless in CI's setup, or after T1136-a with the full index on purpose.

## Screens checked

None. No screen changed (eval files, a workflow and docs only).

## What is still open

- T1136-a: dense and hybrid have no baseline until someone runs the eval with the index built (owner's main checkout).
- T1136-b: `outside.js` reads the German "den" as a place outside Europe. Two in-scope questions are refused.
- T1136-c: 5 of 30 out-of-scope questions get a Europe answer. "New York" is answered as York, England.
- T1136-d: two about and when answers never pass the car fact or the cheapest months to the model.
- T1136-e: the `docs/reference/evals.md` results page ROADMAP names was not in this brief's file list.
- T1136-f: weak spots for E2 to beat: the quiet lake village question in five languages, and warm in late October.
- T1136-g: the place labels deserve an owner read.

The eval measures these defects but does not fix them (outside this brief's files). Each fix that moves a number re-blesses the baseline in its own commit.

## Rollback procedure

`git revert` of the T1136 commit. Nothing is one-way: no data, migration or deploy was touched.

## Owner steps (for the checklist)

- [T1136-a] Bless the dense and hybrid baseline | the Ask index (`public/search/ask/`, about 50 MB) is not in git or in the cloud container | in the main checkout, with `python run_pipeline.py ask_index` already run, `cd continent-app && node scripts/eval/ask-eval.mjs --bless`, then commit `scripts/eval/ask-baseline.json`. Note that the BM25 numbers then come from the shipped index, and CI skips them against a rebuilt run | continent-app/scripts/eval/ask-baseline.json
- [T1136-g] Read the place labels | the labels were written by one session from general knowledge | open `continent-app/scripts/eval/ask-set.json` and check that the places listed for each question are the ones a traveller would expect; change or add ids, then run `--bless` | continent-app/scripts/eval/ask-set.json
