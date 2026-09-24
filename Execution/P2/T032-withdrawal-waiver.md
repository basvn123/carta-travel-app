# T032: Wire the 14-day withdrawal waiver into checkout

## Date

2026-09-24

## What changed

The waiver now has somewhere to land. Before this task the consent existed only
as an unreachable possibility: T013 wrote the Stripe consent block into the
checkout function, but it is gated on a secret nobody has set, and even if it
had fired, nothing anywhere read the answer back. A buyer could have ticked the
box and the fact would have evaporated the moment Stripe finished with the
session. After this task there are columns to hold it, a function that writes
them in the same statement as the sale, a webhook that reads the answer off the
completed session, and a line above the buy buttons that tells the traveller
what they are about to be asked before they leave the site.

Three pieces, in the order the consent travels. Migration 025 adds
`consent_tos`, `consent_at` and `consent_terms_url` to `pass_grants`, and
replaces `grant_pass` with a six-argument version that writes them. The
stripe-webhook function reads `session.consent.terms_of_service` off the
completed Checkout Session and passes it and the terms URL down to that
function. The pass modal states the waiver in plain copy above the pass grid,
with a link to the terms, in all six locales.

What is still missing is entirely on the Stripe side and none of it is code.
The secret is unset, the Dashboard field is empty, migration 025 has not been
pasted into the live project, and no real purchase has been made. Those four
are listed at the end with what each one does.

The legal point behind all of this, stated once so nobody has to reconstruct
it: a pass is digital content that starts the moment payment lands. Under
Article 16(m) of the Consumer Rights Directive, the 14-day right of withdrawal
only ends if the buyer expressly asked for immediate supply and acknowledged
losing the right. Consent that was collected and not stored is consent we
cannot produce, and a sale we cannot produce it for stays refundable for 14
days. That is the revenue line this task protects, and it is why the storage
matters as much as the asking.

## How the consent flows, and why each piece sits where it does

Four hops, and each one exists because the hop before it cannot do the job.

The pass modal states the waiver but does not collect it. The line sits above
the pass grid rather than in the notes at the foot of the modal, so it is read
before a price is chosen rather than after, and so nobody meets the Stripe
checkbox for the first time with their card details already typed. It carries
the link to the terms, using the modal that T013 built. There is deliberately
no checkbox on the Carta side. Stripe already forces a required one on its own
page, and what the Directive needs is one explicit, recorded consent, not two
acts of friction. A second box would also be the weaker of the two, because
Carta cannot prove its own client-side state the way a Stripe session record
can.

The checkout Edge Function asks for the consent. This is T013's work and was
not changed here. `consent_collection.terms_of_service: 'required'` makes the
box mandatory, and `custom_text.terms_of_service_acceptance` replaces the
generic "I agree" with the waiver wording, so the thing the buyer ticks is the
waiver itself. The whole block is gated on `CHECKOUT_TERMS_URL` because Stripe
rejects a session carrying `consent_collection.terms_of_service` unless a
Terms of Service URL is filled in under Dashboard, Settings, Business, Public
details. The gate exists so a redeploy before that field is set cannot break
buying, and it is also the coupling that makes the deploy order matter: setting
the secret without filling in the Dashboard field turns every checkout into a
502.

The webhook reads the answer. Stripe reports the result on the Checkout Session
as `consent.terms_of_service = 'accepted'`, and the Session object carried on
`checkout.session.completed` includes `consent` inline, so the normal path
needs no extra API call. A retrieve fallback sits behind it, used only when the
session says consent was collected but the inline field is empty, which covers
an API version expanding the object differently. The fallback swallows its own
errors on purpose: a customer who has paid must be granted what they bought
even if the consent lookup fails, because withholding the pass turns a record
keeping problem into a support problem. The terms URL is read from the same
`CHECKOUT_TERMS_URL` secret the checkout function used, which is why the
webhook now needs that secret too.

`grant_pass` writes it, in the same INSERT as the sale. That placement is the
whole reason the columns live on `pass_grants` and not on `entitlements`.
`pass_grants` is the permanent per-sale ledger, one row per Checkout Session,
never overwritten, which is exactly the shape a consent record needs.
`entitlements` holds the current state of one user and is rewritten by every
later purchase, so a consent column there would be destroyed by the next sale
and could never answer what a given buyer agreed to when they paid for a given
pass. Writing the consent in the same statement as the grant also means there
is no window in which a grant exists without its consent record.

Two smaller choices inside the function are worth knowing. The columns are
nullable with no default, because every row written before this migration, and
every row written while the secret stays unset, genuinely has no consent
record. NULL says that. A default of `false` would say "they were asked and
refused", which is a different and wrong claim. And a consent value the
constraint does not recognise is stored as NULL rather than allowed to raise,
because a grant must never fail over the consent field when the customer has
already paid.

One signature detail that will bite whoever edits this next. Adding defaulted
parameters to a plpgsql function creates a new overload rather than replacing
the old one, and a four-argument call against both is ambiguous and refused.
Migration 025 therefore drops the four-argument `grant_pass` explicitly before
creating the six-argument one, and restates the grants, because the drop takes
the old function's grants with it and a function `service_role` cannot execute
fails the webhook silently.

