# T037: Verify ai_consume, ai_refund and the grounded counter

## Task ID

T037

## Date

2026-09-24

## What changed

The three claims that hold the AI cost ceiling up are now tested rather than commented. Before this task one script exercised the quota layer, `test_global_cap.mjs` from T036, and it tested the global daily ceiling: 49 assertions, of which 21 ran without a database. It did not test a grant, it did not test `ai_refund` at all, and it did not touch the separation between the `plan` and `ground` counters. After this task a second script, `continent-app/scripts/ai/test_ai_quota.mjs`, adds 105 assertions covering exactly those gaps.

No bug was found. All four call sites already branch correctly and plan-day's grounded path already asks for kind `ground`. That is the outcome the prompt asked to be prepared for, and it is worth stating plainly: the code was right, and it is now right provably rather than by reading.

The separation matters more than its size suggests. Grounded search is the only Gemini surface Google meters per query, and on Gemini 3 one grounded generation bills per search the model chooses to run, so a single request can be several billed units. If it rode on the `plan` counter, the expensive surface would be metered by the cheap one's ceiling, and the Year Pass would be selling 300 generations of a thing priced for 120. The test now asserts that the two are distinct rows of `ai_usage`, that a spend of one leaves the other at its old value, that a refund of one does not credit the other, and that exhausting the grounded allowance does not take plan spends down with it.

The script has three parts and is explicit about what each one can prove.

Part A runs real SQL. It reuses the pattern T036 established: a throwaway database on a PostgreSQL server, stubs for the handful of Supabase objects the migrations lean on (schema `auth`, `auth.users`, `auth.uid()`, the three roles), then migrations 006, 007 and 021 applied in order, then assertions driven through `psql`. Sixty-two assertions in five groups: grant only on `ok`, a cap rejection that moves neither counter, refund arithmetic, the plan and ground separation, and the free epoch.

The refund group is the one that would be easy to get wrong by hand. It asserts that a spend raises both `ai_usage` and `ai_daily_total`, that one refund returns exactly one unit from each, that a double refund cannot drive either below zero, and then, crucially, that the refunded allowance is genuinely spendable again and that the cap still bites after it. A refund that floors at zero but never restores the allowance would pass a naive assertion and still be broken.

The free epoch group is the awkward one, because the question is about time and a test cannot wait a month. `now()` cannot be moved inside a session and moving the container clock would make the run irreproducible. What the test does instead is stronger than a clock move: it makes the database look as it would after a month has passed under both schemes at once. The unit the user really spent sits on the epoch row, and a decoy row is written under the month-start period a monthly scheme would now be keying on, filled to the cap. If `ai_consume` still keyed on the month it would read the decoy, not the epoch. It reads the epoch, so the earlier spend still counts, the second spend is the last one, and the third is refused. `ai_status` is then asserted to agree, because that is what the UI renders: two of two used, nothing left, and `resetsAt` null rather than a refill date that is never coming.

Part B imports the real `passes.mjs` with a stub client. Its most useful assertion is a loop over six status strings including the empty one, asserting `ok` is true for `'ok'` and false for every other, which is the property the whole layer rests on. It also asserts that `refund` forwards the kind it was given rather than a default, since forwarding the wrong kind is precisely how a failed grounded call would credit plan quota.

Part C is a source pattern check and says so, in the console output as well as the header. The Edge Functions are Deno and are not executed. It discovers the call sites rather than listing them, by walking `supabase/functions` for files that import `consume` from `passes.mjs`, so a fourth function added later is checked automatically instead of being silently missed. For each one it asserts that every `await consume()` result is branched on, that the branch appears after the call and before the Gemini fetch, and that the file imports and calls `refund`. A pattern check cannot prove runtime behaviour. What it can prove is that a refactor removing the branch does not pass this file quietly, which is the failure mode worth catching.

One detail in Part C is worth recording because it cost a run. The branch search is anchored from the `consume()` call onward, not from the top of the file. `parse-booking/index.ts` validates an upload with an unrelated `.ok` check about 1.2 KB before it spends anything, and a whole-file search matched that instead, reporting a branch that precedes the consume call. The first version of the test failed on it. Matching an unrelated `.ok` would have proved nothing either way.

## Files touched

Created (app repo):

- `continent-app/scripts/ai/test_ai_quota.mjs`

Created (root repo):

- `Execution/P2/T037-ai-quota-enforcement-tests.md`

Modified (root repo):

- `Execution/_OPEN.md`

Read but not modified:

