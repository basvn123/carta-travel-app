# T063: Enforce MFA (AAL2) on destructive admin actions

## Task ID

T063

## Date

2026-09-28

## What changed

The two admin actions that cannot be undone, deleting an account and banning
one, now refuse any session that has not passed a second factor. Migration
`supabase/migrations/032_admin_mfa_destructive.sql` re-creates
`admin_delete_user` and `admin_ban_user` from their 015 definitions with four
added lines each. Right after `admin_guard('destructive')` they read the
Authenticator Assurance Level from the caller's token with
`auth.jwt() ->> 'aal'`, and unless it is `aal2` they raise
`MFA required for this action`. Nothing else in either function moved; a diff
of the 015 bodies against the 032 bodies shows only those four lines. Before
this task no admin RPC looked at the assurance level. Now two do, and a test
run against a throwaway database shows an aal1 admin session that could ban a
user under 014 to 016 is refused by both functions once 032 is applied.

The migration is not applied to the live project. Applying it before the admin
page can step a session up to aal2 would make delete and ban unusable from the
page, so the order is written in the open items below.

### How the check works

Supabase signs an `aal` claim into every access token. A password or magic
link sign-in gives `aal1`. A session that has also verified an enrolled MFA
factor (TOTP) gets a fresh token with `aal2`. The claim is inside the signed
JWT, so a stolen token cannot be edited to say `aal2`, and it cannot be
upgraded without the factor itself. That is the whole point: an attacker with
an admin's access token is still an admin for reads and for the reversible
actions, but not for the two that destroy something.

The check is `coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'`. The coalesce
matters. Without it a token with no `aal` claim gives `NULL <> 'aal2'`, which
is NULL, which IF treats as false, and the call would walk through. With it the
check fails closed. The test covers that case explicitly.

The order inside each function is guard, then MFA, then everything else. The
guard runs first so a non-admin still hears `forbidden` and learns nothing
about the MFA requirement. The MFA check runs before the own-account and
target-is-admin checks and before any read of the target, so an aal1 session
cannot even use the `not_found` answer to probe which user ids exist. The
self-check at the end of 032 asserts that order by position in the function
source, as well as SECURITY DEFINER, the missing anon grant, and the presence
of `auth.jwt()`.

### Why it raises, and what the client sees

The other refusals in these functions return `{error: word}`. This one raises,
as the plan asked, and that fits: it is a property of the session, not of the
arguments, so nothing the caller changes in the request gets past it. The
exception carries SQLSTATE 42501 (`insufficient_privilege`, which PostgREST
answers with HTTP 403) and the hint `mfa_required`. The message is the human
sentence. The hint is the stable word a client should branch on, because 42501
on its own is shared with every ordinary permission-denied error.

`continent-app/src/auth/admin.js` was not changed. Its `call()` rethrows a
PostgREST error as is, so the thrown object has `code` `42501`, `hint`
`mfa_required` and `message` `MFA required for this action`. The admin page's
`useErrText` maps a handful of known codes to translated sentences and falls
back to `e.message` for anything else, so the page already shows "MFA required
for this action" in the account panel without any edit. A mapping to a code
like `mfa_required` would only matter once the page has a translated sentence
or a step-up prompt to hang on it, which is the UI task listed below, so it was
left for that task rather than added as a line nothing reads.

One consequence of raising: the transaction rolls back, so a refused attempt
leaves no row in `admin_audit_log`. The test asserts exactly that (no write of
any kind). Supabase's own API logs still hold the request. Whether refused
destructive attempts should be recorded in our own trail is an open item.

### What it does not cover

`admin_set_tier`, `admin_reset_quota` and `admin_unban_user` also go through
`admin_guard('destructive')` for rate limiting, but they are reversible and the
plan names only delete and ban, so they stay on aal1. The test asserts that
unban still works on an aal1 session, so a later change to that is deliberate
and visible.

The check looks at the level a token was issued with, not at how recently the
factor was used. An aal2 access token that is itself stolen stays aal2 until it
expires, about an hour on the default Supabase settings. The protection is
against a stolen aal1 session and a stolen password, which is the common case,
and not against theft of a freshly stepped-up token.

### The test

`continent-app/scripts/admin/test_admin_mfa.mjs` is modelled on
`scripts/ai/test_ai_quota.mjs`. It stubs what Supabase provides and a bare
PostgreSQL does not: schema `auth`, `auth.users` with the columns the admin
functions read, `auth.refresh_tokens`, the three roles, `auth.uid()` and
`auth.jwt()`. The last two are written the way Supabase writes them, reading
`request.jwt.claim(s)` settings, so setting `request.jwt.claims` per session is
exactly what PostgREST does for an RPC. Every call runs as the `authenticated`
role.

