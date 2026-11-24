/**
 * alternatives.js, the found trip's levers and alternatives (G12 plan
 * rethink, lanes L13 and R3; decision §3.4 "Levers on a known place",
 * explore-recommendations.md Part 3 "Alternatives on the found trip").
 *
 *   levers(trip, input)                 cheaper versions of this trip, each a
 *                                       quoteTrip re-price (priceCandidate):
 *                                       'tier' one bed tier down, 'nearby' a
 *                                       nearby base (nearbyPlaces), 'week' a
 *                                       cheaper checked week (only with at
 *                                       least two checked flight windows)
 *   checkedWindows(trip, input)         the months with a checked return pair
 *   alternatives(trip, others, opts)    one trip per relation: 'cheaper',
 *                                       'month', 'country', 'closer'
 *   priceDiff(base, other)              other minus base, the group, only
 *                                       like for like; else null
 *
 * Honest numbers (decision §3.3, §3.4): a difference shows only when both
 * trips price the same lines; a total with a "Not yet" line never counts as
 * cheaper; a lever or relation with no real difference is left out, so
 * nothing empty is ever drawn. Pure: tests/recommendAlternatives.test.mjs.
 */
import { STAY_TIERS } from '../stayPrice.js';
import { nearbyPlaces } from '../nearby.js';
import { cheapestPair } from '../flights/pairs.js';
import { priceCandidate } from './trips.js';

/** Up to this many nearby bases are priced for the 'nearby' lever. */
export const NEARBY_TRIES = 2;
/** The months ahead a cheaper week is looked for in. */
export const WEEK_MONTHS = 6;
/** Another month needs at least this many checked windows (the sweep is sparse). */
export const MIN_WINDOWS = 2;
/** A saving below this many euros is no saving. */
const MIN_SAVING = 1;

const DAY_MS = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The slot lines a trip prices, as a sorted key ('activities' is never priced). */
const linesOf = (trip) => (Array.isArray(trip?.slots) ? trip.slots : [])
  .filter((s) => s.id !== 'activities').map((s) => `${s.id}:${s.eur == null ? 0 : 1}`).sort().join('|');
/** True when a line has no price yet ("Not yet"). */
export const leavesOut = (trip) => Array.isArray(trip?.slots) && trip.slots.some((s) => s.eur == null && s.id !== 'activities');
const groupTotal = (trip) => (Number.isFinite(trip?.total?.group) ? trip.total.group : null);

/** other minus base for the group, only when both price the same lines. */
export function priceDiff(base, other) {
  const a = groupTotal(base);
  const b = groupTotal(other);
  if (a == null || b == null || linesOf(base) !== linesOf(other)) return null;
  return Math.round(b - a);
}

/** The candidate a priced trip was built from, with a patch. */
function candidateOf(trip, patch = {}) {
  return {
    country: trip.country,
    iso2: trip.iso2,
    shape: trip.shape,
    transport: trip.transport,
    places: trip.places,
    gateway: trip.gateway,
    month: trip.month,
    dates: trip.dates,
    datesFromSetup: false,
    nights: trip.nights,
    signals: trip.signals || { countryScore: 0, countryReasons: [], topType: null, bestMonth: null, gaps: [] },
    ...patch,
  };
}

const safePrice = (c, input, tag = '') => {
  try {
    const t = priceCandidate(c, input);
    // A lever is the same candidate priced again: its own id, so a page
    // can open it beside the trip it came from.
    if (t && tag) t.id = `${t.id}~${tag}`;
    return t;
  } catch { return null; }
};

/** A lever only when it is complete, like for like and really cheaper. */
function cheaper(base, next) {
  if (!next || leavesOut(next)) return null;
  const diff = priceDiff(base, next);
  return diff != null && diff <= -MIN_SAVING ? diff : null;
}

