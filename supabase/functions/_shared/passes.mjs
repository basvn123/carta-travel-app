/**
 * passes.mjs, the pass layer shared by every Edge Function that spends AI.
 *
 * The authoritative quota numbers live in Postgres (public.plan_tiers, see
 * migration 007_passes.sql) so they can be retuned with an UPDATE. This module
 * holds only what SQL cannot: the Stripe product mapping and the helpers that
 * turn an RPC result into an HTTP answer.
 *
 * BILLING POSTURE (this replaces the zero-billing note in 006). Google's
 * Gemini API Additional Terms, effective 2026-03-23:
 *
 *   "You may use only Paid Services when making API Clients available to
 *    users in the European Economic Area, Switzerland, or the United
 *    Kingdom."
 *
 * Carta serves European travellers, so GEMINI_API_KEY must belong to a Google
 * Cloud project WITH an active billing account. Note what "Paid Services"
 * means: the terms define it by the billing account existing, not by money
 * changing hands, so attaching billing is the compliance step and does not by
 * itself produce a bill. Two consequences follow:
 *
 *   1. Quota caps are now a COST CEILING, not a billing impossibility. An
 *      over-quota call can be charged, so the caps have to actually hold.
 *   2. Grounded search is metered separately (ai_consume kind 'ground'). On
 *      Gemini 3 Google bills per individual search query the model runs, not
 *      per prompt, so one grounded generation can cost several units. It is
 *      the only surface here that reliably costs money and it is paid-tier
 *      only.
 *
 * There is one piece of good news in the same terms: developers established in
 * the EEA get the paid data-use protections extended to unpaid quota, so
 * traveller prompts are not used to train Google's models either way.
 */

/** Tier ids, lowest to highest. Mirrors public.plan_tiers. */
export const TIERS = ['free', 'trip', 'year'];

/** Tiers a customer can actually buy. */
export const PAID_TIERS = ['trip', 'year'];

/**
 * Stripe price ids per tier, injected as secrets so test and live modes do not
 * need separate code. Set STRIPE_PRICE_TRIP / STRIPE_PRICE_YEAR via
 * `supabase secrets set`.
 */
export function stripePriceFor(tier, env) {
  const map = {
    trip: env('STRIPE_PRICE_TRIP'),
    year: env('STRIPE_PRICE_YEAR'),
  };
  return map[tier] || '';
}

/**
 * Spend one unit of `kind` ('plan' | 'ground') for a user.
 *
 * Returns { ok, status, tier, cap, used, left }. `ok` is true only for a
 * genuine grant: a caller that treats a cap as success will hand out free
 * generations, so every call site must branch on it.
 */
export async function consume(service, userId, kind, globalCap) {
  const { data, error } = await service.rpc('ai_consume', {
    p_user: userId, p_kind: kind, p_global_cap: globalCap,
  });
  if (error) return { ok: false, status: 'quota_check', tier: 'free' };
  const r = data || {};
  return { ...r, ok: r.status === 'ok' };
}

/**
 * Hand a unit back. Used when the AI call itself fails after quota was
 * already spent: a traveller must never lose an allowance to our outage.
 * Best-effort by design, a failed refund must not mask the original error.
 */
export async function refund(service, userId, kind) {
  try {
    await service.rpc('ai_refund', { p_user: userId, p_kind: kind });
  } catch { /* the original failure is what matters */ }
}

/** Read-only tier lookup, for deciding what a request is allowed to ask for. */
export async function resolveTier(service, userId) {
  const { data, error } = await service.rpc('ai_status', { p_user: userId });
  if (error || !data || data.error) return null;
  return data;
}
