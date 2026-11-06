# T1137: one model gateway for every AI call (ROADMAP E3, round 2 session S53)

Branch `p15-s53-ai-gateway` from `origin/p15-round2`. Builds on T1117 (the AI guard, C8), T1136 (the Ask eval gate, E1) and T1135 (model research, E-R3).

## Date

2026-11-06

## What changed

Every model call Carta makes now goes through one model-access module, and a test fails on any call that does not. The Edge Functions plan-day, suggest-city and parse-booking and Ask's Pages Function call `callModel` in `supabase/functions/_shared/aiModels.mjs` (Ask through its byte-identical copy `continent-app/functions/_lib/aiModels.js`); the four pipeline jobs that call a model (`rewrite_intros.py`, `parking_check.py`, `ask_lexicon.py --ollama`, the trip generator `generate_trip.py`) call `Gateway.call` in its Python twin `pipeline/ai_gateway.py`. Provider and model chain are config: defaults per feature in one table, switched with `AI_<FEATURE>_PROVIDER`, `AI_<FEATURE>_MODELS` and `AI_<FEATURE>_BASE_URL` (Gemini, Workers AI through the binding or REST, any OpenAI-compatible API such as Scaleway, OVHcloud, Mistral or llama.cpp on the box, and Ollama in Python); the older `GEMINI_MODEL(S)` still work; anything naming Anthropic or Claude is refused. Today's providers are unchanged (Workers AI for Ask, Gemini for the rest, Ollama for the lexicon helper). One failure rule everywhere: a time budget per call with a larger first attempt, 429 and 404 fall over (batch jobs wait 30 s and retry once first), a 5xx or dropped connection is retried once, a timeout falls over, any other 4xx stops; one refusal shape (`{code, status}` from `AI_CODES`). Before, parse-booking and suggest-city ended on the first timeout and nothing retried a 5xx. suggest-city, the one AI surface T1117 left unguarded, now has the guard (`guardCityInput`, `guardCityOutput`, `guardCityPayload`, rules in the system slot, cached rows re-checked). The pipeline gateway screens harvested text with aiGuard's 16 rule families (a Python port kept equal by a parity test over 1,545 strings) and rejects a leaked, templated or turned answer. The attack set grew from 50 to 75 (14 suggest-city, 11 pipeline) and runs in the new `ai-guard` workflow. No prompt text and no Ask retrieval or ranking changed.

## Research

None chosen. The provider list follows T1135 (`docs/research/E-R3-models-and-hosting.md`): the `openai` adapter is the one shape Workers AI REST, Scaleway, OVHcloud, Mistral and a llama.cpp server share, so the switches that report proposes for E7 are config values here. The failure rule generalises plan-day's T415 budget, which was the only one of the four that already fell over on a timeout.

## Files touched

Created:
- `supabase/functions/_shared/aiModels.mjs`, copy `continent-app/functions/_lib/aiModels.js`
- `pipeline/ai_gateway.py`
- `continent-app/tests/aiGateway.test.mjs`, `tests/test_ai_gateway.py`
- `.github/workflows/ai-guard.yml`
- `Execution/P15/T1137-ai-gateway.md`

Modified:
- `supabase/functions/plan-day/index.ts`, `supabase/functions/parse-booking/index.ts`, `supabase/functions/suggest-city/index.ts` (the call through `callModel`, `modelAccess` before quota, `chainKey` in the cache key, `refusalBody`; suggest-city also the guard)
- `supabase/functions/plan-day/logic.mjs` (the chain, `modelChain`, `shouldFallOver` and the budget re-exported from aiModels)
- `supabase/functions/_shared/aiGuard.mjs` and its copy `continent-app/functions/_lib/aiGuard.js` (suggest-city guard functions, `LIMITS.cityPromptChars`; `GUARD_VERSION` unchanged, so the Ask cache stays valid)
- `continent-app/functions/api/ask/answer.js` (the call through `callModel`; `MODELS` from config)
- `pipeline/dossier/rewrite_intros.py`, `pipeline/dossier/parking_check.py`, `pipeline/ask_lexicon.py`, `Trips/carta-unified/carta-unified/pipeline/generate_trip.py`
- `continent-app/tests/aiGuard.test.mjs` (the static check reads the system slot from `callModel` and covers suggest-city)
- `continent-app/scripts/ai/test_edge_exec.mjs` (the stub timeout throws what `AbortSignal.timeout` throws; a timeout now falls over in every function)
- `evals/injection/attacks.json` (version 2, 25 attacks added), `evals/injection/README.md`
- `.github/workflows/golden-set.yml` (the paid `live` job's sparse checkout adds `pipeline/ai_gateway.py`, which the trip generator now imports; not in the brief's list, needed for that job to run)
- `docs/HANDBOOK.md` (plan-day item 6, suggest-city items 6 and 6a, the AI guard bullet, a new AI gateway bullet)
- `ROADMAP.md` (E3 status), `Execution/_OPEN.md` (rows T1137-a to T1137-h)

