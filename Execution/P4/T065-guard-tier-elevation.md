# T065: Elevate guard tiers on the three live-effect RPCs

## Task ID

T065

## Date

2026-09-28

## What changed

`admin_set_config`, `admin_set_override` and `admin_set_feedback_status` now
call `admin_guard('destructive')` instead of `admin_guard('read')`. These are
the admin functions whose effect is live the moment they return: the site
notice, maintenance mode and feature flags, the catalogue corrections laid
over the static layers, and the feedback inbox. The change ships as a new
migration, `supabase/migrations/034_admin_guard_tiers.sql`, not applied to the
live project. A test against a throwaway database proves that all three now
hit the destructive gate where they did not before.

### What the destructive tier actually is

The word suggests a role. It is not one. `admin_guard` (015) first refuses
anyone who is not in `admin_users` with `forbidden`, the same for both tiers.
After that the tiers differ only in rate budget, counted against the caller's
own rows in `admin_audit_log` in the last 60 seconds. The read tier refuses
with `slow_down` once the caller has 60 or more rows of any action in the
window. The destructive tier does the same, and also refuses with `slow_down`
once the caller has 10 or more rows whose action is one of `set_tier`,
`reset_quota`, `delete_user`, `ban_user` or `unban_user`. The error word is
`slow_down`; there is no `rate_limited` word anywhere in the schema, and the
admin page already translates `slow_down` into "Too many admin actions in one
minute. Wait a moment."

That list of five action names is the important detail. The three functions
in this task log `set_config`, `override_set`, `override_clear` and
`feedback_new`, `feedback_open` or `feedback_done`, none of which is in the
list. So their own calls do not count toward the destructive budget. The
consequence, measured below, is that an admin saving the Site tab eleven times
in a minute is not refused any sooner than before: the overall cap of 60 is
still what stops them. What a caller now hits that it did not before is this:
an admin who has done ten or more tier changes, quota resets, deletes, bans or
unbans in the last minute is now also refused on config, override and
feedback saves, where before 034 those went through until the overall count
reached 60. In practice this couples the live-effect functions to the
throttle that already sits on the account-level destructive actions, which is
the behaviour of a stolen admin session running a script across the admin
surface. Making these functions count toward the destructive budget
themselves would mean adding their action names to `admin_guard`, which
changes a function the task did not name and every other caller of it; that
is register row T065-b.

T063's MFA rule is separate. It is an explicit `auth.jwt() ->> 'aal'` check
written inside `admin_delete_user` and `admin_ban_user`, not part of
`admin_guard('destructive')`. None of the three functions here gained an aal2
check. Whether they should is T063-e, an owner decision.

### How 034 was built

Each function is re-created from its current body with one string changed.
`admin_set_config` and `admin_set_override` come from 033 (T064), so they keep
the previous-and-new audit detail. `admin_set_feedback_status` comes from 017.
To make sure nothing else moved, the three bodies were cut out of 033 and 017
by a small script that also refuses unless each body holds exactly one
`admin_guard('read')`, and then a diff of the source slices against 034 shows
only that string. The grants are restated as in 033. The header says all of
this and explains the tier semantics above, so the next reader does not have
to open 015.

The self-check at the bottom asserts that `site_config`, `content_overrides`
and `feedback` exist, that each function is SECURITY DEFINER, that anon cannot
execute it and authenticated can, and, through `pg_get_functiondef`, that each
calls `admin_guard('destructive')` and no longer `admin_guard('read')`. It also
asserts the two 033 bodies still carry `'previous'` and `for update`, so a 015
or 018 body pasted by mistake cannot pass the tier check while silently losing
the audit state. On success it prints "admin guard tiers self-check passed".

### A regression found on the way, not fixed here

