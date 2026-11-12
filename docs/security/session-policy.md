# Session policy

How long a Carta sign-in lasts, how many can run at once, and what ends one. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07. Covers ASVS 5.0.0 V7.1.1 (inactivity and absolute lifetime, documented) and V7.1.2 (concurrent sessions, documented).

Two kinds of value below. **Code** values are set or defaulted by code in this repo and are true today. **Dashboard** values live in the Supabase Dashboard; nobody has read them into the repo, so they are owner decisions with an open register row. The local `supabase/config.toml` is the CLI's development config (its `site_url` is `127.0.0.1`): it shows the defaults, not the live project.

## 1. How a session works

Carta signs travellers in with Supabase Auth (email and password, magic link, Google). The browser client is created in `continent-app/src/lib/supabaseClient.js` with `createClient(url, anonKey)` and no options, so supabase-js 2.110.2 (`continent-app/package-lock.json`) uses its defaults:

| Setting | Value | Source |
|---|---|---|
| Session kept across reloads | Yes (`persistSession: true`) | supabase-js default |
| Where | `localStorage`, key `sb-<project ref>-auth-token` | supabase-js default; read by `mayHaveSession` in `supabaseClient.js` |
| Access token refreshed automatically | Yes (`autoRefreshToken: true`), checked every 30 s, refreshed 90 s before expiry | supabase-js default (`AUTO_REFRESH_TICK_DURATION_MS`, `EXPIRY_MARGIN_MS`) |
| Redirect flow | Implicit (tokens arrive in the URL hash; `supabaseClient.js` captures the hash at import) | supabase-js default `flowType: 'implicit'` |

A session is an access token (a signed JWT, short lived) plus a refresh token (single use, swapped for a new pair on every refresh).

## 2. Lifetimes

| Limit | Value | Kind | Notes |
|---|---|---|---|
| Access token lifetime | 3600 s (1 hour) in `supabase/config.toml` `jwt_expiry`; the live value is in Project Settings, JWT Keys | Dashboard, not verified | `docs/owner/auth-settings.md` step 6 says keep it at 3600: migration 062's admin check reads the token's `aal` claim, so a longer token is a longer admin |
| Refresh token rotation | On, reuse interval 10 s, in `config.toml` | Dashboard, not verified | Reuse of a spent refresh token after 10 s revokes the session family (Supabase reuse detection) |
| Inactivity timeout | **None set.** `[auth.sessions] inactivity_timeout` is commented out in `config.toml` | Dashboard, owner decision **T1164-j** | Proposed: 30 days (`docs/owner/auth-settings.md` step 6). May need the Pro plan |
| Absolute lifetime (time-box) | **None set.** `timebox` is commented out | Dashboard, owner decision **T1164-j** | Proposed: 90 days. May need the Pro plan |
| Email OTP and magic link lifetime | 3600 s in `config.toml` `otp_expiry` | Dashboard, owner decision **T1164-j** | Proposed: 600 s (ASVS V6.5.5) |
| Admin second factor | Once per session: a TOTP code lifts the session to `aal2`, which admin reads and writes require | Code: `supabase/migrations/062_admin_audit.sql`, `continent-app/src/components/admin/useMfa.js` | Lasts as long as the access token carries `aal2` |
| Free refine token (AI plan) | 24 hours | Code: `supabase/functions/plan-day/logic.mjs` `TOKEN_TTL_MS` | Not a session; listed because it is a time-limited credential |
| Trip share link | Until revoked, or its `expires_at` when the owner set one | Code: `supabase/migrations/009_trip_shares.sql` | Not a session |
| Co-plan invite link | 7 days, at most 5 live per plan | Code: `supabase/migrations/052_coplan_links.sql` | Not a session |

So today a traveller who uses Carta at least once per refresh cycle stays signed in on that device indefinitely. That is the gap ASVS V7.1.1 names; it closes when the owner sets the two Dashboard limits (T1164-j).

## 3. Concurrent sessions

Policy: **any number of devices may be signed in at once.** Carta is used on a phone and a laptop for the same trip, so limiting to one session would sign travellers out mid-plan. Supabase's "single session per user" option is not used.

What a traveller can do about the other sessions (Account, Sign-in and security; `continent-app/src/auth/AuthContext.jsx`):

| Action | What it revokes | Code |
|---|---|---|
| Sign out | See section 5: today this revokes every session, not only this device | `signOut` calls `supabase.auth.signOut()` with no scope; the supabase-js default scope is `global` |
| Sign out of every other device (offered with a password change) | Every refresh token except this device's | `signOutOtherDevices`, scope `others` |
| Sign out everywhere | Every refresh token, this device included | `signOutEverywhere`, scope `global` |
| Delete my account | Every session, with the account | `deleteAccount` (`delete_user()`, migration 005) |

A revoked refresh token cannot mint a new access token, but an access token already issued stays valid until it expires (at most the access token lifetime, 1 hour). Travellers cannot see a list of their sessions or devices (ASVS V7.3.1, V7.5.2), recorded as row T1164-j.

## 4. Re-authentication

Sensitive actions ask for the current password again before they run, even inside a live session (`continent-app/src/auth/AccountPanel.jsx`, `reauthenticate`): changing the password, downloading all data, deleting the account. Admin pages need `aal2` (section 2). Supabase's own "Secure password change" setting is a Dashboard value (`docs/owner/auth-settings.md` step 4, row T1071-a).

## 5. Known gaps

- No inactivity or absolute limit (T1164-j, owner).
- OTP and magic links live 1 hour (T1164-j, owner).
- The plain "Sign out" button revokes every session because supabase-js defaults to scope `global`, while the Account panel also offers a separate "Sign out everywhere". The intended behaviour of a plain sign-out is this device only (scope `local`); a code task should pass `{ scope: 'local' }`.
- Password policy and traveller MFA are owner decisions (T1164-f), not part of this file.
