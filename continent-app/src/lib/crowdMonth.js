// T649: what the Crowds stat and the Explore quiet flag say, from one rule.
// The tier scale is the annual one (crowding.tier): 0 quiet, 1 moderate,
// 2 busy, 3 crowded. dest.crowding.monthly = { share[12], tier[12], ... }
// (pipeline, T649: the month's tier combines the place's annual pressure with
// its own seasonality).

import { busiestMonth } from './when.js';

export const CROWD_TIER_KEYS = ['crowd.quiet', 'crowd.moderate', 'crowd.busy', 'crowd.crowded'];

const validTier = (n) => Number.isInteger(n) && n >= 0 && n <= 3;

/**
 * The crowd answer for the traveller's `when`:
 *   { kind: 'tier', tier, month }            one month's tier word
 *   { kind: 'pattern', quiet:[m], busy:[m] } any time, from the monthly series
 *   { kind: 'flat', tier }                   any time, the same all year
 *   null                                     no data for the question: NotYet
 * A month asked for without a monthly series is null, never the annual tier
 * dressed as that month's.
 */
export function crowdFor(crowding, when) {
  if (!crowding) return null;
  const mo = crowding.monthly;
  const tiers = Array.isArray(mo?.tier) && mo.tier.length === 12 && mo.tier.every(validTier) ? mo.tier : null;
  if (!when || when.kind === 'any') {
    if (!tiers) return validTier(crowding.tier) ? { kind: 'flat', tier: crowding.tier } : null;
    const lo = Math.min(...tiers);
    const hi = Math.max(...tiers);
    if (lo === hi) return { kind: 'flat', tier: lo };
    const at = (v) => tiers.map((x, i) => (x === v ? i + 1 : 0)).filter(Boolean);
    return { kind: 'pattern', quiet: at(lo), busy: at(hi) };
  }
  if (!tiers) return null;
  const month = busiestMonth(when, mo.share) ?? when.month;
  return { kind: 'tier', tier: tiers[month - 1], month };
}

/** The tier the Explore quiet flag judges: the chosen month's, else the
 *  yearly one. null when there is no data. */
export function crowdTierFor(crowding, when) {
  if (!crowding) return null;
  if (!when || when.kind === 'any') {
    // No month: the place's yearly level, as the card always read it.
    if (validTier(crowding.tier)) return crowding.tier;
    const c = crowdFor(crowding, when);
    return c && c.kind === 'flat' ? c.tier : null;
  }
  const c = crowdFor(crowding, when);
  return c && c.kind === 'tier' ? c.tier : null;
}

/** The "Not crowded" flag: quiet or moderate in the month (annual when no
 *  month). Missing data never passes. */
export const QUIET_MAX_TIER = 1;
export function quietFor(crowding, when) {
  // A month without a monthly series falls back to the yearly level, so the
  // flag does not empty the list before the data lands (the stat says NotYet).
  const tier = crowdTierFor(crowding, when) ?? crowdTierFor(crowding, null);
  return tier != null && tier <= QUIET_MAX_TIER;
}
