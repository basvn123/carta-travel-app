// Headless smoke for the first-visit welcome landing + the ?tab= deep link.
// Serves the built app (vite preview), then:
//   1. A fresh visitor with the audit-doc's parameter URL sees the welcome
//      overlay with the trip pre-loader widget seeded from those params.
//   2. "Explore the map" dismisses it and the map renders.
//   3. A returning visitor (fareNoticeSeen preseeded) is NOT re-interrupted,
//      and ?tab=trip actually opens the trip planner tab.
// Run from inside continent-app/:  node scripts/verify_welcome.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4189;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  shell: true, stdio: 'ignore',
});
const waitForServer = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch { /* not up yet */ }
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
  await page.getByText('Your trip so far').waitFor({ timeout: 120000 });
  const live = await page.locator('.welcome-live').innerText();
  console.log('welcome live line:', JSON.stringify(live));
  if (!/priced from/.test(live)) fail('welcome live line missing the priced-from count');
  if (!/4 nights/.test(live)) fail(`expected "4 nights" from d/r params, got: ${live}`);
  const cards = await page.locator('.welcome-card').count();
  if (cards !== 3) fail(`expected 3 feature cards, got ${cards}`);
  await page.screenshot({ path: `${SHOTS}/welcome.png` });

  // ---- 2. Dismiss and confirm the map paints under the new palette.
  await page.getByRole('button', { name: 'Explore the map' }).click();
  if (await page.locator('.welcome-modal').count()) fail('welcome overlay did not dismiss');
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/map.png` });

  // ---- 3. Returning visitor + ?tab=trip deep link.
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
  });
  await page2.goto(`${BASE}/?tab=trip&o=CRL`);
  if (await page2.getByText('Your trip so far').count()) fail('returning visitor saw the welcome overlay');
  await page2.locator('.trip-guide-cta, .trip-launcher').first().waitFor({ timeout: 120000 });
  await page2.screenshot({ path: `${SHOTS}/tab-trip.png` });
  console.log('tab=trip opened the trip planner');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_welcome OK');
} catch (err) {
  fail(err.message);
} finally {
  srv.kill();
}