/** The months ahead (as 'YYYY-MM') with a checked return of the trip's length to its gateway. */
export function checkedWindows(trip, input) {
  const iata = trip?.gateway?.iata;
  const file = input?.flights;
  if (!iata || !file || !(trip.nights >= 1)) return [];
  const start = new Date(`${String(input.today || new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < WEEK_MONTHS; i += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const ym = d.toISOString().slice(0, 7);
    const pair = cheapestPair(file, iata, { nights: trip.nights, ym, bagKey: input.baggage || undefined });
    if (pair) out.push({ ym, pair });
  }
  return out;
}

/**
 * The levers on a priced trip: [{ key: 'tier'|'nearby'|'week', trip, diff, ... }],
 * cheapest first. Each is the same trip priced again with one thing changed.
 */
export function levers(trip, input) {
  if (!trip || !input || leavesOut(trip)) return [];
  const out = [];
  // One bed tier down.
  const tier = input.stayTier || 'home';
  const i = STAY_TIERS.indexOf(tier);
  if (i > 0) {
    const down = STAY_TIERS[i - 1];
    const next = safePrice(candidateOf(trip), { ...input, stayTier: down }, 'tier');
    const diff = cheaper(trip, next);
    if (diff != null) out.push({ key: 'tier', trip: next, diff, tier: down });
  }
  // A nearby base, for a one-base trip.
  const destinations = input.data?.destinations || {};
  if (trip.places?.length === 1) {
    const here = destinations[trip.places[0].id];
    let best = null;
    for (const n of nearbyPlaces(here ? { ...here, id: trip.places[0].id } : null, destinations, NEARBY_TRIES)) {
      const next = safePrice(candidateOf(trip, { places: [{ id: n.id, nights: trip.places[0].nights }] }), input, 'nearby');
      const diff = cheaper(trip, next);
      if (diff != null && (!best || diff < best.diff)) best = { key: 'nearby', trip: next, diff, placeId: n.id };
    }
    if (best) out.push(best);
  }
  // A cheaper week: only with at least two checked windows, so "cheaper"
  // compares checked fares, never a sparse guess.
  const windows = checkedWindows(trip, input);
  if (windows.length >= MIN_WINDOWS) {
    const other = windows
      .filter((w) => w.pair.out.date !== trip.dates?.out)
      .sort((a, b) => a.pair.perSeat - b.pair.perSeat)[0];
    if (other) {
      const outDate = other.pair.out.date;
      const month = Number(outDate.slice(5, 7));
      const next = safePrice(candidateOf(trip, { month, dates: { out: outDate, back: addDays(outDate, trip.nights) } }), input, 'week');
      const diff = cheaper(trip, next);
      if (diff != null) out.push({ key: 'week', trip: next, diff, month, windows: windows.length });
    }
  }
  return out.sort((a, b) => a.diff - b.diff);
}

/**
 * One alternative per relation (Part 3): [{ key, trip, diff }] in the order
 * cheaper, month, country, closer, at most one each, none without a real
 * difference.
 *   opts: { levers (from levers()), minutes(trip) -> door to door, windows (checked windows count) }
 */
export function alternatives(trip, others = [], { levers: lv = [], minutes = () => null, windows = 0 } = {}) {
  if (!trip) return [];
  const pool = (others || []).filter((x) => x && x.id !== trip.id);
  const out = [];
  const used = new Set([trip.id]);
  const push = (key, x) => {
    if (!x || used.has(x.id)) return;
    used.add(x.id);
    out.push({ key, trip: x, diff: priceDiff(trip, x) });
  };
  // Cheaper: the best lever, else a complete trip of the same country or shape that costs less.
  const lever = lv.find((l) => l.key !== 'week');
  if (lever) push('cheaper', lever.trip);
  else {
    const c = pool.filter((x) => (x.iso2 === trip.iso2 || x.shape === trip.shape) && !leavesOut(x))
      .map((x) => ({ x, d: priceDiff(trip, x) })).filter((r) => r.d != null && r.d <= -MIN_SAVING)
      .sort((a, b) => a.d - b.d)[0];
    if (c) push('cheaper', c.x);
  }
  // Another month: only with at least two checked windows.
  const week = lv.find((l) => l.key === 'week');
  if (week) push('month', week.trip);
  else if (windows >= MIN_WINDOWS) {
    const same = (x) => x.places.map((p) => p.id).join() === trip.places.map((p) => p.id).join();
    push('month', pool.find((x) => same(x) && x.month !== trip.month));
  }
  // Another country: the best ranked trip elsewhere.
  push('country', pool.find((x) => x.iso2 && x.iso2 !== trip.iso2 && !used.has(x.id)));
  // Closer: a shorter door to door.
  const here = minutes(trip);
  if (Number.isFinite(here)) {
    const c = pool.filter((x) => !used.has(x.id) && Number.isFinite(minutes(x)) && minutes(x) < here - 15)
      .sort((a, b) => minutes(a) - minutes(b))[0];
    push('closer', c);
  }
  return out;
}
