# T1081: a required reason on ban, delete and set tier; the upload scan secrets on record

## Date

2026-11-05

## What changed

Suspending an account, deleting it and changing its pass now need a reason, and the reason lands in `admin_audit_log.reason` (register row T1071-b), once the owner pastes migration `supabase/migrations/064_admin_action_reasons.sql` (with `_down`). 064 drops the old signatures and re-creates `admin_ban_user(p_user, p_reason, p_days)`, `admin_delete_user(p_user, p_confirm, p_reason)` and `admin_set_tier(p_user, p_tier, p_reason, p_days)` from 045's and 051's bodies with two changes each: a reason of 3 to 500 characters after trimming, refused with `reason_required` right after the MFA check and before any read of the account, and `reason` in the audit detail, which 062's trigger copies into the `reason` column. The guard, MFA check, refusals and grants are unchanged. The user detail screen asks for "Reason, for the admin log" beside Apply pass change, Suspend and Delete forever and keeps each button off until the reason is 3 characters; `src/auth/admin.js` sends `p_reason`, so the app and 064 go live in one sitting (owner step 12). The Suspend row now uses the shared `Button`. `admin-rpc-security` gained section 14 (the three refuse a missing, blank or two-letter reason without touching the account or writing a row, a non-admin still hears `forbidden` first, and on success the trimmed reason is in `admin_audit_log.reason` with the `user:<id>` target, including after a deletion): 242 to 261 assertions, all passing locally. `docs/security/SECRETS.md` now lists `UPLOADS_SCAN_SECRET` and the vault secrets `uploads_scan_secret` and `uploads_scan_url`, where each lives, what reads it, its blast radius and how to rotate the pair together (register row T1070-b).

## Files touched

Created:
- `supabase/migrations/064_admin_action_reasons.sql`, `supabase/migrations/064_admin_action_reasons_down.sql`
- `Execution/P15/T1081-admin-reasons.md`

Modified:
- `continent-app/src/auth/admin.js` (`p_reason` on the three calls)
- `continent-app/src/components/admin/useUserDetail.js` (three reason states, sent and cleared)
- `continent-app/src/components/admin/UserDetail.jsx` (`ReasonField` beside the three actions; buttons need a reason; the Suspend row uses the shared `Button`)
- `continent-app/src/components/admin/useErrText.js` (`reason_required`)
- `continent-app/src/i18n/en.js` (`admin.errReasonRequired`, `admin.reasonLabel`, three placeholders; admin strings are English only)
- `continent-app/scripts/admin/test_admin_rpc_security.mjs` (section 14)
- `continent-app/scripts/verify_admin_panel.mjs` (steps 5, 7b and 8 type a reason, assert the button is off without one and that the RPC got `p_reason`; Suspend is found by role)
- `docs/security/SECRETS.md` (three rows and the rotation paragraph)
- `docs/HANDBOOK.md` (Admin panel: reasons for account actions, data, limits)
- `docs/security/threat-model.md` (section 11 row R and gap, ranked row 11)
- `Execution/P15/_OPEN-supabase-migrations.md` (step 12)

## Commands run

```
# the same throwaway cluster as T1078 (port 55481), never the live project
mkdb.sh carta_dev 063                                # stubs, schema.sql, 002 to 063, no _down
psql -f 064_admin_action_reasons.sql                 # self-check passed
psql -f 064_admin_action_reasons.sql                 # pasted twice: passes
psql -f 064_admin_action_reasons_down.sql            # down: the three old signatures back
psql -f 064_admin_action_reasons.sql                 # up again: passes, one signature each
PGPORT=55481 node continent-app/scripts/admin/test_admin_rpc_security.mjs
PGPORT=55481 node continent-app/scripts/admin/test_rls_policies.mjs
cd continent-app
CARTA_CONTRACT_DERIVE_SPLIT=1 PGPORT=55481 node scripts/ci/check-contract.mjs
npx eslint src/auth/admin.js src/components/admin/UserDetail.jsx src/components/admin/useUserDetail.js src/components/admin/useErrText.js src/i18n/en.js
node --check scripts/verify_admin_panel.mjs
node scripts/ci/design-lint.mjs
npm test
```

