/**
 * paywallDecision.js: the one entitlement decision (E10, ROADMAP I2, I5, I14;
 * docs/logic/quotas-paywall.md QUOTA-011 to 013). Pure; hooks/usePaywall.jsx
 * only wires it, and flag E10 (config/flags.json, default old) picks it over
 * the old inline rule.
 *
 *   decide(why, snapshot, lastKnownTier) -> 'pass' | 'gate' | 'wait'
 *
 *   snapshot  { signedIn, loading, known, tier } from useEntitlement
 *   pass      the action may go ahead
 *   gate      open the pass sheet
 *   wait      the entitlement is still being read and nothing is known about
 *             this traveller: hold the action, never decide on a guess
 *
 * Owner default 13: an entitlement that cannot be read fails OPEN for a
 * traveller with a known payment (their last read, or this one, was a paid
 * tier) and CLOSED for one who never paid, for the hard gates (export, save,
 * import, calendar, map). The server stays the authority for the metered
 * surfaces (QUOTA-012); this is only the browser's hint.
 */

/** Asked only when an allowance is spent or nearly spent: a pass holder is still asked. */
export const QUOTA_REASONS = new Set(['plans', 'ground', 'plansLow']);

export const isPaidTier = (tier) => !!tier && tier !== 'free';

export function decide(why, snapshot, lastKnownTier = null) {
  const { signedIn, loading, known, tier } = snapshot || {};
  // A guest has nothing to be entitled to.
  if (!signedIn) return 'gate';
  if (known) {
    if (!isPaidTier(tier)) return 'gate';
    return QUOTA_REASONS.has(why) ? 'gate' : 'pass';
  }
  // Unknown. A traveller with a known payment is not locked out by a failed read.
  if (isPaidTier(lastKnownTier)) return QUOTA_REASONS.has(why) ? 'wait' : 'pass';
  // Never paid: a read in flight is waited for, a read that failed fails closed.
  return loading ? 'wait' : 'gate';
}
