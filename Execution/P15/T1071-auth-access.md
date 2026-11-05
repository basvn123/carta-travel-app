# T1071: auth and access, the code half (ROADMAP C3)

## Date

2026-11-05

## What changed

Every admin RPC now needs a verified second factor, and every admin write says what it touched and why, once the owner applies migration `supabase/migrations/062_admin_audit.sql` (with `062_admin_audit_down.sql`). `admin_guard` checks membership, then `auth.jwt() ->> 'aal'` (a missing claim fails closed), then the rate budget, and answers `mfa_required` for every tier; before, only delete, ban and set tier asked for `aal2`, so 37 of the 40 callable admin functions (the user list with every email, live config, moderation decisions, overrides, the upload decision) accepted a stolen `aal1` session. The admin read policy on the upload bucket needs `aal2` too. The audit table the ROADMAP asks for already existed as `admin_audit_log` (014, 015: who, action, at, target account, detail); 062 extends it with `target` and `reason`, filled by a trigger from the detail every function already writes and back-filled for old rows, and `admin_set_infra_cost`, the one state-changing admin RPC that wrote no row, now writes one. The admin page shows the TOTP step-up right after the password lock and loads nothing until the session is `aal2`, with a sentence saying why. The Dashboard settings (email confirmation, password rules, leaked-password check, rate limits, JWT expiry, refresh rotation, sessions, redirect URLs, owner MFA) are owner steps with exact paths and values in `Execution/P15/_OPEN-auth-settings.md`, citing the threat model. The admin surface suite went from 226 to 241 assertions, all passing locally; callable admin functions refusing an `aal1` admin went from 3 of 40 to 40 of 40.

## Files touched

Created:
- `supabase/migrations/062_admin_audit.sql`, `supabase/migrations/062_admin_audit_down.sql`
- `Execution/P15/_OPEN-auth-settings.md`, `Execution/P15/T1071-auth-access.md`

Modified:
- `continent-app/src/admin/AdminPage.jsx` (the step-up gate after the lock; every loading hook waits for `aal2`)
- `continent-app/src/i18n/en.js` (`admin.mfaPageHint` added, `admin.mfaNeedFactor` reworded; the admin strings exist in English only)
- `continent-app/scripts/admin/test_admin_rpc_security.mjs` (section 13; `volatile` in the discovery)
- `continent-app/scripts/verify_admin_panel.mjs` (the step-up moved from the ban form to the page gate: step 1b; steps 5 and 7b now run on the `aal2` session; `openAdmin` passes the gate)
- `docs/HANDBOOK.md` (Admin panel: MFA, audit log, data, limits)
- `docs/security/threat-model.md` (sections 4 and 11, ranked rows 3 and 11)

## Commands run

```
mkdb.sh carta_dev                                    # all 60 migrations in order, 062 self-check passed
psql -f 062_admin_audit.sql                          # pasted twice: passes
psql -f 062_admin_audit_down.sql                     # down: 051 guard, 031 infra cost, 061 policy back; columns gone
psql -f 062_admin_audit.sql                          # up again: passes
PGPORT=55470 node continent-app/scripts/admin/test_admin_rpc_security.mjs
PGPORT=55470 node continent-app/scripts/admin/test_rls_policies.mjs
cd continent-app
CARTA_CONTRACT_DERIVE_SPLIT=1 PGPORT=55470 node scripts/ci/check-contract.mjs
npx eslint src/admin/AdminPage.jsx src/i18n/en.js scripts/verify_admin_panel.mjs
node --check scripts/verify_admin_panel.mjs
npm test
```

## Config and secrets set

