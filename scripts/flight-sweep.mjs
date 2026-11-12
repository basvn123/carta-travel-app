#!/usr/bin/env node
/**
 * flight-sweep.mjs, the flight-sweep Worker's deploy and its night check
 * (ROADMAP N6, T1043; owner sweep 2026-11-12).
 *
 *   node scripts/flight-sweep.mjs nights [--since 2026-11-01]   refusals per UTC day and part (read only)
 *   node scripts/flight-sweep.mjs deploy                        wrangler deploy --dry-run (bundle check)
 *   node scripts/flight-sweep.mjs deploy --live                 wrangler deploy (owner or orchestrator)
 *
 * "nights" reads the Worker's D1 table `runs` (one row per swept minute:
 * jobs, blocked) through `wrangler d1 execute --remote` and splits each UTC
 * day into night (22:00 to 05:00, the half-speed window of T1043) and day.
 * A clean night has blocked = 0. The Worker is at half speed at night when
 * the night's jobs a minute are about half the day's.
 *
 * Both commands run from continent-app/workers/flight-sweep with the
 * owner's Wrangler login; nothing here holds a credential.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WORKER_DIR = path.resolve(HERE, '..', 'continent-app', 'workers', 'flight-sweep');
export const NIGHT_FROM = 22;
export const NIGHT_TO = 5;

/** The per-day, per-part summary of `runs` since a UTC date (YYYY-MM-DD). */
export function nightsSql(since) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since wants YYYY-MM-DD, got ${since}`);
  const minute = Math.floor(Date.parse(`${since}T00:00:00Z`) / 60000);
  const hour = "CAST(strftime('%H', minute * 60, 'unixepoch') AS INT)";
  // Shifted two hours so one night (22:00 to 05:00) falls on one date, the
  // morning's; the day part (05:00 to 22:00) keeps its own date.
  return `SELECT date(minute * 60 + 7200, 'unixepoch') AS d, `
    + `CASE WHEN ${hour} >= ${NIGHT_FROM} OR ${hour} < ${NIGHT_TO} THEN 'night' ELSE 'day' END AS part, `
    + 'count(*) AS minutes, sum(jobs) AS jobs, round(avg(jobs), 1) AS per_min, sum(blocked) AS blocked '
    + `FROM runs WHERE minute >= ${minute} GROUP BY d, part ORDER BY d, part`;
}

/** Plain table lines from the D1 rows. */
export function formatNights(rows) {
  const out = ['day         part   minutes  jobs  per_min  blocked'];
  for (const r of rows) {
    out.push(`${r.d}  ${r.part.padEnd(5)}  ${String(r.minutes).padStart(7)}  ${String(r.jobs).padStart(5)}  ${String(r.per_min).padStart(7)}  ${String(r.blocked).padStart(7)}`);
  }
  const nights = rows.filter((r) => r.part === 'night');
  const clean = nights.filter((r) => !r.blocked).length;
  out.push(`${clean} of ${nights.length} night(s) clean (no refusal)`);
  return out;
}

function wrangler(args, { capture = false } = {}) {
  return spawnSync('npx', ['wrangler', ...args], {
    cwd: WORKER_DIR, encoding: 'utf8', shell: process.platform === 'win32',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'nights') {
    const since = arg(argv, '--since', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
    // The SQL holds no shell character but spaces and quotes; on Windows the
    // shell needs the whole command quoted once.
    const sql = nightsSql(since);
    const r = wrangler(['d1', 'execute', 'carta_flights', '--remote', '--json', '--command',
      process.platform === 'win32' ? `"${sql}"` : sql], { capture: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
    const rows = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;
    for (const line of formatNights(rows)) console.log(line);
  } else if (cmd === 'deploy') {
    const live = argv.includes('--live');
    const r = wrangler(live ? ['deploy'] : ['deploy', '--dry-run']);
    process.exit(r.status ?? 1);
  } else {
    console.error('usage: node scripts/flight-sweep.mjs nights [--since YYYY-MM-DD] | deploy [--live]');
    process.exit(2);
  }
}
