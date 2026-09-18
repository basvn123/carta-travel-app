// Before/after screenshots for the planner spacing system (prompt A2).
//
//   node scripts/shot_planner_rhythm.mjs before [url]
//   node scripts/shot_planner_rhythm.mjs after  [url]
//
// Writes shots/rhythm-<tag>-<step>-<width>.png for every wizard step and every
// day-flow step, at 375 and 1280. The two runs are meant to be flipped between,
// so the walk has to be identical each time: same answers, same waits, same
// order. Anything that varies run to run (a live fare, a map tile) is not what
// this is looking at, so the shots are viewport-only and the map step is given
// time to settle rather than being asserted on.
//
// It also measures the gap between each step's title and the first thing under
// it, and prints the table. That number is the actual subject of A2: a
// screenshot shows you the spacing, the measurement tells you whether it is the
// same spacing on every screen.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const TAG = process.argv[2] || 'before';
const URL = process.argv[3] || 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const gaps = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid|maplibre|WebGL|tile/i;
const browser = await chromium.launch();

/** The vertical gap between a step's heading and the first block under it. */
async function measure(page, step, width) {
  const gap = await page.evaluate(() => {
    let head = document.querySelector('.guide-canvas > .guide-title, .day-flow-q');
    if (!head) return null;
    // The first following sibling that actually occupies space: a hidden or
    // zero-height node is not what the eye reads as "the content".
    const next = (from) => {
      let el = from.nextElementSibling;
      while (el && el.getBoundingClientRect().height === 0) el = el.nextElementSibling;
      return el;
    };
    let el = next(head);
    if (!el) return null;
    // A subtitle is part of the heading, not the content under it. The number
    // A2 is about is the distance from the heading block to the first real
    // block, so step over the sub and report the caption's own tight gap
    // separately.
    let sub = null;
    if (el.classList.contains('guide-sub')) {
      const a0 = head.getBoundingClientRect();
      sub = Math.round(el.getBoundingClientRect().top - a0.bottom);
      const after = next(el);
      if (!after) return null;
      head = el;
      el = after;
    }
    const a = head.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { gap: Math.round(b.top - a.bottom), sub };
  });
  gaps.push({ step, width, gap: gap && gap.gap, sub: gap && gap.sub });
}

async function shoot(page, step, width) {
  await measure(page, step, width);
  await page.screenshot({ path: `shots/rhythm-${TAG}-${step}-${width}.png` });
}

/** Boot the app as a guest, with a clean draft. */
async function boot(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) console.log('  console: ' + m.text().slice(0, 120));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.removeItem('carta.plannerDraft.v1');
    } catch { /* storage unavailable */ }
  });
  await page.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      display_name: 'Ghent, East Flanders, Belgium',
      name: 'Ghent',
      address: { country: 'Belgium', country_code: 'be' },
      lat: '51.05',
      lon: '3.72',
    }]),
  }));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const got = page.getByRole('button', { name: /got it/i }).first();
  if (await got.isVisible().catch(() => false)) { await got.click().catch(() => {}); await page.waitForTimeout(400); }
}

/** Open the trip wizard. Desktop has a header button, a phone has the plus. */
async function openWizard(page) {
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(2000);
}

