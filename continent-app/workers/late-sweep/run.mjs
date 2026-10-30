#!/usr/bin/env node
/**
 * late-sweep: the flight sweep's late tier, on the Hetzner box (T798).
 *
 * The Worker (workers/flight-sweep) checks the next 26 weeks. This checks
 * weeks 27 to 40 (plan.mjs lateJobsForMinute: each route every 4 weeks, one
 * day a week), slowly, from the box's own address, and sends what it finds to
 * the Worker's POST /ingest, which writes it to the same D1 table; the
 * Worker's 10-minute publish then ships it to the app.
 *
 * It walks the plan one minute at a time, a few seconds between searches, so
 * after the box was off it catches up at the same gentle pace. A refusal from
 * Google pauses it (nextPause, as the Worker: an hour, doubling while refusals
 * keep coming back, at most a day) and that minute is tried again afterwards.
 * Its place is kept in a small state file, so a restart resumes.
 *
 * T915: the route list is the Worker's own, found routes included in the same
 * order (GET /extra), and dormant routes are skipped, as the Worker does.
 *
 * Runs as carta-late-sweep.service (infra/hetzner/cron). Environment:
 *   CARTA_SWEEP_INGEST_TOKEN   the Worker's INGEST_TOKEN secret (required)
 *   CARTA_SWEEP_INGEST_URL     default the workers.dev /ingest
 *   CARTA_ROUTES_URL           default the data host's _routes.json
 *   CARTA_LATE_STATE           default ~/.local/state/carta/late-sweep.json
 *   CARTA_LATE_FILL_STATE      default ~/.local/state/carta/late-fill.json
 *   TZ=UTC                     dep/arr are read as in the Worker
 *
 *   node workers/late-sweep/run.mjs            run for ever
 *   node workers/late-sweep/run.mjs --dry      plan only: searches a cycle, no network
 *   node workers/late-sweep/run.mjs --fill     the one-time fills (T819, T915, T917), then exit
 *
 * The fills (carta-late-fill.service) run one after the other, each once,
 * each with its own state file so a restart resumes and a finished one only
 * logs that it is done:
 *   gaps (T915)  the pairs no country reports to Eurostat (gaps.mjs), once,
 *                direct flights only; a pair with a flight becomes a found
 *                route the Worker then sweeps.
 *   far (T917)   the routes with no fare yet in FAR_FILL (January and
 *                February 2027), on the far tier's own days, the routes the
 *                Worker reaches last first; skips any it reached meanwhile.
 *   late (T819)  every route the 4-week cycle does not reach in the 7 days
 *                after the fill began; each still gets its normal turn within
 *                4 weeks (lateFillOrder).
 *
 * Both services run from this box's one address, so they share one pause
 * (PAUSE_FILE): a refusal to either stops both. The fills also go at half
 * speed from 23:00 to 05:00 UTC, the hours the Worker was refused in, and each
 * refusal makes them 1.5 times slower for the rest of the run, at most 4 times.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { searchDay } from '../shared/flightSearch.mjs';
import {
  farJobsInWindow, flattenRoutes, lateFillOrder, lateJobsForMinute, lateJobsForRoute, nextPause,
  FAR_CYCLE, LATE_CYCLE,
} from '../flight-sweep/src/plan.mjs';
import { airportCountries, gapPairs, AIRPORTS_CSV } from './gaps.mjs';

const ROUTES_URL = process.env.CARTA_ROUTES_URL
  || 'https://data.carta-europetravel.com/data/flights/_routes.json';
const INGEST_URL = process.env.CARTA_SWEEP_INGEST_URL
  || 'https://flight-sweep.bas-vannieuwenhuyse123.workers.dev/ingest';
const WORKER_URL = INGEST_URL.replace(/\/ingest$/, '');
const TOKEN = process.env.CARTA_SWEEP_INGEST_TOKEN;
const STATE_DIR = `${homedir()}/.local/state/carta`;
const STATE = process.env.CARTA_LATE_STATE || `${STATE_DIR}/late-sweep.json`;
// A search takes about half a second; 4 to 9 s between them is at most about
// 500 an hour while catching up, and about 200 an hour once caught up.
const GAP_MS = [4000, 9000];
// T819: the fill beside the cycle's 205 an hour. T916: 2 to 4.5 s, was 3 to
// 6.5 (about 960 searches an hour by day, was about 690), half that from
// 23:00 to 05:00 UTC.
const FILL_STATE = process.env.CARTA_LATE_FILL_STATE || `${STATE_DIR}/late-fill.json`;
const GAPS_STATE = `${STATE_DIR}/gap-fill.json`;
const FAR_STATE = `${STATE_DIR}/far-fill.json`;
const FILL_GAP_MS = [2000, 4500];
const FILL_SPAN_MIN = 7 * 1440;
const FILL_NIGHT_UTC = [23, 5]; // half speed from 23:00 to 05:00 UTC
const FILL_SLOWEST = 4;
// T917: the window the far fill completes (owner, 2026-10-30: all fares to
// the end of February).
const FAR_FILL = { from: '2027-01-01', to: '2027-02-28' };
const FAR_RECHECK = 100; // routes between two looks at what the Worker reached
// T915: two days for the two directions, so a route flown twice a week is
// more likely seen; as the Worker's find tier, three weeks out.
const GAP_AHEAD_DAYS = [21, 24];
const PAUSE_FILE = process.env.CARTA_LATE_PAUSE || `${STATE_DIR}/late-pause.json`;
const ROUTES_TTL_MS = 6 * 3600000;
const SEND_EVERY = 40; // rows per POST, well under ingest.mjs MAX_ROWS
const RETRY_MS = 5 * 60000;
const DAY = 86400000;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function readState(path = STATE) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}
function writeState(s, path = STATE) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(s));
  renameSync(`${path}.tmp`, path);
}

/** The box's shared pause (T819): when it ends, 0 if none. */
const pausedUntil = () => readState(PAUSE_FILE).until || 0;
/** Google refused one of us: pause both, longer while refusals keep coming back. */
function pauseAfterRefusal(who, reason) {
  const last = readState(PAUSE_FILE);
  const p = nextPause(Date.now(), last.until || 0, last.level || 0);
  writeState({ until: p.until, level: p.level, by: who, reason }, PAUSE_FILE);
  log(`${who}: Google refused (${reason}), both pause ${Math.round((p.until - Date.now()) / 60000)} minutes`);
}

