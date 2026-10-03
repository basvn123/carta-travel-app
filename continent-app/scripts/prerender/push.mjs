#!/usr/bin/env node
/**
 * push.mjs, uploads the prerendered pages to the carta-prerender bucket (T221).
 *
 *   node scripts/prerender/push.mjs                    print the plan, touch nothing
 *   node scripts/prerender/push.mjs --rclone-dry-run   ask rclone what it would do
 *   node scripts/prerender/push.mjs --live             upload: add and replace, delete nothing
 *   node scripts/prerender/push.mjs --live --prune     then delete what the build no longer has
 *
 * Run from continent-app/ after scripts/prerender/build.mjs, which leaves the
 * pages in dist-prerender/. The same five rclone variables as
 * scripts/r2/push-data.mjs (T045), read from the environment and never
 * written to disk:
 *   RCLONE_CONFIG_R2_TYPE=s3  RCLONE_CONFIG_R2_PROVIDER=Cloudflare
 *   RCLONE_CONFIG_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
 *   RCLONE_CONFIG_R2_ACCESS_KEY_ID=...  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=...
 *
 * Two phases for the same reason as the data push: copying first means a page
 * a crawler was just told about never disappears between two runs; --prune
 * removes the pages of rows that left the catalogue once the new set is up.
 * Pruning refuses to run against a build with fewer than 1,000 pages, so a
 * --country or --sample check run can never empty the bucket.
 *
 * Content-Type comes from the extension (.html, .png). Cache-Control is not
 * set on the objects: the Function decides the caching of what it serves.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const from = path.resolve(APP, arg('--from', 'dist-prerender'));
const bucket = arg('--bucket', 'carta-prerender');
const remote = arg('--remote', 'r2');
const LIVE = has('--live');
const DRY = has('--rclone-dry-run');
const PRUNE = has('--prune');
const MIN_PAGES_TO_PRUNE = 1000;

const manifestFile = path.join(from, '_manifest.json');
if (!fs.existsSync(manifestFile)) {
  console.error(`[push-prerender] ${manifestFile} missing. Run scripts/prerender/build.mjs first.`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const prefixes = fs.readdirSync(from, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
console.log(`[push-prerender] ${manifest.pages.length} pages from ${from}, built ${manifest.generated_at}`);

const plan = prefixes.map((p) => ['rclone', PRUNE ? 'sync' : 'copy', path.join(from, p), `${remote}:${bucket}/${p}`,
  '--transfers', '32', '--checksum', '--fast-list', ...(DRY ? ['--dry-run'] : [])]);

if (PRUNE && manifest.pages.length < MIN_PAGES_TO_PRUNE) {
  console.error(`[push-prerender] refusing --prune: ${manifest.pages.length} pages is a check run, not a full build`);
  process.exit(1);
}
if (!LIVE && !DRY) {
  console.log('[push-prerender] plan only; pass --live to upload, --rclone-dry-run to ask rclone:');
  for (const cmd of plan) console.log(`  ${cmd.join(' ')}`);
  process.exit(0);
}
for (const v of ['RCLONE_CONFIG_R2_TYPE', 'RCLONE_CONFIG_R2_ENDPOINT', 'RCLONE_CONFIG_R2_ACCESS_KEY_ID', 'RCLONE_CONFIG_R2_SECRET_ACCESS_KEY']) {
  if (!process.env[v]) { console.error(`[push-prerender] ${v} is not set`); process.exit(1); }
}
for (const cmd of plan) {
  console.log(`$ ${cmd.join(' ')}`);
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`[push-prerender] failed (exit ${r.status})`); process.exit(r.status || 1); }
}
console.log('[push-prerender] done');
