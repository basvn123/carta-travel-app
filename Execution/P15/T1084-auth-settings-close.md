# T1084: Supabase Auth settings and admin MFA applied (ROADMAP C3, closes T1071-a)

## Date

2026-11-05

## What changed

The owner did steps 2 to 7 of `Execution/P15/_OPEN-auth-settings.md` in the Supabase Dashboard for project `ntssxktaduxzpsmejwyv`, guided step by step in this session. The steps were: TOTP turned on and the owner's factor enrolled and verified, then migration 062 pasted after 061. Then email sign-up hardening, Auth rate limits, custom SMTP through Resend, access token expiry and refresh token rotation, and the Site URL and redirect list. Since 062 every admin RPC needs an `aal2` session. Before, it needed one only for delete, ban and set tier. The owner checked the gate on the local dev server (branch `p15-p1-batch`, the T1071 MfaStepUp box): the code was asked for and accepted, and the admin page loaded. The code changes nothing: this task closes register row T1071-a, opens two rows and adds the new Resend SMTP key to the secrets inventory.

## Files touched

- `Execution/P15/T1084-cuth-settings-close.md` (created)
- `Execution/_OPEN.md` (T1071-a out, T1084-c and T1084-b in)
- `Execution/_OPEN-CLOSED.md` (T1071-a in, closed by T1084)
- `ROADMAP.md` (C3 status)
- `docs/security/SECRETS.md` (row for the Resend SMTP key)

## Commands run

None in the repo. The owner ran these in the Dashboard: TOTP enable (Authentication, Multi-Factor), `supabase/migrations/062_admin_audit.sql` pasted in the SQL editor, then the settings of steps 4 to 7.

## Config and secrets set

Values the procedure gives. The owner reported each step as done but did not read back the values (T1084-c).

- Multi-Factor: TOTP enabled for enrolment and verification; owner factor verified.
- Email: confirm email, secure email change and secure password change on; minimum password length 12; no character class rules; leaked password check on where the plan allows it; email OTP expiry 3600 s or less.
- Rate limits: sign-ups and sign-ins 20, token verifications 15, token refreshes 150 (per 5 minutes); emails sent 30 per hour.
- SMTP: `smtp.resend.com`, port 465, user `resend`, password a Resend API key with sending access only (redacted; name `supabase-auth-smtp`), sender `noreply@carta-europetravel.com`.
- Sessions: access token expiry 3600 s; refresh token reuse detection on, reuse interval 10 s; time-box 90 days and inactivity 30 days where the plan offers them.
- URL Configuration: Site URL `https://www.carta-europetravel.com`. Redirect URLs are the five origins of the procedure, each as a bare origin plus `/**`. The app redirects to `window.location.origin` with no trailing slash (`continent-app/src/auth/AuthContext.jsx`), so the bare origins were added in case `/**` does not match it.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Admin RPC tiers that require aal2 | 1 of 3 (destructive only) | 3 of 3 (read, live, destructive) | +2 |

The Dashboard values before and after were not recorded (T1084-c).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The owner's lookup in `auth.mfa_factors` by email returned no rows, though the gate accepted the factor's code | Most likely an email typo in the query; the step-up only accepts a verified factor | None needed; the gate check counts |
| Sparse worktree patterns came out as `C:/Program Files/Git/Execution/...` | Git Bash path conversion turned the leading `/` into the Git install path | `MSYS_NO_PATHCONV=1` and patterns without the leading slash |

## Screens checked

The owner saw the admin page at `http://localhost:5173` at desktop width: the code step-up appeared, the code was accepted and the page loaded. No phone width, no trail page upload door, no `verify_admin_panel.mjs` run, so T1071-d stays open.

## What is still open

- T1084-c: the before and after values for the C3 close-out (owner).
- T1084-b: the live admin page is locked until the P1 batch with the MfaStepUp box is deployed, because 062 is in the database and the deployed app cannot do the step-up (owner, deploy).
- T1071-c (CAPTCHA) and T1071-d (browser check at 375 and 1440 plus the verify script) stay open as they were.
- Not raised as a row, a suggestion for the owner: a refresh keeps the session's `aal2`, so a stolen refresh token from a verified session is still admin. Asking for the code again after a fixed time (for example 12 hours) would be a small app task.

## Rollback procedure

`git revert` of the T1084 commit restores the register. The Dashboard settings are changed back by hand in the Dashboard. To undo 062, run `supabase/migrations/062_admin_audit_down.sql` in the SQL editor. That also makes the live admin page work again without the deploy.