- `supabase/functions/_shared/passes.mjs`
- `supabase/functions/plan-day/index.ts`, `suggest-city/index.ts`, `parse-booking/index.ts`
- `supabase/migrations/006_ai_day_planner.sql`, `007_passes.sql`, `021_free_tier_once.sql`
- `continent-app/src/lib/pricing.js`
- `continent-app/scripts/ai/test_global_cap.mjs`, which belongs to T036 and was not edited

`007_passes.sql` was temporarily edited for the negative control below and restored in the same session. `git status` on it is clean.

Both repos carry pre-existing uncommitted changes from earlier tasks. In the app repo 36 files show as modified with empty diffs, which is a line-ending artefact from earlier work and includes `scripts/ai/test_plan_logic.mjs`. None of it is this task's and none of it was staged.

## Commands run

The container, following the T036 pattern, on a different port so a T036 container could coexist:

```
docker run --rm -d --name carta-t037 -e POSTGRES_PASSWORD=t037 -p 55433:5432 postgres:16-alpine
```

The skip path first, against the local PostgreSQL 18 server on 5432 whose password is still unknown to this session (see `_OPEN.md` row T036-c):

```
$ node continent-app/scripts/ai/test_ai_quota.mjs
PART A: ai_consume and ai_refund against a throwaway PostgreSQL database
------------------------------------------------------------------------

  SKIPPED. Part A did not run, so nothing about ai_consume, ai_refund or the
  plan/ground separation was proved here.
  Reason: could not connect to postgres@127.0.0.1:5432. psql: error: connection
  to server at "127.0.0.1", port 5432 failed: fe_sendauth: no password supplied

  To run it, point the script at a PostgreSQL server you can write to:
    PGPASSWORD=<password> PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
      node continent-app/scripts/ai/test_ai_quota.mjs
[...]
SKIP EXIT=0
```

Then the real run:

