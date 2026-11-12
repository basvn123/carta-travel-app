# Owner procedure: Stripe (ROADMAP A3, I2)

Everything that needs the Stripe Dashboard or a real purchase. Use test mode first. Go to live mode only at launch (I2). When a step is done, delete it here.

State on 2026-11-12:
- checkout and stripe-webhook are deployed (the live copies are still the old subscription versions until the orchestrator redeploys them from `main`; the old `billing` function is deleted from the code and goes with that deploy). stripe-webhook runs without the JWT check.
- checkout answers `503 no_stripe` until `STRIPE_SECRET_KEY` is set. stripe-webhook answers `503 not configured` until both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set (checked live 2026-11-12: no Stripe secret is set). That is expected, not a fault: nothing is charged or granted in that state.
- Migration 053 is live: the Trip Pass is 60 days on the server. No pass renews (decision 0010): the Year Pass is one payment for 12 months.
- No Stripe key is on this machine, so every step below needs your Stripe login.

Decided by the owner sweep on 2026-11-12 (these are no longer steps):
- **T460-d:** keep the Year Pass at EUR 14.99 and the live-search ceilings at 40 (Trip Pass) and 120 (year).
  - EUR 14.99 is the owner's own T460 decision of 2026-10-16.
  - The ceilings are sized by the cost-floor arithmetic in `continent-app/src/lib/pricing.js`: a fully used year costs about EUR 9.00 against about EUR 11.90 net. The older 10 and 30 came before that sizing.
- **T461-e:** dropped: no pass renews, so there is no cancellation to confirm under BGB 312k(4) (decision 0010).

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
   - Set `STRIPE_WEBHOOK_SECRET` in the same command as `STRIPE_SECRET_KEY`, never later: with only the key set, Buy takes the money while the webhook answers 503, so no pass is granted. Stripe retries a 503 for up to 3 days, so a late secret still grants, but only inside that window.
   - Check the webhook: `curl -s -X POST https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/stripe-webhook` answers `no signature` (400), not `not configured` (503). Then Stripe, Webhooks, the endpoint, Send test event: it answers 200.
   - It worked when Buy on the site opens Stripe's page instead of "not switched on yet".
3. **Test purchases (T031-a, T032-c, T037-b, T217-a).** Use fresh test accounts, never the owner's.
   - Follow `supabase/functions/checkout/test_purchase_e2e.md`.
   - Check that Stripe's page shows Carta's waiver wording and that `pass_grants` reads consent accepted.
   - Use up a test account's AI quota, force one plan-day failure, and check that `ai_usage` goes back to its prior value.
   - Refund one test purchase by following `docs/REFUND_SOP.md` word for word. Correct any step the Dashboard contradicts.
4. **Legal review before the Year Pass sells (T460-b).** No pass renews (decision 0010), so tacit renewal, the French renewal reminder and the 312k cancel button no longer apply. A lawyer or legal service checks these points:
   - the waiver sharing Stripe's terms tick box;
   - the confirmation recording the waiver;
   - the 30-day price notice.
5. **Live-mode emails at launch (T213-c).** Stripe, live mode, Settings, Customer emails.
   - Turn on receipts.
   - Put the imprint address and the VAT line in the invoice footer.
