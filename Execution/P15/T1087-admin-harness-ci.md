# T1087: Admin harnesses to migration 064, in CI, and a definer search_path test

ROADMAP item C4. Register rows T1082-a and T1078-b. Session S03 of `_NEXT-50-SESSIONS.md`.

## Date

2026-11-05

## What changed

All 16 database harnesses in `continent-app/scripts/admin/` now pass against the full migration stack to 064 (before: 12 of 16 green, 27 failing assertions, one silent skip). Four harnesses were wrong, not the migrations: `test_admin_followups.mjs` (20 fail) and `test_moderation_decisions.mjs` (6 fail) asserted pre-062 and pre-064 behaviour (an aal1 refusal writing an `mfa_refused` row, admin reads at aal1, `reset_quota` at aal1, the old two- and three-argument ban, delete and set tier); `test_edge_errors.mjs` aborted under plain node because the app modules it imports read `import.meta.env`; and `test_parse_failures.mjs` skipped on every POSIX machine because it looked for `psql` with `existsSync('psql')`. The assertions now state 062 (the guard refuses below aal2 and, being STABLE, writes no row; reset_quota needs aal2 too) and 064 (each account action takes a reason, which lands in `admin_audit_log.reason`). A new workflow `admin-harnesses.yml` runs the 14 harnesses that had no CI through a new runner, `run_harnesses.mjs`, which fails a harness that exits non-zero or prints `SKIPPED`. `test_rls_policies.mjs` gained section 6: every SECURITY DEFINER function in every non-system schema (120 found) must pin a `search_path` with no `$user` and no schema a client role may create in, with two planted controls (an unpinned function, and one pinned to a client-writable schema) that must be caught. All 120 already comply, so no migration 065 was needed.

Decision written down: the prompt names `supabase/tests`, which does not exist; the harnesses live in `continent-app/scripts/admin/` and every existing workflow points there, so they stay there rather than moving. `test_admin_mfa.mjs` (named in T1082-a) already passed and needed no change.

## Files touched

- Modified: `continent-app/scripts/admin/test_admin_followups.mjs`, `continent-app/scripts/admin/test_moderation_decisions.mjs`, `continent-app/scripts/admin/test_edge_errors.mjs`, `continent-app/scripts/admin/test_parse_failures.mjs`, `continent-app/scripts/admin/test_rls_policies.mjs`, `docs/HANDBOOK.md` (CI workflows list), `ROADMAP.md` (C4 status), `Execution/_OPEN.md` (3 rows appended), `Execution/_OPEN-CLOSED.md` (2 rows appended).
- Created: `continent-app/scripts/admin/run_harnesses.mjs`, `.github/workflows/admin-harnesses.yml`, this report.
- Deleted: none. No migration.

## Commands run

```
# local Postgres 16 (apt) with trust auth
initdb -D /var/tmp/pgdata -A trust -U postgres
pg_ctl -D /var/tmp/pgdata -o '-p 55435 -k /tmp' start
(cd continent-app && npm ci)
PGHOST=127.0.0.1 PGPORT=55435 PGUSER=postgres node continent-app/scripts/admin/run_harnesses.mjs
# a skip must fail: one harness against a closed port
PGPORT=1 node continent-app/scripts/admin/run_harnesses.mjs --except <all but test_admin_mfa>   # 0 of 1 green, exit 1
node --check continent-app/scripts/admin/*.mjs
(cd continent-app && npm test)
```

The search_path query (for T1087-c, read only, safe in the live SQL editor):

```sql
select p.oid::regprocedure as fn,
       (select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
   and n.nspname not like 'pg_toast%'
 order by 2 nulls first, 1;
```

Rows with a null `path`, a `$user`, or a schema clients can create in are the faults. Supabase's own schemas (auth, storage, extensions) appear live and not in the harness; judge only `public` against the 120.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Admin harnesses green (of 16, full stack to 064) | 12 | 16 | +4 |
| Failing assertions | 27 (20 followups, 6 moderation, 1 edge errors abort) | 0 | -27 |
| Harnesses that silently skipped on Linux | 1 (parse failures) | 0 | -1 |
| Harnesses run in CI | 2 | 16 | +14 |
| SECURITY DEFINER functions checked for a pinned search_path | admin_* only (in admin-rpc-security) | 120, every schema | |
| Unsafe definer search_paths found | not measured | 0 | |
| Wall time of all 16 locally | | 125 s | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| test_parse_failures always SKIPPED off Windows | `existsSync('psql')` is false for a bare command name on PATH | probe each candidate with `psql --version` |
| test_edge_errors aborted with "reading 'DEV'" then "reading 'VITE_SUPABASE_URL'" | src modules read `import.meta.env`, which only Vite defines | the harness's loader hook also has a `load` hook that gives `/src/` modules an empty env |
| test_edge_errors aborted with "Cannot find package 'react'" | no `node_modules` in a fresh checkout | the workflow runs `npm ci` in continent-app first |
| 26 stale assertions | written before 062 (guard-level aal2, no row) and 064 (required reason) | assertions rewritten to 062 and 064; the aal2 success paths now also check the reason in the audit row |

The T1082 report said moderation had 2 failures; with 064 in the stack it had 6 (set tier's signature change took out 4 more).

## Screens checked

No browser run: nothing a traveller sees changed. The end check needs no screen for this task.

## What is still open

- T1087-a: the first GitHub run of `admin-harnesses.yml` uses Postgres 18; locally it ran on 16. The existing two workflows already pass on 18 with the same stubs, so a difference is unlikely, but it is unverified.
- T1087-b: none of the database workflows is a required check yet, so a red harness does not block a merge. GitHub settings, owner only.
- T1087-c: the harness proves the migrations; the live catalogue may differ if anything was hand-edited in the SQL editor. One read-only query confirms it.
- The orchestrator rule forbids editing other rows of `_OPEN.md`, so the closed rows T1082-a and T1078-b are appended to `_OPEN-CLOSED.md` but still stand in `_OPEN.md`; the orchestrator (or the next register cleanup) removes those two lines.

## Rollback procedure

`git revert` the T1087 commit. Nothing live was touched and no migration was written.

## Owner steps (for the checklist)

- [T1087-b] Make the database checks required on main | a red admin harness, RLS or RPC run should block a merge, and today none of them does | GitHub, repo Settings; Branches (or Rules); edit the rule for main; Require status checks; add `harnesses` (admin-harnesses), `rpc-security` (admin-rpc-security) and `rls-policies` (rls-policies); save | .github/workflows/admin-harnesses.yml
- [T1087-c] Confirm live definer functions pin search_path | the harness proves the migrations, not hand edits on the live project | Supabase Dashboard; SQL editor; paste the read-only query from the Commands run section; check no `public` row has a null path, `$user` or a client-writable schema; note the count next to the harness's 120 | Execution/P15/T1087-admin-harness-ci.md
