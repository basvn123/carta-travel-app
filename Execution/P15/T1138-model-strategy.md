# T1138: Model strategy, cost and quality per AI feature, the box behind an eval gate (ROADMAP E7, round 2 session S54)

Branch `p15-s54-model-strategy` from `origin/p15-round2`. Builds on T1135 (E-R3 research), T1136 (E1 Ask eval), T1137 (E3 gateway), T1148 (F6 eval platform), T1149 (taxonomy eval) and the T563 live Ask run.

## Date

2026-11-06

## What changed

Every Carta AI feature now has a recorded cost per 1,000 calls and a quality entry for three to five options, in one config, `continent-app/config/ai_models.json`, explained on `docs/ai/model-strategy.md`. The eight features are Ask, plan-day, suggest-city and parse-booking (live), plus intros, tagging, summaries and blog drafts (batch). That makes 32 options. Each cost comes from a stated formula, and a test recomputes all of them; they reproduce E-R3's figures. 6 of the 32 quality entries are measured:
- Ask on Workers AI Qwen3-30B-A3B: 88.7 percent of sentences kept (T563).
- Ask on device: 1 of 9 sentences (T564, one question).
- The no-model answers: Ask grounding 0.996 (E1), the plan-day reference planner 20 of 20, trail summary templates 2,089 of 2,089, and today's tags at micro F1 0.431 on the 15-item seed set.

The other 26 are owner runs. Each has its exact command, or names the missing eval that blocks it (suggest-city, parse-booking, intros, blog) or the missing recorder (plan-day).

Nine switch triggers are now config, each with its metric, threshold, window, action and owner: monthly users, cost per day, quality drop over 2 points, grounded searches, price changes. They are reviewed monthly.

The Python gateway has a new provider, `box`: llama.cpp's OpenAI-compatible server on the build box's CPU (Qwen3-30B-A3B Q4_K_M, no key, CPU timings). A batch job may select it with `AI_<JOB>_PROVIDER=box` only once it is listed in `BOX_PASSED` with its eval score; otherwise it is refused as `box_not_passed`. `parking` can never select it (it needs Google Search), and live features cannot reach it. `BOX_PASSED` is empty, so nothing moved.

The table also found that the pipeline's Gemini chain starts on the thinking model `gemini-flash-latest`. That puts a full intros run at about EUR 7.57 against EUR 1.27 on Flash-Lite batch, which E-R3 had assumed (T1138-f).

No default provider changed: Ask stays on Workers AI, everything else on Gemini.

## Research

The ROADMAP research row for this item is E-R3, done by T1135 (`docs/research/E-R3-models-and-hosting.md`). CLAUDE.md says that row is the research, so no new subagent was run. This task applied it:
- **Prices and tokens:** taken from E-R3 sections 2 and 4, with E-R3's own caveats (quoted through search, T1135-a; tokens estimated, T1135-c).
- **Options per feature:** the cheapest and the strongest managed option, the EU open option, the box for batch jobs, and the no-model answer where Carta has one.
- **Box model:** E-R3's pick, Qwen3-30B-A3B Q4_K_M (Apache 2.0, about 18 GB, fits the CAX41's 32 GB), served by llama.cpp `llama-server`. Its OpenAI-compatible `/v1/chat/completions` reuses the gateway's existing `openai` adapter, so the call path did not change.
- **Measuring here:** the container cannot measure model quality. Hugging Face was refused by the network proxy, and probing other model mirrors was denied, so no model could run locally. Every model-quality number is therefore a recorded past run (T563, T564) or an owner run.
- **Pass rule:** within 2 points of the managed option's score on the same eval. That is the E1 gate tolerance (T1136), reused so there is one rule.

## Files touched

Created:
- `continent-app/config/ai_models.json`: options, prices, CPU speeds, the per-feature cost and quality table, `box_passed`, `switch.triggers`.
- `docs/ai/model-strategy.md`: the rules, the formula, the table, the triggers and how to move a batch job to the box.
- `tests/test_ai_model_strategy.py`: 26 tests.
- `Execution/P15/T1138-model-strategy.md`: this report.

