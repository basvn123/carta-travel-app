// Headless check of two Explore-tab fixes, in the built app.
//
//   1. The "travelling from" popover is no longer buried under the top bar.
//      It lives in .map-toolrow, which is its own stacking context, so its own
//      z-index could never beat the bar's - the trip-kind chips (City, Beach,
//      Nature...) painted straight over the open list. On phones it was also
//      pinned to a hardcoded 76px, which the chip rail has since grown past.
//      Both are checked the only way that counts: geometry, plus what the
//      browser says is actually on top at a point inside the popover.
//   2. The desktop section tab calls itself Explore, the same name the phone
//      bar uses. One section, one name.
//
// Run from inside continent-app/:  node scripts/verify_from_picker.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4198;
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

const seed = () => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('continent.onboardingSeen.v1', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
};

// What the browser paints on top at a handful of points inside the open
// popover. Returns the offending element's class list, or null when every
// probe lands inside the popover itself.
const whatCoversThePopover = () => {
  const pop = document.querySelector('.origin-pop');
  if (!pop) return 'no popover';
  const b = pop.getBoundingClientRect();
  const probes = [
    [b.left + b.width / 2, b.top + 6],
    [b.left + b.width / 2, b.top + 24],
    [b.left + 12, b.top + 12],
    [b.right - 12, b.top + 12],
  ];
  for (const [x, y] of probes) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest('.origin-pop')) {
      return `${Math.round(x)},${Math.round(y)} hits ${el ? `${el.tagName.toLowerCase()}.${el.className}` : 'nothing'}`;
    }
  }
  return null;
};

const rects = () => {
  const r = (s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
  };
  return { bar: r('.top-bar'), pop: r('.origin-pop'), rail: r('.kind-rail') };
};

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ── Desktop ───────────────────────────────────────────────────────────
  const desk = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await desk.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.addInitScript(seed);

  console.log('loading the Explore tab (desktop)...');
  await page.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await page.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  await page.locator('.result-row').first().waitFor({ timeout: 90000 });

  console.log('\n1. The desktop tab is called Explore');
  const navLabels = await page.locator('.header-nav .header-nav-label').allInnerTexts();
  if (navLabels.some((l) => /^map$/i.test(l.trim()))) fail(`the tabs still read: ${navLabels.join(' / ')}`);
  else pass('no tab calls itself Map');
  const mapTab = page.locator('.header-nav .header-nav-item').nth(1);
  const mapTabLabel = (await mapTab.locator('.header-nav-label').innerText()).trim();
  if (!/explore/i.test(mapTabLabel)) fail(`the map tab reads "${mapTabLabel}"`);
  else pass(`the map tab reads "${mapTabLabel}"`);
  // It must still BE the map tab, not just be named after it.
  await mapTab.click();
  await page.waitForTimeout(600);
  if (!(await page.locator('.map-toolrow .origin-btn').isVisible())) fail('the Explore tab does not open the map');
  else pass('the Explore tab still opens the map');

  console.log('\n2. Desktop: the open From list is on top');
  await page.locator('.map-toolrow .origin-btn').click();
  await page.locator('.origin-pop').waitFor({ timeout: 10000 });
  await page.waitForTimeout(250);
  const deskGeo = await page.evaluate(rects);
  if (deskGeo.pop.top < deskGeo.bar.bottom) fail(`the list starts ${deskGeo.bar.bottom - deskGeo.pop.top}px inside the top bar`);
  else pass(`the list starts ${deskGeo.pop.top - deskGeo.bar.bottom}px below the top bar`);
  const deskCover = await page.evaluate(whatCoversThePopover);
  if (deskCover) fail(`something paints over the list: ${deskCover}`);
  else pass('nothing paints over the list');
  await page.screenshot({ path: `${SHOTS}/from-picker-desktop.png` });
  await desk.close();

  // ── Phone ─────────────────────────────────────────────────────────────
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => fail(`page error (phone): ${e.message}`));
  await p2.addInitScript(seed);

  console.log('\nloading the Explore tab (phone)...');
  await p2.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await p2.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  await p2.waitForTimeout(1200);

  console.log('\n3. Phone: the list clears the chip rail');
  if (!(await p2.locator('.kind-rail').count())) fail('no trip-kind rail on screen to clear');
  else pass('the trip-kind rail is on screen');
  await p2.locator('.map-toolrow .origin-btn').click();
  await p2.locator('.origin-pop').waitFor({ timeout: 10000 });
  await p2.waitForTimeout(250);
  const phoneGeo = await p2.evaluate(rects);
  if (phoneGeo.pop.top < phoneGeo.bar.bottom) fail(`the list starts ${phoneGeo.bar.bottom - phoneGeo.pop.top}px inside the top bar (chips at ${phoneGeo.rail?.top}-${phoneGeo.rail?.bottom})`);
  else pass(`the list starts ${phoneGeo.pop.top - phoneGeo.bar.bottom}px below the chip rail`);
  const phoneCover = await p2.evaluate(whatCoversThePopover);
  if (phoneCover) fail(`something paints over the list: ${phoneCover}`);
  else pass('nothing paints over the list');
  // The search field is the first thing you reach for, so it must take a tap.
  await p2.locator('.origin-pop .origin-search').fill('lisb');
  await p2.waitForTimeout(400);
  const opts = await p2.locator('.origin-opt').allInnerTexts();
  if (!opts.length) fail('searching the list returned nothing');
  else pass(`the search still works through the list (${opts[0].replace(/\n/g, ' ')})`);
  await p2.screenshot({ path: `${SHOTS}/from-picker-phone.png` });

  console.log('\n4. Phone: the strip drops back once the list is shut');
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(300);
  const z = await p2.evaluate(() => getComputedStyle(document.querySelector('.map-toolrow')).zIndex);
  if (Number(z) > 25) fail(`the control strip stayed lifted (z ${z})`);
  else pass(`the control strip dropped back to z ${z}`);

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
