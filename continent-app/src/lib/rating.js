/**
 * Shared front-end constants + helpers for the traveller rating (schema v14
 * `dest.rating`, produced by rating_layer.py). Keeps the filter slicer, the URL
 * codec and the account sync speaking the same language about the 0-10 score
 * and its Michelin-idiom tiers.
 */

export const RATING_MIN = 0;
export const RATING_MAX = 10;
// A range that imposes no constraint: the whole 0-10 scale.
export const FULL_RATING_RANGE = [RATING_MIN, RATING_MAX];

// Michelin-idiom tier cutoffs, mirroring rating_layer.py TIER_CUTOFFS. The live
// numbers ship in data.meta.rating_model.tier_cutoffs so the UI tracks whatever
// the scoring model used; these are only the fallback when meta is unavailable
// (e.g. the URL/localStorage migration runs before app_data.json has loaded).
export const TIER_CUTOFFS = { 1: 6.9, 2: 7.8, 3: 8.7 };

/** Resolve the tier cutoffs from loaded meta, falling back to the constant. */
export function tierCutoffs(meta) {
  const raw = meta?.rating_model?.tier_cutoffs;
  if (!raw) return TIER_CUTOFFS;
  return {
    1: Number(raw['1']) || TIER_CUTOFFS[1],
    2: Number(raw['2']) || TIER_CUTOFFS[2],
    3: Number(raw['3']) || TIER_CUTOFFS[3],
  };
}

/** Tier (0-3) a given score falls into. */
export function tierForScore(score, cuts = TIER_CUTOFFS) {
  if (!(score >= cuts[1])) return 0;
  if (score >= cuts[3]) return 3;
  if (score >= cuts[2]) return 2;
  return 1;
}

/** True when the band covers the whole scale (so it filters nothing out). */
export function isFullRatingRange(r) {
  return !Array.isArray(r) || r.length !== 2 || (r[0] <= RATING_MIN && r[1] >= RATING_MAX);
}

/** Clamp + order a restored [lo, hi] into the valid 0-10 domain. */
export function clampRatingRange(r) {
  if (!Array.isArray(r) || r.length !== 2) return [...FULL_RATING_RANGE];
  let [lo, hi] = r.map(Number);
  if (!Number.isFinite(lo)) lo = RATING_MIN;
  if (!Number.isFinite(hi)) hi = RATING_MAX;
  lo = Math.max(RATING_MIN, Math.min(RATING_MAX, lo));
  hi = Math.max(RATING_MIN, Math.min(RATING_MAX, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return [lo, hi];
}

/**
 * Map a legacy minimum-tier (1-3) onto the equivalent [cutoff, 10] band, so old
 * shared links / saved accounts still narrow sensibly after the switch from a
 * minimum-tier button list to a range slicer.
 */
export function rangeFromMinTier(minTier, meta) {
  const t = Number(minTier);
  if (!t) return [...FULL_RATING_RANGE];
  const cuts = tierCutoffs(meta);
  const lo = cuts[Math.max(1, Math.min(3, t))] ?? RATING_MIN;
  return [lo, RATING_MAX];
}
