// G12 (explore polish, decision.md steps 3 and 4): the Trip dock under the
// category tabs and the Style dock in the bottom-left corner, in a browser.
//
//   node scripts/verify_docks.mjs      (dev server at CARTA_PORT, default 5182)
//
// At 390 and 1440: each dock opens, opening one closes the other, Escape
// closes it and gives focus back to its trigger, a phone card spans the
// screen (viewport minus at most 16 px), nothing scrolls sideways, and the
// Style dock is absent on Plan. Supabase is answered locally (signed out).
// Shots go to SHOTS_DIR when it is set: shot-dock-{trip,style}-{width}.png.
import { chromium } from 'playwright';
import path from 'node:path';

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
  check(`${width}: Style dock disc on Explore`, await styleBtn.isVisible().catch(() => false));
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

  // Style dock: opens, closes the Trip dock when the Trip row hands over.
  await tripBtn.click();
  await page.waitForTimeout(400);
  const styleRow = page.locator('.dock-card--under-tabs.is-open [data-dock-row="style"]');
  if (await styleRow.count()) {
    await styleRow.click();
    await page.waitForTimeout(500);
    check(`${width}: the Style row hands over (Trip closed)`, (await page.locator('.dock-card--under-tabs.is-open').count()) === 0);
  } else {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await styleBtn.click();
  }
  const styleCard = page.locator('.dock-card--corner.is-open');
  check(`${width}: Style dock opens`, await styleCard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(500);
  // A first visit has no style: pick "On my own", then the card shows the
  // style list and its halves (the state most travellers see).
  const tpl = styleCard.locator('.style-dock-templates .tstyle-tpl').first();
  if (await tpl.isVisible().catch(() => false)) {
    await tpl.click();
    await page.waitForTimeout(600);
  }
  check(`${width}: Style dock lists the styles as a radiogroup`, (await styleCard.locator('[role="radiogroup"] [role="radio"]').count()) >= 1);
  check(`${width}: Style dock has its halves and foot`, (await styleCard.locator('.style-dock-halves').count()) === 1
    && (await styleCard.locator('.style-dock-foot').count()) === 1);
  for (const row of ['who', 'stay', 'food', 'way', 'priority']) {
    if (!(await styleCard.locator(`[data-dock-row="${row}"]`).count())) check(`${width}: Stay half row ${row}`, false);
  }
  const styleBox = await styleCard.boundingBox();
  if (width < 769) check(`${width}: Style card spans the screen`, styleBox && styleBox.width >= width - 16, `${styleBox?.width}`);
  else check(`${width}: Style card inside the screen`, styleBox && styleBox.x >= 0 && styleBox.y >= 0 && styleBox.x + styleBox.width <= width, `${styleBox?.x},${styleBox?.y}`);
  check(`${width}: no sideways scroll, Style open`, await noOverflow(page));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shot-dock-style-${width}.png`) });

  // Opening the Trip dock closes the Style dock (desktop: both triggers live).
  if (width >= 769) {
    await tripBtn.click();
    await page.waitForTimeout(400);
    check(`${width}: Trip opening closes Style`, (await page.locator('.dock-card--corner.is-open').count()) === 0
      && (await page.locator('.dock-card--under-tabs.is-open').count()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await styleBtn.click();
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${width}: Escape closes the Style dock`, (await page.locator('.dock-card--corner.is-open').count()) === 0);
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
  check(`${width}: Style dock absent on Plan`, (await page.locator('.dock--corner').count()) === 0);

  check(`${width}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

await run(390, 844);
await run(1440, 900);
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
