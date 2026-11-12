# The yearly plan and the 60-day Trip Pass: switching them on (T460)

Written by T460 (2026-10-16). Do `docs/owner/stripe.md` steps 1 and 2 first: keys, the Trip Pass Price and the webhook endpoint. The legal review (stripe.md step 4, T460-b) comes before the yearly plan is sold in live mode.

Already done on 2026-11-12:
- Migration 053 is live: the Trip Pass runs 60 days on the server.
- checkout, stripe-webhook (no JWT check) and billing are deployed from `main`.

Until the steps below are done, nothing breaks. Buying the yearly plan answers "not switched on yet", and Account shows no cancel row.

## Steps (Stripe login needed)

1. **The one-time Year Pass Price** (the Year Pass is paid once and never renews, ROADMAP I-f).
   - In Stripe, open Products, then the Year Pass product (or a new "Carta yearly plan").
   - Add price: EUR 14.99, One-time, tax behaviour **inclusive**.
   - Then set it as the yearly secret:
     ```
     supabase secrets set STRIPE_PRICE_YEAR=price_...
     ```
     It must be a one-time Price. Stripe refuses a payment-mode checkout on a recurring Price.
2. **Customer Portal.** Stripe, Settings, Billing, Customer portal:
   - allow cancelling at the end of the billing period;
   - allow updating the payment method;
   - allow viewing the invoice history;
   - set the business name and the terms link `https://carta-europetravel.com/?legal=terms`.
3. **Webhook events.** Developers, Webhooks, the `stripe-webhook` endpoint. Next to `checkout.session.completed`, add:
   - `invoice.paid`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Test in test mode.**
   - Buy the yearly plan: the checkbox names the renewal, and Account shows "Renews ...".
   - Cancel from Account: the row shows "Ends ...", and Stripe shows "Cancels ...".
   - Resume takes the cancel back.
   - Advance a test clock past the year: the renewal adds a year.
   - Buy a Trip Pass: it runs 60 days.

## What the code does with each event

| Event | What happens |
|---|---|
| `checkout.session.completed` (yearly) | Writes the subscription's state; grants nothing |
| `invoice.paid` (subscription_create) | Grants a year through `grant_pass`, keyed on the invoice id, with the consent, country and gate reason read from the checkout session |
| `invoice.paid` (subscription_cycle) | Grants the next year, reason "renewal" |
| `customer.subscription.*` | Writes status, "cancel at period end" and the renewal date |
| Billing function, cancel or resume | Changes the subscription in Stripe and writes the new state straight away |
