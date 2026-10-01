# T083: Row policy tests and a recorded crash on the ErrorBoundary

## Task ID

T083 (mind-map number T325)

## Date

2026-10-01

## What changed

Two things that were invisible are now checked or written down.

The row level security on the tables themselves is now tested as a whole. Until this task the only database security test was T077's, which proves the admin_* functions refuse a normal user. Nothing exercised the table policies, which are what stand between one traveller's saved trips and another's, because the client reads and writes trip_plans, day_plans, friendships and the rest directly through PostgREST with no function in between. Each migration's own self-check runs as the database owner, which bypasses RLS, so a policy that let a second user read the first user's rows would have passed every check in the repo. The new script `continent-app/scripts/admin/test_rls_policies.mjs` applies every migration, discovers all 33 tables and 34 policies from the catalogue and makes 312 assertions about them, all passing. A new CI job, `.github/workflows/rls-policies.yml`, runs it on every change to a migration.

The ErrorBoundary now records a crash. Before, a render error showed the crash panel to the person it happened to and stopped there: 0 telemetry calls per crash. Now the boundary sends one call through the same first-party writer T071 built for AI failures, `reportEdgeFailure` in `edgeFailure.js`, with function `app`, code `client_crash` and origin `client`, and nothing else: no message, no stack, no component, no page. A Playwright spec proves it end to end in a browser. One honest limit: migration 040, as committed, checks function and code against two closed lists, and neither contains the new values, so until a later migration widens them the database drops the call without writing a row. In a throwaway database with the lists widened, the same call lands as a row. That migration is not in this task (no new migration was allowed) and is register row T083-b.

### How the row policy test works

The script runs against any PostgreSQL that accepts a password-less connection. It creates a database, stubs what Supabase provides and a bare Postgres does not (the auth schema, auth.uid() reading request.jwt.claims, the anon, authenticated and service_role roles), and also stubs Supabase's default grants: every new table, sequence and function in public is granted to the three API roles. That last stub matters. Without it every read as `authenticated` would fail on a missing GRANT, every denial would be true for the wrong reason, and the run would prove nothing about the policies. 040 and 042 say in their own words that they rely on that default and revoke what they do not want.

Then every file in supabase/migrations is applied in numeric order. There is no list to maintain, which is the gap T077-a describes for the admin test; this script does not have it. 018 fails as committed on a real Postgres because of its `{5,600}` regex bound (T031-d), so, as the other harnesses do, it is tried as committed, the failure is reported, and a copy with `{5,255}` is applied from a temp directory. 018 in the repo is not touched.

The assertions come in four layers.

The catalogue layer looks at every table in public. Row level security must be on everywhere. No INSERT, UPDATE, DELETE or ALL policy may be a plain `true`; a read policy may be, for the two public catalogue tables. Every function a policy calls must be executable by the roles the policy applies to, because an RLS expression runs with the caller's privileges and a revoked function turns a row decision into a 42501 error (this is the fault 012 and 023 repaired for profiles and trips). And every table that has policies must have an isolation fixture in the script. That last check is the tripwire for new tables: a future migration that adds a table with policies fails the run until someone writes its fixture, which is the moment the new policy is read by a second person.

The closed tables, 19 of them, have RLS on and no policy, which admits nobody. That is probed rather than trusted: a second signed-in user and a signed-out visitor each try to read and to insert, and must get nothing.

The isolation layer has one fixture for each of the 14 tables with policies. The victim seeds their rows through the `authenticated` role with their own claims, which is also the positive control: a policy that denied everybody would fail the seed instead of passing the test. Rows that only a definer function or the service role ever writes (entitlements, pass_grants, user_achievements, moderation_statements, site_config, content_overrides) are seeded as the database owner. Then a second signed-in user and a visitor each try to read the victim's rows, update them, delete them, and insert a row in the victim's name. All must come back empty or refused, and afterwards the victim's rows are compared against an md5 snapshot taken before the attempt as the owner, so a policy that admits a write but hides its result is still caught. A signed-in stranger's read must succeed with zero rows, not fail: a failure there would be the 011 fault, which breaks the owner's reads as well.

The design layer asserts what the policies admit on purpose, so the suite cannot pass against a database that denies everyone everything: an accepted co-planner sees the trip and its stops but cannot delete it, a friend sees the victim's profile and a stranger does not, everyone sees their own profile, the addressee of a friendship sees the row. Last, the harness proves itself: it adds an unconditional read policy to trip_plans, the stranger's probe must now see the victim's trip, and once the policy is dropped it must not.

The counts are floors, not equalities (at least 33 tables and 34 policies), so a migration that adds a table does not break the build but a discovery that comes back nearly empty does.

### A real fault the test found

