# T254: The admin page steps a session up to aal2 before ban and delete

## Task ID

T254

## Date

2026-10-01

## What changed

Migration 032 (T063) makes `admin_delete_user` and `admin_ban_user` refuse any
token that is not `aal2`, but the admin page had no way to get one. Pasting 032
would have locked both buttons for everyone. The page can now enrol a TOTP
factor and step the session up, so stage 2 of `_OPEN-MASTER.md` can go ahead:
the owner enrols (T063-b), then pastes 032 (T063-c).

When ban or delete is armed and the session is below `aal2`, a step-up block
appears inside the armed box, above the confirm button, and the danger button
stays disabled until the step-up succeeds. An account with no verified factor
first sees "Set up an authenticator app". That calls `mfa.enroll`, shows the
QR code and the secret for manual entry, and the first six-digit code both
verifies the factor and steps the session up (`mfa.challengeAndVerify`). An
account that already has a factor sees only the code field. A wrong code gets
"That code did not work. Codes change every 30 seconds, so type the current
one." Once the session is `aal2` the block disappears for both actions until
the token expires. An enrolment abandoned halfway leaves an unverified factor
behind, and the next attempt removes it first, because Supabase refuses a
second factor with the same name.

`useErrText` now answers hint `mfa_required` with "This action needs a code
from your authenticator app. Verify one below and try again." It branches on
the hint, not the SQLSTATE, because 42501 is shared with every permission
error (T063's reasoning). In normal use the step-up runs before the RPC, so
this sentence only shows if the token falls back to `aal1` mid-session.

The page enforces the step-up in the client before 032 is live too. That is
deliberate: stage 2 has the owner enrol before pasting 032, and doing it the
other way round is the failure T063 warned about.

The duplicate `admin.colAction` key in `en.js` is gone (T074-f). Both copies
said "Action"; the one dropped is the stray inside the reports block, and the
one kept sits with the other `admin.col*` keys. ESLint is clean on the changed
files. The session plan listed this as its own step 6, but register row T074-f
assigns it to "the next task that edits en.js", which is this one.

One bug was found and fixed on the way. supabase-js returns the QR as
`data:image/svg+xml;utf-8,<svg ...>` with the markup unencoded, so any `#` in
the SVG (a colour such as `#000`) ends the URL as a fragment and the image
breaks. `useMfa` re-encodes the markup with `encodeURIComponent`, and the
harness now checks that the QR image actually decodes.

## Files touched

**Created:**
- continent-app/src/components/admin/useMfa.js
- continent-app/src/components/admin/MfaStepUp.jsx
- Execution/P4/T254-admin-mfa-step-up.md

**Modified:**
- continent-app/src/components/admin/UserDetail.jsx (calls useMfa, renders the step-up in the ban and delete boxes, disables both danger buttons below aal2)
- continent-app/src/components/admin/useErrText.js (hint mfa_required)
- continent-app/src/i18n/en.js (eleven admin.mfa* / admin.errMfa keys; the duplicate admin.colAction removed)
- continent-app/src/styles.css (.adminpage-mfa block, eight lines)
- continent-app/scripts/verify_admin_panel.mjs (step 7b, GoTrue MFA stubs, ban and delete stubs that refuse a token below aal2)
- Execution/_OPEN.md (T063-a and T074-f closed)

Both repositories carry the same app files: committed in `continent-app/` on
`p4-admin-mfa-step-up`, and mirrored into the root on the branch of the same
name.

## Commands run

```
cd continent-app
npx eslint src/components/admin/useMfa.js src/components/admin/MfaStepUp.jsx \
  src/components/admin/UserDetail.jsx src/components/admin/useErrText.js src/i18n/en.js
npm run build
node scripts/verify_admin_panel.mjs
```

## Config and secrets set

None. TOTP must be enabled under Authentication in the Supabase Dashboard
before enrolment works on the live project. If it is off, the page says so
("Check that TOTP is enabled under Authentication in the Supabase Dashboard"),
with GoTrue's own message after it.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Ways to reach aal2 from the admin page | 0 | 1 (enrol, then code) | +1 |
| eslint errors in src/i18n/en.js | 1 (duplicate key) | 0 | -1 |
| verify_admin_panel.mjs failures | 1 (step 11, T042-d) | 1 (step 11, T042-d) | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| QR image rendered as broken alt text | `#` in the unencoded SVG data URL starts a fragment | Re-encode the markup in `useMfa.qrSrc`; harness asserts `naturalWidth > 0` |
| Step 11 of the harness fails | Pre-existing account hub issue, register row T042-d, failing since T042 | Left alone, out of scope |

The harness proves the flow against GoTrue-shaped stubs. The ban and delete
stubs read the bearer token and answer exactly what 032 raises (403, 42501,
hint `mfa_required`) unless it carries `aal: aal2`, and the run records that
neither RPC ever saw a lower token. Step 7b checks: Suspend is disabled on
aal1; enrol makes exactly one call; the QR decodes; the secret is shown; the
code field drops non-digits; a wrong code is refused and leaves Suspend
disabled; a right code removes the block, verifies the factor and enables
Suspend; delete then asks for nothing more. The 380px quality floor checks
still pass.

## Carta-design check

1. No hex outside the tokens: the QR backing uses `var(--paper)`.
2. No warm neutral, serif, gradient or shadow added. The admin page's existing
   palette (T-era `styles.css` tokens) is used as is.
3. `--flag` is not used.
4. Mono carries only the secret and the six-digit code, both machine strings.
5. No new primary button. Enrol and Verify are secondary; the danger button
   stays the action.
6. Copy has verbs, no em dashes, none of the banned words.
7. Removed: a second bordered card around the step-up. It is a hairline-topped
   step inside the armed box instead.

## What is still open

Nothing new. The owner steps stay where T063 put them: enrol a factor through
this flow with TOTP enabled in the Dashboard (T063-b), then paste 032 (T063-c).
T063-d (audit rows for refused attempts) and T063-e (whether set_tier,
reset_quota and unban need aal2) are untouched. The live flow has not run
against real GoTrue; T063-b is that run.

## Rollback procedure

`git revert` the T254 commit in `continent-app/` and its mirror in the root.
If 032 is already live when this is reverted, delete and ban become unusable
from the page until the revert is undone or 032 is rolled back per T063. A
factor the owner enrolled stays on the account; remove it with
`supabase.auth.mfa.unenroll` or from the Dashboard (Authentication, Users).
