/**
 * The way there by air, on the same date mode as the bed (T663, V7): the
 * exact dates fly near those days, a month flies that month's cheapest
 * return of the trip length, cheapest dates the cheapest return of the trip
 * length on any swept day (G12, D10), any time the year's cheapest checked
 * pair. Explore's card and the destination page's calculator both pick
 * their legs here, so the two cannot price the flight of one request on two
 * different days.
 *
 * flightLegs gives CHECKED legs only. flightPrice is the figure a card shows:
 * the checked pair, else the route's typical fare (lib/flights/pairs.js),
 * flagged `typical`; in any-time mode always the typical fare (decision:
 * "Any time (typical prices over the year)"). cheapestFlight does the same
 * over several home airports (a country start, or the airports in reach).
 *
 * Bags stay with each screen until F3 sets one default bag (plan 6.1).
 */
import { legCost } from '../flights/flights.js';
import { cheapestPair, typicalFare, pairNear } from '../flights/pairs.js';
import { flightWindow } from './request.js';
import { rule } from './config.js';

/** { out, back, kind } for the request, or null when either way has no
 *  checked flight. Month and cheapest pairs keep the trip length (nights,
 *  plus or minus flights.pair_slack_days), so the flight and the bed are
 *  priced for the same trip. */
export function flightLegs(file, airport, req, now = Date.now()) {
  if (!file || !airport || airport === file.from) return null;
  const w = flightWindow(req);
  if (w.kind === 'exact') {
    // fixes-r1 E4: the two legs used to be picked apart (a 1 or 12 night
    // "trip" for a 7 night stay); the pair now keeps the nights.
    const p = pairNear(file, airport, w.from, {
      nights: req?.nights || rule('request.default_nights'), now, bagKey: req?.baggage || rule('request.default_bag'),
    });
    return p ? { out: p.out, back: p.back, kind: 'exact' } : null;
  }
  // fixes-r1 E5: any time looks around a trip-length pair too, never the
  // year's cheapest out and back weeks apart.
  {
    const p = cheapestPair(file, airport, {
      nights: req?.nights || rule('request.default_nights'),
      ym: w.kind === 'month' ? w.ym : null,
      now,
      bagKey: req?.baggage || rule('request.default_bag'),
    });
    return p ? { out: p.out, back: p.back, kind: w.kind } : null;
  }
}

/**
 * The flight a card prices for the request, from one home airport's file:
 * { perSeat, out, back, typical, kind, from } with `perSeat` the return a
 * seat with the bag on both legs, or null when nothing is known. `typical`
 * true means the route's median fare, not a fare for any date; `out.date`
 * is then null.
 */
export function flightPrice(file, airport, req, now = Date.now()) {
  if (!file || !airport || airport === file.from) return null;
  const bagKey = req?.baggage || rule('request.default_bag');
  const w = flightWindow(req);
  if (w.kind !== 'any') {
    const legs = flightLegs(file, airport, req, now);
    if (legs) {
      const perSeat = legCost(legs.out, { paying: 1, bagKey }).perSeat + legCost(legs.back, { paying: 1, bagKey }).perSeat;
      return { perSeat, out: legs.out, back: legs.back, typical: false, kind: w.kind, from: file.from || null };
    }
  }
  const t = typicalFare(file, airport, { now, bagKey });
  return t ? { perSeat: t.perSeat, out: t.out, back: t.back, typical: true, kind: w.kind, from: file.from || null } : null;
}

/**
 * The flight over several home airports' files (a country start, or the
 * airports in reach, T861): the cheapest checked fare, else the cheapest
 * typical one. A checked fare wins over a cheaper typical one: it is a
 * real fare for the traveller's dates, the typical one is not.
 */
export function cheapestFlight(files, airport, req, now = Date.now()) {
  let best = null;
  for (const file of files || []) {
    const f = flightPrice(file, airport, req, now);
    if (!f) continue;
    if (!best || (best.typical && !f.typical) || (best.typical === f.typical && f.perSeat < best.perSeat)) best = f;
  }
  return best;
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
