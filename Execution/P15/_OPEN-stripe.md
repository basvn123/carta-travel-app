# Owner procedure: Stripe (T1072, ROADMAP A3)

Everything that needs the Stripe Dashboard or a Stripe-backed purchase. Test mode first; live mode only at launch (ROADMAP I2).

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When you finish a step, tell a session the row id; it moves the row to `Execution/_OPEN-CLOSED.md`.

Rows: 11. Register rows point back here.

## Steps

1. **T030-a** (register order: 1): Verify or create the two Stripe Prices: 699 and 1499 EUR, one_time, eur, note the ids and the mode; attach Dashboard screenshots
2. **T033-a** (register order: 1): Confirm tax_behavior is inclusive on both Prices; exclusive makes section 3.1 of the unit economics wrong by 1.21 a sale
3. **T032-a** (register order: 2): Fill the Stripe Dashboard Terms of service URL, then set CHECKOUT_TERMS_URL; the secret before the field makes every checkout 502
4. **T030-b** (register order: 4): Set STRIPE_SECRET_KEY, STRIPE_PRICE_TRIP, STRIPE_PRICE_YEAR as Supabase secrets, then deploy checkout and stripe-webhook (webhook with --no-verify-jwt)
5. **T032-c** (register order: 6): Confirm on a real purchase that the Stripe page shows Carta's waiver wording and pass_grants reads consent accepted
6. **T037-b** (register order: 9): The live refund path has never been checked against the deployed functions; force a plan-day failure after quota is spent on a test account and confirm ai_usage returns to its prior value. Pairs with T036-b, which covers the live 429
7. **T213-c**: Stripe Dashboard, live mode: confirm customer receipt emails are on and the invoice footer carries the imprint address and VAT line, so Carta needs no receipt template of its own
8. **T217-a** (register order: after T031-a): Test docs/REFUND_SOP.md once against a real refund of a T031-a test purchase, following it literally, and correct any step the Dashboard contradicts (Stripe Tax reversal, fee kept)
9. **T460-b** (register order: before T460-a goes live): Legal review of the yearly plan before it sells: tacit yearly renewal (DE 309 Nr. 9, NL 6:236 j), the FR renewal reminder, a 312k cancel button behind sign-in, the waiver sharing Stripe's terms tick box, the confirmation recording the waiver, the 30-day price notice the terms now promise
10. **T460-d**: Price calls: the yearly plan at EUR 14.99 pays off only from a third trip (two Trip Passes EUR 13.98), EUR 12.99 would make it the plain deal; live-search ceilings still 40 and 120 against T041-a's 10 and 30 (T148)
11. **T461-e** (register order: with T460-b): BGB 312k(4) text-form confirmation of a yearly cancellation: switch on Stripe's cancellation email or have the billing function send one