Modified:
- `pipeline/ai_gateway.py`: the provider table only. Provider `box` is added to `PROVIDERS`, `DEFAULT_MODELS`, `ADAPTERS` (the existing `_openai`) and `READY`, with `BOX_MODEL`, `BOX_BASE_URL`, `BOX_PASSED`, `BOX_NEVER` and `BOX_TIMING`. `FEATURES` gains `tagging`, `summaries` and `blog`. `resolve_config` gains the box base URL and the two box errors. No change to `Gateway.call`, the adapters' requests or logging (S55's area).
- `docs/HANDBOOK.md`: a new "Model strategy (T1138, E7)" bullet after the AI gateway bullet.
- `ROADMAP.md`: E7 status.
- `Execution/_OPEN.md`: rows T1138-a to T1138-j appended.

## Commands run

```
git fetch origin && git checkout -b p15-s54-model-strategy origin/p15-round2   # the branch already existed at origin/p15-round2
cd continent-app && npm ci
CARTA_EVAL_OUT=<scratch> node scripts/eval/run.mjs --check        # all six evals pass
node scripts/eval/run.mjs ask taxonomy --json > <scratch>/ev.json  # grounding 0.9956, micro F1 0.4309
git show archive/execution-full-2026-11-03:"Execution/P11/T563-T566-ask-carta-verify.md"   # the 88.7 percent
python3 <scratch>/gen.py && python3 <scratch>/table.py   # wrote ai_models.json and the table in model-strategy.md (scratch generators, not committed)
cd .. && python -m pytest tests/test_ai_model_strategy.py tests/test_ai_gateway.py -q
ruff check --select E9,F63,F7,F82 pipeline tests
python -I scripts/docs/drift.py
cd continent-app && npm test
```

## Config and secrets set

None set. New optional keys the gateway reads, all unset: `AI_<JOB>_PROVIDER=box`, `AI_BOX_BASE_URL` (default `http://localhost:8080/v1`), and `AI_BOX_EVAL_RUN=1`, which lets the eval run use the box before a pass is recorded.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| AI features with cost per 1,000 calls for 3 or more options, in config | 0 (E-R3 prose tables: 4 live features, batch jobs per full run) | 8 of 8 (32 options) | +8 |
| Quality entries measured | 0 (E-R3: "expected, not measured") | 6 of 32 | +6 |
| Quality entries as owner runs with a command or a named blocker | 0 | 26 of 32 | +26 |
| Switch triggers as config | 0 (E-R3 section 8 prose) | 9 (mau 2, cost per day 4, quality drop 1, grounding 1, price 1) | +9 |
| Batch jobs that can select the box CPU by config | 0 behind a gate (an `openai` base URL could point anywhere) | the mechanism for 6 jobs (intros, trips, tagging, summaries, blog, lexicon; parking never); 0 passed, so 0 switched | |
| Live features moved off Gemini or Workers AI | 0 | 0 | 0 |
| Cost per 1,000 calls, Ask on Workers AI Qwen3 / Gemini Flash-Lite | E-R3 0.15 / 1.04 | 0.15 / 1.04 (recomputed by the test) | 0 |
| Intros full run, today's first batch model | E-R3: 1.27 (assumed Flash-Lite batch) | 7.57 on `gemini-flash-latest` (thinking), 1.27 on Flash-Lite batch, 0.31 on the box | |
| pytest, gateway suites | 30 (`test_ai_gateway.py`) | 56 (plus 26 in `test_ai_model_strategy.py`) | +26 |
| `npm test` | not run before (no app code changed) | 1,674 tests, 1,662 pass, 0 fail, 12 skipped | |
| Eval runner (`run.mjs --check`) | 6 pass | 6 pass (unchanged, nothing they read changed) | 0 |
| Docs drift (`drift.py`) | 0 drift | 0 drift | 0 |

Box speed and every model-quality score other than the six are not measured here (T1138-a, T1138-e).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first table showed the live features' chain as `gemini-flash-latest` first | The Python gateway's `GEMINI_CHAIN` (batch) differs from the JS one (live, `gemini-flash-lite-latest` first) | The config's live features take the JS chain; the batch difference is row T1138-f |
| Plain `ruff check` on `ai_gateway.py` lists C408 (`dict()` calls) and others | The file's existing style; the repo's CI runs `--select E9,F63,F7,F82` | The new entries keep the file's style; the CI selection is clean |
| `git checkout -b` failed | The container had already created the branch at `origin/p15-round2` | Checked that it pointed at the same commit (`6fd60348c`) and used it |

