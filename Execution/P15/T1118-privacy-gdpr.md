# T1118: Privacy and GDPR: Article 30 current, retention sweep, export and delete end to end

ROADMAP item C9. Overnight session S34.

## Date

2026-11-06

## What changed

The record of processing (`docs/legal/ARTICLE30.md`) is current for every table and processor: rows 20 to 24 for synced things and Ask chats (054, 065), group trips, shared lists and co-plan links (052 to 059), opt-in emails (060), the waitlist (066) and uploads (061); Resend added as a processor; channel counts pointed at 067. A new section 2a gives each of the 67 tables in `public` one retention line, and `continent-app/scripts/admin/test_privacy_gdpr.mjs` fails when a migration adds a table that section does not name. Migration 069 (with a down file, never applied live) adds three things. First, `privacy_retention_sweep()`, service role only and scheduled through pg_cron as `carta_privacy_retention` daily at 03:23 UTC: it deletes `ai_plan_cache` after 7 days (closing T319-c), `coplan_link_attempts` after 7, `parse_failures` 30, `edge_errors` 90, `ai_model_events` 180, `ai_cache_events`, `ai_cap_events` and `email_log` 400, `feedback` after 2 years, `admin_audit_log` after 3 years, `guide_views` before yesterday, and runs the existing paywall prune (180 days, closing T319-b), waitlist purge (unconfirmed after 30 days) and moderation purge. Second, a `before delete` trigger on `auth.users` that covers both the traveller's own "Delete my account" and the admin delete: it deletes the waitlist sign-up with the account's address and the traveller's feedback, clears the contact address and name on reports they filed, and removes the email and handle from audit rows about them. Everything else cascades or is set to null by its foreign key. Third, `export_user_data()` schema 4: schema 3 is kept under the uncallable name `export_user_data_v3`, and the new function adds the 13 keys schema 3 never had, the waitlist included, with other travellers' ids stripped. On the account screen the "Your data" group gains a "What we keep, and for how long" row that opens the plain version of section 2a, and the delete hint now says what goes and what stays, in all six languages. The app reads schema 4 as it is and keeps its old client reads only for a project without 069. The new harness proves export and delete end to end on a local PostgreSQL 16: after the delete, no uuid column in any table holds the account id and no text column holds the address, apart from the audit row's opaque id. A control run with the trigger off shows the probe really sees what is left behind. The legal wording is a plain draft and the owner's to review.

## Files touched

- `supabase/migrations/069_privacy_gdpr.sql`, `supabase/migrations/069_privacy_gdpr_down.sql` (new)
- `continent-app/scripts/admin/test_privacy_gdpr.mjs` (new harness, picked up by `run_harnesses.mjs` and the admin-harnesses workflow)
- `continent-app/scripts/admin/test_rls_policies.mjs` (export check accepts schema 3 or later; the leak check names the key that leaked)
- `.github/workflows/admin-harnesses.yml` (path trigger on `docs/legal/ARTICLE30.md`, because the catalogue check reads it)
- `continent-app/src/auth/AuthContext.jsx` (schema 4 returned as it is), `continent-app/src/auth/AccountPanel.jsx` (the "What we keep" row), `continent-app/src/styles/91-account.css` (`.ac-keep-list`)
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (`account.keepBtn`, `keepAccount`, `keepDeleted`, `keepLogs`, `keepWaitlist`, `keepRecords`; `account.deleteHint` rewritten)
- `docs/legal/ARTICLE30.md`, `docs/HANDBOOK.md` (Sign-in and account), `ROADMAP.md` (C9 status), `Execution/_OPEN.md`

## Commands run

```
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pg1118/data -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pg1118/data -o '-p 55444' -l /var/tmp/pg1118/log start"
export PGHOST=127.0.0.1 PGPORT=55444 PGUSER=postgres
node continent-app/scripts/admin/run_harnesses.mjs            # before and after
node continent-app/scripts/admin/test_privacy_gdpr.mjs
cd continent-app && npm ci && npm test
npx eslint src/auth/AccountPanel.jsx src/auth/AuthContext.jsx scripts/admin/test_privacy_gdpr.mjs scripts/admin/test_rls_policies.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
```

On a scratch database: 069 applied, applied again, down file, applied again, all clean.

## Config and secrets set

