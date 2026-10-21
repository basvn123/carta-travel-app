#!/usr/bin/env node
/**
 * Seed the flight-sweep database from this machine (T514 fallback).
 *
 * The flight-sweep Worker needs Workers Paid (CPU and subrequests per run).
 * Until then, or to fill a few home airports fast, this runs the same
 * searches (workers/shared/flightSearch.mjs) from a PC for the given
 * origins, both directions, on a handful of days, slowly, and writes a SQL
 * file of upserts for D1. Load it and publish with:
 *
 *   node scripts/flights/seed-local.mjs --origins BRU,CRL [--days 3,7,10,14,28,49]
 *   npx wrangler d1 execute carta_flights --remote -c workers/flight-sweep/wrangler.toml --file <printed path>
 *   then let the Worker's hourly publish run (or trigger it through wrangler dev --test-scheduled).
 *
 * It stops at the first three refusals from Google.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchDay } from '../../workers/shared/flightSearch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const origins = arg('origins', 'BRU,CRL').split(',');
const days = arg('days', '3,7,10,14,28,49').split(',').map(Number);
const parallel = Number(arg('parallel', '2'));
const routesFile = resolve(here, '..', '..', '..', 'data', 'flights', '_routes.json');
const out = resolve(here, '..', '..', '.wrangler', 'seed', `seed-${Date.now()}.sql`);

const { routes } = JSON.parse(readFileSync(routesFile, 'utf8'));
const today = Math.floor(Date.now() / 86400000) * 86400000;
const jobs = [];
for (const o of origins) {
  for (const d of Object.keys(routes[o] || {})) {
    for (const k of days) {
      const date = new Date(today + k * 86400000).toISOString().slice(0, 10);
      jobs.push({ o, d, date });
      if (routes[d]?.[o] != null) jobs.push({ o: d, d: o, date });
    }
  }
}
console.log(`[seed] ${jobs.length} searches for ${origins.join(', ')}`);

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = [];
const names = new Map();
let i = 0;
let blocked = 0;
let ok = 0;
let failed = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: parallel }, async () => {
  while (i < jobs.length && blocked < 3) {
    const j = jobs[i++];
    const r = await searchDay({ from: j.o, to: j.d, date: j.date });
    if (!r.ok) { if (r.blocked) blocked++; else failed++; continue; }
    ok++;
    const b = r.flights[0];
    for (const f of r.flights) if (f.airlineName) names.set(f.airline, f.airlineName);
    sql.push(`INSERT INTO fares (origin, dest, date, price, airline, flight_no, dep, arr, stops, checked) VALUES (${[
      j.o, j.d, j.date, b?.price, b?.airline, b?.flightNo, b?.dep, b?.arr, b?.stops, Math.floor(Date.now() / 1000),
    ].map(q).join(', ')}) ON CONFLICT(origin, dest, date) DO UPDATE SET price = excluded.price, airline = excluded.airline, flight_no = excluded.flight_no, dep = excluded.dep, arr = excluded.arr, stops = excluded.stops, checked = excluded.checked;`);
    if ((ok + failed) % 100 === 0) {
      console.log(`[seed] ${ok + failed}/${jobs.length} done, ${failed} failed, ${blocked} refused, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }
}));
for (const [code, name] of names) {
  sql.push(`INSERT INTO airlines (code, name) VALUES (${q(code)}, ${q(name)}) ON CONFLICT(code) DO UPDATE SET name = excluded.name;`);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql.join('\n') + '\n');
console.log(`[seed] ${ok} priced or empty, ${failed} failed, ${blocked} refused in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
if (blocked >= 3) process.exitCode = 2;
