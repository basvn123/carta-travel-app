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
// A tap and the time, in the page, from the pointer going down to the
// frame that paints a new "Show n places" (the owner wants it at once:
// about 100 ms). Measured in the page so Playwright's own round trip is out.
async function tapAndTime(page, locator, before) {
  await page.evaluate(() => {
    window.__tap = { down: 0, done: 0 };
    document.addEventListener('pointerdown', () => { window.__tap.down = performance.now(); }, { once: true, capture: true });
    const el = document.querySelector('.flt-show');
    const mo = new MutationObserver(() => {
      mo.disconnect();
      requestAnimationFrame(() => { window.__tap.done = performance.now(); });
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    window.__tapMo = mo;
  });
  await locator.click();
  const t0 = Date.now();
  let n = await count(page);
  while (n === before && Date.now() - t0 < 2000) { await page.waitForTimeout(10); n = await count(page); }
  await page.waitForTimeout(50);
  const ms = await page.evaluate(() => { window.__tapMo?.disconnect(); const t = window.__tap; return t.done && t.down ? t.done - t.down : 9999; });
  return Math.round(ms);
}
async function settled(page) {
  // Wait until the count holds still.
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
  // Measured at rest: the sheet's entrance (a slide up) may still run.
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running' || !x.effect?.target?.closest?.('.flt')), null, { timeout: 3000 }).catch(() => {});
  const sheet = await page.locator('.flt').first().boundingBox();
  check(`${tag}: the sheet fits the window`, sheet && sheet.x >= 0 && sheet.x + sheet.width <= width + 1 && sheet.y + sheet.height <= height + 1, JSON.stringify(sheet));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}sheet-${tag}.png`) });

  // Every toggle chip in the sheet: on changes the count, off restores it.
  const chips = page.locator('.flt .flt-chips .ui-chip-filter');
  const n = await chips.count();
  check(`${tag}: the sheet holds the filter options`, n >= 15, String(n));
  const listOn = (await page.locator('.flt [data-group="sort"]').count()) > 0;
  const lags = [];
  for (let i = 0; i < n; i += 1) {
    const chip = chips.nth(i);
    const label = (await chip.innerText()).trim();
    // G12 map view round 2: every option shows the count it would leave; an
    // option that says 0 (Saved only, with nothing saved) leaves exactly 0.
    const said = await chip.getAttribute('data-count');
    lags.push(await tapAndTime(page, chip, base));
    const on = await settled(page);
    lags.push(await tapAndTime(page, chip, on));
    const off = await settled(page);
    if (said === '0') check(`${tag}: "${label}" says 0, leaves 0 and reverses`, on === 0 && off === base, `${base} -> ${on} -> ${off}`);
    else check(`${tag}: "${label}" narrows and reverses`, on < base && on > 0 && off === base, `${base} -> ${on} -> ${off}`);
  }
  lags.sort((a, b) => a - b);
  const p90 = lags[Math.floor(lags.length * 0.9)];
  check(`${tag}: the count follows a tap at once (pointer down to painted count: median under 100 ms, p90 under 200)`, lags[lags.length >> 1] < 100 && p90 < 200, `median ${lags[lags.length >> 1]} ms, p90 ${p90} ms`);
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

  // Three filters on, then Show: the applied row lists them.
  await page.locator('.flt [data-group="water"] .ui-chip-filter').first().click();
  await page.locator('.flt [data-group="temp"] .ui-chip-filter').nth(1).click();
  const two = await settled(page);
  await page.locator('.flt [data-group="day"] .ui-chip-choice').last().click();
  await settled(page);
  await page.locator('.flt-show').click();
  await page.waitForTimeout(600);
  const row = page.locator('.xap-chip');
  check(`${tag}: three chips in the applied row`, (await row.count()) === 3, String(await row.count()));
  // Judge 1: Clear all read "Cle" on a phone. It stands whole inside the
  // window, never inside the chips' scroller, never shrunk.
  const clear = await page.evaluate(() => {
    const el = document.querySelector('.xap-clear');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const words = el.querySelector('.btn-label') || el;
    return {
      left: Math.round(b.left), right: Math.round(b.right), w: innerWidth,
      cut: words.scrollWidth > words.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1,
      inScroller: !!el.closest('.xap-scroll'),
      text: el.textContent.trim(),
    };
  });
  check(`${tag}: Clear all whole and inside the window`, clear && clear.left >= 0 && clear.right <= clear.w && !clear.cut && !clear.inScroller,
    JSON.stringify(clear));
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
  check(`${tag}: two chips left after a remove`, (await row.count()) === 2);
  check(`${tag}: focus stays in the row`, await page.evaluate(() => !!document.activeElement?.closest('.xap')));
  await page.locator('.xap-clear').click();
  await page.waitForTimeout(500);
  check(`${tag}: Clear all empties the row`, (await row.count()) === 0);
  check(`${tag}: ${two} places with two filters`, two > 0 && two < base);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Judgement-5: the options' counts are said in the app's language, not the
// browser's. An English page on a Dutch browser read "Any 3.855".
async function localeRun(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true, locale: 'nl-NL' });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('carta.styleStudio.seen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(`${BASE}?tab=explore`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hs-rail, .xrow', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await openSheet(page, true);
  await settled(page);
  const said = await page.evaluate(() => ({ nav: navigator.language, counts: [...document.querySelectorAll('.flt-n')].map((e) => e.textContent) }));
  const big = said.counts.filter((c) => c.replace(/\D/g, '').length >= 4);
  check('en page, nl-NL browser: the options\' counts use the English separator (3,855, not 3.855)',
    said.nav === 'nl-NL' && big.length > 0 && big.every((c) => /^\d{1,3}(,\d{3})+$/.test(c)), big.slice(0, 4).join(' '));
  await ctx.close();
}

const browser = await chromium.launch();
try { await localeRun(browser); } catch (e) { fails += 1; console.log(`FAIL locale: ${e.message.split('\n')[0]}`); }
// LANGS=en,de,fr and SIZES=360x640,390x844 pick the runs.
const LANGS = (process.env.LANGS || 'en,de').split(',');
const SIZES = (process.env.SIZES || '360x780,390x844,1280x800,1440x900').split(',').map((s) => s.split('x').map(Number));
for (const lang of LANGS) {
  for (const [w, h] of SIZES) {
    try { await run(browser, w, h, lang); } catch (e) { fails += 1; console.log(`FAIL ${w}-${lang}: ${e.message.split('\n')[0]}`); }
  }
}
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
