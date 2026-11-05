# Runbook: refund

Owner and only decider: Bas. Rewritten by T1086 (ROADMAP B2) from `archive/docs-2026-11/REFUND_SOP.md` (T217), checked against the migrations, `supabase/functions/stripe-webhook/index.ts`, `continent-app/src/lib/pricing.js` and the Refunds section of `continent-app/src/components/TermsOfService.jsx`. If that Terms section changes, this page changes with it. Dashboard clicks (Stripe, Supabase, Admin panel) were not re-verified; the SQL objects and files were.

## What the code does and does not do

- Passes are sold through Stripe Checkout. The Trip Pass is a one-off payment (EUR 6.99, 60 days since migration 053; `plan_tiers.period_days` is the source and `pricing.js` mirrors it). The Year plan is a Stripe subscription (EUR 14.99 a year per `pricing.js`) that grants on each `invoice.paid` (keyed on the invoice id), so renewals are sales too.
- `stripe-webhook` handles `checkout.session.completed`, `invoice.paid` and `customer.subscription.created/updated/deleted`. Nothing reacts to a refund, a dispute or `charge.refunded`. So a refund is always three hand steps, in this order: money back in Stripe, access adjusted in Carta, a note in the ledger.
- A year subscription must also be cancelled or it renews: cancel it in the Stripe Dashboard before refunding the last invoice.

## 1. Find the sale

Requests arrive by email (the contact address in the Terms). Ask the customer to write from the address on the account. In the Supabase SQL editor:

```sql
select g.session_id, g.tier, g.amount_cents, g.currency, g.granted_at, g.expires_at,
       g.consent_tos, g.consent_at, g.reason, e.tier as holds, e.expires_at as holds_until
  from public.pass_grants g
  join auth.users u on u.id = g.user_id
  left join public.entitlements e on e.user_id = g.user_id
 where lower(u.email) = lower('customer@example.com')
 order by g.granted_at desc;
```

(Column names are from migration 007 and later; if the query errors on a column, read the current definition in `supabase/migrations/` before improvising.) No row but a payment in Stripe means the webhook failed, not a refund question: see "Stripe webhooks stop arriving" in [incident.md](incident.md), grant the pass (Admin, the user, tier), and ask whether they still want the refund.

Did they use it? AI plans and live searches are counted per day (migration 044):

```sql
select kind, sum(n) from public.ai_usage_days
 where user_id = '<user id>' and day >= '<granted_at date>' group by kind;
```

Exports leave no server record; take the customer's word.

## 2. Decide

| Situation | Refund | Access |
|---|---|---|
| Within 14 days and `consent_tos` is not 'accepted' (no waiver on file) | Whole amount, used or not (statutory right) | Remove the sale's days |
| Within 14 days, no plan, live search or export on that pass (Terms case 1) | Whole amount | Remove the sale's days |
| Paid features down through our fault for a substantial part of the pass (case 2) | Default none; extend by the days lost. Unused share only if they ask | Extend, or remove the unused days |
| We withdrew or materially cut a paid feature (case 3) | Unused share, if they ask | Remove the unused days |
| Bought twice by mistake | The second sale in full | Remove that sale's days |
| Account closed for honest-mistake abuse, or Carta closes | Unused share | Pass ends with the account |
| Anything else (started, waiver accepted, changed mind) | None; reply politely and quote the Refunds section | Leave in place |

Unused share = `amount_cents` x unused days / the tier's days (60 for a Trip Pass bought after migration 053, 30 for one bought before it, 365 for a Year; read `period_days` in `plan_tiers`), rounded down to the cent. Stacked passes: unused days come off the newest sale first. A goodwill exception is the owner's call; prefer extra days over money and write the reason in the note.

## 3. Refund in Stripe

Stripe Dashboard, live mode: search the session id (`cs_...`) or the email, open the payment, Refund, the amount from step 2, reason "Requested by customer" or "Duplicate". Copy the refund id (`re_...`). The money returns to the original method, usually within ten working days; Stripe keeps its own fee. Never refund outside Stripe: VAT and OSS figures only see Stripe. A chargeback is not a refund request: answer it in the Dashboard with `consent_tos`, `consent_at`, `granted_at` and the usage query; if the customer had a case in the table, accept it. A lost or accepted dispute also removes the sale's days.

## 4. Adjust access

Stripe does not touch the pass. Revoke everything (the refunded sale was the only live one): Admin panel, open the user, tier Free, apply. To shorten or extend without resetting the allowance, do not use Admin "set tier" (it restarts the allowance period). Use `admin_adjust_expiry` from migration 047:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub": "<your admin user id>", "role": "authenticated"}', true);
select public.admin_adjust_expiry('<user id>', -30);   -- a positive number extends
commit;
```

The SQL editor has no session, so the `set_config` line tells the function who is calling; without it the answer is forbidden. It returns `{"ok": true, "expiresAt": ...}` or one error word and changes nothing on an error: `would_expire` (the cut reaches today, set Free in Admin instead), `no_live_pass` (nothing to shorten), `beyond_horizon` (over 1095 days ahead), `bad_days` (zero, empty or over 1095), `slow_down` (wait a minute). It writes its own audit row (`adjust_expiry`).

Never edit or delete the `pass_grants` row: it is the purchase record and the only copy of the waiver evidence. Deleting the user deletes their `pass_grants` rows (`on delete cascade`), so for a refund plus account deletion, finish this runbook and save the step 1 query output to a file first.

## 5. Record it

Admin, open the user, add a note in exactly this shape, one line:

`REFUND cs_... re_... 699 eur full case=1 access=revoked`

Fields: session id (or invoice id for a Year renewal), refund id, refunded cents, currency, full or partial, the table row (statutory, 1, 2, 3, duplicate, closure, goodwill, dispute), and `access=revoked`, `shortened Nd`, `extended Nd` or `kept`. With no money moved: `EXTEND cs_... 0 eur case=2 access=extended 6d`. The note goes to `admin_audit_log` (action `note`, migration 015). The ledger:

```sql
select detail->>'text' from public.admin_audit_log where action = 'note' and detail->>'text' like 'REFUND%';
```

Then email the customer the amount and the expected arrival time.

Known gap: `pass_grants` has no refund column, so the OSS threshold and the margin panel count a refunded sale at its full amount. Until that changes, these notes are the refund ledger.

## What the traveller sees

After step 4 the app drops them to Free (or the shortened date) the next time it reads their entitlement. Before step 4 a refunded traveller still has full access.

## Undo

Stripe refunds cannot be undone. A wrong access change: `admin_adjust_expiry` with the opposite number, or Admin set tier again (note: this restarts the allowance). Write a correcting note; never edit an old one.