/** A read from the Worker behind the ingest token (T915). */
async function workerGet(path) {
  const res = await fetch(`${WORKER_URL}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

let routes = null; // { at, json, list, dormant }
async function routeData() {
  if (routes && Date.now() - routes.at < ROUTES_TTL_MS) return routes;
  const res = await fetch(ROUTES_URL);
  if (!res.ok) throw new Error(`${ROUTES_URL}: ${res.status}`);
  const json = await res.json();
  const extra = TOKEN ? await workerGet('/extra') : { found: [], dormant: [] };
  routes = {
    at: Date.now(),
    json,
    list: flattenRoutes(json.routes, extra.found),
    dormant: new Set(extra.dormant.map(([o, d]) => o + d)),
  };
  return routes;
}
const routeList = async () => (await routeData()).list;

async function send(rows, found = []) {
  for (let i = 0; i < Math.max(rows.length, found.length); i += SEND_EVERY) {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ rows: rows.slice(i, i + SEND_EVERY), found: found.slice(i, i + SEND_EVERY) }),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${await res.text()}`);
  }
}

/**
 * Search these jobs, a gap after each, and send. Stops early when the other
 * process paused the box. Jobs with direct: true only look for a direct
 * flight and send no fare (the gap search). Returns { blocked, stopped,
 * counts, direct } where direct lists the jobs that had a direct flight.
 */
async function runJobs(jobs, gap) {
  const rows = [];
  const direct = [];
  const counts = { jobs: jobs.length, ok: 0, empty: 0, failed: 0 };
  let blocked = null;
  let stopped = false;
  for (const j of jobs) {
    if (pausedUntil() > Date.now()) { stopped = true; break; }
    const r = await searchDay({ from: j.o, to: j.d, date: j.date, directOnly: !!j.direct });
    if (r.blocked) { blocked = r.reason; break; }
    if (!r.ok) counts.failed++;
    else {
      const f = r.flights[0];
      if (f) counts.ok++; else counts.empty++;
      if (j.direct) { if (r.flights.some((x) => x.stops === 0)) direct.push(j); }
      else {
        rows.push({ o: j.o, d: j.d, date: j.date, price: f ? f.price : null, airline: f?.airline,
          airlineName: f?.airlineName, flightNo: f?.flightNo, dep: f?.dep, arr: f?.arr, stops: f?.stops });
      }
    }
    await sleep(gap[0] + Math.random() * (gap[1] - gap[0]));
  }
  // What was found before a refusal is kept; the jobs run again after the pause.
  if (rows.length) await send(rows);
  return { blocked, stopped, counts, direct };
}

