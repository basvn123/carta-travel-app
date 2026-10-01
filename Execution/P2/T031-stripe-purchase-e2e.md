# T031: End-to-end purchase test in test mode, both tiers

## Date

2026-09-24

## What changed

No real purchase was made, because no Stripe key exists on this machine or on the
live project, and that is a blocker only the user can lift. But the task turned
out to be far more testable than T030's finding suggested. `supabase functions
serve` came up on Docker, and `supabase start` brought up a local Postgres with
migrations 007 and 021 applied, which means the grant logic and both Edge
Functions were exercised against a real database with real HMAC-signed Stripe
events. Eleven of the twelve checks were observed running rather than read. Only
the Stripe-hosted half, the card form and the Price object, stayed blocked.

Two findings matter. The good one is that the replay guard works, and it works
under the exact conditions it was built for. Two concurrent deliveries of the
same session id were fired at `grant_pass` simultaneously: one granted, the other
returned `replay: true`, and the ledger held exactly one row. A replay of the
FIRST purchase's session after a SECOND purchase had overwritten
`entitlements.last_session_id` was also a no-op, which is precisely the case the
comment in 007 says `pass_grants` exists for. That comment is correct and the
table earns its place.

The bad one is a real bug, found by observation and not by reading. A Year Pass
holder who buys a Trip Pass is downgraded. The observed sequence: a clean account
bought a Year Pass and `ai_status` returned tier year with 300 plans and 120
grounded searches; the same account then bought a Trip Pass and `ai_status`
returned tier trip with 60 plans and 40 grounded searches, expiry extended to 395
days. So the traveller paid 6.99 EUR and lost 240 plans and 80 grounded searches,
keeping only 30 extra days they did not need. Nothing in the code is confused
about what it is doing, it is doing exactly what `grant_pass` says, but nobody
wrote down that this is the intended outcome and it is not a defensible one. It is
left unfixed on purpose and explained under what is still open.

## How the purchase and grant flow works, and why it is shaped this way

Two Edge Functions and one SQL function, with a deliberate split of trust between
them.

`checkout/index.ts` opens a Stripe Checkout Session. The browser sends one field,
a tier id, and nothing else. The function resolves that tier to a Stripe Price id
through `stripePriceFor` in `_shared/passes.mjs` and hands Stripe the id, never an
amount. That is the whole defence against a tampered price and it was confirmed
by observation: a request body carrying `price_cents: 1`, `amount: 1` and
`price: "price_cheap"` alongside `tier: "trip"` was ignored field for field, and
the function went to Stripe with its own configured price. Line 76 reads only
`body.tier`; there is no other read of the body anywhere in the file.

The user id is written into the session in three places, at lines 104 to 106:
`client_reference_id`, session `metadata`, and `payment_intent_data.metadata`.
This is not nervous duplication. The session metadata is what the
`checkout.session.completed` event carries, so it is what the webhook reads. The
payment intent copy is what a refund, a dispute or a Radar review shows, and those
arrive as different event types on a different Stripe object, so without the
second copy a disputed payment could not be traced to an account.
`client_reference_id` is a separate top-level field that survives when an
intermediary strips metadata, which is why the webhook reads it first.

`stripe-webhook/index.ts` is the only path that grants anything, and it verifies
before it trusts. Without the signature check this endpoint would be an
unauthenticated "give me a free pass" API, since anyone can POST JSON at a public
function URL. Observed: an event with a forged `v1` signature was refused with 400
and granted nothing, and an event with no `stripe-signature` header at all was
refused with 400. Deno needs `constructEventAsync`, which line 43 uses; the
synchronous verifier uses Node crypto and throws in this runtime. The raw body is
read with `req.text()` at line 40 and never parsed first, because re-serializing
would change the bytes and every signature would fail.

Everything the webhook grants goes through `grant_pass` in migration 007, and the
ordering inside that function is the load-bearing part. It checks `pass_grants`
for the session id first (line 405), computes the new expiry from the current one
if a pass is still live (lines 410 to 414), then inserts into `pass_grants`
BEFORE touching `entitlements` (line 419). The insert-first ordering is what makes
the concurrency case safe: if two deliveries race, the primary key rejects the
second, the whole function rolls back because a plpgsql function is one
transaction, and exactly one grant survives. That was observed both ways, by
rolling back an open transaction (the entitlement change vanished with it, so the
two writes really are atomic) and by firing two deliveries at once.

The stacking rule at line 411 is `when e.expires_at is not null and e.expires_at >
now() then e.expires_at else now()`, so an early renewal extends from the existing
expiry and never burns days. Observed: 30 days became 60 on a second Trip Pass, not
30. `period_start` moves to `now()` either way, which refills the quota allowance,
and that is the intended trade: you keep your days and you get a fresh allowance.

One design choice worth knowing because it looks like a bug and is not. The
webhook answers 200 on almost everything, including an unpaid session, a session
with no metadata, and a tier that is not buyable. That is deliberate: retrying
will not add missing metadata, and a permanently failing webhook is noise that
hides real failures. It answers 500 in exactly one case, a `grant_pass` error, so
Stripe retries the one failure that matters, where the customer has paid and holds
no pass. All of those branches were observed returning what the code says.

## The check list

Everything marked observed was run against a local Postgres with 007 and 021
applied and, for the webhook rows, driven by genuine HMAC-SHA256 signed events.

| Check | Status | Observed result |
|---|---|---|
| Checkout returns 401 with no auth | observed | 401 `{"code":"auth"}`, three ways: no header, anon bearer, garbage bearer |
| 401 happens before any Stripe call | observed, with a caveat | true once a key is set; see the ordering note below |
| Tampered tier is rejected | observed | 400 `{"code":"bad_tier"}` for bogus, for free, and for a missing tier |
| Price fields on the wire are ignored | observed | `price_cents`, `amount` and `price` in the body changed nothing |
| Non-JSON body | observed | 400 `{"code":"bad_json"}` |
| client_reference_id and both metadata copies carry the user id | static | lines 104 to 106; unverifiable without a real session to retrieve |
| Webhook rejects a forged signature | observed | 400, granted nothing |
| Trip Pass grants tier trip, 30 days | observed | tier trip, source stripe, 30 days, one ledger row |
| Year Pass grants tier year, 365 days | observed | tier year, 365 days, `ai_status` 300 plans and 120 grounded |
| Replayed webhook is a no-op via pass_grants.session_id | observed | `{"ok":true,"replay":true}`, expiry unmoved, still one row |
| Replay of first session after last_session_id overwritten | observed | still a no-op, 60 days unchanged, two rows |
| Second purchase extends rather than double-grants | observed | 30 days became 60, two distinct session ids |
| Two concurrent deliveries of one session | observed | one granted, one replay, one row, 90 not 120 days |
| Grant and ledger insert are one transaction | observed | rollback of an open transaction removed both |
| User id precedence, cref against metadata | observed | `client_reference_id` wins |
| Real card payment with 4242 | blocked | no Stripe key, no Stripe CLI |
| Stripe Price object amount and currency | blocked | carried from T030, unreadable from here |
| Withdrawal waiver checkbox | blocked | `CHECKOUT_TERMS_URL` unset, belongs to T032 |

One ordering caveat, which is worth a sentence because it reverses on a fresh
deploy. The missing-key guard at line 62 sits BEFORE the auth check at line 71, so
on a project with no `STRIPE_SECRET_KEY` an anonymous request gets 503 `no_stripe`
and never reaches the 401. Observed exactly that with an empty key, then observed
the 401 after setting a dummy one. It is not a security problem, since nothing is
created either way and no Stripe call is made, and answering 503 before doing an
auth round trip against a broken configuration is arguably the better order. But
anyone testing the 401 against a half-configured project will see 503 and think
the auth guard is missing, so it is written down here.

## Files touched

**Created:**
- supabase/functions/checkout/test_purchase_e2e.md
- Execution/P2/T031-stripe-purchase-e2e.md

No code was changed. `checkout/index.ts`, `stripe-webhook/index.ts`,
`_shared/passes.mjs` and `007_passes.sql` were read only. Nothing under
`continent-app/` was touched, and the uncommitted work another session left there
was left alone.

Six migration files were moved out of `supabase/migrations/` and back during the
local-stack work, because `supabase start` applies every migration in the folder
and migration 018 fails on this Postgres version. They were restored with `git
checkout -- supabase/migrations/` and `git diff HEAD` on that path is empty, so
the tracked tree is byte-identical to what it was.

## Commands run

```
git checkout main && git checkout -b p2-stripe-purchase-e2e

