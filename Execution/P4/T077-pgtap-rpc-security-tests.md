# T077: Automated RPC security tests

## Task ID

T077

## Date

2026-09-29

## What changed

There is now a test that fails when a future migration adds an admin function
without an admission check. It applies the whole admin migration stack to a
throwaway PostgreSQL database, asks `pg_proc` which functions in `public` are
named `admin_*`, and asserts on every one it finds. Today that is 37 functions,
34 of them callable by `authenticated` and 3 internal only, and the run makes
123 assertions, all passing.

The design decision worth understanding is why the list of functions is not
written down in the test. A hardcoded array of the 37 names would have been
easier to read and would have been worthless for the job this test exists to
do. The threat is not a broken function, it is a new one: someone adds
`admin_list_widgets` in migration 044, copies the grant line from a neighbour,
and forgets the `v_err := public.admin_guard(...)` line. A hardcoded array does
not contain `admin_list_widgets`, so it would pass, forever, while every
signed-in traveller could read the widget table. Discovering the list from the
catalogue is the only version of this test that catches the case it was
commissioned for. The cost of that choice is that the migration list in the
script has to be kept current: a function added by migration 044 is only
covered once `044_*.sql` is added to `MIGRATIONS`, and that is the one manual
step the design could not remove.

The count is asserted as a floor (`MIN_FUNCTIONS = 37`), never as an equality.
An equality would fail the build every time someone correctly adds a guarded
function, which trains people to edit the number without reading the failure.
A floor fails only when the discovery stops finding things, which is the
vacuous-gate case: a query that returns nothing makes every downstream
assertion pass for no reason.