It applies 006, 007, 010, 014, 015 and 016. 006 and 007 are there because 014
and 015 name `plan_tiers`, `entitlements` and `ai_resolve_tier`, and 010
because the delete path reads `profiles`. 017 and 018 are not needed: neither
touches the two functions or `admin_guard`. It then proves the baseline (an
aal1 admin bans a user under 016), applies 032, and checks refusal on aal1 and
on a missing claim with the exact message, SQLSTATE and hint, that no write
happened, that the guard still answers first, that on aal2 every refusal from
015 is intact and both success paths still write what they wrote, and that
unban is untouched. If no database is reachable it prints SKIPPED with the
reason and exits 0, and it never prints a pass line in that case. Zero
assertions is treated as a failure.

Docker was not running and the local 5432 service has an unknown password, so
the run used a throwaway PostgreSQL 18.1 cluster: `initdb --auth=trust` in the
session scratchpad, started on port 55434, stopped and deleted after the run.
The real output:

```
admin_delete_user and admin_ban_user require aal2 (migration 032)
-----------------------------------------------------------------
  ok  migration applied: 006_ai_day_planner.sql
  ok  migration applied: 007_passes.sql
  ok  migration applied: 010_profiles.sql
  ok  migration applied: 014_admin.sql
  ok  migration applied: 015_admin_hardening.sql
  ok  migration applied: 016_admin_resilient.sql

  Baseline, migrations 014 to 016 only:
  ok  before 032: an aal1 admin session bans a user
  ok  before 032: the ban landed on auth.users
  ok  before 032: unban on aal1 restores the baseline account

  ok  migration applied: 032_admin_mfa_destructive.sql
  ok  032 self-check ran and passed

  After 032, a session that is not aal2:
  ok  aal1 ban: refused with an exception
  ok  aal1 ban: message is exactly "MFA required for this action"
  ok  aal1 ban: SQLSTATE is 42501
  ok  aal1 ban: hint is mfa_required
  ok  aal1 delete: refused with an exception
  ok  aal1 delete: message is exactly "MFA required for this action"
  ok  aal1 delete: SQLSTATE is 42501
  ok  aal1 delete: hint is mfa_required
  ok  no aal claim, ban: refused with an exception
  ok  no aal claim, ban: message is exactly "MFA required for this action"
  ok  no aal claim, ban: SQLSTATE is 42501
  ok  no aal claim, ban: hint is mfa_required
  ok  no aal claim, delete: refused with an exception
  ok  no aal claim, delete: message is exactly "MFA required for this action"
  ok  no aal claim, delete: SQLSTATE is 42501
  ok  no aal claim, delete: hint is mfa_required
  ok  aal1 ban of a missing id: refused with an exception
  ok  aal1 ban of a missing id: message is exactly "MFA required for this action"
  ok  aal1 ban of a missing id: SQLSTATE is 42501
  ok  aal1 ban of a missing id: hint is mfa_required
  ok  refused ban: the target is not banned
  ok  refused ban: the refresh token is not revoked
  ok  refused delete: the target still exists
  ok  refused calls: no audit row was written

  The guard still comes first:
  ok  non-admin, aal1: ban answers forbidden, not MFA
  ok  non-admin, aal1: delete answers forbidden, not MFA
  ok  non-admin, aal2: ban answers forbidden
  ok  non-admin, aal2: delete answers forbidden

  An aal2 admin session:
  ok  aal2 ban self: returns error own_account
  ok  aal2 ban another admin: returns error target_is_admin
  ok  aal2 ban a missing id: returns error not_found
  ok  aal2 ban for 0 days: returns error bad_days
  ok  aal2 delete self: returns error own_account
  ok  aal2 delete another admin: returns error target_is_admin
  ok  aal2 delete a missing id: returns error not_found
  ok  aal2 delete with the wrong retype: returns error confirm_mismatch
  ok  wrong retype: the target still exists
  ok  aal2 ban: returns ok true
  ok  aal2 ban: returns bannedUntil
  ok  aal2 ban: auth.users.banned_until is set
  ok  aal2 ban: the refresh token is revoked
  ok  aal2 ban: exactly one ban_user audit row
  ok  aal2 delete: returns ok true
  ok  aal2 delete: the account is gone
  ok  aal2 delete: exactly one delete_user audit row

  Out of scope, unchanged:
  ok  aal1 unban still works (032 does not touch it)
  ok  aal1 unban cleared banned_until

58 assertions, 58 passing, 0 failing.
All admin MFA tests passed.
```

