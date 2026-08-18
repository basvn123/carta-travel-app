// Headless check of the day-planner workspace cleanup:
//   1. The plan header carries a persistent mono stats strip (stops, km on
//      foot, loose done-time) that never scrolls away.
//   2. The old six-button export row is two controls: the Google Maps route
//      link and one Export & share menu holding PDF / KML / calendar / share
//      / saved-trips, with outside-click and Escape closing it.
//   3. Timeline rows and map pins are synchronised both ways: hovering a row
//      lifts its numbered pin, tapping a pin opens the plan card (even when
//      folded), scrolls to the row and rings it.
//   4. Candidate pins sit a register quieter than the route (paler border).
//
// Run from inside continent-app/:  node scripts/verify_day_workspace.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

let failed = 0;
const fail = (msg) => { failed += 1; console.error('  FAIL:', msg); };
const pass = (msg) => console.log('  ok:', msg);

const PLAN_ID = 'local:verify';
const STOPS = [
  { idx: 2, name: 'Salzburg Cathedral' },
  { idx: 11, name: 'Erzabtei Sankt Peter' },
  { idx: 1, name: 'Hohensalzburg Fortress' },
  { idx: 4, name: 'Schloss Mirabell' },
];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();

  await page.addInitScript(({ planId, stops }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: planId,
      label: 'Salzburg day',
      startDate: '2026-08-04',
      stops: [{ destinationId: 'SZG', days: 1 }],
    }]));
    localStorage.setItem(`carta.dayplan.${planId}`, JSON.stringify({
      0: { 0: stops.map((s) => s.idx) },
    }));
    localStorage.setItem(`carta.dayprefs.${planId}`, JSON.stringify({ routeMode: 'manual' }));
  }, { planId: PLAN_ID, stops: STOPS });

  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  console.log('loading app...');
  await page.goto(`${BASE}/?tab=day&o=CRL`);

  const card = page.locator('.trip-saved-main', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  // The landing row wears a thumbnail (city photo, or its glyph tile).
  if (await card.locator('.day-thumb').count() !== 1) fail('the saved-plan row has no thumbnail');
  else pass('saved-plan row carries a thumbnail');
  console.log('opening the seeded plan...');
  await card.click();

  const planHead = page.locator('.day-plan-collapse .day-collapse-head').first();
  await planHead.waitFor({ timeout: 60000 });
  console.log('day view open');

  // Wait on the STATE, not the clock: the full activities file is 19MB, and
  // until it lands the seeded day resolves only partially (3 of 4 stops from
  // the slim list) and the map has no markers yet. The header stats and the
  // route pins are only meaningful once all 4 stops are resolved.
  const waitForCount = async (locator, n, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await locator.count() === n) return true;
      await page.waitForTimeout(250);
    }
    return await locator.count() === n;
  };
  const timelineRowsEarly = page.locator('.day-timeline-row');
  if (await timelineRowsEarly.count() === 0) await planHead.click();
  if (!await waitForCount(timelineRowsEarly, STOPS.length, 45000)) {
    fail(`the timeline never reached ${STOPS.length} resolved stops`);
  }
  if (!await waitForCount(page.locator('.trip-pin'), STOPS.length, 30000)) {
    fail(`the map never reached ${STOPS.length} route pins`);
  }
  // Give OSRM a moment so the km figure can join the stats strip.
  const statsLoc = page.locator('.day-topcard-stats');
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    if (/km/.test(await statsLoc.innerText().catch(() => ''))) break;
    await page.waitForTimeout(400);
  }

  console.log('\n1. Persistent day stats in the plan header');
  const stats = page.locator('.day-topcard-stats');
  if (await stats.count() !== 1) fail('no .day-topcard-stats strip in the header');
  else {
    const text = (await stats.innerText()).replace(/\s+/g, ' ').trim();
    if (!/4 stops/.test(text)) fail(`stats strip does not name the stop count: "${text}"`);
    else pass(`stats strip reads: "${text}"`);
    const inScroll = await stats.evaluate((el) => !!el.closest('.trip-sheet-scroll'));
    if (inScroll) fail('stats strip scrolls away with the sheet content');
    else pass('stats strip sits above the scroll, always in view');
  }

  // The timeline body is unmounted while the plan card is folded.
  const timelineRows = page.locator('.day-timeline-row');
  if (await timelineRows.count() === 0) await planHead.click();
  await timelineRows.first().waitFor({ timeout: 30000 });

  console.log('\n2. Export consolidated into one menu');
  const actionBtns = page.locator('.day-actions-row .day-action-btn');
  const nBtns = await actionBtns.count();
  if (nBtns !== 2) fail(`expected 2 controls in the actions row, got ${nBtns}`);
  else pass('actions row holds 2 controls: route link + export menu');
  if (await page.locator('.day-export-menu').count() !== 0) fail('export menu is open before its button was clicked');
  const exportBtn = page.locator('.day-export-btn');
  await exportBtn.click();
  const items = page.locator('.day-export-menu .day-export-item');
  const nItems = await items.count();
  if (nItems !== 5) fail(`expected 5 menu items, got ${nItems}`);
  else pass(`menu opens with ${nItems} items: ${(await items.allInnerTexts()).map((s) => s.trim()).join(' | ')}`);
  await page.screenshot({ path: `${SHOTS}/day-workspace-export-menu.png` });
  await page.keyboard.press('Escape');
  if (await page.locator('.day-export-menu').count() !== 0) fail('Escape did not close the export menu');
  else pass('Escape closes the menu');
  await exportBtn.click();
  await page.locator('.trip-topcard').click();
  if (await page.locator('.day-export-menu').count() !== 0) fail('outside click did not close the export menu');
  else pass('outside click closes the menu');

  console.log('\n3. Timeline <-> map pin sync');
  const pins = page.locator('.trip-pin');
  const nPins = await pins.count();
  if (nPins !== STOPS.length) fail(`expected ${STOPS.length} route pins, got ${nPins}`);
  else pass(`${nPins} numbered route pins on the map`);

  await timelineRows.nth(1).hover();
  await page.waitForTimeout(300);
  const activePins = await page.locator('.trip-pin.active').count();
  if (activePins !== 1) fail(`hovering row 2 lit ${activePins} pins, expected 1`);
  else pass('hovering a row lifts exactly its pin');
  await page.locator('.trip-topcard').hover();
  await page.waitForTimeout(300);
  if (await page.locator('.trip-pin.active').count() !== 0) fail('pin stayed lit after the hover left the row');
  else pass('pin settles when the hover leaves');

  // Fold the plan card, then tap a pin: the card must reopen, scroll to the
  // row and ring it.
  await planHead.click();
  if (await timelineRows.count() !== 0) fail('plan card did not fold');
  await pins.nth(2).click({ force: true });
  await page.waitForTimeout(600);
  if (await timelineRows.count() === 0) fail('tapping a pin did not reopen the folded plan card');
  else pass('tapping a pin reopens the folded plan card');
  const focusRows = page.locator('.day-timeline-row.map-focus');
  if (await focusRows.count() !== 1) fail('tapped pin did not ring its timeline row');
  else {
    const name = (await focusRows.locator('.day-assigned-title').innerText()).trim();
    if (name !== STOPS[2].name) fail(`pin 3 rang "${name}", expected "${STOPS[2].name}"`);
    else pass(`pin 3 rings its own row: "${name}"`);
  }
  await page.screenshot({ path: `${SHOTS}/day-workspace-pin-sync.png` });
  await page.waitForTimeout(2000);
  if (await page.locator('.day-timeline-row.map-focus').count() !== 0) fail('the ring never fades');
  else pass('the ring fades after a moment');

  console.log('\n4. Candidate pins one register quieter than the route');
  const poiPin = page.locator('.trip-poi-pin:not(.sel)').first();
  if (await poiPin.count() === 0) fail('no candidate pins on the map to check');
  else {
    const border = await poiPin.evaluate((el) => getComputedStyle(el).borderColor);
    // --rule-soft #e2ded1, vs the old --rule #ccc7b8.
    if (border !== 'rgb(226, 222, 209)') fail(`candidate border is ${border}, expected the softer rule tone`);
    else pass('candidate pins wear the softer hairline');
    const lbl = await page.locator('.trip-poi-pin:not(.sel) .dem-pin-lbl').first()
      .evaluate((el) => getComputedStyle(el).color);
    if (lbl !== 'rgb(65, 75, 94)') fail(`candidate label is ${lbl}, expected the muted ink`);
    else pass('candidate labels use the muted ink');
  }

  await page.screenshot({ path: `${SHOTS}/day-workspace-desktop.png` });
  await page.setViewportSize({ width: 412, height: 900 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/day-workspace-mobile.png` });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
