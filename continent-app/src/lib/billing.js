/**
 * billing.js, the yearly plan's controls in the browser (T460).
 *
 * Every call goes to the billing Edge Function, which finds the traveller's
 * own subscription from the account; the browser only names the action.
 * Each answers { ok, code } and never throws, so the Account panel can say
 * in one line what went wrong.
 */
import { supabase } from './supabaseClient.js';

async function call(action) {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  try {
    const { data, error } = await supabase.functions.invoke('billing', { body: { action } });
    if (error) {
      let code = 'stripe_error';
      try { const body = await error.context?.json?.(); if (body?.code) code = body.code; } catch { /* not JSON */ }
      return { ok: false, code };
    }
    return { ok: true, ...data };
  } catch {
    return { ok: false, code: 'network' };
  }
}

/** Opens Stripe's Customer Portal (card, invoices) in this tab. */
export async function openBillingPortal() {
  const res = await call('portal');
  if (res.ok && res.url) window.location.assign(res.url);
  return res;
}

/** Cancels the yearly plan at the end of the paid year. */
export const cancelYearly = () => call('cancel');

/** Takes a cancel back before the year ends. */
export const resumeYearly = () => call('resume');
