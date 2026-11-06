# T1110: Waitlist and newsletter capture with double opt-in (S26, ROADMAP K3)

## Date

2026-11-06

## What changed

Carta now has a waitlist and newsletter sign-up with double opt-in. A one-field form sits on the Home page (Dutch and English copy). It posts to a new `waitlist` Edge Function, which stores the address unconfirmed (migration 066, a table with row level security and no policy, closed to every API role) and mails a confirmation link signed with an HMAC. Only the click sets `confirmed_at`; every mail carries an unsubscribe link (also as `List-Unsubscribe` one-click), and the one read for use, `waitlist_audience()`, returns confirmed and not unsubscribed addresses only. Nothing goes out and nothing is stored until the owner pastes 066 and sets the Resend secrets. Tested: a sign-up is stored, confirmed and unsubscribed against a local Postgres 16 inside the RLS suite (808 of 808 assertions pass), plus 9 unit tests with the mail send stubbed.

## Files touched

- Created: `supabase/migrations/066_waitlist.sql`, `066_waitlist_down.sql`; `supabase/functions/waitlist/{index.ts,logic.mjs,README.md}`; `continent-app/src/components/WaitlistForm.jsx`, `src/lib/waitlist.js`, `src/styles/94-waitlist.css`; `continent-app/tests/waitlist.test.mjs`.
- Modified: `continent-app/scripts/admin/test_rls_policies.mjs` (a service-role caller and a 066 section), `src/browse/home/HomePage.jsx` (the form after the closing question), `src/i18n/en.js` and `nl.js` (9 keys), `src/styles.css` (one import), `docs/HANDBOOK.md`, `docs/security/SECRETS.md`, `ROADMAP.md` (K3 status), `Execution/_OPEN.md`.

## Commands run

```
PGPORT=55444 node continent-app/scripts/admin/test_rls_policies.mjs   # 808 passing, 0 failing
psql -f 066_waitlist.sql (twice) ; psql -f 066_waitlist_down.sql        # self-check passes, down clean
cd continent-app && npm ci && npm test                                  # 1379 tests, 1367 pass, 0 fail
npx eslint (touched files) ; fast build                                 # no errors
```

## Config and secrets set

None set. Needed from the owner: Supabase secrets `RESEND_API_KEY`, `WAITLIST_FROM`, `WAITLIST_SECRET` (and optional `APP_URL`); see the owner steps.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Test imports failed | `en.js` and `nl.js` export named `en` and `nl`, not defaults | Named imports in the test |
| Local Postgres died mid-session | The scratchpad parent directories lost their execute bit | `chmod 755` on the path, restart; the suite had already finished green |

Design calls, written down: the table is closed by construction (no policy) and reached through five service-role-only SECURITY DEFINER functions, so the suite's closed-table probe applies and the visitor cannot learn who is on the list (the form answers the same for new, repeat and confirmed addresses). Links are stateless HMACs, so no token column exists. Confirming on GET is the accepted one-tap trade; it is idempotent. The form is a separate section on Home, not inside `SiteFooter`, so it does not collide with the support-pages session. The lead promises "at most one short mail a month"; the owner should confirm that is the intended cadence.

## Screens checked

Not checked in a browser (cloud container has no app data and the brief limits this session to static checks). The fast build compiles the form and its CSS. The end check should look at Home at phone and desktop width: the form, the error line, the done line (T1110-c).

## What is still open

T1110-a to T1110-e in `Execution/_OPEN.md`: the migration paste, the Resend secrets and deploy, a real sign-up round trip and a look on a phone, the privacy text and Article 30 entry, and the purge schedule plus the newsletter sender and the referral jump (the rest of K3).

## Rollback procedure

`git revert` the T1110 commits. If 066 was applied, paste `066_waitlist_down.sql`; ONE-WAY for the stored addresses (export `select * from waitlist_signups` first). The app survives without the table: the form shows its "try again later" line.

## Owner steps (for the checklist)

- [T1110-a] Apply migration 066 | creates the closed waitlist table and its five service-role functions | open the Supabase SQL editor; paste `supabase/migrations/066_waitlist.sql` after 065; look for "waitlist self-check passed" | supabase/migrations/066_waitlist.sql
- [T1110-b] Resend secrets and deploy | no mail is stored or sent until the sender and signing secret exist | verify the sending domain in Resend; `supabase secrets set RESEND_API_KEY=... WAITLIST_FROM="Carta <hello@carta-europetravel.com>" WAITLIST_SECRET=<long random>`; `supabase functions deploy waitlist --no-verify-jwt` | supabase/functions/waitlist/README.md
- [T1110-c] Round trip and phone look | proves the real mail, both links and the layout | on a preview sign up with a real address; confirm from the mail; sign up again and unsubscribe from the mail; view Home on a phone | continent-app/src/components/WaitlistForm.jsx
- [T1110-d] Privacy text and Article 30 | an address is personal data collected on consent | add the waitlist (purpose, consent, retention until unsubscribe or 30 days unconfirmed, Resend as processor) to the privacy policy and docs/legal/ARTICLE30.md before launch | docs/legal/ARTICLE30.md
