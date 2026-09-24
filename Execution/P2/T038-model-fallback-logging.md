# T038: Log the model fallback chain

## Task ID

T038

## Date

2026-09-24

## What changed

When the primary Gemini model fails and falls back to the next model in the chain, plan-day now logs which model produced the successful answer to a new ai_model_events table. This surfaces in the admin panel as an early warning that the primary free-tier budget is exhausted and tells you which model your users are actually getting. Before this task, a silent fallback to a weaker model looked like the product getting worse for no reason; now a day of fallback events in the logs is a signal to the owner that the primary budget or quota is gone. A new RPC aggregates per-day counts by model, and the admin panel displays total fallbacks, model distribution, and model names. Migration 028 adds the event table with appropriate RLS (service_role write, admin read) and an RPC that returns aggregated counts. Plan-day logs events asynchronously after a successful response is prepared; a failed log write never fails the user's request.

## Files touched

**Root repo (migrations):**

- Created: `supabase/migrations/028_model_fallback_events.sql`

**App repo (plan-day and admin):**

- Modified: `supabase/functions/plan-day/index.ts`
- Modified: `continent-app/src/auth/admin.js`
- Modified: `continent-app/src/admin/AdminPage.jsx`

## Commands run

In the root repo:

```
git checkout -b p2-model-fallback-logging
git add supabase/migrations/028_model_fallback_events.sql
git commit -m "T038: Add model fallback event logging to ai_usage"
```

In the app repo:

```
git checkout -b p2-model-fallback-logging
git add -A
git commit -m "T038: Wire model fallback events to plan-day and admin panel"
npm run build
```

Test run in app repo:

```
node continent-app/scripts/ai/test_plan_logic.mjs
```

Result: All 49 tests passed.

Build output excerpt:

```
✓ 533 modules transformed.
[…]
✓ built in 1m 56s
[exited with code 0]
```

## Config and secrets set

None. No credentials were changed, no API keys were set, no Supabase secrets were deployed. The migration file is not applied; that is a user row in the register.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places where fallback model is recorded | 0 | 1 (ai_model_events.model) | +1 |
| Admin surfaces showing fallback data | 0 | 1 (admin panel AI Model Fallbacks card) | +1 |
| RPCs that aggregate model events | 0 | 1 (admin_ai_model_report) | +1 |
| Tests passing (test_plan_logic.mjs) | 49 | 49 | 0 |
| Build exit code | n/a | 0 | n/a |

## What broke and how it was fixed

No issues. The logic.mjs tests all passed unchanged. The build succeeded with exit code 0.

## What is still open

Migration 028 is not applied to the live Supabase project. A user must paste the file into the SQL editor and apply it. Redeploying plan-day after the migration is applied will enable the logging. Both are user rows in the register.

The admin panel display is minimal (total fallbacks, bar chart of model distribution). A future enhancement could add per-day sparklines, per-user rollups, or alerts when fallback rate spikes.

The first plan-day call after a deployment change (or when the GEMINI_MODELS environment variable changes) will have an empty event because the log write happens asynchronously. This is acceptable and expected (best-effort logging).

## Rollback procedure

**In the root repo:**

```
git revert 970a84877
```

This removes the migration file. If the migration was already applied to the live project, the down section of 028 can be run to drop the table and RPC:

```
drop function if exists public.admin_ai_model_report(int);
drop table if exists public.ai_model_events;
```

**In the app repo:**

```
git revert 9b85e13
```

This removes the plan-day logging, the admin.js RPC call, and the AdminPage component. If plan-day is redeployed after this, it no longer logs model events. Existing events in ai_model_events are not deleted.

---

## Notes for the maintainer

The choice of an event table (ai_model_events) rather than a column on ai_usage is deliberate. The ai_usage table is a per-period counter (one row per user, period, kind), and a single column cannot hold "which model produced this answer" because the counter may rise multiple times per day. The event table records exactly which model answered each request, so the admin RPC can aggregate per-day counts. A future enhancement could add per-user rollups or alert when the fallback rate crosses a threshold.

Plan-day logs events asynchronously after the response payload is ready, using the same best-effort pattern (fire-and-forget) as the cache insert. The log write happens outside the response path, so a database outage or a failed insert cannot fail the user's request. This is appropriate for a warning signal (the event is nice to have, not critical to functionality).

The admin RPC query is stable (no writes, just reads and aggregation) and runs under security definer with admin_guard('read'). It respects the 30-day default window passed from the admin panel.