None. 069 schedules itself only where pg_cron is enabled; that is owner step T1118-c.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Tables in `public` with a retention line in ARTICLE30.md | about 30 named across section 2, with no single list | 67 of 67 (section 2a, checked against the catalogue) | +67 lines, gate added |
| Tables with a traveller's rows in the server export | 20 keys in schema 3 (askChats and accountThings added by the client) | schema 4: 33 data keys (36 top-level with schema, exportedAt, userId), every table with a user column | +13 keys |
| Rows left with the account id or address after delete_user (local PG, seeded fixture) | control without 069's trigger: waitlist email, feedback email and audit detail, among others | 0 (outside the audit row's opaque id) | all removed or anonymised |
| Retention rules that run on a schedule | 0 in the database (051's purge only where pg_cron was on) | 15 rules in one daily job | +15 |
| RLS suite assertions | 817 of 817 | 818 of 818 | +1 (069 applied) |
| Admin harnesses green | 15 of 16 (test_edge_errors aborted: no node_modules in the container) | 17 of 17 after `npm ci` (new harness: 69 of 69) | +1 harness |
| npm test | not run before | 1375 pass, 0 fail, 12 skipped | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The RLS suite caught another traveller's id in the schema 4 export | `group_trip_expenses.split_among` is a uuid array of the members an expense is split between | Added `split_among` to the stripped keys in 069 |
| The RLS suite would fail on schema 4 | It asserted `schema === 3` | It now asserts `schema >= 3` |
| test_edge_errors aborted in the baseline run | `continent-app/node_modules` was missing in the fresh container | `npm ci`; green afterwards |
| Seeding: group and list owners were inserted twice | 055 and 059 add the owner as a member by trigger | `on conflict do nothing` in the harness seed |

## Screens checked

None in the browser. The Account panel needs a signed-in account, which the cloud container has no way to provide (register row T1118-f, for the batch end check). The change reuses the existing `Row` and `panel-section ac-inline` pattern, one new list class with token spacing, no new colour or motion. Departures from the carta-design defaults: none.

## What is still open

- T1118-a (owner): legal review of the record and of the six-language strings; the day counts are drafts.
- T1118-b (owner): the retention period for the anonymised VAT and waiver record in `pass_grants`.
- T1118-c (owner): paste 069, enable pg_cron, run one real export and one throwaway delete on production.
- T1118-d (owner): Resend's DPA and transfer basis.
- T1118-e (next task): the light DPIA for AI features that C9 also names. It was not in this task's prompt.
- T1118-f (next task): look at the new row and the longer delete hint signed in, at phone and desktop width.
- Choices made overnight, written down for the owner. Sync tombstones (`day_plans`, `account_things`, `ask_chats`) are not swept, because the T1104 merge needs them until the account goes. Unsubscribed waitlist addresses stay as the do-not-mail list. Parse-booking and plan-day cache rows cannot be told apart, so both go at 7 days. The audit row about a deleted account keeps its opaque id, under Art. 17(3)(e).

## Rollback procedure

`git revert` the T1118 commit. If 069 has been pasted, run `supabase/migrations/069_privacy_gdpr_down.sql`: it unschedules the job, drops the sweep, the trigger and the helper, and puts schema 3 back as `export_user_data` with its grants. Rows that the sweep or an account deletion already removed stay removed. Those deletes are one-way by design.

## Owner steps (for the checklist)

- [T1118-c] Paste migration 069 and turn on the daily retention job | without it nothing sweeps on a schedule and deletion leaves the waitlist address, feedback and audit detail behind | Supabase Dashboard, SQL editor: paste supabase/migrations/069_privacy_gdpr.sql after 067 and 068; look for "privacy self-check passed"; Database, Extensions: enable pg_cron, then paste 069 again (or run the cron.schedule line it prints); Account, Download my data on a real account and check the file says "schema": 4; create a throwaway account, join the waitlist with its address, delete it, and check waitlist_signups no longer holds the address | supabase/migrations/069_privacy_gdpr.sql
- [T1118-a] Legal review of the Article 30 record and the retention lines | the wording and day counts are plain drafts written overnight | read docs/legal/ARTICLE30.md sections 2, 2a, 3, 4 and 8; change any day count in section 2a and the matching constant in 069's privacy_retention_sweep; check the account.keep* and account.deleteHint strings in the six i18n files; sign the record | docs/legal/ARTICLE30.md
- [T1118-b] Decide how long the anonymised VAT and waiver record is kept | pass_grants rows outlive the account with no end date | confirm the Belgian VAT record period with the accountant; add a line for pass_grants to privacy_retention_sweep in a new migration and to ARTICLE30.md section 2a | docs/legal/ARTICLE30.md
- [T1118-d] Accept and record Resend's DPA | Resend now receives addresses for reminders and the waitlist, and section 3 has no contract version or transfer basis | in the Resend dashboard, read and accept the DPA; note its version and whether the transfer runs under the DPF or SCCs; fill the Resend row in ARTICLE30.md section 3 | docs/legal/ARTICLE30.md
