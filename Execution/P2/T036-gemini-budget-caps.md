# T036: Set hard budget caps and alerts in Google Cloud

## Task ID

T036

## Date

2026-09-24

## What changed

The global daily AI ceiling is now tested against real SQL rather than described in prose. `continent-app/scripts/ai/test_global_cap.mjs` was rewritten from a file of `console.log` statements into a test with 49 assertions and a non-zero exit code on failure, in the house style of `test_plan_logic.mjs`.

The first version of this script asserted nothing. It printed a specification and ended with a line claiming all six specifications passed. That claim was false: a print-out cannot fail, so it cannot pass either. The done condition for this task is a global-cap rejection tested end to end, and the earlier report recorded a test that had never run. This revision replaces that claim with a test.

The script has two parts. Part A builds a throwaway PostgreSQL database, stubs the handful of Supabase-specific objects the migrations depend on, applies migrations 006, 007 and 021 in order, and then drives `public.ai_consume()` with a global cap of 2 across three stub users. It asserts that the first two calls return status `ok`, that `ai_daily_total` climbs to 2 and stops there, that the call which breaches the ceiling returns status `global_cap`, and that the breaching user's `ai_usage` counter is rolled back so the unit they never spent is not taken from them. It then asserts, with a generous global cap of 1000, that the per-user allowance still fires as `user_cap`, so the two refusals stay distinguishable at the point where the Edge Function turns them into an HTTP body.

Part B needs no database and always runs. It imports the real `supabase/functions/_shared/passes.mjs` and asserts the contract `consume()` gives its callers: that a `global_cap` from the RPC comes back unchanged and with `ok` false, that an RPC error becomes status `quota_check` rather than a cap, and that nothing but status `ok` sets `ok`. That contract is what `plan-day/index.ts` branches on, so it is the seam between the SQL and the 429.

The cap logic itself was not changed. It was correct before this task and it is correct now, but that is now a tested statement rather than an asserted one.

The Google Cloud budget alert procedure is unchanged and remains user-owned as T036-a. Nothing in this repository can create a Cloud budget.

## Files touched

Rewritten (app repo):

- `continent-app/scripts/ai/test_global_cap.mjs`

Read but not modified:

- `supabase/migrations/006_ai_day_planner.sql`, `007_passes.sql`, `021_free_tier_once.sql`
- `supabase/functions/_shared/passes.mjs`
- `supabase/functions/plan-day/index.ts`

`007_passes.sql` was temporarily edited during the negative control described below and restored in the same command. `git status` on it is clean.

## Commands run

The local PostgreSQL 18 server on 127.0.0.1:5432 refused every credential available to this session, so the test was run against a throwaway PostgreSQL 16 container on port 55432 instead. The skip path was exercised first, against the unreachable local server:

```
$ node continent-app/scripts/ai/test_global_cap.mjs
PART A: ai_consume against a throwaway PostgreSQL database
----------------------------------------------------------

  SKIPPED. Part A did not run, so nothing about the global cap was proved here.
  Reason: could not connect to postgres@127.0.0.1:5432. psql: error: connection
  to server at "127.0.0.1", port 5432 failed: fe_sendauth: no password supplied
[...]
21 assertions, 21 passing, 0 failing.
Part A SKIPPED: the global cap was NOT exercised against real SQL.
Part B passed. Part A was skipped, so this run does not prove the cap.
EXIT=0
```

Then the real run, against the container:

