# T1206: Register follow-up sweep, AI and Ask

ROADMAP item: register follow-up (AI and Ask), the round 2 follow-up sweep of the AI and Ask rows (round 3 session S122, batch 14). The rows belong to E1 to E8 and F6; the E3 status line gains this sweep. Branch `p15-s122-sweep-ai` from `p15-round3`. Brief: `Execution/P15/_run_r3/briefs/S122.md`.

## Date

2026-11-07

## What changed

The 46 open `next task` rows raised by T1135, T1136, T1137, T1138, T1139, T1140, T1141, T1148 and T1168 were worked through. 29 are closed, 14 stay open with a reason and 3 turned out to be owner steps and moved to `user`.

- **Ask (offline eval, rules and bm25):**
  - 30 of 30 out-of-scope questions are refused now, against 25 before. "A week in New York" is no longer York, England, and a country outside Europe is refused in any of the six languages.
  - In-scope questions wrongly refused: 2 before, 0 after ("wandern in den alpen im juli" was refused over "Den").
  - Grounding: 99.6 to 99.9 percent of 689 checks.
  - "rustig dorp aan een meer" no longer reads `meer` as the sea: its recall@10 went from 0.33 to 0.83 (rules) and 1.0 (bm25).
  - The model's notes now carry the cheapest months and whether a car is needed, whatever the notes cap.
  - Ask hands back its Neuron booking when every model fails.
- **Ask index:**
  - It writes unique passage ids at the source. Duplicates went from 81 sight, 339 trail, 239 beach, 187 lake and 204 peak to 0.
  - A staleness check fails a build whose index is older than the catalogue it was built from.
  - `docs/SCHEMA.md` describes the BM25 wires as they are.
- **The guard:**
  - It scrubs e-mail addresses, phone numbers, IBANs and card numbers from traveller input.
  - It removes dashes from model output, including Ask's stream, and can report banned words.
  - It no longer lets the tail of an injected URL through.
  - suggest-city's wish and deck are fenced as data blocks (prompt v2).
- **Tests and tools:**
  - `test_edge_exec.mjs` passes 145 of 145 (13 failures and a crash before) and runs in the ai-guard workflow.
  - The live red team replays the suggest-city and pipeline attacks.
  - New scripts:
    - a plan-day recorder for any provider;
    - a monthly switch-trigger checker;
    - `Gateway.batch` for Gemini Batch Mode, which no job selects yet.
- **Prompt registry:**
  - 14 of 21 prompts are now guarded by an offline `run.mjs` eval (5 before), through four new evals: injection, trips-golden, parse-booking, suggest-city.
  - The Trips schema descriptions moved to the registry with byte-identical schemas.
  - `record` refuses a judge score made on another rubric.
- **CI:**
  - The evals job uploads its results as an artifact.
  - The docs site build now generates Ask the docs' index and copies its core.
- **Admin and docs:**
  - The admin Overview mounts the weekly model-call card.
  - ARTICLE30 and the HANDBOOK say call rows are kept 30 days.
  - MAP.md and the docs indexes point to the gateway, `prompts/` and the model strategy.

## Research

None chosen. Each row's method was chosen by its raising task: E-R3 and T1138 for models and Gemini Batch Mode, T1137 for the guard, T1140 for the registry, T1148 for the eval runner, T1141 for retrieval. No new tool, library, service or data source was picked, so no research subagent was run.

Three checks needed the web, and every one was blocked by the proxy:

| Check | Pages tried | What happened |
|---|---|---|
| T1135-a, T1139-f: price tables | https://ai.google.dev/gemini-api/docs/pricing, https://developers.cloudflare.com/workers-ai/platform/pricing/ | Blocked: proxy CONNECT 403, and WebFetch could not reach the hosts |
| T1135-e: model ids behind the `-latest` aliases | ai.google.dev | Blocked the same way |
| T1138-g: Gemini Batch API docs | ai.google.dev | Blocked. `Gateway.batch` is coded from the known shape (`models/<m>:batchGenerateContent`, poll `batches/<id>`, `inlinedResponses`) against a fake transport, and the first live run is an owner step (T1206-d) |

One disagreement was found and left as it is, because neither figure can be verified here: `aiEvents.mjs` prices `gemini-flash-latest` at 0.30 and 2.50 USD per million tokens, while `ai_models.json` prices the same alias at 0.75 and 3.75. It stays with T1139-f.

