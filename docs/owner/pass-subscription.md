# The Year Pass and the 60-day Trip Pass: switching them on (T460, ROADMAP I-f, I2)

Rewritten by owner sweep round 2 (2026-11-12): both passes are one payment that never renews (decision 0010). The subscription path (renewals, the Customer Portal, cancel and resume, the `billing` function) is gone from the code. Do `docs/owner/stripe.md` steps 1 and 2 first: keys, both Prices and the webhook endpoint. The legal review (stripe.md step 4, T460-b) comes before the Year Pass is sold in live mode.

State on 2026-11-12:
- Migration 053 is live: the Trip Pass runs 60 days on the server. Migration 075 (drops the "already subscribed" refusal) is written and goes in with 063 to 074 (`docs/owner/supabase-migrations.md` step 1).
- The live `checkout` and `stripe-webhook` are still the old subscription versions until the orchestrator redeploys them from `main` (`supabase functions deploy checkout stripe-webhook`) and deletes the old `billing` function (`supabase functions delete billing`). Without Stripe secrets none of them can charge anything.

Until the steps below are done, nothing breaks: Buy answers "not switched on yet".

## Steps (Stripe login needed)

1. **The one-time Year Pass Price.** In Stripe, Products, the Year Pass product (or a new "Carta Year Pass"): Add price, EUR 14.99, **One-time**, tax behaviour **inclusive**. Then `supabase secrets set STRIPE_PRICE_YEAR=price_...`. It must be one-time: Stripe refuses a payment-mode checkout on a recurring Price.
2. **Webhook events.** Developers, Webhooks, the `stripe-webhook` endpoint: only `checkout.session.completed` is needed. Do not add `invoice.*` or `customer.subscription.*` events; the code acknowledges and ignores them.
3. **Test in test mode,** with a fresh test account (not yours):
   - Buy the Year Pass: the checkbox text says the pass starts at once and that within 14 days you can withdraw and get back the days not yet used; Account shows "Your Year Pass runs until ..." and no cancel or renew row.
   - Buy a Trip Pass: it runs 60 days.
   - It worked when Account shows each pass with its end date, 12 months and 60 days out.

## What the code does with each event

| Event | What happens |
|---|---|
| `checkout.session.completed` (Trip Pass or Year Pass) | Grants the tier's days through `grant_pass` (60 or 365), keyed on the session id, with the consent, country and gate reason read from the session |
| any other event | Acknowledged with 200 and ignored |