## Files touched

**Created:**
- supabase/migrations/025_withdrawal_waiver.sql
- Execution/P2/T032-withdrawal-waiver.md

**Modified, root repo:**
- supabase/functions/stripe-webhook/index.ts

**Modified, continent-app repo:**
- continent-app/src/components/PassModal.jsx
- continent-app/src/styles.css
- continent-app/src/i18n/en.js, nl.js, de.js, es.js, fr.js, it.js
- continent-app/scripts/verify_paywall.mjs

`supabase/functions/checkout/index.ts` was read and not changed. Its consent
block is correct as T013 left it and needs only the secret.

The app repo carries a large amount of uncommitted work from another session.
It was left untouched: nothing was stashed, reset or checked out there, and the
commit names its files explicitly rather than staging everything. The em dashes
in `src/components/PrivacyPolicy.jsx` belong to that other session's work and
were deliberately not corrected here, since the file is outside this task's
scope.

## Commands run

```
git checkout main && git checkout -b p2-withdrawal-waiver
cd continent-app && git checkout -b p2-withdrawal-waiver   # from its own HEAD

# local stack, with the six migrations 018 to 023 held aside as in T031
export PATH="/c/Users/Gebruiker/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
mv supabase/migrations/{018,019,020,021,022,023}_*.sql <scratchpad>/held/
supabase start -x realtime,storage-api,imgproxy,studio,logflare,vector,supavisor,mailpit,postgres-meta
supabase functions serve --no-verify-jwt --env-file <scratchpad>/t032.env

# the grant logic, driven straight at the database
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -f - < <scratchpad>/t032.sql

# the webhook, driven by HMAC-signed checkout.session.completed events
python <scratchpad>/send_t032.py

supabase stop --no-backup
mv <scratchpad>/held/*.sql supabase/migrations/

# the app
cd continent-app
npx eslint src/components/PassModal.jsx src/i18n/*.js
node scripts/verify_paywall.mjs
npx vite build && npx vite preview --port 4196 --strictPort
node scripts/_t032_verify_waiver.tmp.mjs    # temporary, removed afterwards
```

Nothing was run against the live project. No `supabase db push`, no live query,
no secret set, no function deployed.

The held-aside trick is carried straight from T031 and is still needed:
migration 018 line 93 uses a POSIX regex repetition bound of `{5,600}` and
Postgres caps that count at 255, so `supabase start` refuses the whole folder.
The six files were restored from the scratchpad afterwards and
`git diff HEAD -- supabase/migrations/` is empty, which is the proof.

One consequence of holding 021 aside is worth recording so a later local run is
not confused by it: without 021 the local free tier has 3 AI plans rather than
the live 2. It has no bearing on anything this task tested.

## Config and secrets set

None set. Three things must be done in order, and the order is the part that
matters, because two of them are coupled.

| Step | Where | Value |
|---|---|---|
| 1 | Stripe Dashboard, Settings, Business, Public details | Terms of service URL: https://carta-europetravel.com/?legal=terms |
| 2 | Supabase secret | CHECKOUT_TERMS_URL, the same URL |
| 3 | Redeploy | `supabase functions deploy checkout` and `supabase functions deploy stripe-webhook --no-verify-jwt` |

Step 1 before step 2, without exception. Stripe rejects a session carrying
`consent_collection.terms_of_service` when the Dashboard field is empty, so a
checkout function deployed with the secret set and the field blank returns 502
on every purchase attempt. This is the coupling T031 found and it is the single
easiest way to break buying while trying to make it legal.

`CHECKOUT_TERMS_URL` is now read by two functions rather than one, so both must
be redeployed after it is set, and both must see the same value. The webhook
uses it only to record which terms the buyer accepted; unset, passes are still
granted and the consent columns simply stay NULL.

Migration 025 must be pasted into the Supabase SQL editor by hand, per the
standing rule. It is safe to apply before the webhook redeploy: the new
parameters are defaulted, so the currently deployed webhook's four-argument
call still works and simply records no consent.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Columns on pass_grants holding consent | 0 | 3 | +3 |
| grant_pass overloads | 1, four arguments | 1, six arguments | signature replaced |
| Local test rows showing an accepted waiver with a timestamp | 0 | 1 of 3 webhook rows, exactly the one whose session carried consent | +1 |
| Waiver visible in the pass modal before the buy buttons | no | yes, desktop and phone | |
| Locales carrying the waiver copy | 6, as a foot note | 6, above the buy buttons | moved |
| verify_paywall keys checked per locale | 15 | 18 | +3 |
| verify_paywall structural checks on the waiver | 0 | 2 (names 14, renders above the grid) | +2 |
| Live pass_grants rows with consent recorded | 0 of 0 | 0 of 0 | none, nothing sold yet |
| Stripe secrets set on the live project | 0 of 5 | 0 of 5 | none |
| Real test-mode purchases made | 0 | 0 | none |

The live figures do not move because nothing was deployed and nothing was
bought. What moved is the local evidence and the code.