The skip path was also run, against port 1 where nothing listens. It printed
"SKIPPED. No database was reached, so NOTHING about the MFA check was tested.
This run proves nothing." with the connection error, and exited 0 without a
pass line.

## Files touched

All paths from the repo root. The test is committed in both repos.

**Created:**
- `supabase/migrations/032_admin_mfa_destructive.sql`
- `continent-app/scripts/admin/test_admin_mfa.mjs`
- `Execution/P4/T063-mfa-on-destructive-actions.md`

**Modified:**
- `Execution/_OPEN.md` (rows T063-a to T063-e)

**Not modified:** `continent-app/src/auth/admin.js`; the reason is under "Why it
raises, and what the client sees".

## Commands run

```
git checkout -b p4-mfa-destructive
git -C continent-app checkout -b p4-mfa-destructive

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg63" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg63" -o "-p 55434" -l "$S/pg63.log" -w start

PGPORT=55434 node continent-app/scripts/admin/test_admin_mfa.mjs
PGPORT=1 node continent-app/scripts/admin/test_admin_mfa.mjs      # skip path

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg63" -m fast stop
rm -rf "$S/pg63" "$S/pg63.log"
```

The migration was not applied anywhere except the throwaway cluster. To apply
it live, paste the file into the Supabase SQL editor for ntssxktaduxzpsmejwyv
after the UI and enrolment steps below. Never `db push`.

## Config and secrets set

None. The live project needs MFA (TOTP) enabled under Authentication in the
Supabase Dashboard; TOTP is on by default on hosted projects, so this is a
check, not a change. That and the enrolment are owner steps below.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Admin RPCs that check the assurance level | 0 | 2 (`admin_delete_user`, `admin_ban_user`) | +2 |
| Of the 5 functions that call `admin_guard('destructive')`, how many require aal2 | 0 | 2 | +2 |
| aal1 admin session calling `admin_ban_user` (throwaway DB) | succeeds | refused, 42501 | refused |
| aal1 admin session calling `admin_delete_user` (throwaway DB) | not run before 032 (would succeed; body identical to 015 minus the check) | refused, 42501 | refused |
| Test assertions on the MFA gate | 0 (no test) | 58 of 58 passing | +58 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The assertion that 032's self-check printed its notice failed on the first run | `execFileSync` drops stderr when the process exits 0, and psql writes NOTICE to stderr | The test runs psql through `spawnSync`, which keeps stderr on success |

## What is still open

Nothing works for the owner yet, by design, because 032 is not applied. The
steps have an order, and applying the migration first would lock the delete
and ban buttons behind a factor nobody can present.

First, the admin page needs an AAL2 step-up (T063-a, next task). Supabase has
no Dashboard screen where a user enrols their own TOTP factor; it is done from
the client with `supabase.auth.mfa.enroll`, then
`supabase.auth.mfa.challengeAndVerify` before a destructive call, checked with
`supabase.auth.mfa.getAuthenticatorAssuranceLevel`. The natural home is the
existing re-auth lock (`components/admin/AdminLock.jsx`) or a prompt in
`useUserDetail.js` when a call fails with hint `mfa_required`. The same task
should add a translated sentence for that hint in `useErrText.js`, and a
one-line mapping in `admin.js` if the UI wants a plain code rather than the
hint. None of these files were in this task's scope.

Second, the owner enrols a TOTP factor on the owner account through that flow
and confirms that TOTP is enabled in the project's Auth settings (T063-b,
user).

Third, the owner pastes 032 into the Supabase SQL editor and checks for the
notice "admin MFA self-check passed" (T063-c, user). Then deletes and bans from
an aal2 session.

Two decisions are left open rather than guessed. Refused destructive attempts
leave no audit row because the raise rolls the transaction back; recording
them would mean returning a jsonb error instead of raising (which the plan
did not ask for) or logging outside the transaction (T063-d). And
`admin_set_tier`, `admin_reset_quota` and `admin_unban_user` stay on aal1; the
plan named only delete and ban, and whether a free lifetime pass handed out by
a hijacked session deserves the same gate is a product call (T063-e, user).

No earlier `next task` row in the register covers MFA or these two functions,
so none was closed.

## Rollback procedure

Before 032 is applied live, rollback is a git revert: in the root repo,
`git revert` the report commit and `6a42fc9cd`; in `continent-app`,
`git revert 60df4c2`. Or drop the branch `p4-mfa-destructive` in both repos.

After 032 is applied live, paste the `admin_delete_user` and `admin_ban_user`
definitions from `supabase/migrations/015_admin_hardening.sql` (lines 377 to
467) into the Supabase SQL editor. That restores the 015 behaviour exactly;
the grants are unchanged by either file. No data is touched by 032, so the
rollback is complete and nothing is lost either way.
