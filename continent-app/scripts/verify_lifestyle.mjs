// T1089 needs: account (the account-hub row only; skipped for a guest)
// Headless check for where the bed and the table are set: the Style Studio's
// step 2, "Where do you sleep and eat?" (G12, 2026-11-18; it replaced the
// Lifestyle dialog and the Style dock's inline editors). Three sleep tiles
// with the hotel grades behind the hotel tile, six eat tiles, the counts
// closed until asked for, the draft priced on the step, nothing reaching a
// price before Save, and the one door (the corner disc) on Explore and on
// Destinations.
//
// Run from inside continent-app/ against a built dist (vite preview) or a
// dev server at CARTA_PORT:
//   npm run build && node scripts/verify_lifestyle.mjs
// From a worktree with a sparse public/, add
//   CARTA_DATA_MIRROR=<main checkout>/continent-app/public
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { offeredStayTiers } from '../src/lib/runtime_pricing.js';
import { SLEEP_GROUPS, sleepGroupOf } from '../src/lib/sleepGroups.js';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT || 4192); // 4190 is on the fetch spec's blocked-port list
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// ---- 1. The tile model against the shipped dataset ----
// Every measured tier has to land in exactly one tile, or a traveller can set
// a stay tier the studio cannot show back to them.
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

const STUDIO = '.fsheet.sst[role="dialog"]';

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.onboardSeen', '1');
  });
  await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=explore`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.dock--corner .dock-trigger:visible').first().waitFor({ timeout: 60000 }).catch(() => {});
  return page;
}

// The corner disc is the one style door (Style Studio, G12): it opens the
// studio's overview. Returns the sheet, or null when there is no door.
async function openStudio(page) {
  const disc = page.locator('.dock--corner .dock-trigger:visible').first();
  if (!(await disc.count())) return null;
  await disc.click();
  const sheet = page.locator(STUDIO);
  return (await sheet.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) ? sheet : null;
}

// From the empty overview into step 2 of a new style.
async function createToSpend(page, sheet) {
  await sheet.getByRole('button', { name: 'Create a travel style' }).first().click();
  await page.waitForTimeout(500);
  await sheet.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(700);
}

// The step's two radiogroups of tiles: where you sleep, then how you eat.
const sleepTiles = (sheet) => sheet.locator('.sst-spend .sst-tiles').nth(0).locator('[role="radio"]');
const eatTiles = (sheet) => sheet.locator('.sst-spend .sst-tiles').nth(1).locator('[role="radio"]');
const onText = async (loc) => (await loc.evaluateAll((els) => els
  .filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.innerText.trim()))).join(',');

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await newPage(browser, { width: 1440, height: 900 });

  // ---- One door on Explore, and nothing left of the old ones ----
  const discs = await page.locator('.dock--corner .dock-trigger:visible').count();
  if (discs !== 1) fail(`expected the one corner style disc on Explore, found ${discs}`);
  const old = await page.locator('.lifestyle-panel, .settings-part-lifestyle:visible, .tstyle-row, .style-dock-halves').count();
  if (old) fail(`${old} old Lifestyle or style editor parts are still in the page`);

  let sheet = await openStudio(page);
  if (!sheet) throw new Error('the corner disc does not open the Style Studio');
  if (/\bis-wizard\b/.test((await sheet.getAttribute('class')) || '')) fail('the disc opened the wizard, not the overview');
  if (!/No styles yet/.test(await sheet.innerText())) fail('a first visit does not show the empty overview');
  await createToSpend(page, sheet);

  // ---- Step 2: where you sleep and eat ----
  const title = (await sheet.locator('.sst-q').first().innerText()).trim();
  console.log('step 2 asks:', JSON.stringify(title));
  if (!/sleep and eat/i.test(title)) fail(`step 2 asks "${title}"`);
  const nSleep = await sleepTiles(sheet).count();
  console.log('sleep tiles:', nSleep, await sleepTiles(sheet).allInnerTexts());
  if (nSleep !== 3) fail(`expected 3 sleep tiles, got ${nSleep}`);
  // A new style starts as the app prices with no style: an entire place, Easygoing.
  const onSleep = await onText(sleepTiles(sheet));
  if (onSleep !== 'Home') fail(`sleep tile on is "${onSleep}", expected Home`);
  const nEat = await eatTiles(sheet).count();
  console.log('eat tiles:', nEat);
  if (nEat !== 6) fail(`expected 6 eat tiles, got ${nEat}`);
  if (!/Easygoing/.test(await onText(eatTiles(sheet)))) fail('the eat tiles do not open on Easygoing');

  // Hotel grades wait behind the hotel tile.
  const grades = () => sheet.locator('.sst-kind [role="radio"]');
  if (await grades().filter({ hasText: /star/ }).count()) fail('hotel grades show before the hotel tile is picked');
  await sleepTiles(sheet).filter({ hasText: 'Hotel' }).first().click();
  await page.waitForTimeout(500);
  const nGrades = await grades().count();
  console.log('hotel grades:', nGrades, await grades().allInnerTexts());
  if (nGrades !== 4) fail(`expected 4 hotel grades, got ${nGrades}`);
  const onGrade = await onText(grades());
  if (!/3 star/i.test(onGrade)) fail(`hotel opened on "${onGrade}", expected 3 star`);
  await grades().filter({ hasText: '5 star' }).first().click();
  await page.waitForTimeout(500);
  // The wizard edits a draft: no price, and so no URL, moves before Save.
  if (/[?&]st=hotel/.test(page.url())) fail(`a draft bed reached the URL before Save: ${page.url()}`);
  await page.screenshot({ path: `${SHOTS}/lifestyle-hotel-grades.png` });

  await eatTiles(sheet).filter({ hasText: 'Foodie' }).first().click();
  await page.waitForTimeout(400);
  if (!/Foodie/.test(await onText(eatTiles(sheet)))) fail('Foodie did not take');

  // The counts open closed: that keeps the step two questions, not a form.
  if (await sheet.locator('.sst-tune .sst-count').count()) fail('the counts are open before Fine tune is pressed');
  await sheet.locator('.sst-fold').click();
  await page.waitForTimeout(400);
  const counts = await sheet.locator('.sst-tune .sst-count').count();
  console.log('counts behind Fine tune:', counts);
  if (counts !== 7) fail(`expected 7 counts, got ${counts}`);
  await page.screenshot({ path: `${SHOTS}/lifestyle-fine-tune.png` });

  // A count tuned by hand un-picks the preset and says so.
  await sheet.locator('.sst-tune .sst-count').first().locator('button').last().click();
  await page.waitForTimeout(400);
  if (await onText(eatTiles(sheet))) fail('a hand-tuned table still shows a preset as on');
  if (!(await sheet.locator('.sst-spend .sst-hint').count())) fail('no "Tuned by hand" note after a count moved');
  // The step prices the draft: a day figure with its unit, or Not yet.
  if (!/a day each|Not yet/i.test(await sheet.innerText())) fail('step 2 shows no day figure for the draft');

  // Save from step 4 ("Save style"): the style is made, in use, and priced.
  await sheet.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(400);
  await sheet.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(400);
  await sheet.getByRole('button', { name: 'Save style', exact: true }).click();
  await page.waitForTimeout(1200);
  const card = sheet.locator('.sst-card-hit[role="radio"]');
  if ((await card.count()) !== 1) fail(`expected 1 style card after Save, got ${await card.count()}`);
  if ((await card.first().getAttribute('aria-checked')) !== 'true') fail('the new style is not in use');
  const meta = (await sheet.locator('.sst-meta').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('card meta:', JSON.stringify(meta));
  if (!/5-star hotel/i.test(meta)) fail(`the card says "${meta}", not the bed just set`);
  if (!/[?&]st=hotel5/.test(page.url())) fail(`the saved bed did not reach the URL: ${page.url()}`);

  // Edit: the card's More menu, then the bar jumps straight to step 2, which
  // shows back what was saved.
  await sheet.locator('.sst-more').first().click();
  await sheet.locator('.sst-menu').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForTimeout(600);
  await sheet.locator('button.sst-bar-step').nth(1).click();
  await page.waitForTimeout(700);
  if ((await onText(sleepTiles(sheet))) !== 'Hotel') fail('edit does not show the hotel back');
  if (!/5 star/.test(await onText(grades()))) fail('edit does not show 5 star back');
  if (await onText(eatTiles(sheet))) fail('edit lost the hand-tuned table');
  await sheet.locator('.sst-close').first().click();
  await page.locator(STUDIO).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await page.locator(STUDIO).count()) fail('closing an unchanged edit asked or stayed open');

  // ---- The same door on Destinations ----
  const places = page.getByRole('tab', { name: 'Places', exact: true }).first();
  if (await places.count()) {
    await places.click();
    await page.waitForTimeout(1500);
    sheet = await openStudio(page);
    if (!sheet) fail('Destinations has no style door');
    else {
      const m = (await sheet.locator('.sst-meta').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      console.log('destinations card meta:', JSON.stringify(m));
      if (!/5-star hotel/i.test(m)) fail(`Destinations shows "${m}", not the bed just set`);
      await page.screenshot({ path: `${SHOTS}/lifestyle-door-destinations.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } else {
    console.log('SKIP: no Places tab on Explore');
  }

  // ---- And in the account hub ----
  // The hub's Stay row (a guest has it too) leads to the Travel view, whose
  // Stay row opens the studio at step 2 (openStyleSpend). When the hub does
  // not render here, the check is skipped, not failed.
  await page.getByRole('link', { name: 'Account & preferences' }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(900);
  const hubStay = page.locator('.account-panel:visible .ac-row', { has: page.locator('.ac-row-label', { hasText: /^Stay$/ }) }).first();
  if (!(await hubStay.count())) {
    console.log('SKIP (needs account): the account hub does not render here');
  } else {
    const said = (await hubStay.innerText()).replace(/\s+/g, ' ');
    console.log('account row reads:', JSON.stringify(said));
    if (!/5-star hotel/i.test(said)) fail('the account Stay row does not state the current bed');
    await hubStay.click();
    await page.waitForTimeout(900);
    const travelStay = page.locator('.account-panel:visible button.ac-row', { has: page.locator('.ac-row-label', { hasText: /^Stay$/ }) }).first();
    if (!(await travelStay.count())) fail('the Travel view has no Stay row');
    else {
      await travelStay.click();
      const opened = await page.locator(STUDIO).waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      if (!opened) fail('the account Stay row does not open the studio');
      else if (!/sleep and eat/i.test(await page.locator(`${STUDIO} .sst-q`).first().innerText())) fail('the account Stay row does not open step 2');
      await page.screenshot({ path: `${SHOTS}/lifestyle-door-account.png` });
    }
  }

  // ---- Phone ----
  const phone = await newPage(browser, { width: 390, height: 844 });
  const ps = await openStudio(phone);
  if (!ps) fail('phone has no style door');
  else {
    await createToSpend(phone, ps);
    const tiles = await ps.locator('.sst-spend [role="radio"]').count();
    if (tiles !== 9) fail(`expected 9 tiles on the phone's step 2 (3 sleep, 6 eat), got ${tiles}`);
    // Full width on a phone, and no sideways scroll at 390 px, the quality
    // floor for every surface.
    const fit = await phone.evaluate(() => {
      const el = document.querySelector('.fsheet.sst');
      const body = el.querySelector('.sst-body');
      return { w: el.getBoundingClientRect().width, over: Math.max(el.scrollWidth - el.clientWidth, body.scrollWidth - body.clientWidth) };
    });
    if (fit.w < 389) fail(`the studio is ${fit.w}px wide at 390, expected the full width`);
    if (fit.over > 1) fail(`the studio scrolls sideways by ${fit.over}px at 390px`);
    await phone.screenshot({ path: `${SHOTS}/lifestyle-phone.png` });
  }

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_lifestyle OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  if (srv) srv.kill();
}
