// Headless smoke for the stay-tier feature: the runtime math (dorm cheaper
// than private cheaper than a 4-5 star hotel, honest fallback where nothing
// is measured, tier-aware booking links) and the UI (a URL's tier restored
// into Explore's "Priced for", the Style Studio's sleep tiles writing the
// shared tier).
// Run from inside continent-app/:  node scripts/verify_stay_tiers.mjs
// From a worktree with a sparse public/, add
//   CARTA_DATA_MIRROR=<main checkout>/continent-app/public
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { accommodationPerPerson, buildAccommodationLink } from '../src/lib/runtime_pricing.js';
import { mirrorData } from './lib/dataMirror.mjs';

// T385: CARTA_PORT points the harness at a preview a session already runs,
// so parallel sessions never test each other's build on a shared port.
const PORT = Number(process.env.CARTA_PORT) || 4192; // 4190 is on the fetch spec's blocked-port list
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// ---- 1. Runtime math straight against the shipped dataset ----
const data = JSON.parse(readFileSync('public/app_data.json', 'utf8'));
const bru = data.destinations.BRU;
// T1089: the measured bed rates moved from accommodation.tiers to
// accommodation.beds (dorm, private, hotel2..hotel5, bnb_home).
if (!bru?.accommodation?.beds) {
  fail('BRU has no accommodation.beds; run the fixture chain first');
} else {
  const g = 2, nights = 7, date = '2026-08-04';
  const price = (tier) => accommodationPerPerson(bru, nights, date, null, g, tier);
  const dorm = price('dorm'), priv = price('private'), home = price('home');
  // T1089: a private room is priced per room and shared, so for two people it
  // is cheaper per person than a dorm bed; the ordering holds for one traveller.
  const dormSolo = accommodationPerPerson(bru, nights, date, null, 1, 'dorm');
  const privSolo = accommodationPerPerson(bru, nights, date, null, 1, 'private');
  const h3 = price('hotel3'), h4 = price('hotel4'), h5 = price('hotel5');
  console.log('BRU per-person totals (7 nights, Aug, group 2):',
    ['dorm', 'private', 'home', 'hotel3', 'hotel4', 'hotel5']
      .map((k, i) => `${k}=${[dorm, priv, home, h3, h4, h5][i].total}`).join(' '));
  if (!(dormSolo.total < privSolo.total && priv.total < h5.total && dorm.total < h5.total)) fail('tier ordering broken');
  // The three hotel tiers must be distinct and rising, the whole point of
  // splitting the old bundled "4-5 star" figure.
  if (!(h3.total < h4.total && h4.total < h5.total)) fail('hotel tiers not strictly rising');
  if (dorm.cleaning !== 0 || dorm.service !== 0) fail('dorm should carry no cleaning/service fee');
  if (dorm.tier !== 'dorm' || dorm.tier_fallback) fail('dorm tier not served as dorm');
  // A city with no measured tiers must fall back honestly.
  const noTiers = Object.values(data.destinations)
    .find((d) => d.accommodation && !d.accommodation.beds?.dorm && accommodationPerPerson(d, nights, date, null, g, 'dorm'));
  const fb = noTiers ? accommodationPerPerson(noTiers, nights, date, null, g, 'dorm') : null;
  if (!noTiers) console.log('SKIP (needs real data): no destination in public/ prices without a measured dorm rate, fallback not checked');
  else if (!(fb.tier_fallback && fb.tier !== 'dorm')) fail('missing-tier fallback broken');
  // Booking links follow the tier.
  const args = { city: 'Brussels', country: 'Belgium', departDate: '2026-08-04', returnDate: '2026-08-11', groupSize: 2 };
  if (!/hostelworld\.com/.test(buildAccommodationLink({ ...args, stayTier: 'dorm' }))) fail('dorm link not Hostelworld');
  if (!/kayak\.com\/hotels/.test(buildAccommodationLink({ ...args, stayTier: 'hotel3' }))) fail('hotel link not KAYAK');
  if (!/airbnb\.com/.test(buildAccommodationLink({ ...args, stayTier: 'home' }))) fail('home link not Airbnb');
  console.log('runtime math OK');
}

// ---- 2. UI: dropdown re-prices, chips render, fallback note shows ----
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


const STUDIO = '.fsheet.sst[role="dialog"]';

