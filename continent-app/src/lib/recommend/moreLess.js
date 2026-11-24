/**
 * moreLess.js, "More like this / Less like this" on a trip card (G12 plan
 * rethink, lane R4; explore-recommendations.md Part 3). Both are for this
 * trip's list only, kept for the visit, never written to the account and
 * never an edit of the travel style (the Style Studio stays the only
 * editor; a hint links there).
 *
 *   likeThis(anchor, trips)      the trips most like the anchor (country,
 *                                shape, price band: diversify.similarity)
 *   lessOrder(trips, less)       the list with a soft, capped penalty for
 *                                what was marked less: one mark moves
 *                                nothing, three similar ones lower the group;
 *                                never a filter
 *   lessHint(less)               a country or a shape marked less three
 *                                times, for the Style Studio hint
 *
 * Pure: tests/recommendMoreLess.test.mjs.
 */
import { priceBands, similarity } from './diversify.js';

/** Trips shown in the "Like <name>" row. */
export const LIKE_MAX = 4;
/** A trip at least this similar counts as like the anchor (country alone is 0.5). */
export const LIKE_MIN = 0.5;
/** Marks of a similar kind before the penalty starts. */
export const LESS_FROM = 3;
/** Places a trip moves down per similar mark from LESS_FROM on, and the cap. */
export const LESS_STEP = 3;
export const LESS_CAP = 9;

/** What a mark remembers of a trip: enough to compare, nothing more. */
export const markOf = (trip) => ({ id: trip.id, iso2: trip.iso2 || '', shape: trip.shape || '' });

/** The trips most like the anchor, most similar first, then in list order. */
export function likeThis(anchor, trips, { max = LIKE_MAX } = {}) {
  if (!anchor) return [];
  const pool = (trips || []).filter((x) => x && x.id !== anchor.id);
  const bands = priceBands([anchor, ...pool]);
  return pool
    .map((x, i) => ({ x, i, s: similarity(anchor, x, bands) }))
    .filter((r) => r.s >= LIKE_MIN)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((r) => r.x);
}

/** How many marks share this trip's country, and how many its shape. */
function similarMarks(trip, less) {
  let country = 0;
  let shape = 0;
  for (const m of less) {
    if (m.id === trip.id) continue;
    if (m.iso2 && m.iso2 === trip.iso2) country += 1;
    if (m.shape && m.shape === trip.shape) shape += 1;
  }
  return Math.max(country, shape);
}

/** The places a trip moves down for the marks: 0 below LESS_FROM, capped. */
export function lessPenalty(trip, less = []) {
  const n = similarMarks(trip, less);
  return n >= LESS_FROM ? Math.min(LESS_CAP, LESS_STEP * (n - LESS_FROM + 1)) : 0;
}

/** The list with each trip moved down by its penalty; stable otherwise. */
export function lessOrder(trips, less = []) {
  if (!less.length) return trips;
  return trips
    .map((x, i) => ({ x, i, k: i + lessPenalty(x, less) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((r) => r.x);
}

/** { kind: 'country', iso2 } or { kind: 'shape', shape } once three marks share it; else null. */
export function lessHint(less = []) {
  const count = (key) => less.reduce((m, x) => (x[key] ? m.set(x[key], (m.get(x[key]) || 0) + 1) : m), new Map());
  for (const [iso2, n] of count('iso2')) if (n >= LESS_FROM) return { kind: 'country', iso2 };
  for (const [shape, n] of count('shape')) if (n >= LESS_FROM) return { kind: 'shape', shape };
  return null;
}