## Rows, one by one

**Group before:** 68 open rows from T1135 to T1141, T1148 and T1168: 46 `next task` and 22 `user`.

**After:** 36 open: 14 `next task` and 22 + 3 = 25 `user`. That is 29 closed and 3 moved to user. 11 new T1206 rows were added.

| Row | Outcome | What was done, or why it stays |
|---|---|---|
| T1135-a | open | The pricing pages ai.google.dev and developers.cloudflare.com are blocked by the proxy (see Research) |
| T1135-b | open | Needs E7's live runs with a Gemini key and Workers AI on at least three options per feature |
| T1135-c | open | Needs E4 (`ai_model_events`, after migration 071 is pasted, T1139-a) and K12 data. The checker `check_switch_triggers.mjs` (T1138-j) now prints the triggers once that data exists |
| T1135-e | open | Pinning needs the concrete id each `-latest` alias serves today. ai.google.dev is blocked, and a guessed id could change the live model |
| T1135-f | moved to user | A llama-bench run on the CAX41 box; the same step as T1138-a |
| T1136-b | closed | `outside.js` skips articles in six languages between "in" or "to" and a name, and a lower-case word after an article is not read as a name. Test in `askChat.test.mjs` |
| T1136-c | closed | An unknown capitalised word (or a name head such as "new" or "san") right before a known place makes another place. The name of a country outside Europe in six languages is refused anywhere in the question; the names come from `Intl.DisplayNames`, and names under 4 letters are ignored. A guard of European countries and aliases (Czech Republic, Scotland, Holland) is never refused. Result: 0 new refusals over 310 in-scope questions |
| T1136-d | closed | `context.js` writes a cheapest-months note (or "Carta does not know its cheapest month" when no bed prices are measured), and for an about question a car note with the transit quality. Both are outside the notes cap. Tests in `askGenerate.test.mjs` |
| T1136-e | closed, already done | `docs/reference/evals.md` exists (T1148) |
| T1136-f | open | The quiet lake village questions (5 languages) and the warm late October questions still score 0 in the top ten. Only the `meer` cause (T1141-i) was in scope |
| T1137-b | open | Done: PII scrub of input (`scrubPii`: e-mail, phone, IBAN with mod 97, Luhn card; booking codes, ticket numbers, dates and prices survive). Done: `fixDashes` on output and on Ask's stream. Done: `houseStyleIssues` detects banned words. Left, each needing a written rule first: what to do with a banned word in output; which numbers must trace to input and what happens on a miss; the rule-based or cached answer when every model fails; names (not a pattern) |
| T1137-c | open | suggest-city done (prompt v2: the wish and the deck are `WISH` and `CANDIDATES` data blocks, golden test pinned). The pipeline has no `data_block` twin. Six pipeline prompts (intros, parking, lexicon, judge-text, photo-check, tag-verify) still pass harvested text unfenced, and each needs a bump and its eval |
| T1137-d | closed | `sentencesOf` ends a sentence only at `.`, `!` or `?` before a space or the end, or at a line break, so city-04 scrubs to empty. A hit sentence keeps only its clean head (`cleanHead`), so a one-line booking keeps its facts (book-01, 02, 03, 11, 13 still pass) |
| T1137-e | closed | The stubs were stale, not the code: stub stops had no name, cached payloads lacked summary and activities, and the fall-over stub ignored the retry on 5xx. Now 145 of 145 pass, and the test is a step in `.github/workflows/ai-guard.yml` |
| T1137-f | closed | `functions/api/ask/answer.js` refunds the worst-case Neuron booking when every model fails |
| T1137-g | closed | `docs/security/SECRETS.md` gains the gateway keys and a gateway settings table. The three function READMEs list them |
| T1137-h | closed | `redteam_live.mjs` replays the suggest-city attacks and the pipeline attacks (through `Gateway(feature)` with the job's registry prompt). New `--dry-run` builds all 75 requests. The live run is an owner step (T1206-e) |
| T1138-b | closed | `continent-app/scripts/eval/plan-day/record.mjs` records the 20 cases from a local `supabase functions serve plan-day` and refuses remote hosts unless given `--allow-remote`. Tested against a fake endpoint and scored through the adapter. The real runs are an owner step (T1206-f) |
| T1138-c | open | The runnable commands exist now (`run.mjs parse-booking` and `suggest-city --answers <file>`, and parse-booking has 10 synthetic documents with gold fields). But the answers are hand written, so no model is scored until a live run records real answers |
| T1138-d | open | No deterministic quality measure for intro prose was found; it needs a judge or labels |
| T1138-f | open | Ordered after T1138-d (moving the batch jobs to Flash-Lite needs that eval) |
| T1138-g | closed | `Gateway.batch(items)` in `pipeline/ai_gateway.py`: inline Gemini Batch Mode on the chain's first model, with the same cap, screen, output check and one event per item. 3 pytest cases. No job uses it, and the first live run is T1206-d |
| T1138-i | closed | `docs/ai/README.md` names `model-strategy.md` and `ai_models.json`. MAP.md has a new row "AI gateway, prompts and models" |
| T1138-j | closed | `continent-app/scripts/ai/check_switch_triggers.mjs --input <month.json>` reads the weekly view, MAU and grounded searches, and prints each trigger as fired, not fired, no data or manual. Tested on `fixtures/switch_triggers_sample.json` |
| T1139-d | closed | `useOverview` calls `useAiCalls(unlocked)` (fetched once at unlock), and `Overview.jsx` mounts `AiCalls` after the model fallbacks card. The `admin.aiCalls.*` keys already existed in six languages. Test in `aiEvents.test.mjs` |
| T1139-e | closed | ARTICLE30 section 2a (rows 7 and the table) and the HANDBOOK privacy line: plan and ground rows are kept 180 days, call rows 30 days (071 `ai_events_prune`) |
| T1139-f | open | The price pages are blocked. The aiEvents half is done (`buildAiEvent({outputChars})`, `withStreamOutput`). Ask still writes its event at call time: `aiModels.callModel` must defer the event on `stream: true`, and `answer.js` must count the streamed characters before Ask's cost covers the answer |
| T1140-b | closed | Four offline evals in `run.mjs`: injection (75 attacks, guards security-rules), trips-golden (golden self-test, guards trips-shared and the five pass prompts), parse-booking (10 documents, field accuracy at least 0.9, no invented link), suggest-city (6 decks, rules plus wish fit at least 0.5). The registry runs them on a bump. 7 prompts have none still: row T1206-k |
| T1140-c | closed | `prompts/trips-shared/v2.md` holds five `schema.*` fragments, and `generate_trip.py` reads them. Hashes of all four pass schemas (plain and Gemini form) equal the pre-move ones, so no rebaseline (there is no golden `baseline.json` yet either). A test pins the hashes |
| T1140-d | closed | The plan-day result records `judge.verdicts_rubric_sha`. `registry.mjs record` refuses a kappa score whose verdicts carry another rubric or none |
| T1140-e | closed | The MAP.md and docs index halves are done here. The `index.ts` line numbers in `docs/logic/plan-day.md` were realigned to the current file |
| T1140-f | closed, already done | T1148-c moved by this sweep |
| T1141-c | open | Needs the embedding model, which the container cannot download |
| T1141-d | closed | `ask_index_layer.py` writes `manifest.catalogue` (the catalogue's generated time and schema version). The new `continent-app/scripts/check-ask-index.mjs` fails on an older index, and `build-ask-bm25.mjs` runs it first. It passes when no index is built (CI) |
| T1141-e | closed | Beach, lake, peak and trail duplicates came from `top.json` repeating country rows; only the country files are read now. Sight duplicates came from slug collisions; names with no Latin letters get `x-` plus a short hash. 1,050 duplicates went to 0 with stable ids. `tests/test_ask_index_ids.py` |
| T1141-f | closed | The `docs/SCHEMA.md` "Ask Carta search wires" section covers `cc`, `bm25-<src>.json`, `manifest.bm25.server`, `manifest.catalogue`, unique pids, the `b` parameter and `sparse`. The contract check still matches |
| T1141-g | moved to user | A check on the box after the owner's index rebuild (T1141-b) |
| T1141-h | open | Needs measured Worker isolate memory with a built index |
| T1148-c | closed, already done | `buildPrompt` and `RESPONSE_SCHEMA` are exported by `supabase/functions/plan-day/prompt.mjs` (T1140) |
| T1148-d | closed | `ci.yml` job `evals` already ran `run.mjs --check` (T1201). It now installs pytest, runs `--check --write` and uploads `data/reports/evals/` as `eval-results`, even on failure |
| T1148-f | closed, already done | T1136-e moved by this sweep |
| T1148-g | closed | `docs/reference/README.md` named `evals.md`, but a blank line broke the table; fixed |
| T1148-h | open | After T1148-b; Langfuse is not running |
| T1168-d | moved to user | The real questions must come from the owner (or from real traffic) |
| T1168-e | closed | `node scripts/docs/ask_docs.mjs build` copies the core. `docs-site.yml` runs that build before `mkdocs build` and checks that the copy matches (the CI site had no `index.js` before). `docs/reference/evals.md` was regenerated with all 13 evals, ask-docs included |

## Files touched

- **Ask:**
  - `continent-app/src/lib/ask/outside.js`, `intent.js`, `context.js`
  - `continent-app/functions/api/ask/answer.js`
  - `continent-app/scripts/check-ask-index.mjs` (new), `continent-app/scripts/build-ask-bm25.mjs`
  - `pipeline/ask_index_layer.py`, `docs/SCHEMA.md`
  - Tests: `continent-app/tests/askChat.test.mjs`, `askIntent.test.mjs`, `askGenerate.test.mjs`, `askIndexStale.test.mjs` (new); `tests/test_ask_index_ids.py` (new)
- **Gateway and guard:**
  - `supabase/functions/_shared/aiGuard.mjs`, `aiEvents.mjs` and their byte-identical copies in `continent-app/functions/_lib/`
  - `supabase/functions/suggest-city/prompt.mjs`, `index.ts`
  - `pipeline/ai_gateway.py`
  - `continent-app/scripts/ai/test_edge_exec.mjs`, `redteam_live.mjs`, `check_switch_triggers.mjs` (new), `fixtures/switch_triggers_sample.json` (new)
  - `continent-app/config/ai_models.json` (batch note)
  - Tests: `continent-app/tests/aiGuard.test.mjs`, `aiEvents.test.mjs`, `aiSwitchTriggers.test.mjs` (new), `planDayRecord.test.mjs` (new); `tests/test_ai_gateway.py`
- **Evals and registry:**
  - `continent-app/scripts/eval/run.mjs`, `lib/results.mjs`
  - Adapters: `adapters/plan-day.mjs`, `injection.mjs`, `trips-golden.mjs`, `parse-booking.mjs`, `suggest-city.mjs` (all new except plan-day)
  - Eval sets: `parse-booking/set.json` and `answers.json`, `suggest-city/set.json` and `answers.json` (new)
  - `continent-app/scripts/eval/plan-day/record.mjs` (new)
  - `scripts/prompts/registry.mjs`, `prompts/registry.json`, `prompts/suggest-city/v2.md` (new), `prompts/trips-shared/v2.md` (new)
  - Generated: `supabase/functions/_shared/prompts.js`, `continent-app/functions/_lib/prompts.js`
  - `Trips/carta-unified/carta-unified/pipeline/generate_trip.py`
  - `scripts/docs/ask_docs.mjs`
  - Tests: `continent-app/tests/evalAdapters.test.mjs` (new), `evalPlatform.test.mjs` (eval list), `askDocs.test.mjs` (test name), `promptRegistry.test.mjs`; `tests/test_prompt_registry.py`
  - Results: `data/reports/evals/latest/*.json`, `history.jsonl`
- **Admin:** `continent-app/src/components/admin/Overview.jsx`, `useOverview.js`.
- **Workflows:** `.github/workflows/ai-guard.yml`, `ci.yml`, `prompts.yml`, `docs-site.yml`.
- **Docs:**
  - `MAP.md`, `ROADMAP.md` (E3 status)
  - `docs/HANDBOOK.md` (AI guard, gateway, model strategy, evals runner, Ask the docs, prompt registry, privacy line)
  - `docs/legal/ARTICLE30.md`, `docs/security/SECRETS.md`
  - `docs/README.md`, `docs/ai/README.md`, `docs/reference/README.md`, `docs/logic/plan-day.md`
  - The three function READMEs: `supabase/functions/plan-day/README.md`, `suggest-city/README.md`, `parse-booking/README.md`
  - Generated: `docs/reference/evals.md`, `python.md`, `docs/architecture/lineage.md`
- **Register:** `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`, this report.

## Commands run

```
cd continent-app && npm ci && npm test && npm run lint
node scripts/eval/ask-eval.mjs                      # offline, rules and bm25
node scripts/eval/run.mjs --check ; node scripts/eval/run.mjs --write --dashboard
node scripts/prompts/registry.mjs bump suggest-city ; record ; build ; check
node scripts/prompts/registry.mjs bump trips-shared ; record ; build ; check
node scripts/ai/test_edge_exec.mjs ; node scripts/ai/redteam_live.mjs --dry-run
python -m pytest tests -q (minus tests/quarantine.txt)
ruff check (0.14.3, CI rule set) on the touched Python
node scripts/ci/design-lint.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
python -I scripts/docs/check_entry_points.py ; build_reference.py ; build_lineage.py ; config_reference.py --check ; drift.py
```

## Config and secrets set

None set. `ai_models.json` changed only its batch note. The gateway keys are now documented in `docs/security/SECRETS.md`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Ask out-of-scope questions refused (offline eval) | 25 of 30 | 30 of 30 | +5 |
| Ask in-scope questions wrongly refused | 2 | 0 | -2 |
| Ask abstain correct | 96.5% | 100% | +3.5 points |
| Ask rules recall@10 / nDCG@10 | 56.8 / 60.0 | 57.2 / 60.3 | +0.4 / +0.3 |
| Ask bm25 recall@10 / nDCG@10 | 57.6 / 61.1 | 58.1 / 61.4 | +0.5 / +0.3 |
| Ask grounding checks passing (689) | 99.6% | 99.9% | +0.3 points |
| m001 "rustig dorp aan een meer" recall@10, rules / bm25 | 0.33 / 0.33 | 0.83 / 1.0 | +0.50 / +0.67 |
| Quiet lake village (5 languages) and warm late October in the top ten | 0 / 0 | 0 / 0 | none (not in scope) |
| Duplicate Ask passage ids at the source | 1,050 | 0 | -1,050 |
| `test_edge_exec.mjs` checks passing | 132 plus a crash | 145 of 145 | +13 |
| Registry prompts guarded by a `run.mjs` eval | 5 of 21 | 14 of 21 | +9 |
| Offline evals in `run.mjs` | 9 | 13 | +4 |
| `npm test` | not run on the base | 1,944 tests, 0 fail (12 skipped) | |
| pytest minus quarantine | 2 fail on the base | the same 2 fail, 1,058 pass | none new |

The Ask eval baseline (`scripts/eval/ask-baseline.json`) is not re-blessed. The public AI page (`aiPage.askNumbers` in six languages) and `docs/ai/model-card-ask.md` pin its figures, and both were outside this sweep's files. The gate passes and shows only gains. Bless, page and card belong in one change: row T1206-a.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Splitting sentences only at sentence ends scrubbed a whole one-line booking (book-01, 02, 03, 11, 13 failed) | `cleanText` flattens line breaks, so a pasted booking has no sentence end | A hit sentence keeps its clean head (`cleanHead`); the injected tail never survives |
| `aiPage.test.mjs` failed after a bless run | The public AI page pins the blessed Ask figures | Baseline restored, and row T1206-a added |
| Two early "saved early" commits carry other groups' work in progress | Commits made on a stop hook while three parallel helpers were still editing | Later commits completed each group. Revert this task as a whole, not commit by commit |
| `test_rating_inputs::test_beauty_v2_reads_no_register` and `test_rating_stability::test_adding_places_moves_nobody_else` fail | Data not in the cloud checkout; both fail on `origin/p15-round3` too | None needed here |
| `generate_trip.py self-test` fails 5 checks before this sweep | photos, highlights, dayPlaces, visits and sample are asked of no pass | Reported advisory by trips-golden; row T1206-b |

## Screens checked

- **Admin Overview:** the card renders only with a live report from `admin_ai_calls_weekly`. Migration 071 is not pasted (T1139-a), and the container cannot reach Supabase, so no browser look was possible.
  - The render is covered by the SSR test, `AiCalls` with fixtures plus a static check of the mount.
  - The empty and error reports render nothing, as before.
  - Look at phone and desktop width after T1139-a.
- **CSP:** the fast build passes over 40 screen loads, with 0 violations.
- **Design lint:** 0 new violations.
- **Traveller-visible changes:** these are Ask's refusal and notes text. The checks are the eval and unit tests; no layout changed.

## What is still open

The 14 `next task` rows and 3 moved rows above stay in `Execution/_OPEN.md` with the reasons given there. New rows:

- **T1206-a:** bless the Ask eval baseline together with `aiPage.askNumbers` (six languages) and `docs/ai/model-card-ask.md` (30 of 30 refused, 99.9 percent grounding).
- **T1206-b:** `generate_trip.py self-test` fails 5 checks: model fields photos, highlights, dayPlaces, visits and sample are asked of no pass.
- **T1206-c:** the Trips Gemini schema key order changes between runs (Python string hashing). Anything hashed over it, such as a cache key, is unstable.
- **T1206-d:** first live run of `Gateway.batch` (Gemini Batch Mode) on the pipeline key. The request shape is coded from memory because the docs were blocked. Owner.
- **T1206-e:** live red team replay with the new suggest-city and pipeline attacks (`redteam_live.mjs`). Owner.
- **T1206-f:** record and score plan-day plans per provider with `record.mjs` against a local `supabase functions serve plan-day`. Owner.
- **T1206-g:** the plan-day README chain table and its `GEMINI_MODEL` default name `gemini-flash-latest`, but `aiModels.GEMINI_CHAIN` starts on `gemini-flash-lite-latest`.
- **T1206-h:** "Czech Republic" is not parsed as a country by Ask's query parser, so m027's cards fall outside CZ (the one failing grounding check).
- **T1206-i:** 7 registry prompts still have no `run.mjs` eval: intros, parking, lexicon, judge-text, blog-intro, backtranslate, photo-check. The pipeline injection attacks use hard-coded system strings, not the registry prompts, so they cannot guard them yet.
- **T1206-j:** `aiEvents.mjs` and `ai_models.json` price `gemini-flash-latest` differently (0.30 and 2.50 against 0.75 and 3.75 USD per million tokens). One table should be the source.
- **T1206-k:** wire `houseStyleIssues` into the output path once a rule says what a banned word in model output does (drop, re-ask or rewrite). Split out of T1137-b, which keeps number tracing and the fallback.

## Owner steps (for the checklist)

- [T1206-d] First Gemini batch run | half-price batch jobs depend on a verified request shape | set GEMINI_API_KEY on the box; run a 3-item `Gateway("intros").batch(...)` with `models=["gemini-3.5-flash-lite"]`; compare the answers and events with a normal call | pipeline/ai_gateway.py, Execution/P15/T1206-sweep-ai.md
- [T1206-e] Live red team with the new attacks | suggest-city and the pipeline jobs are not yet attacked live | `node continent-app/scripts/ai/redteam_live.mjs --dry-run` to see the 75 requests; run it without the flag against the deployed functions with the keys set; file any attack that passes | continent-app/scripts/ai/redteam_live.mjs
- [T1206-f] Record plan-day plans per provider | the plan-day eval can only score the reference planner until real plans are recorded | `supabase functions serve plan-day` with AI_PLAN_DAY_PROVIDER set; `node continent-app/scripts/eval/plan-day/record.mjs --out <file>`; `node continent-app/scripts/eval/run.mjs plan-day --plans <file>` | continent-app/scripts/eval/plan-day/record.mjs
- [T1135-f] llama-bench on the box | the box CPU speeds are inferred, not measured | run llama-bench with Qwen3-30B-A3B Q4_K_M on the CAX41; put the numbers in ai_models.json box_cpu (with T1138-a) | continent-app/config/ai_models.json
- [T1141-g] BM25 over highlights on the box | the highlight source gave 0 passages in this checkout | after T1141-b, count highlight passages in the rebuilt index; run the Ask eval with sparse on | pipeline/ask_index_layer.py
- [T1168-d] Real questions for Ask the docs | the question set was written by its builder | write or collect 30 real questions about the docs; replace continent-app/scripts/eval/ask-docs set; measure Material's built-in search on the same set | continent-app/scripts/eval/ask-docs/

## Rollback procedure

`git revert` every `T1206:` commit on `p15-s122-sweep-ai`, newest first. Each group's work is spread across the early saves, so revert the task as a whole. Nothing is one-way: no migration was applied, no deploy was made and no live data was touched. The register moves revert with the commits.
