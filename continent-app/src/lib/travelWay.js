/**
 * The way there, for the whole catalogue at once (T579, T582).
 *
 * Explore prices the days at a place (costIndex.js) and, beside that, how
 * the traveller gets there: the travel mode on the settings line decides
 * which way. A flight comes from the home airport's sweep (flights.js); a
 * train, a coach or the car is priced here, from the traveller's own From
 * point to the town, through the same leg estimator the trip planner uses
 * (transport.js legTransportOptions: the per-country fares, the landmass
 * rule for islands, fuel and tolls for the car).
 *
 * The party (T579) decides how a figure splits. Seats are adults plus
 * children; babies sit on a lap and take no seat and no bed:
 *   - a plane seat costs a child what it costs an adult (the low-cost rule),
 *     a baby flies on a lap for a small fee a leg
 *   - a train or coach ticket costs a child half, a baby nothing
 *   - the car is shared by every seat in it
 *   - a child eats about 60 percent of an adult day, a baby adds a little
 * Every figure here is an estimate and is shown with the estimate mark.
 *
 * Pure: no fetching, no React.
 */
import { legTransportOptions } from './transport.js';
import { partyOf, flightPerSeat, CHILD_TICKET_SHARE } from './party.js';

export { partyOf, foodShare, ticketShare, flightPerSeat, BABY_LAP_FEE_LEG } from './party.js';

/** The ways the settings line cycles through, in its order. */
export const TRAVEL_MODES = ['any', 'plane', 'train', 'bus', 'car'];
export const GROUND_MODES = ['train', 'bus', 'car'];

export function nextMode(mode) {
  const i = TRAVEL_MODES.indexOf(mode);
  return TRAVEL_MODES[(i + 1) % TRAVEL_MODES.length];
}

/** A mode the app does not know (an old link) reads as any way. */
export function travelMode(choices) {
  const m = choices?.transport_mode;
  return TRAVEL_MODES.includes(m) ? m : 'any';
}

// A ground journey longer than this one way is not a way anyone takes.
export const MAX_GROUND_HOURS = 20;

const isoCache = new WeakMap();
/** Country name to ISO2, read off the catalogue (origins carry a name only). */
function isoForCountry(destinations, name) {
  if (!destinations || !name) return null;
  let map = isoCache.get(destinations);
  if (!map) {
    map = new Map();
    for (const d of Object.values(destinations)) {
      if (d?.country && d.iso2 && !map.has(d.country)) map.set(d.country, d.iso2);
    }
    isoCache.set(destinations, map);
  }
  return map.get(name) || null;
}

const finite = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

/** Where the traveller starts: the place they named (drive_home), else the
 *  town of their home airport. { lat, lon, iso2, country, name } or null. */
export function homePoint(choices, data) {
  const dests = data?.destinations;
  const h = choices?.drive_home;
  if (finite(h)) {
    return {
      lat: h.lat, lon: h.lon, name: h.name || '',
      country: h.country || '',
      iso2: h.iso2 || isoForCountry(dests, h.country) || null,
    };
  }
  const o = data?.meta?.origins?.[choices?.origin];
  if (o && Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
    return { lat: o.lat, lon: o.lon, name: o.city || o.name || '', country: o.country || '', iso2: isoForCountry(dests, o.country) };
  }
  return null;
}

/**
 * The return journey by train, coach or car from `home` to `dest` for the
 * party: { mode, perPerson, total, hours } or null when that way does not
 * reach the place (a sea crossing, no railway, too long a ride).
 */
export function groundReturn(dest, home, mode, party) {
  if (!dest || !finite(home) || !GROUND_MODES.includes(mode)) return null;
  const p = party || partyOf(null);
  let leg;
  try {
    leg = legTransportOptions(home, dest, p.seats);
  } catch {
    return null;
  }
  const m = leg?.modes?.[mode];
  if (!m || !(m.hours > 0) || m.hours > MAX_GROUND_HOURS) return null;
  const total = mode === 'car'
    ? m.eur_total * 2
    : m.eur_pp * 2 * (p.adults + CHILD_TICKET_SHARE * p.children);
  if (!Number.isFinite(total)) return null;
  return { mode, perPerson: total / p.seats, total, hours: m.hours };
}

/**
 * The way a card shows for one place under the chosen mode.
 *   flight  the cheapest return flight a seat from the sweep ({ perSeat, airline }) or null
 * Returns { mode, perPerson, airline? } or null (the mode does not reach it).
 * 'any' is the cheapest of every way that reaches the place.
 */
export function wayFor(dest, mode, { home, party, flight = null } = {}) {
  const ways = [];
  if ((mode === 'plane' || mode === 'any') && flight?.perSeat > 0) {
    ways.push({ mode: 'plane', perPerson: flightPerSeat(flight.perSeat, party), airline: flight.airline || null });
  }
  for (const g of GROUND_MODES) {
    if (mode !== g && mode !== 'any') continue;
    const r = groundReturn(dest, home, g, party);
    if (r) ways.push({ mode: g, perPerson: r.perPerson, hours: r.hours });
  }
  if (!ways.length) return null;
  return ways.reduce((a, b) => (b.perPerson < a.perPerson ? b : a));
}
