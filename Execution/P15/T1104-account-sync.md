# T1104: Accounts that keep your work (account sync)

ROADMAP I5. Session S20 of the 50-session overnight run. Branch `p15-s20-account-sync`. Migration number 065.

## Date

2026-11-06

## What changed

A signed-in traveller's work now follows them to another device. Settings, the shortlist, saved lists, visited countries (user_settings), day plans (day_plans), account trips (trip_plans) and Ask chats (ask_chats) already synced; the four things that were still stuck in one browser now sync too: trips kept from the trip finder (`carta.keptTrips.v1`), bookmarked Carta trips (`carta.savedJourneys.v1`), trips in progress on the Plan home (`carta.trips.v1`) and the one trip kept without an account (`carta.deviceTrip.v1`). Migration 065 adds `account_things` (one row per thing, `deleted_at` tombstone, owner-only RLS, no anon grant, a 1000-row cap per account through a definer trigger with `search_path = ''`, a 256 KB body check) with a down migration. `src/auth/accountSync.js` holds the merge rule and runs on sign-in, 2 seconds after a local change and when the tab comes back into view. The rule, per thing: on this device only and never synced, moved to the account; in the account only, brought here; different on both, the newer change wins; removed here since the last sync, a tombstone, unless the account copy changed later; a tombstone over a copy this device changed later loses. A signed-out device's work is added to the account, never replaced. The trip open in the planner is never overwritten, and the single device trip slot keeps its own trip. A device remembers the account it last synced with (`carta.accountSync.v1`): signing in as a different account removes the previous account's things from the device, its open trip's planner keys included, and never copies them into the new account. Without 065 the sync turns itself off and nothing changes. The data export carries the rows as `accountThings`. Proved by 11 node tests running two simulated devices against one stubbed account, and by the RLS suite (741 to 764 assertions) and all 16 admin harnesses on a local PostgreSQL 16. Not live: pasting 065 and the real two-device check are owner steps.

## Files touched

Created:
- `supabase/migrations/065_account_things.sql`
- `supabase/migrations/065_account_things_down.sql`
- `continent-app/src/auth/accountSync.js` (the merge engine, the per-kind adapters, the browser binding)
- `continent-app/src/auth/accountThingsCloud.js` (the two Supabase calls)
- `continent-app/tests/accountSync.test.mjs`
- `Execution/P15/T1104-account-sync.md`

