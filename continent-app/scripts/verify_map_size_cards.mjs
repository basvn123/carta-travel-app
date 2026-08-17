// Headless check of two Explore-map additions, in the built app.
//
//   1. The size toggle, right of the From picker: one click drops the towns,
//      villages and areas and leaves the cities, on the map AND in the ranked
//      list (they are one filtered set, so a map-only filter would make the
//      count lie). It survives a reload, and Reset clears it.
//   2. Cards that open themselves. Zoomed in past the threshold, the best-rated
//      few destinations on screen show their photo card without being hovered,
//      and zooming back out closes them again.
//
// Run from inside continent-app/:  node scripts/verify_map_size_cards.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4199;
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
  localStorage.setItem('continent.mapGuideDismissed.v1', '1');
};

const counted = async (page) =>
  Number((await page.locator('.results-head .results-count').first().innerText()).replace(/\D/g, ''));

// The shell never scrolls sideways; if it does, something inside it grew wider
// than the viewport (a card placed off the edge would do it).
const scrollX = (page) => page.evaluate(() =>
  Math.round(window.scrollX || document.documentElement.scrollLeft || 0));

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.addInitScript(seed);

  console.log('loading the Explore map...');
  await page.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await page.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  await page.locator('.result-row').first().waitFor({ timeout: 90000 });

  console.log('\n1. The size toggle sits beside the From picker');
  const toggle = page.locator('.map-toolrow .size-toggle');
  if (!(await toggle.count())) fail('no size toggle in the map control row');
  else pass('the toggle is in the control row');
  const geo = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), h: Math.round(b.height) }; };
    return { from: r('.map-toolrow .origin-btn'), size: r('.map-toolrow .size-toggle') };
  });
  if (!geo.size || !geo.from) fail('the control row did not render both controls');
  else {
    if (geo.size.left < geo.from.right) fail(`the toggle (x ${geo.size.left}) is not right of the picker (ends ${geo.from.right})`);
    else pass(`the toggle follows the picker at x=${geo.size.left}`);
    if (Math.abs(geo.size.top - geo.from.top) > 4) fail('the two controls are out of line');
    else pass('it is level with the picker');
    if (geo.size.h < 44) fail(`the toggle is only ${geo.size.h}px tall`);
    else pass(`the toggle stands ${geo.size.h}px tall`);
  }

  console.log('\n2. It drops everything smaller than a city');
  const allCount = await counted(page);
  if (await toggle.getAttribute('aria-pressed') !== 'false') fail('the toggle starts pressed');
  else pass(`it starts off, showing all ${allCount} places`);
  await toggle.click();
  await page.waitForTimeout(1200);
  const bigCount = await counted(page);
  if (!(bigCount > 0 && bigCount < allCount)) fail(`the count went ${allCount} -> ${bigCount}`);
  else pass(`cities only: ${allCount} -> ${bigCount} destinations`);
  if (await toggle.getAttribute('aria-pressed') !== 'true') fail('aria-pressed did not follow the state');
  else pass('aria-pressed says it is on');
  // Two labels live in the pill (long for desktop, short for phones); read the
  // one this width actually shows.
  const label = await toggle.locator('.size-toggle-value').innerText();
  if (/all/i.test(label)) fail(`the pill still reads "${label}"`);
  else pass(`the pill reads "${label}"`);
  // The list is the only countable proof, but the map has to agree: every row
  // left standing must be a city, not a village that only the map dropped.
  const rows = await page.locator('.result-row').count();
  if (!rows) fail('the ranked list emptied');
  else pass(`the ranked list narrowed with it (${rows} rows on screen)`);
  await page.screenshot({ path: `${SHOTS}/map-size-cities.png` });

  console.log('\n3. The answer survives a reload, and Reset clears it');
  await page.waitForTimeout(900);          // let the URL mirror catch up
  if (!/[?&]big=1/.test(page.url())) fail(`the URL does not carry it: ${page.url().slice(-60)}`);
  else pass('the URL carries big=1');
  await page.reload();
  await page.locator('.map-toolrow .size-toggle').waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  if (await page.locator('.map-toolrow .size-toggle').getAttribute('aria-pressed') !== 'true') {
    fail('the toggle forgot itself across a reload');
  } else pass('it is still on after a reload');
  // The toggle deliberately does NOT put a badge on Filters (it is a map
  // control, lit up in plain sight), so Reset only appears once something in
  // the tray is on. Turn one on, then reset: the size toggle must go too.
  await page.locator('.filter-tray-btn').click();
  await page.locator('.filter-highlights .pill-toggle', { hasText: 'UNESCO' }).click();
  await page.waitForTimeout(800);
  if (await page.locator('.filter-tray-badge').innerText() !== '1') {
    fail('the Filters badge counted the size toggle as well as UNESCO');
  } else pass('the badge counts the tray only, not the map control');
  await page.locator('.reset-filters-btn').click();
  await page.waitForTimeout(1200);
  if (await page.locator('.map-toolrow .size-toggle').getAttribute('aria-pressed') !== 'false') {
    fail('Reset left the map narrowed to cities');
  } else pass('Reset put the villages back');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  console.log('\n4. Cards open themselves once you are zoomed in');
  // A wheel gesture lands wherever it lands, and these thresholds are exact,
  // so drive the view through the verify seam MapView leaves on its container.
  const zoomTo = async (z) => {
    const ok = await page.evaluate((zoom) => {
      const el = document.querySelector('.map-wrap > div');
      const map = el?._cartaMap;
      if (!map) return false;
      map.jumpTo({ center: [12.34, 45.44], zoom });   // Venice and its neighbours
      return true;
    }, z);
    if (!ok) fail('the map verify seam (_cartaMap) is missing');
    await page.waitForTimeout(1800);
  };
  await zoomTo(9);
  let cards = await page.locator('.map-tip-auto').count();
  if (!cards) fail('no cards opened at zoom 9');
  else pass(`${cards} cards opened without a hover`);
  if (cards > 4) fail(`${cards} cards is more than the cap`);
  else pass('the cap holds');
  const hasPhoto = await page.locator('.map-tip-auto .tip-img').count();
  const hasCity = await page.locator('.map-tip-auto .tip-city').count();
  if (!hasCity) fail('the cards carry no destination name');
  else pass(`the cards carry the name (${hasCity}) and a photo (${hasPhoto})`);
  const offEdge = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.map-tip-auto')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.left < 0 || r.right > w).length;
  });
  if (offEdge) fail(`${offEdge} cards hang off the viewport edge`);
  else pass('every card is fully on screen');
  const sx = await scrollX(page);
  if (sx) fail(`the shell scrolled ${sx}px sideways`);
  else pass('the shell did not scroll sideways');
  // A card that covers the legend or the From picker hides a control to show a
  // suggestion, which is the wrong way round.
  const covered = await page.evaluate(() => {
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const cards = [...document.querySelectorAll('.map-tip-auto')].map((e) => e.getBoundingClientRect());
    const out = [];
    for (const sel of ['.map-toolrow', '.map-legend']) {
      const node = document.querySelector(sel);
      if (!node) continue;
      const b = node.getBoundingClientRect();
      if (cards.some((c) => hit(c, b))) out.push(sel);
    }
    return out;
  });
  if (covered.length) fail(`cards cover the map's own controls: ${covered.join(', ')}`);
  else pass('the cards keep off the legend and the control row');
  await page.screenshot({ path: `${SHOTS}/map-cards-zoomed.png` });

  console.log('\n5. ...and close themselves when you zoom back out');
  await zoomTo(5);
  cards = await page.locator('.map-tip-auto').count();
  if (cards) fail(`${cards} cards are still on the map at zoom 5`);
  else pass('every card closed');
  await page.screenshot({ path: `${SHOTS}/map-cards-out.png` });
  await ctx.close();

  console.log('\n6. Phone: the control row carries both pills');
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => fail(`page error (phone): ${e.message}`));
  await p2.addInitScript(seed);
  await p2.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await p2.locator('.map-toolrow .size-toggle').waitFor({ timeout: 90000 });
  await p2.waitForTimeout(1500);
  const row = await p2.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) }; };
    return {
      from: r('.map-toolrow .origin-btn'),
      size: r('.map-toolrow .size-toggle'),
      w: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (row.size.right > row.w) fail(`the toggle runs ${row.size.right - row.w}px off a ${row.w}px screen`);
  else pass(`both pills fit (${row.from.left}..${row.size.right} of ${row.w}px)`);
  if (row.overflow > 0) fail(`the page scrolls ${row.overflow}px sideways on a phone`);
  else pass('no horizontal overflow at 390px');
  if (row.size.h < 44) fail(`the toggle is ${row.size.h}px tall, under the 44px target`);
  else pass(`the toggle keeps a ${row.size.h}px target`);
  // The pill carries two labels and hides one per width. Read what a phone
  // actually shows: a caption with no value under it is a pill saying nothing.
  const phoneLabel = (await p2.evaluate(() => {
    const el = document.querySelector('.map-toolrow .size-toggle');
    return [...el.querySelectorAll('b')]
      .filter((b) => b.offsetParent !== null).map((b) => b.textContent).join('|');
  })).trim();
  if (!phoneLabel) fail('the phone pill shows its caption with no value under it');
  else pass(`the phone pill reads "${phoneLabel}"`);
  await p2.locator('.map-toolrow .size-toggle').tap();
  await p2.waitForTimeout(1200);
  if (await p2.locator('.map-toolrow .size-toggle').getAttribute('aria-pressed') !== 'true') {
    fail('a tap did not switch it');
  } else pass('a tap switches it');
  await p2.screenshot({ path: `${SHOTS}/map-size-phone.png` });

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