supabase db query "select session_id, left(user_id::text,8) as user8, tier, expires_at, granted_at from public.pass_grants order by granted_at desc" --linked
supabase db query "select left(user_id::text,8) as user8, tier, period_start, expires_at, source, stripe_customer_id, last_session_id from public.entitlements" --linked
supabase secrets list --project-ref ntssxktaduxzpsmejwyv
supabase functions list --project-ref ntssxktaduxzpsmejwyv

# Docker, which was installed but not running
export PATH="/c/Users/Gebruiker/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
Start-Process "C:\Users\Gebruiker\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"

# the local stack, with the six unappliable migrations held aside
supabase start -x realtime,storage-api,imgproxy,studio,logflare,vector,supavisor,mailpit,postgres-meta
supabase functions serve --no-verify-jwt --env-file <scratchpad>/dummy2.env

# grant logic, driven directly against the local database
docker exec -i supabase_db_Travel_App psql -U postgres -d postgres -f - < <scratchpad>/t.sql

# the webhook, driven by HMAC-signed events from a small python sender
python <scratchpad>/send.py

supabase stop --no-backup
git checkout -- supabase/migrations/
```

All three live queries are reads. `supabase db push` was not run and nothing was
written to the live database, which still shows 0 rows in `pass_grants` and the one
manual entitlement.

## Config and secrets set

Nothing was set on the live project. The four Stripe secrets are still absent and
both billing functions are still undeployed.

The local run used throwaway values in a scratchpad env file, never committed:
`STRIPE_SECRET_KEY=sk_test_DUMMY_NOT_A_REAL_KEY`, two dummy price ids, and
`STRIPE_WEBHOOK_SECRET=whsec_testsecretfortestingonly123456`. The dummy key is what
made the 401 and `bad_tier` checks reachable, and the dummy webhook secret is what
made signed-event testing possible, since the signature only has to match a secret
both sides share and Stripe is not involved in verifying it.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rows in live `pass_grants` | 0 | 0 | none |
| Rows in live `entitlements` | 1, user 36a28f80, manual year to 2126 | 1, unchanged | none |
| Live entitlements with source stripe | 0 | 0 | none |
| Stripe secrets on the live project | 0 of 4 | 0 of 4 | none |
| Billing Edge Functions deployed | 0 of 2 | 0 of 2 | none |
| Real test-mode purchases made | 0 | 0 | none |
| Checks verified by running them | 0 | 11 | +11 |
| Checks still blocked on Stripe access | 12 | 3 | -9 |

After is unchanged on every live figure because no purchase happened and no write
was issued. The only real movement is in what is now known rather than assumed.

Local observations, which are evidence about the code rather than about the live
system: trip grant 30 days, year grant 365 days, second trip 60 days, concurrent
duplicate delivery 90 days and one ledger row, year holder buying trip 395 days at
tier trip.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `supabase functions serve` exited with "supabase start is not running" | On CLI v2.109.1 serve needs the local stack, it is not standalone | Ran `supabase start` first |
| `supabase start` failed, invalid regular expression, SQLSTATE 2201B | Migration 018 line 93 uses `{5,600}` and Postgres caps a regex repetition count at 255 | Held 018 and the five migrations after it aside for the local run, restored from git afterwards. Not fixed: out of scope, filed below |
| Checkout answered 503 not 401 with no auth header | The missing-key guard at line 62 runs before the auth check at line 71 | Set a dummy key, then the 401 appeared. Left as is, see the ordering caveat |
| `stripe trigger` would not test the replay path | It builds a synthetic session with no `client_reference_id` and no metadata | Wrote a signed-event sender instead, and recorded the trap in the procedure |

## What is still open

The Year Pass holder who buys a Trip Pass gets downgraded, and this is the one
real bug found. `grant_pass` sets `tier = excluded.tier` unconditionally at line
427, so tier follows the last purchase regardless of rank. Observed on a clean
account: year at 300 plans and 120 grounded, then a Trip Pass purchase leaves tier
trip at 60 plans and 40 grounded with expiry out at 395 days. The traveller paid
and lost 80 percent of their allowance. It was not fixed here because the fix is a
product decision rather than a typo, and a wrong guess would be worse than the
current honest behaviour. Three candidates. Keep the higher tier and extend by the
bought tier's days, which is probably what a buyer expects. Refuse the purchase in
`checkout` when a higher tier is live, which is the clearest but blocks a
legitimate "top up my days" intent. Or convert the payment to equivalent days of
the held tier. It needs its own task and a migration, since `grant_pass` is where
the change lands.

`entitlements.expires_at` can be extended without limit. Ten Year Pass purchases
in a row put a pass 3650 days out, and `admin_set_tier` caps its own `p_days` at
36600 while `grant_pass` caps nothing. Not exploitable, since every extension is a
real payment, but a stolen-card burst or a test script would write an absurd
expiry that only a manual UPDATE could undo.

Migration 018 cannot be applied to a stock Postgres. Line 93 is `(p_patch ->>
'image') !~ '^https://[^[:space:]]{5,600}$'` and the POSIX regex repetition count
has a hard ceiling of 255, so the pattern is rejected at function creation time
with SQLSTATE 2201B. It is live on the hosted project, which means the hosted
Postgres accepted it, but it blocks `supabase start` for anyone trying to run the
stack locally, and it blocked this task until the file was held aside. The fix is
to drop the upper bound or use `{5,255}`, plus a separate length check if 600 is
meaningful. Out of scope here and worth its own small task.

The real purchase is still to be made, and it is the reason this task cannot be
called finished. The full procedure is written up in
`supabase/functions/checkout/test_purchase_e2e.md`, ten steps with the exact
commands and expected values. The short version of what the user must run: create
two one-time EUR Prices in Stripe test mode at 699 and 1499 and note the ids;
`supabase secrets set STRIPE_SECRET_KEY STRIPE_PRICE_TRIP STRIPE_PRICE_YEAR
--project-ref ntssxktaduxzpsmejwyv`; deploy `checkout` normally and
`stripe-webhook` with `--no-verify-jwt`; `winget install Stripe.StripeCli` then
`stripe login`; `stripe listen --forward-to
https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/stripe-webhook` and set the
`whsec_` it prints; then buy a Trip Pass and a Year Pass on two fresh accounts
with card 4242, run the SELECTs after each, resend one event from the Stripe
Dashboard to confirm the replay is a no-op, and buy a second Trip Pass to confirm
the extension. The only checks that genuinely need this are the three blocked
rows: the card payment itself, the Price object's amount and currency, and the
three user id fields on a real session.

Two traps for whoever runs it. Do not use the owner account: it holds a manual year
pass to 2126, and because `grant_pass` extends from a live expiry, every expiry
assertion would land in 2126 and prove nothing. And `stripe trigger
checkout.session.completed` does NOT test the replay path, because it builds a
synthetic session with no `client_reference_id` and no metadata; it exercises the
missing-metadata branch instead. A real replay needs a Dashboard endpoint and
`stripe events resend`.

`CHECKOUT_TERMS_URL` is still unset, carried from T013 and T030, so the withdrawal
waiver was not part of what was tested. T032 owns it. The Stripe Price objects are
still unverified, carried from T030.

## Rollback procedure

Nothing to roll back in the system. No code changed, no live write was issued, no
secret was set, and the local Supabase stack was stopped with `supabase stop
--no-backup`, which removes its containers and volumes.

To remove the two documents, `git checkout main` and `git branch -D
p2-stripe-purchase-e2e`, or revert the single commit on the branch.

If the local stack is ever left running, `supabase stop --no-backup` from the repo
root ends it. If migration files are ever left moved aside by an interrupted run,
`git checkout -- supabase/migrations/` restores all of them, and `git diff HEAD --
supabase/migrations/` returning nothing is the proof.
