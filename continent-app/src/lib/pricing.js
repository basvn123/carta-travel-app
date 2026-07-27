/**
 * pricing.js, the client's view of the pass tiers.
 *
 * DISPLAY ONLY. The server never trusts anything here: quotas are enforced by
 * the ai_consume RPC against public.plan_tiers, and prices come from the
 * Stripe Price objects the checkout function names. This file exists so the
 * UI can render a pricing table without a round trip, and so the numbers in
 * the copy live in one place instead of being scattered through JSX.
 *
 * Keep in step with migration 007_passes.sql. If they drift, the server wins
 * and the traveller sees a price that is not what they get charged, so treat
 * a change here as a change that needs the migration updated too.
 *
 * WHY THESE NUMBERS (pricing review, 2026-07):
 *
 *  - Trip Pass at EUR 6.99, not EUR 3.99. Stripe's fixed EUR 0.25 component is
 *    6.3% of a EUR 3.99 ticket by itself (7.8% all-in) against 5.1% at EUR
 *    6.99, so the cheap price hands a chunk of every sale to the processor for
 *    nothing. It also has to clear a competitive floor: TripIt gives away a
 *    free 30-day trial and Wanderlog's month is about EUR 5.20, so pricing a
 *    30-day pass under both invites the comparison rather than winning it.
 *
 *  - Year Pass stays at EUR 14.99. The ratio is what matters: at 3.76x the
 *    Trip Pass the annual tier was dominated by simply buying two Trip Passes,
 *    which is what a traveller taking two trips a year would rationally do. At
 *    roughly 2.1x it becomes the obvious upgrade, and "two trips and it pays
 *    for itself" is a claim that matches how people actually travel. The
 *    earlier "four trips for the price of one" framing described a segment
 *    that the trip-frequency data does not show existing.
 *
 *  - The earlier EUR 3.99 rationale rested on charm pricing sitting below a
 *    deliberation threshold. The canonical field experiments (Anderson and
 *    Simester 2003) test $9 WHOLE-DOLLAR endings, call the 99-cent evidence
 *    inconclusive, and found that adding sub-dollar precision reduced demand.
 *    So there is no evidence base for .99 specifically, which is why the price
 *    moved on cost grounds instead. PRICE_TEST_ALTERNATIVES below exists
 *    because this is a live A/B question, not a settled one.
 */

/** Tier ids in display order. Mirrors public.plan_tiers.rank. */
export const TIER_ORDER = ['free', 'trip', 'year'];

/**
 * Client mirror of public.plan_tiers.
 *
 * priceCents is what Stripe charges (VAT inclusive for EU consumers).
 * aiPlans / grounded are fair-use ceilings per period, matching the server.
 */
export const TIERS = {
  free: {
    id: 'free',
    priceCents: 0,
    aiPlans: 3,
    grounded: 0,
    periodDays: null, // calendar month
    labelKey: 'pass.freeName',
    blurbKey: 'pass.freeBlurb',
  },
  trip: {
    id: 'trip',
    priceCents: 699,
    aiPlans: 60,
    grounded: 40,
    periodDays: 30,
    labelKey: 'pass.tripName',
    blurbKey: 'pass.tripBlurb',
    featured: true,
  },
  year: {
    id: 'year',
    priceCents: 1499,
    aiPlans: 300,
    grounded: 200,
    periodDays: 365,
    labelKey: 'pass.yearName',
    blurbKey: 'pass.yearBlurb',
  },
};

/**
 * Prices worth testing against the shipped ones. Travel's median conversion
 * rate is among the lowest of any app category, so price sensitivity here is
 * an empirical question rather than something the literature settles: if
 * EUR 6.99 holds conversion the extra margin is free, and if it collapses
 * EUR 4.99 is the compromise. Wire these through Stripe Price objects when
 * running a test; do not edit TIERS in place, or in-flight sessions will
 * disagree with the table the traveller was shown.
 */
export const PRICE_TEST_ALTERNATIVES = { trip: [499, 599, 799] };

/** Tier ids a traveller can buy. */
export const PAID_TIERS = ['trip', 'year'];

/** Money, in the traveller's active locale. Cents in, "EUR 6.99" style out. */
export function formatPrice(cents, locale = 'en-GB', currency = 'EUR') {
  if (!Number.isFinite(cents)) return '';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/**
 * The Year Pass pitch, as a multiple of the Trip Pass, rounded the way the
 * copy says it. Computed rather than hardcoded so the claim in the UI cannot
 * drift away from the prices next to it, which is exactly how a pricing page
 * ends up lying by accident.
 */
export function yearPassTripsEquivalent() {
  const trip = TIERS.trip.priceCents;
  const year = TIERS.year.priceCents;
  if (!trip) return 0;
  return Math.floor(year / trip);
}

/** True once a tier is worth showing an upgrade prompt for. */
export function canUpgrade(tier) {
  return tier !== 'year';
}

/**
 * Days left on a pass, or null when there is no expiry (free tier).
 * Rounds UP, because a pass with six hours left is still a pass you have
 * today, and telling somebody they have "0 days" while it still works reads
 * like a bug.
 */
export function daysLeft(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}
