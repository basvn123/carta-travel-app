/**
 * early.js, early results (G12 plan rethink, owner decision 2026-11-25,
 * "Show results early"). On an emulated phone (4x CPU) the finder took 7.7
 * to 10.9 s to show rank 1, because the list waited for every trip to be
 * priced. Now a card shows as soon as no trip still to be priced can take
 * its slot, and it never moves after that.
 *
 *   pricingOrder(bounds)                 candidate indexes, the best reachable first
 *   pinTop(pool, pending, opts)          the ids of the top cards that are settled
 *
 * Settled means proven, not guessed: a priced trip's score is known except
 * for priorityPull (rank.js pullRoom); a trip still to be priced is bounded
 * by rank.js candidateBound. Rank 1 is settled when it beats every other
 * trip at its worst against theirs at their best, in rankTrips' order
 * (qualified, priced, not been, score). Each next slot of the diverse top
 * set (diversify.js, MMR) is settled the same way: the pick's worst MMR value
 * beats every other trip's best, with the price band counted against it.
 *
 * The rule for a later trip (G12): a card on screen keeps its slot. If a
 * trip that comes later would have beaten it (by the bounds above none
 * priced later can; a skipped trip brought back with "Show them again"
 * can), it goes to the slots, rows or list below and never displaces a
 * shown card. diversify.js `pinned` keeps the shown cards first when the
 * list is complete.
 * Pure: tests/recommendEarly.test.mjs.
 */
import { DIVERSE, similarity } from './diversify.js';

// Float sums in a different order differ in the last bits; a settled pick
// must win by more than that.
const EPS = 1e-9;

const leavesOut = (trip) => Array.isArray(trip.slots) && trip.slots.some((s) => s.eur == null && s.id !== 'activities');

/** Candidate indexes in the order to price them: qualified, not been, then the best reachable score. */
export function pricingOrder(bounds) {
  return bounds
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (Number(y.b.qualified) - Number(x.b.qualified)) || (Number(x.b.been) - Number(y.b.been)) || (y.b.hi - x.b.hi) || (x.i - y.i))
    .map((x) => x.i);
}

/** One entry per trip: a priced one from the ranked pool, or a bound of one still to price. */
function entries(pool, pending, room) {
  const priced = pool.map((x) => {
    const base = (Number.isFinite(x.score) ? x.score : 0) - (x.shift || 0);
    return {
      id: x.id, trip: x, qualified: x.qualified !== false, unpriced: Boolean(x.unpriced), been: Boolean(x.been),
      lo: base - room, hi: base + room, banded: !leavesOut(x),
    };
  });
  const later = pending.map((b) => ({ id: b.id, trip: null, qualified: b.qualified !== false, unpriced: null, been: Boolean(b.been), lo: b.lo, hi: b.hi, banded: true }));
  return [...priced, ...later];
}

/** True when `a` (priced) stays ahead of `b` however the rest is priced (rankTrips' sort). */
function beats(a, b) {
  if (a.qualified !== b.qualified) return a.qualified;
  // A trip still to price may turn out fully priced (its best case).
  const bUnpriced = b.unpriced ?? false;
  if (a.unpriced !== bUnpriced) return !a.unpriced;
  if (a.been !== b.been) return !a.been;
  return a.lo > b.hi + EPS;
}

/**
 * The ids of the top cards that no trip still to price can change, in their
 * slot order, starting from the ones already `pinned`.
 *   pool     the trips priced so far, ranked (rankTrips) and filtered as the
 *            list shows them (ceiling, skipped)
 *   pending  candidateBound() of every trip not yet priced
 *   opts     { pinned (ids), room (rank.js pullRoom), k, lambda, weights }
 */
export function pinTop(pool, pending, { pinned = [], room = 0, k = DIVERSE.k, lambda = DIVERSE.lambda, weights = DIVERSE.weights } = {}) {
  if (!Number.isFinite(room)) return pinned.slice();
  const all = entries(pool || [], pending || [], room);
  const byId = new Map(all.map((e) => [e.id, e]));
  const picks = pinned.map((id) => byId.get(id)).filter((e) => e?.trip);
  const out = picks.map((e) => e.id);
  if (!picks.length) {
    const first = all.find((e) => e.trip);
    if (!first || !all.every((e) => e === first || beats(first, e))) return out;
    picks.push(first);
    out.push(first.id);
  }
  // A price band (the list's thirds) moves while trips are priced, so a
  // shared band is counted against the pick and never against a rival.
  const plain = { ...weights, band: 0 };
  const near = (e, withBand) => Math.max(...picks.map((p) => similarity(e.trip, p.trip, new Map(), plain)
    + (withBand && e.banded && p.banded ? weights.band : 0)));
  // A trip still to price is held as alike to no pick (its best case), which
  // only makes the test stricter.
  while (picks.length < k) {
    const left = all.filter((e) => !picks.includes(e));
    if (!left.length) break;
    const anyQualified = left.some((e) => e.qualified);
    const open = anyQualified ? left.filter((e) => e.qualified) : left;
    let best = null;
    let bestLo = -Infinity;
    for (const e of open) {
      if (!e.trip) continue;
      const lo = (1 - lambda) * e.lo - lambda * near(e, true);
      if (lo > bestLo) { bestLo = lo; best = e; }
    }
    if (!best) break;
    const rivalHi = Math.max(-Infinity, ...open.filter((e) => e !== best).map((e) => (1 - lambda) * e.hi - lambda * (e.trip ? near(e, false) : 0)));
    if (!(bestLo > rivalHi + EPS)) break;
    picks.push(best);
    out.push(best.id);
  }
  return out;
}
