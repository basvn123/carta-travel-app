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
 *          airline?, iata?, doorHours }], cheapest, fastest, pick, reason }
 *        or null when no mode is priced
 *
 * T1100 (D13): `pick` is the way the card opens on, by door-to-door time and
 * cost and the flight above a distance (lib/wayChoice.js); `fastest` counts
 * the door-to-door hours, so a flight is not "fastest" on its air time alone.
 *
 * Pure: no fetching, no React.
 */
import { flightLegs } from '../lib/price/flight.js';
import { legCost } from '../lib/flights/flights.js';
import { groundReturn, flightPerSeat, GROUND_MODES } from '../lib/travelWay.js';
import { chooseWay, legDuration, wayKm, transferMinutesOf } from '../lib/wayChoice.js';

const hhmm = (s) => {
  const m = typeof s === 'string' ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

export { legDuration };

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
  const choice = chooseWay(rows, { km: wayKm(home, dest), transferMinutes: transferMinutesOf(dest) });
  if (!choice) return null;
  return {
    from: home?.name || '', km: wayKm(home, dest), rows: choice.rows,
    cheapest: choice.cheapest, fastest: choice.fastest, pick: choice.pick, reason: choice.reason,
  };
}
