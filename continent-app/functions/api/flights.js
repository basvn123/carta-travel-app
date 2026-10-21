/**
 * /api/flights?o=BRU&d=BCN&date=2026-11-18 : every flight of one day on one
 * route, live from Google Flights (T515). The trip planner asks this for the
 * traveller's exact dates; Explore and the other pages read the sweep's
 * files instead (workers/flight-sweep).
 *
 * Answers { checked, link, flights: [{price, airline, airlineName, flightNo,
 * dep, arr, stops, min, via}] } cheapest first, prices in EUR for one adult.
 * An empty list is a real answer: no flight that day.
 *
 * Caching: the answer is held at the edge for an hour (Cache API, keyed on
 * the query), so travellers on the same route and day share one search; the
 * browser keeps it ten minutes. Any failure or refusal answers 502 with no
 * body and is never cached; the app then falls back to the swept price.
 *
 * Pages does not apply public/_headers to a Function's response, so the
 * headers are set here. public/_routes.json routes /api/* to Functions.
 * Needs the nodejs_compat flag (wrangler.toml) and Workers Paid for CPU.
 */
import { searchDay } from '../../workers/shared/flightSearch.mjs';

const EDGE_HOLD = 3600;
const BROWSER_HOLD = 600;
const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AHEAD_DAYS = 330;

export async function onRequestGet({ request, waitUntil }) {
  const q = new URL(request.url).searchParams;
  const o = q.get('o') || '';
  const d = q.get('d') || '';
  const date = q.get('date') || '';
  const today = new Date().toISOString().slice(0, 10);
  const last = new Date(Date.now() + MAX_AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  if (!IATA.test(o) || !IATA.test(d) || o === d || !DATE.test(date) || date < today || date > last) {
    return new Response(null, { status: 400 });
  }

  const key = new Request(`https://flights.carta.internal/${o}/${d}/${date}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const r = await searchDay({ from: o, to: d, date });
  if (!r.ok) return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } });
  const res = new Response(JSON.stringify({
    checked: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    link: r.link,
    flights: r.flights,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${BROWSER_HOLD}, s-maxage=${EDGE_HOLD}`,
      'x-content-type-options': 'nosniff',
    },
  });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