```
$ docker run -d --name carta-t036-pg -e POSTGRES_PASSWORD=t036 -p 55432:5432 postgres:16-alpine
$ PGPASSWORD=t036 PGPORT=55432 node continent-app/scripts/ai/test_global_cap.mjs
PART A: ai_consume against a throwaway PostgreSQL database
----------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 021_free_tier_once.sql
  ok  ai_consume exists
  ok  ai_daily_total exists
  ok  free tier allowance is 2 after 021
  ok  global cap: first call is ok
  ok  global cap: first call reports the free tier
  ok  global cap: ai_daily_total is 1 after one call
  ok  global cap: second call is ok
  ok  global cap: ai_daily_total is 2 after two calls
  ok  global cap: the call that breaches the cap returns status global_cap
  ok  global cap: the breach still names the tier
  ok  global cap: the breach is not reported as ok
  ok  global cap: ai_daily_total stays at the cap, it does not overshoot
  ok  global cap: the breaching user keeps their unit, ai_usage rolled back
  ok  global cap: a user with headroom is still refused once the day is full
  ok  global cap: ai_daily_total unchanged by the refused call
  ok  global cap: the refused user keeps the unit they did not spend
  ok  user cap: a call inside the allowance is ok
  ok  user cap: ok reports the allowance left
  ok  user cap: exceeding the free allowance returns status user_cap
  ok  user cap: user_cap is distinct from global_cap under a generous global cap
  ok  user cap: user_cap reports nothing left
  ok  user cap: the refused call did not raise ai_usage past the cap
  ok  user cap: a zero allowance surface is refused as user_cap
  ok  user cap: a zero allowance never writes to ai_usage
  ok  ai_consume rejects an unknown kind without throwing

PART B: the consume() contract in _shared/passes.mjs
----------------------------------------------------
  ok  consume: passes the status through unchanged
  ok  consume: a global cap is not ok
  ok  consume: the tier survives for the 429 body
  ok  consume: calls the ai_consume RPC
  ok  consume: forwards the global cap argument
  ok  consume: forwards the user and the kind
  ok  consume: a user cap is not ok either
  ok  consume: a user cap keeps cap and used for the 429 body
  ok  consume: only status ok is ok
  ok  consume: a grant keeps its counters
  ok  consume: an RPC error returns status quota_check
  ok  consume: an RPC error is not ok
  ok  consume: an RPC error falls back to the free tier
  ok  consume: an RPC error never reports a cap status
  ok  consume: an empty result is not a grant
  ok  refund: swallows its own failure
  ok  resolveTier: a forbidden answer becomes null
  ok  tiers: free, trip, year in order
  ok  tiers: only trip and year are buyable
  ok  plan-day: still diverts quota_check to 503
  ok  plan-day: still turns a non-ok quota into 429

49 assertions, 49 passing, 0 failing.
All quota cap tests passed.
EXIT=0
```

A green test that would be green anyway proves nothing, so the cap guard was then deleted from a working copy of the migration and the test re-run. Removing the single line `where d.n < p_global_cap` from the `ai_daily_total` upsert turned seven assertions red and the exit code to 1:

```
$ PGPASSWORD=t036 PGPORT=55432 node continent-app/scripts/ai/test_global_cap.mjs
FAIL  global cap: the call that breaches the cap returns status global_cap: {"cap":2,"left":1,"tier":"free","used":1,"status":"ok"}
FAIL  global cap: the breach is not reported as ok: {"cap":2,"left":1,"tier":"free","used":1,"status":"ok"}
FAIL  global cap: ai_daily_total stays at the cap, it does not overshoot: got 3
FAIL  global cap: the breaching user keeps their unit, ai_usage rolled back: before 0, after 1
FAIL  global cap: a user with headroom is still refused once the day is full: {"cap":2,"left":0,"tier":"free","used":2,"status":"ok"}
FAIL  global cap: ai_daily_total unchanged by the refused call: got 4
FAIL  global cap: the refused user keeps the unit they did not spend: got 2
49 assertions, 42 passing, 7 failing.
EXIT=1
```

The migration was restored immediately afterwards and the container removed. No Gemini quota was spent during this task and the live Supabase project was never touched.

## Config and secrets set

None. `AI_GLOBAL_DAILY_CAP` keeps its default of 200, read by `plan-day/index.ts` and passed to `ai_consume` on every request.

The test reads `PGPASSWORD`, `PGHOST`, `PGPORT` and `PGUSER` from the environment and creates a database named `carta_t036_test`, which it drops again at the end. None of that is a project secret and nothing is stored.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Assertions in test_global_cap.mjs | 0 | 49 |
| Assertions passing in the recorded run | 0 of 0 | 49 of 49 |
| Assertions exercising real SQL | 0 | 28 |
| Exit code on a broken global cap | 0 | 1 |
| Assertions that turn red when the cap guard is removed | 0 | 7 |
| Migrations applied and exercised by the test | 0 | 3 |
| Global daily cap value | 200 | 200 |

## What broke and how it was fixed

The previous version of this task shipped a test that could not fail, and a report that read its output as six passing specifications. That is the thing this task fixed. The lesson generalises: a script whose only verb is `console.log` has no verdict, and any report that quotes one as evidence is quoting itself.

Two smaller things surfaced while writing the real test.

