# T064: Make the audit log hold rollback state

## Task ID

T064

## Date

2026-09-28

## What changed

The two admin functions that change what every visitor sees without a deploy,
`admin_set_config` and `admin_set_override`, now write the row as it was and
the row as it became into the audit trail. Before this task a `set_config`
audit row held `{key, value}` and an `override_set` row held
`{layer, item, patch}`: the new value only. When a bad banner or a wrong
photograph went live, the trail said what it had become and nothing about what
it had been, so there was no way back short of a backup. Now every such row
carries a `previous` and a `new` object, and a maintainer can put the old row
back from the audit row alone. A test against a throwaway database proves
that for an existing config key, a first-time config key, an override set, an
override update and an override clear.

The change ships as a new migration,
`supabase/migrations/033_admin_audit_rollback.sql`, which re-creates both
functions from their 015 and 018 bodies. It is not applied to the live
project.

### How it works

Each function still validates its input exactly as before. Then, before it
writes, it reads the current row with `SELECT ... FOR UPDATE` and builds the
`previous` object from it. `FOR UPDATE` holds a lock on that row until the
transaction ends, so a second admin saving the same key at the same moment
waits instead of slipping a write in between the read and the upsert, and the
`previous` each of them logs is the true one. The write itself (the upsert,
or the delete for an empty override patch) is unchanged. The audit detail is
then widened.

For `set_config` the detail is now:

```
{"table": "site_config", "key": ..., "value": <new>,
 "previous": {"exists": true, "value": ..., "updatedAt": ..., "updatedBy": ...}
          or {"exists": false},
 "new": {"exists": true, "value": <new>}}
```

For `override_set` it is `table`, `layer`, `item`, `patch` (all as before
except `table`), plus `previous` with `exists`, `patch`, `note`, `updatedAt`
and `updatedBy`, plus `new` with `exists`, `patch` and `note`. For
`override_clear` it is `table`, `layer`, `item`, `previous`, and
`new: {"exists": false}`. A clear therefore records the row it deleted, which
was the case the task singled out.

A few choices are worth knowing about. The "no row before" marker is
`{"exists": false}` rather than a bare null, because unknown site_config keys
carry only a size cap, so a stored value can itself be the JSON literal null,
and a null `previous` could not tell "the key did not exist" from "the key
held null". The row names its table so it is self-describing without decoding
the action word. The override's `new` is read back through `RETURNING` rather
than copied from the arguments, because the upsert keeps the old note when no
new note is given, and the log should show what the table actually holds.
`previous` includes `updatedAt` and `updatedBy`, so a revert can restore the
row exactly, provenance included. Every field the old detail carried is still
there under the same name, so anything reading `detail.key`, `detail.value`
or `detail.patch` keeps working.

### Reverting by hand

The 033 header holds the two SQL statements a maintainer pastes into the SQL
editor with nothing but the audit row id. For a config row they upsert
`detail.previous.value` (with its timestamp and author) under `detail.key`
when `previous.exists` is true, and delete the key when it is false. For an
override row they do the same on `(layer, item)` with `patch` and `note`. The
test runs exactly those statements. Re-saving `previous.value` through the
admin page's own RPC also works and is itself logged, but it cannot delete a
key that was new, and it cannot set an override note back to empty, because
the RPC keeps an old note when given none. For those two cases the SQL is the
revert.

### What did not change

Both functions stay on `admin_guard('read')`. Raising their tier is T065's
change, and doing it here would mix two changes in one task. The validation,
the upsert, the empty-patch-deletes rule, the note coalesce, the return shapes
(`{ok: true}`, `{ok: true, cleared: true}`, `{error: word}`) and the grants
are as they were. A diff of the 015 and 018 bodies against the 033 bodies
shows only the new variables, the read, the `RETURNING` clause and the wider
`admin_log` argument. A refused call still writes no audit row. The
migration's self-check asserts that both functions are SECURITY DEFINER, that
anon cannot execute them, that both still call `admin_guard('read')`, that
both record previous and new, and that the read comes before the write. It
also refuses to apply if `content_overrides` is missing, with a message that
says to apply 018 first.

### The admin screen

No app file was changed. The Audit tab (`components/admin/AuditLog.jsx`)
renders `JSON.stringify(detail)` into a cell capped at 320px with an ellipsis,
and nothing in the app reads a named field of these two actions' details. So
nothing breaks, but the cell now holds a string about twice as long. jsonb
stores keys shortest first, so the visible start reads `{"key":...,"new":...`
for a config row, which is useful, while `previous` comes last and is cut off.
Showing the old value, or a revert button, needs a UI task (T064-b).

### The test

