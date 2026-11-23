/**
 * stripeEvents: what the webhook does with one Stripe event (E10 J-9, G11).
 * Pure, so a node test replays events without Deno or Stripe.
 *
 * A pass is granted from ONE path: grant_pass(), idempotent on the Checkout
 * session id, so the same event twice, or `completed` then
 * `async_payment_succeeded` for one session, grants once. Delayed payment
 * methods (SEPA debit, bank transfer) finish the session unpaid and confirm
 * later with `checkout.session.async_payment_succeeded`, which used to be
 * ignored: the traveller paid and never got the pass.
 */

/**
 * { action, session? }
 *   'grant'    call grant_pass for this session
 *   'pending'  completed but not paid yet: wait for the async event
 *   'failed'   the async payment failed: log it, grant nothing
 *   'ignore'   any other event: acknowledge so Stripe stops retrying
 */
export function eventAction(event) {
  const type = event?.type;
  const session = event?.data?.object;
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (session?.payment_status === 'paid') return { action: 'grant', session };
    return { action: 'pending', session };
  }
  if (type === 'checkout.session.async_payment_failed') return { action: 'failed', session };
  return { action: 'ignore' };
}

/**
 * The rpc arguments of a grant, or null when the session names no user or
 * tier (retrying will not add them, so the caller answers 200).
 * `paidTiers` is PAID_TIERS from passes.mjs.
 */
export function grantArgs(session, paidTiers) {
  const userId = session?.client_reference_id || session?.metadata?.user_id || '';
  const tier = session?.metadata?.tier || '';
  if (!userId || !paidTiers.includes(tier)) return null;
  return { userId, tier, sessionId: session.id };
}