The local PostgreSQL 18 server on port 5432 is running but rejected `postgres` with every credential this session could legitimately try, and there is no pgpass file. Searching the machine for the password is not something a task should do, so the test was built to skip loudly without one and was run against a container instead. The skip path is exercised above so it is known to work rather than assumed to.

Applying 006 and 007 to a bare PostgreSQL needs stubs for what Supabase supplies: the `auth` schema, `auth.users` for the foreign keys, `auth.uid()` for the RLS policies and the `ai_status` guard, and the `service_role`, `authenticated` and `anon` roles the grant statements name. Those stubs live in the test file. They are minimal on purpose: the test proves the migrations' own logic, not Supabase's.

No later migration redefines `ai_consume`, `ai_usage`, `ai_daily_total` or `plan_tiers`. 021 does redefine `ai_resolve_tier` and `ai_status`, which is why it is in the chain and why the test asserts the free allowance is 2 rather than 3. Migrations 014 to 016 only read these objects from admin functions, so they are out of scope.

## What is still open

Two items, both user-owned, both already rows in `_OPEN.md`.

T036-a is the Google Cloud budget itself. No code can create it and the console does not run here. The procedure is unchanged:

1. Open Billing, then Budgets and alerts, in the Google Cloud console.
2. Create budget, named "Carta Gemini usage cap".
3. Scope it to the project that issued `GEMINI_API_KEY`.
4. Amount EUR 50, period monthly.
5. Add alert thresholds at 50 percent, 90 percent and 100 percent, each emailing the billing account owner.
6. Save.

T036-b is the live 429. It stays user-owned because the mapping lives in Deno TypeScript and Deno is not installed on this machine, so the deployed function cannot be exercised from here. What the code path does is not in doubt. `plan-day/index.ts` line 340 calls `consume(service, user.id, 'plan', GLOBAL_CAP)`. Line 341 sends the one non-cap failure, status `quota_check`, to `json(503, { code: 'quota_check' })`. Line 342 tests `!quota.ok`, which is true for both `user_cap` and `global_cap` because `consume()` sets `ok` only on status `ok`, and returns `json(429, { code: quota.status, tier: quota.tier, cap: quota.cap ?? 0, used: quota.used ?? 0 })`. So a global cap produces HTTP 429 with a JSON body whose `code` is the literal string `global_cap`, whose `tier` is the caller's tier, and whose `cap` and `used` are both 0, since `ai_consume` omits those fields on a global-cap return and the nullish coalescing supplies zeros. `json()` is a plain `new Response(JSON.stringify(body), { status, headers })` with no awaits and no throwing calls, and there is nothing between the `consume()` await and the `return` but two comparisons and four property reads. There is no exception path, and no way for a global cap to surface as a 500.

Part B asserts both of those source lines by pattern, so a refactor that moves the 429 elsewhere fails this test rather than passing it quietly.

The procedure for T036-b is unchanged: set `AI_GLOBAL_DAILY_CAP` to 1 in the Supabase Dashboard under the plan-day function, make two authenticated plan-day requests, confirm the first is 200 and the second is 429 with `code: "global_cap"`, then restore the cap to 200.

A third item is worth recording rather than leaving as tribal knowledge: Part A only ran because Docker was available. On a machine with neither Docker nor a password for the local server, this test degrades to Part B. That is recorded as a new row so whoever hits the skip knows it is expected and knows the command that turns it green.

## Rollback procedure

The test script is the only file changed.

```
git -C continent-app checkout HEAD~1 -- scripts/ai/test_global_cap.mjs
git -C "Travel App" checkout HEAD~1 -- Execution/P2/T036-gemini-budget-caps.md
```

To drop the branch entirely:

```
git checkout p2-paywall-funnel-instrumentation
git branch -D p2-gemini-budget-caps
```

Nothing in the runtime changed, so there is nothing in production to roll back. The throwaway test database is dropped by the test itself, and the container used for the recorded run was removed at the end of the task.

## How to verify this is complete

Run the test. With a PostgreSQL server reachable and a password in `PGPASSWORD` it prints 49 assertions, 49 passing, and exits 0. Without one it prints a loud SKIPPED for Part A, runs Part B's 21 assertions, and says in as many words that the run does not prove the cap.

```
PGPASSWORD=<password> PGPORT=<port> node continent-app/scripts/ai/test_global_cap.mjs
```

T036-a and T036-b remain open and are the user's to close.
