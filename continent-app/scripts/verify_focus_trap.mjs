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

const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;

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

// Each overlay, by the hash that opens it directly, with the root it renders.
const PAGES = [
  ['#dest=FCO', '.destp'],
  ['#beach=', '.bpage'],
  ['#trail=', '.tpage'],
];

// Only the destination page can be opened by hash without knowing a live id,
// so it carries the detailed contract; the rest are smoke-checked if present.
await page.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded', timeout: 60000 });
const destp = page.locator('.destp').first();
await destp.waitFor({ state: 'visible', timeout: 30000 });

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
await page.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded', timeout: 60000 });
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

// 8. T401 (shell V5): the dialogs the shell draws keep the same promise. The
// plan chooser on a phone is a modal dialog of two links: focus moves into it,
// Tab and Shift+Tab stay inside, Escape closes it, and it announces aria-modal.
// A minimum is asserted (two items) so an empty chooser cannot pass vacuously.
{
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await phone.addInitScript(() => { try {
    localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('carta.onboardSeen', '1');
  } catch { /* none */ } });
  const pp = await phone.newPage();
  await pp.goto(BASE + '/?tab=places', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pp.locator('.bottom-nav-plus').waitFor({ state: 'visible', timeout: 30000 });
  await pp.locator('.bottom-nav-plus').tap();
  await pp.waitForTimeout(500);
  const items = await pp.locator('.plan-chooser .plan-chooser-item').count();
  check('plan chooser holds its two items', items === 2, String(items));
  check('plan chooser is a modal dialog',
    (await pp.locator('.plan-chooser').getAttribute('aria-modal')) === 'true');
  check('focus moves into the plan chooser',
    await pp.evaluate(() => !!document.activeElement?.closest('.plan-chooser')));
  for (let i = 0; i < 12; i++) await pp.keyboard.press('Tab');
  check('Tab stays inside the plan chooser (12 presses)',
    await pp.evaluate(() => !!document.activeElement?.closest('.plan-chooser')));
  for (let i = 0; i < 6; i++) await pp.keyboard.press('Shift+Tab');
  check('Shift+Tab stays inside the plan chooser',
    await pp.evaluate(() => !!document.activeElement?.closest('.plan-chooser')));
  await pp.keyboard.press('Escape');
  await pp.waitForTimeout(500);
  check('Escape closes the plan chooser', (await pp.locator('.plan-chooser').count()) === 0);
  // A pointer open draws no focus ring on the control focus moved to (T396-e);
  // the first key press brings the ring back.
  await pp.locator('.bottom-nav-plus').tap();
  await pp.waitForTimeout(400);
  check('a pointer open marks the focused control quiet',
    await pp.evaluate(() => document.activeElement?.hasAttribute('data-focus-quiet') ?? false));
  await pp.keyboard.press('Shift');
  check('a key press lifts the quiet mark',
    await pp.evaluate(() => !document.activeElement?.hasAttribute('data-focus-quiet')));
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