async function main() {
  if (process.argv.includes('--dry')) {
    const list = await routeList();
    let n = 0;
    const now = Math.floor(Date.now() / 60000);
    for (let m = now; m < now + LATE_CYCLE; m++) n += lateJobsForMinute(list, m * 60000).length;
    console.log(`${list.length} routes, ${n} searches a 4-week cycle, about ${Math.round(n / 672)} an hour`);
    return;
  }
  if (!TOKEN) throw new Error('CARTA_SWEEP_INGEST_TOKEN is not set');
  if (process.argv.includes('--fill')) return fill();
  const s = readState();
  log(`late-sweep: start, at minute ${s.minute ?? 'none'}`);
  for (;;) {
    const now = Date.now();
    if (pausedUntil() > now) { await sleep(Math.min(pausedUntil() - now, 600000)); continue; }
    const nowMin = Math.floor(now / 60000);
    // First start, or off for more than a cycle: begin at now, nothing to catch up.
    if (!Number.isInteger(s.minute) || nowMin - s.minute > LATE_CYCLE) s.minute = nowMin - 1;
    if (s.minute >= nowMin) { await sleep(60000 - (now % 60000) + 500); continue; }
    const minute = s.minute + 1;
    let out;
    try {
      const { list, dormant } = await routeData();
      const jobs = lateJobsForMinute(list, minute * 60000).filter((j) => !dormant.has(j.o + j.d));
      out = await runJobs(jobs, GAP_MS);
    } catch (e) {
      log(`late-sweep: minute ${minute} failed (${e.message}); again in 5 minutes`);
      await sleep(RETRY_MS);
      continue;
    }
    if (out.counts.jobs) log(`minute ${minute}: ${JSON.stringify(out.counts)}${out.blocked ? ` refused (${out.blocked})` : ''}`);
    // Refused or paused by the fill: this minute runs again after the pause.
    if (out.blocked) pauseAfterRefusal('late-sweep', out.blocked);
    else if (!out.stopped) s.minute = minute;
    writeState(s);
  }
}

/** The fills in order (T915, T917, T819); each skips itself once done. */
async function fill() {
  const slow = { by: 1 }; // shared, so a refusal in one fill keeps the next slower too
  await gapFill(slow);
  await farFill(slow);
  await lateFill(slow);
}

/**
 * Walk a fill's steps, `s.at` of `s.count`, with the shared pause, the night
 * half speed and the slow-down after a refusal. step(i, gap) runs step i and
 * returns runJobs' answer (or null to skip it); after(i, out) sees each step
 * that finished.
 */
async function walk(name, path, s, slow, step, after = () => {}) {
  slow.by = Math.max(slow.by, s.slow || 1);
  while (s.at < s.count) {
    const now = Date.now();
    if (pausedUntil() > now) { await sleep(Math.min(pausedUntil() - now, 600000)); continue; }
    const hour = new Date(now).getUTCHours();
    const night = hour >= FILL_NIGHT_UTC[0] || hour < FILL_NIGHT_UTC[1];
    const gap = FILL_GAP_MS.map((g) => g * slow.by * (night ? 2 : 1));
    let out;
    try {
      out = (await step(s.at, gap)) || { counts: { jobs: 0 }, direct: [] };
      if (!out.blocked && !out.stopped) await after(s.at, out);
    } catch (e) {
      log(`${name}: step ${s.at} failed (${e.message}); again in 5 minutes`);
      await sleep(RETRY_MS);
      continue;
    }
    if (out.blocked) {
      slow.by = Math.min(FILL_SLOWEST, slow.by * 1.5);
      s.slow = slow.by;
      pauseAfterRefusal(name, out.blocked);
      log(`${name}: step ${s.at} again after the pause, now ${slow.by.toFixed(2)} times slower`);
    } else if (!out.stopped) {
      s.at++;
      if (s.at % 50 === 0) log(`${name}: ${s.at} of ${s.count}; last ${JSON.stringify(out.counts)}`);
    }
    writeState(s, path);
  }
  s.done = new Date().toISOString();
  writeState(s, path);
  log(`${name}: done, ${s.count} since ${s.started}`);
}

