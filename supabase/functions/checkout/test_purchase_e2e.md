# End-to-end purchase test, both tiers, Stripe test mode

This is the procedure T031 could not run, because the live project has no Stripe
secrets and no Stripe CLI exists on the development machine. Everything below is
written so it can be run once by hand, top to bottom, in about forty minutes.
Run it in Stripe TEST mode only. Nothing here should ever be pointed at a live
key: step 7 deliberately replays a webhook, and step 9 deliberately buys twice.

Seven things are being proved, and it is worth knowing which step proves which
before starting.

| # | Claim | Step |
|---|---|---|
| 1 | Checkout refuses an anonymous caller with 401 before it talks to Stripe | 3 |
| 2 | A tampered tier id is refused with bad_tier | 4 |
| 3 | client_reference_id and both metadata copies carry the user id | 5 |
| 4 | A Trip Pass grants tier trip and expires_at about 30 days out | 6 |
| 5 | A Year Pass grants tier year and expires_at about 365 days out | 8 |
| 6 | A replayed webhook is a no-op, guarded by pass_grants.session_id | 7 |
| 7 | A second purchase extends from the current expiry, not from today | 9 |

## 0. What you need first

A Stripe account in test mode with two one-time Prices, in EUR, at 699 and 1499
cents. T030 lists the four fields to check on each. Write the two price ids down;
test-mode ids and live-mode ids are different objects and mixing them is the
ordinary way this flow fails.

The Stripe CLI, which is not installed on this machine:

```
winget install Stripe.StripeCli
stripe login
```

A Supabase test account that is not the owner account. The owner holds a manual
year pass to 2126, which would make every expiry assertion in this document
meaningless: `grant_pass` extends from a live expiry, so a Trip Pass bought on
the owner account lands in 2126 and proves nothing. Sign up a fresh address.

Note its user id, which every SELECT below needs:

```
supabase db query "select id, email from auth.users where email = 'YOUR_TEST_EMAIL' " --linked
```

## 1. Secrets and deploy

Set the four secrets. Use the test-mode key, `sk_test_...`.

```
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_TRIP=price_... \
  STRIPE_PRICE_YEAR=price_... \
  CHECKOUT_SUCCESS_URL=https://carta-europetravel.com/?pass=ok \
  CHECKOUT_CANCEL_URL=https://carta-europetravel.com/?pass=cancel \
  --project-ref ntssxktaduxzpsmejwyv
```

`CHECKOUT_TERMS_URL` is a separate decision and belongs to T032. If you set it,
Stripe also needs a Terms of Service URL filled in under Settings, Business,
Public details, or it REJECTS the session outright and checkout returns 502
`stripe_error`. If you leave it unset, the withdrawal waiver checkbox will not
appear and this test says nothing about the waiver. Either is a valid run; write
down which one you did.

Deploy both functions. The `--no-verify-jwt` on the webhook is not optional:
Stripe does not send a Supabase JWT, so with verification on, Supabase rejects
the POST before the signature check ever runs and every event fails.

```
supabase functions deploy checkout --project-ref ntssxktaduxzpsmejwyv
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ntssxktaduxzpsmejwyv
```

## 2. Point Stripe at the webhook

In one terminal, and leave it running for the whole test:

```
stripe listen --forward-to https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/stripe-webhook
```

It prints a signing secret, `whsec_...`. That secret belongs to this `listen`
session and changes every time you restart it, so set it now and redeploy is not
needed, a secret change takes effect on the next invocation:

```
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref ntssxktaduxzpsmejwyv
```

Keep the `stripe listen` output visible. It prints the event id of everything it
forwards and the status code the function answered with, which is the fastest
signal that something is wrong.

## 3. Checkout requires an account

No Authorization header at all:

```
curl -i -X POST https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/checkout \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"tier":"trip"}'
```

Expect `HTTP/2 401` and body `{"code":"auth"}`.

Note: `checkout` deploys with JWT verification ON, so Supabase's own gateway may
answer 401 with its own body before the function runs. That still proves nobody
anonymous reaches Stripe, but to see the function's own `{"code":"auth"}` you
need to get past the gateway, which means sending the anon key as a bearer token.
An anon-key bearer is a valid JWT with no user, so the function's own guard is
what refuses it:

```
curl -i -X POST https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/checkout \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"tier":"trip"}'
```

Expect 401 and `{"code":"auth"}`. Run both. The point of the pair is that no
Checkout Session is created either way, so check the Stripe Dashboard under
Payments, Checkout sessions and confirm nothing new appeared.

## 4. A tampered tier is refused

Get a real user access token. In the browser, signed in as the test account, open
the console on carta-europetravel.com and run:

