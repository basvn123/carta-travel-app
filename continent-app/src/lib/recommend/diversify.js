/**
 * diversify.js, the best pick and a top set that differs (G12 plan rethink,
 * lane R1, explore-recommendations.md Part 3).
 *
 * The finder ranks every trip on its own merits (rank.js), so the trips
 * that score best often share a country, a shape and a price band: six
 * weeks in Portugal read as one option. Rank 1 stays the engine's pure best
 * ("Beste keuze"); every next slot of the top set is the trip with the
 * highest score after a penalty for looking like a trip already picked
 * (Maximal Marginal Relevance, Carbonell and Goldstein 1998: relevance minus
 * the closest similarity to what is already shown).
 *
 *   similarity(a, b)  0..1: the same country, the same shape, the same price band
 *   diversify(ranked, opts)    the top k (rank 1 first), a new array
 *   diverseOrder(ranked, opts) the whole list: the top k, then the rest in ranked order
 *   priceBands(trips)          id -> 0 | 1 | 2 (cheap, middle, dear thirds), complete totals only
 *
 * A trip whose total leaves a line out ("Not yet") gets no price band, so
 * it is never called "like" a priced one on price. Unqualified trips (fit
 * first, rank.js qualifies) stay behind the qualified ones, as in the rank.
 * Pure: nothing is priced again, every trip is returned as it came.
 */

/** Weights of one similarity (they sum to 1) and the trade between score and difference. */
export const DIVERSE = Object.freeze({
  k: 6,
  lambda: 0.3,
  weights: Object.freeze({ country: 0.5, shape: 0.25, band: 0.25 }),
});

const leavesOut = (trip) => Array.isArray(trip.slots) && trip.slots.some((s) => s.eur == null && s.id !== 'activities');
const totalOf = (trip) => {
  const g = trip.total?.group;
  if (Number.isFinite(g)) return g;
  const p = trip.total?.perPerson;
  return Number.isFinite(p) ? p : null;
};

/** The price band of each trip with a complete total: the list's thirds. */
export function priceBands(trips) {
  const priced = trips
    .filter((x) => !leavesOut(x) && totalOf(x) != null)
    .map((x) => ({ id: x.id, eur: totalOf(x) }))
    .sort((a, b) => a.eur - b.eur);
  const out = new Map();
  const n = priced.length;
  priced.forEach((x, i) => out.set(x.id, n < 3 ? 1 : Math.min(2, Math.floor((i * 3) / n))));
  return out;
}

/** How alike two trips look to a traveller, 0..1. */
export function similarity(a, b, bands = new Map(), weights = DIVERSE.weights) {
  let s = 0;
  if (a.iso2 && a.iso2 === b.iso2) s += weights.country;
  if (a.shape && a.shape === b.shape) s += weights.shape;
  const ba = bands.get(a.id);
  if (ba != null && ba === bands.get(b.id)) s += weights.band;
  return s;
}

/**
 * The top k of a ranked list: rank 1 as it is, then greedily the trip with
 * the best (1 - lambda) * score - lambda * (closest similarity to a pick).
 *   opts: { k, lambda, weights, pinned (ids shown before pricing ended, kept first) }
 */
export function diversify(ranked, { k = DIVERSE.k, lambda = DIVERSE.lambda, weights = DIVERSE.weights, pinned = [] } = {}) {
  const list = Array.isArray(ranked) ? ranked.filter(Boolean) : [];
  // G12 early results: the cards already on screen (`pinned`, ids in their
  // order) keep their slots; the next slots continue from them.
  const held = pinned.map((id) => list.find((x) => x.id === id)).filter(Boolean);
  if (!held.length && (list.length <= 1 || k <= 1)) return list.slice(0, Math.max(0, k));
  const bands = priceBands(list);
  const picks = held.length ? held : [list[0]];
  const left = list.filter((x) => !picks.includes(x));
  const score = (x) => (Number.isFinite(x.score) ? x.score : 0);
  while (picks.length < k && left.length) {
    // Qualified trips first, as rankTrips orders them: a trip that does not
    // fit the answers never takes a top slot from one that does.
    const qualifiedLeft = left.some((x) => x.qualified !== false);
    let best = -1;
    let bestValue = -Infinity;
    left.forEach((x, i) => {
      if (qualifiedLeft && x.qualified === false) return;
      const near = Math.max(...picks.map((p) => similarity(x, p, bands, weights)));
      const value = (1 - lambda) * score(x) - lambda * near;
      // Ties keep the ranked order (the earlier index wins).
      if (value > bestValue) { bestValue = value; best = i; }
    });
    if (best < 0) break;
    picks.push(left.splice(best, 1)[0]);
  }
  return picks;
}

/** The whole list with its top k diversified and the rest in ranked order. */
export function diverseOrder(ranked, opts = {}) {
  const top = diversify(ranked, opts);
  const ids = new Set(top.map((x) => x.id));
  return [...top, ...(ranked || []).filter((x) => x && !ids.has(x.id))];
}

/** The largest share of one country in the first n trips (the R1 measure). */
export function countryShare(trips, n = DIVERSE.k) {
  const top = (trips || []).slice(0, n);
  if (!top.length) return { share: 0, countries: 0, top: '' };
  const counts = new Map();
  for (const x of top) counts.set(x.iso2 || '?', (counts.get(x.iso2 || '?') || 0) + 1);
  const [iso2, most] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { share: most / top.length, countries: counts.size, top: iso2 };
}
