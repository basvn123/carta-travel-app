# T1144: Truth set, hand-verified answers scored per release (ROADMAP D4, round 2 session S60)

## Date

2026-11-06

## What changed

Carta now has a truth set. `evals/truth/build_sample.py` draws a stratified, seeded sample of 150 items from the shipped data in `continent-app/public`: 100 places, 25 rated walks, 13 rated beaches and 12 rated lakes. It writes `sample.json` (each item with its stratum and weight) and `sheet.csv`, the hand-verification sheet: 762 rows, one per item and field, with the snapshot value, a source to check and empty answer columns. `evals/truth/GUIDE.md` tells the owner how to fill the sheet; `fields.json` sets each field's meaning, answer format and tolerance.

The build seeds 90 answers from cited source fields already in the repo, with status `seeded`: the OSM relation's own `distance`, `ascent` and `roundtrip` tags for trails, and the country of each place's point (and 5 km around it) in the shipped country shapes. The other 637 rows wait for the owner, and 35 are `skip` because no text is shipped.

`evals/run_truth.py` scores the current wire against the answers. It reports the share right with a 95 percent Wilson interval, per kind, per field and per status, plus a stratum-weighted share per kind. It also lists the rows the data gets wrong. The gate is the lower Wilson bound of `baseline.json`. It gates once 80 percent of the sheet is verified by hand and is advisory before that.

The eval runner runs the truth set as the `truth` eval (`continent-app/scripts/eval/adapters/truth.mjs`, one line in `run.mjs`). `--seed-drop` there, or `--seed-wrong` in the script, plants one wrong value in memory, and the score falls.

The text check is in `evals/truth/judge/`. It has a 50-text calibration set: 25 place blurbs against their cited Wikivoyage text and 25 trail summaries against their OSM facts. A fault is planted in 20 of them, listed in a key file that labellers do not open. It also has a claim-level rubric (`rubric.md`), an empty `labels.json` for the owner, and `judge.mjs`. The judge runs as a session judge (prompts written to a folder, verdicts written by hand) or as Gemini through the model gateway (`aiModels.mjs`, feature `eval-judge`). `--fixtures` runs the Gemini path end to end on four fixture texts with recorded answers and no network.

A blind session judge, a subagent that read only the 50 prompt files, wrote the first verdicts file. It caught all 20 planted faults. Of the shipped texts, it found 0 of 15 place blurbs and 10 of 15 trail summaries supported by the source they cite. The Claude API and the Anthropic SDKs are not used anywhere.

## Research

A research subagent compared the options for the four choices in this task. Its access to ai.google.dev was blocked, so it could not confirm current Gemini model ids; the judge therefore takes the gateway's `eval-judge` chain or `--model`, and the owner pins it.

| Choice | Options compared | Chosen and why |
|---|---|---|
| Sheet format | CSV, JSONL, YAML, Google Sheets, Label Studio or Argilla | Long-format CSV, one row per item and field: one-line git diffs, opens in any spreadsheet, standard-library reader. YAML needs PyYAML and breaks by hand; Sheets cannot be diffed; labelling servers are far more than 150 items need. |
| Sampling | proportional, equal, Neyman allocation; random against hash-ordered | Proportional with a floor per stratum (3 places, 2 trails, 1 water), largest remainder, weight per item; items in a stratum ordered by sha256(seed and id), so the draw is reproducible and stable as data is added. Neyman needs error variances we do not have yet. |
| Scoring | exact against tolerant, plain against weighted, how to treat missing answers | Relative and absolute tolerances per numeric field, haversine distance for coordinates, folded exact match for names and classes, verdicts for text; Wilson interval (about 83 to 94 percent at 90 of 100); unverified rows leave the denominator and coverage is reported apart. |
| Text judge | FActScore claim splitting, RAGAS faithfulness, G-Eval rubric scores, TRUE or AlignScore, MiniCheck | Claim splitting as a plain prompt and verdict file, no library: RAGAS adds a heavy dependency, G-Eval scores drift, the NLI models (MiniCheck is the best offline one) bring torch and a model download. Gemini Flash tier for the model judge, Pro only for disagreements. Kappa calibration on 50 human labels, Landis and Koch bands, gate from 0.61 and advisory from 0.41 (as T1148), with a balanced sample (20 planted faults) against the kappa paradox. |

