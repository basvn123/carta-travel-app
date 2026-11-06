// T1103 (ROADMAP G12): how many screens and taps from the Plan home to the
// first priced trip, walking the plan flow the shortest honest way (every
// screen's default, the primary button, a first option only where Continue
// waits for one). Also checks the short flow's promises when `--expect` is
// given: no trip-kind sheet, no Create screen, no trip home on the way, the
// refine card on the trips and its doors.
//
// Build (fast build) and serve it with the data, then
//   node scripts/verify_plan_short.mjs <shotdir> [width] [base] [--expect]
// e.g. node ../Execution/P15/T840-T843-walk/serve-a.mjs ../.fastbuild public 5871
//      node scripts/verify_plan_short.mjs ../Execution/P15/T1103-shots 390 http://localhost:5871 --expect
// Prints one JSON line (screens, taps, titles) and exits 1 on a failed check.
// Screenshots go to the shot folder (gitignored), never into the repo.
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const EXPECT = process.argv.includes('--expect');
const OUT = args[0] || 'scripts/shots/plan-short';
const W = Number(args[1] || 390);
const BASE = args[2] || 'http://localhost:5871';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`[${W}] ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };

// PW_CHROMIUM: a preinstalled browser when the project's Playwright pins another build.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: W, height: W < 769 ? 844 : 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
  } catch { /* none */ }
});
const shot = (name) => page.screenshot({ path: `${OUT}/${W}-${name}.png` }).catch(() => {});
const title = async () => ((await page.locator('.pf-title').first().textContent({ timeout: 500 }).catch(() => '')) || '').trim();

await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pf-open, .pfh-new', { timeout: 60000 });
await shot('0-plan-home');
const t0 = Date.now();
let taps = 0;
const screens = ['Plan home'];
await page.getByRole('button', { name: 'Start planning' }).first().click();
taps += 1;

let last = '';
let priced = false;
const seen = { kind: false, create: false, tripHome: false };
for (let i = 0; i < 60 && !priced; i++) {
  await page.waitForTimeout(350);
  // The priced trips: a card with a figure on it.
  if (await page.locator('.tff-trips').count()) {
    const money = await page.locator('.tff-trips').first().innerText().catch(() => '');
    if (/€\s?\d|\d\s?€/.test(money)) { priced = true; break; }
    continue;
  }
  if (await page.locator('.pf-create').count()) {
    seen.create = true;
    if (last !== 'create') { screens.push('Create trip'); last = 'create'; }
    await page.getByRole('button', { name: 'Create trip' }).click();
    taps += 1;
    continue;
  }
  if (await page.locator('.pf-home').count()) {
    seen.tripHome = true;
    if (last !== 'tripHome') { screens.push('Trip home'); last = 'tripHome'; }
    await page.locator('.pf-home .btn-primary').first().click();
    taps += 1;
    continue;
  }
  const tt = await title();
  if (!tt) continue; // the loader, or a screen still arriving
  if (/what do you want to plan/i.test(tt)) seen.kind = true;
  // The loader is the trips arriving, not a step of the walk.
  if (/^Finding trips/i.test(tt)) { last = tt; continue; }
  if (tt !== last) { screens.push(tt); last = tt; console.log(`[${W}] screen ${screens.length}: ${tt}`); await shot(`${screens.length - 1}-step`); }
  const btn = page.locator('.pf-foot .btn-primary, .guide-foot .btn-primary').first();
  if (!(await btn.count())) continue;
  if (await btn.isDisabled()) {
    // Try the visible options in order until Continue takes the answer
    // (When opens on set dates with none picked: a choice without a
    // calendar is the shortest honest answer).
    const opts = page.locator('.pf [role=radio]:visible, .pf [role=checkbox]:visible, .pf button[aria-pressed]:visible');
    const n = Math.min(await opts.count(), 8);
    for (let k = 0; k < n && (await btn.isDisabled()); k++) {
      const o = opts.nth(k);
      if ((await o.getAttribute('aria-checked')) === 'true' || (await o.getAttribute('aria-pressed')) === 'true') continue;
      await o.click({ timeout: 5000 }).catch(() => {});
      taps += 1;
      await page.waitForTimeout(150);
    }
  }
  if (await btn.isDisabled()) { check(`continue waits on "${tt}"`, false); break; }
  await btn.click();
  taps += 1;
}
const ms = Date.now() - t0;
await page.waitForTimeout(600);
await shot('9-trips');
check('a priced trip is reached', priced);
const report = { width: W, screens: screens.length, taps, ms, titles: screens };

if (EXPECT) {
  check('no trip-kind sheet on the way', !seen.kind);
  check('no Create trip screen on the way', !seen.create);
  check('no trip home on the way', !seen.tripHome);
  check('five screens or fewer before the trips', screens.length <= 5, String(screens.length));
  const refine = page.locator('.pf-refine');
  check('the refine card stands on the trips', (await refine.count()) === 1);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no sideways scroll on the trips', o <= 1, `${o}px`);
  // Where you sleep opens its screen and comes back to the trips.
  await page.locator('.pf-refine-sleep').click();
  await page.waitForTimeout(500);
  const sleepTitle = await title();
  check('Where you sleep opens its screen', /like to travel|sleep/i.test(sleepTitle), sleepTitle);
  await shot('10-sleep');
  await page.locator('.pf-foot .btn-primary').first().click();
  await page.waitForSelector('.tff-trips', { timeout: 30000 });
  check('and comes back to the trips', (await page.locator('.tff-trips').count()) === 1);
  // Fit these to me walks the help-me-choose questions; Back on the first
  // goes back to the trips.
  await page.waitForSelector('.pf-refine-go', { timeout: 30000 });
  await page.locator('.pf-refine-go').click();
  await page.waitForTimeout(500);
  const q1 = await title();
  check('Fit these to me opens the first question', Boolean(q1) && !(await page.locator('.tff-trips').count()), q1);
  await shot('11-refine-q1');
  await page.locator('.pf-sheet-head button, .pf-head button').first().click().catch(() => {});
  await page.waitForSelector('.tff-trips', { timeout: 30000 }).catch(() => {});
  check('Back on the first question returns to the trips', (await page.locator('.tff-trips').count()) === 1);
}
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(JSON.stringify(report));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
