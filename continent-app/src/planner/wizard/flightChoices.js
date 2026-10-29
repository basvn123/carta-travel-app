/**
 * The flights Getting there offers for one way, and the pick that prices the
 * trip on one of them (T812). Pure, so the node tests hold it.
 */
import { legCost } from '../../lib/flights/flights.js';
import { liveKey } from '../../lib/flights/useLiveFlights.js';
import { BABY_LAP_FEE_LEG } from '../../lib/party.js';

/** The same flight: one airline, one departure, one arrival. */
export const sameFlight = (a, b) => Boolean(a && b && a.airline === b.airline && a.dep === b.dep && a.arr === b.arr);

/**
 * Up to three rows: the flight the trip is priced on first (its cost as the
 * planner priced it), then the cheapest and the quickest others of the
 * day's live answer, each priced for the party by the planner's own legCost
 * plus the lap fee a baby flies for, so a picked row is the figure the total
 * then counts.
 *
 *   current   priced.cartaFlight[dir] (a leg with its cost), or null
 *   answer    the /api/flights answer for that day ({ checked, flights }), or null
 *   party     { paying, babies, bagKey }
 */
export function flightChoices(current, answer, { paying = 1, babies = 0, bagKey } = {}) {
  const lap = babies * BABY_LAP_FEE_LEG;
  const rows = [];
  const flights = Array.isArray(answer?.flights) ? answer.flights : [];
  if (current) {
    const twin = flights.find((f) => sameFlight(f, current));
    rows.push({ leg: { ...current, min: current.min ?? twin?.min ?? null }, total: current.cost?.total ?? null, current: true });
  }
  const others = flights.filter((f) => !sameFlight(f, current) && Number.isFinite(f.price));
  const cheapest = [...others].sort((a, b) => a.price - b.price);
  const quickest = [...others].sort((a, b) => ((a.stops ?? 0) - (b.stops ?? 0))
    || ((a.min ?? Infinity) - (b.min ?? Infinity)) || (a.price - b.price));
  for (const f of [cheapest[0], quickest[0], cheapest[1], quickest[1]]) {
    if (!f || rows.length >= 3 || rows.some((r) => sameFlight(r.leg, f))) continue;
    const cost = legCost(f, { paying, bagKey });
    rows.push({ leg: f, total: cost.total + lap, current: false });
  }
  return rows;
}

/**
 * The live answers the picked flights make, keyed the way quoteTrip reads
 * them ('BRU-SZG-2026-11-21'): one flight each, so the trip prices that one.
 * A pick made for another day keys another day and is simply not read.
 *
 *   picks   { out, back }, each a flight with its date, from and to, or null
 */
export function pickedLive(picks) {
  const out = [];
  for (const dir of ['out', 'back']) {
    const p = picks?.[dir];
    if (!p || !p.from || !p.to || !p.date || !Number.isFinite(p.price)) continue;
    out.push([liveKey(p.from, p.to, p.date), {
      checked: p.checked || null,
      link: p.link || null,
      flights: [{
        price: p.price, airline: p.airline, flightNo: p.flightNo || null, dep: p.dep, arr: p.arr,
        stops: p.stops ?? 0, min: p.min ?? null, via: p.via || null,
      }],
    }]);
  }
  return out;
}