Sources: https://en.wikipedia.org/wiki/Stratified_sampling, https://en.wikipedia.org/wiki/Neyman_allocation, https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval, https://github.com/shmsw25/FActScore, https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/, https://arxiv.org/abs/2303.16634, https://arxiv.org/abs/2204.04991, https://github.com/yuh-zha/AlignScore, https://github.com/Liyan06/MiniCheck, https://arxiv.org/abs/2404.10774, https://llm-aggrefact.github.io/, https://en.wikipedia.org/wiki/Cohen%27s_kappa, https://pubmed.ncbi.nlm.nih.gov/843571/.

## Files touched

- Created: `evals/run_truth.py`, `evals/truth/build_sample.py`, `evals/truth/fields.json`, `evals/truth/sample.json`, `evals/truth/sheet.csv`, `evals/truth/baseline.json`, `evals/truth/GUIDE.md`, `evals/truth/judge/rubric.md`, `judge-lib.mjs`, `judge.mjs`, `text-sample.json`, `text-sample-key.json`, `labels.json` (all null), `judgments/session-2026-11-06-rubric1.json`, `fixtures/fixture-sample.json`, `fixtures/fixture-answers.json`; `continent-app/scripts/eval/adapters/truth.mjs`; tests `tests/test_truth_set.py` (32 cases) and `continent-app/tests/truthEval.test.mjs` (5 tests); this report.
- Modified: `continent-app/scripts/eval/run.mjs` (`truth` in `EVALS`, its kind, two comment lines), `continent-app/tests/evalPlatform.test.mjs` (the pinned `EVALS` list), `docs/HANDBOOK.md` (new section "Truth set (hand-verified answers, scored per release)" and its contents line), `ROADMAP.md` (D4 status), `Execution/_OPEN.md` (rows T1144-a to T1144-h appended).
- Not touched: the files owned by S54, S55, S62 and S99; `pipeline/ai_gateway.py` (it has no eval feature, so the judge uses the Node gateway's `eval-judge`); `prompts/`; `data/reports/evals/` and `docs/reference/evals.md` (T1144-h).

## Commands run

```
git fetch origin && git checkout -b p15-s60-truth-set origin/p15-round2
python -I evals/truth/build_sample.py                  # sample, sheet, text sample and key
python -I evals/truth/build_sample.py --check          # sample unchanged on a rebuild
python -I evals/run_truth.py ; python -I evals/run_truth.py --seed-wrong
python -I evals/run_truth.py --write-baseline
node evals/truth/judge/judge.mjs --fixtures            # 4 of 4 as expected
node evals/truth/judge/judge.mjs --prompts <scratch>   # 50 prompts, rubric e3997722b64c
# blind session judge (subagent, read only the 50 prompt files), wrote judgments/session-2026-11-06-rubric1.json
cd continent-app && node scripts/eval/run.mjs truth ; node scripts/eval/run.mjs truth --seed-drop
npx eslint --no-ignore scripts/eval/run.mjs scripts/eval/adapters/truth.mjs tests/truthEval.test.mjs   # plus the two judge files through --stdin
node --test tests/truthEval.test.mjs tests/evalPlatform.test.mjs
npm test
cd .. && ruff check evals tests/test_truth_set.py && python -m pytest -q tests/test_truth_set.py tests/test_docs_drift.py tests/test_docs_reference.py
python -I scripts/docs/drift.py
```

## Config and secrets set

None. The Gemini judge reads the existing `GEMINI_API_KEY` and the gateway's `AI_EVAL_JUDGE_MODELS` (or `--model`, `CARTA_JUDGE_MODEL`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Truth set items | 0 | 150 (100 places in 15 strata, 25 trails in 9, 13 beaches and 12 lakes in 5 each) | +150 |
| Sheet rows | 0 | 762 (90 seeded, 637 unverified, 35 skip, 0 verified) | +762 |
| Truth score | none | 95.6% of 90 answered rows (Wilson 89.1% to 98.3%); places country 67 of 67, trails 19 of 23 (distance 9 of 11, ascent 3 of 5, loop 7 of 7) | new |
| Seeded wrong value | n/a | 95.6% to 94.4% (85 of 90), in the script, the runner and both tests | falls as required |
| Country seeds | 86 seeds, 1 wrong (Goriska Brda: shape says IT, the place is in SI) | 67 seeds with the 5 km border buffer, 0 wrong | wrong seeds 1 to 0 |
| Judge harness on fixtures | n/a | 4 of 4 verdicts as expected, through `callModel` with a recorded fetch | new |
| Session judge on the 50 texts | n/a | planted faults caught 20 of 20; shipped texts supported 10 of 30 (blurbs 0 of 15, trail summaries 10 of 15) | new |
| Judge kappa against a human | n/a | n/a, labels are an owner step (T1144-b) | not measured |
| Evals in the runner | 6 | 7 | +1 |
| `npm test` | 1,674 tests | 1,679 tests, 0 failures | +5 |
| pytest, new file | 0 | 32 passed | +32 |
| Docs drift | 0 drift | 0 drift | unchanged |

## What broke and how it was fixed

- The first country seeds used the plain point in the simplified country shapes. Goriska Brda (SI) fell into the IT shape. Fix: a seed now needs the point and four points about 5 km around it to land in the same shape. That removed 19 border seeds and the wrong one.
- Six of the 25 sampled walks ship no summary. Those sheet rows are `skip`, and the text sample tops the trail half up from other rated walks, ordered by hash.
- The runner's printer expects plan-day's three agreement pairs. The truth adapter gives the two rule pairs as empty kappas with a note, so `run.mjs` stays unchanged apart from its one line.
- ESLint ignores files outside `continent-app/`. The two judge files were linted through `--stdin` with an app path.

## Screens checked

None. No traveller screen changed.

## What is still open

- T1144-a (user): verify the sheet by hand and move the baseline.
- T1144-b (user): label the 50 texts so the judge gets a kappa.
- T1144-c (user): run the Gemini judge once.
- T1144-d (next task): register `rubric.md` in the prompt registry.
- T1144-e (user): decide what to do about the place blurbs. The session judge found none of 15 supported by the Wikivoyage text they cite (`guide.url`). They may be true, but the cited source does not back them.
- T1144-f (next task): 5 of 15 shipped trail summaries are not supported by their OSM facts. Examples: "waymarked" without a symbol or ref, the DIN 33466 hours line, and raw tag figures that differ from Carta's.
- T1144-g (next task): four seeded trail rows differ from their OSM tags beyond tolerance. 64188 has 16.6 km against 15, 9022 has 8.2 km against 9.19, 195651 has an ascent of 566 m against 450, and 74625 has 227 m against 305.
- T1144-h (next task): write the truth eval to the results folder and the dashboard. Close T1187-g once the judge is calibrated.
- Dashes: the sheet and the samples quote shipped trail names and texts that hold en dashes (for example a Hydra trail name). They are data and were left as they are.

## Rollback procedure

`git revert` of the T1144 commit. Nothing is one-way: no shipped data, migration, deploy or AI call site changed, and the sample and sheet can be rebuilt from the wire with the fixed seed.

## Owner steps (for the checklist)

- [T1144-a] Verify the truth set by hand | the score now rests on 90 seeded rows that share the data's own sources; only hand answers measure accuracy, and the eval gates from 80 percent verified | open `evals/truth/sheet.csv` in a spreadsheet and follow `evals/truth/GUIDE.md` row by row (look up first, then fill verified_value, status verified, source_url, evidence, by, verified_on); confirm or correct the seeded rows; run `python -I evals/run_truth.py`, then `python -I evals/run_truth.py --write-baseline` and commit the sheet and baseline | evals/truth/GUIDE.md
- [T1144-b] Label the 50 texts for the judge | the text judge may not gate until its kappa against a human is known | read `evals/truth/judge/rubric.md`; for t01 to t50 in `text-sample.json` write supported, unsupported or contradicted in `labels.json` (do not open `text-sample-key.json`); fill by and at; run `cd continent-app && node scripts/eval/run.mjs truth` and commit `labels.json` | evals/truth/judge/labels.json
- [T1144-c] Run the Gemini text judge once | a second judge to compare with the blind session judge | on a machine with the pipeline's `GEMINI_API_KEY`: `node evals/truth/judge/judge.mjs --backend gemini --model <a pinned Flash model>`; then `cd continent-app && node scripts/eval/run.mjs truth`; commit `evals/truth/judge/judgments/` | evals/truth/judge/judge.mjs
- [T1144-e] Decide the rule for place blurbs and their cited source | the judge found none of 15 shipped blurbs backed by the Wikivoyage text they cite, so the page cites a source that does not carry its claims | read the 15 shipped blurb verdicts in `evals/truth/judge/judgments/session-2026-11-06-rubric1.json`; choose one: cite the source that backs each blurb, rewrite blurbs from the cited text, or drop the citation; record the choice as a task | Execution/P15/T1144-truth-set.md
