// Headless check that the Stay step's idle side panel ("Best rated around
// here") represents EVERY country the trip covers. A straight top-4 by score
// gave all four slots to Austria on an Austria + Germany trip, so Germany was
// never named next to its own map.
// Run from inside continent-app/:  node scripts/verify_stay_picks.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const COUNTRIES = ['Austria', 'Germany'];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  });
  await page.goto(`${BASE}/?tab=trip&o=CRL`);

  const launch = page.locator('.trip-guide-cta, .trip-launcher-primary').first();
  await launch.waitFor({ timeout: 120000 });
  await launch.click();

  // Path 1 = plan the whole thing (Where / When / Getting there / Stay / ...).
  await page.locator('.guide-path').first().waitFor({ timeout: 30000 });
  await page.locator('.guide-path').first().click();

  // Where: pick both countries by name.
  await page.locator('.guide-country').first().waitFor({ timeout: 30000 });
  for (const name of COUNTRIES) {
    const tile = page.locator('.guide-country', { hasText: name }).first();
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
  }
  const picked = await page.locator('.guide-country.on').count();
  if (picked !== COUNTRIES.length) fail(`expected ${COUNTRIES.length} countries selected, got ${picked}`);
  await page.locator('.guide-next').click();

  // When: any span will do, the picks below do not depend on the dates.
  await page.locator('.guide-when-card').waitFor({ timeout: 30000 });
  const days = page.locator('.cal-inline .cal-day:not(.outside):not(.disabled)');
  await days.first().click();
  await days.nth(4).click();
  await page.locator('.guide-next').click();

  // Getting there: drive, the same shape as the reported trip (no flight anchor).
  await page.locator('.guide-mode-card').first().waitFor({ timeout: 30000 });
  // nth(1), not a text match: the Fly card's sub line ("Carta finds real
  // fares...") matches /car/i too.
  await page.locator('.guide-mode-card').nth(1).click();
  await page.waitForTimeout(300);
  await page.locator('.guide-next').click();

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
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
