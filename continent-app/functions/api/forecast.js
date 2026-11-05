/**
 * /api/forecast?lat=..&lon=..[&altitude=m] : the 7-day forecast, proxied from MET Norway
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
import { MET_URL, MET_USER_AGENT, cell, metDaily, altitudeStep } from '../../src/lib/metForecast.js';

import { fail, methodNotAllowed, createLimiter, overLimit, rateRefusal, parseForecastQuery } from '../_lib/guard.js';

const HOLD = 1800;
// MET asks every client to stay polite; the edge caches by cell, so a normal
// traveller sends a handful of distinct cells a minute (T1079).
const limiter = createLimiter({ max: 60 });

export const onRequest = () => methodNotAllowed('GET');

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const pos = parseForecastQuery(q);
  if (!pos) return fail(400, 'bad_request');
  const { lat, lon } = pos;
  const [clat, clon] = cell(lat, lon);
  // T630: an optional altitude in metres for a summit forecast. Validated,
  // clamped and stepped (altitudeStep), so it cannot widen the cache key
  // beyond one entry per 50 m band.
  const alt = altitudeStep(q.get('altitude'));
  if (alt === undefined) return fail(400, 'bad_request');
  if (await overLimit(env, request, limiter, 'forecast')) return rateRefusal();
  let body;
  try {
    const res = await fetch(`${MET_URL}?lat=${clat}&lon=${clon}${alt != null ? `&altitude=${alt}` : ''}`, {
      headers: { 'user-agent': MET_USER_AGENT, accept: 'application/json' },
      cf: { cacheTtl: HOLD, cacheEverything: true },
    });
    if (!res.ok) return fail(502, 'upstream');
    body = metDaily(await res.json());
  } catch {
    return fail(502, 'upstream');
  }
  if (!body || !body.days.length) return fail(502, 'upstream');
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${HOLD}`,
      'x-content-type-options': 'nosniff',
    },
  });
}
