#!/usr/bin/env node
/**
 * build-pages.mjs, the production build: the split build Cloudflare Pages
 * serves, then the Pages limit gate on what it produced.
 *
 * Task: Execution/P1/T295-ci-pages-gate.md
 *
 *   npm run build:pages
 *
 * Production reads every R2_TIER shard from the data host (T291), so the build
 * that ships is `npm run build` with VITE_DATA_BASE set: stage-data.mjs then
 * moves the shards from dist/ to dist-data/ and dist/ is the few dozen files
 * Pages takes. This script sets that variable for the child process, so the
 * command is the same in Git Bash, PowerShell and cmd, and then runs
 * check-pages-limits.mjs on dist/. A VITE_DATA_BASE already in the environment
 * wins, for a staging data host.
 *
 * The deploy also gets a top-level 404.html, a copy of index.html made after
 * the build (T294-a). Without one, Pages answers every unknown path with
 * index.html and status 200. With it, an unknown path still renders the app,
 * since the app is one client-rendered URL, but the status is a real 404. It
 * is made here and not in public/ so that `npm run build` and the dev server
 * stay as they were.
 *
 * Exit 0 when the build succeeded and dist/ would deploy; non-zero otherwise.
 *
 * Then, from continent-app/ (T293, T296):
 *   node scripts/r2/push-data.mjs --live          data first, phase 1
 *   npx wrangler pages deploy dist --project-name carta-app --branch preview
 *       a preview at https://preview.carta-app.pages.dev, the one preview
 *       origin the data host's CORS rule admits (scripts/r2/data-cors.json);
 *       the per-deploy <hash>.carta-app.pages.dev URLs cannot read R2
 *   npx wrangler pages deploy dist --project-name carta-app --branch main
 *       production
 *   node scripts/r2/push-data.mjs --live --prune  after production is live
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_DATA_BASE = 'https://data.carta-europetravel.com/data';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, VITE_DATA_BASE: process.env.VITE_DATA_BASE || PRODUCTION_DATA_BASE };

function step(label, cmd, args) {
  console.log(`[build-pages] ${label}`);
  // npm is npm.cmd on Windows and needs a shell; none of these arguments
  // contains a space, so the shell's unquoted join is safe here.
  const r = spawnSync(cmd, args, { cwd: appRoot, env, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
  if (r.status !== 0) {
    console.error(`[build-pages] ${label} failed (exit ${r.status ?? r.signal})`);
    process.exit(r.status || 1);
  }
}

console.log(`[build-pages] data base ${env.VITE_DATA_BASE}`);
step('npm run build', 'npm', ['run', 'build']);
// T294-a: a real 404 for unknown paths on the app host.
const indexHtml = resolve(appRoot, 'dist', 'index.html');
if (!existsSync(indexHtml)) {
  console.error('[build-pages] dist/index.html missing after the build');
  process.exit(1);
}
copyFileSync(indexHtml, resolve(appRoot, 'dist', '404.html'));
console.log('[build-pages] dist/404.html written (copy of index.html)');
step('check-pages-limits dist', process.execPath, [resolve(appRoot, 'scripts', 'check-pages-limits.mjs'), 'dist']);
console.log('[build-pages] dist/ is the Pages deploy; dist-data/ is the R2 upload (scripts/r2/push-data.mjs)');
