// T059: prove that the 'viewport' catalogue mode boots on the boot index and
// a few shards, and that panning the Explore map fetches shard by shard.
//
//   VITE_CATALOGUE=viewport npm run build
//   node scripts/verify_viewport_catalogue.mjs [--port 4396]
//
// Serves dist/ from its own loopback server (never 4173, which other
// sessions hold), logs every /boot.json and /dest/ request with its bytes,
// and drives Chromium:
//   1. a map link (/?xw=map) renders from the boot index plus the shards
//      around the default origin, under 2 MB, far short of the catalogue
//   2. standing still at continental zoom fetches nothing more
//   3. zooming in past the clusters and panning with the keyboard fetches
//      new shards per step, never the same shard twice
//   4. switching to the grid asks for the rest, and the whole catalogue
//      arrives
// Exit 1 on any failure.
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(APP_ROOT, 'dist');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > 0 ? Number(process.argv[portArg + 1]) : 4396;
const APP = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

let failed = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failed += 1; console.log(`  FAIL  ${m}`); };

if (!existsSync(join(DIST, 'boot.json'))) { console.error('dist/boot.json missing: build first'); process.exit(1); }
const bundle = readFileSync(join(DIST, 'index.html'), 'utf-8');
const boot = JSON.parse(readFileSync(join(DIST, 'boot.json'), 'utf-8'));
const allShards = Object.keys(boot.chunks);
const allBytes = allShards.reduce((a, k) => a + statSync(join(DIST, 'dest', `${k}.json`)).size, 0);

function fileUnder(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  const full = normalize(join(root, p));
  if (!full.startsWith(root + sep) && full !== root) return null;
  try { return statSync(full).isFile() ? full : null; } catch { return null; }
}

// Every data request, in order: { path, bytes }.
const log = [];
const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, APP);
  const f = fileUnder(DIST, pathname) || (extname(pathname) ? null : join(DIST, 'index.html'));
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  const body = readFileSync(f);
  if (pathname === '/boot.json' || pathname.startsWith('/dest/')) log.push({ path: pathname, bytes: body.length });
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const shardsIn = (entries) => entries.filter((e) => e.path.startsWith('/dest/'));
const sum = (entries) => entries.reduce((a, e) => a + e.bytes, 0);

const browser = await chromium.launch();
try {
  // No service worker: every request must reach the logging server.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });

  console.log(`boot index ${boot.d.length} destinations, ${allShards.length} shards, ${allBytes} bytes of records`);
  console.log('\n1. a map link renders from the boot index and the shards around the origin');
  await page.goto(`${APP}/?xw=map`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.xcontent-map .maplibregl-canvas', { timeout: 45000 });
  const atPaint = log.slice();
  const paintBytes = sum(atPaint);
  const paintShards = shardsIn(atPaint);
  console.log(`        ${paintShards.length} shards: ${paintShards.map((e) => e.path.slice(6, -5)).join(' ')}`);
  if (!atPaint.some((e) => e.path === '/boot.json')) fail('boot.json was not requested');
  if (paintBytes < 2e6) pass(`first paint needed ${paintBytes} bytes (boot.json + ${paintShards.length} shards)`);
  else fail(`first paint needed ${paintBytes} bytes, over 2 MB`);
  if (paintShards.length < allShards.length / 4) pass(`${paintShards.length} of ${allShards.length} shards before first paint`);
  else fail(`${paintShards.length} of ${allShards.length} shards before first paint: not viewport-driven (was the build made with VITE_CATALOGUE=viewport?)`);

  console.log('\n2. standing still fetches nothing');
  await page.waitForTimeout(3000);
  const after = log.length;
  await page.waitForTimeout(2000);
  const cards = await page.locator('.xcontent--split .xcard').count();
  if (log.length === after) pass('no shard fetched while the map stands still at continental zoom');
  else fail(`${log.length - after} requests while idle at continental zoom`);
  if (cards > 0) pass(`the list beside the map shows ${cards} cards from the loaded shards`);
  else fail('the list beside the map is empty');

  console.log('\n3. zooming in and panning fetches shard by shard');
  const canvas = page.locator('.xcontent-map .maplibregl-canvas');
  await canvas.click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  const steps = [];
  const settle = async () => { await page.waitForTimeout(1800); };
  const step = async (label, keys) => {
    const before = log.length;
    for (const k of keys) { await canvas.press(k); await page.waitForTimeout(120); }
    await settle();
    const got = shardsIn(log.slice(before));
    steps.push({ label, n: got.length, bytes: sum(got) });
    console.log(`        ${label.padEnd(22)} ${String(got.length).padStart(3)} shards ${String(sum(got)).padStart(8)} bytes  ${got.map((e) => e.path.slice(6, -5)).join(' ')}`);
  };
  await step('zoom to 6.7', ['=', '=', '=']);
  await step('pan west', ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']);
  await step('pan south', ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']);
  await step('pan east', Array(10).fill('ArrowRight'));
  await step('pan south again', Array(6).fill('ArrowDown'));
  await step('pan back north', Array(12).fill('ArrowUp'));
  const panShards = shardsIn(log.slice(atPaint.length));
  const fetchedStep = steps.filter((s) => s.n > 0).length;
  if (fetchedStep >= 3) pass(`${fetchedStep} of ${steps.length} steps fetched new shards`);
  else fail(`only ${fetchedStep} of ${steps.length} steps fetched anything: the viewport is not driving the load`);
  const maxStep = Math.max(...steps.map((s) => s.bytes));
  if (maxStep < 1.5e6) pass(`largest step fetched ${maxStep} bytes`);
  else fail(`a step fetched ${maxStep} bytes`);
  const loadedNow = shardsIn(log);
  const unique = new Set(loadedNow.map((e) => e.path));
  if (unique.size === loadedNow.length) pass('no shard fetched twice');
  else fail(`${loadedNow.length - unique.size} shard(s) fetched twice`);
  if (unique.size < allShards.length) pass(`after the pan ${unique.size} of ${allShards.length} shards loaded (${sum(loadedNow)} of ${allBytes} bytes)`);
  else fail('the pan loaded every shard');
  console.log(`        pan total: ${panShards.length} shards, ${sum(panShards)} bytes`);

  console.log('\n4. the grid asks for the rest');
  await page.locator('.xbar .xview-toggle button').first().click();
  await page.waitForTimeout(6000);
  const finalShards = new Set(shardsIn(log).map((e) => e.path));
  if (finalShards.size === allShards.length) pass(`grid view loaded all ${allShards.length} shards`);
  else fail(`grid view has ${finalShards.size} of ${allShards.length} shards`);
  const gridCards = await page.locator('.explore-grid .xcard').count();
  if (gridCards > 0) pass(`grid renders (${gridCards} cards)`);
  else fail('grid shows no cards');

  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  else pass('no page errors');
  if (!/boot\.json/.test(bundle)) fail('index.html does not preload boot.json');
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nOK');
process.exit(failed ? 1 : 0);
