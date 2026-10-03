/**
 * verify_status_banner.mjs, the data host status line in a real browser
 * (T316, register T218-a; src/lib/statusFile.js, AnnouncementBar.jsx).
 *
 * Start a dev server whose data host is a loopback stand-in that does not
 * exist; this script answers every request to it with Playwright, serving
 * public/ for the shards and a status.json it changes per scenario:
 *
 *   VITE_DATA_BASE=http://127.0.0.1:59999/data npx vite --port 5206 --strictPort
 *   node scripts/verify_status_banner.mjs
 *
 * CARTA_BASE overrides the app URL (default http://localhost:5206). No
 * Supabase keys are needed: without them the site notice is silent, which is
 * the outage this file exists for. Screenshots go to shots/status-*.png.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(APP_ROOT, 'public');
const BASE = process.env.CARTA_BASE || 'http://localhost:5206';
const STANDIN = 'http://127.0.0.1:59999';
const SHOTS = join(APP_ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

let failed = false;
const check = (label, ok, extra = '') => {
  if (!ok) failed = true;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
};

const LIVE = {
  enabled: true,
  tone: 'warn',
  text: 'Signing in and saving trips are down. Your trips are safe, and the map and prices still work.',
  until: new Date(Date.now() + 6 * 3600e3).toISOString(),
};

function fileUnder(root, p) {
  const full = normalize(join(root, decodeURIComponent(p)));
  if (!full.startsWith(root + sep)) return null;
  try { return statSync(full).isFile() ? full : null; } catch { return null; }
}

async function open(browser, { width, height, status, delay = 0, lang = 'en', dismissed = null }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const statusHits = [];
  await ctx.route(`${STANDIN}/**`, (route) => serve(route).catch(() => { /* aborted by the app's timeout */ }));
  async function serve(route) {
    const origin = route.request().headers().origin || BASE;
    const cors = { 'access-control-allow-origin': origin, vary: 'Origin' };
    const path = new URL(route.request().url()).pathname.replace(/^\/data/, '');
    if (path === '/status.json') {
      statusHits.push(Date.now());
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (status === undefined) return route.fulfill({ status: 404, headers: cors, body: 'NoSuchKey' });
      const body = typeof status === 'string' ? status : JSON.stringify(status);
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body });
    }
    const f = fileUnder(PUB, path);
    if (!f) return route.fulfill({ status: 404, headers: cors, body: 'NoSuchKey' });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: readFileSync(f) });
  }
  await ctx.addInitScript(({ l, d }) => {
    try {
      localStorage.setItem('continent.lang.v1', l);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
      if (d !== null && !sessionStorage.getItem('t316.seeded')) {
        localStorage.setItem('carta.banner.dismissed.v1', d);
        sessionStorage.setItem('t316.seeded', '1');
      }
    } catch { /* storage unavailable */ }
  }, { l: lang, d: dismissed });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.places-tab', { state: 'visible', timeout: 45000 }).catch(() => {});
  return { ctx, page, statusHits, errors };
}

const banner = (page) => page.locator('.site-banner[data-source="status"]');

async function settle(page, ms = 1500) { await page.waitForTimeout(ms); }

