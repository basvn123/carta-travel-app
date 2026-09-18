// Headless check of the hand-offs between tabs (prompt I1): the two doors on
// a destination page, the one on a trail / beach page, the shareable seed
// links they stand for, and the way back from a trip-born day to its trip.
//
// Run from inside continent-app/:  node scripts/verify_handoffs.mjs
// Needs a fresh `npx vite build` first: it serves dist/ through vite preview.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4211;
const BASE = `http://127.0.0.1:${PORT}/`;
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
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|emrldtp|entrypoint_config|config is not valid/i;
const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
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
  await page.waitForTimeout(3200);
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
const visibleText = () => page.evaluate(() => document.body.innerText);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ── 1. ?tab=trip&cc=BE: the wizard on Where with Belgium picked ───────────
await open('?tab=trip&cc=BE');
check('trip seed link: Belgium is the picked country',
  /belgium/i.test(await page.locator('.guide-picked-chip').allTextContents().then((a) => a.join(' ')).catch(() => '')));
check('trip seed link: the wizard sits on the Where step', /where/i.test(await currentStep()), await currentStep());
check('trip seed link: the URL drops the seed once consumed', !/cc=/.test(page.url()), page.url());
await shot('01-trip-seed-be');

// ── 2. ?tab=day&dest=BRU: the day flow on When, staying in Brussels ───────
await open('?tab=day&dest=BRU');
check('day seed link: the flow opens on the When question',
  /which day are you visiting/i.test(await visibleText()));
check('day seed link: the stay is Brussels', /brussels/i.test(await visibleText()));
check('day seed link: the URL drops the seed once consumed', !/dest=/.test(page.url()), page.url());
await shot('02-day-seed-bru');

// ── 3. ?tab=day&feat=trail:AT:20050: same, with the trail as the idea ──────
await open('?tab=day&feat=trail:AT:20050');
check('feature seed link: the flow opens on the When question',
  /which day are you visiting/i.test(await visibleText()));
// Move on to the ideas step: the trail must already be listed.
await page.locator('.day-flow-chip:visible').first().click().catch(() => {});
await page.locator('.day-flow-next:visible').first().click().catch(() => {});
await page.waitForTimeout(900);
check('feature seed link: the trail is already an idea', /bergeseen/i.test(await visibleText()));
await shot('03-feat-seed-trail');

// ── 4. Destination page doors ─────────────────────────────────────────────
await open('#dest=BRU');
const plan = page.locator('.destp-plan-btn');
check('destination page: two planner doors', (await plan.count()) === 2, String(await plan.count()));
await shot('04-destp-doors');
await plan.nth(0).click();
await page.waitForTimeout(2500);
check('Plan a trip here: the destination page closes', !(await page.locator('.destp').isVisible().catch(() => false)));
check('Plan a trip here: the wizard sits on Where', /where/i.test(await currentStep()), await currentStep());
check('Plan a trip here: Belgium is picked',
  /belgium/i.test(await page.locator('.guide-picked-chip').allTextContents().then((a) => a.join(' ')).catch(() => '')));
await shot('05-plan-trip-here');

await open('#dest=BRU');
await page.locator('.destp-plan-btn').nth(1).click();
await page.waitForTimeout(2500);
check('Plan a day here: the flow opens on When in Brussels',
  /which day are you visiting/i.test(await visibleText()) && /brussels/i.test(await visibleText()));
await shot('06-plan-day-here');

// ── 5. Trail page door ────────────────────────────────────────────────────
await open('#trail=20050&tc=AT');
await page.waitForTimeout(2500);
const trailBtn = page.locator('.feat-dayplan');
check('trail page: has an Add to a day plan button', await trailBtn.isVisible().catch(() => false));
await shot('07-trail-door');
await trailBtn.click().catch(() => {});
await page.waitForTimeout(2500);
const t5 = await visibleText();
check('trail page door: the flow opens on When', /which day are you visiting/i.test(t5));
check('trail page door: the stay is the town at the trailhead (Gosau)', /gosau|hallstatt/i.test(t5));
await shot('08-trail-to-day');

// ── 6. Beach page door ────────────────────────────────────────────────────
await open('#beach=gr-voidokilia-beach-Q890802&bc=GR');
await page.waitForTimeout(2500);
const beachBtn = page.locator('.feat-dayplan');
check('beach page: has an Add to a day plan button', await beachBtn.isVisible().catch(() => false));
await beachBtn.click().catch(() => {});
await page.waitForTimeout(2500);
check('beach page door: the flow opens on When', /which day are you visiting/i.test(await visibleText()));
await page.locator('.day-flow-chip:visible').first().click().catch(() => {});
await page.locator('.day-flow-next:visible').first().click().catch(() => {});
await page.waitForTimeout(900);
check('beach page door: the beach is already an idea', /voidokilia/i.test(await visibleText()));
await shot('09-beach-to-day');

// ── 7. Plan your days -> Back to trip ─────────────────────────────────────
// A trip draft in storage stands in for a saved trip: the planner restores
// it, its planned view offers "Plan your days", and the day workspace that
// opens must offer the way back.
await page.addInitScript(() => {
  try {
    localStorage.setItem('carta.tripDraft.v1', JSON.stringify({
      tripStart: '2026-10-05',
      stops: [{ destinationId: 'BRU', nights: 2, activities: [] }, { destinationId: 'AMS', nights: 2, activities: [] }],
      planLabel: 'Handoff test trip',
      planned: true,
    }));
  } catch { /* storage unavailable */ }
});
await open('?tab=trip&paymock');
await page.waitForTimeout(1500);
const planDays = page.locator('.trip-planday-btn:visible').first();
check('trip planned view: offers Plan your days', await planDays.isVisible().catch(() => false));
await shot('10-trip-planned');
await planDays.click().catch(() => {});
await page.waitForTimeout(3000);
const back = page.locator('.day-topcard-trip').first();
check('day workspace: offers Back to trip for a trip-born day', (await back.count()) > 0);
await shot('11-day-from-trip');
await back.click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);
check('Back to trip: lands on the trip planner with the trip on screen',
  await page.locator('.trip-planday-btn:visible').first().isVisible().catch(() => false));
await shot('12-back-to-trip');

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
if (server) server.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