/** Walk every trip-wizard step, shooting each one. */
async function wizard(page, width) {
  await boot(page);
  await openWizard(page);
  const next = async () => {
    await page.locator('.guide-next').first().click();
    await page.waitForTimeout(1100);
  };

  await shoot(page, 'wiz-booked', width);
  await next();

  await shoot(page, 'wiz-from', width);
  await page.locator('.guide-origin-home-card input.guide-search').fill('Ghent');
  await page.locator('.guide-origin-home-card .guide-carfrom-search').click();
  await page.waitForTimeout(600);
  await page.locator('.guide-origin-home-card .guide-city-btn').first().click();
  await page.waitForTimeout(800);
  await next();

  await shoot(page, 'wiz-when', width);
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(10).click();
  await page.waitForTimeout(300);
  await next();
  await page.waitForTimeout(1200);

  // Where: the quiz tab as it opens, then the hand picker.
  await shoot(page, 'wiz-where-quiz', width);
  const tabs = page.locator('.guide-wtabs [role="tab"]');
  if (await tabs.count() === 2) {
    await tabs.nth(1).click();
    await page.waitForTimeout(800);
    await shoot(page, 'wiz-where-hand', width);
    await tabs.nth(0).click();
    await page.waitForTimeout(500);
  }

  // Answer the quiz so the step can be left, then shoot the Trips step.
  await page.locator('.wq-chip', { hasText: /^City break$/i }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.wq-next').first().click();
  await page.waitForTimeout(400);
  for (const label of ['Smart mid-range', 'No preference', 'Anywhere in Europe', 'A few stops']) {
    await page.locator('.wq-chip', { hasText: new RegExp(`^${label}`, 'i') }).first().click();
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1200);
  await page.locator('.mcard-add').first().click();
  await page.waitForTimeout(600);
  await next();
  await page.waitForTimeout(1600);
  await shoot(page, 'wiz-trips', width);
}

/** Walk the day-planner landing flow, shooting each step. */
async function dayFlow(page, width) {
  await boot(page);
  // The day planner is a tab, not the wizard: find its door on either layout.
  const top = page.locator('button', { hasText: /day planner|plan a day/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(500);
    const item = page.locator('.plan-chooser-item').nth(1);
    if (await item.isVisible().catch(() => false)) await item.click();
  }
  await page.waitForTimeout(2500);

  if (!(await page.locator('.day-flow-q').first().isVisible().catch(() => false))) {
    console.log(`  (day flow not reached at ${width})`);
    return;
  }
  await shoot(page, 'day-stay', width);

  // Pick a stay from the popular chips, which is the shortest path through.
  const chip = page.locator('.day-flow-chip').first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await page.waitForTimeout(1200);
  }
  const nextBtn = page.locator('.day-flow-next');
  if (await nextBtn.isEnabled().catch(() => false)) { await nextBtn.click(); await page.waitForTimeout(1000); }
  await shoot(page, 'day-when', width);

  const dchip = page.locator('.day-flow-chips-center .day-flow-chip').first();
  if (await dchip.isVisible().catch(() => false)) { await dchip.click(); await page.waitForTimeout(600); }
  if (await nextBtn.isEnabled().catch(() => false)) { await nextBtn.click(); await page.waitForTimeout(1000); }
  // Step 3, ideas (D4). Worth its own frame, then answered with the "no"
  // that most days give so the fork is still the last shot of the run.
  await shoot(page, 'day-ideas', width);
  const noIdeas = page.getByRole('button', { name: /surprise me/i });
  if (await noIdeas.isVisible().catch(() => false)) { await noIdeas.click(); await page.waitForTimeout(1000); }
  await shoot(page, 'day-how', width);
}

for (const width of [1280, 375]) {
  const viewport = { width, height: width === 375 ? 812 : 900 };
  console.log(`\n--- ${width} ---`);
  const a = await browser.newPage({ viewport });
  await wizard(a, width).catch((e) => console.log('  wizard stopped: ' + e.message.split('\n').slice(0, 5).join(' / ')));
  await a.close();
  const b = await browser.newPage({ viewport });
  await dayFlow(b, width).catch((e) => console.log('  day flow stopped: ' + e.message.split('\n').slice(0, 5).join(' / ')));
  await b.close();
}

await browser.close();

console.log(`\ntitle-to-content gap, ${TAG}:`);
for (const g of gaps) {
  const sub = g.sub == null ? '' : `   (title->sub ${g.sub}px)`;
  console.log(`  ${String(g.width).padEnd(5)} ${g.step.padEnd(16)} ${g.gap == null ? 'n/a' : g.gap + 'px'}${sub}`);
}
const seen = gaps.filter((g) => g.gap != null).map((g) => g.gap);
console.log(`\ndistinct gaps: ${[...new Set(seen)].sort((x, y) => x - y).join(', ')}`);