## Config and secrets set

None. `SECRETS.md` documents names and places only; no value was read or written.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Of ban, delete and set tier, how many record a reason | 0 of 3 | 3 of 3 (after the paste) | +3 |
| Old signatures without a reason still callable | 3 | 0 | -3 |
| `admin-rpc-security` locally | 242 of 242 (after T1078) | 261 of 261 | +19 |
| `rls-policies` locally | 736 of 736 | 737 of 737 (one more migration applied) | +1 |
| Upload scan secrets in `SECRETS.md` | 0 of 3 | 3 of 3 | +3 |
| design lint, new violations | 0 | 0 (two baseline raw buttons gone) | 0 |
| eslint errors on touched app files | 0 | 0 | 0 |
| Contract gate, database half | passes | passes (62 migrations, 161 functions) | |
| `npm test` (this worktree, 12 skip without `public/boot.json`) | 1,270 tests, 0 fail | 1,270 tests, 1,258 pass, 12 skip, 0 fail | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| design lint reported 2 new raw buttons | The baseline is keyed by line text, so editing the Suspend row's existing `<button>` lines counts as new | The Cancel and Suspend controls use the shared `Button` (secondary, danger with `loading`); the verify script finds Suspend by role |
| The contract gate failed on the PGRST202 fallback | First as a non-literal function name forwarded to .rpc(), then, with literal names, as calls that do not fit the new signatures | The fallback was dropped; deploy and paste go together |
| A Bash one-liner rewriting the verify script failed on template literals | Git Bash command substitution inside a double-quoted `node -e` | The edits were made with the Edit tool |

## Design choices worth knowing

- **Drop, not overload.** Keeping the old signatures beside the new ones would leave a call path with no reason. Dropping them means an app without T1081 gets PGRST202 on these three actions after the paste, so the deploy and the paste go together (owner step 12 says so).
- **No fallback in the app.** A first version retried a PGRST202 answer without the reason, to bridge deploy and paste. The contract gate rejected it (it checks every call against the repo catalogue, where the old signatures no longer exist), and a fallback is a call path without a reason. So deploy and paste go together; between them only these three actions answer PGRST202.
- **Reason before the target.** The reason check sits after MFA and before any read of the account, as 045 placed the MFA check, so an empty reason learns nothing about whether an id exists.

## Screens checked

None in this task (no dev server, per the batch rules). The end check must look at, at phone and desktop width: Admin, then an account's detail after the MFA step-up: the Pass card (reason field, Apply off until 3 characters), Suspend sign-in armed (reason field, Suspend off until 3 characters, the shared buttons in the row), Delete this account armed (reason field under the confirmation); and run `node scripts/verify_admin_panel.mjs` against the dev server (steps 5, 7b and 8 changed).

## What is still open

- Paste 064 after 061, 062 and 063, with the T1081 app deploy in the same sitting (owner step 12 in `Execution/P15/_OPEN-supabase-migrations.md`). T1081-a.
- The per-migration admin harnesses outside CI (`test_admin_mfa.mjs`, `test_admin_followups.mjs`, `test_moderation_decisions.mjs`) still call the old two and three argument signatures; they were already broken (T1070-e) and now also need the reason argument. Folded into T1070-e, no new row.
- The account history on the detail screen does not show the reason of a past action (the audit log tab does once 064 is live). Not needed for the record; noted only.

### Register rows to add

| ID | Raised by | Item | Owner | Status | Order |
|---|---|---|---|---|---|
| T1081-a | T1081 | Paste supabase/migrations/064_admin_action_reasons.sql after 061, 062 and 063 and deploy the T1081 app in the same sitting, per step 12 of Execution/P15/_OPEN-supabase-migrations.md | user | open |  |

Rows that close: T1071-b and T1070-b move to `_OPEN-CLOSED.md` with `closed by T1081`.

## Rollback procedure

`git revert` of the T1081 commit. Nothing is applied live. If the owner has pasted 064, paste `064_admin_action_reasons_down.sql` (no data changes; reasons already logged stay) and roll the app back with it.
