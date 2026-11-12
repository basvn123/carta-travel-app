# Owner procedure: Supabase Auth settings and admin MFA (T1071, ROADMAP C3, row T1071-a)

Why: `docs/security/threat-model.md` section 4 (Supabase Auth) found that every setting that decides account takeover risk lives in the Supabase Dashboard and none could be verified from the repo; the local `supabase/config.toml` holds the defaults (6-character passwords, no confirmation, TOTP off). Ranked gap 2. Section 11 (admin) found that admin reads and live writes accepted an `aal1` session; migration 062 closes that in the database (ranked gap 3), and step 2 below must come first or the admin page locks you out.

Project: `ntssxktaduxzpsmejwyv`. Menu names are the Dashboard's as of 2026-11; if one has moved, search the Dashboard for the setting's name. Write down the value you found before changing it (for the report of the task that checks these). Never paste a secret into chat.

## Order

1. **Look first.** Authentication, Sign In / Providers, Email; Authentication, Rate Limits; Authentication, Sessions; Authentication, Multi-Factor; Project Settings, JWT Keys. Note what each setting below is today.

2. **TOTP on, and your factor enrolled, before 062.** Authentication, Multi-Factor: TOTP (App Authenticator) **Enabled** for both enrolment and verification; maximum factors per user 10 (default). Then sign in to Carta as the owner, open Account, Admin: after the password lock the page now shows "Set up an authenticator app" (T1071). Scan the code into your authenticator app **and** into a second device (or write the shown key down and keep it offline with the other recovery codes), then type the code. Supabase TOTP has no recovery codes, and losing the only device would lock the admin page until the factor is removed by hand in the SQL editor (`delete from auth.mfa_factors where user_id = '<your id>';`).

3. **Paste 062.** SQL editor, the whole of `supabase/migrations/062_admin_audit.sql`, after 061. Expect `admin audit self-check passed`. Reload the admin page: it asks for a code once per session and then loads. If it shows only the code box and the code is refused, the factor is not verified; repeat step 2.

4. **Email sign-up.** Authentication, Sign In / Providers, Email:
   - Confirm email: **on** (a sign-up must prove the address before it can sign in).
   - Secure email change: **on** (both old and new address confirm).
   - Secure password change: **on** (a password change needs a recent sign-in).
   - Minimum password length: **12** (OWASP ASVS 4.0 2.1.1). Password requirements: **none** (no forced character classes, per NIST SP 800-63B; the leaked-password check below does the work).
   - Prevent use of leaked passwords (HaveIBeenPwned check, under Authentication, Attack Protection on some plans): **on**. It needs the Pro plan; if the project is on Free, record that and keep it as the reason to upgrade before launch.
   - Email OTP expiration: **3600** seconds or less.

5. **Rate limits.** Authentication, Rate Limits (per IP unless it says otherwise):
   - Sign-ups and sign-ins: **20 per 5 minutes** (default 30).
   - Token verifications (OTP, magic link): **15 per 5 minutes** (default 30).
   - Token refreshes: **150 per 5 minutes** (default; lower breaks open tabs).
   - Emails sent: needs custom SMTP (the built-in sender allows about 2 an hour, too few for confirmation mail at launch). Set custom SMTP to Resend (Authentication, Emails, SMTP Settings) with a sender on the Carta domain, then **30 per hour**. The Resend key is a secret: add its row to `docs/security/SECRETS.md`.
   - CAPTCHA (Turnstile) on sign-up: not now; it needs an app change. Recorded as T1071-c.

6. **Sessions and tokens.**
   - Project Settings, JWT Keys: access token expiry **3600** seconds (1 hour). Do not raise it: 062's MFA check reads the `aal` claim of this token, so a long-lived token is a long-lived admin.
   - Authentication, Sessions: Detect and revoke potentially compromised refresh tokens (refresh token rotation with reuse detection): **on**; reuse interval **10** seconds.
   - Authentication, Sessions: inactivity timeout **30 days** and time-box **90 days**, if the plan offers them (Pro); otherwise record "not available".

