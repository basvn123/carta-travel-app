/**
 * stripe-webhook, where a completed payment becomes an entitlement.
 *
 * This is the only path that grants a pass. It runs on the service role, and
 * everything it does is funnelled through the grant_pass() RPC (migration
 * 007), which is idempotent on the Checkout session id because Stripe retries
 * webhooks and a retry must not extend somebody's pass a second time.
 *
 * VERIFY BEFORE YOU TRUST. The signature check is not optional: without it
 * this endpoint is an unauthenticated "give me a free pass" API, since anyone
 * can POST JSON at a public function URL. Deno needs the ASYNC verifier
 * (constructEventAsync), the synchronous one uses Node crypto and throws here.
 *
 * IMPORTANT deploy note: this function must be deployed with JWT verification
 * OFF, because Stripe does not send a Supabase JWT.
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 * The Stripe signature is what authenticates the caller instead.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CHECKOUT_TERMS_URL.
 * CHECKOUT_TERMS_URL is read here only to record WHICH terms the buyer
 * accepted, so it must hold the same value the checkout function was deployed
 * with. Unset, passes are still granted and the consent columns stay NULL.
 * Needs migration 025_withdrawal_waiver.sql for those columns.
 *
 * Needs migration 026_oss_threshold.sql for the buyer_country, amount_cents
 * and currency columns (T033). Those three are the VAT record: where the
 * buyer was, what they actually paid, and in what currency. They exist so the
 * cumulative cross-border B2C figure can be counted against the EUR 10,000
 * Article 59c threshold without anyone opening the Stripe Dashboard.
 *
 * DEPLOY ORDER: migration 026 FIRST, then this function. The RPC is called
 * with NAMED arguments, so a call carrying p_buyer_country against a database
 * that still has only the six-argument grant_pass does not silently fall back,
 * it fails to find the function and the grant errors. The 500 that follows
 * makes Stripe retry, so nothing is lost once the migration lands, but a
 * customer holds no pass until it does.
 */
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PAID_TIERS } from '../_shared/passes.mjs';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });

  const env = (k: string) => Deno.env.get(k) || '';
  const SECRET = env('STRIPE_SECRET_KEY');
  const WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET');
  if (!SECRET || !WEBHOOK_SECRET) return new Response('not configured', { status: 503 });

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('no signature', { status: 400 });

  const stripe = new Stripe(SECRET, { apiVersion: '2025-10-29.clover' });

  // The RAW body is what was signed. Parsing it first and re-serializing would
  // change the bytes and every signature would fail.
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`bad signature: ${(err as Error).message}`, { status: 400 });
  }

  // Anything else is acknowledged and ignored, so Stripe stops retrying it.
  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Only a session that is actually paid grants anything. An async payment
  // method can complete the session while payment is still pending, and
  // `payment_status` is the field that knows the difference.
  if (session.payment_status !== 'paid') {
    return new Response(JSON.stringify({ received: true, unpaid: true }), { status: 200 });
  }

  const userId = session.client_reference_id || session.metadata?.user_id || '';
  const tier = session.metadata?.tier || '';
  if (!userId || !PAID_TIERS.includes(tier)) {
    // 200 rather than 400: retrying will not add the missing metadata, and a
    // permanently failing webhook is noise that hides real failures.
    return new Response(JSON.stringify({ received: true, error: 'missing user or tier' }), { status: 200 });
  }

  // THE WITHDRAWAL WAIVER (T032). A pass starts the moment payment lands, so
  // the 14-day right of withdrawal under Article 16(m) of the Consumer Rights
  // Directive only ends if the buyer expressly asked for immediate supply and
  // acknowledged the loss. Stripe collects that as the required checkbox set
  // up in the checkout function, and reports the answer here as
  // consent.terms_of_service = 'accepted'. Consent that is collected and not
  // stored is consent we cannot produce, and a sale we cannot produce it for
  // is refundable for 14 days, so it is recorded against the grant.
  //
  // The Session object carried on checkout.session.completed includes
  // `consent` inline, so no retrieve is needed in the normal case. The
  // fallback exists because the field is only present when
  // consent_collection was configured on the session, and because a future
  // API version could expand it differently. A failed retrieve is swallowed:
  // a missing consent record must never stop a paid customer being granted
  // what they bought.
  let consentTos = session.consent?.terms_of_service || '';
  if (!consentTos && session.consent_collection?.terms_of_service === 'required') {
    try {
      const full = await stripe.checkout.sessions.retrieve(session.id);
      consentTos = full.consent?.terms_of_service || '';
    } catch { /* grant anyway, with no consent on file */ }
  }

  // WHERE THE BUYER WAS (T033). Place of supply for an electronically
  // supplied service to a consumer is the customer's member state, so the
  // country on the billing address is a tax fact and not analytics. It is
  // recorded against the sale because the EUR 10,000 Article 59c threshold is
  // a running total of cross-border B2C sales and can only be computed from a
  // ledger that remembers each one.
  //
  // customer_details.address is present because the checkout function sets
  // billing_address_collection: 'required'. It is read defensively anyway: a
  // session created some other way, or an API version that stops expanding
  // the object, must not cost somebody the pass they paid for. NULL travels
  // down to grant_pass, which stores it as "unknown" and lets
  // admin_oss_threshold count it as a hole in the figure.
  const buyerCountry = session.customer_details?.address?.country || null;

  // What was actually charged, rather than what plan_tiers says the price is.
  // T030 established that plan_tiers.price_cents is decorative and read by no
  // code path, so it records intent. amount_total is the only number that
  // knows about a discount, a coupon or a price that changed between the sale
  // and the report, and a VAT figure has to be built from real amounts.
  //
  // It is VAT inclusive when the Stripe Price tax_behavior is inclusive, which
  // is the intended setting; total_details.amount_tax is the split. Only the
  // gross is stored here, because the threshold is counted on the supply and
  // the tax component is Stripe Tax's own record to keep.
  const amountCents = typeof session.amount_total === 'number' ? session.amount_total : null;
  const currency = session.currency || null;

  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await service.rpc('grant_pass', {
    p_user: userId,
    p_tier: tier,
    p_session_id: session.id,
    p_customer_id: typeof session.customer === 'string' ? session.customer : null,
    p_consent_tos: consentTos || null,
    // The address the checkbox linked, so the stored consent names the text
    // it was given to. Read from the same secret the checkout function used.
    p_consent_terms_url: env('CHECKOUT_TERMS_URL') || null,
    p_buyer_country: buyerCountry,
    p_amount_cents: amountCents,
    p_currency: currency,
  });

  if (error) {
    // 500 so Stripe RETRIES: the customer has paid and holds no pass, which is
    // the one failure here that must not be swallowed.
    return new Response(`grant failed: ${error.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true, granted: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
