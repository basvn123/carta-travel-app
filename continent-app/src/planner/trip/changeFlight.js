/**
 * The flights Change flight offers for one way (T840, owner board panel 6):
 * every flight of the day the live search answered, that fits the trip's
 * flight preferences, cheapest first, each priced for the party the way the
 * trip prices it (legCost plus a baby's lap fee) and against the flight the
 * trip is priced on now. Pure, so the node tests hold it.
 *
 *   answer    the /api/flights answer for that day ({ flights }) or null
 *   current   priced.cartaFlight[dir] (a leg with its cost) or null
 *   prefs     { direct, after, before } or null
 *   party     { paying, babies, bagKey }
 *
 * Returns { rows, known } where a row is { leg, total, delta, current } and
 * `known` is false when only the priced flight is known (no live answer).
 */
import { fitsPrefs, legCost } from '../../lib/flights/flights.js';
import { BABY_LAP_FEE_LEG } from '../../lib/party.js';
import { sameFlight } from '../wizard/flightChoices.js';

const r2 = (n) => Math.round(n * 100) / 100;

export function flightRows({ answer = null, current = null, prefs = null, party = {} } = {}) {
  const { paying = 1, babies = 0, bagKey } = party;
  const lap = babies * BABY_LAP_FEE_LEG;
  const now = current?.cost?.total ?? null;
  const flights = Array.isArray(answer?.flights) ? answer.flights : null;
  if (!flights) {
    return { rows: current ? [{ leg: current, total: now, delta: 0, current: true }] : [], known: false };
  }
  const rows = flights
    .filter((f) => Number.isFinite(f.price) && fitsPrefs(f, prefs))
    .map((f) => {
      const isCurrent = sameFlight(f, current);
      const total = isCurrent && Number.isFinite(now) ? now : r2(legCost(f, { paying, bagKey }).total + lap);
      return { leg: f, total, delta: Number.isFinite(now) ? r2(total - now) : null, current: isCurrent };
    })
    .sort((a, b) => a.total - b.total);
  return { rows, known: true };
}