`continent-app/scripts/admin/test_admin_audit_rollback.mjs` reuses the harness
from `test_admin_mfa.mjs`: the auth stubs, the roles, psql through
`spawnSync` so self-check notices are kept, every RPC run as `authenticated`
with `request.jwt.claims` set, a loud skip with exit 0 when no database is
reachable, and zero assertions counted as a failure. It applies 006, 007,
010, 014, 015, 016, 018 and 032, proves the baseline (the old detail has no
previous state), applies 033, and then changes, reads back and reverts each
case, asserting the restored row equals the original in value (or patch and
note), `updated_at` and `updated_by`.

Migration 018 as committed fails on this PostgreSQL 18.1 with
`invalid regular expression: invalid repetition count(s)`, from the `{5,600}`
bound on line 93 that register row T031-d names; its own self-check is what
trips it. The test reports that, then applies a copy with `{5,255}` written to
a temp directory, for the test only. 018 in the repo was not edited.

Docker was not running and the local 5432 service has an unknown password, so
the run used a throwaway trust-auth cluster in the session scratchpad on port
55434, stopped and deleted afterwards. The real output:

```
admin_set_config and admin_set_override log previous and new state (migration 033)
-----------------------------------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 010_profiles.sql
  ok  migration applied: 014_admin.sql
  ok  migration applied: 015_admin_hardening.sql
  ok  migration applied: 016_admin_resilient.sql
  note  018 as committed fails here: ERROR:  2201B: invalid regular expression: invalid repetition count(s)
  ok  018 carries the {5,600} bound the failure points at
  note  applying a copy with {5,255} from a temp dir, for this test only
  ok  migration applied: 018_content_overrides.sql (patched copy, {5,255})
  ok  migration applied: 032_admin_mfa_destructive.sql

  Baseline, before 033:
  ok  before 033: set_config returns ok
  ok  before 033: the detail holds exactly key and value
  ok  before 033: the detail has no previous state, so no revert is possible from it
  ok  before 033: override_set detail holds exactly item, layer and patch

  ok  migration applied: 033_admin_audit_rollback.sql
  ok  033 self-check ran and passed

  site_config, an existing key:
  ok  the seed announcement row exists
  ok  set_config returns exactly {ok: true}
  ok  site_config now holds the new value
  ok  detail keeps key and value as before
  ok  detail names the table
  ok  detail.previous.exists is true
  ok  detail.previous.value is the original value
  ok  detail.previous carries updatedAt and updatedBy
  ok  detail.new is {exists: true, value: new}
  ok  revert from the audit row alone: site_config matches the original exactly (value, updated_at, updated_by)

  site_config, a first-time key:
  ok  maintenance has no row yet
  ok  set_config on a new key returns {ok: true}
  ok  first-time key: detail.previous is exactly {exists: false}
  ok  first-time key: detail.new holds the value
  ok  revert from the audit row alone: the new key is gone again

  site_config, reverted through the RPC instead of SQL:
  ok  re-saving detail.previous.value through admin_set_config works
  ok  the RPC revert is itself logged, with the broken value as its previous

  content_overrides, first set, update, clear:
  ok  no override for the item yet
  ok  override set returns exactly {ok: true}
  ok  first-time override: detail.previous is exactly {exists: false}
  ok  first-time override: detail keeps layer, item and patch
  ok  first-time override: detail names the table
  ok  first-time override: detail.new holds patch and note
  ok  override update returns {ok: true}
  ok  update: detail.previous holds the earlier patch and note
  ok  update: detail.new shows the kept note (null note keeps the old one, as in 018)
  ok  revert from the audit row alone: the override matches the earlier row exactly
  ok  empty patch returns exactly {ok: true, cleared: true}
  ok  empty patch deleted the row
  ok  clear: detail keeps layer and item
  ok  clear: detail.previous holds the removed row
  ok  clear: detail.new is exactly {exists: false}
  ok  revert of a clear from the audit row alone: the removed row is back exactly
  ok  revert of the first set from its audit row: no override remains
  ok  clearing an item that had no override: still {ok, cleared}, logged with previous {exists: false}

  Unchanged behaviour:
  ok  non-admin set_config: returns error forbidden
  ok  non-admin set_override: returns error forbidden
  ok  set_config bad key: returns error bad_key
  ok  set_config announcement of the wrong shape: returns error bad_value
  ok  set_config announcement tone outside info|warn: returns error bad_value
  ok  set_config features with a non-boolean: returns error bad_value
  ok  set_config over 16KB: returns error bad_value
  ok  set_override bad layer: returns error bad_layer
  ok  set_override empty item: returns error bad_item
  ok  set_override unknown patch key: returns error unknown_key
  ok  set_override http image: returns error bad_image
  ok  refusals wrote no audit row
  ok  refusals changed no row
  ok  public.admin_set_config(text,jsonb): guard tier is still admin_guard('read')
  ok  public.admin_set_config(text,jsonb): still SECURITY DEFINER, anon cannot execute
  ok  public.admin_set_override(text,text,jsonb,text): guard tier is still admin_guard('read')
  ok  public.admin_set_override(text,text,jsonb,text): still SECURITY DEFINER, anon cannot execute

67 assertions, 67 passing, 0 failing.
All admin audit rollback tests passed.
```