The suite was verified by mutation rather than by observing it pass. A
deliberately unguarded `admin_list_widgets` was added as a temporary migration
044 and the suite was re-run. It failed twice, statically ("no admin_guard and
no is_admin: admin_list_widgets") and dynamically ("refuses a non-admin:
returned {"rows": [], "secret": "leaked"}"), which is the evidence that the
gate works. The mutant migration was then deleted; it is not in the commit.

One assertion in the first draft was wrong and the run said so. The static
check originally required the literal string `admin_guard` in every body, and
it flagged `admin_get_audit` and `admin_user_counts`. Neither is a hole.
`admin_get_audit` (014) gates on `public.is_admin()`, which is the same
membership test without the rate budget, and it does refuse a non-admin.
`admin_user_counts` has no check because it is granted to nobody at all and is
only reachable from inside another SECURITY DEFINER body that has already
passed the guard, exactly like `admin_log`. So the check now accepts either
`admin_guard` or `is_admin` as an admission check, and the three exempt
functions carry a second assertion that they are not callable by
`authenticated`. Without that second assertion the exemption list would be a
place to hide a real gap: granting `admin_user_counts` to `authenticated` in
some later migration would otherwise pass silently.

## Files touched

**Created:**
- `continent-app/scripts/admin/test_admin_rpc_security.mjs`
- `.github/workflows/admin-rpc-security.yml`
- `Execution/P4/T077-pgtap-rpc-security-tests.md`

**Modified:**
- `Execution/_OPEN.md`

No migration, no application code and no existing test was touched. The task
adds a test of the schema; it does not change the schema.

## How the test is built, and the two places it diverges from the prompt

The prompt asked for pgTap and for an assertion that each function "throws a
forbidden exception". Neither matched what is here, and both divergences are
deliberate.

pgTap was not used. It is a database extension that has to be installed into
the cluster under test, and the repo already has a working pattern for exactly
this job: twelve sibling harnesses in `continent-app/scripts/admin/` that apply
migrations through `psql`, stub the parts of Supabase a bare Postgres lacks
(schema `auth`, `auth.users`, `auth.uid()`, `auth.jwt()`, the three API roles)
and call RPCs as the `authenticated` role with `request.jwt.claims` set, which
is what PostgREST does. Adding pgTap would have meant a second test
vocabulary, an extension dependency in CI, and a harness that could not reuse
the `{5,600}` workaround and the migration ordering the others already encode.
The prompt allowed "or Supabase's native testing"; this is the repo's own
native testing, and the table-driven shape the prompt asked for is intact.

The "throws an exception" assertion would have been wrong against a correctly
guarded function. Carta's convention is that `admin_guard()` returns the string
`forbidden` and the calling function returns `{"error": "forbidden"}` as a
normal result. Nothing raises. A test written to expect an exception would fail
against the entire correctly built surface, which is worse than no test: it
would be turned off within a week. What matters is that the call is refused and
nothing changes, and that is what is asserted. The internal functions are the
exception, and they genuinely do raise, so those are asserted as permission
denied.

Beyond the per-function refusal, the suite asserts four catalogue properties on
every discovered function, all read from `pg_proc` so a new function is covered
with no edit: it is SECURITY DEFINER, its `search_path` is pinned, `anon` has
no execute grant, and it carries an admission check. The pinned `search_path`
check is the one most worth keeping. An unpinned `search_path` on a SECURITY
DEFINER function is the classic escalation hole, because the caller can point
it at a schema they own and have the function read their table instead of
public's, and it is invisible in a functional test.

The suite also runs a control. Every callable function is called as a real
admin and asserted not to answer `forbidden`. Without it, a test that asserts
refusal only would pass if the database were broken, the role were wrong, or
every call errored for an unrelated reason. This is the vacuous-gate rule from
CLAUDE.md applied to a permission test: "everything was refused" is only
evidence when something was also accepted.

The admin control runs at `aal2`, not `aal1`. Migration 032 puts an MFA check
in front of `admin_ban_user` and `admin_delete_user`, and at `aal1` those two
would refuse the control admin for a reason that has nothing to do with the
guard.

## Commands run

```bash
git checkout -b p4-pgtap-rpc-security-tests

# A throwaway PostgreSQL 18.1 cluster in the session scratchpad. Docker was not
# running and the local 5432 service has an unknown password, which is the same
# situation T063 to T076 hit.
S=<scratchpad>
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg77" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg77" -o "-p 55435" -l "$S/pg77.log" -w start

PGPORT=55435 PGHOST=127.0.0.1 PGUSER=postgres \
  node continent-app/scripts/admin/test_admin_rpc_security.mjs

# The mutation test: prove the suite fails when the guard is missing.
cp <mutant> supabase/migrations/044_mutant_TEMP.sql   # unguarded admin_list_widgets
# add '044_mutant_TEMP.sql' to MIGRATIONS, re-run, observe 2 failures
rm supabase/migrations/044_mutant_TEMP.sql            # and revert the script

# The skip path: it must exit 0 locally and be caught by CI.
PGPORT=59999 node continent-app/scripts/admin/test_admin_rpc_security.mjs

python -c "import yaml; yaml.safe_load(open('.github/workflows/admin-rpc-security.yml'))"

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg77" -w -m immediate stop
rm -rf "$S/pg77"
```

## Config and secrets set

None. The script reads `PGHOST`, `PGPORT`, `PGUSER` and `CARTA_TEST_DB` from
the environment, defaulting to `127.0.0.1:5432`, `postgres` and
`carta_t077_test`. It creates and drops that database and never touches the
live Supabase project. No key, secret or feature flag was added.

The CI job sets `POSTGRES_HOST_AUTH_METHOD: trust` on a throwaway service
container that exists for the length of the job and holds no real data.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| admin_* functions covered by an automated permission test | 0 | 37 | +37 |
| Assertions in the admin security suite | 0 | 123 | +123 |
| CI jobs that fail on an unguarded admin function | 0 | 1 | +1 |
| Functions found not to be SECURITY DEFINER | not measured | 0 | n/a |
| Functions found with an unpinned search_path | not measured | 0 | n/a |
| Functions found executable by anon | not measured | 0 | n/a |
| Functions found with no admission check | not measured | 0 | n/a |

The "before" for the first three rows is zero because no test previously read
the admin surface as a whole. The twelve sibling harnesses each check one
migration's behaviour and none of them would notice a new unguarded function.
The last four rows have no meaningful before: they are properties nothing had
measured, and all four came back clean on the first complete run.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 036 aborted the run with "trip_plans has no visibility or published_at column; apply 011 and 019 first" | The sibling harnesses only apply migrations up to 034, so their migration list was missing the guide and social chain that 036 to 039 build on | Added 002, 003, 004, 008, 009, 011, 012, 019 and 020 to `MIGRATIONS`. The migrations' own self-checks named the prerequisites, which is what made this quick |
| 018 fails to apply on a real Postgres | The committed regex bound `{5,600}` exceeds the engine's repetition limit (register row T031-d, open since T031) | Same workaround the other harnesses use: apply 018 as committed, report the failure, then apply a `{5,255}` copy from a temp directory. 018 in the repo is not edited |
| The static check flagged `admin_get_audit` and `admin_user_counts` as unguarded | The check required the literal `admin_guard`; the first uses the equivalent `is_admin()` and the second is granted to nobody | Accept `admin_guard` or `is_admin`, exempt the three ungranted functions, and assert that the exempt ones really are not callable by `authenticated`, so the exemption cannot later hide a real gap |
| 018's ordering anchor was wrong after the new migrations were added | 018 was applied when the loop reached 022, which put 019 and 020 ahead of it | Moved the anchor to 019, which is the correct paste order |

## What is still open

The migration list inside the script is manual, and that is the one weakness of
the discovery design. Functions are found automatically, but only from the
migrations the script applies. A migration 044 that adds an admin function is
not covered until someone adds `044_*.sql` to `MIGRATIONS`. The floor on
`MIN_FUNCTIONS` does not catch this, because a new migration adds functions
rather than removing them. A later task could read the directory and apply
everything in numeric order, which would close the gap, but that is a larger
change than this task's scope: several migrations have prerequisites that are
not expressed in their filenames, and a few (018) do not apply as committed.

The suite does not run against the live project, and cannot. It proves that the
migrations as committed produce a closed surface; it does not prove that
`ntssxktaduxzpsmejwyv` currently matches those migrations. Given that
migrations 021, 022, 024 to 027 and 029 to 043 are recorded as not yet applied,
the live surface is known to differ from the tested one. Closing that gap means
reading `pg_proc` from the live project, which needs a credential no CI job
should hold.

`admin_get_audit` gates on `is_admin()` rather than `admin_guard()`, so it is
the one callable admin function with no rate budget: an actor can call it
without the 60-per-minute ceiling the others share. It refuses non-admins
correctly, so this is not a hole, but it is an inconsistency a later migration
should probably settle.

The CI job has not run yet. It is correct as YAML and the logic was exercised
locally in both directions (a real run passes, a skipped run is caught), but no
GitHub Actions run exists until this branch is pushed.

## Rollback procedure

Delete the three created files and revert the register rows:

```bash
git rm continent-app/scripts/admin/test_admin_rpc_security.mjs
git rm .github/workflows/admin-rpc-security.yml
git rm Execution/P4/T077-pgtap-rpc-security-tests.md
# and drop the T077 rows from Execution/_OPEN.md
```

Or revert the branch merge. Rollback is completely safe: the task added a test
and a CI job and changed no migration, no function, no table, no row and no
application code. Nothing in the running system depends on any of it, and
removing it restores exactly the previous behaviour, which is that an unguarded
admin function would reach production unnoticed.
