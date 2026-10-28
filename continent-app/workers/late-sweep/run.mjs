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
 * Runs as carta-late-sweep.service (infra/hetzner/cron). Environment:
 *   CARTA_SWEEP_INGEST_TOKEN   the Worker's INGEST_TOKEN secret (required)
 *   CARTA_SWEEP_INGEST_URL     default the workers.dev /ingest
 *   CARTA_ROUTES_URL           default the data host's _routes.json
 *   CARTA_LATE_STATE           default ~/.local/state/carta/late-sweep.json
 *   TZ=UTC                     dep/arr are read as in the Worker
 *
 *   node workers/late-sweep/run.mjs            run for ever
 *   node workers/late-sweep/run.mjs --dry      plan only: searches a cycle, no network
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { searchDay } from '../shared/flightSearch.mjs';
import { flattenRoutes, lateJobsForMinute, nextPause, LATE_CYCLE } from '../flight-sweep/src/plan.mjs';

const ROUTES_URL = process.env.CARTA_ROUTES_URL
  || 'https://data.carta-europetravel.com/data/flights/_routes.json';
const INGEST_URL = process.env.CARTA_SWEEP_INGEST_URL
  || 'https://flight-sweep.bas-vannieuwenhuyse123.workers.dev/ingest';
const TOKEN = process.env.CARTA_SWEEP_INGEST_TOKEN;
const STATE = process.env.CARTA_LATE_STATE || `${homedir()}/.local/state/carta/late-sweep.json`;
// A search takes about half a second; 4 to 9 s between them is at most about
// 500 an hour while catching up, and about 200 an hour once caught up.
const GAP_MS = [4000, 9000];
const ROUTES_TTL_MS = 6 * 3600000;
const SEND_EVERY = 40; // rows per POST, well under ingest.mjs MAX_ROWS
const RETRY_MS = 5 * 60000;

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

function readState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(`${STATE}.tmp`, JSON.stringify(s));
  renameSync(`${STATE}.tmp`, STATE);
}

let routes = null; // { at, list }
async function routeList() {
  if (routes && Date.now() - routes.at < ROUTES_TTL_MS) return routes.list;
  const res = await fetch(ROUTES_URL);
  if (!res.ok) throw new Error(`${ROUTES_URL}: ${res.status}`);
  routes = { at: Date.now(), list: flattenRoutes((await res.json()).routes) };
  return routes.list;
}

async function send(rows) {
  for (let i = 0; i < rows.length; i += SEND_EVERY) {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ rows: rows.slice(i, i + SEND_EVERY) }),
    });
    if (!res.ok) throw new Error(`ingest ${res.status} ${await res.text()}`);
  }
}

/** One minute of the plan: search, send. Returns { blocked, counts }. */
async function runMinute(list, minute) {
  const jobs = lateJobsForMinute(list, minute * 60000);
  const rows = [];
  const counts = { jobs: jobs.length, ok: 0, empty: 0, failed: 0 };
  let blocked = null;
  for (const j of jobs) {
    const r = await searchDay({ from: j.o, to: j.d, date: j.date });
    if (r.blocked) { blocked = r.reason; break; }
    if (!r.ok) counts.failed++;
    else {
      const f = r.flights[0];
      if (f) counts.ok++; else counts.empty++;
      rows.push({ o: j.o, d: j.d, date: j.date, price: f ? f.price : null, airline: f?.airline,
        airlineName: f?.airlineName, flightNo: f?.flightNo, dep: f?.dep, arr: f?.arr, stops: f?.stops });
    }
    await sleep(GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
  }
  // What was found before a refusal is kept; the minute runs again after the pause.
  if (rows.length) await send(rows);
  return { blocked, counts };
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
  const s = readState();
  log(`late-sweep: start, at minute ${s.minute ?? 'none'}`);
  for (;;) {
    const now = Date.now();
    if ((s.pauseUntil || 0) > now) { await sleep(Math.min(s.pauseUntil - now, 600000)); continue; }
    const nowMin = Math.floor(now / 60000);
    // First start, or off for more than a cycle: begin at now, nothing to catch up.
    if (!Number.isInteger(s.minute) || nowMin - s.minute > LATE_CYCLE) s.minute = nowMin - 1;
    if (s.minute >= nowMin) { await sleep(60000 - (now % 60000) + 500); continue; }
    const minute = s.minute + 1;
    let out;
    try {
      out = await runMinute(await routeList(), minute);
    } catch (e) {
      log(`late-sweep: minute ${minute} failed (${e.message}); again in 5 minutes`);
      await sleep(RETRY_MS);
      continue;
    }
    if (out.counts.jobs) log(`minute ${minute}: ${JSON.stringify(out.counts)}${out.blocked ? ` refused (${out.blocked})` : ''}`);
    if (out.blocked) {
      const p = nextPause(Date.now(), s.pauseUntil || 0, s.pauseLevel || 0);
      Object.assign(s, { pauseUntil: p.until, pauseLevel: p.level });
      log(`late-sweep: Google refused, pausing ${Math.round((p.until - Date.now()) / 60000)} minutes`);
    } else {
      s.minute = minute;
    }
    writeState(s);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
