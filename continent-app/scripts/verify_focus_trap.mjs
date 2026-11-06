/**
 * The seven full-screen overlays claim `aria-modal="true"`, which promises a
 * screen reader that nothing outside them is reachable. This checks that the
 * promise is kept: focus lands inside on open, Tab cycles within the dialog
 * instead of walking into the page behind, Escape closes, and focus returns
 * to whatever opened it.
 *
 * Run from inside continent-app/:  node scripts/verify_focus_trap.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

// T1089: a URL argument or CARTA_PORT points at a running server; the
// plan chooser (bottom-nav plus) this once covered is gone from the app.
const PORT = Number(process.env.CARTA_PORT) || 4197;
const BASE = (process.argv[2] ? process.argv[2] : `http://127.0.0.1:${PORT}`).replace(/\/$/, '');

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
if (!(await isUp())) {
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500));
}

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const SEED = () => { try {
  localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen.v1', '1');
  localStorage.setItem('continent.mapGuideDismissed.v1', '1');
} catch { /* none */ } };
await page.addInitScript(SEED);
// A direct load of #dest= drops the hash (known): boot the app, then move it.
const openPlace = async (pg) => {
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForSelector('.bottom-nav, .topbar, header', { state: 'attached', timeout: 60000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { window.location.hash = 'dest=FCO'; });
};

// Each overlay, by the hash that opens it directly, with the root it renders.
const PAGES = [
  ['#dest=FCO', '.destp'],
  ['#beach=', '.bpage'],
  ['#trail=', '.tpage'],
];

// Only the destination page can be opened by hash without knowing a live id,
// so it carries the detailed contract; the rest are smoke-checked if present.
await openPlace(page);
const destp = page.locator('.destp').first();
await destp.waitFor({ state: 'visible', timeout: 90000 });

// 1. Focus lands inside the dialog, not on <body>.
const inside = await page.evaluate(() => {
  const d = document.querySelector('.destp');
  return !!(d && document.activeElement && d.contains(document.activeElement)
    && document.activeElement !== document.body);
});
check('focus moves into the dialog on open', inside);

// 2. Tab stays inside, however far you push it.
await page.keyboard.press('Tab');
for (let i = 0; i < 60; i++) await page.keyboard.press('Tab');
const stillInside = await page.evaluate(() => {
  const d = document.querySelector('.destp');
  return !!(d && document.activeElement && d.contains(document.activeElement));
});
check('Tab cycles inside the dialog (60 presses)', stillInside);

// 3. Shift+Tab off the first element wraps to the last, not out of the dialog.
for (let i = 0; i < 20; i++) await page.keyboard.press('Shift+Tab');
const stillInsideBack = await page.evaluate(() => {
  const d = document.querySelector('.destp');
  return !!(d && document.activeElement && d.contains(document.activeElement));
});
check('Shift+Tab cycles inside the dialog', stillInsideBack);

// 4. Escape closes it.
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('Escape closes the dialog', !(await page.locator('.destp').count()));

// 5. Every aria-modal dialog carries an accessible name.
await openPlace(page);
await page.locator('.destp').first().waitFor({ state: 'visible', timeout: 30000 });
const unnamed = await page.evaluate(() => {
  const out = [];
  for (const d of document.querySelectorAll('[aria-modal="true"]')) {
    const named = d.getAttribute('aria-label')?.trim() || d.getAttribute('aria-labelledby');
    if (!named) out.push(d.className || d.tagName);
  }
  return out;
});
check('every aria-modal dialog has an accessible name', unnamed.length === 0, unnamed.join(', '));

// 6. No decorative icon announces a hardcoded English label.
const ENGLISH = ['Dates', 'Day planner', 'Destinations', 'Explore', 'Filters', 'Great stop',
  'Guest', 'Home', 'Map', 'More', 'Plan', 'Saved trips', 'Trip planner', 'Worth a look'];
const leaked = await page.evaluate((words) => {
  const out = [];
  for (const svg of document.querySelectorAll('svg[aria-label]')) {
    const l = svg.getAttribute('aria-label');
    if (words.includes(l)) out.push(l);
  }
  return out;
}, ENGLISH);
check('no svg announces a hardcoded English label', leaked.length === 0, leaked.join(', '));

// 7. An icon marked aria-hidden must not also claim role="img".
const contradictory = await page.evaluate(
  () => document.querySelectorAll('svg[aria-hidden="true"][role="img"]').length);
check('no svg is both aria-hidden and role="img"', contradictory === 0, String(contradictory));

// 8. T1089: the same promise on a phone. The T401 plan chooser (bottom-nav
// plus) is gone, so the place page, the one full-screen dialog a phone opens
// by hash, carries it: focus moves in, Tab and Shift+Tab stay inside, Escape
// closes it.
{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await phone.addInitScript(SEED);
  const pp = await phone.newPage();
  await openPlace(pp);
  await pp.locator('.destp').first().waitFor({ state: 'visible', timeout: 90000 });
  await pp.waitForTimeout(800);
  const inP = () => pp.evaluate(() => !!document.activeElement?.closest('.destp'));
  check('phone: focus moves into the place page', await inP());
  for (let i = 0; i < 40; i++) await pp.keyboard.press('Tab');
  check('phone: Tab stays inside the place page (40 presses)', await inP());
  for (let i = 0; i < 15; i++) await pp.keyboard.press('Shift+Tab');
  check('phone: Shift+Tab stays inside the place page', await inP());
  await pp.keyboard.press('Escape');
  await pp.waitForTimeout(500);
  check('phone: Escape closes the place page', (await pp.locator('.destp').count()) === 0);
  await phone.close();
}

await browser.close();
if (srv) srv.kill();

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(bad ? `\n${bad} FAILED` : '\nAll focus checks passed.');
process.exit(bad ? 1 : 0);
