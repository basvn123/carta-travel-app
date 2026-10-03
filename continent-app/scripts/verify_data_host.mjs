/**
 * verify_data_host.mjs, does the split build work when the shards live on
 * another origin, the way Pages plus R2 will serve it (T054).
 *
 * Build first, against a loopback stand-in for data.carta-europetravel.com:
 *
 *   VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 npm run build
 *   node scripts/verify_data_host.mjs
 *
 * Then this serves dist/ on 127.0.0.1:4390 as the app host (static, no SPA
 * fallback, exactly like Pages with our _redirects) and dist-data/ under
 * /data/ on 127.0.0.1:4391 as the data host (CORS for the app origin only,
 * Cache-Control from public/_headers, 404 without JSON for a missing key,
 * like R2 behind its custom domain). It checks three things:
 *
 *   1. the data host serves the staged tree byte for byte, with the right
 *      headers (scripts/r2/verify-data.mjs, sampled)
 *   2. the app host holds no data-host entry and passes the Pages limits
 *   3. the app, loaded route by route in Chromium, boots and renders, never
 *      asks the app host for a shard, gets every country file from the data
 *      host, and hits no CORS error
 *
 * Ports 4390 and 4391 are this script's own; 4173 and 4190 are held by other
 * sessions on this machine.
 */
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { R2_TIER, isDataPath } from '../src/lib/dataHost.js';
import { dataCachePolicy } from './r2/cachePolicy.mjs';
import { verifyDataHost } from './r2/verify-data.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(APP_ROOT, 'dist');
const STAGE = join(APP_ROOT, 'dist-data');
const APP_PORT = 4390;
const DATA_PORT = 4391;
const APP = `http://127.0.0.1:${APP_PORT}`;
const DATA_BASE = `http://127.0.0.1:${DATA_PORT}/data`;

let failed = false;
const fail = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

const stageFile = join(STAGE, '_stage.json');
if (!existsSync(stageFile) || JSON.parse(readFileSync(stageFile, 'utf-8')).data_base !== DATA_BASE) {
  console.error(`dist-data/ is not staged for ${DATA_BASE}. Build with:\n`
    + `  VITE_DATA_BASE=${DATA_BASE} CARTA_SKIP_CSP_CHECK=1 npm run build`);
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain',
};

function fileUnder(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  const full = normalize(join(root, p));
  if (!full.startsWith(root + sep) && full !== root) return null;
  try { return statSync(full).isFile() ? full : null; } catch { return null; }
}

const policy = dataCachePolicy();
const appServer = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, APP);
  const f = fileUnder(DIST, pathname === '/' ? '/index.html' : pathname);
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
const dataServer = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, DATA_BASE);
  const cors = req.headers.origin === APP ? { 'access-control-allow-origin': APP, vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const rel = pathname.startsWith('/data/') ? pathname.slice(5) : null;
  const f = rel && isDataPath(rel) ? fileUnder(STAGE, rel) : null;
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain', ...cors }); res.end('NoSuchKey'); return; }
  const entry = rel.split('/')[1];
  res.writeHead(200, {
    'content-type': TYPES[extname(f)] || 'application/octet-stream',
    'cache-control': policy[entry],
    ...cors,
  });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(f));
});
await new Promise((r) => appServer.listen(APP_PORT, '127.0.0.1', r));
await new Promise((r) => dataServer.listen(DATA_PORT, '127.0.0.1', r));
const stop = () => { appServer.close(); dataServer.close(); };

