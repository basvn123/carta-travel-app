// The installable app check (T1169, ROADMAP I7).
//
// Serves a build under the real Content-Security-Policy from public/_headers
// (a path missing from the build is served from public/, so the fast build
// works), then in Chromium:
//
//   1. installable: Page.getInstallabilityErrors is empty (the check Chrome's
//      own install menu and DevTools > Application > Manifest run; Lighthouse
//      12 dropped its PWA audits in favour of it), the manifest parses and has
//      a 192 and 512 icon and a maskable one;
//   2. the worker registers and controls the page after the FIRST visit;
//   3. the first visit alone is enough: the entry script, the stylesheets and
//      the boot index are in Cache Storage;
//   4. the API and the account are never stored: a live /api/forecast answer
//      and a Supabase-shaped request are not in any cache;
//   5. offline: a reload paints the app shell, My trips opens and shows the
//      trip kept on this device, and the offline line says so;
//   6. no securitypolicyviolation anywhere along the way.
//
//   node scripts/verify_pwa.mjs [--dist DIR]
//     FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
//     node scripts/verify_pwa.mjs --dist ../.fastbuild
//
// Exit 0 when every check passes, 1 otherwise. Hermetic: every request to
// another host is aborted.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { splitCatalogue, buildRankTier, RANK_PATH } from '../src/lib/bootIndex.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dir, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
const distDir = path.resolve(appRoot, opt('--dist') || 'dist');
const publicDir = path.join(appRoot, 'public');
const PORT = 4176;
const BASE = `http://localhost:${PORT}`;
const TRIP_LABEL = 'PWA check trip';

// The data the app boots from. This container (and CI) has no exported
// catalogue in public/, so unless the build carries a boot.json the check
// serves the CI contract fixture split the way scripts/sync-data.mjs splits
// the real one: /boot.json, /dest/<key>.json and the rank tier.
const hash = (body) => createHash('sha256').update(body).digest('hex').slice(0, 12);
function fixtureData() {
  const core = JSON.parse(readFileSync(path.join(appRoot, 'scripts', 'ci', 'fixtures', 'contract-min.json'), 'utf8'));
  const { boot, chunks } = splitCatalogue(core);
  const files = {};
  for (const key of Object.keys(chunks)) {
    const body = JSON.stringify(chunks[key]);
    boot.chunks[key] = hash(body);
    files[`/dest/${key}.json`] = body;
  }
  const rankKey = hash(JSON.stringify(boot.d));
  const rankBody = JSON.stringify(buildRankTier(boot, Object.assign({}, ...Object.values(chunks)), rankKey));
  files[RANK_PATH] = rankBody;
  boot.rank = { key: rankKey, hash: hash(rankBody) };
  files['/boot.json'] = JSON.stringify(boot);
  return { files, firstId: boot.d[0][0] };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
};

async function readRealCsp() {
  const lines = (await fs.readFile(path.join(publicDir, '_headers'), 'utf8')).split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '/*');
  for (let i = start + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^\s+Content-Security-Policy:\s*(.+?)\s*$/);
    if (m) return m[1];
  }
  throw new Error('public/_headers has no CSP on "/*"');
}

async function readFirst(rel) {
  for (const dir of [distDir, publicDir]) {
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) return null;
    try {
      const st = await fs.stat(file);
      if (st.isFile()) return { file, body: await fs.readFile(file) };
    } catch { /* next */ }
  }
  return null;
}