```
(await window.supabase.auth.getSession()).data.session.access_token
```

If `window.supabase` is not exposed, read it out of localStorage instead: the key
looks like `sb-ntssxktaduxzpsmejwyv-auth-token` and the token is the
`access_token` field of that JSON.

Then, with `TOKEN` set to it:

```
curl -i -X POST https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/checkout \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tier":"bogus"}'
```

Expect 400 and `{"code":"bad_tier"}`. Repeat with `{"tier":"free"}`, which must
also be refused: free is in `TIERS` but not in `PAID_TIERS`, so it is not
buyable. Repeat with `{}` and no tier at all, also `bad_tier`. Then send a body
that is not JSON to see 400 `bad_json`.

Worth trying once for the record, because it is the attack the code was written
against: add a price or an amount to the body and confirm it changes nothing.

```
  -d '{"tier":"trip","price_cents":1,"amount":1,"price":"price_something_cheap"}'
```

Expect 200 with a session url, and the session in the Dashboard charging 6.99
EUR. The function reads only `body.tier`; the amount comes from the Price object
named by the secret and nothing on the wire can touch it.

## 5. Buy a Trip Pass and check the session fields

Take the `url` from a successful checkout call for tier trip and open it. Pay
with test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
`billing_address_collection` is required, so a full address is asked for; use a
Belgian one, which keeps VAT in the home member state and matches the Article 59c
posture in the function header.

Before or after paying, read the session back and check the three places the user
id has to appear. This is the single most load-bearing assertion in the whole
test: the webhook grants off these fields, and if any of them is empty the
payment lands and the pass does not.

```
stripe checkout sessions retrieve cs_test_... \
  --expand payment_intent
```

Check four things in that output. `client_reference_id` equals the test user's
uuid. `metadata.user_id` equals the same uuid and `metadata.tier` is `trip`.
`payment_intent.metadata.user_id` and `payment_intent.metadata.tier` carry the
same pair. And `mode` is `payment`, with no subscription anywhere.

The two metadata copies are not redundancy for its own sake. Session metadata is
what the `checkout.session.completed` event carries; the payment intent copy is
what a refund, a dispute or a Radar review shows, and those arrive as different
events on a different object. `client_reference_id` is read first by the webhook
because it survives even when an intermediary drops metadata.

## 6. Verify the Trip Pass grant

`stripe listen` should show `checkout.session.completed` forwarded and answered
200. Then, with `UID` as the test user's uuid:

```
supabase db query "select tier, period_start, expires_at, source, stripe_customer_id, last_session_id, updated_at from public.entitlements where user_id = 'UID'" --linked

supabase db query "select session_id, tier, expires_at, granted_at from public.pass_grants where user_id = 'UID' order by granted_at desc" --linked
```

Expected, for an account that held no pass before this:

- `entitlements.tier` is `trip`
- `entitlements.source` is `stripe`
- `entitlements.expires_at` is about 30 days from now, matching
  `plan_tiers.period_days` for trip
- `entitlements.period_start` is now, which is what refills the allowance
- `entitlements.stripe_customer_id` is a `cus_...` value
- `entitlements.last_session_id` is the `cs_test_...` id you just paid
- exactly ONE row in `pass_grants`, with the same session id, tier `trip`, and
  the same `expires_at` as the entitlement

Check the arithmetic explicitly rather than by eye, because a 30 against a 365 is
easy to misread:

```
supabase db query "select tier, expires_at, round(extract(epoch from (expires_at - now()))/86400) as days_left from public.entitlements where user_id = 'UID'" --linked
```

`days_left` should read 30 for a trip pass and 365 for a year pass.

Then confirm the pass is live in the app's own terms. `ai_status` is what the UI
renders, and it is the function that decides whether a lapsed pass still counts:

```
supabase db query "select public.ai_status('UID')" --linked
```

Expect `tier` trip, `plansCap` 60, `groundCap` 40, `plansLeft` 60 if the account
has spent nothing this period, and `resetsAt` equal to `expires_at`.

## 7. Replay the webhook, expect a no-op

This is the check `pass_grants` exists for. Take the event id from the
`stripe listen` output, it starts `evt_`, and resend it:

```
stripe events resend evt_... --webhook-endpoint we_...
```

If you are forwarding through `stripe listen` rather than a Dashboard endpoint
there is no `we_` id to name. Two alternatives, either is fine:

```
stripe events resend evt_...
```

which replays to the configured Dashboard endpoints, so create one there first
pointing at the same function URL and listening for
`checkout.session.completed`. Or trigger the same delivery by hand, which is
what `listen` is already doing:

