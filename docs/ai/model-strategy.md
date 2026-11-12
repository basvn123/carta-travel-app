# Model strategy: which model per AI feature, and when to switch

ROADMAP E7, task T1138 (2026-11-06). Applies the E-R3 research (`docs/research/E-R3-models-and-hosting.md`, T1135). The numbers live in `continent-app/config/ai_models.json`; this page explains them and is regenerated from it. `tests/test_ai_model_strategy.py` recomputes every cost from the stated formula and fails when the config, the gateway and this page disagree.

## Rules

- Never the Claude API or an Anthropic SDK (CLAUDE.md). The gateways refuse any provider, model or URL naming it.
- Live traveller features stay where they are today: Ask on Workers AI, plan-day, suggest-city and parse-booking on Gemini Flash-Lite, with the switch triggers below as set (owner decision T1138-h, 2026-11-12).
- When a plan-day or suggest-city trigger is reached, that feature moves to the best open model that passes its eval, with CLAUDE.md and `docs/decisions/0005-runtime-ai-on-gemini.md` changed in the same commit (owner decision T1135-g, 2026-11-12). Until then nothing moves.
- A pipeline batch job may run on the box's CPU only after it passes its eval there. The gateway enforces it: `pipeline/ai_gateway.py` refuses provider `box` for a job not listed in `BOX_PASSED` (`box_not_passed`), except for the eval run itself (`AI_BOX_EVAL_RUN=1`).
- A self-hosted model always keeps a managed model, then a no-model answer, behind it.

## How a cost is worked out

Per 1,000 calls, in EUR: (input tokens x input price + (output tokens + extra output tokens) x output price) / 1,000. USD at 0.87 EUR. Thinking models add 2,000 output tokens a call. Tokens per call are E-R3's estimates from the prompts until E4 telemetry (`ai_model_events`, T1139) gives real counts (T1135-c).

The box: CPU seconds per call = input / (420 x 1.6) + output / (20 x 1.6), from E-R3's Ampere llama.cpp figures (420 tokens a second prompt, 20 generation, two parallel slots at 1.6 times one), at the CAX41's hourly price (EUR 31.49 a month over 730 hours). Not measured on the box yet (T1135-f): the first box run replaces these speeds.

Prices are quoted through search results (E-R3 section 4), not read from the primary pages (T1135-a).

## Cost and quality per feature

"Quality" is the feature's eval headline. "Owner run" means the option needs a live key, a deployed function or the box, which this container cannot reach; the exact command is in the config (`features.<id>.options[].quality.command`). Where no eval exists for the feature, the run waits for that eval (the row named under Status).

### ask (live)

