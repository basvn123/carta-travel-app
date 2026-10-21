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

export const FILE_VERSION = 1;

const day = (r) => (r.price == null
  ? null
  : [r.price, r.airline, r.dep, r.arr, r.stops, Math.floor(r.checked / 60)]);

/**
 * out:  D1 rows {dest, date, price, airline, dep, arr, stops, checked} from the origin
 * back: D1 rows {origin, date, ...} into the origin
 */
export function buildFile(origin, out, checkedIso, back = []) {
  const to = {};
  const home = {};
  for (const r of out) (to[r.dest] ||= {})[r.date] = day(r);
  for (const r of back) (home[r.origin] ||= {})[r.date] = day(r);
  return { v: FILE_VERSION, from: origin, checked: checkedIso, to, back: home };
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
