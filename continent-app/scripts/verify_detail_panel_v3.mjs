// Headless check of the reworked destination panel, in the built app.
//
// The panel used to open on a header, a folded "about" block and a receipt
// whose total sat at the bottom. It now opens on: an identity bar that stays
// put, the hero, what the place is, the number the panel exists to justify
// with the one primary action beside it, and only then the receipt, whose
// rows read as lines you could tick off. A third tab carries the guide.
//
// Run from inside continent-app/:  node scripts/verify_detail_panel_v3.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4201;
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

const seed = () => {
  localStorage.setItem('continent.lang.v1', 'en');
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('continent.onboardingSeen.v1', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  localStorage.setItem('continent.mapGuideDismissed.v1', '1');
};

const rect = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), h: Math.round(b.height) };
}, sel);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.addInitScript(seed);

  console.log('opening a destination...');
  await page.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await page.locator('.result-row').first().waitFor({ timeout: 90000 });
  // The top row, not a searched-for city: a ranked row always has a price for
  // the dates on screen, and half this pass is about the price card. (Ask for
  // a specific city and you can land on "no fare for these dates", which is a
  // real state of the panel but not the one under test here.)
  const rowText = (await page.locator('.result-row').first().innerText()).replace(/\n/g, ' ');
  await page.locator('.result-row').first().click();
  await page.locator('.panel.dest-panel.open').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  console.log(`  (opened: ${rowText})`);

  console.log('\n1. The identity bar leads, and stays');
  const bar = page.locator('.dsheet-bar');
  if (!(await bar.count())) fail('no identity bar');
  else pass('the bar renders');
  const eyebrow = (await page.locator('.dsheet-bar .panel-tag').innerText()).trim();
  const city = (await page.locator('.dsheet-bar .panel-city').innerText()).trim();
  if (!/destination/i.test(eyebrow)) fail(`the eyebrow reads "${eyebrow}"`);
  else pass(`"${eyebrow}" over "${city}"`);
  if (!(await page.locator('.dsheet-bar .score-chip, .dsheet-bar .rating-score').count())) {
    fail('the score is not in the bar');
  } else pass('the score sits beside the name');
  const barBox = await rect(page, '.dsheet-bar');
  const heroBox = await rect(page, '.panel-hero');
  if (heroBox && heroBox.top < barBox.bottom - 1) fail('the hero is not below the bar');
  else pass('the hero follows it');
  // The point of a sticky bar: scroll the receipt and the name is still there.
  await page.locator('.dest-panel-scroll').evaluate((el) => { el.scrollTop = 600; });
  await page.waitForTimeout(500);
  const after = await rect(page, '.dsheet-bar');
  if (!after || after.top > barBox.top + 2) fail('the bar scrolled away with the content');
  else pass('it holds its place while the panel scrolls');
  await page.locator('.dest-panel-scroll').evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(400);

  console.log('\n2. The price leads the panel, not the footer');
  const price = page.locator('.dsheet-price');
  if (!(await price.count())) fail('no price card');
  else pass('the price card renders');
  const val = (await page.locator('.dsheet-price-val').innerText()).trim();
  if (!/^€\s?[\d.,]+$/.test(val)) fail(`the headline figure reads "${val}"`);
  else pass(`the headline figure is ${val}`);
  const priceBox = await rect(page, '.dsheet-price');
  const groupBox = await rect(page, '.cost-group');
  if (!groupBox || priceBox.top > groupBox.top) fail('the price sits below the receipt');
  else pass('it sits above the receipt');
  // It must agree with the ranked list, or one of them is lying.
  const rowPrice = (await page.locator('.result-row').first().innerText()).match(/€\s?[\d.,]+/)?.[0] || '';
  const norm = (s) => s.replace(/[^\d]/g, '');
  if (norm(rowPrice) && norm(rowPrice) !== norm(val)) {
    fail(`the panel says ${val}, the list row says ${rowPrice}`);
  } else pass(`it matches the list row (${rowPrice})`);
  // The old copy claimed the total left the flight out. It never did.
  const body = await page.locator('.panel.dest-panel').innerText();
  if (/everything but the flight/i.test(body)) fail('the panel still claims the total excludes the flight');
  else pass('nothing claims the total excludes the flight');

  console.log('\n3. Receipt rows read as lines, with what each figure is for');
  const rows = await page.locator('.cost-group').count();
  if (rows < 2) fail(`only ${rows} cost rows`);
  else pass(`${rows} cost rows`);
  const tiles = await page.evaluate(() => {
    const e = document.querySelector('.cost-group-icon');
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height) };
  });
  if (!tiles || tiles.w < 36) fail(`the glyph tile is ${tiles ? tiles.w : 0}px`);
  else pass(`glyph tiles are ${tiles.w}x${tiles.h}`);
  const subs = await page.locator('.cost-group-valsub').allInnerTexts();
  if (!subs.length) fail('no row says what its figure is for');
  else pass(`the figures carry their context (${subs.map((s) => s.trim()).join(', ')})`);
  if (!(await page.locator('.cost-total-val').isVisible())) fail('the receipt does not total');
  else pass(`it totals to ${(await page.locator('.cost-total-val').innerText()).trim()}`);
  // Every row above the total, not one row and a pinned line hiding the rest.
  const order = await page.evaluate(() => {
    const total = document.querySelector('.cost-total-card')?.getBoundingClientRect().top ?? 0;
    const rows = [...document.querySelectorAll('.cost-group-head')].map((e) => e.getBoundingClientRect().top);
    return { below: rows.filter((y) => y > total).length, rows: rows.length };
  });
  if (order.below) fail(`${order.below} of ${order.rows} cost rows sit below the total`);
  else pass(`all ${order.rows} rows sit above the total`);
  await page.screenshot({ path: `${SHOTS}/detail-panel-desktop.png` });

  console.log('\n4. Start booking opens the leg you book first');
  const before = await page.locator('.cost-group').first().locator('.acc-fold').getAttribute('aria-hidden');
  if (before !== 'true') fail('the getting-there group was already open');
  else pass('the receipt starts folded');
  await page.locator('.dsheet-book').click();
  await page.waitForTimeout(900);
  const opened = await page.locator('.cost-group').first().locator('.acc-fold').getAttribute('aria-hidden');
  if (opened !== 'false') fail('Start booking did not open the getting-there group');
  else pass('it opens getting there');
  if (!(await page.locator('.cost-group').first().locator('.cost-action').first().isVisible())) {
    fail('the booking links are not on screen after it');
  } else pass('the airline links are on screen');

  console.log('\n5. The guide has a tab of its own');
  const tabs = await page.locator('.panel-tabs .tab').allInnerTexts();
  pass(`tabs: ${tabs.map((s) => s.trim()).join(' | ')}`);
  // A tab that wraps onto a second line reads as a fault, not as a label.
  const tabLines = await page.evaluate(() => [...document.querySelectorAll('.panel-tabs .tab')]
    .filter((e) => e.getBoundingClientRect().height > 34).length);
  if (tabLines) fail(`${tabLines} tab labels wrapped onto a second line`);
  else pass('every tab label holds one line');
  const doors = await page.locator('.dsheet-link').count();
  if (!doors) console.log('  (no Explore doors for this destination)');
  if (tabs.length === 3) {
    await page.locator('.panel-tabs .tab').nth(2).click();
    await page.waitForTimeout(700);
    const explore = await page.locator('.dsheet-explore').count();
    if (!explore) fail('the Explore tab rendered nothing');
    else pass('the Explore tab carries the guide');
    await page.screenshot({ path: `${SHOTS}/detail-panel-explore.png` });
    await page.locator('.panel-tabs .tab').nth(0).click();
    await page.waitForTimeout(500);
  } else if (tabs.length !== 2) {
    fail(`unexpected tab count: ${tabs.length}`);
  }

  await ctx.close();

  console.log('\n6. Phone: the same panel as a bottom sheet');
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => fail(`page error (phone): ${e.message}`));
  await p2.addInitScript(seed);
  await p2.goto(`${BASE}/?tab=map&o=CRL&d=2026-08-04&r=2026-08-08`);
  await p2.locator('.map-toolrow .origin-btn').waitFor({ timeout: 90000 });
  await p2.waitForTimeout(1500);
  await p2.locator('.bottom-nav-item').nth(0).click();
  await p2.waitForTimeout(1500);
  await p2.locator('.places-search input').fill('rome');
  await p2.waitForTimeout(1000);
  await p2.locator('.places-dcard').first().click();
  await p2.locator('.panel.dest-panel.open').waitFor({ timeout: 30000 });
  await p2.waitForTimeout(1500);
  // Expand to full so the whole panel is measurable.
  await p2.locator('.dest-grip-hit').click();
  await p2.waitForTimeout(800);
  const overflow = await p2.evaluate(() => {
    const el = document.querySelector('.dest-panel-scroll');
    return el ? el.scrollWidth - el.clientWidth : -1;
  });
  if (overflow > 0) fail(`the sheet scrolls ${overflow}px sideways`);
  else pass('no sideways scroll in the sheet');
  const book = await p2.evaluate(() => {
    const e = document.querySelector('.dsheet-book');
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { h: Math.round(b.height), right: Math.round(b.right), w: document.documentElement.clientWidth };
  });
  if (!book) fail('no booking button on the phone');
  else if (book.h < 44) fail(`the booking button is ${book.h}px tall`);
  else if (book.right > book.w) fail('the booking button runs off the screen');
  else pass(`the booking button is ${book.h}px tall and on screen`);
  await p2.screenshot({ path: `${SHOTS}/detail-panel-phone.png` });

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
