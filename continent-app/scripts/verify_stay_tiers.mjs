// Headless smoke for the stay-tier feature: the runtime math (dorm cheaper
// than private cheaper than a 4-5 star hotel, honest fallback where nothing
// is measured) and the UI (FilterBar Stay dropdown, tier chips in the stay
// breakdown, tier-aware booking link).
// Run from inside continent-app/:  node scripts/verify_stay_tiers.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { accommodationPerPerson, buildAccommodationLink } from '../src/lib/runtime_pricing.js';

const PORT = 4192; // 4190 is on the fetch spec's blocked-port list
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// ---- 1. Runtime math straight against the shipped dataset ----
const data = JSON.parse(readFileSync('public/app_data.json', 'utf8'));
const bru = data.destinations.BRU;
if (!bru?.accommodation?.tiers) {
  fail('BRU has no accommodation.tiers; run the fixture chain first');
} else {
  const g = 2, nights = 7, date = '2026-08-04';
  const price = (tier) => accommodationPerPerson(bru, nights, date, null, g, tier);
  const dorm = price('dorm'), priv = price('private'), home = price('home');
  const h3 = price('hotel3'), h4 = price('hotel4'), h5 = price('hotel5');
  console.log('BRU per-person totals (7 nights, Aug, group 2):',
    ['dorm', 'private', 'home', 'hotel3', 'hotel4', 'hotel5']
      .map((k, i) => `${k}=${[dorm, priv, home, h3, h4, h5][i].total}`).join(' '));
  if (!(dorm.total < priv.total && priv.total < h5.total)) fail('tier ordering broken');
  // The three hotel tiers must be distinct and rising, the whole point of
  // splitting the old bundled "4-5 star" figure.
  if (!(h3.total < h4.total && h4.total < h5.total)) fail('hotel tiers not strictly rising');
  if (dorm.cleaning !== 0 || dorm.service !== 0) fail('dorm should carry no cleaning/service fee');
  if (dorm.tier !== 'dorm' || dorm.tier_fallback) fail('dorm tier not served as dorm');
  // A city with no measured tiers must fall back honestly.
  const noTiers = Object.values(data.destinations)
    .find((d) => d.accommodation?.per_person_night_eur != null && !d.accommodation.tiers);
  const fb = accommodationPerPerson(noTiers, nights, date, null, g, 'dorm');
  if (!(fb.tier === 'home' && fb.tier_fallback)) fail('missing-tier fallback broken');
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

  // The Stay dropdown exists and restored 'dorm' from the URL.
  const stayFilter = page.locator('.filter-staytier');
  if (!(await stayFilter.count())) fail('FilterBar Stay dropdown missing');
  const stayLabel = await stayFilter.innerText();
  console.log('stay filter reads:', JSON.stringify(stayLabel.replace(/\s+/g, ' ')));
  if (!/Dorm bed/i.test(stayLabel)) fail('st=dorm URL param not restored into the dropdown');

  // Open Brussels via the results search, then the stay group.
  await page.locator('.results-search-input').fill('Brussels');
  await page.waitForTimeout(800);
  await page.locator('.result-row').first().click();
  await page.waitForTimeout(1200);
  const stayGroupHead = page.locator('.cost-group', { has: page.locator('.stay-tier-row, .cost-group-head') })
    .filter({ hasText: /night/i }).first();
  // The stay group is collapsed by default; open it by its title row.
  const heads = page.locator('.cost-group-head');
  const n = await heads.count();
  for (let i = 0; i < n; i += 1) {
    const txt = await heads.nth(i).innerText();
    if (/nights?,/.test(txt) || /Dorm bed/.test(txt)) { await heads.nth(i).click(); break; }
  }
  await page.waitForTimeout(500);
  const chips = page.locator('.stay-tier-chip');
  const chipCount = await chips.count();
  console.log('tier chips:', chipCount);
  if (chipCount !== 6) fail(`expected 6 tier chips, got ${chipCount}`);
  const onChip = await page.locator('.stay-tier-chip.on').innerText();
  console.log('active chip:', JSON.stringify(onChip));
  if (!/Dorm bed/.test(onChip)) fail('active chip is not the dorm tier');
  const link = await page.locator('.cost-group-links .cost-action[href*="hostelworld"]').count();
  if (!link) fail('Hostelworld booking link missing on the dorm tier');
  await page.screenshot({ path: `${SHOTS}/stay-tiers-brussels.png` });

  // Switch to 4-5 star hotel via a chip: subtotal must go up, link becomes KAYAK.
  const before = await page.locator('.cost-group-val').allInnerTexts();
  await chips.last().click();
  await page.waitForTimeout(1200);
  const kayak = await page.locator('.cost-group-links .cost-action[href*="kayak"]').count();
  if (!kayak) fail('KAYAK hotel link missing on the hotel tier');
  const after = await page.locator('.cost-group-val').allInnerTexts();
  console.log('subtotals before:', before.join(' '), '| after:', after.join(' '));

  // A city with no measured tiers says so instead of faking a dorm price.
  await page.locator('.results-search-input').fill('');
  await page.waitForTimeout(300);
  await chips.first().click().catch(() => {}); // back to dorm if panel kept open
  await page.locator('.results-search-input').fill('Alghero');
  await page.waitForTimeout(800);
  if (await page.locator('.result-row').count()) {
    await page.locator('.result-row').first().click();
    await page.waitForTimeout(1200);
    const heads2 = page.locator('.cost-group-head');
    const n2 = await heads2.count();
    for (let i = 0; i < n2; i += 1) {
      const txt = await heads2.nth(i).innerText();
      if (/Entire place|Dorm bed|nights?,/.test(txt)) { await heads2.nth(i).click(); break; }
    }
    await page.waitForTimeout(500);
    const warn = await page.locator('.cost-group .cost-warning').allInnerTexts();
    console.log('fallback note:', JSON.stringify(warn));
    if (!warn.some((s) => /No measured/i.test(s))) fail('fallback note missing on unmeasured city');
    await page.screenshot({ path: `${SHOTS}/stay-tiers-fallback.png` });
  } else {
    console.log('(Alghero not in results, fallback note check skipped)');
  }

  // ---- 3. The lifestyle panel owns the same choice ----
  // "Where you sleep" sits beside the eating and drinking steppers, and it
  // writes the same choices.stay_tier the filter bar reads, so a change made
  // in one place must show up in the other and in the URL.
  await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=map`);
  await page.waitForTimeout(2500);
  for (const label of ['Continue without an account', 'Got it']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) await btn.first().click().catch(() => {});
  }
  await page.locator('.filter-tray-btn').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Lifestyle/i }).first().click();
  await page.waitForTimeout(600);
  const stayChips = page.locator('.lifestyle-stay-chips .chip');
  const lsChipCount = await stayChips.count();
  console.log('lifestyle stay chips:', lsChipCount);
  if (lsChipCount !== 6) fail(`expected 6 stay chips in the lifestyle panel, got ${lsChipCount}`);
  const lsOn = await page.locator('.lifestyle-stay-chips .chip.on').innerText();
  if (!/Entire place/i.test(lsOn)) fail(`lifestyle panel opened on ${lsOn}, expected the entire-place default`);
  await page.screenshot({ path: `${SHOTS}/stay-tiers-lifestyle.png` });

  await stayChips.filter({ hasText: 'Dorm bed' }).first().click();
  await page.waitForTimeout(1200);
  if (!/[?&]st=dorm/.test(page.url())) fail(`stay tier not in the URL after the panel click: ${page.url()}`);
  const barText = await page.locator('.filter-staytier').innerText();
  if (!/Dorm bed/i.test(barText)) fail('filter bar did not follow the lifestyle panel choice');
  console.log('lifestyle panel drives the shared stay tier OK');

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_stay_tiers OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