No model could be downloaded: Hugging Face was refused by the proxy, and probing other model hosts was denied. The table says so instead of estimating scores.

## Screens checked

None. Nothing a traveller sees changed: the config file is not imported by the app (`src/` reads pricing, rating, recommend and slots only).

## What is still open

- T1138-a (user): the box runs. First llama-bench, then each batch job's eval on the box; a pass goes into `BOX_PASSED` and `box_passed`.
- T1138-b: there is no plan-day plan recorder, so the plan-day eval cannot score the model options yet.
- T1138-c: there is no quality eval for suggest-city or parse-booking.
- T1138-d: there is no quality eval for intros.
- T1138-e (user): the live Ask eval on Gemini Flash-Lite and OVHcloud Mistral Small, and a rerun of Qwen3.
- T1138-f: the batch Gemini chain starts on a thinking model, about 6 times the cost of Flash-Lite.
- T1138-g: the gateway has no Gemini batch-mode call.
- T1138-h (user): the decision on the live features and the trigger values.
- T1138-i: MAP.md and docs/ai/README.md do not name the new files.
- T1138-j: nothing checks the triggers against telemetry yet.
- Carried, not new: T1135-a (prices from primary pages), T1135-c (real call rates), T1135-e (pin the `-latest` aliases), T1135-f (box speed, folded into T1138-a).

## Rollback procedure

`git revert` the T1138 commit. It touched config, docs, tests and the gateway's provider table only: no migration, no data, nothing deployed. With `BOX_PASSED` empty, no job behaves differently before or after the revert.

## Owner steps (for the checklist)

- [T1138-a] Benchmark the box and run the batch evals on it | batch jobs move to Carta's own CPU (no quota, no data leaving the box) only after a measured pass | on the box build llama.cpp, fetch Qwen3-30B-A3B-Q4_K_M.gguf and run llama-bench, then write the speeds into box_cpu in continent-app/config/ai_models.json; start llama-server -m Qwen3-30B-A3B-Q4_K_M.gguf --port 8080 -np 2 -c 16384 and run each job's eval with AI_<JOB>_PROVIDER=box AI_BOX_EVAL_RUN=1 (commands in the config, first tagging once the S66 tagger exists); for a job within 2 points of Gemini, add it to BOX_PASSED in pipeline/ai_gateway.py and box_passed in the config in one commit | docs/ai/model-strategy.md, "Moving a batch job to the box"
- [T1138-e] Run the live Ask eval on two more models | Ask's model choice has one measured option (Qwen3, 88.7 percent kept, from 2026-10-22) | in continent-app set AI_ASK_PROVIDER=gemini AI_ASK_MODELS=gemini-3.5-flash-lite GEMINI_API_KEY in .dev.vars, run npx wrangler pages dev and node scripts/ask-eval-live.mjs --endpoint http://localhost:8799 --out ../data/reports/evals/ask-live-gemini-flash-lite.json; repeat with AI_ASK_PROVIDER=openai, the OVHcloud base URL and key, and Mistral-Small-3.2-24B-Instruct-2506; repeat with no override (Qwen3); write the kept shares into features.ask.options in ai_models.json | continent-app/config/ai_models.json, docs/ai/model-strategy.md
- [T1138-h] Decide the live features and the trigger values | no live feature moves without the owner; the triggers decide when to look again | read the table in docs/ai/model-strategy.md (Ask stays on Workers AI at 0.15 EUR per 1,000 calls; plan-day, suggest-city and parse-booking stay on Gemini Flash-Lite at about 3 EUR per 1,000 calls); confirm or change the values in switch.triggers (2,800 MAU, EUR 1.67 and 10.50 a day, a 2 point quality drop); put the monthly review (first Monday) in the calendar | continent-app/config/ai_models.json, docs/ai/model-strategy.md
