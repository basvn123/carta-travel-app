#!/usr/bin/env node
/**
 * push-data.mjs, upload the staged data tree to R2 under data/.
 *
 * Task: Execution/P3/T054-wire-shards-to-r2.md
 * Run from continent-app/ after a build with VITE_DATA_BASE set, which leaves
 * the tree in dist-data/ (scripts/r2/stage-data.mjs):
 *
 *   node scripts/r2/push-data.mjs                      print the plan, touch nothing
 *   node scripts/r2/push-data.mjs --rclone-dry-run     ask rclone what it would do
 *   node scripts/r2/push-data.mjs --live               upload (phase 1)
 *   node scripts/r2/push-data.mjs --live --prune       delete stale objects (phase 2)
 *   node scripts/r2/push-data.mjs --cors [--live]      set the bucket's CORS rules
 *
 * Two phases, because the app host and the data host cannot change in the
 * same instant. Phase 1 (`rclone copy`) adds and replaces objects and deletes
 * nothing, so the live site, still on the previous boot index, keeps finding
 * every file it names. Then deploy Pages. Phase 2 (`rclone sync`) runs after
 * the new deploy is live and removes the objects the new build no longer
 * has. Running phase 2 first would 404 the old site's links for as long as
 * it stays cached.
 *
 * Phase 2 also removes what no current R2_TIER entry owns (T296-b): the
 * sync above only visits entries still in R2_TIER, so the objects of an entry
 * removed from the list would stay for ever. After the syncs it lists the
 * top level of r2:<bucket>/<prefix>/ and deletes each name that is not in
 * R2_TIER (a directory with `rclone purge`, a file with `rclone deletefile`).
 * With --rclone-dry-run the listing is real, a read, and the deletes carry
 * --dry-run. Without credentials the plan prints that this step exists and
 * lists nothing. It refuses to delete anything from an empty listing.
 *
 * Objects move with rclone, not wrangler, for the reason T045 found: wrangler
 * uploads one object per call and refuses files over 300 MiB, and this tree
 * is ~52,000 files. rclone reads its remote from the environment, so no
 * secret is ever written to disk. The five variables are T045's:
 *   RCLONE_CONFIG_R2_TYPE=s3  RCLONE_CONFIG_R2_PROVIDER=Cloudflare
 *   RCLONE_CONFIG_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
 *   RCLONE_CONFIG_R2_ACCESS_KEY_ID=...  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=...
 *
 * Each entry is uploaded with the Cache-Control public/_headers gives the
 * same path on Pages (cachePolicy.mjs). Content-Type comes from the file
 * extension, which rclone maps .json to application/json; the app's layer
 * loaders read that header to tell a real file from a missing one.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { R2_TIER } from '../../src/lib/dataHost.js';
import { dataCachePolicy } from './cachePolicy.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const stageDir = resolve(appRoot, arg('--from', 'dist-data'));
const remoteName = arg('--remote', 'r2');
const bucket = arg('--bucket', 'carta');
const prefix = arg('--prefix', 'data');
const LIVE = has('--live');
const RCLONE_DRY = has('--rclone-dry-run');
const PRUNE = has('--prune');
const CORS = has('--cors');
const RCLONE_ENV = ['RCLONE_CONFIG_R2_TYPE', 'RCLONE_CONFIG_R2_ENDPOINT',
  'RCLONE_CONFIG_R2_ACCESS_KEY_ID', 'RCLONE_CONFIG_R2_SECRET_ACCESS_KEY'];

const quote = (a) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const show = (cmd) => cmd.map(quote).join(' ');

function run(cmd) {
  console.log(`$ ${show(cmd)}`);
  // Only npx needs a shell on Windows (it is npx.cmd). With shell: true Node
  // joins the arguments unquoted, so a repo path with a space ("Travel App")
  // or the Cache-Control value would reach rclone split in pieces.
  const shell = process.platform === 'win32' && cmd[0] === 'npx';
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell });
  if (r.status !== 0) {
    console.error(`[push-data] failed (exit ${r.status}): ${show(cmd)}`);
    process.exit(r.status || 1);
  }
}

function corsPlan() {
  const file = resolve(appRoot, 'scripts', 'r2', 'data-cors.json');
  JSON.parse(readFileSync(file, 'utf-8')); // fail here, not halfway through wrangler
  return [
    ['npx', 'wrangler', 'r2', 'bucket', 'cors', 'set', bucket, '--file', 'scripts/r2/data-cors.json', '--force'],
    ['npx', 'wrangler', 'r2', 'bucket', 'cors', 'list', bucket],
  ];
}

function uploadPlan() {
  const manifestPath = join(stageDir, '_stage.json');
  if (!existsSync(manifestPath)) {
    console.error(`[push-data] ${manifestPath} missing: build with VITE_DATA_BASE set first `
      + '(npm run build runs scripts/r2/stage-data.mjs after vite)');
    process.exit(1);
  }
  const stage = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const policy = dataCachePolicy();
  const cmds = [];
  for (const entry of R2_TIER) {
    const local = join(stageDir, entry);
    if (!existsSync(local)) continue;
    const dir = statSync(local).isDirectory();
    const dest = `${remoteName}:${bucket}/${prefix}/${entry}`;
    const verb = dir ? (PRUNE ? 'sync' : 'copy') : 'copyto';
    if (!dir && PRUNE) continue; // a root file has nothing to prune
    cmds.push(['rclone', verb, local, dest,
      '--s3-no-check-bucket', '--checksum', '--fast-list', '--transfers', '32',
      '--header-upload', `Cache-Control: ${policy[entry]}`,
      ...(RCLONE_DRY ? ['--dry-run'] : [])]);
  }
  return { stage, cmds };
}

/**
 * The top-level names in an `rclone lsf` listing (directories end in "/")
 * that no R2_TIER entry owns. Exported for the test, which feeds it a listing.
 */