017 re-created `admin_set_config` to add a shape check for the `maintenance`
key (`enabled` boolean, `message` string up to 500 characters). 033 re-created
the function from its 015 body instead, so that check has been missing since
033, and because this task builds on 033 and may change only the tier, 034
carries the gap forward. The T064 test did not catch it because it never
applied 017. This test applies 017 and prints the observation without
asserting it: a malformed maintenance value `{"enabled": "yes"}` now returns
`{"ok": true}`, where 017 answered `bad_value`. The app always sends the right
shape, so nothing breaks today, but the server no longer guards it. The fix
is a new migration that puts the 017 maintenance branch back into the 034
body (T065-c).

### An ordering hazard

033's own self-check asserts that both of its functions call
`admin_guard('read')`. That is fine when 033 runs before 034. But if 033 is
ever pasted again after 034, it silently puts `admin_set_config` and
`admin_set_override` back on the read tier, and its self-check passes. The
test proves this and proves that pasting 034 again restores the destructive
tier. The rule is simple: 034 always goes after 033, including after any
re-paste of 033.

### The existing T064 test

`continent-app/scripts/admin/test_admin_audit_rollback.mjs` asserts, for both
033 functions, "guard tier is still admin_guard('read')". It applies
migrations up to 033 only, so it still passes: it was re-run on the same
cluster during this task and reported 67 of 67. Those two assertions are
pinned to the pre-034 state, though, and would fail if that test were ever
extended to apply 034. The test was not edited (out of scope); this is
register row T065-e.

### The admin screen

No app file was changed. `admin_set_config` and `admin_set_override` errors
reach the screen through `errText`, which already maps `slow_down`, so the
Site tab and the content editor show the right sentence. The feedback inbox
does not: `useModerationQueue.js` catches every error from
`adminSetFeedbackStatus` and drops it, so a refused triage click leaves the
row unchanged with no message. That was already true for the 60-a-minute cap;
034 adds one more way to reach it. A UI task should surface the error there
(T065-d).

### The test

`continent-app/scripts/admin/test_admin_guard_tiers.mjs` is the T064 harness
with the same stubs, roles, psql through `spawnSync`, loud skip, and "zero
assertions is a failure" rule. It applies 006, 007, 010, 014, 015, 016, 017,
018 (the `{5,255}` copy from a temp directory after the committed file fails,
as in T064), 032 and 033. For the baseline it checks each function's
`pg_get_functiondef` for the read tier, shows each still succeeds with ten
destructive-kind audit rows in the window, and measures capacity. It then
applies 034 and checks the definitions again; with ten destructive rows each
function returns exactly `{"error": "slow_down"}`, changes no row and writes
no audit row; with nine each succeeds; on an empty log each succeeds; a
non-admin gets exactly `{"error": "forbidden"}`; rows older than 60 seconds do
not count. Capacity is measured again, the 033 audit detail and validations
are checked, and the re-paste hazard is exercised.

Capacity is measured by running 70 calls in one psql session, each statement
its own transaction, and counting the successes before the first refusal. The
destructive-kind rows are inserted directly into `admin_audit_log` as the
superuser with `created_at = now()`, exactly as `admin_set_tier` and the others
would have written them, and ten is under the read cap of 60, so any refusal
at that point can only come from the destructive rule.

Docker was not running and the local 5432 service has an unknown password, so
the run used a throwaway trust-auth PostgreSQL 18 cluster in the session
scratchpad on port 55434, stopped and deleted afterwards. The real output:

```
admin_set_config, admin_set_override and admin_set_feedback_status pass the destructive gate (migration 034)
-----------------------------------------------------------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 010_profiles.sql
  ok  migration applied: 014_admin.sql
  ok  migration applied: 015_admin_hardening.sql
  ok  migration applied: 016_admin_resilient.sql
  ok  migration applied: 017_admin_analytics.sql
  note  018 as committed fails here: ERROR:  2201B: invalid regular expression: invalid repetition count(s)
  ok  018 carries the {5,600} bound the failure points at
  note  applying a copy with {5,255} from a temp dir, for this test only
  ok  migration applied: 018_content_overrides.sql (patched copy, {5,255})
  ok  migration applied: 032_admin_mfa_destructive.sql
  ok  migration applied: 033_admin_audit_rollback.sql
  ok  033 self-check ran and passed

  Baseline, before 034:
  ok  before 034: public.admin_set_config(text,jsonb) calls admin_guard('read') per pg_get_functiondef
  ok  before 034: public.admin_set_config(text,jsonb) still SUCCEEDS with 10 destructive rows in the last minute
  ok  before 034: public.admin_set_override(text,text,jsonb,text) calls admin_guard('read') per pg_get_functiondef
  ok  before 034: public.admin_set_override(text,text,jsonb,text) still SUCCEEDS with 10 destructive rows in the last minute
  ok  before 034: public.admin_set_feedback_status(bigint,text) calls admin_guard('read') per pg_get_functiondef
  ok  before 034: public.admin_set_feedback_status(bigint,text) still SUCCEEDS with 10 destructive rows in the last minute
  measure  before 034, public.admin_set_config(text,jsonb): 60 accepted on an empty log (then {"error":"slow_down"}); 50 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  measure  before 034, public.admin_set_override(text,text,jsonb,text): 60 accepted on an empty log (then {"error":"slow_down"}); 50 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  measure  before 034, public.admin_set_feedback_status(bigint,text): 60 accepted on an empty log (then {"error":"slow_down"}); 50 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  ok  before 034: every function accepts the read cap (60) on an empty log
  ok  before 034: every function accepts 50 with 10 destructive rows present (60 minus 10)

  ok  migration applied: 034_admin_guard_tiers.sql
  ok  034 self-check ran and passed

  After 034, the destructive gate:
  ok  public.admin_set_config(text,jsonb) calls admin_guard('destructive') per pg_get_functiondef
  ok  public.admin_set_config(text,jsonb) no longer calls admin_guard('read')
  ok  public.admin_set_config(text,jsonb) still SECURITY DEFINER, anon cannot execute, authenticated can
  ok  public.admin_set_config(text,jsonb) with 10 destructive rows in the last minute returns exactly {error: 'slow_down'}
  ok  public.admin_set_config(text,jsonb) refused: no row changed and no audit row written
  ok  public.admin_set_config(text,jsonb) with 9 destructive rows (under the cap) still succeeds
  ok  public.admin_set_config(text,jsonb) by a plain admin on an empty log succeeds
  ok  public.admin_set_config(text,jsonb) by a non-admin returns exactly {error: 'forbidden'}
  ok  public.admin_set_override(text,text,jsonb,text) calls admin_guard('destructive') per pg_get_functiondef
  ok  public.admin_set_override(text,text,jsonb,text) no longer calls admin_guard('read')
  ok  public.admin_set_override(text,text,jsonb,text) still SECURITY DEFINER, anon cannot execute, authenticated can
  ok  public.admin_set_override(text,text,jsonb,text) with 10 destructive rows in the last minute returns exactly {error: 'slow_down'}
  ok  public.admin_set_override(text,text,jsonb,text) refused: no row changed and no audit row written
  ok  public.admin_set_override(text,text,jsonb,text) with 9 destructive rows (under the cap) still succeeds
  ok  public.admin_set_override(text,text,jsonb,text) by a plain admin on an empty log succeeds
  ok  public.admin_set_override(text,text,jsonb,text) by a non-admin returns exactly {error: 'forbidden'}
  ok  public.admin_set_feedback_status(bigint,text) calls admin_guard('destructive') per pg_get_functiondef
  ok  public.admin_set_feedback_status(bigint,text) no longer calls admin_guard('read')
  ok  public.admin_set_feedback_status(bigint,text) still SECURITY DEFINER, anon cannot execute, authenticated can
  ok  public.admin_set_feedback_status(bigint,text) with 10 destructive rows in the last minute returns exactly {error: 'slow_down'}
  ok  public.admin_set_feedback_status(bigint,text) refused: no row changed and no audit row written
  ok  public.admin_set_feedback_status(bigint,text) with 9 destructive rows (under the cap) still succeeds
  ok  public.admin_set_feedback_status(bigint,text) by a plain admin on an empty log succeeds
  ok  public.admin_set_feedback_status(bigint,text) by a non-admin returns exactly {error: 'forbidden'}
  ok  10 destructive rows older than 60 seconds do not refuse admin_set_config

  After 034, calls accepted per minute:
  measure  after 034, public.admin_set_config(text,jsonb): 60 accepted on an empty log (then {"error":"slow_down"}); 0 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  measure  after 034, public.admin_set_override(text,text,jsonb,text): 60 accepted on an empty log (then {"error":"slow_down"}); 0 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  measure  after 034, public.admin_set_feedback_status(bigint,text): 60 accepted on an empty log (then {"error":"slow_down"}); 0 accepted with 10 destructive rows in the window (then {"error":"slow_down"})
  ok  after 034: every function still accepts the read cap (60) on an empty log, since its own actions are not in the destructive list
  ok  after 034: every function accepts 0 with 10 destructive rows present, first refusal slow_down

  Unchanged by 034:
  ok  set_config and override_set still log previous and new (033)
  ok  validation still runs after the guard: bad key returns bad_key
  ok  feedback status validation unchanged: bad status returns bad_status
  note  observed, not asserted: a malformed maintenance value returns {"ok":true} (017 answered bad_value; lost in 033, see T065-c)

  Ordering hazard:
  ok  migration applied: 033_admin_audit_rollback.sql
  ok  re-pasting 033 after 034 still passes its own self-check
  ok  re-pasting 033 after 034 puts admin_set_config and admin_set_override back on admin_guard('read')
  ok  migration applied: 034_admin_guard_tiers.sql
  ok  pasting 034 again restores the destructive tier

57 assertions, 57 passing, 0 failing.
All admin guard tier tests passed.
```