trip_collaborators' insert policy `coplan_insert_owner` (020) calls `are_friends(a, b)`, which 011 revoked from authenticated. So once 020 is live, every co-planner invite sent from the client is refused with 42501. 020 is not applied to the live project yet, which is why nobody has seen it. The script lists it in `KNOWN_UNCALLABLE` and asserts it is still broken, so the entry cannot outlive the bug: the migration that repairs it makes the run say "delete the entry". Until then the trip_collaborators fixture seeds the invite as the database owner rather than as the victim. The fix belongs in a migration and is register row T083-a; the shape that fits the rest of the schema is a one-armed `is_friend_me(other)`, as 012 and 023 did, not a grant on the two-armed pair oracle, which 011 revoked for a reason.

### How the crash recording works

`componentDidCatch` in `ErrorBoundary.jsx` already logged the error to the console and handled the stale-chunk case (a tab with an old build that cannot fetch a renamed chunk reloads once, guarded by a session flag). After that, it now calls `reportClientCrash()` from `edgeFailure.js`, which is one line: `reportEdgeFailure('app', 'client_crash', { origin: 'client' })`. `client_crash` was added to the writer's recorded set. Everything else about the writer is T071's: one RPC through the Supabase client and the session the traveller already has, never awaited, never throws, both a rejected promise and an error answer swallowed.

Two choices are worth knowing. The stale-chunk reload records nothing, because a stale tab picking up a fresh build is not a crash of this build and the reload would cut the request off anyway; if the chunk is still broken after the reload, that second error falls through to the crash panel and is recorded once. And nothing about the error is sent. The message and stack can hold anything the app had in hand (a destination, a pasted URL, a trip name), and sending them would turn a first-party counter into an error-reporting service with the consent question T071 avoided. The console keeps the detail for whoever is at the screen, and the crash panel still shows the message to the traveller. The row says only that the app fell over for a signed-in traveller, and when. That is enough to see a release that crashes and when it started; finding out why is still a reproduction job.

Because `log_edge_error` returns without writing when there is no session, a crash for a signed-out visitor is not recorded. That is 040's rule, not a choice made here, and it is the same for AI failures.

The spec `continent-app/tests/error-boundary.spec.mjs` starts the Vite dev server on 5204 with a placeholder Supabase URL and key, so the real Supabase client is built, and catches every request to that host with page.route; nothing leaves the machine. It replaces `/src/App.jsx` with a module whose render throws, so main.jsx, the ErrorBoundary, edgeFailure.js and the Supabase client are the committed code and only the network and the app body are swapped. It checks that the crash panel shows, that exactly one `log_edge_error` call goes out with exactly the five writer arguments and the right values, that no request contains the error message or a stack, that the message is still on screen, and that a stale-chunk error reloads once and records only the crash after it. A warm-up load runs first because Vite reloads the page when it finishes optimising dependencies on the first visit, which would otherwise count as a second navigation.

### The database side of the crash

In the throwaway cluster, with migrations 001 to 040 applied and a signed-in caller, `log_edge_error('app', 'client_crash', 'client', null, null)` writes nothing with 040 as committed, while a `plan-day`/`ai_timeout` call in the same session does. With the two check constraints dropped and re-added with `'app'` and `'client_crash'` in their lists, and 040's function body re-created with the same two words added to its two `not in` lists, the same call lands as a row with fn app, code client_crash, origin client and the caller's id. A visitor (`anon`) is refused execute either way. That is what the follow-up migration has to do (T083-b). It should also decide how crashes appear in `admin_edge_errors`: the reader's daily series has fixed columns for the four AI codes, so a crash would show in the total and in byCode and byFunction but in none of the daily columns, and the T072 Overview card would mix crashes into what it calls AI failures unless it filters on fn.

### Why it was built this way

A pgTAP file was the other option the plan names. It would need the pgTAP extension in CI and a second language beside the Node harnesses the repo already has (T069 to T077 all use the same psql-from-Node pattern), and it would still need hand-written seeds per table. Discovery from the catalogue plus a fixture tripwire gives the same coverage with no new dependency.

Sentry was the plan's first choice for the ErrorBoundary and T071 already rejected it for the consent reasons in its report; the session notes for this task say to wire the boundary to `reportEdgeFailure`, so this task reuses that writer rather than adding a second telemetry path.

## Files touched

All paths from the repo root. The app files are committed in the app repo (continent-app) and mirrored in the root repo, as T071 and T077 did.

**Modified:**
- `continent-app/src/components/ErrorBoundary.jsx` (9 lines: the import, an early return after the stale-chunk reload, the call)
- `continent-app/src/planner/edgeFailure.js` (`client_crash` in the recorded set, `reportClientCrash`, comments)
- `Execution/_OPEN.md` (rows T083-a to T083-c)

**Created:**
- `continent-app/scripts/admin/test_rls_policies.mjs`
- `continent-app/tests/error-boundary.spec.mjs`
- `.github/workflows/rls-policies.yml`
- `Execution/P4/T083-rls-tests-and-errorboundary.md`

No migration, no package, no change to the `ci` script. The spec is not in `npm run ci`: it needs a browser and a dev server, and the prompt's rules keep the `ci` script out of scope. It is picked up by `npm run test:browser`, whose glob is `tests/*.spec.mjs`.

