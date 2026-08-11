/**
 * checkout.js, the client half of buying a pass.
 *
 * Sends nothing but a tier id. The amount lives in Stripe and is resolved
 * server-side by the checkout Edge Function, so there is no price on the wire
 * for anyone to edit.
 *
 * Resolves to { ok: true } after a redirect has been started, or
 * { ok: false, code } where code is one of: no_auth_config, auth, bad_tier,
 * no_stripe, no_price, stripe_error, network.
 */
import { supabase } from './supabaseClient.js';
import { PAID_TIERS } from './pricing.js';

export async function startCheckout(tier) {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  if (!PAID_TIERS.includes(tier)) return { ok: false, code: 'bad_tier' };
  try {
    const { data, error } = await supabase.functions.invoke('checkout', { body: { tier } });
    if (error) {
      let code = 'stripe_error';
      try {
        const body = await error.context?.json?.();
        if (body?.code) code = body.code;
      } catch { /* non-JSON error body */ }
      return { ok: false, code };
    }
    if (!data?.url) return { ok: false, code: 'stripe_error' };
    // Full-page navigation, not a popup: Stripe Checkout is a hosted page and
    // a blocked popup is the single most common way this flow silently dies.
    window.location.assign(data.url);
    return { ok: true };
  } catch {
    return { ok: false, code: 'network' };
  }
}
