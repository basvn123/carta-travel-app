# T1078: row policy coverage for every table, signed-out reads that answer, no service key in the bundle (ROADMAP C4)

## Date

2026-11-05

## What changed

Every one of the 34 tables with row policies now has an isolation fixture in `continent-app/scripts/admin/test_rls_policies.mjs`: the 17 tables of migrations 052 to 060 that T1070 had to list as known entries (`ask_chats`, `email_log`, `email_prefs`, `friend_visibility`, seven `group_trip*`, `pay_links`, four `shared_list*`, `trip_join_requests`) are seeded through their own policies or RPCs and probed by a second signed-in user and a signed-out visitor (read, update, delete, forge, snapshot unchanged), with the design's admissions asserted too (a friend reads the sharing switches, the requester sees their request, a joined co-member reads the group's options, votes and ledger but never another member's budget, the band hides a lone maximum, a list member reads and annotates the list). Migration `supabase/migrations/063_signed_out_policy_helpers.sql` (with `_down`) repairs the 28 helper calls in 26 policies on 11 tables (055, 058, 059) that faulted for anon: `group_role` and `shared_list_role` already answer null without a signed-in caller and are now executable by anon, and `group_all_joined` now checks the caller's own role in the group first (closing a membership oracle any signed-in account had) before anon may execute it too. The suite now requires a signed-out read of every table anon may select from to return zero rows without an error, and 27 tables do. `KNOWN_UNFIXTURED` went from 17 entries to 0 and `KNOWN_UNCALLABLE` from 3 to 0. A new CI check, `continent-app/scripts/ci/check-bundle-secrets.mjs`, decodes every JWT-shaped string in the built bundle and fails on any role but `anon` (the existing grep for the word `service_role` cannot see a service role JWT, whose payload is base64url); it runs in `ci.yml` after the fast build and in `secret-scan.yml`. The row policy suite went from 501 to 736 assertions, all passing on a local Postgres 18. 063 is not applied live; it is owner step 11 in `Execution/P15/_OPEN-supabase-migrations.md`, after 061 and 062.

## Files touched

Created:
- `supabase/migrations/063_signed_out_policy_helpers.sql`, `supabase/migrations/063_signed_out_policy_helpers_down.sql`
- `continent-app/scripts/ci/check-bundle-secrets.mjs`, `continent-app/tests/bundleSecrets.test.mjs`
- `Execution/P15/T1078-rls-coverage.md`

Modified:
- `continent-app/scripts/admin/test_rls_policies.mjs` (17 fixtures; both known lists emptied; signed-out reads must succeed where anon holds SELECT; section 4 admissions for 052 to 060; the leak self-test probes one trip by id, since the victim now owns two)
- `.github/workflows/ci.yml` (step "No service key in the browser bundle"), `.github/workflows/secret-scan.yml` (the bundle step also runs the script)
- `docs/HANDBOOK.md` (Together, sharing and collaborative trips: who sees what is tested; 063)
- `docs/security/threat-model.md` (section 1 row I, section 5 row I and gap, ranked row 4 closed)
- `Execution/P15/_OPEN-supabase-migrations.md` (step 11)

## Commands run