Today: workers-ai @cf/qwen/qwen3-30b-a3b-fp8, @cf/meta/llama-3.2-3b-instruct. Tokens per call: 1,500 in, 300 out. Eval: E1 (ask-eval.mjs, retrieval and grounding) plus ask-eval-live.mjs (share of sentences verify.js keeps). Personal data: low.

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Workers AI Qwen3-30B-A3B | 0.15 | 88.7 percent sentences kept by verify.js (ask-eval-live, 140 golden questions; T563 v3, 2026-10-22) | measured |
| Gemini 3.5 Flash-Lite | 1.04 | not measured | owner run |
| OVHcloud Mistral Small 3.2 24B | 0.19 | not measured | owner run |
| On device, WebLLM Qwen 2.5 1.5B | 0.00 | 11.1 percent sentences kept by verify.js (one question on an Iris Xe laptop, not an eval run; T564, 2026-10-22) | measured |
| No model (code: facts answer, reference planner, templates, today's tags) | 0.00 | 99.6 percent grounding (labelled facts reach the cards and notes) (E1 ask-eval.mjs, 200 questions; this task, 2026-11-06) | measured |

Choice: Stay on Workers AI Qwen3-30B-A3B; it is the cheapest server option and keeps 88.7 percent of sentences. The facts answer stays the fallback; on device stays opt-in.

### plan-day (live)

Today: gemini gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-flash-latest, gemini-3.1-flash-lite. Tokens per call: 4,500 in, 900 out. Eval: F6 plan-day eval (run.mjs plan-day: seven rule checks on 20 cases; the judge is calibrated at kappa 0.898 against the rules). Personal data: low to medium.

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 3.13 | not measured | owner run, blocked by T1138-b |
| Gemini 3.6 Flash, thinking, intro price | 12.40 | not measured | owner run, blocked by T1138-b |
| Workers AI Qwen3-30B-A3B | 0.46 | not measured | owner run, blocked by T1138-b |
| OVHcloud Mistral Small 3.2 24B | 0.57 | not measured | owner run, blocked by T1138-b |
| No model (code: facts answer, reference planner, templates, today's tags) | 0.00 | 100.0 percent plans meeting every rule (F6 plan-day, 20 cases (reference planner); this task, 2026-11-06) | measured |

Choice: Stay on Gemini. Pin the model ids (T1135-e): the chain starts on the gemini-flash-lite-latest alias, whose model and price can move without notice. Move to an open model only at the plan-day trigger and only if it scores within 2 points of Gemini on the plan-day eval.

### suggest-city (live)

Today: gemini gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-flash-latest, gemini-3.1-flash-lite. Tokens per call: 8,000 in, 400 out. Eval: none yet (T1138-c). Personal data: low.

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 2.96 | not measured | owner run, blocked by T1138-c |
| Gemini 3.6 Flash, thinking, intro price | 13.05 | not measured | owner run, blocked by T1138-c |
| Workers AI Qwen3-30B-A3B | 0.47 | not measured | owner run, blocked by T1138-c |
| OVHcloud Mistral Small 3.2 24B | 0.72 | not measured | owner run, blocked by T1138-c |

Choice: Stay on Gemini; grounded calls must (no open option has Google Search). The ungrounded path follows plan-day's model once an eval exists.

### parse-booking (live)

Today: gemini gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-flash-latest, gemini-3.1-flash-lite. Tokens per call: 4,000 in, 1,000 out. Eval: none yet (T1138-c); scripts/ai/verify_magic_import.mjs checks the flow on a canned answer, not the model. Personal data: high (names, booking codes, emails).

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 3.22 | not measured | owner run, blocked by T1138-c |
| Gemini 3.6 Flash, thinking, intro price | 12.40 | not measured | owner run, blocked by T1138-c |
| Scaleway Gemma 4 26B-A4B (vision) | 1.50 | not measured | owner run, blocked by T1138-c |
| Workers AI Gemma 3 12B (images) | 1.68 | not measured | owner run, blocked by T1138-c |

Choice: Stay on Gemini (native PDF). The trigger is legal, not volume: if C9 says booking documents stay in the EU, Gemini on Vertex AI EU or Scaleway Gemma 4 once it passes the eval (T1135-d).

### intros (batch)

Today: gemini gemini-flash-latest, gemini-3.5-flash, gemini-3.5-flash-lite. Tokens per call: 12,050 in, 1,540 out. Eval: none yet (T1138-d); the job's own schema check only. Personal data: none (public catalogue).

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Gemini 3.6 Flash, thinking, intro price | 19.41 | not measured | owner run, blocked by T1138-d |
| Gemini 3.5 Flash-Lite, batch mode | 3.25 | not measured | owner run, blocked by T1138-d |
| Workers AI Qwen3-30B-A3B | 0.98 | not measured | owner run, blocked by T1138-d |
| Box CPU, llama.cpp Qwen3-30B-A3B Q4_K_M | 0.79 | not measured | owner run, blocked by T1138-d |

Choice: Move to the box once an intros eval exists and the box scores within 2 points of Gemini on it. Today the batch chain (pipeline GEMINI_CHAIN) starts on gemini-flash-latest, a thinking model: 19.41 EUR per 1,000 calls against 3.25 for Flash-Lite in batch mode, so a full run costs about 7.57 EUR instead of 1.27 (E-R3 assumed Flash-Lite).

### tagging (batch)

Today: none F1 tagger (T1150). Tokens per call: 600 in, 80 out. Eval: F1 taxonomy eval (run.mjs taxonomy --predictions; micro F1 and R-precision at 5). Personal data: none (public catalogue).

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| No model (code: facts answer, reference planner, templates, today's tags) | 0.00 | 43.1 percent micro F1 (today's tags mapped) (F1 taxonomy, 15-item seed set (the numbers mean little until gold.csv is filled, T1149-a); this task, 2026-11-06) | measured |
| Gemini 3.5 Flash-Lite, batch mode | 0.17 | not measured | owner run, blocked by T1150 tagger |
| Workers AI Qwen3-30B-A3B | 0.05 | not measured | owner run, blocked by T1150 tagger |
| Box CPU, llama.cpp Qwen3-30B-A3B Q4_K_M | 0.04 | not measured | owner run, blocked by T1150 tagger |

Choice: Build the tagger on the box from the start (E-R3: about 19 CPU hours for 20,000 items); Gemini batch mode is the fallback.

### summaries (batch)

Today: none trail summaries are templates (pipeline/trails/summaries.py); D7 and D9 summaries planned. Tokens per call: 1,500 in, 200 out. Eval: F6 trail-summaries (T1179 check over the top-band walks). Personal data: none (public data).

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| No model (code: facts answer, reference planner, templates, today's tags) | 0.00 | 100.0 percent summaries passing every check (F6 trail-summaries, 2,089 top-band walks (templates); this task, 2026-11-06) | measured |
| Gemini 3.5 Flash-Lite, batch mode | 0.41 | not measured | owner run, blocked by no model job |
| Box CPU, llama.cpp Qwen3-30B-A3B Q4_K_M | 0.10 | not measured | owner run, blocked by no model job |

Choice: Keep the templates: free, and 2,089 of 2,089 pass. A model would only add prose variety.

### blog (batch)

Today: none K14 blog drafts. Tokens per call: 8,000 in, 1,500 out. Eval: none yet (K14 owns it). Personal data: none.

| Option | EUR per 1,000 calls | Quality | Status |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 5.35 | not measured | owner run, blocked by K14 |
| Gemini 3.6 Flash, thinking, intro price | 16.64 | not measured | owner run, blocked by K14 |
| Box CPU, llama.cpp Qwen3-30B-A3B Q4_K_M | 0.70 | not measured | owner run, blocked by K14 |

Choice: Ten drafts a month cost cents on any option; draft on the box once K14 has a review, owner edits every draft.

Other pipeline model jobs: `parking` (parking_check.py) never runs on the box, because it needs Google Search grounding (`BOX_NEVER`); `trips` (the trip generator) can try the box for ungrounded runs once `golden_set.py` passes there; `lexicon` already runs locally on Ollama.

## Switch triggers

Config: `switch.triggers` in `continent-app/config/ai_models.json`. Each trigger has a metric, a threshold, a window, the action and who acts. Metrics: `mau` (monthly active users, K12), `cost_eur_per_day` (E4 telemetry, `ai_model_events` cost per feature, averaged over the window), `quality_drop_points` (the feature's eval headline against its recorded score), `grounded_searches_per_month`, and any price change.

| Trigger | Feature | When | Then | Who |
|---|---|---|---|---|
| ask-free-neurons | Ask | 2,800 MAU or more for 30 days | Workers paid plan, or facts-only answers past the free 10,000 Neurons a day | owner (T1135-h) |
| ask-cost | Ask | EUR 10.50 a day or more for 60 days | price a self-hosted GPU for Ask | owner (T1135-g) |
| plan-day-open-model | plan-day | EUR 1.67 a day (EUR 50 a month) or more for 60 days | run the plan-day eval on Workers AI Qwen3-30B-A3B and OVHcloud Mistral Small 3.2; the best within 2 points of Gemini goes first in the chain | owner (T1135-g) |
| plan-day-mau | plan-day | 11,000 MAU or more for 30 days, while telemetry has no cost | as above | owner (T1135-g) |
| suggest-city-open-model | suggest-city | EUR 1.67 a day or more for 60 days | ungrounded calls follow plan-day's model, once a suggest-city eval exists | owner (T1135-g) |
| grounding | plan-day, suggest-city | 4,000 grounded searches a month (80 percent of the free 5,000) | review the grounded allowance per tier in `plan_tiers` | owner (T1135-i) |
| gpu | all live | open-model spend of the features that can share one model at EUR 10.50 a day (1.5 times a GEX45, EUR 214 a month) for 60 days | price and test a GEX45 with vLLM, the managed API kept as fallback | owner (T1135-g) |
| gemini-price | all Gemini | any price change, or a `-latest` alias moving to a new model | recompute this table | next task |
| quality-drop | any | eval headline more than 2 points under its recorded score, over 7 days | move the feature back one step (previous model, then the no-model answer) and open a register row | next task |

Review: monthly, the first Monday, against E4 telemetry and K12 users. Update the tokens, prices and scores in the config, rerun `python -m pytest tests/test_ai_model_strategy.py -q`, and regenerate this page.

## Moving a batch job to the box

1. On the box: build llama.cpp, fetch `Qwen3-30B-A3B-Q4_K_M.gguf` (Apache 2.0) and start `llama-server -m Qwen3-30B-A3B-Q4_K_M.gguf --port 8080 -np 2 -c 16384`. Run `llama-bench` with the same file first and write the prompt and generation speeds into `box_cpu` in the config (T1135-f).
2. Run the job's eval on the box: `AI_<JOB>_PROVIDER=box AI_BOX_EVAL_RUN=1` plus the job's eval command from the table above. The box is reached at `AI_BOX_BASE_URL` (default `http://localhost:8080/v1`; plain http only to the same machine, https otherwise).
3. Compare with the managed option's score on the same eval. It passes when it is within 2 points (the E1 tolerance).
4. Record the pass in two places in one commit: `BOX_PASSED` in `pipeline/ai_gateway.py` (`{"<job>": {"eval": ..., "score": ..., "threshold": ..., "model": "qwen3-30b-a3b-q4_k_m", "date": ...}}`) and `box_passed` in the config, with the measured quality in the job's options. The test fails when the two differ.
5. From then on the job runs on the box with `AI_<JOB>_PROVIDER=box`; leaving it unset keeps Gemini. On the CPU the gateway waits up to 20 minutes for an answer and drops the Gemini rate floor and 429 wait.

Today no job has passed: `BOX_PASSED` is empty, so nothing runs on the box by accident.
