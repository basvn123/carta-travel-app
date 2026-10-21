/**
 * /api/forecast?lat=..&lon=.. : the 7-day forecast, proxied from MET Norway
 * (T483, roadmap 1.10, owner decision T469-a).
 *
 * Why a proxy: the browser used to call Open-Meteo directly, which the live
 * CSP blocked (the forecast was dead in production) and whose free tier is
 * non-commercial. MET Norway's data is CC BY 4.0 and free for commercial use,
 * but MET asks every client to identify itself in the User-Agent (a browser
 * cannot set it), to cache, and to stay under 20 requests a second. This
 * Function does all three, on the same origin, so connect-src 'self' covers it.
 *
 * Caching: the upstream request is keyed on a ~1 km cell (src/lib/metForecast
 * cell()) and held at the edge for 30 minutes, about how often MET refreshes;
 * the browser may keep the answer for 30 minutes too. Any failure answers 502
 * with no body, and the app shows no forecast rather than an old one.
 *
 * Pages does not apply public/_headers to a Function's response, so the
 * headers are set here. public/_routes.json routes /api/* to Functions.
 */
import { MET_URL, MET_USER_AGENT, cell, metDaily } from '../../src/lib/metForecast.js';

const HOLD = 1800;

export async function onRequestGet({ request }) {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (!q.get('lat') || !q.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response(null, { status: 400 });
  }
  const [clat, clon] = cell(lat, lon);
  let body;
  try {
    const res = await fetch(`${MET_URL}?lat=${clat}&lon=${clon}`, {
      headers: { 'user-agent': MET_USER_AGENT, accept: 'application/json' },
      cf: { cacheTtl: HOLD, cacheEverything: true },
    });
    if (!res.ok) return new Response(null, { status: 502 });
    body = metDaily(await res.json());
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!body || !body.days.length) return new Response(null, { status: 502 });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${HOLD}`,
      'x-content-type-options': 'nosniff',
    },
  });
}