## Commands run

```
git fetch origin p15-round2 && git checkout -b p15-s53-ai-gateway origin/p15-round2
cd continent-app && npm ci
node scripts/ai/test_edge_exec.mjs            # before and after
node scripts/ai/test_plan_logic.mjs
node --test tests/aiGuard.test.mjs tests/aiGateway.test.mjs tests/askGenerate.test.mjs tests/functionGuards.test.mjs
npm test
npx eslint tests/aiGateway.test.mjs tests/aiGuard.test.mjs functions/api/ask/answer.js functions/_lib/aiModels.js functions/_lib/aiGuard.js
npx eslint --no-ignore scripts/ai/test_edge_exec.mjs
node scripts/eval/ask-eval.mjs --check
cd .. && python -m pytest tests/test_ai_gateway.py tests/test_generate_trip.py tests/test_golden_set.py tests/test_trip_critic.py tests/test_backfill_modules.py tests/test_expand_catalogue.py tests/test_docs_drift.py -q
ruff check --select E9,F63,F7,F82 pipeline tests Trips/carta-unified/carta-unified/pipeline/generate_trip.py
(cd Trips/carta-unified/carta-unified && python -X utf8 pipeline/golden_set.py self-test && python -X utf8 pipeline/golden_set.py check --allow-missing-baseline)
deno check --no-lock supabase/functions/{plan-day,parse-booking,suggest-city}/index.ts   # deno 2.9.6 from npm in the scratchpad; before on a git archive of HEAD
```

## Config and secrets set

None set. New optional keys the gateway reads, all unset today: `AI_<FEATURE>_PROVIDER`, `AI_<FEATURE>_MODELS`, `AI_<FEATURE>_BASE_URL`, `AI_OPENAI_BASE_URL`, `AI_OPENAI_API_KEY`, `CF_ACCOUNT_ID`, `CF_AI_TOKEN`. With none set, every feature runs on the provider and chain it ran on before.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Code files that call a model provider directly (outside a gateway module) | 8 (plan-day, suggest-city, parse-booking, Ask answer.js, rewrite_intros, parking_check, ask_lexicon, generate_trip) | 0 (the grep test fails on 1) | -8 |
| Places a model chain or provider is chosen | 6 (`DEFAULT_MODEL_CHAIN`, Ask `MODELS`, two `Gemini.CHAIN`, `MODEL_CHAIN`, the lexicon default) | 2 config tables (`AI_FEATURES`, `FEATURES`); `MODEL_CHAIN` kept equal by a test because golden_set hashes it | -4 |
| What a provider switch takes | a code change in each file | an environment value | |
| AI surfaces under the guard | 3 of 4 server surfaces (suggest-city not) and 0 of 4 batch jobs | 4 of 4 and 4 of 4 | +5 |
| Attacks in the CI set | 50 on 3 surfaces | 75 on 5 surfaces (22 Ask, 15 plan-day, 14 suggest-city, 13 parse-booking, 11 pipeline) | +25 |
| Attacks held (stubbed outputs) | 50 of 50 | 75 of 75 | |
| Python and JS injection scanners agreeing (rules and severe output issues) | no Python scanner | 1,545 of 1,545 strings (attack set, benign set, Ask golden and held-out) | |
| Timeout on the first model, parse-booking / suggest-city | request ends 504 | falls over while the 90 s / 80 s budget lasts | |
| 5xx from a model | falls over at once (Edge), not retried | retried once, then falls over | |
| `npm test` | 1581 tests (the after count minus the 33 new ones), 0 fail, 12 skipped | 1614 tests, 1602 pass, 0 fail, 12 skipped | +33 |
| pytest, gateway and the trip generator suites | 101 | 131 (30 new in `test_ai_gateway.py`) | +30 |
| Full pytest minus quarantine (this container, LFS files not pulled) | not run at the start | 567 pass, 2 fail, 9 skipped; the 2 (`test_rating_inputs`, `test_rating_stability`) read LFS pointer files that CI pulls first, and touch nothing in this task | |
| `scripts/ai/test_edge_exec.mjs` (not in CI) | 91 ok, 14 fail, then a crash | 92 ok, 13 fail, the same crash (all pre-existing, T1137-e) | +1 ok |
| `deno check` errors, plan-day / parse-booking / suggest-city | 5 / 2 / 2 | 5 / 2 / 2 (the same ones) | 0 |
| Ask eval gate (`ask-eval.mjs --check`) | pass | pass (rules recall@10 0.568, grounding 0.996, unchanged) | 0 |

