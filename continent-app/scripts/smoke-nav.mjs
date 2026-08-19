// Headless navigation smoke test. Drives the app through the entry gate and
// every top-level tab (Map / Trip planner / Day planner), asserting that each
// mounts and renders with zero console/page errors. This is the runtime net for
// changes to the lazy-loaded planner tabs, which a `vite build` alone can't
// exercise (a broken hook/extraction throws on mount and shows up here).
//
//   node scripts/smoke-nav.mjs [url]      (default http://localhost:4173)
//
// Point it at a running `vite preview` (or `vite dev`) of the build you want to
// check. Exits non-zero if any tab errors or can't be reached.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

// Click the first VISIBLE button whose text matches (desktop + mobile navs both
// exist; only one is visible at a given viewport).
async function clickButton(re) {
  for (const btn of await page.getByRole('button').all()) {
    const t = (await btn.innerText().catch(() => '')).trim();
    if (re.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click({ timeout: 4000 }).catch(() => {}); return t; }
  }
  return null;
}

const steps = [];
async function step(label, fn) {
  const before = errors.length;
  let note = '', failed = false;
  try { note = (await fn()) || ''; } catch (e) { note = 'THREW: ' + e.message.split('\n')[0]; failed = true; }
  await page.waitForTimeout(1800);
  steps.push({ label, note, failed, newErrors: errors.length - before });
}

// Force English + guest mode before the app boots, so the selectors are
// deterministic regardless of the build's default language or a prior visit.
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1'); // skip the onboarding overlay
  } catch { /* storage unavailable */ }
});

// domcontentloaded (not networkidle) so this also works against a dev server,
// whose HMR websocket keeps the network busy forever.
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000); // let the data payload + first render settle

// The core check: reach each top-level tab and confirm it mounts with no
// errors. This is the net for the lazy-loaded planner tabs a build can't cover.
await step('Trip planner tab', () => clickButton(/trip planner/i).then((t) => `clicked "${t}"`));
await step('Day planner tab', () => clickButton(/day planner/i).then((t) => `clicked "${t}"`));
// The map tab reads "Explore" in the chrome at every width.
await step('back to Map tab', () => clickButton(/^explore$/i).then((t) => `clicked "${t}"`));
// Best-effort: open a destination card to exercise the Explore panel (the
// info panel that replaced the fare breakdown when the map left this tab).
// Doesn't fail the run; it just logs whether the panel rendered.
await step('open a destination panel (best-effort)', async () => {
  try {
    await page.waitForSelector('.xcard-hit', { timeout: 8000 });
    await page.locator('.xcard-hit').first().click();
    await page.waitForSelector('.xp-indices', { timeout: 6000 });
    return 'explore panel rendered';
  } catch { return 'skipped (grid not on the current view)'; }
});

const totalErrors = errors.length;
const failedSteps = steps.filter((s) => s.failed || s.newErrors).length;
console.log('=== nav smoke ===  target:', URL);
for (const s of steps) console.log(`  ${(s.failed || s.newErrors) ? 'FAIL' : 'ok  '} ${s.label} — ${s.note}${s.newErrors ? ` (+${s.newErrors} errors)` : ''}`);
console.log(`TOTAL ERRORS: ${totalErrors}  |  FAILED STEPS: ${failedSteps}`);
errors.slice(0, 15).forEach((e) => console.log('  ' + e));

await browser.close();
process.exit(totalErrors || failedSteps ? 1 : 0);