```
$ PGPASSWORD=t037 PGPORT=55433 node continent-app/scripts/ai/test_ai_quota.mjs
PART A: ai_consume and ai_refund against a throwaway PostgreSQL database
------------------------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 021_free_tier_once.sql
  ok  grant: the first free plan returns status ok
  ok  grant: a grant reports the tier that granted it
  ok  grant: a grant reports the cap it spent against
  ok  grant: a grant reports used 1 and left 1
  ok  grant: the ledger records exactly one unit
  ok  grant: the second free plan is still ok
  ok  grant: the second grant reports nothing left
  ok  cap reject: a third free plan returns status user_cap
  ok  cap reject: the refusal is not status ok
  ok  cap reject: the refusal reports nothing left
  ok  cap reject: ai_usage did not move
  ok  cap reject: ai_usage never exceeds the cap
  ok  cap reject: ai_daily_total did not move
  ok  cap reject: a global cap of 0 refuses with status global_cap
  ok  cap reject: a global refusal is not status ok
  ok  cap reject: a global refusal leaves the user ledger untouched
  ok  refund: the spend being refunded was a grant
  ok  refund: the spend raised ai_usage to 1
  ok  refund: the spend raised ai_daily_total by 1
  ok  refund: exactly one unit comes back from ai_usage
  ok  refund: exactly one unit comes back from ai_daily_total
  ok  refund: a double refund never drives ai_usage below zero
  ok  refund: a double refund never drives ai_daily_total below zero
  ok  refund: the refunded allowance is spendable again
  ok  refund: and the cap still bites after it
  ok  refund: an unknown kind is a silent no-op
  ok  separation: a paid plan spend is ok
  ok  separation: a plan spend is measured against the plan cap of 60
  ok  separation: the plan spend hit the plan counter
  ok  separation: the plan spend left the ground counter at zero
  ok  separation: a grounded spend is ok
  ok  separation: a grounded spend is measured against the grounded cap of 40
  ok  separation: the grounded spend hit the ground counter
  ok  separation: the grounded spend left the plan counter untouched
  ok  separation: ai_status reports the two counters apart
  ok  separation: ai_status reports the two caps apart
  ok  separation: refunding ground returns the ground unit
  ok  separation: refunding ground does not touch the plan counter
  ok  separation: refunding plan returns the plan unit
  ok  separation: refunding plan does not mint a ground unit
  ok  separation: plan and ground are distinct ai_usage rows
  ok  separation: an exhausted ground allowance refuses with user_cap
  ok  separation: an exhausted ground allowance does not block plan spends
  ok  separation: the free tier is refused grounded search as user_cap
  ok  separation: a zero grounded allowance writes no ledger row
  ok  free epoch: ai_free_epoch exists and is 1970-01-01
  ok  free epoch: plan_tiers says the free allowance is 2
  ok  free epoch: the free tier has no period_days, so it is not monthly
  ok  free epoch: ai_resolve_tier pins a free user to the epoch
  ok  free epoch: the first free spend is ok
  ok  free epoch: it landed on the epoch row
  ok  free epoch: the month-keyed decoy row exists and is full
  ok  free epoch: a spend 31 days later still counts against the same two
  ok  free epoch: the third spend is refused, the allowance did not refill
  ok  free epoch: a stray month-keyed row is ignored, not counted
  ok  free epoch: the stray month row still exists and was never touched
  ok  free epoch: ai_status reports 2 of 2 used and 0 left
  ok  free epoch: ai_status reports no reset date for the free tier
  ok  free epoch: ai_status names the epoch as the period

PART B: the consume() and refund() contract in _shared/passes.mjs
-----------------------------------------------------------------
  ok  consume: status ok is ok only when it is 'ok'
  ok  consume: status user_cap is ok only when it is 'ok'
  ok  consume: status global_cap is ok only when it is 'ok'
  ok  consume: status bad_kind is ok only when it is 'ok'
  ok  consume: status quota_check is ok only when it is 'ok'
  ok  consume: status (empty) is ok only when it is 'ok'
  ok  consume: the kind reaches the RPC unchanged
  ok  consume: a grant keeps the server counters
  ok  consume: an RPC error becomes status quota_check, not a cap
  ok  consume: an empty result is not a grant
  ok  refund: calls the ai_refund RPC
  ok  refund: forwards the kind it was given, not a default
  ok  refund: forwards the user
  ok  refund: swallows its own failure

PART C: call-site source patterns (a pattern check, not an execution test)
--------------------------------------------------------------------------
  The Edge Functions are Deno and are not executed here. What follows reads
  their source and asserts the branch is present and precedes the fetch.
  ok  call sites: at least three Edge Functions spend quota
  ok  supabase/functions/parse-booking/index.ts: has at least one consume() call
  ok  supabase/functions/parse-booking/index.ts: the result of consume() (quota) is branched on
  ok  supabase/functions/parse-booking/index.ts: a quota branch exists after the consume() call
  ok  supabase/functions/parse-booking/index.ts: the quota branch precedes the Gemini call
  ok  supabase/functions/parse-booking/index.ts: imports refund as well as consume
  ok  supabase/functions/parse-booking/index.ts: calls refund on a failure path
  ok  supabase/functions/plan-day/index.ts: has at least one consume() call
  ok  supabase/functions/plan-day/index.ts: the result of consume() (quota) is branched on
  ok  supabase/functions/plan-day/index.ts: the result of consume() (g) is branched on
  ok  supabase/functions/plan-day/index.ts: a quota branch exists after the consume() call
  ok  supabase/functions/plan-day/index.ts: the quota branch precedes the Gemini call
  ok  supabase/functions/plan-day/index.ts: imports refund as well as consume
  ok  supabase/functions/plan-day/index.ts: calls refund on a failure path
  ok  supabase/functions/suggest-city/index.ts: has at least one consume() call
  ok  supabase/functions/suggest-city/index.ts: the result of consume() (quota) is branched on
  ok  supabase/functions/suggest-city/index.ts: a quota branch exists after the consume() call
  ok  supabase/functions/suggest-city/index.ts: the quota branch precedes the Gemini call
  ok  supabase/functions/suggest-city/index.ts: imports refund as well as consume
  ok  supabase/functions/suggest-city/index.ts: calls refund on a failure path
  ok  plan-day: the grounded path consumes kind 'ground'
  ok  plan-day: the ordinary path consumes kind 'plan'
  ok  plan-day: grounding is only switched on when that consume() was ok
  ok  plan-day: a refused grounded unit degrades instead of being spent
  ok  plan-day: google_search is gated on useGrounding
  ok  plan-day: the refund loop walks the kinds actually spent
  ok  suggest-city: picks the kind from whether grounding is on
  ok  suggest-city: refunds the kind it actually spent
  ok  parse-booking: spends 'plan' and never grounds

105 assertions, 105 passing, 0 failing.
All AI quota enforcement tests passed.
EXIT=0
```

The container was removed afterwards with `docker rm -f carta-t037`.

## Negative control

A test that has never failed is a test whose assertions have never been shown to bind. The zero floor in `ai_refund` was removed in a working copy of 007, changing both `greatest(0, n - 1)` to a plain `n - 1`, and the suite re-run:

