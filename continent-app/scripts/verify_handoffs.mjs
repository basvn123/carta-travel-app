// Headless check of the hand-offs between tabs (prompt I1): the two doors on
// a destination page, the one on a trail / beach page, the shareable seed
// links they stand for, and the way back from a trip-born day to its trip.
//
// T1089: updated for the current wizards. The day flow is the five-step day
// wizard (a seed lands on step 2, "Which days?", with the stay filled in), the
// trip seed lands on Where, the destination page's doors are "Plan a trip here"
// (.destp-plan-btn) and "Plan one day" (.tcard-day), and the trail and beach
// pages' door is the primary "Add to a day plan" (.ox-add, desktop widths).
// The old "Plan your days" then "Back to trip" round trip (section 7) went
// with the planner's planned view; the trip page now holds a Days section, so
// that round trip has no harness any more (see the register).
//
// Run from inside continent-app/:  node scripts/verify_handoffs.mjs [url]
// Uses the URL argument or CARTA_PORT, else serves dist/ through vite preview.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 4211;
const BASE = (process.argv[2] ? process.argv[2] : `http://127.0.0.1:${PORT}`).replace(/\/?$/, '/');
const SHOTS = 'scripts/shots/handoffs';
mkdirSync(SHOTS, { recursive: true });

let server = null;
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite preview never came up'); process.exit(1); }
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failed += 1;
};
const errors = [];
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|entrypoint_config|config is not valid/i;
const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await seed(page);
wire(page);

const open = async (url) => {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5500);
};
const activeTab = () => page.evaluate(() => {
  const el = document.querySelector('[aria-current="page"], .bottom-nav .on, .topbar-tab.on, [data-tab].on');
  return el ? el.textContent.trim() : '';
});
// The phone rail is one line under the header title, which names the step;
// desktop keeps the full rail with aria-current. Either answers.
const currentStep = async () => {
  const a = await page.locator('[aria-current="step"]:visible').first().textContent().then((s) => s.trim()).catch(() => '');
  if (a) return a;
  return page.locator('.shape-head-title:visible').first().textContent().then((s) => s.trim()).catch(() => '');
};
// Opened the way a card link does it: the app boots, then the hash moves.
const openHash = async (hash) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.bottom-nav, .header-nav', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(3500);
};
const visibleText = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ── 1. ?tab=trip&cc=BE: the wizard on Where with Belgium picked ───────────
await open('?tab=trip&cc=BE');
check('trip seed link: Belgium is the picked country',
  /belgium/i.test(await page.locator('.guide-picked-chip').allTextContents().then((a) => a.join(' ')).catch(() => '')));
check('trip seed link: the wizard sits on the Where step', /where/i.test(await visibleText()) && /1 of 4/.test(await visibleText()));
check('trip seed link: the URL drops the seed once consumed', !/cc=/.test(page.url()), page.url());
await shot('01-trip-seed-be');

// ── 2. ?tab=day&dest=BRU: the day wizard on Which days, staying in Brussels ──
await open('?tab=day&dest=BRU');
check('day seed link: the wizard opens on the Which days question',
  /which days\?/i.test(await visibleText()) && /step 2 of 5/i.test(await visibleText()));
check('day seed link: the stay is Brussels', /planning around:\s*brussels/i.test((await visibleText()).replace(/\n+/g, ' ')));
check('day seed link: the URL drops the seed once consumed', !/[?&]dest=/.test(page.url()), page.url());
await shot('02-day-seed-bru');

// ── 3. ?tab=day&feat=trail:AT:20050: same, with the trail as the idea ──────
await open('?tab=day&feat=trail:AT:20050');
check('feature seed link: the wizard opens on the Which days question',
  /which days\?/i.test(await visibleText()));
// Move on to the ideas step: the trail must already be listed.
await page.locator('.guide-next:visible').first().click().catch(() => {});
await page.waitForTimeout(900);
check('feature seed link: the trail is already an idea', /bergeseen/i.test(await visibleText()));
await shot('03-feat-seed-trail');

// ── 4. Destination page doors (desktop: the price card carries them) ──────
await page.setViewportSize({ width: 1280, height: 900 });
await openHash('dest=BRU');
const plan = page.locator('.destp-plan-btn');
check('destination page: the Plan a trip here door', (await plan.count()) >= 1, String(await plan.count()));
check('destination page: the Plan one day door', (await page.locator('.tcard-day').count()) >= 1);
await shot('04-destp-doors');
await plan.first().click();
await page.waitForTimeout(2500);
check('Plan a trip here: the destination page closes', !(await page.locator('.destp').isVisible().catch(() => false)));
const afterPlan = (await visibleText()).replace(/\n+/g, ' / ').slice(0, 160);
check('Plan a trip here: the trip wizard opens on Where', /where are we going/i.test(afterPlan), afterPlan);
check('Plan a trip here: Belgium is picked',
  /belgium|brussels/i.test(await page.locator('.guide-picked-chip, .guide-recap-chip').allTextContents().then((a) => a.join(' ')).catch(() => '')));
await shot('05-plan-trip-here');

await openHash('dest=BRU');
await page.locator('.tcard-day').first().click();
await page.waitForTimeout(2500);
check('Plan one day: the wizard opens on Which days in Brussels',
  /which days\?/i.test(await visibleText()) && /brussels/i.test(await visibleText()));
await shot('06-plan-day-here');

// ── 5. Trail page door (desktop width: the primary sits in the page) ─────
await page.setViewportSize({ width: 1280, height: 900 });
await open('#trail=20050&tc=AT'); // read once at boot, so a fresh load
await page.waitForTimeout(2500);
const trailBtn = page.locator('.ox-add');
check('trail page: has an Add to a day plan button', await trailBtn.first().isVisible().catch(() => false));
await shot('07-trail-door');
await trailBtn.first().click().catch(() => {});
await page.waitForTimeout(2500);
const t5 = await visibleText();
check('trail page door: the wizard opens on Which days', /which days\?/i.test(t5));
check('trail page door: the stay is the town at the trailhead (Gosau)', /gosau|hallstatt/i.test(t5));
await shot('08-trail-to-day');

// ── 6. Beach page door ────────────────────────────────────────────────────
await open('#beach=gr-voidokilia-beach-Q890802&bc=GR');
await page.waitForTimeout(2500);
const beachBtn = page.locator('.ox-add');
check('beach page: has an Add to a day plan button', await beachBtn.first().isVisible().catch(() => false));
await beachBtn.first().click().catch(() => {});
await page.waitForTimeout(2500);
check('beach page door: the wizard opens on Which days', /which days\?/i.test(await visibleText()));
await page.locator('.guide-next:visible').first().click().catch(() => {});
await page.waitForTimeout(900);
check('beach page door: the beach is already an idea', /voidokilia/i.test(await visibleText()));
await shot('09-beach-to-day');

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
if (server) server.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
