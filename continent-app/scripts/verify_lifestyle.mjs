// Headless check for the lifestyle pass: the panel (four sleep tiles with the
// hotel grades behind the hotel tile, six habit tiles, the counts closed until
// asked for) and the one door that opens it, drawn the same on Explore, on
// Destinations and in the account hub.
//
// Run from inside continent-app/ against a built dist:
//   npm run build && node scripts/verify_lifestyle.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { offeredStayTiers } from '../src/lib/runtime_pricing.js';
import { SLEEP_GROUPS, sleepGroupOf } from '../src/lib/sleepGroups.js';

const PORT = 4192; // 4190 is on the fetch spec's blocked-port list
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// ---- 1. The tile model against the shipped dataset ----
// Every measured tier has to land in exactly one tile, or a traveller can set
// a stay tier the panel cannot show back to them.
const data = JSON.parse(readFileSync('public/app_data.json', 'utf8'));
const offered = offeredStayTiers(data.meta);
console.log('offered tiers:', offered.join(' '));
for (const tier of offered) {
  const hits = SLEEP_GROUPS.filter((g) => g.tiers.includes(tier));
  if (hits.length !== 1) fail(`${tier} maps to ${hits.length} sleep tiles, expected 1`);
}
if (sleepGroupOf('hotel4') !== 'hotel') fail('hotel4 does not map to the hotel tile');
if (sleepGroupOf('home') !== 'home') fail('home does not map to the home tile');
// A tier nothing measured still has to resolve, since choices.stay_tier is
// restored from a URL and from an account.
if (sleepGroupOf('nonsense') !== 'home') fail('unknown tier does not fall back to home');
console.log('tile model OK');

