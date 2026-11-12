# Owner procedure: Stripe (ROADMAP A3, I2)

Everything that needs the Stripe Dashboard or a real purchase. Use test mode first. Go to live mode only at launch (I2). When a step is done, delete it here.

State on 2026-11-12:
- checkout, stripe-webhook and billing are deployed. stripe-webhook runs without the JWT check.
- With no Stripe key, they answer `503 no_stripe` or "not configured" and charge nothing.
- Migration 053 is live: the Trip Pass is 60 days on the server and the subscription columns exist.
- No Stripe key is on this machine, so every step below needs your Stripe login.

Decided by the owner sweep on 2026-11-12 (these are no longer steps):
- **T460-d:** keep the yearly plan at EUR 14.99 and the live-search ceilings at 40 (Trip Pass) and 120 (year).
  - EUR 14.99 is the owner's own T460 decision of 2026-10-16.
  - The ceilings are sized by the cost-floor arithmetic in `continent-app/src/lib/pricing.js`: a fully used year costs about EUR 9.00 against about EUR 11.90 net. The older 10 and 30 came before that sizing.
  - A plan that pays off from the third trip is normal for a yearly plan.
- **T461-e:** confirm a yearly cancellation in text form (BGB 312k(4)) with Stripe's own email first (step 5). If Stripe sends no cancellation confirmation, the billing function sends one through Resend. That is engineering work under ROADMAP I2.

## Steps

1. **Prices (T030-a, T033-a).** Stripe, test mode, Products.
   - Create or find the Trip Pass Price: EUR 6.99, one-time. Write down its `price_...` id.
   - The Year Pass Price: EUR 14.99, one-time (not recurring); see `docs/owner/pass-subscription.md`, step 1.
   - Tax behaviour must be **inclusive** on both. If it is exclusive, the unit economics are off by EUR 1.21 a sale.
2. **Terms URL, then keys (T032-a, T030-b).** Do them in this order: setting the terms secret before the Dashboard field makes every checkout answer 502.
   1. Stripe, Settings, Public details: set Terms of service to `https://carta-europetravel.com/?legal=terms`.
   2. Set the keys. Get the webhook secret from Developers, Webhooks, Add endpoint, URL `https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/stripe-webhook`, event `checkout.session.completed`, then copy the signing secret.
      ```
      supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_TRIP=price_... STRIPE_WEBHOOK_SECRET=whsec_... CHECKOUT_TERMS_URL=https://carta-europetravel.com/?legal=terms
      ```
   - It worked when Buy on the site opens Stripe's page instead of "not switched on yet".
3. **Test purchases (T031-a, T032-c, T037-b, T217-a).** Use fresh test accounts, never the owner's.
   - Follow `supabase/functions/checkout/test_purchase_e2e.md`.
   - Check that Stripe's page shows Carta's waiver wording and that `pass_grants` reads consent accepted.
   - Use up a test account's AI quota, force one plan-day failure, and check that `ai_usage` goes back to its prior value.
   - Refund one test purchase by following `docs/REFUND_SOP.md` word for word. Correct any step the Dashboard contradicts.
4. **Legal review before the yearly plan sells (T460-b).** A lawyer or legal service checks these points:
   - tacit yearly renewal (DE 309 Nr. 9, NL 6:236 j);
   - the French renewal reminder;
   - the 312k cancel button behind sign-in;
   - the waiver sharing Stripe's terms tick box;
   - the confirmation recording the waiver;
   - the 30-day price notice.
5. **Live-mode emails at launch (T213-c, T461-e).** Stripe, live mode, Settings, Customer emails.
   - Turn on receipts.
   - Turn on emails about cancelled subscriptions, if the option exists.
   - Put the imprint address and the VAT line in the invoice footer.
   - Tell a session whether a cancellation email exists, so T461-e's fallback is built or dropped.
