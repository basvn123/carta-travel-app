/**
 * Kept trips and their price since (TF4, T806 and T807). Pure: no React,
 * no storage (keptStore.js keeps the records), no words.
 *
 * A kept trip is a snapshot of the card as it stood: its name and photo,
 * its total a person and for the group, and the flight it was priced with.
 * The flight is the one part of a trip that moves between sweeps (stay, food
 * and getting around are modelled per month), so "If it gets cheaper" looks
 * the same flight up again in the newest swept file and compares like with
 * like: `then` is that lookup on the day the trip was kept, never the
 * card's figure, so a drop is always the sweep's own movement.
 */
import RECOMMEND from '../../../config/recommend.json' with { type: 'json' };
import { roundTripNear } from '../flights/flights.js';

const KEPT = RECOMMEND.kept || {};
/** The smallest drop a person worth a line, in euros. */
export const DROP_MIN = KEPT.dropMin ?? 10;

const slotOf = (trip, id) => trip.slots?.find((s) => s.id === id) || null;

/**
 * The flight the trip was priced with, as a lookup in a swept file: the
 * gateway, the trip's days, the paying seats and the bag rule. Null for a
 * trip with no flight to watch (overland, the traveller's own flight, no
 * dates or no gateway).
 */
export function flightLeg(trip) {
  const slot = slotOf(trip, 'flight');
  const source = slot?.pick?.facts?.source;
  if (!trip.gateway?.iata || !trip.dates?.out || !trip.dates?.back) return null;
  if (slot?.owner === 'you' || source === 'yours' || source === 'drive') return null;
  const state = trip.state || trip.base?.state || {};
  return {
    iata: trip.gateway.iata,
    out: trip.dates.out,
    back: trip.dates.back,
    paying: Math.max(1, trip.party?.head || 1),
    ...(state.baggage ? { bagKey: state.baggage } : {}),
  };
}

/** The leg's return flight for the whole party in this file, in euros, or null. */
export function flightNow(leg, file, { now = Date.now() } = {}) {
  if (!leg || !file) return null;
  const rt = roundTripNear(file, leg.iata, leg.out, leg.back, { paying: leg.paying, ...(leg.bagKey ? { bagKey: leg.bagKey } : {}), now });
  return rt ? Math.round(rt.total) : null;
}

/**
 * The record kept for one trip.
 *   name, image   the card's name and first photo, in the words of the day
 *   origin        the home airport the trip was priced from
 *   plan          planOf(trip): what "Plan this trip" hands the planner
 *   file          the swept file the trip was priced with (for `then`)
 */
export function keptRecord(trip, { name = '', image = null, origin = null, plan = null, file = null, now = Date.now() } = {}) {
  const leg = flightLeg(trip);
  const then = flightNow(leg, file, { now });
  return {
    id: trip.id,
    keptAt: new Date(now).toISOString(),
    name,
    country: trip.country,
    iso2: trip.iso2,
    image,
    nights: trip.nights,
    month: trip.month ?? null,
    dates: trip.dates || null,
    party: { head: trip.party?.head || 1, babies: trip.party?.babies || 0 },
    total: { perPerson: trip.total.perPerson, group: trip.total.group },
    flight: leg && then != null ? { ...leg, then } : null,
    origin: origin || null,
    plan,
  };
}

/**
 * How much less the trip costs now: the kept flight against the same flight
 * in the newest swept file. Returns { perPerson, group, total } (the drop a
 * person and for the group, and the total a person now) when it fell by at
 * least `min` a person; null otherwise (no flight watched, no flight in the
 * file any more, a rise, or a drop too small to mention).
 */
export function dropOf(record, file, { min = DROP_MIN, now = Date.now() } = {}) {
  const leg = record?.flight;
  if (!leg || !file || (record.origin && file.from && file.from !== record.origin)) return null;
  const fresh = flightNow(leg, file, { now });
  if (fresh == null) return null;
  const group = leg.then - fresh;
  const perPerson = Math.round(group / Math.max(1, leg.paying));
  if (perPerson < min) return null;
  return { perPerson, group, total: record.total.perPerson - perPerson };
}

/** The biggest drop over the kept trips: { record, drop } or null. */
export function biggestDrop(records, files, opts) {
  let best = null;
  for (const record of records) {
    const drop = dropOf(record, files[record.origin] || null, opts);
    if (drop && (!best || drop.perPerson > best.drop.perPerson)) best = { record, drop };
  }
  return best;
}

/**
 * The drop per kept trip id, only for the trips that got cheaper, against
 * the newest swept file of each home airport they were priced from.
 * `loadFlightFile` is lib/flights/flightData.js's, handed in by the screen.
 */
export async function dropsFor(records, loadFlightFile, opts) {
  const codes = [...new Set(records.filter((r) => r.flight && r.origin).map((r) => r.origin))];
  const files = {};
  await Promise.all(codes.map((code) => loadFlightFile(code).then((f) => { files[code] = f; }).catch(() => null)));
  const out = {};
  for (const r of records) {
    const drop = dropOf(r, files[r.origin] || null, opts);
    if (drop) out[r.id] = drop;
  }
  return out;
}
