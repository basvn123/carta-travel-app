// Headless verify for the browse chrome since G12 (Explore top, 2026-11-18):
// the header on the page ground with one active place, the band in the top
// bar (the search with Ask inside, Settings on Places at desktop width, the
// settings line under it), the six tabs, a layer with no Settings and no side
// panel, the list rows, and on a phone the band with the tabs and the chip
// row, no side panel, no sideways scroll. The earlier checks (the header
// search slot, the side filter panel, the settings line, the guided search
// button) went with the parts G12 removed.
//
//   node scripts/verify_desktop_shell.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
//
// Screenshots to shots/desktop-explore.png, shots/desktop-layer.png,
// shots/mobile-explore.png.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
// A local build fetches flights from R2, which answers CORS for its own hosts only.
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\./;

async function open(width, height, path) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await mirrorData(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}: pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${width}: console: ${m.text().slice(0, 120)}`); });
  await page.goto(URL + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.band-input', { timeout: 120000 });
  await page.waitForTimeout(3500);
  return page;
}
const bg = (page, sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ── Desktop: Places ──
const desk = await open(1600, 900, '?tab=map');
check('top bar sits on the page ground', (await bg(desk, '.top-bar')) === 'rgb(238, 240, 234)', await bg(desk, '.top-bar'));
check('a header place is active', await desk.locator('.header-nav-item.active').count() === 1);
check('the band search is in the top bar', await desk.locator('.top-bar .band.is-desk .band-input').isVisible());
check('Ask sits inside the search', await desk.locator('.band-search .band-ask').isVisible());
check('Settings shows on Places', await desk.locator('.band-settings').isVisible());
check('the settings line has its five items', await desk.locator('.band-line .band-chip-text').count() === 5,
  String(await desk.locator('.band-line .band-chip-text').count()));
check('no side filter panel', await desk.locator('.explore-side, .places-side').count() === 0);
check('the six tabs show', await desk.locator('[role="tablist"] [role="tab"]:visible').count() >= 6);
const top0 = await desk.locator('.band').boundingBox();
await desk.mouse.wheel(0, 1200);
await desk.waitForTimeout(800);
const top1 = await desk.locator('.band').boundingBox();
check('the band stays at the top on scroll', !!top0 && !!top1 && Math.abs(top0.y - top1.y) < 2, `${top0?.y} ${top1?.y}`);
await desk.locator('.band-settings').click();
await desk.waitForTimeout(800);
check('Settings opens docked beside the list', await desk.locator('.set-dock').isVisible()
  && await desk.evaluate(() => document.documentElement.classList.contains('has-settings-dock')));
await desk.screenshot({ path: 'shots/desktop-explore.png' });
check('desktop: no sideways scroll', await noSideScroll(desk));

// ── Desktop: a layer ──
const layer = await open(1600, 900, '?tab=explore&cat=trails');
check('a layer keeps the band search', await layer.locator('.band-input').isVisible());
check('a layer has no Settings button', await layer.locator('.band-settings').count() === 0);
check('a layer has no side panel', await layer.locator('.places-side, .explore-side').count() === 0);
await layer.screenshot({ path: 'shots/desktop-layer.png' });

// ── Phone ──
const phone = await open(390, 844, '?tab=map');
check('phone: the band search shows', await phone.locator('.band.is-phone .band-input').isVisible());
check('phone: no Settings button (the chips are the doors)', await phone.locator('.band-settings').count() === 0);
check('phone: the chip row shows full words', await phone.evaluate(() => {
  const chips = [...document.querySelectorAll('.band-chip-text')];
  return chips.length === 5 && chips.every((c) => c.scrollWidth <= c.clientWidth + 1);
}));
check('phone: the tabs sit in the band', await phone.locator('.band-tabs [role="tab"]').count() >= 6);
check('phone: no side panel', await phone.locator('.side-panel').count() === 0);
check('phone: a list row has its name', (await phone.locator('.xrow-name, .hs-rcard .xrc-name, .xrc .xrc-head').first().innerText().catch(() => '')).trim().length > 1);
check('phone: no sideways scroll', await noSideScroll(phone));
await phone.screenshot({ path: 'shots/mobile-explore.png' });

// ── Report ──
let fail = 0;
for (const c of checks) {
  if (!c.ok) fail += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (errors.length) console.log('\nerrors:\n' + errors.join('\n'));
console.log(`\n${checks.length - fail}/${checks.length} passed`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