const fixture = existsSync(path.join(distDir, 'boot.json')) || existsSync(path.join(publicDir, 'boot.json')) ? null : fixtureData();
const apiHits = [];
function serve(csp) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const send = (status, type, body, extra = {}) => {
        res.setHeader('Content-Type', type);
        res.setHeader('Content-Security-Policy', csp);
        for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
        res.writeHead(status);
        res.end(body);
      };
      try {
        const pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
        // A stand-in for functions/api: a per-request answer the worker must never keep.
        if (pathname.startsWith('/api/')) {
          apiHits.push(pathname);
          return send(200, 'application/json', JSON.stringify({ at: Date.now() }), { 'Cache-Control': 'no-store' });
        }
        if (fixture && fixture.files[pathname]) return send(200, TYPES['.json'], fixture.files[pathname]);
        const hit = await readFirst(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
        if (!hit) return send(404, 'text/plain', 'Not found');
        const extra = pathname === '/sw.js' ? { 'Cache-Control': 'public, max-age=0, must-revalidate' } : {};
        return send(200, TYPES[path.extname(hit.file)] || 'application/octet-stream', hit.body, extra);
      } catch (e) {
        return send(500, 'text/plain', String(e.message));
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const csp = await readRealCsp();
const server = await serve(csp);
// A persistent profile, not an incognito context: Chromium never offers to
// install from incognito, so getInstallabilityErrors would say "in-incognito".
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'carta-pwa-'));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow',
});
let exit = 1;
try {
  await context.addInitScript(([label, destId]) => {
    window.__cspViolations = [];
    window.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`), true);
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      if (!localStorage.getItem('carta.deviceTrip.v1')) {
        localStorage.setItem('carta.deviceTrip.v1', JSON.stringify({
          v: 1, key: 'dt-pwa-check', savedAt: Date.now(),
          trip: { planLabel: label, tripStart: '2027-05-01', stops: [{ destinationId: destId, nights: 3 }] },
        }));
      }
    } catch { /* storage unavailable */ }
  }, [TRIP_LABEL, fixture ? fixture.firstId : 'FCO']);
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.abort();
  });

  const page = context.pages()[0] || await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().split('\n')[0].slice(0, 200)); });

  // 1. Installable.
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check('installable (Page.getInstallabilityErrors is empty)', installabilityErrors.length === 0,
    installabilityErrors.map((e) => e.errorId).join(', '));
  const app = await cdp.send('Page.getAppManifest');
  const manifest = JSON.parse(app.data || '{}');
  const icons = manifest.icons || [];
  check('manifest parses with no errors', (app.errors || []).length === 0 && manifest.name, (app.errors || []).map((e) => e.message).join('; '));
  check('manifest has 192 and 512 icons and a maskable one',
    icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512') && icons.some((i) => /maskable/.test(i.purpose || '')));

  // 2. The worker controls the page after the first visit.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  check('worker registered and controlling', await page.evaluate(() => !!navigator.serviceWorker.controller));

  // An API call through the controlled page, then let install and warm settle.
  await page.evaluate(() => fetch('/api/forecast?lat=41.90&lon=12.50').then((r) => r.json()));
  // The background warm (lazy chunks) settles when the cache stops growing.
  const t0 = Date.now();
  let last = -1;
  let size = 0;
  for (;;) {
    await page.waitForTimeout(1000);
    size = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
    if ((size === last && size > 0) || Date.now() - t0 > 45000) break;
    last = size;
  }
  const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage || 0);
  console.log(`cache settled at ${size} entries, ${(usage / 1048576).toFixed(1)} MB origin storage, after ${Math.round((Date.now() - t0) / 1000)} s`);

  // 3 + 4. What the cache holds after one visit.
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const r of await c.keys()) out.push(r.url);
    }
    return out;
  });
  const cachedHosts = new Set(cached.map((u) => new URL(u).host));
  const cachedPaths = cached.filter((u) => u.startsWith(BASE)).map((u) => new URL(u).pathname);
  const html = await (await fetch(BASE + '/index.html')).text();
  const entries = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = entries.filter((u) => !cachedPaths.includes(u));
  check(`first visit caches every entry file (${entries.length})`, entries.length > 0 && missing.length === 0, missing.slice(0, 3).join(', '));
  const entryJs = entries.find((u) => /\/assets\/index-[^/]+\.js$/.test(u));
  const lazy = entryJs ? [...new Set([...(await (await fetch(BASE + entryJs)).text()).matchAll(/["'`]\/?(assets\/[A-Za-z0-9_.-]+\.(?:js|mjs|css))["'`]/g)].map((m) => '/' + m[1]))] : [];
  const lazyMissing = lazy.filter((u) => !cachedPaths.includes(u));
  check(`first visit caches the lazy screens in the background (${lazy.length})`, lazy.length > 0 && lazyMissing.length === 0, lazyMissing.slice(0, 3).join(', '));
  check('the shell is cached', cachedPaths.includes('/') || cachedPaths.includes('/index.html'));
  check('no /api answer cached', apiHits.length > 0 && !cachedPaths.some((p) => p.startsWith('/api/')), `api hits ${apiHits.length}`);
  check('only this origin and the data host are cached (never the account host)',
    [...cachedHosts].every((h) => h === `localhost:${PORT}` || h === 'data.carta-europetravel.com'), [...cachedHosts].join(', '));

  // 5. Offline: the shell paints and the kept trip opens.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  const shotDir = process.env.PWA_SHOTS;
  if (shotDir) { await fs.mkdir(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, 'offline-reload-phone.png') }); }
  const painted = await page.evaluate(() => (document.getElementById('root')?.children.length || 0) > 0);
  check('offline reload paints the app shell', painted);
  const nav = page.locator('.header-nav-item:visible, .bottom-nav-item:visible', { hasText: /my trips|saved trips|trips/i });
  let opened = false;
  try { await nav.first().click({ timeout: 15000 }); opened = true; } catch { /* reported below */ }
  await page.waitForTimeout(2000);
  check('offline: My trips opens', opened);
  const body = await page.evaluate(() => document.body.innerText);
  check('offline: the trip kept on this device is listed', body.includes(TRIP_LABEL));
  check('offline: the offline line shows', await page.locator('[data-testid="pwa-offline"]').count() > 0);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'mytrips-offline-phone.png') });
  let tripOpened = false;
  try {
    await page.getByRole('button', { name: /open trip/i }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText);
    tripOpened = text.includes(TRIP_LABEL) && !/stopped working/i.test(text);
  } catch { /* reported below */ }
  check('offline: the kept trip opens', tripOpened);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'trip-offline-phone.png') });
  await context.setOffline(false);

  // 6. CSP.
  const violations = await page.evaluate(() => window.__cspViolations || []);
  check('no CSP violation', violations.length === 0, violations.slice(0, 3).join('; '));
  if (pageErrors.length) console.log('page errors (not a pass criterion):', pageErrors.slice(0, 5));

  exit = results.every((r) => r.ok) ? 0 : 1;
} finally {
  await context.close();
  server.close();
  await fs.rm(profile, { recursive: true, force: true });
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(exit);
