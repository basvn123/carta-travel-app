# T253: Migration 018 applies on a fresh Postgres

## Task ID

T253

## Date

2026-10-01

## What changed

`supabase/migrations/018_content_overrides.sql` no longer uses a regex
repetition bound above 255. Line 93 checked an override's image URL with
`'^https://[^[:space:]]{5,600}$'`. Postgres caps a repetition count at 255
(`RE_DUP_MAX`), so `CREATE FUNCTION` failed on every fresh database, which broke
`supabase start` locally and forced every admin test harness since T064 to
apply a patched copy from a temp directory (register row T031-d).

The session plan (`_OPEN-MASTER.md` stage 1 step 1) said to change the bound to
`{5,255}`. That would have quietly cut the longest accepted image URL from 608
characters to 263, and nothing in the admin UI limits the length on its own,
so a long Wikimedia Commons thumbnail URL that the owner could save today would
start answering `bad_image`. The fix keeps the rule 018 was written to enforce
and only moves the upper bound out of the regex: the pattern is now
`'^https://[^[:space:]]{5,}$'` and a separate `char_length(...) > 608` check
rejects anything longer. Both conditions return the same `bad_image` code, so
the client contract is unchanged.

The live project is not touched. Per T066 and T077, 018 was applied to
`ntssxktaduxzpsmejwyv` before the bound was noticed; stage 2.1 step 4 of
`_OPEN-MASTER.md` checks that and only re-pastes 018 if the table is missing.

## Files touched

**Modified:**
- supabase/migrations/018_content_overrides.sql

**Created:**
- Execution/P4/T253-migration-018-regex-bound.md

**Modified (register):**
- Execution/_OPEN.md (T031-d closed, T253-a added)

## Commands run

```
# A throwaway PostgreSQL 18 cluster in the session scratchpad, as T063 to T077 did
initdb.exe -D "$S/pgA" -U postgres --auth=trust -E UTF8
pg_ctl.exe -D "$S/pgA" -o "-p 55436" -l "$S/pgA.log" -w start

PGPORT=55436 PGHOST=127.0.0.1 PGUSER=postgres \
  node continent-app/scripts/admin/test_admin_rpc_security.mjs
# -> "ok  migration applied: 018_content_overrides.sql (as committed)"
# -> 122 assertions, 122 passing, 0 failing

# The rule's edges, evaluated directly
psql -p 55436 -c "select char_length(u), (u !~ '^https://[^[:space:]]{5,}$'
  or char_length(u) > 608) from (values ...) v(u)"
```

Edge results: `https://ab.cd` (5 after the scheme) accepted, `https://a.b` (3)
rejected, `http://abcdef.com` rejected, a URL with a space rejected, 600
characters after the scheme (608 total) accepted, 601 (609 total) rejected.
That is exactly what `{5,600}` meant.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| 018 as committed on a fresh PostgreSQL 18 | fails (invalid repetition count) | applies, self-check passes | fixed |
| Longest accepted image URL | 608 characters (intended) | 608 characters | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The planned `{5,255}` would reject image URLs between 264 and 608 characters | A regex bound is also the length cap | Length moved into `char_length`, regex keeps `{5,}` |
| The first test run hung in the background | `pg_ctl start` in the same shell job kept the job's stdout pipe open | Ran the test as its own command against the already-started server |

## What is still open

Thirteen harnesses in `continent-app/scripts/admin/` (from
`test_admin_audit_rollback.mjs` to `test_statement_of_reasons.mjs`) still carry
a header comment saying 018 fails on a real Postgres and a fallback branch that
applies a `{5,255}` copy. The fallback only runs when 018 fails, so it is now
dead code and the tests pass unchanged, but the comments are wrong. They were
outside this task's named file. Removing the dead branch and the comments is
row T253-a.

## Rollback procedure

`git revert <T253 commit>` restores the `{5,600}` line. Nothing was applied to
any live database, so there is nothing else to undo.
