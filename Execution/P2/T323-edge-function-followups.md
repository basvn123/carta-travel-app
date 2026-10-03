# T323: Edge Function follow-ups

## Task ID

T323

## Date

2026-10-03

## What changed

Four register rows from the P2 AI batch are closed. The plan-day model-event insert no longer blocks the response (T300-r). The origin of the "about 6k input tokens per plan" figure is found, and it is an unmeasured estimate (T040-c). The grounding cost and cap arithmetic is re-run with Google's published price (T041-c), with the result below and no price changed. The three AI Edge Functions are now executed, not pattern-checked, against a stub Supabase client (T037-d), with 145 assertions.

T300-r. T038 said the fallback-chain log was fire-and-forget, but `plan-day/index.ts` did `await service.from('ai_model_events').insert(...)` before returning, so every generated plan paid one database round trip for telemetry. The insert now lives in a new helper, `logModelEvent` in `supabase/functions/_shared/passes.mjs`. It starts the insert and returns at once, hands the promise to `EdgeRuntime.waitUntil` when the runtime has it (so the worker is kept alive until the write lands), and logs a failure with `console.error` instead of swallowing it. The row is the same as before: user id, model, kind, fell_back. Nothing else in the response path changed. The new test hangs the insert forever and asserts the response still arrives; against the old code that test fails (4 failures, checked against the main checkout's copy), against the new code it passes.

T040-c. The 6k figure first appears in the COST FLOOR comment of `continent-app/src/lib/pricing.js`, added in commit 0ff0f28e3 on 2026-07-29 ("Sell one price table everywhere, and size the caps to what they cost"), as "plan: Flash tokens only, ~6k in + ~2.5k out, ~ EUR 0.01", in a block that says its figures are "taken conservatively high". `CARTA_UNIT_ECONOMICS.md` section 2.2 and Lever 3 repeat it. No measurement, log or Gemini usage record in the repository backs it. To test whether a real request could reach it, I drove the real `plan-day/index.ts` with a stub client and read the prompt it actually sends to Gemini (characters divided by 4, the same estimator T040 used, not a tokenizer; throwaway script in the session scratchpad, not committed). A plain 22-candidate deck with no descriptions is about 1,037 tokens. The same deck with every description filled in is about 1,917. A 28-candidate deck, the most the server accepts, with every description is about 2,378. The heaviest request the validators allow (28 candidates with descriptions, a full chat profile, 8 named stops, 280-character free text and refine text, 12 previous stops, events on) is about 3,295 tokens, and the response schema adds about 227. So the shipped code cannot send 6k input tokens by its own caps, and the typical request is 1.0k to 2.4k. The 6k was a round conservative estimate written before any measurement, then copied into the unit economics. It does not change cap safety, because the plan unit is cheap either way, but the figure should be corrected (row T323-c). Gemini thinking tokens bill as output and are a separate question this task did not measure.

T041-c. Google's published price (read by T041 on 2026-09-24, `Execution/P2/T041-per-fact-grounding-design.md` line 82 and the measurement table): 5,000 free grounded search requests a month shared across Gemini 3.x, then $14 per 1,000, so $0.014 per request after the pool. What nothing in the repository records is how many search requests the model runs per grounded unit (T041 table: "unknown: nothing records webSearchQueries"). So the honest result is a table over the fan-out q, not one number. Assumptions, each from a file: plan unit EUR 0.01 and the caps 60 plans plus 40 grounded (Trip), 300 plus 120 (Year), from `pricing.js` COST FLOOR; net receipts EUR 5.39 (Trip) and EUR 11.84 (Year) and infra allocation EUR 0.12 on the Trip Pass only, from `CARTA_UNIT_ECONOMICS.md` sections 3.1 and 3.2 (the old worst-case rows, 2.67 and 2.84, subtract exactly these). One dollar is taken as one euro, which overstates the euro cost slightly and so errs on the safe side; no exchange rate is stated in the repository. The free pool is ignored in the worst-case rows (a maxed pass is the case where the pool is gone).

The old EUR 0.05 is the same as a fan-out of 3.57 requests billed at list price with no free pool. It is not a wrong ceiling, it is an unverified one.

Worst case, every unit of the cap spent (section 3.1 and 3.2 re-run):

| Fan-out q (requests per grounded unit) | Cost per grounded unit | Trip Pass worst contribution | Year Pass worst contribution |
|---|---|---|---|
| 1 | EUR 0.014 | EUR 4.11 (58.8% of gross) | EUR 7.16 (47.8%) |
| 2 | EUR 0.028 | EUR 3.55 (50.8%) | EUR 5.48 (36.6%) |
| 3 | EUR 0.042 | EUR 2.99 (42.8%) | EUR 3.80 (25.4%) |
| 3.57 (the old EUR 0.05) | EUR 0.050 | EUR 2.67 (38.2%) | EUR 2.84 (19.0%) |
| 5 | EUR 0.070 | EUR 1.87 (26.8%) | EUR 0.44 (2.9%) |

Both old rows are reproduced at q = 3.57, which checks the method. Break-even fan-out, where a fully exhausted pass earns nothing: about 8.3 for the Trip Pass and about 5.3 for the Year Pass. So the cap of 120 on the Year Pass holds its margin if the model runs up to about 5 searches per unit and is the thinner of the two; 40 on the Trip Pass has much more room. The T041 proposal to resize to 10 and 30 is untouched; at q = 5 the Year worst case at 30 would be EUR 11.84 - 3.00 - 30 x 0.07 = EUR 6.74.

Typical use (section 3.1: 8 plans and 5 grounded; section 3.2: 20 plans and 12 grounded), once the free pool is spent: Trip about EUR 0.08 + 0.07 q, so 0.15 at q = 1, 0.29 at q = 3, 0.43 at q = 5 (old figure 0.33); Year about EUR 0.20 + 0.168 q, so 0.37, 0.70 and 1.04 (old figure 0.80). While the pool holds, grounded cost is zero and only the plan units cost anything.

The shared free pool: 5,000 requests a month. At the launch volume the unit economics assume (about 300 payers a month, section 3.1) typical Trip Passes spend about 1,500 grounded units, which at q = 3 is 4,500 requests, inside the pool. The pool is also shared with the nightly refresh job T147 will add. The hard ceiling on spend is the global daily cap of 200 AI calls a day (`AI_GLOBAL_DAILY_CAP`, `plan-day/index.ts` header): 6,000 calls in a 30-day month. If every one of them were grounded, billable requests would be 1,000 at q = 1 ($14), 13,000 at q = 3 ($182) and 25,000 at q = 5 ($350). That is the true worst month, and it is small.

Conclusion, no price or cap changed: the caps hold for any fan-out up to about 5, and the cost per pass at typical use is lower than the old table at q of 3 or less. The one number that decides which row applies is the fan-out, which needs a Gemini key and live calls (row T323-b).

T037-d. `scripts/ai/test_edge_exec.mjs` (app repo) imports the real `index.ts` of plan-day, suggest-city and parse-booking. It supplies a `Deno` global (serve captures the handler, env reads a map), redirects the `npm:@supabase/supabase-js@2` import to a stub client with Node's `registerHooks`, replaces `fetch` with a scripted Gemini, and relies on Node 24's built-in type stripping to read the `.ts` files. The code under test is the shipped file, not a copy. It asserts, for each function: no key is 503 with nothing spent; no user is 401 with nothing spent; `user_cap` and `global_cap` are 429, never reach Gemini, refund nothing and write one `ai_cap_events` row; a failing `ai_consume` is 503 `quota_check`, not a grant and not a logged cap; an unknown status is not a grant; a grant spends exactly one `plan` unit before the Gemini call; a non-retryable Gemini error, a timeout and unparseable output each refund the `plan` unit; a 429 falls over to the next model with no refund; an exhausted chain is 429 `global_cap` with a refund; a cache hit spends a unit and never calls Gemini. Then the grounded paths: plan-day sends `google_search` only when a `ground` unit was granted, refunds both kinds on a later failure, degrades a free tier to `groundingSkipped: tier` without logging a cap, logs a paid-tier refusal as a ground cap event, and never refunds a ground unit it was refused; suggest-city's lost race degrades to a `plan` unit, runs without search, refunds `plan` and never `ground`, and logs the second refusal as a plan refusal; parse-booking refunds the unit when the parse finds nothing and never asks for a ground unit. Part C of `test_ai_quota.mjs` stays as the cheap guard, with a header note pointing at the new file.

Honest limit: this is Node running the Deno source. `deno` is not installed on this machine, so the Deno runtime itself (permissions, its npm resolver, the real EdgeRuntime) is not covered, and the stub client has no SQL (the ai_consume and ai_refund arithmetic is still Part A of `test_ai_quota.mjs`, which skipped here because no throwaway Postgres was started). The row is closed because the stated gap, branches never executed, is closed; the Deno-runtime run is carried as T323-d.

## Files touched

**Modified (root repo, branch p2-edge-followups):**
- supabase/functions/_shared/passes.mjs (added `logModelEvent`)
- supabase/functions/plan-day/index.ts (import, and the model-event insert now goes through the helper without await)
- Execution/_OPEN.md (T037-d, T040-c, T041-c, T300-r closed by T323; rows T323-a to T323-d appended)

**Created (root repo):**
- Execution/P2/T323-edge-function-followups.md (this report)

**Modified (app repo continent-app, branch p2-edge-followups):**
- scripts/ai/test_ai_quota.mjs (header comment only)

**Created (app repo):**
- scripts/ai/test_edge_exec.mjs

No screen was touched, so there was nothing to check in the browser at 380px or desktop width.

## Commands run

App worktree was created by hand because the root worktree already existed: `git worktree add ../../wt/T323-app -b p2-edge-followups master` from `continent-app/`, plus a junction for `node_modules`. Tests, from `wt/T323-app`:

```
CARTA_REPO_ROOT=../T323 node scripts/ai/test_edge_exec.mjs
CARTA_REPO_ROOT=../T323 node scripts/ai/test_ai_quota.mjs
CARTA_REPO_ROOT="<main checkout>" node scripts/ai/test_edge_exec.mjs   # old code: confirms the new test fails on it
```

Results: test_edge_exec 145 of 145 passing on the new code; 141 of 145 on the old code (the four T300-r assertions fail, as they should). test_ai_quota 47 of 47 in Parts B and C, Part A skipped (no throwaway Postgres on 55448 was started; Part A is untouched by this task). `test_plan_logic.mjs` was not run: it resolves `logic.mjs` relative to the main-checkout layout and cannot find it from a worktree pair, and `logic.mjs` is unchanged. `measure_prompt_tokens.mjs` could not run here (no `esbuild` in the shared `node_modules`, no `public/poi`), so the prompt sizes above come from the throwaway stub-driven measurement instead.

## Config and secrets set

None. No deploy, no live Supabase call, no Gemini call, no migration.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| plan-day awaits the model-event insert before responding | yes | no (waitUntil) | one round trip off the response path |
| Edge Function quota assertions that execute the real source | 0 (Part C is text matching) | 145 | +145 |
| Input tokens per plan, brief | about 6,000 (unmeasured) | 1,037 to 3,295 plus 227 schema (chars/4, from the real prompt builder) | brief figure not reproducible |
| Year Pass worst-case contribution | EUR 2.84 at the assumed 0.05 per unit | EUR 7.16 to 0.44 for q = 1 to 5 | depends on fan-out q, unmeasured |
| Trip Pass worst-case contribution | EUR 2.67 | EUR 4.11 to 1.87 for q = 1 to 5 | same |

The round-trip saving was not timed against a database; the stub has no latency, so only the ordering is proven.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Worktree script failed on the app pair | Root worktree already existed, so `git worktree add` for the root failed | Created the app worktree by hand |
| A repo-wide grep in the main checkout ran past the timeout | Searched the whole tree including data | Stopped it, used `git grep` instead |

No code defects found in the three functions: every quota branch behaved as the source and reports describe.

## What is still open

T323-a (owner): redeploy plan-day so the non-blocking insert is live; it is the same deploy as T038-b and needs migration 028 applied first. Deploys are owner steps.

T323-b (owner): measure the real fan-out (searches per grounded unit), because it picks the row of the cost table. Needs a Gemini key and about 30 grounded calls, or `facts.queries` once T147 exists.

T323-c (next task): rewrite the EUR 0.05 and ~6k text in `pricing.js` and `CARTA_UNIT_ECONOMICS.md`; this task changed neither, by its scope.

T323-d (next task): run `test_edge_exec.mjs` under the real Deno runtime or a Supabase local stack, and wire it into the `ci` script (rule 4 forbade touching that script here).

## Rollback procedure

Root repo: `git revert` the T323 commit on `p2-edge-followups` (or reset the branch before merge). This restores the awaited insert and removes `logModelEvent`; nothing else depends on the helper. App repo: `git revert` the T323 commit; it only adds a test file and a comment. No data, schema or live function was changed. If plan-day was already redeployed with the new helper and a problem is suspected, redeploy the previous commit of `plan-day/index.ts`; the table and its rows are unaffected either way.
