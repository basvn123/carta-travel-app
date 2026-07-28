// Headless check of the map's "travelling from" control, in the built app.
//
// What it asserts:
//   1. On DESKTOP the picker no longer lives in the top panel: it floats in the
//      map's control row, level with the Destinations tab, clear of the header.
//   2. Switching Travel by to the car relabels it ("Driving from" / pick a
//      town), and every price on the map disappears until the town is named,
//      so a road trip is never quietly costed from the departure airport.
//   3. The empty map explains itself (the drive prompt) and offers the way back
//      to flight prices.
//   4. Naming a town reprices the map, and the receipt says that town.
//
// Nominatim is stubbed: this checks OUR wiring, not OSM's uptime.
//
// Run from inside continent-app/:  node scripts/verify_origin_control.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4197;
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

// Ghent, the town somebody flying out of Charleroi actually drives from.
const GHENT = [{
  display_name: 'Ghent, East Flanders, Flanders, Belgium',
  lat: '51.0538', lon: '3.7250',
}];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));

  await page.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GHENT),
  }));

  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
  });

  console.log('loading the map...');
  await page.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await page.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  // The map paints its prices onto one canvas, so the ranked list is what can
  // actually be counted: a row IS a priced destination.
  await page.locator('.result-row').first().waitFor({ timeout: 90000 });

  console.log('\n1. The picker is a map control, level with Destinations');
  const inHeader = await page.locator('.app-header .origin-picker').count();
  if (inHeader) fail('the picker is still inside the top panel');
  else pass('the top panel no longer carries the picker');

  // Collapse the list so the Destinations tab is showing, then compare rows.
  await page.locator('.results-collapse').click();
  await page.locator('.list-reopen').waitFor({ state: 'visible', timeout: 20000 });
  const geo = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { bar: r('.top-bar'), pill: r('.list-reopen'), from: r('.map-toolrow .origin-btn') };
  });
  if (!geo.from || !geo.pill) fail('the control row did not render both controls');
  else {
    if (geo.from.top < geo.bar.bottom) fail(`the picker (top ${geo.from.top}) overlaps the top panel (bottom ${geo.bar.bottom})`);
    else pass(`the picker sits ${geo.from.top - geo.bar.bottom}px below the top panel`);
    // Same row: the two are centred on each other within a few pixels.
    const midFrom = geo.from.top + geo.from.h / 2;
    const midPill = geo.pill.top + geo.pill.h / 2;
    if (Math.abs(midFrom - midPill) > 4) fail(`picker and Destinations tab are ${Math.round(Math.abs(midFrom - midPill))}px out of line`);
    else pass('the picker is level with the Destinations tab');
    if (geo.from.left < geo.pill.left) fail('the picker sits left of the Destinations tab');
    else pass(`the picker follows it at x=${geo.from.left}`);
    if (geo.from.h < 34) fail(`the picker is only ${geo.from.h}px tall`);
    else pass(`the picker stands ${geo.from.h}px tall`);
  }
  await page.screenshot({ path: `${SHOTS}/origin-control-plane.png` });
  await page.locator('.list-reopen').click();
  await page.locator('.result-row').first().waitFor({ timeout: 20000 });

  console.log('\n2. Drive mode asks where you drive from, and holds the prices');
  const pricedBefore = Number(await page.locator('.results-head .results-count').first().innerText());
  await page.locator('.filter-travelby .segmented button').nth(1).click();
  await page.waitForTimeout(1500);
  const label = await page.locator('.map-toolrow .origin-btn-from').innerText();
  const value = await page.locator('.map-toolrow .origin-btn-label b').innerText();
  if (!/driving/i.test(label)) fail(`the picker still says "${label}"`);
  else pass(`the picker now asks: ${label} / ${value}`);
  if (!/pick/i.test(value)) fail(`it shows "${value}" instead of asking for a town`);
  else pass('it shows the question, not a stale airport');
  const rowsCar = await page.locator('.result-row').count();
  if (rowsCar > 0) fail(`${rowsCar} destinations are still priced with no starting town`);
  else pass(`prices held back (${pricedBefore} priced before, 0 now)`);
  if (!(await page.locator('.results-empty').isVisible())) fail('the ranked list does not show an empty state');
  else pass('the ranked list is empty too, not just the map');

  console.log('\n3. The empty map explains itself');
  // The question opens itself: the town search is up without hunting for it.
  if (!(await page.locator('.origin-pop-drive').isVisible())) fail('the town search did not open itself');
  else pass('the town search opened itself');
  if (await page.locator('.drive-ask').count()) fail('the map prompt repeats the open popover word for word');
  else pass('the question is asked once, not twice');

  // Dismiss it: the map behind must still say why it is empty.
  await page.keyboard.press('Escape');
  await page.locator('.drive-ask').waitFor({ timeout: 10000 });
  pass('dismissing the search leaves the prompt behind');
  if (!(await page.locator('.drive-ask-alt').isVisible())) fail('no way back to flight prices');
  else pass('the way back to flight prices is offered');
  const listEmpty = await page.locator('.results-empty').innerText();
  if (/filter/i.test(listEmpty)) fail(`the list blames filters: "${listEmpty}"`);
  else pass(`the list says why it is empty: "${listEmpty}"`);
  await page.screenshot({ path: `${SHOTS}/origin-control-drive-ask.png` });

  // ...and the prompt's own button reopens the search.
  await page.locator('.drive-ask-btn').click();
  await page.locator('.origin-pop-drive').waitFor({ timeout: 10000 });
  pass('the prompt reopens the town search');

  console.log('\n4. Naming the town reprices the map from there');
  await page.locator('.origin-pop-drive .origin-search').fill('Ghent');
  await page.locator('.origin-drive-search').click();
  await page.locator('.origin-drive-opt').first().click();
  await page.locator('.result-row').first().waitFor({ timeout: 60000 });
  const pricedAfter = Number(await page.locator('.results-head .results-count').first().innerText());
  if (!pricedAfter) fail('no prices came back after naming the town');
  else pass(`${pricedAfter} destinations priced from the named town`);
  const picked = await page.locator('.map-toolrow .origin-btn-label b').innerText();
  if (!/ghent/i.test(picked)) fail(`the picker shows "${picked}"`);
  else pass(`the picker shows "${picked}"`);
  if (await page.locator('.drive-ask').count()) fail('the prompt is still up after the answer');
  else pass('the prompt stood down');

  // The receipt must name the town too, not the departure airport's city.
  // Bruges, an hour up the road, is priced as a drive by definition.
  await page.locator('.results-search-input').fill('Bruges');
  await page.waitForTimeout(900);
  await page.locator('.result-row').first().click();
  await page.locator('.cost-group').first().waitFor({ timeout: 30000 });
  const subtitle = await page.locator('.cost-group').first().innerText();
  if (/charleroi/i.test(subtitle)) fail(`the receipt still says Charleroi: ${subtitle.replace(/\n/g, ' / ')}`);
  else pass('the receipt does not credit the airport for the drive');
  if (!/ghent/i.test(subtitle)) fail(`the receipt does not name the town: ${subtitle.replace(/\n/g, ' / ')}`);
  else pass('the receipt names the town the drive starts from');
  await page.screenshot({ path: `${SHOTS}/origin-control-drive-priced.png` });

  console.log('\n5. The answer survives a reload');
  await page.reload();
  await page.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  const afterReload = await page.locator('.map-toolrow .origin-btn-label b').innerText();
  if (!/ghent/i.test(afterReload)) fail(`after reload the picker shows "${afterReload}"`);
  else pass('the town is remembered across a reload');

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
