# T1070: the upload path's server half (register row T333-a)

## Date

2026-11-05

## What changed

The photo and track upload path T333 built on the device now has its server half, written as migration `supabase/migrations/061_user_uploads.sql` (with `061_user_uploads_down.sql`) and the Edge Function `supabase/functions/upload-scan/`, both following T333's design: a `user_uploads` table (RLS on, owner read only, no client write policy), a private `user-uploads` bucket (25 MB, JPEG, PNG and GPX only) whose policies let a caller write only into their own folder at one of their own reserved paths and let anyone read a file only once its row is published, `begin_upload` and `finish_upload` with the exact arguments `src/community/uploads.js` sends, `remove_my_upload`, `report_content` with `target_kind` and `target_id` on `content_reports`, `admin_list_uploads` and `admin_decide_upload` (a decline or removal needs a ground and a statement of reasons, and publishing needs the server privacy pass), folder removal on account deletion through a trigger on `auth.users`, and the reserved-row sweep. `upload-scan` re-runs the device's two privacy modules on every pending upload and deletes queued files through the Storage API. Nothing is applied live: the owner procedure is `Execution/P15/_OPEN-uploads.md`. The contract gate's two `KNOWN_DB_GAPS` entries (`begin_upload`, `finish_upload`) are gone and the gate passes; the app's 78 RPC calls all fit the catalogue of 59 migrations. Fixing the two security workflows' loaders (they applied every `_down.sql` and skipped `supabase/schema.sql`, so both had aborted at 056 since 055 landed) and extending them took the row policy suite from an abort at 056 to 500 of 500 and the admin surface from an abort to 226 of 226, all 59 migrations applied in order on a local Postgres 18. Row T333-a can close.

## Files touched

Created:
- `supabase/migrations/061_user_uploads.sql`, `supabase/migrations/061_user_uploads_down.sql`
- `supabase/functions/upload-scan/index.ts`, `logic.mjs`, `README.md`
- `supabase/functions/_shared/stripImageMeta.js`, `supabase/functions/_shared/gpxPrivacy.js` (byte copies of `continent-app/src/lib/`)
- `continent-app/tests/uploadScan.test.mjs`
- `Execution/P15/_OPEN-uploads.md`, `Execution/P15/T1070-upload-migration.md`

Modified:
- `continent-app/scripts/ci/check-contract.mjs` (`KNOWN_DB_GAPS` emptied; Storage stubs)
- `continent-app/scripts/admin/test_rls_policies.mjs` (loader: skip `_down`, apply `schema.sql`; Storage stubs; fixtures for `saved_trips`, `user_settings`, `user_uploads`; `KNOWN_UNFIXTURED` and function-level `KNOWN_UNCALLABLE` entries; section 4e, the upload path end to end)
- `continent-app/scripts/admin/test_admin_rpc_security.mjs` (same loader and stubs; section 12, `admin_decide_upload`; floor 41 to 43 functions)
- `.github/workflows/rls-policies.yml`, `.github/workflows/admin-rpc-security.yml` (also run on `supabase/schema.sql`)
- `continent-app/src/community/uploads.js` (header comment only: the server half exists; the version constants move together with 061)
- `docs/HANDBOOK.md` (new section "Photo and track uploads")
- `docs/security/threat-model.md` (section 8, the database gap, ranked row 5)

## Commands run

```
# throwaway cluster in the scratchpad, never the live project
initdb -D pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D pgdata -o "-p 55470" start
# every migration in order, _down skipped, after the stubs and supabase/schema.sql
mkdb.sh carta_dev                                    # 59 files, 061 self-check passed
psql -f 061_user_uploads.sql                         # pasted twice: passes
psql -f 061_user_uploads_down.sql                    # down: table, bucket, functions gone, plan_id NOT NULL again
psql -f 061_user_uploads.sql                         # up again: passes
PGPORT=55470 node continent-app/scripts/admin/test_rls_policies.mjs
PGPORT=55470 node continent-app/scripts/admin/test_admin_rpc_security.mjs
cd continent-app
CARTA_CONTRACT_DERIVE_SPLIT=1 PGPORT=55470 node scripts/ci/check-contract.mjs
node --test tests/uploadScan.test.mjs
npx eslint src/community/uploads.js tests/uploadScan.test.mjs
npm test
```

## Config and secrets set