// ---- 2. The UI ----
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const dismiss = async (page) => {
  for (const label of ['Continue without an account', 'Got it', 'START HERE']) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) await b.first().click().catch(() => {});
  }
};

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.onboardSeen', '1');
  });

  await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=map`);
  await page.waitForTimeout(2600);
  await dismiss(page);
  await page.waitForTimeout(700);

  // ---- The door, on Explore ----
  const exploreBtn = page.locator('.explore-side .lifestyle-btn');
  if (!(await exploreBtn.count())) fail('Explore side panel has no lifestyle door');
  const bed = await exploreBtn.locator('.lifestyle-btn-bed').innerText();
  const vibe = await exploreBtn.locator('.lifestyle-btn-vibe').innerText();
  console.log('explore door reads:', JSON.stringify(`${bed} / ${vibe}`));
  if (!/Entire place/i.test(bed)) fail(`door shows "${bed}", expected the entire-place default`);
  if (!/Easygoing/i.test(vibe)) fail(`door shows "${vibe}", expected the Easygoing default`);
  // The door has to be louder than the page it sits on: the accent tint is
  // the whole point of this pass, so a neutral ground here is a regression.
  const tint = await exploreBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const accentBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent-bg').trim());
  console.log('door background:', tint, '| --accent-bg:', accentBg);
  if (!/247,\s*220,\s*212/.test(tint)) fail(`door is not accent-tinted (${tint})`);

  await exploreBtn.click();
  await page.waitForTimeout(700);

  // ---- The panel ----
  const tiles = page.locator('.lifestyle-panel .panel-section').first().locator('.ls-tile');
  const nSleep = await tiles.count();
  console.log('sleep tiles:', nSleep, await tiles.allInnerTexts());
  if (nSleep !== 4) fail(`expected 4 sleep tiles, got ${nSleep}`);
  const onSleep = await page.locator('.lifestyle-panel .ls-tile.on').first().innerText();
  if (!/Entire place/i.test(onSleep)) fail(`sleep tile on is "${onSleep}", expected Entire place`);

  // Hotel grades are hidden until a hotel is the answer.
  if (await page.locator('.ls-grades').count()) fail('hotel grades show before the hotel tile is picked');
  await tiles.filter({ hasText: 'Hotel' }).first().click();
  await page.waitForTimeout(600);
  const grades = page.locator('.ls-grade');
  const nGrades = await grades.count();
  console.log('hotel grades:', nGrades, await grades.allInnerTexts());
  if (nGrades !== 3) fail(`expected 3 hotel grades, got ${nGrades}`);
  const onGrade = await page.locator('.ls-grade.on').innerText();
  if (!/3 star/i.test(onGrade)) fail(`hotel opened on "${onGrade}", expected 3 star`);
  if (!/[?&]st=hotel3/.test(page.url())) fail(`picking the hotel tile did not reach the URL: ${page.url()}`);
  await page.screenshot({ path: `${SHOTS}/lifestyle-hotel-grades.png` });

  // A grade is the same shared choice, so it reaches the URL too.
  await grades.filter({ hasText: '5 star' }).first().click();
  await page.waitForTimeout(900);
  if (!/[?&]st=hotel5/.test(page.url())) fail(`grade not in the URL: ${page.url()}`);

  // Habits: six tiles, one on, and picking one moves the door's label.
  const habits = page.locator('.ls-tiles-3 .ls-tile');
  const nHabits = await habits.count();
  console.log('habit tiles:', nHabits);
  if (nHabits !== 6) fail(`expected 6 habit tiles, got ${nHabits}`);
  await habits.filter({ hasText: 'Foodie' }).first().click();
  await page.waitForTimeout(900);
  const onHabit = await page.locator('.ls-tiles-3 .ls-tile.on').innerText();
  if (!/Foodie/i.test(onHabit)) fail(`habit tile on is "${onHabit}", expected Foodie`);

  // The counts open closed. That is what took the panel from a form back to
  // two questions, so it is worth a check rather than a comment.
  if (await page.locator('.ls-tune .stepper').count()) fail('the counts are open before Fine tune is pressed');
  await page.locator('.ls-tune-btn').click();
  await page.waitForTimeout(400);
  const steppers = await page.locator('.ls-tune .stepper').count();
  console.log('steppers behind Fine tune:', steppers);
  if (steppers !== 6) fail(`expected 6 steppers, got ${steppers}`);
  // No per-row cadence hint any more: the segmented toggle says it once.
  if (await page.locator('.ls-tune .stepper-hint').count()) fail('per-row cadence hints came back');
  await page.screenshot({ path: `${SHOTS}/lifestyle-fine-tune.png` });

  // Editing a count by hand un-picks the preset and says so.
  await page.locator('.ls-tune .stepper').first().locator('button').last().click();
  await page.waitForTimeout(700);
  if (await page.locator('.ls-tiles-3 .ls-tile.on').count()) fail('a hand-tuned lifestyle still shows a preset as on');
  const custom = await page.locator('.lifestyle-panel .ls-note').last().innerText();
  console.log('custom note:', JSON.stringify(custom));

  await page.locator('.panel-close').first().click();
  await page.waitForTimeout(500);
  const doorVibe = await exploreBtn.locator('.lifestyle-btn-vibe').innerText();
  if (!/Custom/i.test(doorVibe)) fail(`door reads "${doorVibe}" after hand-tuning, expected Custom`);

  // ---- The same door on Destinations ----
  await page.getByRole('button', { name: 'Destinations' }).first().click();
  await page.waitForTimeout(1600);
  const placesBtn = page.locator('.side-panel .lifestyle-btn:visible');
  if (!(await placesBtn.count())) fail('Destinations side panel has no lifestyle door');
  const placesBed = await placesBtn.locator('.lifestyle-btn-bed').innerText();
  console.log('destinations door reads:', JSON.stringify(placesBed));
  if (!/5-star hotel/i.test(placesBed)) fail(`Destinations door shows "${placesBed}", not the tier just set`);
  await page.screenshot({ path: `${SHOTS}/lifestyle-door-destinations.png` });

  // ---- And in the account hub ----
  await page.locator('.account-avatar-btn').click();
  await page.waitForTimeout(900);
  const row = page.getByRole('button', { name: /Lifestyle/i }).first();
  if (!(await row.count())) fail('account hub has no lifestyle row');
  const rowText = (await row.innerText()).replace(/\s+/g, ' ');
  console.log('account row reads:', JSON.stringify(rowText));
  if (!/5-star hotel/i.test(rowText)) fail('account row does not state the current tier');
  await page.screenshot({ path: `${SHOTS}/lifestyle-door-account.png` });
  await row.click();
  await page.waitForTimeout(900);
  if (!(await page.locator('.lifestyle-panel').count())) fail('the account row does not open the panel');

  // ---- Phone ----
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.onboardSeen', '1');
  });
  await phone.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=map`);
  await phone.waitForTimeout(2600);
  await dismiss(phone);
  await phone.waitForTimeout(700);
  const phoneBtn = phone.locator('.explore-chips .lifestyle-btn');
  if (!(await phoneBtn.count())) fail('phone toolbar has no lifestyle door');
  // The word "Lifestyle" stands down on a phone so the answer gets the room.
  const labelShown = await phoneBtn.locator('.lifestyle-btn-label')
    .evaluate((el) => getComputedStyle(el).display).catch(() => 'none');
  if (labelShown !== 'none') fail('the phone door still spends width on the word "Lifestyle"');
  await phoneBtn.click();
  await phone.waitForTimeout(800);
  const phoneTiles = await phone.locator('.lifestyle-panel .ls-tile').count();
  if (phoneTiles !== 10) fail(`expected 10 tiles on the phone panel, got ${phoneTiles}`);
  // No horizontal scroll at 390px, the quality floor for every surface.
  const overflow = await phone.evaluate(() => {
    const el = document.querySelector('.lifestyle-panel');
    return el.scrollWidth - el.clientWidth;
  });
  if (overflow > 1) fail(`lifestyle panel scrolls sideways by ${overflow}px at 390px`);
  await phone.screenshot({ path: `${SHOTS}/lifestyle-phone.png` });

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_lifestyle OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  if (srv) srv.kill();
}