// Style Studio (G12, 2026-11-18): the bed is set in the studio's step 2,
// "Where do you sleep and eat?", behind the corner disc. A first visit has
// no style, so the overview offers Create.
async function openSpendStep(page) {
  const disc = page.locator('.dock--corner .dock-trigger:visible').first();
  if (!(await disc.count())) return null;
  await disc.click();
  const sheet = page.locator(STUDIO);
  if (!(await sheet.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false))) return null;
  await sheet.getByRole('button', { name: 'Create a travel style' }).first().click();
  await page.waitForTimeout(500);
  await sheet.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(700);
  return sheet;
}

// "Priced for", the first block of Explore's filter pane, says what the
// prices use; with no style it names the party and the bed from the choices.
async function pricedFor(page) {
  // The pane's door is drawn once the list has data (a cold dev server took
  // longer than a fixed wait once), so wait for a row first.
  await page.locator('.xrow').first().waitFor({ timeout: 60000 }).catch(() => {});
  const block = page.locator('.xpane-priced:visible').first();
  if (!(await block.count())) {
    await page.getByRole('button', { name: /^(all )?filters/i }).first().click({ timeout: 10000 }).catch(() => {});
    await page.locator('.xpane-priced:visible').first().waitFor({ timeout: 8000 }).catch(() => {});
  }
  return (await page.locator('.xpane-priced:visible').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
}

const onText = async (loc) => (await loc.evaluateAll((els) => els
  .filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.innerText.trim()))).join(',');

async function newPage(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.dock--corner .dock-trigger:visible').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}

try {
  await waitForServer();
  const browser = await chromium.launch();

  // st=dorm in the URL: Explore boots already priced by dorm bed, and with
  // no style yet "Priced for" says so.
  let page = await newPage(browser, `${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&st=dorm&tab=explore`);
  const priced = await pricedFor(page);
  console.log('priced for reads:', JSON.stringify(priced));
  if (!priced) fail('no "Priced for" block in the filter pane');
  else if (!/Dorm bed/i.test(priced)) fail('st=dorm URL param not restored into "Priced for"');
  await page.context().close();

  // ---- 2b. (removed, T1089) ----
  // The tier chips in a destination's cost breakdown (.stay-tier-chip,
  // .cost-group-head) left the markup with the old cost panel; the bed
  // choice is checked where it is made, the studio's step 2 (3).

  // ---- 3. The studio owns the same choice ----
  // "Where you sleep" sits beside how you eat, and a saved style writes the
  // same choices.stay_tier every price reads, so it must reach the URL and
  // "Priced for".
  page = await newPage(browser, `${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=explore`);
  const sheet = await openSpendStep(page);
  if (!sheet) throw new Error('the corner disc does not lead to the studio');
  // T1089: three sleep tiles (Hostel, Home, Hotel); the exact bed is a
  // segmented row under the chosen tile (Dorm bed / Private room; 2 to 5 star).
  const stayTiles = sheet.locator('.sst-spend .sst-tiles').first().locator('[role="radio"]');
  const nTiles = await stayTiles.count();
  console.log('studio sleep tiles:', nTiles);
  if (nTiles !== 3) fail(`expected 3 sleep tiles in the studio, got ${nTiles}`);
  const on = await onText(stayTiles);
  if (on !== 'Home') fail(`the studio opened on ${on}, expected the home default`);
  // All the star grades still reachable, one tap deeper.
  await stayTiles.filter({ hasText: 'Hotel' }).first().click();
  await page.waitForTimeout(500);
  const nGrades = await sheet.locator('.sst-kind [role="radio"]').count();
  if (nGrades !== 4) fail(`expected 4 hotel grades (2 to 5 star) behind the hotel tile, got ${nGrades}`);
  await page.screenshot({ path: `${SHOTS}/stay-tiers-studio.png` });

  await stayTiles.filter({ hasText: 'Hostel' }).first().click();
  await page.waitForTimeout(500);
  await sheet.locator('.sst-kind [role="radio"]', { hasText: 'Dorm bed' }).first().click();
  await page.waitForTimeout(500);
  // Save from step 4 ("Save style").
  for (let i = 0; i < 2; i += 1) {
    await sheet.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(400);
  }
  await sheet.getByRole('button', { name: 'Save style', exact: true }).click();
  await page.waitForTimeout(1200);
  if (!/[?&]st=dorm/.test(page.url())) fail(`stay tier not in the URL after Save: ${page.url()}`);
  const meta = (await sheet.locator('.sst-meta').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!/Dorm bed/i.test(meta)) fail(`the style card says "${meta}", not Dorm bed`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const after = await pricedFor(page);
  console.log('priced for after Save:', JSON.stringify(after));
  if (after && !/a day each|Not yet/i.test(after)) fail(`"Priced for" does not name the new style's day: "${after}"`);
  console.log('the studio drives the shared stay tier OK');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_stay_tiers OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
