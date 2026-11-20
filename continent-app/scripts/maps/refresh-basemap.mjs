#!/usr/bin/env node
/**
 * refresh-basemap.mjs, cut a fresh Europe extract of the Protomaps basemap
 * (G12). Owner-run once a month; the steps are in docs/owner/maps-refresh.md.
 *
 *   node scripts/maps/refresh-basemap.mjs                 print the plan: newest build, size, commands
 *   node scripts/maps/refresh-basemap.mjs --run           extract to ../cache/maps/europe-<build date>.pmtiles
 *   node scripts/maps/refresh-basemap.mjs --run --upload  then upload it with push-maps.mjs --live
 *
 * Options: --cli <path to pmtiles(.exe)> (default `pmtiles` on PATH, from
 * https://github.com/protomaps/go-pmtiles/releases), --out <dir>,
 * --maxzoom <n> (13, about 13 GB; MapLibre overzooms past it. 14 is
 * about 25 GB and twice failed mid-download on 2026-11-20), --build <YYYYMMDD> (default newest).
 *
 * The bbox covers the app's map bounds with a margin (Iceland to the Urals'
 * foot, the Canaries to the North Cape). Protomaps publishes a planet build
 * daily (https://maps.protomaps.com/builds/); extract reads only the byte
 * ranges it needs, about the extract's size. Needs that much free disk twice
 * (the file plus the upload's read). After the upload, set BASEMAP_FILE in
 * src/lib/map/cartaMapStyle.js and deploy; the old file stays on R2 until the
 * owner deletes it, so open sessions keep working.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export const BBOX = '-25,34,45,72';
const BUILDS = 'https://build-metadata.protomaps.dev/builds.json';

/** `europe-YYYY-MM-DD.pmtiles` from a build key `YYYYMMDD.pmtiles`. */
export function extractName(buildKey) {
  const m = /^(\d{4})(\d{2})(\d{2})\.pmtiles$/.exec(buildKey);
  if (!m) throw new Error(`unexpected build key ${buildKey}`);
  return `europe-${m[1]}-${m[2]}-${m[3]}.pmtiles`;
}

async function main() {
  const builds = await (await fetch(BUILDS)).json();
  const want = arg('--build', null);
  const build = want ? builds.find((b) => b.key === `${want}.pmtiles`) : builds[builds.length - 1];
  if (!build) { console.error(`[refresh-basemap] no build ${want} in ${BUILDS}`); process.exit(1); }
  const cli = arg('--cli', 'pmtiles');
  const outDir = resolve(appRoot, arg('--out', '../cache/maps'));
  const out = join(outDir, extractName(build.key));
  const maxzoom = arg('--maxzoom', '13');
  // Go's HTTP/2 client dropped a 25 GB extract at 15% (stream PROTOCOL_ERROR,
  // 2026-11-20); HTTP/1.1 ran through.
  const env = { ...process.env, GODEBUG: 'http2client=0' };
  const extract = [cli, 'extract', `https://build.protomaps.com/${build.key}`, out,
    `--bbox=${BBOX}`, `--maxzoom=${maxzoom}`];
  console.log(`newest build ${build.key} (basemap v${build.version}, planet ${(build.size / 1e9).toFixed(0)} GB)`);
  const dry = spawnSync(cli, [...extract.slice(1), '--dry-run'], { env, encoding: 'utf-8' });
  if (dry.error) { console.error(`[refresh-basemap] cannot run ${cli}: ${dry.error.message}; pass --cli`); process.exit(1); }
  const size = /archive size of ([\d.]+ \w+)/.exec(`${dry.stdout}${dry.stderr}`);
  console.log(`extract at z${maxzoom}: ${size ? size[1] : 'size not reported'}`);
  console.log(`$ ${extract.join(' ')}`);
  const push = ['node', 'scripts/r2/push-maps.mjs', '--pmtiles', out, '--live'];
  console.log(`$ ${push.join(' ')}`);
  if (!has('--run')) { console.log('\nPlan only. Add --run to extract (and --upload to push).'); return; }
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync(cli, extract.slice(1), { env, stdio: 'inherit' });
  if (r.status !== 0) { console.error('[refresh-basemap] extract failed; rerun, it starts over'); process.exit(r.status || 1); }
  const v = spawnSync(cli, ['verify', out], { stdio: 'inherit' });
  if (v.status !== 0) { console.error('[refresh-basemap] the extract does not verify'); process.exit(1); }
  if (has('--upload')) {
    const u = spawnSync(push[0], push.slice(1), { cwd: appRoot, stdio: 'inherit' });
    if (u.status !== 0) process.exit(u.status || 1);
  } else {
    console.log(`\nExtracted. Upload with: ${push.join(' ')}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
