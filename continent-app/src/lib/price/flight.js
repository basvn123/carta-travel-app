/**
 * The way there by air, on the same date mode as the bed (T663, V7): the
 * exact dates fly near those days, a month flies that month's cheapest
 * return, any time the year's cheapest. Explore's card and the destination
 * page's calculator both pick their legs here, so the two cannot price the
 * flight of one request on two different days.
 *
 * Bags stay with each screen until F3 sets one default bag (plan 6.1).
 */
import { cheapestReturn, cheapestReturnAnyMonth, sweptNear, legCost } from '../flights/flights.js';
import { flightWindow } from './request.js';
import { rule } from './config.js';

/** { out, back, kind } for the request, or null when either way has no flight. */
export function flightLegs(file, airport, req, now = Date.now()) {
  if (!file || !airport || airport === file.from) return null;
  const w = flightWindow(req);
  if (w.kind === 'exact') {
    const out = sweptNear(file, 'out', airport, w.from, { now });
    const back = sweptNear(file, 'back', airport, w.to, { now });
    return out && back ? { out, back, kind: 'exact' } : null;
  }
  const r = w.kind === 'month' ? cheapestReturn(file, airport, w.ym, now) : cheapestReturnAnyMonth(file, airport, now);
  return r ? { out: r.out, back: r.back, kind: w.kind } : null;
}

/** The legs priced for a party, in the shape roundTripNear returns:
 *  { out, back, fare, bags, bagsKnown, total, perSeat, checked, kind }. */
export function flightQuote(legs, { paying = 1, bagKey = rule('request.default_bag') } = {}) {
  if (!legs) return null;
  const a = legCost(legs.out, { paying, bagKey });
  const b = legCost(legs.back, { paying, bagKey });
  return {
    out: legs.out,
    back: legs.back,
    kind: legs.kind,
    fare: a.fare + b.fare,
    bags: a.bags + b.bags,
    bagsKnown: a.bagsKnown && b.bagsKnown,
    total: a.total + b.total,
    perSeat: a.perSeat + b.perSeat,
    checked: Math.min(legs.out.checked, legs.back.checked),
  };
}
