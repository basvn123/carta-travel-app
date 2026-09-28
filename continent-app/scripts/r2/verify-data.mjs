#!/usr/bin/env node
/**
 * verify-data.mjs, prove the data host serves the staged tree correctly.
 *
 * Task: Execution/P3/T054-wire-shards-to-r2.md
 * Run from continent-app/ with the staged tree in dist-data/:
 *
 *   node scripts/r2/verify-data.mjs                 sample every entry on the live host
 *   node scripts/r2/verify-data.mjs --all           every file (~52,000 requests)
 *   node scripts/r2/verify-data.mjs --base http://127.0.0.1:4391/data --origin http://127.0.0.1:4390
 *
 * For each file checked, against the local copy it was uploaded from:
 *   status 200, a JSON Content-Type (the layer loaders treat anything else as
 *   "not published"), the Cache-Control public/_headers gives that path,
 *   an Access-Control-Allow-Origin that lets the app's origin read it, and a
 *   body byte-identical to the local file (sha256).
 * Plus one path that does not exist must answer 404 without a JSON body,
 * because that is how every loader tells "absent" from "broken".
 *
 * No credentials needed: plain HTTPS, as a browser on the app's origin would.
 * Exits 1 on any failure. The same function backs verify_data_host.mjs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { R2_TIER } from '../../src/lib/dataHost.js';
import { dataCachePolicy } from './cachePolicy.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function listFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out.sort();
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

/**
 * Check the host at `base` against the tree in `from`. Returns
 * { checked, failures: [string], perEntry: { entry: n } }.
 */
export async function verifyDataHost({ base, origin, from, all = false, perEntry = 4 }) {
  const policy = dataCachePolicy();
  const picks = [];
  const counts = {};
  for (const entry of R2_TIER) {
    const local = join(from, entry);
    if (!existsSync(local)) continue;
    const files = entry.includes('.') ? [local] : listFiles(local);
    let chosen = files;
    if (!all && files.length > perEntry) {
      // First, last and evenly spaced between: deterministic, so a failure
      // reproduces, and spread, so one bad subdirectory is likely caught.
      chosen = Array.from({ length: perEntry }, (_, i) => files[Math.round((i * (files.length - 1)) / (perEntry - 1))]);
    }
    counts[entry] = chosen.length;
    for (const f of chosen) picks.push({ entry, file: f });
  }
  const failures = [];
  await pool(picks, 16, async ({ entry, file }) => {
    const rel = relative(from, file).split(sep).join('/');
    const url = `${base}/${rel.split('/').map(encodeURIComponent).join('/')}`;
    let res;
    try {
      res = await fetch(url, { headers: { Origin: origin } });
    } catch (err) {
      failures.push(`${rel}: no response (${err.cause?.code || err.message})`);
      return;
    }
    const body = Buffer.from(await res.arrayBuffer());
    const problems = [];
    if (res.status !== 200) problems.push(`status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) problems.push(`content-type "${ct}"`);
    const cc = res.headers.get('cache-control') || '';
    if (cc !== policy[entry]) problems.push(`cache-control "${cc}", want "${policy[entry]}"`);
    const acao = res.headers.get('access-control-allow-origin') || '';
    if (acao !== origin && acao !== '*') problems.push(`access-control-allow-origin "${acao}" for ${origin}`);
    if (res.status === 200) {
      const want = createHash('sha256').update(readFileSync(file)).digest('hex');
      const got = createHash('sha256').update(body).digest('hex');
      if (want !== got) problems.push('body differs from the staged file');
    }
    if (problems.length) failures.push(`${rel}: ${problems.join('; ')}`);
  });
  // Absent must look absent.
  const ghost = `${base}/trails/ZZ-t054-absent.json`;
  try {
    const r = await fetch(ghost, { headers: { Origin: origin } });
    const ct = r.headers.get('content-type') || '';
    await r.arrayBuffer();
    if (r.status !== 404 || ct.includes('json')) failures.push(`absent path answered ${r.status} "${ct}", want 404 without JSON`);
  } catch (err) {
    failures.push(`absent path: no response (${err.cause?.code || err.message})`);
  }
  return { checked: picks.length + 1, failures, perEntry: counts };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const base = arg('--base', 'https://data.carta-europetravel.com/data').replace(/\/+$/, '');
  const origin = arg('--origin', 'https://www.carta-europetravel.com');
  const from = resolve(appRoot, arg('--from', 'dist-data'));
  if (!existsSync(join(from, '_stage.json'))) {
    console.error(`[verify-data] ${from}/_stage.json missing: stage a build first (see stage-data.mjs)`);
    process.exit(1);
  }
  const r = await verifyDataHost({ base, origin, from, all: argv.includes('--all') });
  console.log(`[verify-data] ${base} as seen from ${origin}: ${r.checked} requests`);
  console.log(`[verify-data] per entry: ${Object.entries(r.perEntry).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const f of r.failures.slice(0, 40)) console.log(`FAIL  ${f}`);
  if (r.failures.length > 40) console.log(`...and ${r.failures.length - 40} more`);
  console.log(r.failures.length ? `\n${r.failures.length} failures.` : '\nPASS, every checked file served as staged.');
  process.exit(r.failures.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