```
stripe trigger checkout.session.completed
```

but note that `stripe trigger` builds a SYNTHETIC session with no
`client_reference_id` and no metadata, so it does not test the replay path at
all. It tests the missing-metadata branch instead, and should answer 200 with
`{"received":true,"error":"missing user or tier"}`. That is a useful check in its
own right, and it is NOT the replay check. To really test a replay you need the
real event resent, so create the Dashboard endpoint.

After the resend, re-run both SELECTs from step 6. Expected: absolutely nothing
moved. Same `expires_at` to the microsecond, still exactly one row in
`pass_grants`, and `updated_at` on the entitlement unchanged. The function
answers 200 and its body should read `{"received":true,"granted":{"ok":true,
"replay":true}}`.

If `expires_at` moved 30 days, the replay guard is broken and this is the
highest-severity failure in this document: it means Stripe's ordinary retry
behaviour hands out free passes.

## 8. Buy a Year Pass on a clean account

Use a SECOND fresh test account, not the one from step 5. Buying a year pass on
the trip-pass account is a different test, the stacking one, and mixing them
makes the 365 assertion unreadable.

Repeat steps 4 through 6 with `{"tier":"year"}`. Expected: `entitlements.tier` is
`year`, `days_left` reads 365, `ai_status` shows `plansCap` 300 and `groundCap`
120, and one row in `pass_grants` with tier year.

## 9. Buy twice, and check it extends rather than double-grants

Go back to the trip-pass account from step 5, which still holds about 30 days.
Record the exact current expiry first:

```
supabase db query "select expires_at from public.entitlements where user_id = 'UID'" --linked
```

Buy a second Trip Pass, same flow, new Checkout Session. Then:

```
supabase db query "select tier, period_start, expires_at, round(extract(epoch from (expires_at - now()))/86400) as days_left from public.entitlements where user_id = 'UID'" --linked

supabase db query "select session_id, tier, expires_at, granted_at from public.pass_grants where user_id = 'UID' order by granted_at desc" --linked
```

Expected, and this is the whole point of the step. `expires_at` is the OLD expiry
plus 30 days, so `days_left` reads about 60 and not 30. `period_start` moved to
now, which refills the allowance, so `ai_status` shows `plansLeft` back at 60.
And `pass_grants` now holds TWO rows with two different session ids.

If `days_left` reads 30, the extension is computing from `now()` and the
traveller lost the days they had paid for.

Now the interleaving that matters, and the reason `pass_grants` exists rather
than `entitlements.last_session_id`. Replay the FIRST purchase's event, the one
from step 5, now that a second purchase has overwritten `last_session_id`:

```
stripe events resend evt_FIRST_PURCHASE
```

Expected: still no change, `days_left` still about 60, still two rows in
`pass_grants`. `last_session_id` no longer names the first session, so a guard
built on that column alone would not recognise this delivery and would extend the
pass a third time. `pass_grants` does recognise it. Stripe retries for days, and
this exact sequence is the one it was built for.

Finally, the tier-change case, which is worth recording even though the code's
behaviour here is a known open question rather than a defined requirement. On
the year-pass account from step 8, buy a Trip Pass. What happens today is that
`entitlements.tier` becomes `trip` while `expires_at` extends from the year
expiry, so the holder keeps the dates and drops from 300 plans to 60. Record what
you observe. If that is not the intended behaviour, it is a change to
`grant_pass` and needs its own task.

## 10. Clean up

Test mode data does not need deleting, but the rows written to the LIVE Supabase
database do, because they are real entitlements on real auth users.

```
supabase db query "delete from public.pass_grants where user_id in ('UID1','UID2')" --linked
supabase db query "delete from public.entitlements where user_id in ('UID1','UID2')" --linked
supabase db query "delete from public.ai_usage where user_id in ('UID1','UID2')" --linked
```

Or delete the test auth users, which cascades all three by foreign key. Do not
delete the owner row, user id beginning 36a28f80, which holds the manual year
grant to 2126.

Then decide about the secrets. Leaving a `sk_test_` key set means checkout works
in the app but charges nothing real, which is a reasonable staging posture and a
bad production one. Whichever you choose, write it down: a live launch with a
test key takes payments that do not exist.

## What to record as evidence

The two price ids and which mode they belong to. The 401 and bad_tier responses
verbatim. The `stripe checkout sessions retrieve` output for one session, with
the three user id fields visible. The `days_left` figure after each of the four
purchases: trip 30, year 365, second trip 60, and whatever the tier change gives.
The before and after of the replay, showing `expires_at` identical. And the
`pass_grants` row count at the end, which should be four.