The local evidence, in full. Five direct calls to `grant_pass`: consent
accepted stored with a timestamp and the terms URL; no consent stored as three
NULLs; an unrecognised value stored as NULL without failing the grant; a
four-argument call still succeeding through the defaults; and a replay of an
accepted session returning `{"ok": true, "replay": true}` without rewriting the
consent, which is the case that matters most, since a replayed webhook carrying
a different consent value must not overwrite the recorded one. Then three
HMAC-signed `checkout.session.completed` deliveries through the running
webhook, which produced exactly one row with `consent_tos = 'accepted'`,
`consent_at` set, and the terms URL, and two rows with all three columns NULL.

The modal was checked on a fresh build served through `vite preview`, on a 1360
by 950 desktop and a 390 by 844 phone, fourteen checks in total: the waiver line
is present and visible, names 14, uses the word withdraw, carries no em dash,
sits above the first buy button as measured by bounding box rather than by
source order, renders at 13px rather than metadata size, opens the terms from
its link, leaves no horizontal page scroll, and produces no page errors.
Screenshots are in `continent-app/scripts/shots/t032-modal-desktop.png` and
`t032-modal-phone.png`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The consent URL was stored on rows with no consent | The webhook reads CHECKOUT_TERMS_URL unconditionally, so every grant carried it, which reads as "these are the terms they accepted" when nothing was accepted | The insert now writes the URL only when a recognised consent value is present. Observed wrong on the first run, right on the second |
| `vite` dev server never reached domcontentloaded | The dependency optimizer took over five minutes to scan and bundle; the index page alone took 46 seconds to serve | Built a fresh dist and used `vite preview` on port 4196, as the existing harnesses do. The served index hash was compared against the built one to avoid the stale-preview trap |
| A four-argument grant_pass call would have been ambiguous | Adding defaulted parameters creates a new overload rather than replacing the old function | The migration drops the four-argument version explicitly and restates the grants the drop removes |

## What is still open

Four things, all on the Stripe side, and none of them code.

The Dashboard field is empty. Until a Terms of Service URL is filled in under
Settings, Business, Public details, Stripe will not render the consent checkbox
and will refuse any session that asks for one. This is the first step and
nothing else works before it.

`CHECKOUT_TERMS_URL` is unset, which means the checkout function currently
sends no consent block at all and the waiver is not asked for on the Stripe
page. The modal copy shipped here describes a checkbox that does not yet exist,
which is a wrinkle worth naming plainly: the copy is accurate about what the
law requires and about what the code does once configured, but a buyer today
would reach Stripe and find no box. That is an argument for doing the
configuration soon rather than for softening the copy, since the same
configuration is what makes every sale non-refundable.

Migration 025 has not been applied to the live project. It is written to be
pasted into the SQL editor and has been run end to end locally, including a
second idempotent application over itself.

No real purchase has confirmed the chain. Everything above was driven by
synthetic signed events against a local stack, which proves the code and proves
nothing about Stripe's actual payload. The check to run once the four steps
above are done: buy one test-mode Trip Pass on a fresh account, not the owner
account, confirm the checkbox appears on the Stripe page with Carta's own
waiver wording rather than a generic agreement line, confirm the session cannot
complete without ticking it, then
`select session_id, consent_tos, consent_at, consent_terms_url from
public.pass_grants order by granted_at desc limit 1` and confirm it reads
`accepted` with a timestamp and the right URL. The owner account is excluded
for the reason T031 gives: it holds a manual year pass to 2126, and every
expiry assertion against it lands in 2126 and proves nothing.

Two smaller things, both filed rather than fixed. The partial index
`pass_grants_no_consent_idx` answers "which sales have no waiver on file",
which is the refund-exposure question, but nothing queries it yet. A row in the
admin panel showing that count would turn it from a latent capability into a
number somebody sees. And the Article 16(m) classification carried over from
T013 is still unreviewed: the terms treat a pass as digital content, where the
withdrawal right ends completely, rather than a digital service, where it costs
the buyer only a proportionate share. The voluntary refund rule in the terms
covers most of the practical gap either way, but nobody qualified has looked at
it.

## Rollback procedure

Nothing is live, so rollback is entirely local.

The app and the webhook revert with the branches. In the root repo,
`git checkout main && git branch -D p2-withdrawal-waiver`, and the same in
`continent-app`, which also restores `PassModal.jsx`, the six locale files,
`styles.css` and `verify_paywall.mjs` to what the other session left there.
Rebuild afterwards, because this task left a fresh `dist` behind; `dist` is
gitignored in both repos so nothing was committed from it.

If migration 025 has already been pasted into a database, the down section in
the migration's own comment block reverses it in two steps, and the order
matters: restore the four-argument `grant_pass` from `007_passes.sql` first so
the webhook keeps working, then drop the index and the three columns. Dropping
those columns destroys the consent evidence for every sale made while they
existed, and that evidence is what makes those sales non-refundable, so
`pass_grants` must be exported first if any real purchase has happened. On a
live database with sales on it, treat the column drop as one-way.
