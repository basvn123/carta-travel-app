# Refund procedure

Owner: Bas (the only person who decides and issues a refund). Written by T217, 2026-10-02.
Source of the promises: the Refunds, Liability and Ending sections of
continent-app/src/components/TermsOfService.jsx. If those sections change, this page changes with them.

Passes are one-off payments: a Trip Pass (30 days) and a Year Pass (365 days), prices in
continent-app/src/lib/pricing.js. Stripe takes the money; the stripe-webhook function writes one row
in public.pass_grants per sale and moves public.entitlements. Nothing in the code reacts to a refund:
the webhook ignores every event except checkout.session.completed. So a refund is three separate hand
steps, always in this order: money back in Stripe, access adjusted in Carta, a note in the ledger.

## 1. Find the sale

Requests arrive by email (the ToS contact address). Answer within a few working days. Look the sale up
in the Supabase SQL editor:

```sql
select g.session_id, g.tier, g.amount_cents, g.currency, g.granted_at, g.expires_at,
       g.consent_tos, g.consent_at, g.reason, e.tier as holds, e.expires_at as holds_until
  from public.pass_grants g
  join auth.users u on u.id = g.user_id
  left join public.entitlements e on e.user_id = g.user_id
 where lower(u.email) = lower('customer@example.com')
 order by g.granted_at desc;
```

Ask the customer to write from the address on the account. No row means no sale reached Carta: look the
email up in the Stripe Dashboard (checkout sets customer_email), and if a payment exists with no grant,
that is a webhook failure, not a refund question. Grant the pass first (Admin, user, tier) and ask whether
they still want the refund.

Did they use the pass? AI plans and live searches are counted per day (044):

```sql
select kind, sum(n) from public.ai_usage_days
 where user_id = '<user id>' and day >= '<granted_at date>' group by kind;
```

Exports leave no server record. For exports, take the customer's word.

## 2. Decide

| Situation | Refund | Access |
|---|---|---|
| Within 14 days and consent_tos is not 'accepted' (no waiver on file) | Whole amount, used or not. This is the statutory right, not a choice | Remove the sale's days |
| Within 14 days, no plan, no live search, no export on that pass (ToS case 1) | Whole amount | Remove the sale's days |
| Paid features down through our fault for a substantial part of the pass (ToS case 2) | Default: none, extend by the days lost. Unused share only if they ask | Extend, or remove the unused days |
| We withdrew or materially cut a paid feature during the pass (ToS case 3) | Unused share, if they ask | Remove the unused days |
| Bought twice by mistake (two sales minutes apart) | The second sale in full | Remove that sale's days |
| Account closed for honest-mistake abuse, or Carta closes | Unused share | Pass ends with the account |
| Anything else: started pass, waiver accepted, changed their mind | None. Reply politely, quote the Refunds section | Leave in place |

Unused share = amount_cents x unused days / tier days (30 or 365), rounded down to the cent. When passes
are stacked, the newest sale's days are the last to be used, so unused days come off the newest sale
first. A goodwill exception outside this table is the owner's call; prefer extra days over money, and
write the reason in the note so the next request is decided the same way.

## 3. Refund in Stripe

Stripe Dashboard, live mode. Search for the session id (cs_...) or the customer email, open the payment,
press Refund. Full or partial amount from step 2, reason "Requested by customer" (or "Duplicate"). Copy
the refund id (re_...). Stripe returns the money to the original card or iDEAL account, usually within
ten working days, and does not return its own processing fee. Stripe Tax records the reversal for the
VAT reports. Never refund outside Stripe (bank transfer, cash): the VAT and OSS figures only see Stripe.

A dispute (chargeback) is not a refund request. Answer it in the Dashboard with the evidence from step 1:
consent_tos, consent_at, consent_terms_url, granted_at and the usage query. If the customer had a case
under the table above, accept the dispute instead of fighting it. If the dispute is lost or accepted,
remove the sale's days as below.

## 4. Adjust access

Refunding in Stripe does not touch the pass. Do it by hand, in one of three ways.

Revoke everything (the refunded sale was the only live one): Admin, open the user, tier Free, apply.

Shorten or extend a live pass without resetting the allowance (stacked passes, partial refunds, outage
extensions). Admin "set tier" restarts the allowance period, which would hand out a fresh quota, so use
admin_adjust_expiry (migration 047, T284) instead. It moves expires_at by whole days and nothing else:
the tier and the allowance period stay, source becomes 'manual', and it writes its own audit row
(action adjust_expiry, with the old and new expiry) under your name. The Admin panel has no button for it
yet, so call it from the SQL editor as yourself. The SQL editor has no session of its own, so the first
line tells the function who is calling; without it the answer is forbidden.

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub": "<your admin user id>", "role": "authenticated"}', true);
select public.admin_adjust_expiry('<user id>', -30);   -- a positive number extends
commit;
```

The answer is `{"ok": true, "expiresAt": ...}` or one error word, and on an error nothing has changed:
would_expire means the cut reaches today or earlier, so set the user to Free in Admin instead;
no_live_pass means the pass is free or has already lapsed, so there is nothing to shorten (grant a new
pass in Admin if days are owed); beyond_horizon means the result would be more than 1095 days ahead;
bad_days means zero, empty or more than 1095; slow_down means wait a minute. Leave in place: change
nothing.

Never edit or delete the pass_grants row. It is the purchase record and the only copy of the withdrawal
waiver evidence. Deleting the user also deletes their pass_grants rows (on delete cascade), so for a
customer who asks for a refund and account deletion together, finish this procedure and run the step 1
query into a saved file before the account goes.

## 5. Record it

Admin, open the user, add a note in exactly this shape, one line:

`REFUND cs_... re_... 699 eur full case=1 access=revoked`

Fields: session id, Stripe refund id, refunded cents, currency, full or partial, the table row (statutory,
1, 2, 3, duplicate, closure, goodwill, dispute), and access=revoked, shortened Nd, extended Nd or kept.
For an extension with no money moved, write `EXTEND cs_... 0 eur case=2 access=extended 6d`. The note
lands in admin_audit_log against the user and shows under their history next time they write. Then reply
to the customer with the amount and the expected arrival time.

Known gap: pass_grants has no refund column, so the OSS threshold and the margin panel still count a
refunded sale at its full amount. Until that changes, the notes are the refund ledger, and
`select detail->>'text' from public.admin_audit_log where action = 'note' and detail->>'text' like 'REFUND%'`
lists them.