```
$ PGPASSWORD=t037 PGPORT=55433 node continent-app/scripts/ai/test_ai_quota.mjs
FAIL  refund: a double refund never drives ai_usage below zero: got -2
FAIL  refund: and the cap still bites after it
105 assertions, 103 passing, 2 failing.
EXIT=1
```

Two assertions caught it, and the second is the interesting one. Without the floor a double refund leaves the ledger at -2, which means the next four spends are all grants: the user has been minted two free generations out of an outage. That is not an abstract off-by-one, it is the exact mechanism the floor exists to prevent, and the test now fails when it is gone.

The file was restored with `cp /tmp/007.bak supabase/migrations/007_passes.sql`, `git status` on it confirmed clean, and the suite re-run to 105 passing before anything was committed.

## Config and secrets set

None. No secret was read, written or deployed, nothing was pushed to Supabase, and no request reached Gemini. The only credential used was `POSTGRES_PASSWORD=t037` on a throwaway container that no longer exists.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Assertions covering the AI quota layer | 49 (T036, global cap only) | 154 (49 plus 105) | +105 |
| Assertions in this task's run | 0 | 105 passing, 0 failing | +105 |
| Assertions that run without a database | 21 | 64 (21 plus 43) | +43 |
| `consume()` call sites checked | 1 (plan-day, by hand in prose) | 3, discovered by walking the tree | +2 |
| Grant paths tested | 0 | 5 | +5 |
| `ai_refund` assertions | 1 (that the JS wrapper swallows a throw) | 14 | +13 |
| Plan and ground separation assertions | 0 | 15 | +15 |
| Free epoch assertions | 1 (that the cap is 2) | 13 | +12 |
| Bugs found in the code under test | n/a | 0 | n/a |
| Negative control failures observed | n/a | 2 | n/a |

## What broke and how it was fixed

No bug was found in the code under test. One bug was found in the test itself during development.

| What | Cause | Fix |
|---|---|---|
| Part C reported a quota branch preceding the consume call in parse-booking | The branch regex searched the whole file and matched an unrelated `.ok` check on an upload, about 1.2 KB before any quota is spent | Anchor the search to the slice from the first `await consume(` onward, so only branches that could be the quota branch are matched |

For the record, because the prompt named them as the bugs to look for and neither exists: all three Edge Functions branch on `quota.ok` or `quota.status` before the Gemini fetch, and plan-day's grounded path calls `consume(service, user.id, 'ground', GLOBAL_CAP)` and only sets `useGrounding` when that returns ok. suggest-city has the subtler version right too, refunding `spentKind` rather than the kind it wanted, so a grounded call that degraded to plan does not refund a paid grounded unit it never spent. No production file was edited.

## What is still open

Part A needs a writable PostgreSQL server and there is still no password for the local one on 5432, so this suite has the same dependency `test_global_cap.mjs` does. That is already the register's row T036-c and it is not re-raised here; the row is simply now true of two scripts rather than one, and the recorded run used a container.

Neither this suite nor T036's runs anywhere but by hand. CLAUDE.md records that tests are not wired to CI, so nothing re-runs these when `passes.mjs`, the Edge Functions or migration 007 change, and Part C in particular is worth only as much as its next run. A cheap npm script that runs both, and a note in the pipeline docs, is the obvious next step and is raised as T037-a.

Part C is a pattern check and cannot prove runtime behaviour. The live 429 and the live refund against the deployed functions remain unproved by anything in this repository. That is the same gap T036 recorded as T036-b, which covers the 429; the refund half of it has never been checked against the live project and is raised here as T037-b.

One thing found while reading that is not this task's to fix: `ai_refund` decrements `ai_daily_total` for `current_date` unconditionally, so a request that spends quota just before midnight and fails just after returns the user's unit but takes the decrement from the next day's shared ceiling, which by then holds someone else's usage. The window is small and the error is one unit in the safe direction for the user, but it is a real arithmetic hole in a counter the cost ceiling depends on. Raised as T037-c.

## Rollback procedure

Nothing in this task changed behaviour, so rollback is a file deletion and two reverts. In the app repo, `git revert <app commit>` or simply delete `continent-app/scripts/ai/test_ai_quota.mjs`; nothing imports it and nothing runs it automatically. In the root repo, `git revert <root commit>` removes the report and the register rows. The branch `p2-ai-quota-enforcement-tests` exists in both repos and neither was merged, so discarding the branch is also sufficient.

No migration was applied anywhere, no live data was touched, and the throwaway container has been removed. The only lasting artefact outside git is that no artefact exists outside git.
