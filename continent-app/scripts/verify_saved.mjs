// Headless look at the Saved-trips panel, in both states it can be in:
//   1. Empty shelves (a fresh device, nothing kept yet).
//   2. Populated day-plan cards, seeded straight into localStorage.
// Run from inside continent-app/:  node scripts/verify_saved.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Reuse an already-running preview on this port; only spawn when nothing
// answers. (Not port 4190: it is on the fetch spec's blocked-port list.)
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

const DAY_PLANS = [
  { id: 'v1', label: 'Bruges', startDate: '2026-08-03', stops: [{ destinationId: 'gem:bruges', days: 2 }] },
  {
    id: 'v2',
    label: 'Lisbon and Porto',
    startDate: '2026-09-10',
    stops: [{ destinationId: 'LIS', days: 3 }, { destinationId: 'OPO', days: 2 }],
  },
];

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// Past the entry gate and any first-run coach marks, into the app proper.
const enterApp = async (page) => {
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 });
  } catch { /* auth not configured in this build */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 3000 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(600);
};

// "Saved" lives in the header on desktop and in the bottom nav on mobile,
// same label either way.
const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^Saved trips$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.saved-trips-panel').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
};

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. Empty shelves.
  const empty = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await empty.goto(BASE);
  await enterApp(empty);
  await openSaved(empty);
  const dashed = await empty.evaluate(() => [...document.querySelectorAll('.saved-empty')]
    .map((el) => getComputedStyle(el).borderStyle).filter((s) => s.includes('dashed')).length);
  if (dashed) fail(`${dashed} empty state(s) still drawn with a dashed border`);
  const ctas = await empty.locator('.saved-empty-cta').count();
  console.log('empty shelves:', await empty.locator('.saved-empty').count(), 'with CTAs:', ctas);
  await empty.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-empty.png` });

  // ---- 2. Cards, seeded on the device.
  const full = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await full.addInitScript((plans) => {
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await full.goto(BASE);
  await enterApp(full);
  await openSaved(full);
  const cards = await full.locator('.saved-card').count();
  if (cards !== DAY_PLANS.length) fail(`expected ${DAY_PLANS.length} cards, got ${cards}`);
  const titles = await full.locator('.saved-card-title').allInnerTexts();
  console.log('cards:', titles);
  // No leftover pair of always-on tool buttons: one menu per card instead.
  const more = await full.locator('.saved-card-more').count();
  if (more !== cards) fail(`expected ${cards} "more" buttons, got ${more}`);
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-cards.png` });

  // The menu opens over the card, with Remove sitting inside it.
  await full.locator('.saved-card-more').first().click();
  await full.locator('.saved-card-pop').waitFor({ timeout: 4000 });
  await full.waitForTimeout(250);
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-menu.png` });

  // Remove still asks before it throws work away.
  await full.locator('.saved-card-pop-item.danger').click();
  await full.locator('.saved-card-confirm').waitFor({ timeout: 4000 });
  await full.locator('.saved-trips-panel').screenshot({ path: `${SHOTS}/saved-confirm.png` });
  await full.locator('.saved-card-confirm-keep').click();
  if (await full.locator('.saved-card').count() !== cards) fail('"Keep" did not put the card back');

  // ---- 3. Mobile width.
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mob.addInitScript((plans) => {
    localStorage.setItem('carta.dayplans.v1', JSON.stringify(plans));
  }, DAY_PLANS);
  await mob.goto(BASE);
  await enterApp(mob);
  await openSaved(mob);
  const overflow = await mob.evaluate(() => {
    const p = document.querySelector('.saved-trips-panel');
    return p ? p.scrollWidth - p.clientWidth : -1;
  });
  if (overflow > 1) fail(`saved panel scrolls sideways on mobile by ${overflow}px`);
  await mob.screenshot({ path: `${SHOTS}/saved-mobile.png` });

  await browser.close();
  console.log(process.exitCode ? 'done with failures' : 'all checks passed');
} finally {
  if (srv) srv.kill();
}
