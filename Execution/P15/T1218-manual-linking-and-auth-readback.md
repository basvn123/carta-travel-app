# T1218: manual identity linking on, and the Auth settings read back (ROADMAP C3; closes T946-a)

## Date

2026-11-07

## What changed

- The owner turned on Allow manual linking in the Supabase Dashboard (Authentication, Sign In / Providers, User Signups) for project `ntssxktaduxzpsmejwyv`, so Connect Google can link a Google identity to a signed-in account (T946, `Execution/P15/T937-T947-owner-decisions.md`). `supabase/config.toml` now says the same: `enable_manual_linking = true`, so a local `supabase start` behaves like the hosted project.
- The owner sent Dashboard screenshots of Sessions, Sign In / Providers, Multi-Factor and Rate Limits. Their values are now a table in `Execution/P15/_OPEN-auth-settings.md` ("Values found on 2026-11-07"). T1084 (branch `p15-auth-settings-close`, not merged to main when this was written) applied steps 2 to 7 from the procedure's values without reading them back (its row T1084-c); this table is the read-back for every setting the screenshots covered.
- What the read-back found: every covered setting matches the procedure's target. The session time-box and inactivity timeout are 0 (never) and greyed out, because they need the Pro plan; recorded as not available on Free. Not covered yet: the Email provider details (secure email and password change, password length, leaked password check, OTP expiry), URL Configuration, and MFA on the Supabase account.

## Files touched

- `supabase/config.toml` (`enable_manual_linking = true`, with a comment)
- `Execution/P15/_OPEN-auth-settings.md` (the read-back table)
- `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md` (T946-a moved, closed by T1218)
- `Execution/P15/T1218-manual-linking-and-auth-readback.md` (this report)

## Commands run

None against a service. The owner changed the setting in the Dashboard.

## Config and secrets set

Supabase hosted project: Allow manual linking on (owner, Dashboard). No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Allow manual linking (hosted) | off (owner screenshot, 2026-11-07) | on (owner report, 2026-11-07) | on |
| `enable_manual_linking` in `supabase/config.toml` | false | true | on |
| Auth settings in the procedure with a read-back value | 0 | 28 rows, 6 still "not seen" | +28 |

## What broke and how it was fixed

Nothing broke.

## Screens checked

None in the app. Connect Google itself was not tried in this task; the owner's first link attempt is the real check.

## What is still open

- T1084-c stays open until the "not seen" rows of the read-back table are filled: Email provider details, URL Configuration, Supabase account MFA. The owner checklist step asks for an Email OTP expiry of 600 s, stricter than the procedure's 3600 s or less.
- `supabase/config.toml` still has `minimum_password_length = 6` while the hosted project should have 12 (procedure step 4). Out of this task's scope; local only, no register row raised here because T1071's threat model already names the local defaults.
- Branch `p15-auth-settings-close` (T1084) is not on main. Merge it before or with this branch; the two touch different rows of the register.

## Rollback procedure

`git revert` of the T1218 commits. To switch linking off again: Dashboard, Authentication, Sign In / Providers, Allow manual linking off; Connect Google then fails with a linking error.
