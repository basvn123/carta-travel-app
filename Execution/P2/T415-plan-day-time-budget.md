# Execution Report: T415

## Task ID

T415: plan-day falls over to a faster model on a timeout, instead of giving up

## Date

2026-10-08

## What changed

The Carta bot's day plan failed for the owner twice in a row on 2026-10-08 with "The Carta bot had a hiccup". The edge_errors table, live since migration 040, recorded the cause: code ai_timeout, origin edge, HTTP 504, no upstream status. So Gemini never answered with an error. plan-day itself gave up after waiting 45 seconds for the first model in its chain, gemini-flash-latest. That is a thinking model, and on a paid account the request also carries live Google search. The 45 s limit ended the whole request at once, by design, although the lite models behind it in the chain answer a day in seconds. Now the whole chain shares one time budget of 80 s. The first model may take up to 40 s, each later model up to 25 s, never more than what is left, and the chain stops once less than 8 s remain. A timeout falls over to the next model the way a 429 already did. The rule lives in `attemptTimeoutMs` in logic.mjs, where the existing logic suite tests it. Supabase allows an Edge Function 150 s of wall clock, so 80 s stays well inside that, with room for the cache, quota and logging work around the call. Deployed as plan-day version 12; the owner's next request produced a full day in Leuven. This also closes the long-standing LIVE-a row (the bot always failing in production): its first cause, the missing POI files, went with the R2 cutover, and this was the second.

## Files touched

**Modified (root repository, branch p2-plan-day-timeout):**
- supabase/functions/plan-day/logic.mjs (attemptTimeoutMs and its four constants)
- supabase/functions/plan-day/index.ts (the chain loop uses the budget; a timeout continues; ai_timeout only when the chain ran out of time)
- continent-app/scripts/ai/test_plan_logic.mjs (mirror copy of the app change)
- Execution/_OPEN.md (rows closed and added)

**Modified (app repository, branch p2-plan-day-timeout):**
- scripts/ai/test_plan_logic.mjs (six budget checks)

**Created:**
- Execution/P2/T415-plan-day-time-budget.md

**Deleted:**
- None

## Commands run

```
# the owner, SQL editor: select at, fn, code, origin, http_status, upstream_status from public.edge_errors order by at desc limit 10
node scripts/ai/test_plan_logic.mjs                                  # from continent-app in the root worktree: all pass
npx supabase functions deploy plan-day --project-ref ntssxktaduxzpsmejwyv --use-api   # version 12
curl -X POST .../functions/v1/plan-day with the anon key             # {"code":"auth"}, HTTP 401: the function starts
```

## Config and secrets set

None. The secrets AI_GLOBAL_DAILY_CAP, GEMINI_MODEL and GEMINI_MODELS are still unset, so the defaults hold (a cap of 200, the four-model chain).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Owner's day-plan requests that succeeded on 2026-10-08 | 0 of 2 (both ai_timeout) | 1 of 1 | fixed |
| Longest the bot waits before it gives up | 45 s, first model only | 80 s, across the chain | +35 s |
| Models tried after a timeout | 0 | up to 3 | |

Which model answered the successful request is in ai_model_events (fell_back); it was not read here.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every day plan failed with "had a hiccup" | A 45 s timeout on the thinking model with live search ended the whole request | One 80 s budget across the chain; a timeout falls over |

## What is still open

Row T415-a: suggest-city has the same 45 s single-model give-up (index.ts line 285), and parse-booking gives up at 60 s; the same budget belongs there. Row T415-b: the day plan's stop descriptions are written by the model before the server re-orders the day, so a stop can say "Start your morning with…" and come last (seen on the Leuven plan). Either the prompt avoids time-of-day words, or the description is written after the order is fixed.

## Rollback procedure

`git revert` this task's merge in both repositories, then `npx supabase functions deploy plan-day --project-ref ntssxktaduxzpsmejwyv --use-api` from the reverted root checkout. That puts the 45 s single-model timeout back. No data or schema change.
