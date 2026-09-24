# T038: Log the model fallback chain

## Task ID

T038

## Date

2026-09-24

## What changed

Plan-day now logs every successful generation to a new ai_model_events table, recording which model produced the answer and whether it was a fallback. Before this task, silent fallbacks to weaker models looked like the product degrading for no reason. Now the admin panel shows per-day model distribution with fallback rate computed as (fallbacks / total generations per day), surfacing when the primary budget or quota is exhausted. Migration 028 adds the event table with appropriate RLS (service_role write, admin read) and an RPC that aggregates per-day counts, per-model counts over the window, and total fallbacks. Plan-day logs events asynchronously after a successful response is prepared; a failed log write never fails the user's request.

## Files touched

**Root repo:**

- Created: `supabase/migrations/028_model_fallback_events.sql`
- Modified: `supabase/functions/plan-day/index.ts`
- Modified: `Execution/P2/T038-model-fallback-logging.md` (this report)

## Commands run

In the root repo:

```
git checkout -b p2-model-fallback-logging
git add supabase/functions/plan-day/index.ts supabase/migrations/028_model_fallback_events.sql Execution/P2/T038-model-fallback-logging.md
git commit -m "T038: Log all successful AI generations with fallback flag"
```

Test run (in app repo to verify unaffected):

```
node continent-app/scripts/ai/test_plan_logic.mjs
```

Result: All 49 tests passed.

## Config and secrets set

None. No credentials were changed, no API keys were set, no Supabase secrets were deployed. The migration file is not applied; that is a user row in the register.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Generations logged to ai_model_events | 0 | All successful uncached generations | +100% |
| Rows with fell_back=true per day | 0 | Fallback subset | Measurable |
| Rows with fell_back=false per day | 0 | Primary model hits | Measurable |
| Fallback rate computable as (true / total) | No | Yes | n/a |
| Tests passing (test_plan_logic.mjs) | 49 | 49 | 0 |

## What broke and how it was fixed

No issues. The logic.mjs tests all passed unchanged. The build succeeded with exit code 0.

## What is still open

Migration 028 is not applied to the live Supabase project. A user must paste the file into the SQL editor and apply it. Redeploying plan-day after the migration is applied will enable the logging. Both are user rows in the register.

The admin panel display is minimal (total fallbacks, bar chart of model distribution). A future enhancement could add per-day sparklines, per-user rollups, or alerts when fallback rate spikes.

The first plan-day call after a deployment change (or when the GEMINI_MODELS environment variable changes) will have an empty event because the log write happens asynchronously. This is acceptable and expected (best-effort logging).

## Rollback procedure

In the root repo:

```
git revert <commit-hash>
```

This reverts the plan-day logging and migration. If migration 028 was already applied to the live project, the down section can be run in the Supabase SQL editor:

```
drop function if exists public.admin_ai_model_report(int);
drop table if exists public.ai_model_events;
```

If plan-day is redeployed after the revert, it no longer logs model events. Existing events in ai_model_events remain in the database (they are not deleted).

---

## Notes for the maintainer

The choice of an event table (ai_model_events) rather than a column on ai_usage is deliberate. The ai_usage table is a per-period counter (one row per user, period, kind), and a single column cannot hold one value per generation because the counter may rise multiple times per day. The event table records the exact model for each request, enabling the admin RPC to aggregate per-day totals (denominator) and fallback counts (numerator), so the fallback rate can be computed per day.

Logging ALL generations (not just fallbacks) is essential. The total per day becomes a metric of volume, and the fallback subset shows the degradation rate. The admin panel byDay output includes both counts and the byModel breakdown, enabling the owner to spot when the primary model's budget exhausts and traffic shifts to fallbacks.

Plan-day logs events asynchronously after the response payload is ready, using the same best-effort pattern (fire-and-forget) as the cache insert. The log write happens outside the response path, so a database outage or a failed insert cannot fail the user's request. This is appropriate for a telemetry signal (the event is nice to have, not critical to functionality).

The admin RPC query is stable (no writes, just reads and aggregation) and runs under security definer with admin_guard('read'). It respects the window (30 days by default) passed from the admin panel. The per-day aggregate query groups by (date, model, fell_back), allowing the panel to show distribution and compute rates. The per-model aggregate gives the overall breakdown across the window.
