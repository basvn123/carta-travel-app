// Headless smoke for the always-on homepage + the ?tab= deep link.
// Serves the built app (vite preview), then:
//   1. A fresh visitor with the audit-doc's parameter URL lands on the
//      homepage, its hero widget seeded from those params.
//   2. "Explore the map" hands off to the map; the brand logo reopens the
//      homepage; "Open the app" skips back out again.
//   3. A returning visitor (fareNoticeSeen preseeded) goes straight to the
//      map, and ?tab=trip actually opens the trip planner.
// Run from inside continent-app/:  node scripts/verify_welcome.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4189;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Reuse an already-running preview on this port; only spawn when nothing
// answers. (Do not move this harness to port 4190: that one is on the fetch
// spec's blocked-port list and node's fetch refuses it.)
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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

  // ---- 1. Fresh visitor, parameterized URL (the audit doc's exact params).
  await page.goto(`${BASE}/?d=2026-08-01&r=2026-08-05&g=1&b=priority_10kg&t=car&o=CRL`);
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 15000 });
  } catch { /* auth not configured in this build */ }
  await page.locator('.home-page').waitFor({ timeout: 120000 });
  await page.getByText('Your trip so far').waitFor({ timeout: 30000 });
  const live = await page.locator('.welcome-live').innerText();
  console.log('home live line:', JSON.stringify(live));
  if (!/priced from/.test(live)) fail('home live line missing the priced-from count');
  if (!/4 nights/.test(live)) fail(`expected "4 nights" from d/r params, got: ${live}`);
  const cards = await page.locator('.welcome-card').count();
  if (cards !== 3) fail(`expected 3 feature cards, got ${cards}`);
  const steps = await page.locator('.home-how-steps li').count();
  if (steps !== 3) fail(`expected 3 how-it-works steps, got ${steps}`);
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });

  // ---- 2. Hand-off to the map, then the logo reopens the homepage.
  await page.getByRole('button', { name: 'Explore the map' }).click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on Explore');
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('.app-header-brand').click();
  await page.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('logo reopened the homepage');
  await page.getByRole('button', { name: 'Open the app' }).click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on skip');

  // ---- 3. Returning visitor + ?tab=trip deep link, no homepage detour.
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
  });
  await page2.goto(`${BASE}/?tab=trip&o=CRL`);
  await page2.locator('.trip-guide-cta, .trip-launcher').first().waitFor({ timeout: 120000 });
  if (await page2.locator('.home-page').count()) fail('returning visitor saw the homepage');
  await page2.screenshot({ path: `${SHOTS}/tab-trip.png` });
  console.log('tab=trip opened the trip planner');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_welcome OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
