/**
 * flight-sweep: Carta's flight price sweep (T514).
 *
 * Every minute (cron "* * * * *") it runs that minute's share of searches
 * (plan.mjs), one Google Flights page each (workers/shared/flightSearch.mjs),
 * and keeps the cheapest flight per route and day in D1. Every 10 minutes (T739; was hourly at :07)
 * it writes one file per home airport to R2 (publish.mjs), which the app
 * reads from data.carta-europetravel.com/data/flights/{IATA}.json.
 *
 * Inputs: data/flights/_routes.json on R2 (pipeline/flights/build_routes.py,
 * monthly, from Eurostat), plus routes the find tier discovered (table found).
 * Guard (T780): the first refusal from Google stops that minute and pauses
 * the sweep for an hour, longer when refusals keep coming back (nextPause).
 * GET /status shows the last hour's counts.
 *
 * Needs Workers Paid: a search costs 10 to 25 ms of CPU and the free plan
 * allows 10 ms per invocation.
 */
import { searchDay } from '../../shared/flightSearch.mjs';
import { flattenRoutes, jobsForMinute, nextPause, DORMANT_AFTER } from './plan.mjs';
import { buildFile, buildIndex, logoSource, nextBatch, routeMoves, ROUTE_MOVE } from './publish.mjs';

const ROUTES_KEY = 'data/flights/_routes.json';
const FILE_PREFIX = 'data/flights/';
// T739: 3, was 6. Google drops over half of Cloudflare's requests at 6 at once.
// T780: 1, with a short random gap after each search, after blocks at 3.
const PARALLEL = 1;
const GAP_MS = [300, 900];
// T780: no new search after 50 s, so one minute's run never overlaps the next.
const BUDGET_MS = 50000;
// T739: publish every 10 minutes, PUBLISH_BATCH airports a run (publish.mjs).
const PUBLISH_CRON = '*/10 * * * *';
const BLOCKS_TO_PAUSE = 1; // T780: was 3
const ROUTES_TTL_MS = 3600000;
const LOGOS_PER_PUBLISH = 25;
const AIRLINE_KEY = /^[A-Z0-9]{2}$/;

let routesCache = null; // { at, data }, kept while the isolate lives

async function loadRoutes(env) {
  if (routesCache && Date.now() - routesCache.at < ROUTES_TTL_MS) return routesCache.data;
  const obj = await env.DATA.get(ROUTES_KEY);
  if (!obj) throw new Error(`${ROUTES_KEY} is missing on R2`);
  routesCache = { at: Date.now(), data: await obj.json() };
  return routesCache.data;
}

const state = async (env, k) =>
  (await env.DB.prepare('SELECT v FROM state WHERE k = ?').bind(k).first('v')) ?? null;
const setState = (env, k, v) =>
  env.DB.prepare('INSERT INTO state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(k, String(v));

async function pool(items, size, fn, stop) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length && !stop()) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

