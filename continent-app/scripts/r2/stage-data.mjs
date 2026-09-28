#!/usr/bin/env node
/**
 * stage-data.mjs, the postbuild step that splits dist/ into what Pages serves
 * and what R2 serves (CARTA_CLOUD_ARCHITECTURE.md 5.2).
 *
 * Task: Execution/P3/T054-wire-shards-to-r2.md
 * Runs automatically after `npm run build` (the postbuild hook). By hand:
 *   node scripts/r2/stage-data.mjs [--dist dist] [--out dist-data]
 *
 * What it does depends on VITE_DATA_BASE, the same variable the bundle was
 * built with (read from the environment, then from the .env files Vite
 * reads for a production build):
 *
 *   unset   nothing. dist/ keeps every data file and the app fetches them
 *           same-origin, exactly as before T054. This is the default, and
 *           what production builds until the owner cuts over.
 *   set     every entry in R2_TIER (src/lib/dataHost.js, the list the app
 *           itself routes by) is moved from dist/ to dist-data/, the tree
 *           scripts/r2/push-data.mjs uploads under data/ in the bucket, and
 *           dist/app_data.json is deleted (the app no longer requests it; it
 *           is only an input of the contract check and the harnesses).
 *           dist/ is then the Pages deploy: the app shell and the boot index.
 *
 * Two refusals, both there so a split build can never ship half-wired:
 *
 *   - the built bundle must contain the data base. If Vite built without it
 *     (a different mode, a missing .env) the bundle would ask Pages for
 *     files this script just removed.
 *   - the data host's origin must be in connect-src in both vercel.json and
 *     public/_headers, or the browser blocks every shard. Register row T053-b
 *     keeps that host out of the CSP until the domain resolves, so this is
 *     what makes the order machine-checked. CARTA_SKIP_CSP_CHECK=1 bypasses
 *     it for a local stand-in or a measurement build, never for a deploy.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, renameSync,
  readdirSync, statSync,
} from 'node:fs';
import { R2_TIER, normaliseBase } from '../../src/lib/dataHost.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const distDir = resolve(appRoot, arg('--dist', 'dist'));
const outDir = resolve(appRoot, arg('--out', 'dist-data'));

async function dataBaseFromEnv() {
  if (process.env.VITE_DATA_BASE !== undefined) return process.env.VITE_DATA_BASE;
  try {
    const { loadEnv } = await import('vite');
    return loadEnv('production', appRoot, 'VITE_').VITE_DATA_BASE;
  } catch {
    return undefined;
  }
}

function walk(dir) {
  let files = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else { files += 1; bytes += statSync(p).size; }
    }
  }
  return { files, bytes };
}

function sizeOf(p) {
  const st = statSync(p);
  return st.isDirectory() ? walk(p) : { files: 1, bytes: st.size };
}

/** connect-src host list of a CSP string, or [] when there is none. */
function connectSrc(csp) {
  const m = /(?:^|;)\s*connect-src\s+([^;]*)/.exec(csp || '');
  return m ? m[1].trim().split(/\s+/) : [];
}

function cspProblems(origin) {
  const problems = [];
  const vercel = JSON.parse(readFileSync(resolve(appRoot, 'vercel.json'), 'utf-8'));
  const vCsp = (vercel.headers || []).flatMap((h) => h.headers || [])
    .find((h) => h.key === 'Content-Security-Policy')?.value;
  if (!connectSrc(vCsp).includes(origin)) problems.push(`vercel.json connect-src lacks ${origin}`);
  const headers = readFileSync(resolve(appRoot, 'public', '_headers'), 'utf-8');
  const hCsp = /Content-Security-Policy:\s*(.*)/.exec(headers)?.[1];
  if (!connectSrc(hCsp).includes(origin)) problems.push(`public/_headers connect-src lacks ${origin}`);
  return problems;
}

function bundleHasBase(base) {
  const assets = resolve(distDir, 'assets');
  if (!existsSync(assets)) return false;
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .some((f) => readFileSync(join(assets, f), 'utf-8').includes(base));
}

async function main() {
  if (!existsSync(distDir)) {
    console.error(`[stage-data] no build at ${distDir}; run the build first`);
    process.exit(1);
  }
  const raw = await dataBaseFromEnv();
  const base = normaliseBase(raw);
  if (raw && !base) {
    console.error(`[stage-data] VITE_DATA_BASE="${raw}" is not an https URL (or loopback http) without query; refusing`);
    process.exit(1);
  }
  if (!base) {
    console.log('[stage-data] VITE_DATA_BASE unset: same-origin build, dist/ keeps its data files');
    return;
  }
  if (!bundleHasBase(base)) {
    console.error(`[stage-data] the bundle in ${distDir}/assets was not built with ${base}; `
      + 'rebuild with the same VITE_DATA_BASE before staging');
    process.exit(1);
  }
  const origin = new URL(base).origin;
  const problems = cspProblems(origin);
  if (problems.length) {
    if (process.env.CARTA_SKIP_CSP_CHECK === '1') {
      console.warn(`[stage-data] WARNING, CSP check skipped: ${problems.join('; ')}. Not deployable.`);
    } else {
      console.error(`[stage-data] refusing: ${problems.join('; ')}. The browser would block every shard. `
        + 'Add the host once the domain resolves (register row T053-b), or set CARTA_SKIP_CSP_CHECK=1 for a local build.');
      process.exit(1);
    }
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const entries = {};
  let files = 0;
  let bytes = 0;
  for (const name of R2_TIER) {
    const from = join(distDir, name);
    if (!existsSync(from)) continue;
    const s = sizeOf(from);
    renameSync(from, join(outDir, name));
    entries[name] = s;
    files += s.files;
    bytes += s.bytes;
  }
  for (const name of ['app_data.json', 'activities_full.json']) {
    rmSync(join(distDir, name), { force: true });
  }
  const pages = walk(distDir);
  const manifest = {
    generated_at: new Date().toISOString(),
    data_base: base,
    entries,
    total: { files, bytes },
    pages: { files: pages.files, bytes: pages.bytes },
  };
  // Underscore-prefixed so push-data.mjs can find it and never uploads it.
  writeFileSync(join(outDir, '_stage.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const mib = (b) => (b / 1048576).toFixed(1);
  console.log(`[stage-data] data base ${base}`);
  console.log(`[stage-data] moved ${Object.keys(entries).length} entries, ${files} files, ${mib(bytes)} MiB -> ${outDir}`);
  console.log(`[stage-data] dist/ (the Pages deploy) is now ${pages.files} files, ${mib(pages.bytes)} MiB`);
}

await main();
