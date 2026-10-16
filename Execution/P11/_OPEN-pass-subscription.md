# The yearly plan and the 60-day Trip Pass: switching them on

Written by T460 (2026-10-16). These are the owner's steps, in order. Register rows T460-a to T460-d point here. Stripe has never been live (see `Execution/_OWNER-RUNBOOK.md`, Block J): these steps slot into that block, so do Block J's earlier steps (keys, the one-off Trip Pass Price, the webhook endpoint, migrations up to 044) first.

Until every step is done, nothing breaks:
- The panel shows the yearly plan.
- A purchase answers with the panel's "not switched on yet" line, as it does today.
- The Account page shows no cancel row, because there is no subscription.

## Steps

1. **Paste migration 053.**
   - Paste `supabase/migrations/053_pass_subscriptions.sql` in the Supabase SQL editor, after 044.
   - Look for "pass subscriptions self-check passed".
   - Never `db push`.
   - This is the step that makes the Trip Pass 60 days on the server. Until then the server grants 30, while the panel already says 60. Do this one first.
2. **Create the recurring yearly Price in Stripe.**
   - Products, then the existing Year Pass product, or a new "Carta yearly plan" product.
   - Add price: EUR 14.99, Recurring, yearly, tax behaviour **inclusive**.
   - Copy the price id (`price_...`).
3. **Point the yearly secret at it:**
   ```
   supabase secrets set STRIPE_PRICE_YEAR=price_...
   ```
   It must be the recurring Price. A one-off Price there makes Stripe refuse the subscription session.
4. **Set up the Customer Portal** (Stripe Dashboard, Settings, Billing, Customer portal):
   - allow cancelling, at the end of the billing period;
   - allow updating the payment method;
   - allow viewing the invoice history;
   - set the business name and the terms link to `https://carta-europetravel.com/?legal=terms`.
5. **Add events to the webhook endpoint** (Developers, Webhooks, the `stripe-webhook` endpoint). Next to `checkout.session.completed`, add:
   - `invoice.paid`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. **Deploy the three functions:**
   ```
   supabase functions deploy checkout
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy billing
   ```
   Optionally, `supabase secrets set BILLING_RETURN_URL=https://carta-europetravel.com/?billing=back`.
7. **Test in Stripe test mode:**
   - Buy the yearly plan. The checkbox text names the renewal, and Account shows "Renews ...".
   - Cancel from Account, then check:
     - the row changes to "Ends ...";
     - the subscription in Stripe shows "Cancels ...";
     - "Resume" takes the cancel back.
   - Advance a test clock past the year and check that the renewal adds a year.
   - Buy a Trip Pass and check that it runs 60 days.

## What the code does with each event

| Event | What happens |
|---|---|
| `checkout.session.completed` (yearly) | Writes the subscription's state; grants nothing |
| `invoice.paid` (subscription_create) | Grants a year through `grant_pass`, keyed on the invoice id, with the consent, country and gate reason read from the checkout session |
| `invoice.paid` (subscription_cycle) | Grants the next year, reason "renewal" |
| `customer.subscription.*` | Writes status, "cancel at period end" and the renewal date |
| Billing function, cancel or resume | Changes the subscription in Stripe and writes the new state straight away |