export async function sweepMinute(env, now = Date.now()) {
  const pausedUntil = Number(await state(env, 'pause_until')) || 0;
  if (pausedUntil > now) return { paused: true };

  const data = await loadRoutes(env);
  const found = (await env.DB.prepare('SELECT origin, dest FROM found').all()).results
    .map((r) => [r.origin, r.dest]);
  const dormant = new Set((await env.DB.prepare('SELECT origin || dest AS k FROM misses WHERE n >= ?')
    .bind(DORMANT_AFTER).all()).results.map((r) => r.k));
  const jobs = jobsForMinute(flattenRoutes(data.routes, found), data.airports, now, dormant);

  // T780: counted as results come in, so the first refusal stops the minute
  // (before, the count was taken after the pool and never stopped it).
  let blocked = 0;
  const started = Date.now();
  const results = await pool(jobs, PARALLEL, async (j) => {
    const r = await searchDay({ from: j.o, to: j.d, date: j.date, directOnly: j.tier === 'find' });
    if (r && r.blocked) blocked++;
    else await new Promise((ok) => setTimeout(ok, GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0])));
    return r;
  }, () => blocked >= BLOCKS_TO_PAUSE || Date.now() - started > BUDGET_MS);

  const checked = Math.floor(now / 1000);
  const writes = [];
  const airlineNames = new Map();
  const routeDirect = new Map(); // 'BRUBCN' -> any direct flight this minute
  // Jobs left over when the minute stopped are not counted; they wait for the
  // route's next turn.
  const counts = { jobs: results.filter(Boolean).length, ok: 0, empty: 0, failed: 0, blocked };
  jobs.forEach((j, k) => {
    const r = results[k];
    if (!r || !r.ok) { if (r && !r.blocked) counts.failed++; return; }
    const best = r.flights[0];
    const direct = r.flights.some((f) => f.stops === 0);
    if (best) counts.ok++; else counts.empty++;
    for (const f of r.flights) {
      if (AIRLINE_KEY.test(f.airline) && f.airlineName) airlineNames.set(f.airline, f.airlineName);
    }
    if (j.tier === 'find') {
      // A direct flight makes it a route: new, or a dormant one woken up.
      if (direct) {
        writes.push(env.DB.prepare('INSERT OR IGNORE INTO found (origin, dest, first_seen) VALUES (?, ?, ?)')
          .bind(j.o, j.d, checked));
        writes.push(env.DB.prepare('DELETE FROM misses WHERE origin = ? AND dest = ?').bind(j.o, j.d));
      }
      return;
    }
    writes.push(env.DB.prepare(
      `INSERT INTO fares (origin, dest, date, price, airline, flight_no, dep, arr, stops, checked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(origin, dest, date) DO UPDATE SET price = excluded.price, airline = excluded.airline,
         flight_no = excluded.flight_no, dep = excluded.dep, arr = excluded.arr,
         stops = excluded.stops, checked = excluded.checked`,
    ).bind(j.o, j.d, j.date, best ? best.price : null, best?.airline ?? null, best?.flightNo ?? null,
      best?.dep ?? null, best?.arr ?? null, best?.stops ?? null, checked));
    // One check per route per minute, however many of its days ran.
    const key = j.o + j.d;
    routeDirect.set(key, (routeDirect.get(key) || false) || direct);
  });
  for (const [key, direct] of routeDirect) {
    const o = key.slice(0, 3);
    const d = key.slice(3);
    writes.push(direct
      ? env.DB.prepare('DELETE FROM misses WHERE origin = ? AND dest = ?').bind(o, d)
      : env.DB.prepare(`INSERT INTO misses (origin, dest, n) VALUES (?, ?, 1)
          ON CONFLICT(origin, dest) DO UPDATE SET n = n + 1`).bind(o, d));
  }
  const reasons = {};
  results.forEach((r) => { if (r && !r.ok) reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
  if (Object.keys(reasons).length) console.log('flight-sweep failures', JSON.stringify(reasons));
  for (const [code, name] of airlineNames) {
    writes.push(env.DB.prepare(`INSERT INTO airlines (code, name) VALUES (?, ?)
      ON CONFLICT(code) DO UPDATE SET name = excluded.name`).bind(code, name));
  }
  writes.push(env.DB.prepare(
    'INSERT OR REPLACE INTO runs (minute, jobs, ok, empty, failed, blocked) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(Math.floor(now / 60000), counts.jobs, counts.ok, counts.empty, counts.failed, counts.blocked));
  if (blocked >= BLOCKS_TO_PAUSE) {
    const pause = nextPause(now, pausedUntil, Number(await state(env, 'pause_level')) || 0);
    writes.push(setState(env, 'pause_until', pause.until));
    writes.push(setState(env, 'pause_level', pause.level));
    console.warn(`flight-sweep: ${blocked} refusals, pausing ${Math.round((pause.until - now) / 60000)} minutes`,
      results.filter((r) => r && r.blocked).map((r) => r.reason));
  }
  for (let i = 0; i < writes.length; i += 90) await env.DB.batch(writes.slice(i, i + 90));
  return counts;
}

export async function publish(env, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const checkedIso = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  const since = Number(await state(env, 'published_at')) || 0;
  await env.DB.prepare('DELETE FROM fares WHERE date < ?').bind(today).run();
  await env.DB.prepare('DELETE FROM runs WHERE minute < ?').bind(Math.floor(now / 60000) - 10080).run();

  // An airport's file changes when a flight from it or to it was checked.
  // T739: worked through a queue, PUBLISH_BATCH airports per run.
  const pendingRaw = await state(env, 'publish_queue');
  const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
  const changedNow = pending && pending.queue && pending.queue.length ? [] : (await env.DB.prepare(
    'SELECT origin AS code FROM fares WHERE checked > ?1 UNION SELECT dest AS code FROM fares WHERE checked > ?1',
  ).bind(Math.floor(since / 1000)).all()).results.map((r) => r.code);
  const { batch: changed, rest, started } = nextBatch(pending, changedNow, now);
  // T645: the airports' coordinates set each route's price ceiling.
  const routes = await env.DATA.get(ROUTES_KEY);
  const airports = routes ? (await routes.json()).airports || null : null;
  const gate = { rejected: 0, moved: 0 };
  for (const origin of changed) {
    const out = (await env.DB.prepare(
      `SELECT dest, date, price, airline, dep, arr, stops, checked FROM fares
       WHERE origin = ? AND date >= ? ORDER BY dest, date`,
    ).bind(origin, today).all()).results;
    const back = (await env.DB.prepare(
      `SELECT origin, date, price, airline, dep, arr, stops, checked FROM fares
       WHERE dest = ? AND date >= ? ORDER BY origin, date`,
    ).bind(origin, today).all()).results;
    const file = buildFile(origin, out, checkedIso, back, airports, gate);
    const prev = await env.DATA.get(`${FILE_PREFIX}${origin}.json`);
    const moves = prev ? routeMoves(await prev.json(), file) : [];
    if (moves.length) {
      gate.moved += moves.length;
      console.log(`flight-sweep: ${origin} route medians moved over ${ROUTE_MOVE * 100}%`,
        JSON.stringify(moves.slice(0, 10)));
    }
    await env.DATA.put(`${FILE_PREFIX}${origin}.json`, JSON.stringify(file), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=900' },
    });
  }
  if (gate.rejected || gate.moved) {
    console.log(`flight-sweep: publish left out ${gate.rejected} implausible prices; `
      + `${gate.moved} route medians moved over ${ROUTE_MOVE * 100}%`);
  }
  if (rest.length) {
    await setState(env, 'publish_queue', JSON.stringify({ queue: rest, started })).run();
    console.log(`flight-sweep: published ${changed.length} airports, ${rest.length} queued`);
    return { files: changed.length, queued: rest.length, rejected: gate.rejected, moved: gate.moved };
  }
  const counts = Object.fromEntries((await env.DB.prepare(
    'SELECT origin, COUNT(*) AS n FROM fares WHERE price IS NOT NULL GROUP BY origin',
  ).all()).results.map((r) => [r.origin, r.n]));
  await copyLogos(env);
  const airlines = (await env.DB.prepare('SELECT code, name, logo FROM airlines').all()).results;
  await env.DATA.put(`${FILE_PREFIX}_index.json`, JSON.stringify(buildIndex(counts, airlines, checkedIso)), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=900' },
  });
  await setState(env, 'published_at', started).run();
  await setState(env, 'publish_queue', '').run();
  return { files: changed.length, queued: 0, rejected: gate.rejected, moved: gate.moved };
}

/** Copy Google's logo for airlines not tried yet into R2 data/airlines/{code}.png. */
async function copyLogos(env) {
  const todo = (await env.DB.prepare('SELECT code FROM airlines WHERE logo IS NULL LIMIT ?')
    .bind(LOGOS_PER_PUBLISH).all()).results.map((r) => r.code);
  for (const code of todo) {
    let got = 0;
    try {
      const res = await fetch(logoSource(code));
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.startsWith('image/')) {
        await env.DATA.put(`data/airlines/${code}.png`, await res.arrayBuffer(), {
          httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=2592000' },
        });
        got = 1;
      }
    } catch { /* tried again never; logo 0 shows the code badge */ }
    await env.DB.prepare('UPDATE airlines SET logo = ? WHERE code = ?').bind(got, code).run();
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === PUBLISH_CRON) ctx.waitUntil(publish(env, event.scheduledTime));
    else ctx.waitUntil(sweepMinute(env, event.scheduledTime));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/status') return new Response(null, { status: 404 });
    const since = Math.floor(Date.now() / 60000) - 60;
    const hour = await env.DB.prepare(
      `SELECT COUNT(*) AS minutes, SUM(jobs) AS jobs, SUM(ok) AS ok, SUM(empty) AS empty,
       SUM(failed) AS failed, SUM(blocked) AS blocked FROM runs WHERE minute >= ?`,
    ).bind(since).first();
    return Response.json({
      lastHour: hour,
      pausedUntil: Number(await state(env, 'pause_until')) || null,
      pauseLevel: Number(await state(env, 'pause_level')) || 0,
      publishedAt: Number(await state(env, 'published_at')) || null,
      publishQueued: ((JSON.parse((await state(env, 'publish_queue')) || 'null') || {}).queue || []).length,
      fares: await env.DB.prepare('SELECT COUNT(*) AS n FROM fares').first('n'),
      found: await env.DB.prepare('SELECT COUNT(*) AS n FROM found').first('n'),
      dormant: await env.DB.prepare('SELECT COUNT(*) AS n FROM misses WHERE n >= ?').bind(DORMANT_AFTER).first('n'),
    }, { headers: { 'cache-control': 'no-store' } });
  },
};