The skip path was also run against port 1, where nothing listens. It printed
"SKIPPED. No database was reached, so NOTHING about the audit rollback state
was tested. This run proves nothing." with the connection error, and exited 0
without a pass line.

## Files touched

All paths from the repo root. The test is committed in both repos.

**Created:**
- `supabase/migrations/033_admin_audit_rollback.sql`
- `continent-app/scripts/admin/test_admin_audit_rollback.mjs`
- `Execution/P4/T064-audit-log-rollback.md`

**Modified:**
- `Execution/_OPEN.md` (rows T064-a to T064-c)

**Not modified:** `continent-app/src/components/admin/AuditLog.jsx` and the
other admin UI files; see "The admin screen".

## Commands run

```
git checkout -b p4-audit-log-rollback
git -C continent-app checkout -b p4-audit-log-rollback

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg64" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg64" -o "-p 55434" -l "$S/pg64.log" -w start

PGPORT=55434 node continent-app/scripts/admin/test_admin_audit_rollback.mjs
PGPORT=1 node continent-app/scripts/admin/test_admin_audit_rollback.mjs      # skip path

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg64" -m fast stop
rm -rf "${S:?}/pg64" "${S:?}/pg64.log"
```

The migration was applied only to the throwaway cluster. To apply it live,
paste the file into the Supabase SQL editor for ntssxktaduxzpsmejwyv after
032 and look for the notice "admin audit rollback self-check passed". Never
`db push`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fields in a `set_config` audit detail | 2 (key, value) | 5 (table, key, value, previous, new) | +3 |
| Fields in an `override_set` audit detail | 3 (layer, item, patch) | 6 (adds table, previous, new) | +3 |
| Fields in an `override_clear` audit detail | 2 (layer, item) | 5 (adds table, previous, new) | +3 |
| Config change revertible from the audit row alone | no | yes, exact to value, updated_at and updated_by | now possible |
| Override set, update or clear revertible from the audit row alone | no | yes, exact to patch, note, updated_at and updated_by | now possible |
| First-time key or override distinguishable in the row | no | yes, `previous: {"exists": false}` | now possible |
| Test assertions on audit rollback state | 0 (no test) | 67 of 67 passing | +67 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Migration 018 as committed does not apply on PostgreSQL 18.1 | Its image regex uses the bound `{5,600}` and Postgres caps a repetition count at 255; 018's own self-check raises (known, T031-d) | The test applies a `{5,255}` copy from a temp directory for the test only and says so in its output; 018 in the repo is untouched |

## What is still open

033 is not applied live (T064-a, user). It goes into the SQL editor after 032,
so after T063-c. It also needs `content_overrides` to exist on the live
project, and the test shows 018 as committed cannot apply on a real Postgres
because of the regex bound in T031-d. If 018 never landed live, 033's
self-check stops with "apply 018 first", and T031-d has to be fixed and 018
applied before 033. The owner can check with
`select to_regclass('public.content_overrides')` in the SQL editor. 033 can be
applied independently of T063-a and T063-b; it does not depend on MFA.

The Audit tab shows the new detail as one truncated JSON string, with
`previous` cut off at the end, and there is no revert button (T064-b, next
task). A small view that shows previous next to new for these three actions,
and perhaps a revert that calls a gated RPC with the audit row id, belongs to
a UI task that owns `AuditLog.jsx`. That task should also decide whether the
revert of a first-time key and of an override note belongs in an RPC, since
the existing RPCs cannot delete a config key or empty a note.

One narrow race remains (T064-c, next task). `FOR UPDATE` locks an existing
row, but when the key or override does not exist yet there is nothing to
lock. Two admins creating the same brand-new key in the same instant both log
`previous: {"exists": false}`, and the second writer's true previous was the
first writer's value. A transaction-scoped advisory lock on the key before the
read would close it. It was left out because it would be a new behaviour
beyond "log the previous state", and with one owner admin the case is
theoretical.

Audit rows written before 033 keep their old shape and cannot be reverted
from; that is history and needs no action.

No earlier `next task` row in the register covers these two functions or the
audit detail, so none was closed. T031-d touches 018 but asks for an edit to
018, which is outside this task's scope, so it stays open.

## Rollback procedure

Before 033 is applied live, rollback is a git revert: in the root repo,
`git revert` the report commit and `9963d80dc`; in `continent-app`,
`git revert 234b754`. Or drop the branch `p4-audit-log-rollback` in both
repos.

After 033 is applied live, paste the `admin_set_config` definition from
`supabase/migrations/015_admin_hardening.sql` and the `admin_set_override`
definition from `supabase/migrations/018_content_overrides.sql` into the
Supabase SQL editor. That restores the old behaviour exactly; the grants are
the same in all three files. 033 changes no table and no existing row. Audit
rows written while it was live keep their wider detail, which nothing reads
strictly, so there is nothing to clean up.
