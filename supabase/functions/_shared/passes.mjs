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
 * changing hands. The same page makes the test explicit, that Gemini API
 * access counts as a Paid Service only when it is reached through a Cloud
 * Project with an active Cloud Billing account. So attaching billing IS the
 * compliance step, and it does not by itself produce a bill. Two consequences
 * follow:
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
 *
 * HOW TO PROVE IT. The posture is a claim about a Google Cloud project, not
 * about this repository, so nothing here can assert it. Check it against the
 * project that issued GEMINI_API_KEY:
 *
 *   gcloud billing projects describe PROJECT_ID
 *
 * and read `billingEnabled: true` plus a `billingAccountName`. The console
 * equivalent is Billing, then Account management, with the project listed
 * under the linked account. Re-check after any key rotation, because a new key
 * can come from a different project.
 *
 * Migration 006's header still says the project must NEVER have billing
 * attached. That sentence is superseded by this one and by the 007 header; it
 * is left in place because an applied migration is a historical record.
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

/**
 * Record a quota refusal, so the admin panel can count them.
 *
 * A refusal writes nothing anywhere on its own: ai_consume returns the status,
 * the caller turns it into a 429 and the fact is gone. That makes the two
 * counts unrecoverable after the fact, because ai_usage sitting exactly at a
 * cap looks identical whether nobody asked again or a hundred people did. The
 * two mean opposite things. user_cap refusals are demand for a pass. global_cap
 * refusals are the shared daily ceiling set too low, and whoever hit one got an
 * error for a generation they had already paid for.
 *
 * Best-effort and never awaited by the caller's happy path: telemetry must not
 * be able to fail or slow a traveller's request. Table is public.ai_cap_events,
 * migration 030. No user id, deliberately; who is at their cap is already
 * readable from the ledger, and this table only has to answer how often and to
 * whom by tier.
 */
export function logCapRejection(service, reason, kind, tier) {
  if (reason !== 'user_cap' && reason !== 'global_cap') return;
  try {
    service.from('ai_cap_events')
      .insert({ reason, kind, tier: tier || null })
      .then(() => {}, () => {});
  } catch { /* telemetry never fails a request */ }
}

/**
 * Record which model produced a generation (public.ai_model_events, migration
 * 028), without making the traveller wait for it.
 *
 * T038 meant this to be fire-and-forget but plan-day awaited the insert, so
 * every plan paid one database round trip for telemetry (T300-r). This helper
 * starts the insert and returns at once. The insert still runs to completion:
 * `waitUntil` is the Supabase Edge runtime's EdgeRuntime.waitUntil, which keeps
 * the worker alive after the response is sent, and a failure is logged with
 * console.error so a broken table shows up in the function logs rather than
 * silently. It never throws and never rejects.
 */
export function logModelEvent(service, row, waitUntil) {
  try {
    const p = Promise.resolve(service.from('ai_model_events').insert(row)).then(
      (res) => {
        if (res && res.error) console.error('ai_model_events insert failed:', res.error.message || res.error);
      },
      (e) => console.error('ai_model_events insert threw:', e && e.message ? e.message : e),
    );
    if (typeof waitUntil === 'function') waitUntil(p);
  } catch (e) {
    console.error('ai_model_events log failed:', e && e.message ? e.message : e);
  }
}

/* ── The yearly plan (T460, migration 053). ──
 *
 * The Year Pass is sold as a Stripe subscription that renews every year; the
 * Trip Pass stays a one-off payment. These helpers turn Stripe objects into
 * the arguments the database functions take, kept here (pure, no Stripe or
 * Deno import) so scripts/billing tests can check them in node.
 */

/** The tiers sold as a subscription rather than a one-off payment. */
export const RECURRING_TIERS = ['year'];

/** Checkout mode for a tier. */
export function checkoutModeFor(tier) {
  return RECURRING_TIERS.includes(tier) ? 'subscription' : 'payment';
}

/** The withdrawal waiver text for the checkbox Stripe shows (custom_text). */
export function waiverText(tier, termsUrl) {
  const terms = `Carta's [terms of service](${termsUrl}) say what a plan buys and how refunds work.`;
  if (RECURRING_TIERS.includes(tier)) {
    return 'I ask Carta to start my yearly plan as soon as this payment completes, and I understand '
      + 'that I then lose my 14-day right of withdrawal under EU consumer law. The plan renews every '
      + `year at the same price until I cancel, which I can do at any time in Account. ${terms}`;
  }
  return 'I ask Carta to start my pass as soon as this payment completes, and I understand that I '
    + `then lose my 14-day right of withdrawal under EU consumer law. ${terms}`;
}

const id = (v) => (typeof v === 'string' ? v : v?.id || '');

/**
 * Whether a paid invoice grants a year, and with what. The first invoice
 * (subscription_create) and every renewal (subscription_cycle) grant; a
 * proration or a manual invoice does not. The user and tier ride on the
 * subscription's metadata, written at checkout.
 */
export function grantFromInvoice(invoice, subscription) {
  if (!invoice || invoice.status !== 'paid') return { grant: false, why: 'unpaid' };
  const reason = invoice.billing_reason || '';
  if (reason !== 'subscription_create' && reason !== 'subscription_cycle') {
    return { grant: false, why: `billing_reason ${reason || 'none'}` };
  }
  const meta = subscription?.metadata || invoice.subscription_details?.metadata
    || invoice.parent?.subscription_details?.metadata || {};
  const userId = meta.user_id || '';
  const tier = meta.tier || '';
  if (!userId || !RECURRING_TIERS.includes(tier)) return { grant: false, why: 'missing user or tier' };
  const gate = /^[A-Za-z]{1,32}$/.test(String(meta.reason || '')) ? meta.reason : null;
  return {
    grant: true,
    first: reason === 'subscription_create',
    args: {
      p_user: userId,
      p_tier: tier,
      // The invoice id is the idempotency key: a replayed invoice.paid is a
      // no-op in grant_pass, as a replayed checkout session always was.
      p_session_id: invoice.id,
      p_customer_id: id(invoice.customer) || null,
      p_buyer_country: invoice.customer_address?.country || null,
      p_amount_cents: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : null,
      p_currency: invoice.currency || null,
      p_reason: reason === 'subscription_create' ? gate : 'renewal',
    },
  };
}

/** The subscription's state as set_subscription_state takes it. */
export function stateFromSubscription(sub) {
  const meta = sub?.metadata || {};
  const end = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
  return {
    p_user: meta.user_id || '',
    p_subscription_id: sub?.id || '',
    p_status: sub?.status || null,
    p_cancel_at_period_end: !!sub?.cancel_at_period_end,
    p_current_period_end: typeof end === 'number' ? new Date(end * 1000).toISOString() : null,
    p_customer_id: id(sub?.customer) || null,
  };
}