const browser = await chromium.launch();
try {
  console.log('1. silent states');
  for (const [label, status] of [
    ['no file (404)', undefined],
    ['the quiet baseline {"enabled": false}', { enabled: false }],
    ['an expired line', { ...LIVE, until: '2026-01-01T00:00:00Z' }],
    ['malformed JSON', '{"enabled": true, "text": "half'],
    ['an HTML error page with 200', '<!doctype html><title>oops</title>'],
  ]) {
    const { ctx, page, statusHits, errors } = await open(browser, { width: 1440, height: 900, status });
    await settle(page);
    const booted = await page.locator('.places-tab').isVisible();
    check(`${label}: no banner, app booted`, booted && (await page.locator('.site-banner').count()) === 0
      && errors.length === 0, `${statusHits.length} request(s)${errors.length ? `, ${errors[0]}` : ''}`);
    await ctx.close();
  }

  console.log('\n2. a live line, desktop and 380px');
  for (const [w, h, name] of [[1440, 900, 'desktop'], [380, 800, 'phone']]) {
    const { ctx, page, statusHits, errors } = await open(browser, { width: w, height: h, status: LIVE });
    await banner(page).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await settle(page, 800);
    const b = banner(page);
    const visible = await b.isVisible();
    check(`${name}: the status line shows`, visible);
    if (visible) {
      check(`${name}: warn tone`, await b.evaluate((el) => el.classList.contains('warn')));
      check(`${name}: the owner's text, whole`, (await b.locator('.site-banner-text').innerText()).trim() === LIVE.text);
      check(`${name}: role=status for screen readers`, (await b.getAttribute('role')) === 'status');
      const box = await b.boundingBox();
      check(`${name}: inside the viewport`, box && box.x >= 0 && box.x + box.width <= w && box.y + box.height <= h,
        box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${name}: no horizontal scroll`, overflow <= 0, `${overflow}px`);
      if (name === 'phone') {
        const nav = await page.locator('.bottom-nav').first().boundingBox().catch(() => null);
        check('phone: sits above the bottom bar', !nav || box.y + box.height <= nav.y, nav ? `nav top ${Math.round(nav.y)}` : 'no nav');
        const close = await b.locator('.site-banner-close').boundingBox();
        check('phone: dismiss button is reachable', !!close && close.width >= 24 && close.height >= 24,
          close ? `${Math.round(close.width)}x${Math.round(close.height)}` : 'none');
      }
      await page.screenshot({ path: join(SHOTS, `status-${name}.png`) });
    }
    check(`${name}: one request per page load`, statusHits.length === 1, String(statusHits.length));
    check(`${name}: no page errors`, errors.length === 0, errors[0] || '');
    await ctx.close();
  }

  console.log('\n3. dismissal, and a new line coming back');
  {
    const { ctx, page } = await open(browser, { width: 1440, height: 900, status: LIVE });
    await banner(page).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await banner(page).locator('.site-banner-close').click();
    check('the close button hides it', (await page.locator('.site-banner').count()) === 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.places-tab', { state: 'visible', timeout: 45000 }).catch(() => {});
    await settle(page);
    check('the same line stays gone after a reload', (await page.locator('.site-banner').count()) === 0);
    await ctx.close();
    const next = { ...LIVE, text: 'Signing in works again. Saving trips is still down.' };
    const again = await open(browser, { width: 1440, height: 900, status: next, dismissed: LIVE.text });
    await banner(again.page).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    check('a changed line shows again', await banner(again.page).isVisible());
    await again.ctx.close();
  }

  console.log('\n4. language and a slow host');
  {
    const raw = { ...LIVE, text: { en: 'Signing in is down.', nl: 'Inloggen werkt nu niet.' } };
    const { ctx, page } = await open(browser, { width: 1440, height: 900, status: raw, lang: 'nl' });
    await banner(page).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const txt = await banner(page).locator('.site-banner-text').innerText().catch(() => '');
    check('Dutch traveller reads the Dutch line', txt.trim() === 'Inloggen werkt nu niet.', txt);
    await ctx.close();
  }
  {
    const t0 = Date.now();
    const { ctx, page, errors } = await open(browser, { width: 1440, height: 900, status: LIVE, delay: 8000 });
    const bootMs = Date.now() - t0;
    check('a hung data host does not hold the app back', await page.locator('.places-tab').isVisible(), `${bootMs} ms to the places tab`);
    await page.waitForTimeout(9000);
    check('a reply after the 3 s timeout is ignored', (await page.locator('.site-banner').count()) === 0);
    check('no page errors', errors.length === 0, errors[0] || '');
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (!existsSync(join(SHOTS, 'status-phone.png'))) failed = true;
console.log(failed ? '\nverify_status_banner FAILED' : '\nverify_status_banner OK');
process.exit(failed ? 1 : 0);