```
# throwaway cluster in the scratchpad, never the live project
initdb -D pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D pgdata -o "-p 55481" start
PGPORT=55481 node continent-app/scripts/admin/test_rls_policies.mjs          # before: 501 of 501 (no 063, old fixtures)
PGPORT=55481 node continent-app/scripts/admin/test_rls_policies.mjs          # after: 736 of 736
# negative control: the new suite against the stack without 063
CARTA_MIGRATIONS=<copy without 063> PGPORT=55481 node continent-app/scripts/admin/test_rls_policies.mjs   # 14 failures, as it should
# 063 by hand on a database built to 062 (stubs, schema.sql, 002 to 062, no _down)
psql -f 063_signed_out_policy_helpers.sql        # self-check passed; uncallable calls 26 policies -> 0
psql -f 063_signed_out_policy_helpers.sql        # pasted twice: passes
psql -f 063_signed_out_policy_helpers_down.sql   # down: 26 policies on 11 tables uncallable again
psql -f 063_signed_out_policy_helpers.sql        # up again: 0
PGPORT=55481 node continent-app/scripts/admin/test_admin_rpc_security.mjs    # with 063: 242 of 242
cd continent-app
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node scripts/ci/check-bundle-secrets.mjs ../.fastbuild    # 175 files, 0 JWT-shaped strings, no privileged key
node scripts/ci/check-bundle-secrets.mjs <dir with a planted service role JWT>   # exit 1, names the file and the role
node --test tests/bundleSecrets.test.mjs
npx eslint scripts/admin/test_rls_policies.mjs scripts/ci/check-bundle-secrets.mjs tests/bundleSecrets.test.mjs
CARTA_CONTRACT_DERIVE_SPLIT=1 PGPORT=55481 node scripts/ci/check-contract.mjs
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Tables with policies that have an isolation fixture | 17 of 34 | 34 of 34 | +17 |
| `KNOWN_UNFIXTURED` entries | 17 | 0 | -17 |
| `KNOWN_UNCALLABLE` entries (function level) | 3 | 0 | -3 |
| Policy calls to a helper anon cannot execute | 28 (26 policies, 11 tables) | 0 | -28 |
| Fixture tables whose signed-out read is asserted to succeed with zero rows | 0 (an error counted as "nothing") | 27 | +27 |
| `rls-policies` locally | 501 of 501 | 736 of 736 | +235 |
| `admin-rpc-security` locally | 241 of 241 (T1071) | 242 of 242 (one more migration applied) | +1 |
| Contract gate, database half (local Postgres) | passes | passes (9 of 9 database breaks rejected) | |
| CI checks that decode JWTs in the bundle | 0 | 2 (`ci.yml`, `secret-scan.yml`) | +2 |
| `npm test` (this worktree; 12 skip without `public/boot.json`) | 1,266 tests, 0 fail | 1,270 tests, 1,258 pass, 12 skip, 0 fail | +4 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The leak self-test saw 2 trips, not 1 | The join request fixture adds a second, friends-visible trip for the victim | The probe counts `id = PLAN`, the one trip, before and after the leak policy |
| A first draft of the bundle test would have tripped `secret-scan.yml` | The source scan flags the bare word `service_role` outside `continent-app/scripts` and any `eyJ...eyJ` shape | The test builds the role name and the JWT-shaped strings at runtime |
| T1070's "28 policies" | Counted helper calls: two insert policies call both `group_role` and `group_all_joined` | Reported as 28 calls in 26 policies on 11 tables |

## Design choices worth knowing

- **Grant, not scope.** The prompt allowed scoping the 26 policies `to authenticated` instead. That is 26 drop and create pairs for the same outcome, and the next policy written in the house style (no TO clause) would fault again; a helper that is safe for anon cannot fault for any policy.
- **`group_all_joined` is guarded, not just granted.** Unchanged, granting it to anon would have let a visitor ask whether a list of accounts are members of a group. It now answers false unless the caller is the owner or a joined member, who can read the roster anyway; the two insert policies that call it already require that role.

## Screens checked

None in this task (no screen changed). The end check need not open a screen for T1078; once 063 is live, the Together page signed out should still draw no group trips block and show no error.

## What is still open

- Paste 063 after 061 and 062 (owner step 11 in `Execution/P15/_OPEN-supabase-migrations.md`). T1078-a.
- Definer functions outside `admin_*` are still not checked for a pinned `search_path` by any test (threat model section 5 gap, C4). T1078-b.
- The bundle check found 0 JWT-shaped strings in the local fast build because no `VITE_SUPABASE_ANON_KEY` is set here; in CI and on deploy the anon key is inlined and must pass as role anon (not verified until the first CI run). T1078-c.

### Register rows to add

| ID | Raised by | Item | Owner | Status | Order |
|---|---|---|---|---|---|
| T1078-a | T1078 | Paste supabase/migrations/063_signed_out_policy_helpers.sql after 061 and 062, per step 11 of Execution/P15/_OPEN-supabase-migrations.md | user | open |  |
| T1078-b | T1078 | No test checks that SECURITY DEFINER functions outside admin_* pin search_path; add a catalogue assertion to test_rls_policies.mjs | next task | open |  |
| T1078-c | T1078 | check-bundle-secrets.mjs ran locally on a build without the anon key; confirm on the first CI run that the inlined anon key passes as role anon | next task | open |  |

Rows that close: T1070-c and T1070-d move to `_OPEN-CLOSED.md` with `closed by T1078`.

## Rollback procedure

`git revert` of the T1078 commit. Nothing is applied live. If the owner has pasted 063, paste `063_signed_out_policy_helpers_down.sql` (no data changes), then put the three `KNOWN_UNCALLABLE` entries back.
