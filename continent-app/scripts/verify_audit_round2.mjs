// Headless check of the second UI/UX audit's fixes, in the built app.
//
// What it asserts, in the order the audit raised it:
//   1. Ratings are no longer painted in the alert accent, and the wizard's map
//      instruction passes WCAG AA instead of being grey mono capitals.
//   2. A saved day plan reads as a row you open (chevron, 44px delete target),
//      not as a filled-in text field with a small cross.
//   3. The calendar never marks "today" inside a month it does not belong to
//      (the 6-week grid pads with the neighbouring months' days).
//   4. Both "how do you want to plan it" cards carry their own action.
//   5. The day's numbered pins: every stop number present exactly once, none
//      buried under another pin or under a candidate place pin, and OSRM is
//      asked with unlimited snapping so the route follows streets.
//   6. Place names on map pins are not clipped, and the sidebar reserves a
//      scrollbar gutter instead of letting the bar cut the timeline rail.
//
// Run from inside continent-app/:  node scripts/verify_audit_round2.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4195;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

let failed = 0;
const fail = (msg) => { failed += 1; console.error('  FAIL:', msg); };
const pass = (msg) => console.log('  ok:', msg);

// Contrast per WCAG 2.1, computed in the page from the colours that actually
// rendered (tokens, inheritance and the minifier all get a say).
const CONTRAST_FN = `(fg, bg) => {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const p = (s) => (s.match(/\\d+(\\.\\d+)?/g) || []).map(Number).slice(0, 3);
  const a = lum(p(fg)), b = lum(p(bg));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}`;

