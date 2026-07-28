// Headless smoke for the always-on homepage (landing page) + the ?tab= link.
// Serves the built app (vite preview), then:
//   1. A fresh visitor with the audit-doc's parameter URL lands on the
//      homepage, its search strip seeded from those params, its status line
//      carrying a live count, and its price map carrying real pins with
//      exactly one flagged as the cheapest.
//   2. The receipt is a genuine composeTrip breakdown: itemised lines to the
//      cent, an exact total, and a computed date-shift footer.
//   3. Every section below the fold renders (there are no scroll reveals to
//      fire any more) and the footer's privacy policy opens in-app.
//   4. "See prices on the map" hands off to the map; the brand logo reopens
//      the homepage; "Open the app" skips back out again.
//   5. A returning visitor (fareNoticeSeen preseeded) goes straight to the
//      map, and ?tab=trip actually opens the trip planner.
//   6. Mobile: the BottomNav carries a real Home tab that reopens the page,
//      and the page never scrolls sideways at 380px.
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
  await page.locator('.home-pin').first().waitFor({ timeout: 60000 });
  const status = await page.locator('.home-status').innerText();
  console.log('status line:', JSON.stringify(status));
  if (!/priced from/.test(status)) fail('status line missing the priced-from count');
  if (!/[\d.,]+ of [\d.,]+ destinations/.test(status)) fail(`status line is not a live count: ${status}`);
  if (!/checked/.test(status)) fail(`status line does not say how fresh the fares are: ${status}`);
  const trust = await page.locator('.home-trust-cell').count();
  if (trust !== 4) fail(`expected 4 trust cells, got ${trust}`);

  // The dark price map: real pins, and exactly one of them flagged as the
  // cheapest (--flag marks one thing per view, and only that thing).
  const pins = await page.locator('.home-pin').count();
  if (pins < 4) fail(`expected a full set of price pins, got ${pins}`);
  const flagged = await page.locator('.home-pin-flag').count();
  if (flagged !== 1) fail(`expected exactly 1 flagged cheapest pin, got ${flagged}`);
  const firstPin = await page.locator('.home-pin').first().innerText();
  if (!/€\s?[\d.,]+/.test(firstPin)) fail(`price pin carries no price: ${firstPin}`);
  console.log(`map: ${pins} pins, cheapest flagged, first reads ${JSON.stringify(firstPin)}`);
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });

  // ---- 2. The receipt is a real composeTrip breakdown, not marketing copy:
  // itemised lines to the cent, a total, and a computed date-shift footer.
  await page.locator('.home-receipt').scrollIntoViewIfNeeded();
  const rSub = await page.locator('.home-r-sub').first().innerText();
  if (!/4 nights/.test(rSub)) fail(`expected "4 nights" from the d/r params, got: ${rSub}`);
  const rLines = await page.locator('.home-r-line').count();
  if (rLines < 4) fail(`receipt has only ${rLines} line items`);
  const rTotal = await page.locator('.home-r-big').innerText();
  if (!/€\s?[\d.,]+\.\d{2}/.test(rTotal)) fail(`receipt total is not an exact euro figure: ${rTotal}`);
  // The whole page argues that the number at the bottom is the sum of the
  // lines above it. composeTrip carries both a plane and a car breakdown, so
  // listing the wrong set silently produces a receipt that does not add up.
  const money = (s) => Number(s.replace(/[^\d.,]/g, '').replace(/,/g, ''));
  const sum = (await page.locator('.home-r-line b').allInnerTexts())
    .reduce((a, s) => a + money(s), 0);
  if (Math.abs(sum - money(rTotal)) > 0.02) {
    fail(`receipt lines sum to ${sum.toFixed(2)} but the total says ${rTotal}`);
  }
  console.log(`receipt adds up: ${sum.toFixed(2)} = ${rTotal}`);
  // A landing page that promises fares must show a flight on its receipt.
  const rBody = await page.locator('.home-r-body').innerText();
  if (!/Flight out/.test(rBody)) fail(`receipt has no flight lines:\n${rBody}`);
  const rFoot = await page.locator('.home-r-foot').innerText();
  if (!/\d{4}|checked/.test(rFoot)) fail(`receipt footer is not computed: ${rFoot}`);
  console.log(`receipt: ${rLines} lines, total ${rTotal}, footer ${JSON.stringify(rFoot)}`);
  await page.screenshot({ path: `${SHOTS}/home-receipt.png` });

  // ---- 3. The sections below the fold, and the footer.
  await page.locator('.home-page').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(600);
  // The three product screenshots must actually decode. Shot falls back to a
  // text placeholder on error, so a broken path fails quietly and the page
  // just stops showing the product.
  const shotState = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.home-shot img')];
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return { imgs: imgs.length, broken: imgs.filter((i) => !i.naturalWidth).length };
  });
  if (shotState.imgs !== 3) fail(`expected 3 product screenshots, got ${shotState.imgs}`);
  if (shotState.broken) fail(`${shotState.broken} product screenshots failed to load`);
  console.log('all 3 product screenshots loaded');

  const faqs = await page.locator('.home-faq details').count();
  if (faqs !== 5) fail(`expected 5 FAQ entries, got ${faqs}`);
  const plans = await page.locator('.home-plan').count();
  if (plans !== 2) fail(`expected 2 pricing plans, got ${plans}`);
  // The redesign deleted every scroll-triggered effect; nothing may be left
  // sitting at opacity 0 waiting for an observer that no longer exists.
  const invisible = await page.evaluate(() => [...document.querySelectorAll('.home-page section, .home-page footer')]
    .filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length);
  if (invisible) fail(`${invisible} sections render invisible`);
  await page.screenshot({ path: `${SHOTS}/home-full.png`, fullPage: true });

  await page.locator('.home-footer-link', { hasText: 'Privacy policy' }).click();
  await page.locator('.privacy-modal').waitFor({ timeout: 10000 });
  console.log('footer opened the privacy policy');
  await page.locator('.privacy-modal .panel-close, .privacy-modal .auth-close').first().click();
  await page.locator('.home-page').evaluate((el) => { el.scrollTop = 0; });

  // ---- 4. Hand-off to the map, then the logo reopens the homepage.
  // "See prices on the map" appears in the nav, the hero and the closer, so
  // every locator here is by class, not by accessible name: a by-name lookup
  // is a strict-mode violation.
  await page.locator('.home-hero-ctas .home-btn-primary').click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on Explore');
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('.app-header-brand').click();
  await page.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('logo reopened the homepage');
  await page.locator('.home-nav-actions .home-btn-primary').click();
  if (await page.locator('.home-page').count()) fail('homepage did not close on skip');

  // The desktop header carries Home as a real tab now, not just the logo.
  await page.locator('.header-nav-item', { hasText: 'Home' }).click();
  await page.locator('.home-page').waitFor({ timeout: 15000 });
  console.log('header Home tab reopened the homepage');
  await page.locator('.home-nav-actions .home-btn-primary').click();

  // ---- 5. Returning visitor + ?tab=trip deep link, no homepage detour.
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

  // ---- 6. Mobile: Home is a BottomNav tab, and the landing page must not
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

  // The quality floor: 380px with no horizontal scroll, anywhere on the page.
  const ctx4 = await browser.newContext({
    viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true,
  });
  const page4 = await ctx4.newPage();
  await page4.addInitScript(() => { localStorage.setItem('continent.guestMode.v1', '1'); });
  await page4.goto(`${BASE}/?d=2026-08-01&r=2026-08-05&g=1&b=priority_10kg&o=CRL`);
  await page4.locator('.home-page').waitFor({ timeout: 120000 });
  await page4.waitForTimeout(1200);
  const overflow = await page4.evaluate(() => {
    const root = document.querySelector('.home-page');
    const wide = [...root.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
      // Pins are absolutely placed inside a clipping panel by design.
      .filter((el) => !el.closest('.home-map'))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60));
    return { scrolls: root.scrollWidth > root.clientWidth + 1, wide: wide.slice(0, 5) };
  });
  if (overflow.scrolls) fail(`page scrolls sideways at 380px: ${overflow.wide.join(' | ')}`);
  console.log('380px: no horizontal scroll');
  await page4.screenshot({ path: `${SHOTS}/home-380.png`, fullPage: true });

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