export function staleEntries(listing, tier = R2_TIER) {
  const keep = new Set(tier);
  const out = [];
  for (const line of String(listing).split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const dir = raw.endsWith('/');
    const name = dir ? raw.slice(0, -1) : raw;
    if (!name || name.includes('/') || keep.has(name)) continue;
    out.push({ name, dir });
  }
  return out;
}

function stalePlan() {
  const base = `${remoteName}:${bucket}/${prefix}`;
  const ls = ['rclone', 'lsf', `${base}/`, '--s3-no-check-bucket'];
  console.log(`$ ${show(ls)}`);
  const r = spawnSync(ls[0], ls.slice(1), { encoding: 'utf-8' });
  if (r.status !== 0) {
    console.error(`[push-data] listing ${base}/ failed (exit ${r.status}): ${r.stderr || r.error || ''}`);
    process.exit(r.status || 1);
  }
  if (!r.stdout.trim()) {
    console.error(`[push-data] ${base}/ listed empty; refusing to prune stale prefixes from an empty listing`);
    process.exit(1);
  }
  return staleEntries(r.stdout).map(({ name, dir }) => [
    'rclone', dir ? 'purge' : 'deletefile', `${base}/${name}`,
    '--s3-no-check-bucket', ...(RCLONE_DRY ? ['--dry-run'] : []),
  ]);
}

function main() {
  const execute = LIVE || RCLONE_DRY;
  if (execute) {
    const missing = RCLONE_ENV.filter((k) => !process.env[k]);
    if (!CORS && missing.length) {
      console.error(`[push-data] missing ${missing.join(', ')}; see the header of this file`);
      process.exit(1);
    }
  }
  if (CORS) {
    const cmds = corsPlan();
    console.log(`CORS rules for bucket ${bucket} (scripts/r2/data-cors.json)`);
    for (const c of cmds) (LIVE ? run(c) : console.log(`  ${show(c)}`));
    if (!LIVE) console.log('\nPlan only. Add --live, with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID exported.');
    return;
  }
  const { stage, cmds } = uploadPlan();
  const mib = (b) => (b / 1048576).toFixed(1);
  console.log(`${PRUNE ? 'Prune (phase 2)' : 'Upload (phase 1)'} ${stageDir} -> ${remoteName}:${bucket}/${prefix}/`);
  console.log(`staged for ${stage.data_base} at ${stage.generated_at}: `
    + `${stage.total.files} files, ${mib(stage.total.bytes)} MiB in ${Object.keys(stage.entries).length} entries`);
  for (const c of cmds) (execute ? run(c) : console.log(`  ${show(c)}`));
  if (PRUNE) {
    if (execute) {
      const stale = stalePlan();
      console.log(`${stale.length} top-level name(s) in ${remoteName}:${bucket}/${prefix}/ are not in R2_TIER`);
      for (const c of stale) run(c);
    } else {
      console.log(`  then: list ${remoteName}:${bucket}/${prefix}/ and delete each top-level name not in R2_TIER`);
    }
  }
  if (!execute) {
    console.log(`\nPlan only, nothing sent. ${PRUNE ? 'Phase 2 runs only after the new Pages deploy is live.' : 'Then deploy Pages, then run with --prune.'}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