The skip path was run against port 1, where nothing listens. It printed
"SKIPPED. No database was reached, so NOTHING about the guard tiers was
tested. This run proves nothing." with the connection error, and exited 0
without a pass line.

## Files touched

All paths from the repo root. The test is committed in both repos.

**Created:**
- `supabase/migrations/034_admin_guard_tiers.sql`
- `continent-app/scripts/admin/test_admin_guard_tiers.mjs`
- `Execution/P4/T065-guard-tier-elevation.md`

**Modified:**
- `Execution/_OPEN.md` (rows T065-a to T065-e)

**Not modified:** 015, 017, 018 and 033; `test_admin_audit_rollback.mjs`;
every app source file, including `useModerationQueue.js`.

## Commands run

```
git checkout -b p4-guard-tier-elevation
git -C continent-app checkout -b p4-guard-tier-elevation

# 034 assembled from the 033 and 017 bodies with the tier string swapped
# (a scratchpad node script; it refuses unless each body has exactly one
# admin_guard('read')), then diffed against the source slices.

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg65" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg65" -o "-p 55434" -l "$S/pg65.log" -w start

PGPORT=55434 node continent-app/scripts/admin/test_admin_guard_tiers.mjs
PGPORT=1 node continent-app/scripts/admin/test_admin_guard_tiers.mjs         # skip path
PGPORT=55434 node continent-app/scripts/admin/test_admin_audit_rollback.mjs  # T064 test, still 67 of 67

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg65" -m fast stop
rm -rf "${S:?}/pg65" "${S:?}/pg65.log"
```

The migration was applied only to the throwaway cluster. To apply it live,
paste the file into the Supabase SQL editor for ntssxktaduxzpsmejwyv after
033 and look for the notice "admin guard tiers self-check passed". Never
`db push`.

## Config and secrets set

None.

## Before/after measurements

Calls accepted in one minute by one admin, per function, measured by the
test. The three functions gave identical figures, so one row covers each.

