// G12 (explore polish, decision.md steps 3 and 4): the Trip dock under the
// category tabs and the style disc in the bottom-left corner, in a browser.
// Since the Style Studio (2026-11-18) the disc and the Trip dock's style row
// open the studio; the disc grows no card.
//
//   node scripts/verify_docks.mjs      (dev server at CARTA_PORT, default 5182)
//
// At 390 and 1440: the Trip dock opens, Escape closes it and gives focus
// back to its trigger, a phone card spans the screen (viewport minus at most
// 16 px), the style row and the disc open the studio (full width on a phone,
// at most 560 px wide on a desktop), nothing scrolls sideways, and the disc
// is absent on Plan. Supabase is answered locally (signed out).
// Shots go to SHOTS_DIR when it is set: shot-dock-{trip,style}-{width}.png.
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });

const browser = await chromium.launch();

async function noOverflow(page) {
  return page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth);
}

async function run(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await mirrorData(page);
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
    } catch { /* storage unavailable */ }
  });
  await page.goto(BASE + '?tab=map', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.app', { timeout: 60000 });
  const tripBtn = page.locator('.trip-dock .dock-trigger:visible').first();
  const tripShown = await tripBtn.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false);
  check(`${width}: Trip dock trigger on the Explore overview`, tripShown);
  const styleBtn = page.locator('.dock--corner .dock-trigger');
  check(`${width}: style disc on Explore`, await styleBtn.isVisible().catch(() => false));
  check(`${width}: no sideways scroll, docks closed`, await noOverflow(page));
  if (!tripShown) { await page.close(); return; }
  await page.waitForTimeout(800);

  // Trip dock: opens, its rows are the four of decision.md change 1.
  await tripBtn.click();
  const tripCard = page.locator('.dock-card--under-tabs.is-open');
  check(`${width}: Trip dock opens`, await tripCard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(500);
  const rows = await tripCard.locator('[data-dock-row]').evaluateAll((els) => els.map((e) => e.dataset.dockRow));
  check(`${width}: Trip rows are style, from, when (and prices)`, rows.slice(0, 3).join() === 'style,from,when' && rows.every((r) => ['style', 'from', 'when', 'prices'].includes(r)), rows.join());
  const tripBox = await tripCard.boundingBox();
  if (width < 769) {
    check(`${width}: Trip card spans the screen`, tripBox && tripBox.width >= width - 16, `${tripBox?.width}`);
    check(`${width}: Trip card is a modal`, (await tripCard.getAttribute('aria-modal')) === 'true');
  } else {
    check(`${width}: Trip card is a popover`, (await tripCard.getAttribute('aria-modal')) === 'false');
    check(`${width}: Trip card inside the screen`, tripBox && tripBox.x >= 0 && tripBox.x + tripBox.width <= width, `${tripBox?.x},${tripBox?.width}`);
  }
  check(`${width}: no sideways scroll, Trip open`, await noOverflow(page));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shot-dock-trip-${width}.png`) });

  // The From row drills in; Escape steps back, then closes and returns focus.
  await tripCard.locator('[data-dock-row="from"]').click();
  check(`${width}: From drills in`, await tripCard.locator('.trip-dock-drill').isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(`${width}: Escape steps back to the rows`, await tripCard.locator('.trip-dock-rows').isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${width}: Escape closes the Trip dock`, (await page.locator('.dock-card--under-tabs.is-open').count()) === 0);
  check(`${width}: focus back on the Trip trigger`, await tripBtn.evaluate((el) => el === document.activeElement));

  // The style (Style Studio, G12, 2026-11-18): the Trip dock's style row and
  // the corner disc both open the studio's overview; the disc grows no card
  // of its own, so the studio is the one place a style changes.
  const studio = page.locator('.fsheet.sst[role="dialog"]');
  await tripBtn.click();
  await page.waitForTimeout(400);
  const styleRow = page.locator('.dock-card--under-tabs.is-open [data-dock-row="style"]');
  if (await styleRow.count()) {
    await styleRow.click();
    check(`${width}: the Style row opens the studio`, await studio.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
    check(`${width}: the Style row hands over (Trip closed)`, (await page.locator('.dock-card--under-tabs.is-open').count()) === 0);
    await page.keyboard.press('Escape');
    await studio.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  } else {
    check(`${width}: the Trip dock has a Style row`, false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  await styleBtn.click();
  check(`${width}: the disc opens the studio`, await studio.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
  check(`${width}: on its overview`, !/\bis-wizard\b/.test((await studio.getAttribute('class').catch(() => '')) || ''));
  check(`${width}: the disc grows no card`, (await page.locator('.dock-card--corner.is-open').count()) === 0);
  await page.waitForTimeout(500);
  const box = await studio.boundingBox();
  if (width < 769) check(`${width}: the studio spans the screen`, box && box.width >= width - 1, `${box?.width}`);
  else check(`${width}: the studio inside the screen`, box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.width <= 560, `${box?.x},${box?.width}`);
  check(`${width}: no sideways scroll, studio open`, await noOverflow(page)
    && await studio.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shot-dock-style-${width}.png`) });
  await page.keyboard.press('Escape');
  await studio.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  check(`${width}: Escape closes the studio`, (await studio.count()) === 0);
  check(`${width}: focus back on the Style disc`, await styleBtn.evaluate((el) => el === document.activeElement));

  // Destinations: the Trip dock sits under its tabs too.
  await page.goto(BASE + '?tab=places', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 60000 });
  check(`${width}: Trip dock on Destinations`, await page.locator('.dtab-sub .dock-trigger').waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false));
  check(`${width}: no sideways scroll on Destinations`, await noOverflow(page));
  if (width >= 769) check(`${width}: no header settings line on Destinations`, (await page.locator('.top-bar .settings-line').count()) === 0);

  // Plan: the corner belongs to the planner.
  await page.goto(BASE + '?tab=plan', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 60000 });
  await page.waitForTimeout(1500);
  check(`${width}: style disc absent on Plan`, (await page.locator('.dock--corner').count()) === 0);

  check(`${width}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// WIDTHS=390,768,1440 adds widths (768 is a phone layout: modal docks).
const WIDTHS = (process.env.WIDTHS || '390,1440').split(',').map(Number);
for (const w of WIDTHS) await run(w, w < 769 ? 844 : 900);
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
