// Headless smoke for the stay-tier feature: the runtime math (dorm cheaper
// than private cheaper than a 4-5 star hotel, honest fallback where nothing
// is measured) and the UI (FilterBar Stay dropdown, tier chips in the stay
// breakdown, tier-aware booking link).
// Run from inside continent-app/:  node scripts/verify_stay_tiers.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { accommodationPerPerson, buildAccommodationLink } from '../src/lib/runtime_pricing.js';

// T385: CARTA_PORT points the harness at a preview a session already runs,
// so parallel sessions never test each other's build on a shared port.
const PORT = Number(process.env.CARTA_PORT) || 4192; // 4190 is on the fetch spec's blocked-port list
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// Open a destination from the Explore grid. This used to go through the map's
// ranked results list (.results-search-input, .result-row); that list left
// with the map, so the way in is the search field, which portals into the app
// header on desktop, and the first card it leaves standing.
const openDest = async (page, name) => {
  const field = page.locator('.explore-search input:visible').first();
  await field.fill(name);
  await page.waitForTimeout(1400);
  const card = page.locator('.xcard-hit').first();
  if (!(await card.count())) return false;
  await card.click();
  await page.waitForTimeout(1600);
  return true;
};

// The stay group in the cost breakdown is collapsed on open; this is its
// title row.
const openStayGroup = async (page) => {
  const heads = page.locator('.cost-group-head');
  const n = await heads.count();
  for (let i = 0; i < n; i += 1) {
    const txt = await heads.nth(i).innerText();
    if (/nights?,/.test(txt) || /Dorm bed|Entire place/.test(txt)) {
      await heads.nth(i).click();
      return true;
    }
  }
  return false;
};

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

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.onboardSeen', '1');
  });

  // st=dorm in the URL: the map boots already priced by dorm bed.
  await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&st=dorm&tab=map`);
  await page.waitForTimeout(2500);
  // Dismiss whatever onboarding survived the localStorage flags.
  for (const label of ['Continue without an account', 'Got it']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  await page.waitForTimeout(1000);

  // The lifestyle door states the tier and restored 'dorm' from the URL. This
  // used to read the FilterBar Stay dropdown; that dropdown lives in a tray
  // Explore stopped mounting when the tab lost its map, so the check follows
  // the control that ships.
  // T1089: on a desktop the header settings line carries it, as
  // .settings-part-lifestyle (aria-label "Lifestyle: Dorm bed, Easygoing, change").
  const stayDoor = page.locator('.settings-part-lifestyle:visible').first();
  await stayDoor.waitFor({ timeout: 30000 }).catch(() => {});
  if (!(await stayDoor.count())) fail('lifestyle door missing on Explore');
  const stayLabel = (await stayDoor.getAttribute('aria-label')) || '';
  console.log('lifestyle door reads:', JSON.stringify(stayLabel.replace(/\s+/g, ' ')));
  if (!/Dorm bed/i.test(stayLabel)) fail('st=dorm URL param not restored into the door');

  // ---- 2b. (removed, T1089) ----
  // The tier chips in a destination's cost breakdown (.stay-tier-chip,
  // .cost-group-head) left the markup with the old cost panel; only their CSS
  // remains, and Explore's search field (.explore-search) is gone too. The
  // bed choice is now checked where it is made, in the lifestyle panel (3).

  // ---- 3. The lifestyle panel owns the same choice ----
  // "Where you sleep" sits beside the eating and drinking steppers, and it
  // writes the same choices.stay_tier the filter bar reads, so a change made
  // in one place must show up in the other and in the URL.
  await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=explore`);
  await page.waitForTimeout(2500);
  for (const label of ['Continue without an account', 'Got it']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  await page.locator('.settings-part-lifestyle:visible').first().click();
  await page.waitForTimeout(700);
  // T1089: three sleep tiles now (Hostel, Home, Hotel); the exact bed is a
  // segmented row under the chosen tile (Dorm bed / Private room; 2 to 5 star).
  const stayChips = page.locator('.lifestyle-panel .ls-tiles').first().locator('.ls-tile');
  const lsChipCount = await stayChips.count();
  console.log('lifestyle sleep tiles:', lsChipCount);
  if (lsChipCount !== 3) fail(`expected 3 sleep tiles in the lifestyle panel, got ${lsChipCount}`);
  const lsOn = await page.locator('.lifestyle-panel .ls-tiles').first().locator('.ls-tile.on').first().innerText();
  if (!/Home/i.test(lsOn)) fail(`lifestyle panel opened on ${lsOn}, expected the home default`);
  // All the star grades still reachable, one tap deeper.
  await stayChips.filter({ hasText: 'Hotel' }).first().click();
  await page.waitForTimeout(600);
  const nGrades = await page.locator('.ls-kind .seg-item').count();
  if (nGrades !== 4) fail(`expected 4 hotel grades (2 to 5 star) behind the hotel tile, got ${nGrades}`);
  await page.screenshot({ path: `${SHOTS}/stay-tiers-lifestyle.png` });

  await stayChips.filter({ hasText: 'Hostel' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.ls-kind .seg-item', { hasText: 'Dorm bed' }).first().click();
  await page.waitForTimeout(1200);
  if (!/[?&]st=dorm/.test(page.url())) fail(`stay tier not in the URL after the panel click: ${page.url()}`);
  const barText = (await page.locator('.settings-part-lifestyle:visible').first().getAttribute('aria-label')) || '';
  if (!/Dorm bed/i.test(barText)) fail('the lifestyle door did not follow the panel choice');
  console.log('lifestyle panel drives the shared stay tier OK');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_stay_tiers OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
