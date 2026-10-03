/**
 * railAlternative.js: the "by train instead" line on a journey's budget.
 *
 * Carta does not price flights, so this is not a comparison against a flight.
 * It answers a narrower question: can the traveller reach this trip by rail
 * from where they start, and roughly what does that cost and take. The figure
 * comes from the one ground resolver (legTransportOptions, which calls
 * resolveGroundFare), so it carries that resolver's own flag: est true for a
 * calibrated or prior fare, est false only for a stored quote.
 *
 * It returns null, and the page shows nothing, when there is no honest answer:
 * a trip pinned at its country capital (the pin is a guess, so a rail time to
 * it would be too), no train on the leg (island, no network), or a ride so
 * long that nobody would call it an alternative.
 */
import { legTransportOptions } from './transport.js';
import { isNum } from '../map/coords.js';

/** Longest door to door rail time still worth offering, in hours. */
export const RAIL_MAX_HOURS = 16;

/** Pin precisions where the coordinate is a real place, not a capital guess. */
const REAL_PINS = new Set(['source', 'city', 'gateway']);

/**
 * The traveller's start as a destination-shaped point, from the departure
 * airport they chose: the catalogue row for that airport city when there is one
 * (it has iso2 and city-centre coordinates), else the airport's own coordinates
 * with an iso2 borrowed from any catalogue place in the same country.
 */
export function railOrigin(data, code) {
  const o = data?.meta?.origins?.[code];
  if (!o || !isNum(o.lat) || !isNum(o.lon)) return null;
  const dests = data?.destinations || {};
  const row = dests[code];
  if (row && row.iso2) return { ...row, lat: row.lat, lon: row.lon };
  let iso2 = null;
  for (const d of Object.values(dests)) {
    if (d && d.country === o.country && d.iso2) { iso2 = d.iso2; break; }
  }
  if (!iso2) return null;
  return { id: code, city: o.city || o.name || code, country: o.country, iso2, lat: o.lat, lon: o.lon };
}

/** { eurPp, hours, est, src, from } or null. */
export function railAlternative(from, trip) {
  const c = trip?.coordinates;
  if (!from || !c || !REAL_PINS.has(c.precision) || !isNum(c.lat) || !isNum(c.lon)) return null;
  const iso2 = trip.countryCode;
  if (!iso2) return null;
  const to = { city: c.matchedPlace || trip.title, country: trip.country, iso2, lat: c.lat, lon: c.lon };
  const opts = legTransportOptions(from, to, 1);
  const train = opts && !opts.no_road && !opts.train_dropped ? opts.modes?.train : null;
  if (!train || !isNum(train.eur_pp) || !isNum(train.hours) || train.hours > RAIL_MAX_HOURS) return null;
  return {
    eurPp: train.eur_pp,
    hours: train.hours,
    est: train.est !== false,
    src: train.src,
    from: from.city || '',
  };
}
