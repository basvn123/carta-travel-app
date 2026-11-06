// Headless check that the Stay step's idle side panel ("Best rated around
// here") represents EVERY country the trip covers. A straight top-4 by score
// gave all four slots to Austria on an Austria + Germany trip, so Germany was
// never named next to its own map.
// Run from inside continent-app/:  node scripts/verify_stay_picks.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

// T1089: runs against a running dev server (argv URL or $CARTA_PORT), not its
// own vite preview.
const BASE = (process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`).replace(/\/$/, '');
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const COUNTRIES = ['Austria', 'Germany'];

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  });
  // T1089: the one-question Plan flow replaced the wizard's launcher. A place
  // page's "Plan a trip" seeds its country (Austria, from Salzburg) and lands
  // on Where; Germany is added by its card.
  await page.goto(`${BASE}/?tab=explore#dest=SZG`);
  await page.getByRole('button', { name: /plan a trip/i }).first().click({ timeout: 120000 });
  await page.locator('.guide-title').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /^Germany, from/ }).click();
  const picked = await page.locator('.guide-picked-chip').count();
  if (picked !== COUNTRIES.length) fail(`expected ${COUNTRIES.length} countries selected, got ${picked}`);
  await page.locator('.guide-next').first().click();

  // Stay: the idle panel, before any pin is tapped.
  await page.locator('.guide-side-idle-list').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => [...document.querySelectorAll('.guide-side-idle-row')].map((r) => ({
    city: (r.querySelector('.guide-side-idle-text b') || {}).textContent || '',
    flag: (r.querySelector('img.guide-side-idle-flag') || {}).getAttribute?.('src') || '',
  })));
  console.log('idle picks:', JSON.stringify(rows, null, 1));

  const flags = new Set(rows.map((r) => r.flag.match(/([a-z]{2})\.(svg|png)/i)?.[1]?.toLowerCase()).filter(Boolean));
  console.log('countries represented:', [...flags].join(', '));

  if (rows.length < 2) fail(`idle panel listed ${rows.length} cities`);
  if (rows.some((r) => !r.flag)) fail('a pick rendered without its country flag');
  if (flags.size < COUNTRIES.length) {
    fail(`picks span ${flags.size} country/countries, expected ${COUNTRIES.length} (${[...flags].join(', ')})`);
  }

  await page.screenshot({ path: `${SHOTS}/stay-picks.png` });
  await ctx.close();
  await browser.close();
  if (process.exitCode !== 1) console.log('verify_stay_picks OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  process.exit(process.exitCode === 1 ? 1 : 0);
}