try {
  console.log('1. the data host serves the staged tree');
  const v = await verifyDataHost({ base: DATA_BASE, origin: APP, from: STAGE, perEntry: 6 });
  if (v.failures.length) v.failures.slice(0, 10).forEach((f) => fail(f));
  else pass(`${v.checked} requests, every sampled file byte-identical with the right headers`);

  console.log('\n2. the app host holds the shell and the boot index only');
  const leftover = R2_TIER.filter((e) => existsSync(join(DIST, e)));
  if (leftover.length) fail(`dist/ still holds ${leftover.join(', ')}`);
  else pass('no data-host entry left in dist/');
  if (existsSync(join(DIST, 'app_data.json'))) fail('dist/app_data.json still present');
  if (!existsSync(join(DIST, 'boot.json'))) fail('dist/boot.json missing');
  else pass(`dist/boot.json is ${statSync(join(DIST, 'boot.json')).size} bytes`);
  const limits = spawnSync(process.execPath, ['scripts/check-pages-limits.mjs', 'dist'], { cwd: APP_ROOT, encoding: 'utf-8' });
  const total = /TOTAL\s+(\d+)/.exec(limits.stdout)?.[1];
  if (limits.status !== 0) fail(`check-pages-limits failed (${total} files)`);
  else pass(`check-pages-limits passes: ${total} files`);

  console.log('\n3. the app boots against the data host');
  const boot = JSON.parse(readFileSync(join(DIST, 'boot.json'), 'utf-8'));
  const nChunks = Object.keys(boot.chunks).length;
  const ROUTES = [
    { label: 'Destinations (no tab key)', url: '/', body: '.places-tab' },
    { label: 'Explore (tab=map)', url: '/?tab=map', body: '.explore-tab' },
    { label: 'Trip planner (tab=trip)', url: '/?tab=trip', body: '.trip-planner-screen' },
    { label: 'Day planner (tab=day)', url: '/?tab=day', body: '.day-flow-screen' },
    { label: 'a shared trail link', url: '/#trail=20050&tc=AT', body: null, wants: '/trails/' },
    { label: 'a destination page', url: '/#dest=BRU', body: null, wants: '/dossier/' },
    { label: 'a region page', url: '/#region=COAST:BE-BELGIAN-COAST', body: null, wants: '/region/' },
  ];
  const browser = await chromium.launch();
  const seen = new Set();
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const appShards = [];
    const dataBad = [];
    const dataOk = [];
    const cors = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    page.on('console', (m) => {
      const t = m.text();
      // Only the data host's CORS matters here; the affiliate script
      // (emrldtp.com) refuses a loopback origin on its own account.
      if (/CORS|Access-Control-Allow-Origin/i.test(t) && t.includes(`127.0.0.1:${DATA_PORT}`)) cors.push(t.slice(0, 160));
    });
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.origin === APP && isDataPath(u.pathname)) appShards.push(u.pathname);
    });
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin !== new URL(DATA_BASE).origin) return;
      const p = u.pathname.replace(/^\/data/, '');
      if (r.status() >= 500) dataBad.push(`${r.status()} ${p}`);
      else if (r.status() === 200) { dataOk.push(p); seen.add(p.split('/')[1]); }
    });
    page.on('requestfailed', (r) => {
      const u = new URL(r.url());
      if (u.origin === new URL(DATA_BASE).origin) dataBad.push(`failed ${u.pathname}`);
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('continent.lang.v1', 'en');
        localStorage.setItem('continent.guestMode.v1', '1');
        localStorage.setItem('continent.mapGuideDismissed.v1', '1');
        localStorage.setItem('carta.welcomeSeen', '1');
        localStorage.setItem('carta.fareNoticeSeen', '1');
        localStorage.setItem('continent.onboardingSeen.v1', '1');
      } catch { /* storage unavailable */ }
    });
    await page.goto(APP + route.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    const booted = await page.evaluate((sel) => {
      const root = document.getElementById('root');
      const signals = document.querySelectorAll(
        '.place-card, .explore-card, .dest-card, .maplibregl-canvas, .wiz-step, .day-flow-screen, '
        + '.trip-planner-screen, .places-tab, .explore-tab',
      ).length;
      const e = sel ? document.querySelector(sel) : null;
      const r = e?.getBoundingClientRect();
      return { signals, text: (root?.innerText || '').length, shown: !sel || !!(r && r.width > 2 && r.height > 2) };
    }, route.body);
    // The rank tier (T271) lives under /dest/ too but is not a shard; every
    // route still ends up with all the shards (the default build fetches the
    // rest once the first paint is up).
    const destFiles = dataOk.filter((p) => p.startsWith('/dest/') && !p.startsWith('/dest/_rank')).length;
    const tag = route.label;
    if (boot.rank && !dataOk.some((p) => p.startsWith('/dest/_rank.json'))) fail(`${tag}: the rank tier did not come from the data host`);
    if (appShards.length) fail(`${tag}: ${appShards.length} shard request(s) to the app host, e.g. ${appShards[0]}`);
    if (cors.length) fail(`${tag}: CORS error: ${cors[0]}`);
    if (dataBad.length) fail(`${tag}: ${dataBad.length} data host failure(s): ${dataBad.slice(0, 3).join(', ')}`);
    if (errors.length) fail(`${tag}: page error: ${errors[0]}`);
    if (destFiles !== nChunks) fail(`${tag}: ${destFiles} of ${nChunks} country files came from the data host`);
    if (!booted.shown || booted.text < 200) fail(`${tag}: did not render (${booted.text} chars, body shown ${booted.shown})`);
    if (route.wants && !dataOk.some((p) => p.startsWith(route.wants))) fail(`${tag}: no ${route.wants} file from the data host`);
    if (!appShards.length && !cors.length && !dataBad.length && !errors.length && destFiles === nChunks && booted.shown) {
      pass(`${tag}: rendered (${booted.text} chars, ${booted.signals} data nodes), ${dataOk.length} files from the data host`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n  data-host entries fetched across the run: ${[...seen].sort().join(', ')}`);
} catch (err) {
  fail(err.stack || err.message);
} finally {
  stop();
}
console.log(failed ? '\nverify_data_host FAILED' : '\nverify_data_host OK');
process.exit(failed ? 1 : 0);
