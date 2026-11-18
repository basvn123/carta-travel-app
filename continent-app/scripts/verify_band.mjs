// G12 (Explore top, judge 2): the style disc in a browser. It stays bottom
// left on every width and never sits on a card's name or price row, or on
// the Map pill, at rest; it slides out while the list scrolls down and comes
// back at rest; the last row of the list is reachable above it.
//
//   node scripts/verify_band.mjs      (a server at CARTA_PORT, default 5182)
//
// SIZES=360x640,390x844 picks the sizes (default the five of judge 2).
// Shots go to SHOTS_DIR when it is set: j2fix-disc-{w}x{h}-{rest,scrolled}.png.
// Supabase is answered locally (signed out); the service worker is blocked.
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const SIZES = (process.env.SIZES || '360x640,360x780,390x844,820x1180,1440x900')
  .split(',').map((s) => s.split('x').map(Number));
// The same list the disc keeps clear of (src/components/dock/discClear.js).
const CLEAR = '.xrow-line1, .xrc-head, .hs-rcard-name, .xprice, .xform, .card-title, .card-price, .places-card-price, .itin-card-name, .itin-card-cost, .xview-fab';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const browser = await chromium.launch();

// Every visible name or price box the disc meets, with the overlap in px.
const overlaps = (page) => page.evaluate((sel) => {
  const disc = document.querySelector('.dock--corner .dock-trigger');
  if (!disc) return { disc: null, hits: [] };
  const d = disc.getBoundingClientRect();
  const hits = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('.dock--corner')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
    const w = Math.min(d.right, r.right) - Math.max(d.left, r.left);
    const h = Math.min(d.bottom, r.bottom) - Math.max(d.top, r.top);
    if (w > 0 && h > 0) hits.push(`${el.className.split(' ')[0]} "${el.textContent.trim().slice(0, 24)}" ${Math.round(w)}x${Math.round(h)}`);
  }
  return { disc: { x: Math.round(d.left), y: Math.round(d.top), w: Math.round(d.width), h: Math.round(d.height) }, hits };
}, CLEAR);

async function wheel(page, dy, steps = 6) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height * 0.6);
  for (let i = 0; i < steps; i += 1) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(40); }
}

async function run(width, height) {
  const tag = `${width}x${height}`;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(BASE + '?tab=map', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.dock--corner .dock-trigger', { timeout: 90000 });
  await page.waitForSelector('.xprice', { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // At rest on load.
  const rest = await overlaps(page);
  check(`${tag}: disc bottom left`, rest.disc && rest.disc.x + rest.disc.w / 2 < width / 2, JSON.stringify(rest.disc));
  check(`${tag}: disc is a 44 px target or more`, rest.disc && rest.disc.w >= 44 && rest.disc.h >= 44);
  check(`${tag}: at rest the disc meets no name, price or Map pill`, rest.hits.length === 0, rest.hits.join('; '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `j2fix-disc-${tag}-rest.png`) });

  // Scrolling down: the disc slides out; at rest it is back and still clear.
  await page.evaluate(() => {
    const el = document.querySelector('.dock--corner');
    window.__discTucked = false;
    new MutationObserver(() => { if (el.dataset.tucked === '1') window.__discTucked = true; })
      .observe(el, { attributes: true, attributeFilter: ['data-tucked'] });
  });
  await wheel(page, 420);
  check(`${tag}: the disc tucks while the list scrolls down`, await page.evaluate(() => window.__discTucked));
  await page.waitForTimeout(900);
  check(`${tag}: the disc is back at rest`, (await page.locator('.dock--corner').getAttribute('data-tucked')) === null);
  const after = await overlaps(page);
  check(`${tag}: after a scroll, at rest, it meets nothing`, after.hits.length === 0, after.hits.join('; '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `j2fix-disc-${tag}-scrolled.png`) });

  // A few more rest points down the list.
  let worst = [];
  for (let i = 0; i < 4; i += 1) {
    await wheel(page, 260 + i * 90);
    await page.waitForTimeout(900);
    const o = await overlaps(page);
    if (o.hits.length) worst = worst.concat(o.hits);
  }
  check(`${tag}: four more rest points, nothing covered`, worst.length === 0, worst.slice(0, 3).join('; '));

  // The end of the list: its last price is reachable above the disc and the nav.
  // Rails below the fold load as they come near, so the end moves: scroll
  // to it until it stays put.
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.explore-tab, .places-tab')) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(900);
  }
  const end = await page.evaluate(() => {
    const prices = [...document.querySelectorAll('.xprice')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.left < innerWidth && r.right > 0;
    });
    const lastP = prices.sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom).pop();
    const nav = document.querySelector('.bottom-nav');
    const floor = nav && nav.getBoundingClientRect().height ? nav.getBoundingClientRect().top : innerHeight;
    return { last: lastP ? Math.round(lastP.getBoundingClientRect().bottom) : null, floor: Math.round(floor) };
  });
  check(`${tag}: the last price sits above the bottom bar`, end.last !== null && end.last <= end.floor, JSON.stringify(end));
  const endO = await overlaps(page);
  check(`${tag}: at the end of the list the disc meets nothing`, endO.hits.length === 0, endO.hits.join('; '));

  // The layer tabs and the trip library carry the disc too: at rest and
  // after one scroll it meets no card's name or price there either.
  for (const cat of ['trails', 'beaches', 'trips']) {
    await page.goto(BASE + `?tab=explore&cat=${cat}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('.dock--corner .dock-trigger', { timeout: 90000 });
    await page.waitForSelector('.card-title', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const a = await overlaps(page);
    await wheel(page, 380);
    await page.waitForTimeout(900);
    const b = await overlaps(page);
    check(`${tag} ${cat}: disc bottom left, meets nothing at rest and after a scroll`,
      a.disc && a.disc.x + a.disc.w / 2 < width / 2 && !a.hits.length && !b.hits.length, [...a.hits, ...b.hits].join('; '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `j2fix-disc-${tag}-${cat}.png`) });
  }

  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
  return { tag, rest, after };
}

const out = [];
for (const [w, h] of SIZES) out.push(await run(w, h));
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
for (const o of out) console.log(`${o.tag}: disc ${JSON.stringify(o.rest.disc)} rest hits ${o.rest.hits.length}, after scroll ${o.after.hits.length}`);
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
