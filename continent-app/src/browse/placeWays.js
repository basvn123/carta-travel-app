/**
 * The way there from the traveller's home, by every mode the app prices
 * (T912, T913): the return flight from the home airport's sweep and the
 * train, coach and car from the traveller's own From point, through the same
 * models the Explore card and the price card use (lib/price/flight.js,
 * flights/flights.js, lib/travelWay.js). Nothing is invented: a mode the
 * models cannot price for this place is left out.
 *
 *   waysThere({ dest, anchor, home, party, flights, request, bagKey })
 *     -> { from, rows: [{ mode, perPerson, minutes?, hours?, dep?, arr?,
 *          airline?, iata? }], cheapest } or null when no mode is priced
 *
 * Pure: no fetching, no React.
 */
import { flightLegs } from '../lib/price/flight.js';
import { legCost } from '../lib/flights/flights.js';
import { groundReturn, flightPerSeat, GROUND_MODES } from '../lib/travelWay.js';

const hhmm = (s) => {
  const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};
const minutesOf = (s) => {
  const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The minutes a leg takes from its local clock times, or null. */
export function legDuration(leg) {
  const a = minutesOf(leg?.dep);
  const b = minutesOf(leg?.arr);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

export function waysThere({ dest, anchor, home = null, party = null, flights = null, request = null, bagKey } = {}) {
  if (!dest) return null;
  const rows = [];
  const legs = flights && anchor ? flightLegs(flights, anchor, request) : null;
  if (legs) {
    const perSeat = legCost(legs.out, { paying: 1, bagKey }).perSeat + legCost(legs.back, { paying: 1, bagKey }).perSeat;
    const pp = flightPerSeat(perSeat, party);
    if (pp > 0) {
      rows.push({
        mode: 'plane', perPerson: pp, minutes: legDuration(legs.out),
        dep: hhmm(legs.out.dep), arr: hhmm(legs.out.arr), airline: legs.out.airline || null, iata: anchor,
      });
    }
  }
  if (home) {
    for (const mode of GROUND_MODES) {
      const r = groundReturn(dest, home, mode, party);
      if (r && r.perPerson > 0) rows.push({ mode, perPerson: r.perPerson, hours: r.hours });
    }
  }
  if (!rows.length) return null;
  const cheapest = rows.reduce((a, b) => (b.perPerson < a.perPerson ? b : a)).mode;
  return { from: home?.name || '', rows, cheapest };
}
