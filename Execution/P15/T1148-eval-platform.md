# T1148: Eval platform, one runner and one results format (ROADMAP F6, round 2 session S64)

## Date

2026-11-06

## What changed

Every eval Carta has now runs through one runner and writes one results format. `node continent-app/scripts/eval/run.mjs` runs four evals as adapters and writes `carta-eval/1` results (status, gate, one headline share, flat metrics, cases, judge) to `data/reports/evals/` (`latest/<eval>.json` and `history.jsonl`); `--dashboard` writes `docs/reference/evals.md`, the page with each eval's latest score, gate and trend. The adapters: `ask` wraps S52's `runEval` and `gate` unchanged (same scores, same verdict, `ask-eval.mjs` and its workflow untouched), `trail-summaries` runs T1179's `check()` over the 2,089 top-band walks in memory, `data-quality` runs T1142's engine in check mode as a data eval, and `plan-day` is new. The plan-day eval has 20 cases built from real city decks (12 dossier highlights each, through the Edge Function's own `sanitizeCandidates`), a deterministic reference planner, and seven rule checks that score a plan on the walk the app really builds (the shipped `sanitizeAiStops` and `scheduleDay`). For the LLM judge it has a blind 40-plan calibration sample (20 reference plans, 20 with a planted fault; 22 pass the rules, 18 fail), a rubric, a session backend and a Gemini backend, and Cohen's kappa with a 95 percent interval for judge against human, rules against human and judge against rules. A blind session judge agreed with the rule checks at kappa 0.604 on rubric 1; the disagreements showed the rubric told the judge to walk the stops in the listed order with the deck's visit times, while the app re-orders the stops and uses the plan's own times. Rubric 2 says so, and the same blind judge then agreed at kappa 0.898 (0.760 to 1). The kappa against human labels waits for the owner's labels (tooling ready, `labels.json`). Langfuse is prepared for the box (compose file, `.env.example`, README), not installed. All four evals pass today.

## Research

A research subagent compared promptfoo, DeepEval, RAGAS, Langfuse datasets, OpenAI Evals style scripts and plain Node scripts with a shared schema (licence, language, wrapping the existing evals without changing scores, CI without a key, a Gemini judge, kappa support, weight, results and trend, lock-in). `langfuse.com` and `promptfoo.dev` were blocked from the session, so their facts come from search summaries.

| Option | Fits | Against |
|---|---|---|
| promptfoo (MIT, Node) | Gemini grader, `llm-rubric` | its own pass or fail model over our scores, heavy npm tree, no kappa |
| DeepEval (Apache 2.0, Python) | G-Eval | Python while three evals are Node; leans to its cloud; no kappa |
| RAGAS (Apache 2.0, Python) | RAG metrics | computes its own metrics, most need a model |
| Langfuse datasets | dashboard and trends | needs a running server, not a CI runner |
| Plain Node and a shared JSON schema | the existing scores stay exactly as they are, no key in CI, no new dependency, kappa in 40 lines | we write the judge call and the page ourselves |

Chosen: plain Node scripts with the `carta-eval/1` schema; Langfuse later as an importer of these results and the home of live traces (E4), promptfoo only if a viewer is ever wanted. Kappa: kappa = (p_o minus p_e) / (1 minus p_e), large-sample standard error; with 40 items the interval is about plus or minus 0.2 to 0.3, so it is always reported; Landis and Koch (1977) bands; the judge may gate from 0.61 and is advisory from 0.41 (common practice, not a standard); keep the sample balanced (the kappa paradox). Judge bias (Zheng et al. 2023; Panickssery et al. 2024): a rubric with explicit criteria against verbosity, temperature 0, a pinned model and rubric hash, and never the model that wrote the plans. Sources: https://langfuse.com/self-hosting/deployment/docker-compose, https://langfuse.com/docs/observability/sdk/typescript/setup, https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric, https://github.com/promptfoo/promptfoo, https://deepeval.com/docs/metrics-llm-evals, https://doi.org/10.2307/2529310, https://arxiv.org/abs/2306.05685, https://arxiv.org/abs/2404.13076. The judge in this session ran as a separate subagent that read only the rubric and the sample; the Claude API was never used.

## Files touched

- Created, `continent-app/scripts/eval/`: `run.mjs` (the runner and the page), `lib/results.mjs` (format, validation, writer, history), `lib/kappa.mjs`, `adapters/ask.mjs`, `adapters/trail-summaries.mjs`, `adapters/data-quality.mjs`, `adapters/plan-day.mjs`, `adapters/python.mjs`, `plan-day/plan-day-lib.mjs`, `plan-day/judge.mjs`, `plan-day/cases.json`, `plan-day/sample.json`, `plan-day/sample-key.json`, `plan-day/labels.json` (all null), `plan-day/rubric.md`, `plan-day/judgments/session-2026-11-06-rubric1.json`, `plan-day/judgments/session-2026-11-06-rubric2.json`, `langfuse/docker-compose.yml`, `langfuse/.env.example`, `langfuse/README.md`.
- Created: `continent-app/tests/evalPlatform.test.mjs` (9 tests), `data/reports/evals/latest/*.json` (4), `data/reports/evals/history.jsonl`, `docs/reference/evals.md` (the dashboard page), this report.
- Modified: `docs/HANDBOOK.md` (new section "Evals (one runner, one results format)" and its contents line), `ROADMAP.md` (F6 status), `Execution/_OPEN.md` (rows T1148-a to T1148-h appended).
- Not touched: `ask-eval.mjs`, `ask-eval-lib.mjs`, `ask-baseline.json`, `ask-set.json`, `.github/workflows/ask-eval.yml`, the AI call sites (`supabase/functions/plan-day/` is only imported, S53 works there), `pipeline/trails/summaries.py`, `scripts/quality/`.

## Commands run

```
git fetch origin && git checkout -b p15-s64-eval-platform origin/p15-round2
cd continent-app && npm ci
node -e "...buildCases(), buildSample()..."            # froze cases.json, sample.json, sample-key.json
# blind session judge (subagent, read rubric.md and sample.json only), rubric 1, then rubric 2
node scripts/eval/run.mjs --check                      # all four, CARTA_EVAL_OUT to a scratch folder
node scripts/eval/ask-eval.mjs --check                 # S52's gate: pass
node scripts/eval/ask-eval.mjs --seed-drop --check     # exit 1, "ask eval gate: FAIL"
node scripts/eval/run.mjs ask --seed-drop --check      # exit 1, "eval runner: FAIL in ask"
node scripts/eval/run.mjs --write --dashboard --check  # the first results and docs/reference/evals.md
npx eslint --no-ignore scripts/eval/run.mjs scripts/eval/lib/*.mjs scripts/eval/adapters/*.mjs scripts/eval/plan-day/*.mjs tests/evalPlatform.test.mjs
node --test tests/evalPlatform.test.mjs
npm test
cd .. && python -I scripts/docs/drift.py && python -I scripts/docs/check_entry_points.py
```

## Config and secrets set

None. New optional variables: `CARTA_EVAL_OUT` (results folder), `CARTA_PYTHON` (the Python the adapters call), `CARTA_JUDGE_MODEL` (Gemini judge model); the Gemini judge reads the existing `GEMINI_API_KEY`. The Langfuse `.env.example` holds placeholders only.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Evals that run through one runner and one results format | 0 of 3 (Ask, trail check, quality gate each with its own) | 4 of 4 (plus plan-day) | +4 |
| Ask gate through the runner | n/a | pass, same numbers as `ask-eval.mjs --check` (rules nDCG@10 0.6003, recall@10 0.5682) | scores unchanged |
| Ask seeded drop | exit 1 (ask-eval.mjs) | exit 1 in both ask-eval.mjs and run.mjs | unchanged |
| Trail summaries passing check(), top band | 2,089 of 2,089 (T1179) | 2,089 of 2,089 | 0 |
| Data quality rules met | 75 of 75 (T1142) | 75 of 75 | 0 |
| Plan-day eval cases | 0 | 20 (20 cities, 240 candidate places) | +20 |
| Reference plans meeting every rule | n/a | 20 of 20 | new |
| Calibration sample | none | 40 plans, 22 pass and 18 fail the rules | new |
| Session judge against rules, rubric 1 | n/a | kappa 0.604 (0.359 to 0.849), agreement 0.80 | new |
| Session judge against rules, rubric 2 | n/a | kappa 0.898 (0.760 to 1), agreement 0.95 | +0.294 |
| Judge against human labels | not measured | not measured (labels are T1148-a) | |
| Full run of all four evals | n/a | about 22 s (Ask 11 s, trails 5 s, quality 5 s, plan-day under 1 s) | new |
| `npm test` | 1,581 tests (the 1,590 minus the 9 new) | 1,590 tests: 1,578 pass, 0 fail, 12 skipped | +9 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 5 of 20 reference plans failed the rules on the first build | Decks hold few "active" places, packed days used museum-length visits, Lanzarote (ACE) is an island, not a walking day | The vibe rule asks for half the free picks or as many as the deck holds; packed visits cap at 45 minutes; ACE and AAL (7 highlights) swapped for Tallinn and Porto |
| Judge and rules disagreed on 8 of 40 plans (kappa 0.604) | Rubric 1 told the judge to walk the listed order with the deck's visit times; the app re-orders stops (2-opt) and uses the plan's own times. p11: 19.9 km in listed order, 8.1 km as the app walks it | Rubric 2 describes what the app does; the old verdicts are kept as `session-2026-11-06-rubric1.json`, and a verdict on an old rubric is flagged by its hash |
| The judge's file named a model | The subagent wrote its model name | Replaced by "session judge (Claude Code subagent, blind to the key)": no model identifier goes into the repo |
| A sparkline drew one bar for a single run | `spark()` of one value | The page says "one run so far" until there are two |

Gotcha: rubric 2's 0.898 is agreement between two machine readers that now share the same picture of the app. It shows the rubric is unambiguous, not that it matches a traveller's judgement; only the hand labels say that. The rule checks are also not ground truth: two "subtle" plans fail the vibe rule while the judge passes them, a case for the owner's labels to settle.

## Screens checked

None. No traveller screen changed; the dashboard is a generated Markdown page in `docs/reference/` (read in the terminal and checked by the test for its table and the absence of dashes).

## What is still open

- T1148-a (user): hand-label the 40 plans; the judge cannot gate before its kappa against a human is known.
- T1148-b (user): install Langfuse on the box from the prepared folder.
- T1148-c (next task): move plan-day's prompt into `logic.mjs` after S53, so the eval can generate and score live model plans.
- T1148-d (next task): a workflow that runs `run.mjs --check` for the three evals without one (`.github/` was outside the brief).
- T1148-e (user): run the Gemini judge on the pipeline key.
- T1148-f (next task): T1136-e is done by this page; move it to `_OPEN-CLOSED.md` (this task appends only).
- T1148-g (next task): `docs/reference/README.md` still says the folder is empty.
- T1148-h (next task): post results to Langfuse once it runs.

## Rollback procedure

`git revert` of the T1148 commit. Nothing is one-way: no data, migration, deploy or AI call site was touched; the results folder and the page are generated.

## Owner steps (for the checklist)

- [T1148-a] Label the plan-day calibration sample | the LLM judge needs a kappa against a human before it may gate | open `continent-app/scripts/eval/plan-day/sample.json` and `rubric.md`, and for each of the 40 plans write "pass" or "fail" in `labels.json` (would a careful local friend hand this plan over as it is?); do not open `sample-key.json`; fill `by` and `at`; then `cd continent-app && node scripts/eval/run.mjs plan-day --write --dashboard` and commit `labels.json`, `data/reports/evals/` and `docs/reference/evals.md` | continent-app/scripts/eval/plan-day/labels.json
- [T1148-b] Install Langfuse on the build box | tracing for E4 and a home for eval runs | follow `continent-app/scripts/eval/langfuse/README.md`: compare the compose file with the official one, pin digests, fill `.env` from `.env.example`, `docker compose up -d`, open over an SSH tunnel | continent-app/scripts/eval/langfuse/README.md
- [T1148-e] Run the Gemini judge once | a second judge to compare with the session judge | on a machine with the pipeline's `GEMINI_API_KEY`: `cd continent-app && CARTA_JUDGE_MODEL=<a model outside plan-day's chain> node scripts/eval/plan-day/judge.mjs --backend gemini`, then `node scripts/eval/run.mjs plan-day --write --dashboard`, commit `judgments/` and the results | continent-app/scripts/eval/plan-day/judge.mjs
