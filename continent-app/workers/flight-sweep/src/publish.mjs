/**
 * The file the app reads for one home airport: data/flights/{IATA}.json (T514).
 *
 *   { v: 1, from: "BRU", checked: "2026-10-21T21:07:00Z",
 *     to:   { BCN: { "2026-11-18": [87, "VY", "21:55", "23:59", 0, 29355847] } },
 *     back: { BCN: { "2026-11-25": [64, "FR", "06:30", "08:40", 0, 29355901] } } }
 *
 * `to` is the way out from the home airport, `back` the way home to it, so a
 * home airport's one file prices a whole return trip and the app never has
 * to fetch a second file per destination.
 * Per day: the cheapest flight's price (EUR, one adult, one way), airline
 * IATA code, local departure and arrival, number of stops and the minute it
 * was checked (minutes since 1970). A day searched with no flight at all is
 * null, so the app can tell "no flight" from "not searched". Documented in
 * docs/SCHEMA.md.
 */

import { km } from './plan.mjs';

export const FILE_VERSION = 1;

/**
 * The publish gate (T645). A one-way cheapest fare above this ceiling for the
 * route's distance, or at or below zero, is a parsing slip (cents read as
 * euros, a currency other than EUR), not a price: the day is left out of the
 * file, as if not searched, so the app shows no price rather than a wrong one.
 * Moves to config/pricing.json in F3.
 */
export const PRICE_CEILING = { base: 150, perKm: 0.5, min: 250, noDistance: 1500 };
export const ROUTE_MOVE = 0.4;

const distance = (a, b) => (a && b ? km(a, b) : null);

/** True when a price is a believable one-way fare for that distance (km or null). */
export function priceOk(price, distance) {
  if (!(price > 0)) return false;
  const cap = distance == null ? PRICE_CEILING.noDistance
    : Math.max(PRICE_CEILING.min, PRICE_CEILING.base + PRICE_CEILING.perKm * distance);
  return price <= cap;
}

const day = (r) => (r.price == null
  ? null
  : [r.price, r.airline, r.dep, r.arr, r.stops, Math.floor(r.checked / 60)]);

/**
 * out:  D1 rows {dest, date, price, airline, dep, arr, stops, checked} from the origin
 * back: D1 rows {origin, date, ...} into the origin
 * airports: {IATA: [lat, lon]} from _routes.json, for the price ceiling
 * stats: an object that gets `rejected`, the number of days left out
 */
export function buildFile(origin, out, checkedIso, back = [], airports = null, stats = null) {
  const to = {};
  const home = {};
  let rejected = 0;
  const keep = (r, other) => {
    if (r.price == null) return true;
    const ok = priceOk(r.price, airports ? distance(airports[origin], airports[other]) : null);
    if (!ok) rejected += 1;
    return ok;
  };
  for (const r of out) if (keep(r, r.dest)) (to[r.dest] ||= {})[r.date] = day(r);
  for (const r of back) if (keep(r, r.origin)) (home[r.origin] ||= {})[r.date] = day(r);
  if (stats) stats.rejected = (stats.rejected || 0) + rejected;
  return { v: FILE_VERSION, from: origin, checked: checkedIso, to, back: home };
}

const medianOf = (xs) => {
  const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Report, not block: routes out of one airport whose median price moved more
 * than ROUTE_MOVE between the published file and the new one. [{dest, old, new}]
 */
export function routeMoves(prevFile, nextFile, limit = ROUTE_MOVE) {
  const moves = [];
  for (const [dest, days] of Object.entries(nextFile?.to || {})) {
    const old = medianOf(Object.values(prevFile?.to?.[dest] || {}).map((d) => d && d[0]));
    const now = medianOf(Object.values(days).map((d) => d && d[0]));
    if (old && now && Math.abs(now / old - 1) > limit) moves.push({ dest, old, new: now });
  }
  return moves;
}

/**
 * data/flights/_index.json: which origins have a file (priced days each) and
 * every airline seen, code to name, with logo true when
 * data/airlines/{code}.png exists. The app reads it once for names and logos.
 */
export function buildIndex(counts, airlines, checkedIso) {
  const named = {};
  for (const a of [...airlines].sort((x, y) => x.code.localeCompare(y.code))) {
    named[a.code] = { name: a.name, logo: a.logo === 1 };
  }
  return { v: FILE_VERSION, checked: checkedIso, origins: counts, airlines: named };
}

/** Google's own small airline logo, copied once per airline into R2. */
export const logoSource = (code) => `https://www.gstatic.com/flights/airline_logos/70px/${code}.png`;
