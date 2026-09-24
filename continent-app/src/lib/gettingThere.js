/**
 * gettingThere.js, the rules behind the "Getting there" step.
 *
 * The step itself is a form; what is worth testing is the guessing it does
 * before the traveller touches anything:
 *
 *   which way      a mode per leg, so the step opens already answered rather
 *                  than as five empty questions per hop
 *   which airport  the ones that actually fly somewhere near the first stop,
 *                  and whether flying home from a different one is shorter
 *
 * None of it is binding. Every prefill is a suggestion the traveller overrides
 * with one tap, which is why it is allowed to be opinionated: a wrong guess
 * costs a tap, and no guess costs five.
 */
import { haversineKm } from './nearby.js';

/** Where a train is not an answer, because there is no railway. Mirrors
 *  NO_RAIL in transportLinks.js, which owns the same list for its links. */
const NO_RAIL = new Set(['IS', 'MT', 'CY', 'AD', 'LI', 'MC', 'SM', 'FO']);

/** Past this, nobody is taking the train to the start of a holiday. */
export const FLY_KM = 700;

/**
 * How to travel one leg, before anybody has said.
 *
 * Long means fly. Short means the train, unless one end of the leg is a
 * country with no railway at all, in which case the coach is the honest
 * answer. A traveller who told the quiz they want a road trip, or to get
 * around by car, is driving, and that outranks the distance: driving to
 * Portugal is a choice people make on purpose.
 *
 * `published` is the mode the trip's own composer chose for this hop, and it
 * wins over every rule here for the legs BETWEEN stops: it was computed from
 * the real route, not from a straight line, and pipeline/trips only publishes
 * a mode its estimator agreed exists.
 */
export function prefillMode(leg, { quiz = null, published = '', drivingOwnCar = false } = {}) {
  if (published) return published;
  if (drivingOwnCar) return 'car';
  const wantsCar = quiz?.around === 'car' || (quiz?.types || []).includes('roadtrip');
  if (wantsCar) return 'car';
  const km = legKm(leg);
  if (km != null && km > FLY_KM) return 'fly';
  const noRail = NO_RAIL.has(leg?.from?.iso2 || '') || NO_RAIL.has(leg?.to?.iso2 || '');
  if (noRail) return km != null && km > 300 ? 'fly' : 'bus';
  return 'train';
}

/** The straight-line distance of a leg, or null when an end has no coordinates. */
export function legKm(leg) {
  const a = leg?.from;
  const b = leg?.to;
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;
  const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
  return km == null ? null : Math.round(km);
}

/**
 * Whether flying home from a different airport is worth saying.
 *
 * A trip that ends a long way from where it started has an open jaw in it, and
 * the traveller who books two one-way flights pays less and travels less than
 * the one who returns to the airport they landed at. It is only worth a line
 * when the saving is real, so the second airport has to be both a different
 * one and meaningfully closer to the last stop.
 *
 * Returns {into, home} or null.
 */
export function openJaw(inAirports, outAirports, { minGainKm = 80 } = {}) {
  const into = (inAirports || [])[0];
  const home = (outAirports || [])[0];
  if (!into || !home || into.iata === home.iata) return null;
  // How much further the last stop is from the arrival airport than from its
  // own nearest one. Below the threshold, going back the way you came is
  // simpler and no worse.
  const sameAirportHome = (outAirports || []).find((a) => a.iata === into.iata);
  if (!sameAirportHome) return { into, home };
  return sameAirportHome.km - home.km >= minGainKm ? { into, home } : null;
}

/**
 * The published leg that belongs to the hop between stop i and stop i+1.
 *
 * A trip's legs are not one per gap: a loop closes with a leg home, and a base
 * trip's day trips are not stops at all. So the legs are matched on the stop
 * ids they actually name rather than on their position in the array, and a hop
 * with nothing published comes back null rather than borrowing its neighbour's
 * mode.
 */
export function publishedLeg(detail, fromId, toId) {
  if (!fromId || !toId) return null;
  return (detail?.legs || []).find((l) => l.from === fromId && l.to === toId && !l.home) || null;
}
