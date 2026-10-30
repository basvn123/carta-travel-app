/**
 * POST /ingest (T798): fares the late tier found on the Hetzner box
 * (workers/late-sweep), written to the same fares table the sweep fills, so
 * the 10-minute publish ships them like any other.
 *
 * Body: { rows: [{ o, d, date, price, airline, airlineName, flightNo, dep,
 * arr, stops }] }, at most MAX_ROWS. price null means searched, no flight.
 * A row that does not look like a fare is dropped, not stored; the answer
 * says how many were.
 *
 * T915: the body may also carry found: [[o, d], ...], routes the box's gap
 * search saw a direct flight on, which join the sweep like the find tier's.
 */

export const MAX_ROWS = 200;
const IATA = /^[A-Z]{3}$/;
const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;
const AIRLINE_KEY = /^[A-Z0-9]{2}$/;
const DAY = 86400000;
const MAX_AHEAD_DAYS = 400;

const text = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const whole = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/**
 * The rows worth storing, cleaned. Throws on a body that is not a list of
 * rows or is too long, so the caller answers 400.
 * @returns {{rows:Array<object>, dropped:number}}
 */
export function ingestRows(body, now = Date.now()) {
  const list = body && (body.rows ?? (Array.isArray(body.found) ? [] : undefined));
  if (!Array.isArray(list)) throw new Error('rows must be a list');
  if (list.length > MAX_ROWS) throw new Error(`at most ${MAX_ROWS} rows`);
  const today = Math.floor(now / DAY) * DAY;
  const rows = [];
  for (const r of list) {
    if (!r || !IATA.test(r.o) || !IATA.test(r.d) || r.o === r.d || !DAY_ISO.test(r.date)) continue;
    const ms = Date.parse(`${r.date}T00:00:00Z`);
    if (!(ms >= today && ms <= today + MAX_AHEAD_DAYS * DAY)) continue;
    const price = r.price == null ? null : whole(r.price, 1, 20000);
    if (r.price != null && price == null) continue;
    rows.push({
      o: r.o, d: r.d, date: r.date, price,
      airline: price != null && AIRLINE_KEY.test(r.airline) ? r.airline : null,
      airlineName: text(r.airlineName, 80),
      flightNo: text(r.flightNo, 16),
      dep: text(r.dep, 32),
      arr: text(r.arr, 32),
      stops: price != null ? whole(r.stops, 0, 4) : null,
    });
  }
  return { rows, dropped: list.length - rows.length };
}

/**
 * The found routes worth storing (T915): distinct [o, d] pairs of IATA codes.
 * Throws on a found that is not a list or is too long.
 * @returns {Array<[string,string]>}
 */
export function ingestFound(body) {
  const list = body && body.found;
  if (list == null) return [];
  if (!Array.isArray(list)) throw new Error('found must be a list');
  if (list.length > MAX_ROWS) throw new Error(`at most ${MAX_ROWS} found`);
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!Array.isArray(p) || !IATA.test(p[0]) || !IATA.test(p[1]) || p[0] === p[1]) continue;
    if (seen.has(p[0] + p[1])) continue;
    seen.add(p[0] + p[1]);
    out.push([p[0], p[1]]);
  }
  return out;
}

/** Constant-time compare of the bearer token with the INGEST_TOKEN secret. */
export async function tokenOk(header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([header.slice(7), secret].map((s) =>
    crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(a, b)
    : Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}
