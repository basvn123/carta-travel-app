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
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_TRIP, STRIPE_PRICE_YEAR,
 * CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL.
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

  const stripe = new Stripe(SECRET, { apiVersion: '2025-10-29.clover' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      // The webhook grants the pass off these two, so they are the load-
      // bearing part of the whole flow. client_reference_id survives even if
      // metadata is dropped by an intermediary.
      client_reference_id: user.id,
      metadata: { user_id: user.id, tier },
      payment_intent_data: { metadata: { user_id: user.id, tier } },
      customer_email: user.email || undefined,
      automatic_tax: { enabled: true },
      // Required for automatic_tax to resolve a rate for digital goods: the
      // rate follows where the CUSTOMER is, not where we are.
      billing_address_collection: 'required',
      success_url: env('CHECKOUT_SUCCESS_URL') || `${new URL(req.url).origin}/?pass=ok`,
      cancel_url: env('CHECKOUT_CANCEL_URL') || `${new URL(req.url).origin}/?pass=cancel`,
      // A dead session should not hold a price quote open forever.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    return json(200, { url: session.url, id: session.id });
  } catch (err) {
    return json(502, { code: 'stripe_error', message: (err as Error).message });
  }
});
