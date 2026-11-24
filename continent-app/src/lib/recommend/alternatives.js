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
 * nothing empty is ever drawn.
 *
 * Owner rule (2026-11-24, G12 B5): when the flight is "Not yet" in BOTH
 * quotes the live lines are the same, so a lever that changes only priced
 * lines (a bed tier down, a nearby base on the same gateway) may show its
 * saving. It is marked `partial` with the `lines` that moved, and is worded
 * as a saving on those lines ("40 euros less for beds"), never as a cheaper
 * whole trip; a "Not yet" total still never wins Cheaper or a cheapest row,
 * and an alternative of another place or month shows no difference then.
 * Pure: tests/recommendAlternatives.test.mjs.
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

/**
 * The priced lines that moved between two trips with the same live lines:
 * [{ id, diff }] (group euros), only lines priced in both.
 */
export function movedLines(base, next) {
  if (!base || !next || linesOf(base) !== linesOf(next)) return [];
  const eur = (t, id) => {
    const s = t.slots.find((x) => x.id === id);
    return s && s.eur != null ? (Number.isFinite(s.eurGroup) ? s.eurGroup : s.eur) : null;
  };
  return base.slots
    .filter((s) => s.id !== 'activities' && eur(base, s.id) != null && eur(next, s.id) != null)
    .map((s) => ({ id: s.id, diff: Math.round(eur(next, s.id) - eur(base, s.id)) }))
    .filter((x) => Math.abs(x.diff) >= MIN_SAVING);
}

/**
 * A lever on a trip with a "Not yet" line (owner rule above): the same live
 * lines, the "Not yet" ones untouched, and cheaper on the priced lines that
 * moved. { diff, lines } or null.
 */
function cheaperLines(base, next, mayMove) {
  if (!next) return null;
  const moved = movedLines(base, next);
  if (!moved.length || moved.some((x) => !mayMove.includes(x.id))) return null;
  const diff = moved.reduce((n, x) => n + x.diff, 0);
  return diff <= -MIN_SAVING ? { diff, lines: moved.map((x) => x.id) } : null;
}
// The lines a bed tier and a nearby base may move: beds, and for a base
// also its days and getting around; never the flight.
const TIER_LINES = ['stay'];
const BASE_LINES = ['stay', 'food', 'local'];

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
  if (!trip || !input) return [];
  if (leavesOut(trip)) return partialLevers(trip, input);
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
 * The levers on a trip with a "Not yet" line: a bed tier down and a nearby
 * base on the same gateway, each `partial` with the lines it saved on.
 * No cheaper week: it moves the flight, which has no price.
 */
function partialLevers(trip, input) {
  const out = [];
  const tier = input.stayTier || 'home';
  const i = STAY_TIERS.indexOf(tier);
  if (i > 0) {
    const down = STAY_TIERS[i - 1];
    const next = safePrice(candidateOf(trip), { ...input, stayTier: down }, 'tier');
    const r = cheaperLines(trip, next, TIER_LINES);
    if (r) out.push({ key: 'tier', trip: next, diff: r.diff, lines: r.lines, partial: true, tier: down });
  }
  const destinations = input.data?.destinations || {};
  if (trip.places?.length === 1) {
    const here = destinations[trip.places[0].id];
    let best = null;
    for (const n of nearbyPlaces(here ? { ...here, id: trip.places[0].id } : null, destinations, NEARBY_TRIES)) {
      const next = safePrice(candidateOf(trip, { places: [{ id: n.id, nights: trip.places[0].nights }] }), input, 'nearby');
      if (!next || next.gateway?.iata !== trip.gateway?.iata) continue;
      const r = cheaperLines(trip, next, BASE_LINES);
      if (r && (!best || r.diff < best.diff)) best = { key: 'nearby', trip: next, diff: r.diff, lines: r.lines, partial: true, placeId: n.id };
    }
    if (best) out.push(best);
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
    // A "Not yet" line on either side: no whole-trip difference (owner rule).
    out.push({ key, trip: x, diff: leavesOut(trip) || leavesOut(x) ? null : priceDiff(trip, x) });
  };
  // Cheaper: the best complete lever, else a complete trip of the same
  // country or shape that costs less. A partial lever never claims Cheaper.
  const lever = lv.find((l) => l.key !== 'week' && !l.partial);
  if (lever) push('cheaper', lever.trip);
  else {
    const c = leavesOut(trip) ? null : pool.filter((x) => (x.iso2 === trip.iso2 || x.shape === trip.shape) && !leavesOut(x))
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
