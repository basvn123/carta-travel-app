/**
 * checkout, the Edge Function that opens a Stripe Checkout session for a pass.
 *
 * Both passes are ONE-OFF payments, including the Year Pass. That is
 * deliberate: a Year Pass is 365 days of access bought once, not a
 * subscription that renews itself. Nobody is auto-charged, nobody has to
 * remember to cancel, and the "forgot to cancel" revenue that funds a lot of
 * subscription apps is revenue this product chooses not to take.
 *
 * The price is NEVER read from the client. The browser sends a tier id and
 * nothing else; the amount comes from the Stripe Price object named by
 * STRIPE_PRICE_TRIP / STRIPE_PRICE_YEAR. A tampered request can therefore ask
 * to buy the wrong tier, but it can never set its own price.
 *
 * VAT: Stripe Tax is switched on in automatic_tax so the correct rate is
 * applied per member state once the EUR 10,000 cross-border threshold is
 * crossed. Below that threshold, place of supply stays in the home member
 * state (Article 59c of the VAT Directive), which is where a low-volume
 * launch sits. Leaving automatic tax on from day one costs 0.5% per
 * transaction and means the threshold being crossed is not an incident.
 *
 * WITHDRAWAL WAIVER (T013). A pass is digital content that starts the moment
 * payment lands, so under the Consumer Rights Directive (Art 16(m), Belgian
 * Code of Economic Law Book VI) the 14-day right of withdrawal only ends if
 * the buyer expressly asks for immediate supply and acknowledges the loss.
 * Without that acknowledgement every pass is refundable for 14 days. Stripe
 * Checkout collects it as a required checkbox (consent_collection), and the
 * checkbox text is ours (custom_text.terms_of_service_acceptance), so the
 * traveller ticks the waiver itself and not a generic "I agree".
 *
 * Stripe renders that checkbox only when a Terms of Service URL is set in the
 * Dashboard (Settings > Business > Public details), and REJECTS the session
 * otherwise. CHECKOUT_TERMS_URL gates the whole block for that reason: a
 * redeploy before the Dashboard is configured must not break checkout. Set
 * it to the same address as the Dashboard field (the app serves the terms at
 * /?legal=terms) once that field is filled in, and checkout starts asking.
 *
 * THE GATE REASON (T265, register row T034-c). The browser may also send
 * `reason`, the paywall gate that opened the pass modal (GATES in
 * hooks/usePaywall.jsx). It is letters only, at most 32, and it goes into
 * the session metadata so the webhook can write it on pass_grants.reason,
 * which gives admin_paywall_funnel a join key instead of a one-hour
 * nearest-checkout estimate. It decides nothing about the sale.
 *
 * THE HORIZON (T265, register row T031-c). Before a session is opened,
 * pass_can_buy (migration 044) is asked whether a grant would extend the
 * pass at all. A pass already three years out gains nothing from another
 * purchase, and charging for nothing is worse than refusing, so the answer
 * is 409 pass_max and the modal says to come back nearer the time. The RPC
 * runs on the service role; a database that lacks it answers 503 so the
 * deploy order (paste 044 first) fails loudly rather than charging blind.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_TRIP, STRIPE_PRICE_YEAR,
 * CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL, CHECKOUT_TERMS_URL,
 * SUPABASE_SERVICE_ROLE_KEY (set by the platform).
 */
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PAID_TIERS, stripePriceFor } from '../_shared/passes.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { code: 'method' });

  const env = (k: string) => Deno.env.get(k) || '';
  const SECRET = env('STRIPE_SECRET_KEY');
  if (!SECRET) return json(503, { code: 'no_stripe' });

  // Buying requires an account: the pass is granted to a user id, so there
  // has to be one to grant it to.
  const authed = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { code: 'auth' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { code: 'bad_json' }); }

  const tier = String(body.tier || '');
  if (!PAID_TIERS.includes(tier)) return json(400, { code: 'bad_tier' });
  const price = stripePriceFor(tier, env);
  if (!price) return json(503, { code: 'no_price' });
  // Attribution only. Anything that is not a plain gate word is dropped, not
  // rejected: a malformed reason must never cost somebody a purchase.
  const rawReason = typeof body.reason === 'string' ? body.reason : '';
  const reason = /^[A-Za-z]{1,32}$/.test(rawReason) ? rawReason : '';

  // Would a grant extend this pass at all? Asked on the service role, before
  // Stripe is involved, so nobody pays for days the horizon takes away.
  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: can, error: canErr } = await service.rpc('pass_can_buy', {
    p_user: user.id, p_tier: tier,
  });
  if (canErr) return json(503, { code: 'quota_check', message: canErr.message });
  if (can && can.reason === 'bad_tier') return json(400, { code: 'bad_tier' });
  if (!can || can.ok !== true) {
    return json(409, { code: 'pass_max', expiresAt: can?.expiresAt || null });
  }

  const stripe = new Stripe(SECRET, { apiVersion: '2025-10-29.clover' });

  // The waiver checkbox. Off until the Terms URL is configured, see the header.
  const termsUrl = env('CHECKOUT_TERMS_URL');
  const consent = termsUrl ? {
    consent_collection: { terms_of_service: 'required' as const },
    custom_text: {
      terms_of_service_acceptance: {
        message: 'I ask Carta to start my pass as soon as this payment completes, '
          + 'and I understand that I then lose my 14-day right of withdrawal under '
          + `EU consumer law. Carta's [terms of service](${termsUrl}) say what a `
          + 'pass buys and how refunds work.',
      },
    },
  } : {};

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      // The webhook grants the pass off these two, so they are the load-
      // bearing part of the whole flow. client_reference_id survives even if
      // metadata is dropped by an intermediary.
      client_reference_id: user.id,
      metadata: { user_id: user.id, tier, reason },
      payment_intent_data: { metadata: { user_id: user.id, tier, reason } },
      customer_email: user.email || undefined,
      automatic_tax: { enabled: true },
      // Required for automatic_tax to resolve a rate for digital goods: the
      // rate follows where the CUSTOMER is, not where we are.
      billing_address_collection: 'required',
      success_url: env('CHECKOUT_SUCCESS_URL') || `${new URL(req.url).origin}/?pass=ok`,
      cancel_url: env('CHECKOUT_CANCEL_URL') || `${new URL(req.url).origin}/?pass=cancel`,
      // A dead session should not hold a price quote open forever.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      ...consent,
    });
    return json(200, { url: session.url, id: session.id });
  } catch (err) {
    return json(502, { code: 'stripe_error', message: (err as Error).message });
  }
});
