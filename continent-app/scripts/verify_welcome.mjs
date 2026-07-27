// Headless smoke for the always-on homepage (landing page) + the ?tab= link.
// Serves the built app (vite preview), then:
//   1. A fresh visitor with the audit-doc's parameter URL lands on the
//      homepage, its hero widget seeded from those params.
//   2. Every landing section renders, the scroll-reveal actually fires, and
//      the footer's privacy policy opens in-app.
//   3. "Explore the map" hands off to the map; the brand logo reopens the
//      homepage; "Open the app" skips back out again.
//   4. A returning visitor (fareNoticeSeen preseeded) goes straight to the
//      map, and ?tab=trip actually opens the trip planner.
//   5. Mobile: the BottomNav carries a real Home tab that reopens the page.
// Run from inside continent-app/:  node scripts/verify_welcome.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
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
  const cards = await page.locator('.home-feature-card').count();
  if (cards !== 6) fail(`expected 6 feature cards, got ${cards}`);
  const steps = await page.locator('.home-how-steps li').count();
  if (steps !== 3) fail(`expected 3 how-it-works steps, got ${steps}`);
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });

  // ---- 2. The landing sections below the fold: scroll through, confirm the
  // reveal observer fires (nothing stays invisible) and the footer works.
  await page.locator('.home-page').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(1400);
  const unrevealed = await page.locator('[data-reveal]:not(.is-in)').count();
  if (unrevealed) fail(`${unrevealed} sections never revealed (observer did not fire)`);
  const stat = await page.locator('.home-stat-num').first().innerText();
  if (!/[1-9]/.test(stat)) fail(`stat counter stuck at zero: ${stat}`);
  console.log('first stat counted up to:', stat);
  await page.screenshot({ path: `${SHOTS}/home-full.png`, fullPage: true });

  await page.locator('.home-footer-link', { hasText: 'Privacy policy' }).click();
  await page.locator('.privacy-modal').waitFor({ timeout: 10000 });
  console.log('footer opened the privacy policy');
  await page.locator('.privacy-modal .panel-close, .privacy-modal .auth-close').first().click();
  await page.locator('.home-page').evaluate((el) => { el.scrollTop = 0; });

  // ---- 3. Hand-off to the map, then the logo reopens the homepage.
  // The landing page repeats "Explore the map" three times (hero, widget,
  // closing band), so every locator here is by class, not by accessible
  // name: a by-name lookup is a strict-mode violation now.
  await page.locator('.home-cta-primary').click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on Explore');
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('.app-header-brand').click();
  await page.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('logo reopened the homepage');
  await page.locator('.home-nav-cta').click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on skip');

  // The desktop header carries Home as a real tab now, not just the logo.
  await page.locator('.header-nav-item', { hasText: 'Home' }).click();
  await page.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('header Home tab reopened the homepage');
  await page.locator('.home-nav-cta').click();

  // ---- 4. Returning visitor + ?tab=trip deep link, no homepage detour.
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

  // ---- 5. Mobile: Home is a BottomNav tab, and the landing page must not
  // sit on top of that bar (it used to outrank it and trap the visitor).
  const ctx3 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page3 = await ctx3.newPage();
  await page3.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
  });
  await page3.goto(`${BASE}/?o=CRL`);
  try {
    await page3.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 15000 });
  } catch { /* auth not configured in this build */ }
  await page3.locator('.home-page').waitFor({ timeout: 120000 });
  await page3.waitForTimeout(1200);
  await page3.screenshot({ path: `${SHOTS}/home-mobile.png` });
  const homeTab = page3.locator('.bottom-nav-item', { hasText: 'Home' });
  if (!(await homeTab.count())) fail('no Home tab in the mobile BottomNav');
  // Five tabs on a 390px phone: labels must sit inside their own tab, not
  // wrap and collide with the neighbours (they did on the first pass).
  const bar = await page3.evaluate(() => {
    const items = [...document.querySelectorAll('.bottom-nav-item')];
    const clipped = items
      .map((it) => it.querySelector('.bottom-nav-label'))
      .filter((l) => l && l.scrollWidth > l.clientWidth + 1)
      .map((l) => l.textContent);
    const boxes = items.map((it) => it.getBoundingClientRect());
    const overlaps = boxes.filter((b, i) => i && b.left < boxes[i - 1].right - 0.5).length;
    const rows = new Set(boxes.map((b) => Math.round(b.top))).size;
    return { count: items.length, clipped, overlaps, rows };
  });
  if (bar.count !== 5) fail(`expected 5 bottom-nav tabs, got ${bar.count}`);
  if (bar.overlaps) fail(`${bar.overlaps} bottom-nav tabs overlap`);
  if (bar.rows !== 1) fail(`bottom-nav wrapped onto ${bar.rows} rows`);
  if (bar.clipped.length) fail(`bottom-nav labels truncated: ${bar.clipped.join(', ')}`);
  console.log('bottom nav: 5 tabs, one row, no clipped labels');
  // The bar has to be clickable with the homepage open, that is the point.
  await page3.locator('.bottom-nav-item', { hasText: 'Map' }).click({ timeout: 10000 });
  if (await page3.locator('.home-page').count()) fail('BottomNav Map did not leave the homepage');
  await homeTab.click();
  await page3.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('mobile BottomNav Home tab works both ways');
  await page3.screenshot({ path: `${SHOTS}/home-mobile-full.png`, fullPage: true });

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_welcome OK');
} catch (err) {
  fail(err.message);
} finally {
  // srv is `npx ...` under a shell, so kill() reaches the shell but can leave
  // vite itself running on Windows; its open handle would keep this process
  // alive forever (an earlier version of this script hung here instead of
  // reporting its failure). Kill the tree, then exit explicitly.
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
