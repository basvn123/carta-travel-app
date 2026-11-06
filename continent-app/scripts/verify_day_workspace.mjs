// Headless check of the day workspace: a saved day plan opens as the day
// itself (map on one side, the day's sheet on the other).
//
// T1089: rewritten. The T389-era workspace (three tabs, Add and Share
// toolbar sheets, Files tab, floating bot) is gone; the day is now one sheet
// (DayWorkspaceChrome, DayPlanPanel, DayOverview): a title bar with the day
// switcher, a "Staying" bar over the map, the stops as a numbered list
// (.dayt-stop), a toolbar to add places, a kit (local tips, Notes and files,
// import), Export & share, and the day's cost.
//
//   1. The seeded plan is a card on the Day landing and opens the workspace.
//   2. The Staying bar and the map, outside the sheet.
//   3. The stops render in order, numbered 1 to n, and carry no clock times
//      or distances beside their name.
//   4. The kit offers Notes and files, and Export & share offers the PDF and
//      a share link.
//   5. Add more places opens the place browser (.daya).
//   6. A 412px phone has no sideways scroll.
//
// T1089 needs: real data for the stop names (the seeded stops are indexes
// into the activities catalogue; a partial dataset resolves fewer of them,
// so the harness asks for three or more and the first to be the Cathedral).
//
// Run from inside continent-app/:  node scripts/verify_day_workspace.mjs [url]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// CARTA_PORT (T389): a parallel session may hold the default port with its own
// preview, so a run can name its own server instead of testing someone else's.
const PORT = Number(process.env.CARTA_PORT) || 4193;
const BASE = (process.argv[2] || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
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
    for (const k of ['continent.guestMode.v1', 'continent.homeSeen.v1', 'continent.mapGuideDismissed.v1',
      'carta.fareNoticeSeen', 'carta.welcomeSeen', 'carta.welcomeSeen.v1', 'continent.onboardingSeen.v1']) {
      localStorage.setItem(k, '1');
    }
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: planId,
      label: 'Salzburg day',
      startDate: '2026-12-04',
      stops: [{ destinationId: 'SZG', days: 1 }],
    }]));
    localStorage.setItem(`carta.dayplan.${planId}`, JSON.stringify({
      0: { 0: stops.map((s) => s.idx) },
    }));
    localStorage.setItem(`carta.dayprefs.${planId}`, JSON.stringify({ routeMode: 'manual' }));
  }, { planId: PLAN_ID, stops: STOPS });

  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  console.log('loading app...');
  await page.goto(`${BASE}/?tab=plan&mode=day&o=CRL`);

  console.log('\n1. The seeded plan opens as the day');
  const card = page.locator('button, a', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  await card.click();
  await page.locator('.day-ws .dayt-stop').first().waitFor({ timeout: 60000 });
  pass('the saved plan card opens the workspace');

  console.log('\n2. The Staying bar and the map');
  const stayBar = page.locator('.dayws-stay');
  if (await stayBar.count() !== 1) fail('no Staying bar over the map');
  else {
    // The bar moved into the sheet's scroll (above the stops) when the map
    // chrome was dropped; it still opens the stay editor.
    if (await stayBar.locator('button.dayws-stay-btn').count() !== 1) fail('the Staying bar is not a button');
    else pass('the Staying bar is one button that changes the stay');
    const label = (await stayBar.locator('.dayws-stay-text small').innerText()).trim();
    if (!/staying/i.test(label)) fail(`Staying bar label reads "${label}"`);
    else pass(`Staying bar labelled "${label}"`);
  }
  if (await page.locator('.dayws-map canvas').count() < 1) fail('the map canvas is missing');
  else pass('the map is mounted');

  console.log('\n3. The stops, in order');
  const rows = page.locator('.dayt-stop');
  const n = await rows.count();
  if (n < 3) fail(`expected 3 or more resolved stops, got ${n}`);
  else pass(`${n} stops resolved`);
  const firstName = (await rows.first().locator('.dayt-name').innerText()).trim();
  if (!firstName.startsWith(STOPS[0].name)) fail(`first stop reads "${firstName}"`);
  else pass(`first stop is "${firstName}"`);
  const numbers = await page.locator('.dayt-no').allInnerTexts();
  if (numbers.join(',') !== Array.from({ length: n }, (_, i) => i + 1).join(',')) fail(`stop numbers read ${numbers.join(',')}`);
  else pass(`stops are numbered 1 to ${n} in order`);
  const names = (await page.locator('.dayt-name').allInnerTexts()).join(' ');
  if (/\d{1,2}:\d{2}|\bkm\b/.test(names)) fail(`a stop name carries a time or distance: "${names}"`);
  else pass('stop names carry no clock times or distances');
  const stats = await page.locator('.dayt-meta').first().innerText();
  if (!/\d+\s*(min|h)/.test(stats)) fail(`the stop line shows no visit time: "${stats}"`);
  else pass(`a stop line says how long: "${stats}"`);

  console.log('\n4. The kit and the way out');
  const kit = await page.locator('.day-ws').innerText();
  if (!/notes and files/i.test(kit)) fail('no "Notes and files" door in the day kit');
  else pass('the day kit offers Notes and files');
  if (!/local tips/i.test(kit)) fail('no "Local tips" door in the day kit');
  else pass('the day kit offers Local tips');
  const out = ['Download as PDF', 'Share link'];
  for (const name of out) {
    if (await page.getByRole('button', { name }).count() < 1) fail(`Export & share has no "${name}" button`);
  }
  if (!failed) pass('Export & share offers the PDF and a share link');
  await page.screenshot({ path: `${SHOTS}/day-ws-desktop.png`, fullPage: false });

  console.log('\n5. Add more places');
  await page.getByRole('button', { name: 'Add more places' }).click();
  await page.locator('.daya').waitFor({ timeout: 20000 }).then(
    () => pass('Add more places opens the place browser'),
    () => fail('Add more places opened no place browser'),
  );
  await page.screenshot({ path: `${SHOTS}/day-ws-add.png` });

  console.log('\n6. A phone');
  await page.setViewportSize({ width: 412, height: 900 });
  await page.waitForTimeout(900);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fail(`${over}px of sideways scroll at 412px`);
  else pass('no sideways scroll at 412px');
  await page.screenshot({ path: `${SHOTS}/day-ws-mobile.png` });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
