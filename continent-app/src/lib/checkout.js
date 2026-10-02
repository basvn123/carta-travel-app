/**
 * checkout.js, the client half of buying a pass.
 *
 * Sends a tier id and the gate reason, nothing else. The amount lives in
 * Stripe and is resolved server-side by the checkout Edge Function, so there
 * is no price on the wire for anyone to edit. The reason is attribution: the
 * function copies it into the Stripe session, the webhook writes it on the
 * sale, and the funnel joins on it (T265).
 *
 * Resolves to { ok: true } after a redirect has been started, or
 * { ok: false, code } where code is one of: no_auth_config, auth, bad_tier,
 * no_stripe, no_price, pass_max, quota_check, stripe_error, network.
 */
import { supabase } from './supabaseClient.js';
import { PAID_TIERS } from './pricing.js';
import { trackPaywall, markCheckoutRedirect } from './paywallEvents.js';

/**
 * @param {string} tier    the pass being bought
 * @param {string} [reason] the gate that sent them here, for the funnel only.
 *   Carried so "which gate converts" is answerable. Without it a checkout row
 *   has no gate, and the per-gate breakdown can only ever show who was ASKED,
 *   never who paid, which is the half that decides anything.
 */
export async function startCheckout(tier, reason = '') {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  if (!PAID_TIERS.includes(tier)) return { ok: false, code: 'bad_tier' };
  // Intent, not outcome. Recorded before the round trip so a checkout that
  // dies at Stripe still shows up as somebody who tried, which is exactly the
  // gap worth seeing. The purchase itself is recorded by the webhook in
  // pass_grants and is never claimed by this client.
  trackPaywall('checkout', reason, tier);
  try {
    const { data, error } = await supabase.functions.invoke('checkout', {
      body: { tier, reason: reason || '' },
    });
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
    // Marked first, so the pagehide this navigation fires is not counted as
    // a dismissal of the modal that is still standing open (T314).
    markCheckoutRedirect();
    window.location.assign(data.url);
    return { ok: true };
  } catch {
    return { ok: false, code: 'network' };
  }
}
