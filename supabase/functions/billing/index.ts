/**
 * billing, the yearly plan's own door (T460).
 *
 * Three actions for the signed-in traveller, on their own subscription only:
 *
 *   portal  a Stripe Customer Portal session: card, invoices, cancel there too
 *   cancel  cancel at the end of the paid year; nothing more is charged and the
 *           plan runs to its end (German BGB 312k asks for a cancel button that
 *           works online and at once; this is that button's server half)
 *   resume  undo a cancel before the year ends
 *
 * The subscription is found from the account, never from the request: the
 * browser sends an action word and nothing else. cancel and resume write the
 * new state straight to entitlements through set_subscription_state, so the
 * Account panel shows it at once; the webhook's subscription.updated event
 * writes the same state again a moment later.
 *
 * Needs migration 053. Secrets: STRIPE_SECRET_KEY, BILLING_RETURN_URL
 * (optional, defaults to the app's origin with ?billing=back),
 * SUPABASE_SERVICE_ROLE_KEY (set by the platform). Deploy with JWT
 * verification on (the default): only signed-in travellers call it.
 */
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { stateFromSubscription } from '../_shared/passes.mjs';

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

  const authed = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user) return json(401, { code: 'auth' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { code: 'bad_json' }); }
  const action = String(body.action || '');
  if (!['portal', 'cancel', 'resume'].includes(action)) return json(400, { code: 'bad_action' });

  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: ent, error: entErr } = await service
    .from('entitlements')
    .select('stripe_customer_id, subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (entErr) return json(503, { code: 'state_read', message: entErr.message });

  const stripe = new Stripe(SECRET, { apiVersion: '2025-10-29.clover' });

  try {
    if (action === 'portal') {
      if (!ent?.stripe_customer_id) return json(404, { code: 'no_customer' });
      const session = await stripe.billingPortal.sessions.create({
        customer: ent.stripe_customer_id,
        return_url: env('BILLING_RETURN_URL') || `${req.headers.get('origin') || new URL(req.url).origin}/?billing=back`,
      });
      return json(200, { url: session.url });
    }

    if (!ent?.subscription_id) return json(404, { code: 'no_subscription' });
    // The subscription must be this account's before anything changes: the
    // metadata was written at checkout with the buyer's id.
    const current = await stripe.subscriptions.retrieve(ent.subscription_id);
    if (current.metadata?.user_id && current.metadata.user_id !== user.id) return json(403, { code: 'not_yours' });
    const sub = await stripe.subscriptions.update(ent.subscription_id, {
      cancel_at_period_end: action === 'cancel',
    });
    const args = stateFromSubscription(sub);
    await service.rpc('set_subscription_state', { ...args, p_user: user.id });
    return json(200, {
      status: sub.status,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      renewsAt: args.p_current_period_end,
    });
  } catch (err) {
    return json(502, { code: 'stripe_error', message: (err as Error).message });
  }
});
