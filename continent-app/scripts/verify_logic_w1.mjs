// Logic wave 1 (ROADMAP D10, G9, I14): DOM checks with flag E1 on (build with config/flags.json E1 "new").
//   - the Explore overview and its list do not scroll sideways at 390, 820, 1440
//   - width sweep 360 to 1600
// - a planned trip Lisbon 3 nights + Reus 4 nights (Reus has no bed price in the catalogue, the audit's A-1 case)
//   shows "Without beds in Reus" on the trip's cost card at 390, 820, 1180 and 1440, with no sideways scroll
// "before getting there" (Ask budget answer) and "not converted" are pinned in node (tests/honestTotals.test.mjs,
// six-language keys in tests/i18nParity.test.mjs).
//
//   node scripts/verify_logic_w1.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const boot = async (viewport, { trip = false } = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await mirrorData(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  if (trip) {
    await page.addInitScript(() => {
      const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      try {
        localStorage.setItem('carta.tripDraft.v1', JSON.stringify({ stops: [{ destinationId: 'LIS', nights: 3 }, { destinationId: 'REU', nights: 4 }], tripStart: day(40), tripEnd: day(47), planned: true }));
      } catch { /* storage unavailable */ }
    });
    await page.goto(`${URL}?tab=plan`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(6000);
    return { page, errors };
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { page, errors };
};

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]]) {
  try {
    const { page, errors } = await boot({ width, height });
    check(`${label}: Explore draws and does not scroll sideways`, await noSideways(page));
    const see = page.locator('.xrails-rail .hs-see-all:visible').first();
    await see.waitFor({ timeout: 30000 });
    await see.click();
    await page.locator('.xrows .xrow').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    check(`${label}: the list does not scroll sideways`, await noSideways(page));
    check(`${label}: no page error with E1 on`, errors.length === 0, errors.join(' | '));
    await page.close();
  } catch (e) {
    check(`${label}: ran`, false, String(e).split('\n')[0]);
  }
}

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]]) {
  try {
    const { page, errors } = await boot({ width, height }, { trip: true });
    const text = await page.locator('body').innerText();
    check(`${label}: the trip with a stop that has no bed price says "Without beds in Reus"`, /Without beds in Reus/.test(text), text.includes('Reus') ? '' : 'trip not shown');
    check(`${label}: the trip page does not scroll sideways`, await noSideways(page));
    check(`${label}: no page error on the trip page`, errors.length === 0, errors.join(' | '));
    await page.close();
  } catch (e) {
    check(`${label}: trip page ran`, false, String(e).split(String.fromCharCode(10))[0]);
  }
}

try {
  const bad = [];
  const { page } = await boot({ width: 1440, height: 900 });
  for (const w of [360, 390, 430, 600, 768, 820, 1024, 1180, 1280, 1440, 1600]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    if (!(await noSideways(page))) bad.push(w);
  }
  check('width sweep 360 to 1600: no horizontal overflow', bad.length === 0, bad.join(','));
} catch (e) {
  check('the width sweep ran', false, String(e).split('\n')[0]);
}

await browser.close();
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