// Salzburg, six stops, three of which are neighbours in the old town: exactly
// the cluster that used to bury a stop number under the pin drawn after it.
const PLAN_ID = 'local:audit2';
const STOPS = [2, 11, 1, 4, 5, 7];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));

  const routeCalls = [];
  page.on('request', (r) => {
    if (r.url().includes('routed-foot')) routeCalls.push(r.url());
  });

  await page.addInitScript(({ planId, stops }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: planId, label: 'Salzburg day', startDate: '2026-08-04',
      stops: [{ destinationId: 'SZG', days: 1 }],
    }]));
    localStorage.setItem(`carta.dayplan.${planId}`, JSON.stringify({ 0: { 0: stops } }));
  }, { planId: PLAN_ID, stops: STOPS });

  console.log('loading app...');
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.locator('.day-flow-step').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);

  console.log('\n1. Ratings read as a measure, instructions are legible');
  const chip = page.locator('.day-flow-chip .score-chip').first();
  await chip.waitFor({ timeout: 30000 });
  const chipC = await chip.evaluate((el, fn) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color, contrast: eval(fn)(s.color, s.backgroundColor) };
  }, CONTRAST_FN);
  const chipRgb = (chipC.bg.match(/\d+/g) || []).map(Number);
  if (chipRgb[0] > 150 && chipRgb[0] - chipRgb[2] > 60 && chipRgb[1] < 120) {
    fail(`rating chip is still alert-red: ${chipC.bg}`);
  } else pass(`rating chip fill is ${chipC.bg}`);
  if (chipC.contrast < 4.5) fail(`rating chip text contrast ${chipC.contrast}:1`);
  else pass(`rating chip text contrast ${chipC.contrast}:1`);
  // The same chip on the map pins follows the same token.
  const pinRate = await page.locator('.dem-pin-rate').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
  if (pinRate && pinRate !== chipC.bg) fail(`map pin rating uses ${pinRate}, chip uses ${chipC.bg}`);
  else pass('map pin ratings share the rating colour');

  // The wizard's map caption was asserted here until commit 6493177c took
  // the landing map out altogether. Nothing left to measure.

  console.log('\n2. A saved plan reads as a row you can open');
  const rowInfo = await page.$$eval('.trip-saved-item', (els) => els.map((e) => ({
    h: Math.round(e.getBoundingClientRect().height),
    del: (() => { const d = e.querySelector('.trip-saved-del'); if (!d) return null; const r = d.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    chevron: !!e.querySelector('.trip-saved-go svg'),
  })));
  if (!rowInfo.length) fail('no saved plan row rendered');
  rowInfo.forEach((r, i) => {
    if (r.del && (r.del[0] < 44 || r.del[1] < 44)) fail(`row ${i} delete target is ${r.del.join('x')}px`);
    if (!r.chevron) fail(`row ${i} has no chevron affordance`);
  });
  if (!failed) pass(`saved rows: ${JSON.stringify(rowInfo)}`);

  console.log('\n3. The calendar marks today only inside its own month');
  await page.locator('.day-flow-chip').first().click();
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-date').waitFor({ timeout: 20000 });
  const before = await page.evaluate(() => ({
    title: document.querySelector('.cal-title')?.textContent.trim(),
    today: [...document.querySelectorAll('.cal-day.today')].map((e) => e.textContent),
  }));
  if (before.today.length !== 1) fail(`this month shows ${before.today.length} today markers`);
  else pass(`${before.title} marks today once (${before.today[0]})`);
  // Next month: its grid pads with the tail of this one, today included.
  await page.locator('.cal-nav').nth(1).click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    title: document.querySelector('.cal-title')?.textContent.trim(),
    today: [...document.querySelectorAll('.cal-day.today')].map((e) => ({ d: e.textContent, outside: e.classList.contains('outside') })),
    padded: [...document.querySelectorAll('.cal-day.outside')].map((e) => e.textContent),
  }));
  if (after.today.length) fail(`${after.title} still marks ${JSON.stringify(after.today)} as today`);
  else pass(`${after.title} marks no day as today (padding days: ${after.padded.join(' ')})`);
  await page.screenshot({ path: `${SHOTS}/round2-when.png` });
  await page.locator('.cal-nav').first().click();

  console.log('\n4. Both planning routes look pressable');
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 20000 });
  const gos = await page.$$eval('.day-flow-card', (els) => els.map((e) => ({
    title: e.querySelector('b')?.textContent,
    go: e.querySelector('.day-flow-card-go')?.textContent || null,
  })));
  const missing = gos.filter((g) => !g.go);
  if (missing.length) fail(`cards with no action: ${missing.map((m) => m.title).join(', ')}`);
  else pass(`both cards end in an action: ${gos.map((g) => `${g.title} -> ${g.go}`).join(' | ')}`);
  await page.screenshot({ path: `${SHOTS}/round2-how.png` });
  // The fork stacks on a phone: the actions must still be inside their cards.
  await page.setViewportSize({ width: 412, height: 900 });
  await page.waitForTimeout(500);
  const spill = await page.$$eval('.day-flow-card', (els) => els.filter((e) => {
    const c = e.getBoundingClientRect();
    const g = e.querySelector('.day-flow-card-go')?.getBoundingClientRect();
    return g && (g.right > c.right + 1 || g.bottom > c.bottom + 1);
  }).length);
  if (spill) fail(`${spill} card action(s) overflow their card at 412px`);
  else pass('card actions sit inside their cards on a phone');
  await page.screenshot({ path: `${SHOTS}/round2-how-mobile.png` });
  await page.setViewportSize({ width: 1500, height: 980 });
  await page.waitForTimeout(400);

  console.log('\n5. The day on the map: every stop number readable');
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  const card = page.locator('.trip-saved-main', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  await card.click();
  await page.locator('.dayws-tabs').waitFor({ timeout: 60000 });
  const rows = page.locator('.dayr-row');
  await rows.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(5000); // give OSRM its answer and the map its settle

  const pins = await page.$$eval('.trip-pin', (els) => els.map((e) => {
    const shape = e.querySelector('.trip-pin-shape');
    const num = e.querySelector('.trip-pin-no');
    const r = shape.getBoundingClientRect();
    // The teardrop is rotated 45deg and the number counter-rotated inside it,
    // so only the COMPOSED matrix says whether the digit reads upright. The
    // marker element's own transform is maplibre's translate, which is why any
    // rotation we put there was silently dropped.
    let m = new DOMMatrix();
    for (let el = num; el && el !== e.parentElement; el = el.parentElement) {
      m = new DOMMatrix(getComputedStyle(el).transform).multiply(m);
    }
    return {
      n: num?.textContent || '',
      stay: e.className.includes('stay'),
      cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
      tilt: Math.round(Math.atan2(m.b, m.a) * (180 / Math.PI)),
      z: getComputedStyle(e).zIndex,
    };
  }));
  const nums = pins.filter((p) => !p.stay).map((p) => p.n);
  const timelineNums = await page.$$eval('.dayr-no', (els) => els.map((e) => e.textContent));
  if (new Set(nums).size !== nums.length) fail(`duplicate stop numbers on the map: ${nums.join(',')}`);
  else pass(`map numbers unique: ${nums.join(',')}`);
  if (nums.join(',') !== timelineNums.join(',')) {
    fail(`map numbers ${nums.join(',')} do not match the route list ${timelineNums.join(',')}`);
  } else pass(`map and route list agree: ${timelineNums.join(',')}`);
  // Nothing may be buried: pin centres must stand at least a pin apart.
  let closest = Infinity;
  for (let i = 0; i < pins.length; i += 1) {
    for (let j = i + 1; j < pins.length; j += 1) {
      closest = Math.min(closest, Math.hypot(pins[i].cx - pins[j].cx, pins[i].cy - pins[j].cy));
    }
  }
  if (closest < 22) fail(`two stop pins are ${Math.round(closest)}px apart, one is hidden`);
  else pass(`closest two stop pins stand ${Math.round(closest)}px apart`);
  // The number itself must be upright (it used to render at -45deg, which is
  // how a 6 came to read as a 9 and a 1 as a stroke).
  const tilted = pins.filter((p) => !p.stay && Math.abs(p.tilt) > 1);
  if (tilted.length) fail(`stop numbers are rotated ${tilted.map((p) => `${p.n}:${p.tilt}deg`).join(', ')}`);
  else pass('stop numbers render upright');
  // A numbered stop must draw over candidate place pins.
  const zPoi = await page.locator('.trip-poi-pin').first().evaluate((el) => getComputedStyle(el).zIndex).catch(() => 'auto');
  const zStop = pins[0]?.z;
  if (!(Number(zStop) > 0) || (Number(zPoi) > Number(zStop))) fail(`stop pin z-index ${zStop} vs poi ${zPoi}`);
  else pass(`stop pins sit above candidate pins (z ${zStop} vs ${zPoi})`);
  // POI labels: pins whose declutter state still shows a name must show it whole.
  const clipped = await page.$$eval('.trip-poi-pin:not(.is-tight):not(.is-dot) .dem-pin-lbl', (els) => els
    .filter((e) => e.scrollWidth > e.clientWidth + 1)
    .map((e) => e.textContent));
  if (clipped.length) fail(`clipped map labels: ${clipped.slice(0, 4).join(' | ')}`);
  else pass('no map label is clipped');

  console.log('\n6. Routing and layout');
  const snapped = routeCalls.filter((u) => u.includes('radiuses=unlimited'));
  if (!routeCalls.length) fail('no walking route was requested');
  else if (!snapped.length) fail(`route asked without snapping: ${routeCalls[0]}`);
  else pass(`${snapped.length}/${routeCalls.length} route requests use unlimited snapping`);
  const gutter = await page.locator('.trip-sheet-scroll').evaluate((el) => getComputedStyle(el).scrollbarGutter);
  if (gutter !== 'stable') fail(`sidebar scrollbar-gutter is ${gutter}`);
  else pass('sidebar reserves a stable scrollbar gutter');

  await page.screenshot({ path: `${SHOTS}/round2-day.png` });
  await page.locator('.trip-map').screenshot({ path: `${SHOTS}/round2-day-map.png` });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