Live latency and fall-over rates are not measured: nothing here is deployed (T1137-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `deno check` found 6 new errors per function (`Property 'ok' does not exist on type 'object'`) | `callModel`'s JSDoc returned a bare `object` | `AiRequest` and `AiResult` typedefs; back to the baseline counts |
| Two harness checks, "a Gemini timeout answers 504", failed | The harness threw a plain `Error`, which the gateway reads as a dropped connection (retried) rather than a timeout; and a timeout now falls over to the next model | The stub throws `DOMException('...', 'TimeoutError')` as `AbortSignal.timeout` does, and times out both models of its two-model chain; plan-day's check, failing before, now passes |
| The Python port's regex held raw invisible characters | Written through a tool that turned the backslash-u escapes (zero width space and the like) into the characters (ruff PLE2515) | Escapes restored; parity test still 1,545 of 1,545 |
| The trip client would have ignored `AI_TRIPS_MODELS` | It passed `MODEL_CHAIN` as a pinned chain when no `--model` was given | Passes no chain, so the gateway's config applies; a test pins it |
| The grep test flagged `ask_lexicon.py` | Its `--host` default named `localhost:11434` | The default lives in the gateway's `lexicon` config |
| city-04 left `example/collect please` in the scrubbed wish | `scrubData` splits sentences at the dot of a domain, so the URL tail is a clean "sentence" (pre-existing in aiGuard) | Not changed here (it moves plan-day's behaviour too); the attack checks that the domain is gone; row T1137-d |

Gotcha: `deno check` run inside the scratchpad picks up the scratchpad's own `node_modules` and fails on `npm:@supabase/supabase-js`; run it from a folder with no `node_modules` above it.

## Screens checked

None. No screen changed: the refusal codes the app reads are the same (plan-day, suggest-city and parse-booking still answer `ai_timeout`, `ai_error`, `global_cap`, `ai_bad_output`, `no_ai`; Ask still sends `cap`, `off` or `model`). The end check of the batch needs no screen for this task.

## What is still open

- T1137-a (user): deploy plan-day, suggest-city, parse-booking and the Pages build (with T1117-a). Until then nothing here is live.
- T1137-b: the rest of E3: PII scrub of input, every number traced to input, banned terms and the no-dash check on output, and the "rule-based or cached answer, never an empty screen" fallback.
- T1137-c: suggest-city's wish and the pipeline prompts' harvested text are screened but not fenced as data blocks; fencing changes prompt text, so it belongs to S56 (E5, the prompt registry).
- T1137-d: `scrubData` splits at the dot of a domain, so a URL tail survives a scrub.
- T1137-e: `continent-app/scripts/ai/test_edge_exec.mjs` has 13 pre-existing failures and a crash and is not in CI.
- T1137-f: Ask books the worst-case Neurons before the call and keeps them when every model fails.
- T1137-g: `docs/security/SECRETS.md` and the three function READMEs do not list the new optional keys.
- T1137-h: `scripts/ai/redteam_live.mjs` (the live red team, T1117-b) does not cover suggest-city or the pipeline jobs.
- Not a row: the on-device Ask model (WebLLM in `src/lib/ask/onDevice*.js`) runs in the traveller's browser and is not a provider call; its stream guard is T1117-d.

## Rollback procedure

`git revert` the T1137 commit. Code, tests, CI and docs only: no migration, no data, nothing deployed, no secret set. After a deploy, revert and redeploy the three Edge Functions and the Pages build. Cache rows are unaffected: a Gemini chain's cache key is the same string as before.

## Owner steps (for the checklist)

- [T1137-a] Deploy the model gateway | plan-day, suggest-city, parse-booking and Ask call models through aiModels only once deployed; suggest-city's guard too | after T1117-a or together with it: `supabase functions deploy plan-day`, `supabase functions deploy suggest-city`, `supabase functions deploy parse-booking`; the Pages build per CLAUDE.md Deploy (preview first); on the preview run one plan-day day, one town suggestion and one magic import and check each answer's `meta.model` and `meta.guard`, and ask one Ask question | `supabase/functions/_shared/aiModels.mjs`, `continent-app/functions/api/ask/answer.js`
