/**
 * /api/stays?k=g190410-d227176,g190410-d294500&n=2026-11-21,2026-11-24&a=2 :
 * tonight's real prices of a few properties for a few single nights (T540).
 *
 * The app sends the Xotelo keys a destination carries in its stays record
 * (`xk`, pipeline/stays/live_keys.py) and up to three nights of the
 * traveller's stay (the first, the middle and the last). Xotelo prices only
 * single nights reliably (a multi-night query comes back empty or mixes
 * totals with nightly rates), so each night is its own query, check-out the
 * next day, for `a` adults in one room.
 *
 * Answers { checked, nights: { "2026-11-21": { "g190410-d227176": 109, ... } } }:
 * the median of the booking sites' rates in EUR per room per night, or null
 * when nothing is sold that night. Events show up by themselves: a hotel
 * prices its festival week up and the median follows.
 *
 * Caching: each (key, night, adults) cell is held at the edge for 12 hours
 * (a sold-out or empty cell for 6, a failed call for 10 minutes), so
 * overlapping stays and other travellers reuse it and Xotelo, run free by one
 * developer, sees few calls. At most 6 keys x 3 nights per request (the app
 * sends 2 nights), 6 upstream calls at a time: a first answer takes about ten
 * seconds, a cached one well under one. A request whose every upstream call
 * failed answers 502, uncached; the app keeps the modelled price.
 */

const KEY = /^g\d{3,9}-d\d{3,10}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_KEYS = 6;
const MAX_NIGHTS = 3;
const MAX_AHEAD_DAYS = 330;
const HOLD = 12 * 3600;
const HOLD_EMPTY = 6 * 3600;
const HOLD_FAIL = 600;
const PARALLEL = 6;
const UA = 'Carta travel planner (carta-europetravel.com; hello@carta-europetravel.com)';

function nextDay(d) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

function median(xs) {
  const s = xs.slice().sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** One cell: the cached value, or Xotelo's. Resolves to a number, null (no
 *  rate that night) or undefined (the call failed: not cached, not counted). */
async function cell(key, night, adults, cache, waitUntil) {
  const id = new Request(`https://stays.carta.internal/${key}/${night}/${adults}`);
  const hit = await cache.match(id);
  if (hit) {
    const { v, fail } = await hit.json();
    return fail ? undefined : v;
  }
  const remember = (body, hold) => waitUntil(cache.put(id, new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': `s-maxage=${hold}` },
  })));
  const url = `https://data.xotelo.com/api/rates?hotel_key=${key}&chk_in=${night}`
    + `&chk_out=${nextDay(night)}&adults=${adults}&rooms=1&currency=EUR`;
  let v;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    const body = r.ok ? await r.json() : null;
    if (!body || body.error) {
      remember({ fail: true }, HOLD_FAIL);
      return undefined;
    }
    const rates = (body?.result?.rates || []).map((x) => x?.rate)
      .filter((x) => typeof x === 'number' && x >= 10 && x <= 5000);
    v = rates.length ? Math.round(median(rates)) : null;
  } catch {
    remember({ fail: true }, HOLD_FAIL);
    return undefined;
  }
  remember({ v }, v == null ? HOLD_EMPTY : HOLD);
  return v;
}

export async function onRequestGet({ request, waitUntil }) {
  const q = new URL(request.url).searchParams;
  const keys = [...new Set((q.get('k') || '').split(','))].filter((k) => KEY.test(k));
  const nights = [...new Set((q.get('n') || '').split(','))].filter((d) => DATE.test(d)).sort();
  const adults = Number(q.get('a') || 2);
  const today = new Date().toISOString().slice(0, 10);
  const last = new Date(Date.now() + MAX_AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  if (!keys.length || keys.length > MAX_KEYS || !nights.length || nights.length > MAX_NIGHTS
      || nights[0] < today || nights[nights.length - 1] > last || ![1, 2].includes(adults)) {
    return new Response(null, { status: 400 });
  }

  const cache = caches.default;
  const jobs = nights.flatMap((n) => keys.map((k) => [k, n]));
  const out = Object.fromEntries(nights.map((n) => [n, {}]));
  let answered = 0;
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const batch = jobs.slice(i, i + PARALLEL);
    const vals = await Promise.all(batch.map(([k, n]) => cell(k, n, adults, cache, waitUntil)));
    batch.forEach(([k, n], j) => {
      if (vals[j] === undefined) return;
      out[n][k] = vals[j];
      answered += 1;
    });
  }
  if (!answered) return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({
    checked: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    nights: out,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600',
      'x-content-type-options': 'nosniff',
    },
  });
}