Modified:
- `continent-app/src/auth/AuthContext.jsx` (bind on sign-in through a lazy import, unbind on sign-out; `accountThings` in the data export)
- `continent-app/src/lib/deviceData.js` (`carta.accountSync.v1` is one of the traveller's things, so "Sign out and remove" clears it)
- `continent-app/src/components/CookiesPage.jsx` (header comment only: the new key under "your things", which `tests/deviceData.test.mjs` ties to deviceData)
- `continent-app/scripts/admin/test_rls_policies.mjs` (an isolation fixture for `account_things` and a 065 section: tombstone upsert by the owner, a second user's upsert over the owner's key refused, shape checks, the cap and an update at the cap)
- `docs/HANDBOOK.md` (Sign-in and account; My trips)
- `ROADMAP.md` (I5 status)
- `Execution/_OPEN.md` (rows T1104-a to T1104-e)

Not touched: `src/planner/` (other sessions' plan flow tonight). The sync reads and writes the planner's storage keys through `tripsStore.js` and `deviceTripStore.js` exports only.

## Commands run

```
# a throwaway PostgreSQL 16 cluster (apt's version in the container; CI runs 18)
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pg1104/data -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pg1104/data -o '-p 55444' start"
export PGHOST=127.0.0.1 PGPORT=55444 PGUSER=postgres
node continent-app/scripts/admin/test_rls_policies.mjs          # before and after
node continent-app/scripts/admin/run_harnesses.mjs              # before and after
# 065 alone on an empty database: up, up again, down, down again, up
psql -d t1104 -f supabase/migrations/065_account_things.sql (x2), 065_account_things_down.sql (x2), 065_account_things.sql
cd continent-app
npx eslint src/auth/accountSync.js src/auth/accountThingsCloud.js src/auth/AuthContext.jsx src/lib/deviceData.js src/components/CookiesPage.jsx tests/accountSync.test.mjs
node --test tests/accountSync.test.mjs
npm test
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| RLS suite assertions (local PG 16) | 741 of 741 | 764 of 764 | +23 (13 isolation for account_things, 9 in the 065 section, 1 migration applied) |
| Tables covered by an isolation fixture | 34 | 35 | +1 |
| SECURITY DEFINER functions with a pinned search_path | 120 | 121 of 121 | +1 (`account_things_cap`) |
| Admin harnesses green | 16 of 16 | 16 of 16 | 0 |
| `npm test` | not run on the base | 1339 pass, 0 fail, 12 skipped | |
| Account sync tests | 0 | 11 of 11 | +11 |
| Kinds of a traveller's work that follow the account | settings, lists, day plans, account trips, chats | plus kept trips, bookmarks, trips in progress, the device trip | +4 |
| Guest first-load JS added | | 0 (sync is two lazy chunks, 7.8 KB and 0.5 KB, loaded only when signed in) | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The RLS suite would not load after the new section | `badKind` was already declared later in the same function | Renamed the 065 checks' locals (`thingKind`, `thingBody`, `thingId`) |
| Test "the newer change wins" failed at first | The test edited a kept trip without moving its `keptAt`, which `keep()` never does; the rule counts such a change as "now" and it won | The test now makes a realistic offline edit stamped earlier |
| Another account's open trip would have come back as the new account's work | Dropping the entry from `carta.trips.v1` left the planner keys, and the next `snapshotActive` re-lists them | Dropped trips go through `tripsStore.deleteTrip`, which clears the open trip's keys; a test covers it |

## Screens checked

None: nothing a traveller sees changed (no new screen, string or style). The sync runs behind the existing screens, and pulled things appear in the lists those screens already draw. The two-device look in a browser needs 065 live and is owner step T1104-b.

## What is still open

- T1104-a (user): paste 065 into the live project; the app's sync stays off until then.
- T1104-b (user): the real two-device check, once 065 is live.
- T1104-c (next task): `tripsStore` has no outside change signal, so a Plan home or trips list already on screen shows pulled trips at its next render, and the planner's in-memory store is not told when a previous account's open trip is removed. The fix is in `src/planner/` (an exported `notifyExternalChange` that the sync calls), out of scope tonight because other sessions work there.
- T1104-d (next task): the traveller-facing "3 trips moved to your account" notice the roadmap names. The engine already counts it (`moved`, `movedByKind`) and dispatches `carta:account-sync`; the notice needs copy in six locales and the carta-design review, so it is its own task.
- T1104-e (next task): the rest of I5, Apple sign-in and magic link (audit P-47). Apple sign-in needs the Apple Developer membership in T272-b.
- Tested on PostgreSQL 16 (what apt has here); the two CI jobs run 18 on push.

## Rollback procedure

`git revert` the T1104 commits. If 065 was pasted, paste `supabase/migrations/065_account_things_down.sql`: one-way for the data in `account_things` (every device that synced keeps its own copy in local storage; a new device would no longer pull it). The app without the table turns the sync off by itself, so the order of the two does not matter.

## Owner steps (for the checklist)

- [T1104-a] Paste migration 065 (account sync table) | kept trips, bookmarks, trips in progress and the device trip only follow the account once the table exists | in the Supabase SQL editor paste supabase/migrations/065_account_things.sql after 064; look for "account things self-check passed"; from continent-app/ run node scripts/verify_live_policies.mjs | supabase/migrations/065_account_things.sql
- [T1104-b] Check signed-in work on two devices | the sync is proven only against a stubbed account here, never against the live project | after T1104-a and a deploy, signed out on a phone keep a trip from the trip finder and bookmark a Carta trip; sign in; on a laptop sign in to the same account and open My trips: both should be there within a few seconds; remove the bookmark on the laptop and reopen the phone: it should be gone; sign in on the phone as a second test account: the first account's things should leave the phone and not appear in the second account | Execution/P15/T1104-account-sync.md
