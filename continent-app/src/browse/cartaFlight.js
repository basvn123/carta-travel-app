/*
 * Carta's flight for the browse pages (T518 part C): the destination page,
 * the curated weeks, the trip tiles and the published trips all price their
 * flight the same way, from the home airport's swept file (data.flights) at
 * the app's dates, through flights/flights.js. A page that has no flight near
 * those dates shows nothing: no placeholder, no "no flight" row.
 *
 *   homeFlightSetup(ctx)                 the file, the dates and the bag
 *   journeyAirports(trip)                a curated week's gateway codes
 *   bestRoundTrip(file, codes, out, back, opts)  the cheapest return over them
 *   openJawNear(file, startAp, endAp, out, back, opts)  into one airport, home from another
 */
import { roundTripNear, sweptNear, legCost } from '../lib/flights/flights.js';
import { parseGateway } from '../lib/gateway.js';
import { addDays } from '../lib/dates.js';

const IATA = /^[A-Z]{3}$/;

/** The flight inputs every browse page shares, from FirstRunContext. */
export function homeFlightSetup(ctx) {
  const file = ctx?.data?.flights || null;
  const from = ctx?.departDate || ctx?.defaultDates?.start || null;
  const to = ctx?.returnDate || ctx?.defaultDates?.end || null;
  const bagKey = ctx?.choices?.baggage_key || 'priority_10kg';
  const people = Math.max(1, Math.round(ctx?.choices?.group_size || 1));
  return { file, from, to, bagKey, people };
}

/** The day `nights` after the leaving day, for a trip of its own length. */
export function backDate(from, nights) {
  return from ? addDays(from, Math.max(1, Math.round(nights) || 1)) : null;
}

/** A curated week's gateway airport codes, in its own order: the wire's
 *  gateways[] rows, else the free-text gatewayAirport, else a card's `gw`. */
export function journeyAirports(trip) {
  if (!trip) return [];
  let codes = [];
  if (Array.isArray(trip.gateways) && trip.gateways.length) codes = trip.gateways.map((g) => g?.code);
  else if (trip.gatewayAirport) codes = parseGateway(trip.gatewayAirport).rows.map((r) => r.code);
  else if (trip.gw) codes = [trip.gw];
  return [...new Set(codes.filter((c) => IATA.test(String(c || ''))))];
}

/** The cheapest roundTripNear over several airports, with the airport it
 *  flies to, or null when none has a flight near the dates. */
export function bestRoundTrip(file, codes, outDate, backDay, opts) {
  if (!file || !outDate || !backDay) return null;
  let best = null;
  for (const code of codes || []) {
    const rt = roundTripNear(file, code, outDate, backDay, opts);
    if (rt && (!best || rt.total < best.total)) best = { ...rt, airport: code };
  }
  return best;
}

/** A return in roundTripNear's shape that flies into `startAp` and home
 *  from `endAp` (a route trip that ends somewhere else), or null. */
export function openJawNear(file, startAp, endAp, outDate, backDay, { paying = 1, bagKey = 'small' } = {}) {
  if (!file || !startAp || !endAp || startAp === file.from || endAp === file.from) return null;
  if (startAp === endAp) {
    const rt = roundTripNear(file, startAp, outDate, backDay, { paying, bagKey });
    return rt ? { ...rt, outCost: legCost(rt.out, { paying, bagKey }), backCost: legCost(rt.back, { paying, bagKey }) } : null;
  }
  const out = sweptNear(file, 'out', startAp, outDate);
  const back = sweptNear(file, 'back', endAp, backDay);
  if (!out || !back) return null;
  const a = legCost(out, { paying, bagKey });
  const b = legCost(back, { paying, bagKey });
  return {
    out, back, outCost: a, backCost: b,
    fare: a.fare + b.fare,
    bags: a.bags + b.bags,
    bagsKnown: a.bagsKnown && b.bagsKnown,
    total: a.total + b.total,
    perSeat: a.perSeat + b.perSeat,
    checked: Math.min(out.checked, back.checked),
  };
}

/** A leg with the airports FlightRow links with. */
export function withEnds(leg, from, to) {
  return leg ? { ...leg, from: leg.from || from, to: leg.to || to } : leg;
}