None. The Dashboard changes are the owner's (`_OPEN-auth-settings.md`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Callable admin functions that refuse an `aal1` admin | 3 of 40 (delete, ban, set tier) | 40 of 40 (asserted, discovered from `pg_proc`) | +37 |
| State-changing (VOLATILE, callable) admin RPCs that write an audit row | 17 of 18 | 18 of 18 | +1 |
| Audit columns for who, action, target, reason, at | 3 of 5 (`target_user` only for accounts; reason inside `detail` when present) | 5 of 5 | +2 |
| `admin-rpc-security` locally | 226 of 226 (after T1070) | 241 of 241 | +15 |
| `rls-policies` locally | 500 of 500 | 501 of 501 (one more migration applied) | +1 |
| Contract gate, database half | 59 migrations, 158 functions | 60 migrations, 161 functions, passes | |
| `npm test` (this worktree, 12 skip for want of `public/boot.json`) | 1,244 tests, 1,232 pass, 0 fail | 1,244 tests, 1,232 pass, 0 fail | 0 |
| eslint errors on touched app files | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The admin surface suite failed: three new `admin_audit_*` helpers were neither SECURITY DEFINER nor guarded | The suite treats every `admin_*` name as an admin RPC | Renamed to `audit_log_fill`, `audit_log_target`, `audit_log_reason` (internal, no grants) |
| `verify_admin_panel.mjs` would stop at the tiles after unlock | The page now asks for a code first | The enrol, wrong-code and right-code checks moved from step 7b to a new step 1b at the gate; 5 and 7b assert nothing more is asked on `aal2`; `openAdmin` passes the gate in the later contexts. Not run here (it needs the dev server); the end check runs it |

## Design choices worth knowing

- **Extend, not duplicate.** A second audit table next to `admin_audit_log` would split the trail and the rate budget, which counts audit rows. `target` and `reason` are columns on the existing table; the ROADMAP's "admin_audit table (who, action, target, reason, at)" maps to `actor, action, target, reason, created_at`.
- **Reads are not logged.** Admin reads are STABLE functions (they cannot insert), and logging them would spend the 60-a-minute budget on dashboard refreshes. The two reads that open one person's record (`admin_get_user`, `admin_mark`) were already VOLATILE and already log.
- **The guard returns, it does not raise.** As every other refusal in the schema, `{error: 'mfa_required'}`, which `useErrText` already words. A STABLE guard cannot write, so an `aal1` refusal leaves no audit row; the explicit `mfa_refused` rows 045 and 051 write inside delete, ban and set tier are now unreachable (kept as defence in depth).

## Screens checked

None in this task (no dev server, per the batch rules). The end check must look at, at phone and desktop width: Account, Admin, the password lock; then the new step-up gate (enrol state with QR and key, wrong code, right code); then the Overview loading after the code; and run `node scripts/verify_admin_panel.mjs` against the dev server.

## What is still open

- The Dashboard settings and the owner's TOTP enrolment, then pasting 062, in that order (`Execution/P15/_OPEN-auth-settings.md`). Until then the live admin page works as before against the old guard, apart from asking for the code first, which it can pass once TOTP is enabled in the Dashboard; with TOTP disabled the gate cannot be passed (the enrol box says "Check that TOTP is enabled under Authentication"). T1071-a.
- Ban, delete and set tier take no reason argument, so their audit rows carry no reason; adding one is a signature change in the RPCs and the user detail screen. T1071-b.
- No CAPTCHA on sign-up or password reset (Turnstile needs an app change and a Cloudflare widget). T1071-c.
- A refusal at the guard is not in the audit table (Supabase auth and API logs hold it). Accepted; noted in the threat model.

### Register rows to add

| ID | Raised by | Item | Owner | Status | Order |
|---|---|---|---|---|---|
| T1071-a | T1071 | Enable TOTP and enrol the owner's factor, then paste 062, then set the Auth Dashboard values in Execution/P15/_OPEN-auth-settings.md | user | open | 1 |
| T1071-b | T1071 | admin_ban_user, admin_delete_user and admin_set_tier take no reason, so their audit rows carry none; add a reason argument and the field on the user detail screen | next task | open |  |
| T1071-c | T1071 | No CAPTCHA on sign-up and password reset; add Cloudflare Turnstile through Supabase Auth's captcha setting and the app's auth forms | next task | open |  |

## Rollback procedure

`git revert` of the T1071 commit. If the owner has applied 062, paste `062_admin_audit_down.sql`: it puts back 051's guard, 031's `admin_set_infra_cost` and 061's admin storage policy; the `target` and `reason` columns are dropped (one way for what they held; `detail` still holds the reasons that were in it).
