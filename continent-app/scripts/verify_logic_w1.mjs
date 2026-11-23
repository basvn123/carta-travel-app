// Logic wave 1 (ROADMAP D10, G9, I14): DOM checks with flag E1 on (build with config/flags.json E1 "new").
//   - the Explore overview and its list do not scroll sideways at 390, 820, 1440
//   - width sweep 360 to 1600
// The receipt lines ("Without beds in {city}", "before getting there", "not converted") are pinned in
// node (tests/honestTotals.test.mjs, six-language keys in tests/i18nParity.test.mjs): they need a
// planned trip with a missing bed price, which the published catalogue does not have today.
//
//   node scripts/verify_logic_w1.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const boot = async (viewport) => {
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
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.explore-tab').waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { page, errors };
};

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['desktop 1440', 1440, 900]]) {
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
