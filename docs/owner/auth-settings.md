# Owner procedure: Supabase Auth settings and admin MFA (T1071, ROADMAP C3)

Why: `docs/security/threat-model.md` section 4 lists the Auth settings that decide account-takeover risk. Section 11 covers admin MFA (migration 062).

Project: `ntssxktaduxzpsmejwyv`.

## Values read on 2026-11-12

Read through the Management API (`GET /v1/projects/ntssxktaduxzpsmejwyv/config/auth`) by the owner sweep. This replaces the 2026-11-07 screenshot read-back: every "not seen" row there is now verified.

| Setting | Live value | Target | Verdict |
|---|---|---|---|
| TOTP enrol and verify | on, on | on | ok |
| Migration 062 (admin MFA in the database) | live | live | ok |
| Confirm email (`mailer_autoconfirm`) | off, so confirmation is required | confirmation required | ok |
| Secure email change | on | on | ok |
| Reauthentication for password change | on | on | ok |
| Minimum password length, required characters | 12, none | 12, none | ok |
| Leaked password check (HIBP) | off | on | **Pro plan only**: the project is on Free |
| Email OTP expiry | 3600 s | 3600 or less | ok. Kept at 3600: a 600 s expiry would also cut confirmation links to 10 minutes |
| Manual identity linking (Connect Google) | on | on | ok (T946-a) |
| Rate limits: sign-ups and sign-ins (OTP), verify, refresh | 20, 15, 150 per 5 minutes | 20, 15, 150 | ok |
| Rate limit: emails sent | 30 per hour | 30 | ok |
| Custom SMTP | `smtp.resend.com`, sender `noreply@carta-europetravel.com` | Resend, Carta domain | ok |
| Access token expiry | 3600 s | 3600 | ok |
| Session time-box, inactivity timeout | 0, 0 | 90 days, 30 days | **Pro plan only** |
| Site URL | `https://www.carta-europetravel.com` | same | ok |
| Redirect URLs | the five origins, with and without `/**`, plus the project's own auth callback; no bare `*` | the five origins | ok |
| GraphQL | `pg_graphql` not installed | off | ok (T1164-n) |

Decision (2026-11-12): stay on Free until launch. The three Pro-only rows are the reasons to upgrade at launch (ROADMAP I2). They are not failures today.

## Steps

1. **Google sign-in is down: the Google OAuth client was deleted (seen 2026-11-26, `Error 401: deleted_client`, client id starting `458486`).** The app code is fine; Supabase still points at the deleted client.
   - First try to restore it: Google Cloud Console, the project that owned it, APIs & Services, Credentials, **Restore deleted credentials** (possible for 30 days after deletion). A restored client keeps its id and secret, so nothing else changes. Done when Google sign-in on the site works again.
   - If it cannot be restored, make a new one on the same page: Create credentials, OAuth client ID, type **Web application**. Authorised JavaScript origins: the five site origins from the Redirect URLs row above. Authorised redirect URI: `https://ntssxktaduxzpsmejwyv.supabase.co/auth/v1/callback`. The OAuth consent screen must exist and be **In production** (in Testing only listed test users can sign in).
   - Then Supabase dashboard, Authentication, Sign In / Providers, Google: paste the new Client ID and Client Secret, keep it enabled, save.
   - It worked when "Sign in with Google" on `https://www.carta-europetravel.com` returns signed in, and Account, Sign-in and security can still connect Google.
2. **MFA on the Supabase account itself (row C2, `docs/owner/secrets-rotation.md`).**
   - Go to supabase.com, Account, Security, Multi-factor authentication.
   - Add an authenticator app and save the recovery codes in the password manager.
   - It worked when signing out and back in asks for a code.
   - Only you can do this: it needs your login and your phone.