/** T915: the pairs no country reports, once each, both ways, direct only. */
async function gapFill(slow) {
  const s = readState(GAPS_STATE);
  if (s.done) { log(`gap-fill: done on ${s.done}; nothing to do`); return; }
  if (!Array.isArray(s.pairs)) {
    const { json, list } = await routeData();
    const res = await fetch(AIRPORTS_CSV);
    if (!res.ok) throw new Error(`${AIRPORTS_CSV}: ${res.status}`);
    const pairs = gapPairs(json, airportCountries(await res.text()), list);
    Object.assign(s, { pairs, count: pairs.length, at: 0, found: 0, started: new Date().toISOString() });
    writeState(s, GAPS_STATE);
  }
  log(`gap-fill: ${s.count} pairs, at ${s.at}, ${s.found} with a direct flight so far`);
  await walk('gap-fill', GAPS_STATE, s, slow, (i, gap) => {
    const [a, b] = s.pairs[i];
    const now = Date.now();
    return runJobs([
      { o: a, d: b, date: isoDay(now + GAP_AHEAD_DAYS[0] * DAY), direct: true },
      { o: b, d: a, date: isoDay(now + GAP_AHEAD_DAYS[1] * DAY), direct: true },
    ], gap);
  }, async (i, out) => {
    // A direct flight either way: both directions become routes.
    if (!out.direct.length) return;
    const [a, b] = s.pairs[i];
    await send([], [[a, b], [b, a]]);
    s.found++;
    log(`gap-fill: ${a}-${b} has a direct flight (${s.found} so far)`);
  });
}

/**
 * T917: the routes with no fare yet in FAR_FILL, the ones the Worker's far
 * tier reaches last first, so the two meet with little overlap.
 */
async function farFill(slow) {
  const s = readState(FAR_STATE);
  if (s.done) { log(`far-fill: done on ${s.done}; nothing to do`); return; }
  const have = async () => new Set((await workerGet(`/have?from=${FAR_FILL.from}&to=${FAR_FILL.to}`)).routes);
  if (!Array.isArray(s.todo)) {
    const { list, dormant } = await routeData();
    const got = await have();
    const now = Date.now();
    // The Worker's far tier is at this route now and walks upwards; start
    // just behind it and walk down.
    const cur = Math.ceil(((Math.floor(now / 60000) % FAR_CYCLE) * list.length) / FAR_CYCLE);
    const todo = [];
    for (let k = 1; k <= list.length; k++) {
      const r = (((cur - k) % list.length) + list.length) % list.length;
      const [o, d] = list[r];
      if (got.has(o + d) || dormant.has(o + d)) continue;
      if (farJobsInWindow(list, r, now, FAR_FILL.from, FAR_FILL.to).length) todo.push(r);
    }
    Object.assign(s, { todo, count: todo.length, at: 0, skipped: 0, started: new Date().toISOString() });
    writeState(s, FAR_STATE);
  }
  log(`far-fill: ${s.count} routes without a fare from ${FAR_FILL.from} to ${FAR_FILL.to}, at ${s.at}`);
  let got = await have();
  await walk('far-fill', FAR_STATE, s, slow, async (i, gap) => {
    if (i % FAR_RECHECK === 0) got = await have();
    const list = await routeList();
    const r = s.todo[i];
    // The route list is rebuilt monthly; a route past its end is skipped, and
    // one the Worker reached since is left to it.
    if (r >= list.length || got.has(list[r][0] + list[r][1])) { s.skipped++; return null; }
    return runJobs(farJobsInWindow(list, r, Date.now(), FAR_FILL.from, FAR_FILL.to), gap);
  });
}

/**
 * T819: the late tier's fill. Its route order is fixed at the first start
 * (from, count over n routes) and its place kept.
 */
async function lateFill(slow) {
  const s = readState(FILL_STATE);
  if (s.done) { log(`late-fill: done on ${s.done}; nothing to do`); return; }
  const list = await routeList();
  if (!Number.isInteger(s.count)) {
    const order = lateFillOrder(list.length, Date.now(), FILL_SPAN_MIN);
    Object.assign(s, { from: order[0] ?? 0, count: order.length, n: list.length, at: 0,
      started: new Date().toISOString() });
    writeState(s, FILL_STATE);
  }
  log(`late-fill: ${s.count} routes from route ${s.from}, at ${s.at}`);
  await walk('late-fill', FILL_STATE, s, slow, async (i, gap) => {
    const r = (s.from + i) % s.n;
    const { list: now, dormant } = await routeData();
    // The route list is rebuilt monthly; a route past its end is skipped.
    if (r >= now.length || dormant.has(now[r][0] + now[r][1])) return null;
    return runJobs(lateJobsForRoute(now, r, Date.now()), gap);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