None. New secret names, for the owner to set (no values here): `UPLOADS_SCAN_SECRET` (Supabase function secret) and the vault secrets `uploads_scan_url`, `uploads_scan_secret`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Server functions behind the upload form | 0 (T333: "inert on the server") | 10 SQL functions, 1 Edge Function | +11 |
| `KNOWN_DB_GAPS` in the contract gate | 2 | 0 | -2 |
| Contract gate, database half (local Postgres) | passes with 2 known gaps | passes, 59 migrations, 63 relations, 158 functions | |
| `rls-policies` locally | aborts at 056 (52 of 54) | 500 of 500 | |
| `admin-rpc-security` locally | aborts at 056 (53 of 56) | 226 of 226 | |
| Tables with an isolation fixture | 14 | 17 (+ `saved_trips`, `user_settings`, `user_uploads`) | +3 |
| Tables with policies and no fixture | 19 (hidden by the abort) | 17, listed and asserted | -2 |
| `npm test` (this worktree; 12 skip for want of `public/boot.json`) | 1,236 tests | 1,244 tests, 1,232 pass, 0 fail | +8 |
| eslint errors on touched app files | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Both security workflows aborted at 056 | The loaders took every `NNN_*.sql`, so each `_down.sql` ran after its migration, and neither applied `supabase/schema.sql` (which alone creates `user_settings`, joined by 056) | Skip `_down`, apply `schema.sql` first, as `check-contract.mjs` already did |
| 061 failed in every harness | No harness had a `storage` schema | Storage stubs (the two tables, `foldername()`, RLS on objects, API grants) in the three harnesses |
| The RLS gate then failed on pre-existing debt | 17 tables from 052 to 060 without a fixture; 28 policies whose helpers `anon` cannot execute | Listed as `KNOWN_UNFIXTURED` and function-level `KNOWN_UNCALLABLE` entries, each asserted to still occur, so a fix forces the entry out and a new table still fails (T1070-c, T1070-d) |
| `contract gate FAILED` without data | This worktree has no `public/boot.json` | Run with `CARTA_CONTRACT_DERIVE_SPLIT=1`; with `PGPORT` set the database half runs and passes |
| A Bash heredoc with escaped quotes would not parse | Git Bash quoting | The test edits were made with the Edit tool |
| The first down file failed where pg_cron is absent | `if exists (pg_cron) and exists (select from cron.job)` is one expression, parsed whole, so `cron.job` must exist | `to_regclass('cron.job')` then a dynamic `execute`; down, then up again, both pass locally. `060_email_prefs_down.sql` has the same fault (T1070-e) |

## Screens checked

None in this task (no screen changed: `uploads.js` changed in a comment only). The end check should open a trail page at phone and desktop width, open "Add a photo or track" signed in (with `?uploadmock`) and confirm the dialog behaves as before.

## What is still open

- Applying 061 and deploying `upload-scan` is the owner's (procedure `Execution/P15/_OPEN-uploads.md`). T1070-a.
- `docs/security/SECRETS.md` needs the three new secret names (`UPLOADS_SCAN_SECRET`, vault `uploads_scan_url`, `uploads_scan_secret`); it is outside this task's files. T1070-b.
- 17 tables with policies have no isolation fixture in the RLS suite (`ask_chats`, `email_log`, `email_prefs`, `friend_visibility`, seven `group_trip_*`, `pay_links`, four `shared_list*`, `trip_join_requests`). T1070-c.
- 28 policies on the group trip and shared list tables (055, 058, 059) apply to every role but call `group_role`, `group_all_joined` or `shared_list_role`, which only `authenticated` may execute, so a signed-out read answers 42501. Scope the policies `to authenticated` or grant the helpers. T1070-d.
- The other per-migration harnesses in `continent-app/scripts/admin/` (`test_admin_followups.mjs`, `test_moderation_decisions.mjs` and the rest) still apply `_down` files and lack `schema.sql` and Storage, so they abort at 056; they are not in CI. `060_email_prefs_down.sql` references `cron.job` statically and fails where pg_cron is off. T1070-e.
- The policies ran against Storage stubs, not the real Storage API; step 6 of the owner procedure is the first real run.
- Row T333-a can close: the migration it asked for exists. T333-b (legal wording), T333-c (app half: page display, review list), T333-d (other pages), T333-e (privacy policy), T333-f (Terms notice) stay open.

### Register rows to add

| ID | Raised by | Item | Owner | Status | Order |
|---|---|---|---|---|---|
| T1070-a | T1070 | Apply 061, deploy upload-scan with its secret and schedule it, per Execution/P15/_OPEN-uploads.md, after T333-b and T333-f clear | user | open | 1 |
| T1070-b | T1070 | docs/security/SECRETS.md lacks UPLOADS_SCAN_SECRET and the vault secrets uploads_scan_url and uploads_scan_secret | next task | open |  |
| T1070-c | T1070 | 17 tables with policies (052 to 060) have no isolation fixture in test_rls_policies.mjs; each is listed in KNOWN_UNFIXTURED | next task | open |  |
| T1070-d | T1070 | 28 policies in 055, 058 and 059 call helpers anon cannot execute, so a signed-out read answers 42501; scope them to authenticated or grant the helpers | next task | open |  |
| T1070-e | T1070 | The per-migration admin harnesses outside CI still apply _down files and lack schema.sql and Storage stubs, so they abort at 056; 060_email_prefs_down.sql fails where pg_cron is off | next task | open |  |

T333-a moves to `_OPEN-CLOSED.md` with `closed by T1070`.

## Rollback procedure

`git revert` of the T1070 commit. Nothing is applied live. If the owner has applied 061: empty the `user-uploads` bucket, then paste `061_user_uploads_down.sql` (one way for upload records and upload reports), then put the two `KNOWN_DB_GAPS` entries back.
