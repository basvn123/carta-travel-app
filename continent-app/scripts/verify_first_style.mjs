// Headless verify for the first visit on a phone (Style Studio, G12; it
// replaces the T764 taste onboarding check, whose four questions retired).
//
//   node scripts/verify_first_style.mjs [url]
//   (default http://localhost:$CARTA_PORT or 4173)
//
// At 390x844, service workers blocked, storage cleared once:
//   (a) a fresh Explore with no travel style opens the Style Studio's create
//       flow (the wizard), the one place a style is made;
//   (b) its close button leaves it, and nothing else opened in its place;
//   (c) after a reload it does not open again (shown once per device), and
//       the corner disc opens the studio's overview.
//
// The start dialog stays shut for a driven browser (navigator.webdriver, so the
// other verify scripts never meet it); this script reports a normal browser.

import { chromium } from 'playwright';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /ERR_FAILED|config is not valid|Failed to load resource/;

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
await page.addInitScript(() => {
  try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); } catch { /* ignore */ }
  try {
    // Only on the first load: the reload in (c) keeps what the first stored.
    if (!sessionStorage.getItem('g12.cleared')) {
      localStorage.clear();
      sessionStorage.setItem('g12.cleared', '1');
    }
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  } catch { /* storage unavailable */ }
});

async function openExplore() {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible({ timeout: 1500 }).catch(() => false)) await guest.click();
}

const studio = page.locator('.fsheet.sst[role="dialog"]');

await openExplore();
const opened = await studio.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
check('a. a fresh phone visit opens the Style Studio', opened);
check('a. it opens on the create flow', opened && /\bis-wizard\b/.test((await studio.getAttribute('class')) || ''));
check('a. the old taste questions are gone', (await page.locator('.taste-steps').count()) === 0);
if (opened) {
  await studio.locator('.sst-close').first().click();
  await studio.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  check('b. the close button leaves the studio', !(await studio.isVisible().catch(() => false)));
  check('b. no other dialog takes its place', (await page.locator('[role="dialog"][aria-modal="true"]:visible').count()) === 0);
}

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
check('c. a second visit does not open it again', !(await studio.isVisible().catch(() => false)));
const disc = page.locator('.dock--corner .dock-trigger:visible').first();
if (await disc.isVisible({ timeout: 5000 }).catch(() => false)) {
  await disc.click();
  const over = await studio.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  check('c. the corner disc opens the studio overview', over && !/\bis-wizard\b/.test((await studio.getAttribute('class')) || ''));
} else {
  check('c. the corner disc is on Explore', false);
}

await context.close();
await browser.close();
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) console.log(`errors:\n  ${[...new Set(errors)].slice(0, 10).join('\n  ')}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed}/${checks.length} checks pass`);
process.exit(failed ? 1 : 0);
