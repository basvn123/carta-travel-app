/**
 * Pricing the trip finder's candidates a slice at a time (T867), so the
 * searching screen can show the best trips priced so far under its stages
 * while the rest are priced. Pure apart from the frame it yields to: the
 * result is the list buildTrips (lib/recommend/trips.js) gives for the
 * same input, in candidate order, memoised per catalogue and answer set
 * (trips.js answerKey), so the screen opened again prices nothing.
 */
import { answerKey, priceCandidate } from '../../lib/recommend/trips.js';
import { buildCandidates } from '../../lib/recommend/candidates.js';

/** Yield to the browser so what was priced is painted before the next slice. */
const nextFrame = () => new Promise((r) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(r, 0));
  else setTimeout(r, 0);
});

/** The data the engine prices with: trips.js quoteData, built once a run. */
function quoteDataOf(input) {
  const { data, flights, origin } = input;
  return {
    ...data,
    flights: flights || null,
    meta: { ...(data?.meta || {}), selected_origin: origin?.iata || data?.meta?.selected_origin || null },
  };
}

// The priced trips per catalogue and answer set (trips.js answerKey), so
// the screen opened again with the same answers prices nothing.
const PRICED = new WeakMap();
const PRICED_SIZE = 8;
const pricedFor = (data) => {
  let m = PRICED.get(data);
  if (!m) PRICED.set(data, (m = new Map()));
  return m;
};

/** How long one pricing slice may run before the browser paints (ms). */
const SLICE_MS = 32;
/** How many of the trips priced so far show under the stages. */
export const EARLY = 3;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Every candidate priced, a slice at a time: after each slice the trips
 * priced so far go to `onSome(priced, pending)` (the caller ranks them;
 * `pending` the candidates not priced yet), then the browser paints.
 * `order(candidates)` gives the indexes to price first (G12 early results:
 * the best reachable trips first, so rank 1 settles early). Resolves to the
 * priced trips in candidate order, the same list buildTrips gives whatever
 * the order; null when `alive()` turned false.
 */
export async function priceInSlices(input, { alive = () => true, onSome = null, yieldFrame = nextFrame, sliceMs = SLICE_MS, order = null } = {}) {
  const memo = input.data && typeof input.data === 'object' ? pricedFor(input.data) : null;
  const key = answerKey(input);
  if (memo?.has(key)) return memo.get(key);
  const candidates = buildCandidates(input);
  const qdata = quoteDataOf(input);
  const seq = order ? order(candidates) : candidates.map((_, i) => i);
  const byIndex = new Array(candidates.length);
  const priced = [];
  let start = now();
  for (let n = 0; n < seq.length; n++) {
    const trip = priceCandidate(candidates[seq[n]], input, qdata);
    byIndex[seq[n]] = trip;
    priced.push(trip);
    if (n < seq.length - 1 && now() - start > sliceMs) {
      onSome?.(priced.slice(), seq.slice(n + 1).map((i) => candidates[i]));
      await yieldFrame();
      if (!alive()) return null;
      start = now();
    }
  }
  const out = byIndex.filter(Boolean);
  if (memo) {
    if (memo.size >= PRICED_SIZE) memo.delete(memo.keys().next().value);
    memo.set(key, out);
  }
  return out;
}
