// G12, Explore top round 2 (Lane 3): the filters in a browser. For each
// width and language: every option in the sheet changes the count on "Show
// n places" and switching it off brings the count back; the applied row
// shows one chip per filter with a 44 px remove; a remove keeps focus in the
// row; Clear all empties it; the band does not move; nothing scrolls sideways.
//
//   CARTA_PORT=5330 CARTA_DATA_MIRROR=".../continent-app/public" \
//     SHOTS_DIR=... node scripts/verify_filters.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const PREFIX = process.env.SHOT_PREFIX || 'l3-';
// June, so the day-high bands have a month (Settings' When, df=m).
const JUNE = 'd=2027-06-05&df=m';
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`);
};

async function count(page) {
  const txt = await page.locator('.flt-show').innerText();
  const digits = txt.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
async function settled(page) {
  // The list follows as a deferred value; wait until the count holds still.
  let last = -1;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(150);
    const n = await count(page);
    if (n === last) return n;
    last = n;
  }
  return last;
}
async function openSheet(page, phone) {
  if (!phone) {
    await page.locator('.band-filters').first().click();
  } else if (await page.locator('.xap-filters').count()) {
    await page.locator('.xap-filters').first().click();
  } else {
    await page.locator('.band-input').first().click();
    await page.getByRole('button', { name: /^(Filters|Filter)\b/ }).first().click();
  }
  await page.waitForSelector('.flt-show', { timeout: 10000 });
}

async function run(browser, width, height, lang) {
  const phone = width <= 768;
  const tag = `${width}-${lang}`;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: phone, isMobile: phone });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('continent.lang.v1', l);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.styleStudio.seen.v1', '1');
    } catch { /* storage unavailable */ }
  }, lang);
  await page.goto(`${BASE}?tab=explore&${JUNE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hs-rail, .xrow', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');

  check(`${tag}: no shortcut chip row under the tabs`, (await page.locator('.xsub--rails, .xsub-chip').count()) === 0);
  const bandTop = await page.locator('.band').first().boundingBox();

  await openSheet(page, phone);
  const base = await settled(page);
  check(`${tag}: the sheet opens with a live count`, base > 100, String(base));
  const sheet = await page.locator('.flt').first().boundingBox();
  check(`${tag}: the sheet fits the window`, sheet && sheet.x >= 0 && sheet.x + sheet.width <= width + 1 && sheet.y + sheet.height <= height + 1, JSON.stringify(sheet));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}sheet-${tag}.png`) });

  // Every toggle chip in the sheet: on changes the count, off restores it.
  const chips = page.locator('.flt .flt-chips .ui-chip-filter');
  const n = await chips.count();
  check(`${tag}: the sheet holds the filter options`, n >= 15, String(n));
  const listOn = (await page.locator('.flt [data-group="sort"]').count()) > 0;
  for (let i = 0; i < n; i += 1) {
    const chip = chips.nth(i);
    const label = (await chip.innerText()).trim();
    await chip.click();
    const on = await settled(page);
    await chip.click();
    const off = await settled(page);
    check(`${tag}: "${label}" narrows and reverses`, on < base && on > 0 && off === base, `${base} -> ${on} -> ${off}`);
  }
  // A day: each step narrows, Any restores.
  const steps = page.locator('.flt [data-group="day"] .ui-chip-choice');
  let prev = 0;
  for (let i = 1; i < (await steps.count()); i += 1) {
    await steps.nth(i).click();
    const c = await settled(page);
    check(`${tag}: a day step ${i} narrows, and each step holds at least the one under it`, c < base && c >= prev, `${prev} <= ${c} < ${base}`);
    prev = c;
  }
  await steps.nth(0).click();
  check(`${tag}: Any restores the count`, (await settled(page)) === base);
  check(`${tag}: Sort shows only on a list`, !listOn);

  // Two filters on, then Show: the applied row lists them.
  await page.locator('.flt [data-group="water"] .ui-chip-filter').first().click();
  await page.locator('.flt [data-group="temp"] .ui-chip-filter').nth(1).click();
  const two = await settled(page);
  await page.locator('.flt-show').click();
  await page.waitForTimeout(600);
  const row = page.locator('.xap-chip');
  check(`${tag}: two chips in the applied row`, (await row.count()) === 2, String(await row.count()));
  const x = await page.locator('.xap-x').first().boundingBox();
  check(`${tag}: a chip's remove is 44 px`, x && Math.round(x.width) >= 44 && Math.round(x.height) >= 44, JSON.stringify(x));
  const bandNow = await page.locator('.band').first().boundingBox();
  check(`${tag}: the band did not move`, bandTop && bandNow && Math.abs(bandTop.y - bandNow.y) < 1 && Math.abs(bandTop.height - bandNow.height) < 1,
    `${bandTop?.y},${bandTop?.height} vs ${bandNow?.y},${bandNow?.height}`);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: nothing scrolls sideways`, sw <= 0, String(sw));
  if (!phone) {
    check(`${tag}: Sort, Saved and Share at the row's end`, (await page.locator('.xap-tools .xtool-sort, .xap-tools .xap-saved, .xap-tools .xap-share').count()) === 3);
  }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}applied-${tag}.png`) });
  await page.locator('.xap-x').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  check(`${tag}: one chip left after a remove`, (await row.count()) === 1);
  check(`${tag}: focus stays in the row`, await page.evaluate(() => !!document.activeElement?.closest('.xap')));
  await page.locator('.xap-clear').click();
  await page.waitForTimeout(500);
  check(`${tag}: Clear all empties the row`, (await row.count()) === 0);
  check(`${tag}: ${two} places with two filters`, two > 0 && two < base);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const browser = await chromium.launch();
for (const lang of ['en', 'de']) {
  for (const [w, h] of [[360, 780], [390, 844], [1280, 800], [1440, 900]]) {
    try { await run(browser, w, h, lang); } catch (e) { fails += 1; console.log(`FAIL ${w}-${lang}: ${e.message.split('\n')[0]}`); }
  }
}
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