## Commands run

This task was started by one session and finished by a second after a usage limit. The first wrote the script, the two app edits and ran the script against the throwaway cluster, clean and with mutations. The second reviewed those, kept them, wrote the spec and the workflow, and re-ran everything below.

```
# throwaway cluster on 55444 (Git Bash), $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg83" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg83" -o "-p 55444" -l "$S/pg83.log" -w start

# from the app worktree; the sparse root worktree has no supabase/, so the
# migrations are read from the main checkout (read-only)
PGPORT=55444 CARTA_MIGRATIONS=".../Travel App/supabase/migrations" node scripts/admin/test_rls_policies.mjs

# mutation run: a scratch copy of the migrations plus 999_mutant.sql, which
# turns RLS off on trip_plans, adds an UPDATE policy using (true) on
# day_plans, adds a trip_shares policy calling a revoked function, and adds a
# new table with a policy and no fixture
PGPORT=55444 CARTA_MIGRATIONS="$S/t083mig" node scripts/admin/test_rls_policies.mjs

# the crash spec, after and before (before = ErrorBoundary.jsx and
# edgeFailure.js from HEAD, swapped in and restored)
node tests/error-boundary.spec.mjs

# the database side of the crash: 001 to 040 into carta_t083_crash, one
# signed-in call before and after widening the two lists (scratch SQL only)
npx eslint src/components/ErrorBoundary.jsx src/planner/edgeFailure.js tests/error-boundary.spec.mjs
npm test

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg83" -w stop
```

`npm run build` was not run in the worktree: its public folders are links into the main checkout and a build would copy the whole data tree into the worktree's dist. The dev server compiled every touched module during the spec, and eslint passes on them.

## Config and secrets set

None. The spec sets `VITE_SUPABASE_URL=http://127.0.0.1:5205` and a placeholder anon key for its own dev server process only; nothing is listening there and every request is answered inside the browser.

## Before/after measurements

Measured in the throwaway cluster on 55444 and in a local Chromium. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Tables whose policies are exercised by a second user and a visitor | 0 of 33 | 33 of 33 (14 by fixture, 19 closed and probed) | +33 |
| Row policy assertions | 0 | 312, all passing | +312 |
| CI jobs that apply the migrations and test the table policies | 0 | 1 | +1 |
| Planted policy faults caught (RLS off, open write, uncallable function, new table without fixture) | | 4 of 4, 22 failing assertions | |
| Telemetry calls sent per render crash | 0 | 1 | +1 |
| Crash spec checks passing | 7 of 12 | 12 of 12 | +5 |
| Error text in the telemetry request | | none | |
| Rows written for a crash call, 040 as committed | 0 | 0 | 0 |
| Rows written for a crash call, lists widened (scratch) | | 1 | |
| npm test | 92 of 92 | 92 of 92 | 0 |
| test_rls_policies.mjs runtime, local Windows | | about 4 minutes | |

The 7 of 12 before are the checks that do not depend on the call (panel shows, no secret leaked, reload behaviour); the 5 that fail are the call count and its contents.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The spec's first page load timed out waiting for domcontentloaded, then the first crash was not seen | On a cold start Vite optimises dependencies and then reloads the page; module scripts delay domcontentloaded behind that | Navigate with waitUntil commit, wait for the crash panel, and do one unasserted warm-up load before the checks |
| The "error text still on screen" check could pass on a slow appearance and fail silently on none | textContent waited on the default timeout and an empty string was not guarded | Short explicit timeout and an empty-string fallback |

## What is still open

T083-a. The co-planner invite policy on trip_collaborators calls a function the caller cannot execute, so every invite through the client is refused once 020 is live. It needs a migration, and it should land before 020 is pasted. When it does, change the trip_collaborators fixture seed from `as: 'db'` to `as: 'victim'` and delete the KNOWN_UNCALLABLE entry; the run will say so.

T083-b. A crash is sent but not stored: 040's fn and code lists refuse `app` and `client_crash`. A later migration has to widen both check constraints and the two lists in `log_edge_error`, after 040, and settle how `admin_edge_errors` and the Overview card show crashes beside AI failures. Then the owner pastes it. Until then each crash costs one dropped RPC, which is harmless. The done condition "a thrown client error appears in telemetry" is therefore met in the browser and in a widened scratch database, not yet in the live table.

T083-c. The CI job has not run on GitHub because nothing is pushed. On the first push, confirm that rls-policies goes green, as T077-d did for its job.

Nothing here checks that the live project matches the migrations; with 021 onward unapplied it does not, the same limit T077-b records.

## Rollback procedure

App repo: `git -C continent-app revert <T083 commit>`. Root repo: `git revert <T083 commit>`. Nothing is applied anywhere, so there is no data or schema to undo. Reverting only the ErrorBoundary call is a one-line removal; the writer ignores an unknown code either way.