7. **URLs.** Authentication, URL Configuration: Site URL `https://www.carta-europetravel.com`; Redirect URLs only `https://www.carta-europetravel.com/**`, `https://carta-europetravel.com/**`, `https://carta-app.pages.dev/**`, `https://preview.carta-app.pages.dev/**` and `http://localhost:5173/**` (the origins in `continent-app/scripts/r2/data-cors.json`). No bare `*`.

8. **Owner accounts.** MFA on the Supabase account itself (Account, Security), as `docs/security/SECRETS.md` lists for every owner account (row C2, `docs/owner/secrets-rotation.md`). The Dashboard is a stronger admin surface than the app.

9. **Report back.** The before and after value of each setting goes into the report of the next security task (C3 close-out), so the threat model can turn "not verified" into "verified".

When steps 2 to 7 are done, row T1071-a can close.

## Values found on 2026-11-07 (owner screenshots of the Dashboard)

Read from the Dashboard on 2026-11-07, two days after T1084 applied steps 2 to 7 from the procedure's values without reading them back. This table is that read-back (row T1084-c). "Not seen" means no screenshot covered it yet; for those, T1084's report says the owner applied the procedure's value.

| Step | Setting | Value found | Target | Verdict |
|---|---|---|---|---|
| 2 | TOTP (App Authenticator) | Enabled | Enabled | ok |
| 2 | Maximum MFA factors per user | 10 | 10 | ok |
| 2 | SMS MFA (phone factors) | Disabled, greyed: Pro plan only | not needed | ok |
| 2 | Owner TOTP factor enrolled in Carta | not seen; T1084 saw the step-up accept the code | enrolled | ok per T1084 |
| 3 | Migration 062 pasted | not seen; done per T1084 | `admin audit self-check passed` | ok per T1084 |
| 4 | Allow new users to sign up | on | on | ok |
| 4 | Allow manual linking | off in the screenshot, then turned on by the owner the same day (T946-a) | on, for Connect Google | ok |
| 4 | Allow anonymous sign-ins | off | off | ok |
| 4 | Confirm email | on | on | ok |
| 4 | Secure email change, secure password change | not seen | on, on | open |
| 4 | Minimum password length, requirements | not seen | 12, none | open |
| 4 | Leaked password check | not seen | on (Pro), else recorded | open |
| 4 | Email OTP expiration | not seen | 3600 or less (owner checklist step asks 600) | open |
| 5 | Sign-ups and sign-ins | 20 per 5 min | 20 | ok |
| 5 | Token verifications | 15 per 5 min | 15 | ok |
| 5 | Token refreshes | 150 per 5 min | 150 | ok |
| 5 | Emails sent | 30 per hour, field editable, so custom SMTP is set | 30 with custom SMTP | ok |
| 5 | Minimum interval per user (custom SMTP) | 60 s | not specified | recorded |
| 5 | SMS, anonymous, Web3 limits | 30, 30 per h, 30 per 5 min, greyed | not used | recorded |
| 5 | IP address forwarding | off | not specified | recorded |
| 6 | Access token expiry | 3600 s | 3600 | ok |
| 6 | Detect and revoke compromised refresh tokens | on | on | ok |
| 6 | Refresh token reuse interval | 10 s | 10 | ok |
| 6 | Enforce single session per user | off, greyed | not specified | recorded |
| 6 | Time-box user sessions | 0 (never), greyed: Pro plan only | 90 days if available | not available on Free |
| 6 | Inactivity timeout | 0 (never), greyed: Pro plan only | 30 days if available | not available on Free |
| 7 | Site URL and redirect URLs | not seen | the five origins above | open |
| 8 | MFA on the Supabase account | not seen | on | open |

Free plan limits: session time-box, inactivity timeout, SMS MFA and (likely) the leaked password check need Pro. Recorded as reasons to upgrade before launch, not as failures.