| Metric | Before | After | Delta |
|---|---|---|---|
| Guard tier per `pg_get_functiondef` (each of the three) | read | destructive | changed |
| `admin_set_config` calls accepted per minute, empty log | 60 | 60 | 0 |
| `admin_set_override` calls accepted per minute, empty log | 60 | 60 | 0 |
| `admin_set_feedback_status` calls accepted per minute, empty log | 60 | 60 | 0 |
| `admin_set_config` accepted after 10 destructive-kind actions in the minute | 50 | 0 | -50 |
| `admin_set_override` accepted after 10 destructive-kind actions in the minute | 50 | 0 | -50 |
| `admin_set_feedback_status` accepted after 10 destructive-kind actions in the minute | 50 | 0 | -50 |
| Test assertions on guard tiers | 0 (no test) | 57 of 57 passing | +57 |

The unchanged 60 on an empty log is the honest result, not a failure: the
destructive rule counts five named actions and these functions log none of
them (see T065-b).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first attempt to write 034 through a Git Bash heredoc did not run | The Bash tool rejected the command while parsing the quoted SQL comments; nothing was written | Wrote the header and footer with the file tool and assembled 034 with a node script |
| Migration 018 as committed does not apply on PostgreSQL 18 | Regex bound `{5,600}` exceeds the cap of 255 (known, T031-d) | The test applies a `{5,255}` copy from a temp directory, as T064 did; 018 untouched |

## What is still open

034 is not applied live (T065-a, user). It goes into the SQL editor after 033,
so after T064-a, and it must be pasted again after any later re-paste of 033,
because 033 would otherwise put two of the functions back on the read tier
without complaint. Its self-check needs `content_overrides`, which depends on
018 landing live (T031-d, via T064-a).

The destructive budget in `admin_guard` counts five action names and none of
the new ones (T065-b, user decision, then a migration). If the owner wants a
config, override or feedback save to be limited by its own count, say ten a
minute, those action names go into the list in `admin_guard`. That also means
a burst of feedback triage would then block a ban for a minute, and vice
versa, because they would share one budget. A separate list per function, or
a second argument to `admin_guard`, avoids that coupling. The choice is the
owner's; the task named neither option.

The `maintenance` shape check from 017 has been missing since 033 and is
carried by 034 (T065-c, next task). A new migration should put the 017
`maintenance` branch back into the current 034 body, keeping the destructive
tier and the 033 audit detail, and add an assertion for it to a test.

The feedback inbox swallows every error from `adminSetFeedbackStatus`,
including `slow_down` (T065-d, next task). The Site tab and content editor
show it; the inbox should too.

`test_admin_audit_rollback.mjs` asserts the read tier for both 033 functions
(T065-e, next task). It passes as written because it stops at 033, but its
two tier assertions are pinned to the pre-034 state and should be reworded,
for example to "the tier is whatever 033 set", or the test should apply 034
and assert destructive, if it is ever extended.

No earlier `next task` row covers these three functions or `admin_guard`, so
none was closed. T063-e (aal2 on more functions) stays with the owner, and
T031-d asks for an edit to 018, outside this task.

## Rollback procedure

Before 034 is applied live, rollback is a git revert: in the root repo,
`git revert` the report commit and `16956c6f7`; in `continent-app`,
`git revert 05e84da`. Or drop the branch `p4-guard-tier-elevation` in both
repos.

After 034 is applied live, paste into the Supabase SQL editor the
`admin_set_config` and `admin_set_override` definitions from
`supabase/migrations/033_admin_audit_rollback.sql` (the whole 033 file is fine;
its self-check expects the read tier and will pass) and the
`admin_set_feedback_status` definition, only that function, from
`supabase/migrations/017_admin_analytics.sql`. Do not re-run 017 whole: it
would also replace `admin_set_config` with its 017 body and drop the 033 audit
detail. 034 changes no table and no row, so there is nothing else to undo.
