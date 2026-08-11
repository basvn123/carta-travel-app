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
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
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

  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await service.rpc('grant_pass', {
    p_user: userId,
    p_tier: tier,
    p_session_id: session.id,
    p_customer_id: typeof session.customer === 'string' ? session.customer : null,
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
