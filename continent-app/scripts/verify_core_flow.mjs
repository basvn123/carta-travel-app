// T1123 (ROADMAP G4): the core plan flow fixes, walked in the built app.
//   1. When on set dates with none picked says why Continue waits (row T1103-h).
//   2. A reload in the middle of the setup comes back to the same question,
//      not to the Plan opening (whose Start planning would begin a new trip).
//   3. The refine card says how many questions Fit these to me asks.
//   4. A reload on the priced trips comes back to them, not to the trip home.
//   5. Back from the trips lands on the trip home, whose main button goes
//      back to the trips (it used to walk ten questions again).
//
// Build (fast build) and serve it with the data, then
//   node scripts/verify_core_flow.mjs <shotdir> [width] [base]
// e.g. node ../Execution/P15/T840-T843-walk/serve-a.mjs ../.fastbuild public 5871
//      PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/verify_core_flow.mjs ../Execution/P15/T1123-shots 390 http://localhost:5871
//      (add --skip-setup-reload on a base build to reach checks 3 to 5)
// Exits 1 on a failed check. Screenshots go to the shot folder (gitignored).
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const OUT = args[0] || 'scripts/shots/core-flow';
const W = Number(args[1] || 390);
const BASE = args[2] || 'http://localhost:5871';
// --skip-setup-reload: walk on without check 2's reload (to measure a base
// build, where that reload ends the walk on the Plan opening).
const SKIP_SETUP_RELOAD = process.argv.includes('--skip-setup-reload');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`[${W}] ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };

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
const title = async () => ((await page.locator('.pf-title').first().textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
const primary = () => page.locator('.pf-foot .btn-primary').first();
async function waitTitle(re, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const tt = await title();
    if (re.test(tt)) return tt;
    await page.waitForTimeout(250);
  }
  return title();
}
async function waitPriced(ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const txt = await page.locator('.tff-trips').first().innerText({ timeout: 500 }).catch(() => '');
    if (/€\s?\d|\d\s?€/.test(txt)) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pf-open, .pfh-new', { timeout: 60000 });
await page.getByRole('button', { name: 'Start planning' }).first().click();

// Tell, then Who, on their defaults.
await waitTitle(/./);
await primary().click();
await waitTitle(/who/i);
await primary().click();

// 1. When: set dates, none picked.
const whenTitle = await waitTitle(/when/i);
const waits = await primary().isDisabled();
const note = (await page.locator('.pf-note[role=status]').first().textContent({ timeout: 2000 }).catch(() => '')) || '';
check('When waits and says why', waits && /start and an end date/i.test(note), `${whenTitle}: ${note.trim()}`);
await shot('1-when-note');
await page.getByRole('radio', { name: /Not sure yet/i }).first().click().catch(() => {});
await page.waitForTimeout(200);
check('the note leaves once Continue can go', (await page.locator('.pf-note[role=status]').count()) === 0 || !(await primary().isDisabled()));
await primary().click();

// 2. Reload on From.
const fromTitle = await waitTitle(/from|leav/i);
if (!SKIP_SETUP_RELOAD) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await waitTitle(/./, 30000);
  check('a reload mid-setup keeps the question', afterReload === fromTitle, `${fromTitle} -> ${afterReload || 'Plan home'}`);
  await shot('2-from-after-reload');
}

// From: the first suggestion if Continue waits for one.
if (await primary().isDisabled()) {
  const opt = page.locator('.pf [role=radio]:visible, .pf [role=option]:visible, .pf button[aria-pressed]:visible').first();
  await opt.click({ timeout: 5000 }).catch(() => {});
}
await primary().click();

// 3. The trips and the refine card's count.
check('the short setup reaches priced trips', await waitPriced());
const sub = (await page.locator('.pf-refine-sub').first().textContent({ timeout: 5000 }).catch(() => '')) || '';
check('the refine card counts its questions', /\d+ short questions/.test(sub), sub.trim());
await shot('3-trips-refine');

// 4. Reload on the trips.
await page.reload({ waitUntil: 'domcontentloaded' });
const back = await waitPriced();
check('a reload on the trips keeps the trips', back && (await page.locator('.pf-home').count()) === 0);
check('the refine card is still there after the reload', (await page.locator('.pf-refine').count()) === 1);
await shot('4-trips-after-reload');

// 5. Back from the trips: the trip home leads back to them.
await page.locator('.pf-head .pf-round').first().click();
await page.waitForSelector('.pf-home', { timeout: 20000 }).catch(() => {});
const label = (await page.locator('.pf-home .btn-primary').first().textContent({ timeout: 3000 }).catch(() => '')) || '';
check('the trip home offers the trips again', /see your priced trips/i.test(label), label.trim());
await shot('5-trip-home');
await page.locator('.pf-home .btn-primary').first().click();
check('and its button opens them', await waitPriced(30000));

const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('no sideways scroll', o <= 1, `${o}px`);
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
