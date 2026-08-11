// Captures the three product screenshots the homepage sells with, straight
// from the running app, so they cannot go stale the way hand-made marketing
// images do: re-run this after any UI change and the landing page follows.
//
//   public/shots/map.webp    the map tab, priced, one destination card open
//   public/shots/trip.webp   the trip planner with the cost breakdown
//   public/shots/day.webp    the day planner timeline and its walking route
//
// All three are captured at 1440x900 deviceScaleFactor 2 (16:10, matching the
// .home-shot frames), then halved back to 1440x900 as WebP so the landing page
// is not shipping 4 MB of PNG to every visitor.
//
// Run from inside continent-app/:  node scripts/shots.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'public/shots';
// The audit URL: Charleroi, 4 nights in August, one traveller, priority bag.
const TRIP = 'd=2026-08-01&r=2026-08-05&g=1&b=priority_10kg&o=CRL';
mkdirSync(OUT, { recursive: true });

// The day planner only has something worth photographing once a day is
// actually built, so seed one, the same Salzburg day verify_day_overview.mjs
// uses. Indices are stable positions in activities_full.json, which is what
// assignments speak, so this drops straight into localStorage.
const PLAN_ID = 'local:shots';
const STOPS = [
  { idx: 2, name: 'Salzburg Cathedral' },
  { idx: 11, name: 'Erzabtei Sankt Peter' },
  { idx: 1, name: 'Hohensalzburg Fortress' },
  { idx: 4, name: 'Schloss Mirabell' },
];

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

/** Every gate a fresh visitor hits before the app itself is on screen. Skipping
 *  any of them yields a screenshot of a modal instead of the product. */
const clearGates = async (page) => {
  for (const name of ['Continue without an account', 'Got it']) {
    try {
      await page.getByRole('button', { name }).first().click({ timeout: 8000 });
    } catch { /* gate not shown in this build or already dismissed */ }
  }
  await page.evaluate(() => {
    for (const sel of ['.coach-mark', '.guide-bubble', '.fare-notice-backdrop']) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
  });
};

// A scratch page whose only job is to run a canvas downscale. Capturing at
// deviceScaleFactor 2 keeps the type crisp, but a raw 2880x1800 PNG is ~1.5 MB
// for a slot about 1000 device pixels wide, and these ship to every visitor of
// the landing page. Half size as WebP is ~10% of the bytes at the same
// on-screen quality.
let shrinker = null;
const OUT_W = 1440;
const OUT_H = 900;

const shoot = async (page, name) => {
  await page.waitForTimeout(1200);
  // 16:10 out of a 1440x900 viewport, taken from the top so the chrome that
  // identifies the product stays in frame.
  const raw = await page.screenshot({ clip: { x: 0, y: 0, width: OUT_W, height: OUT_H } });
  const dataUrl = await shrinker.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/webp', 0.82);
  }, { b64: raw.toString('base64'), w: OUT_W, h: OUT_H });
  const out = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  writeFileSync(`${OUT}/${name}.webp`, out);
  console.log(`wrote ${OUT}/${name}.webp (${Math.round(out.length / 1024)} kB)`);
};

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  shrinker = await ctx.newPage();
  await shrinker.goto('about:blank');
  await page.addInitScript(({ planId, stops }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: planId,
      label: 'Salzburg day',
      startDate: '2026-08-04',
      stops: [{ destinationId: 'SZG', days: 1 }],
    }]));
    localStorage.setItem(`carta.dayplan.${planId}`, JSON.stringify({
      0: { 0: stops.map((s) => s.idx) },
    }));
  }, { planId: PLAN_ID, stops: STOPS });

  // ---- 1. The map, with a destination card open.
  await page.goto(`${BASE}/?tab=map&${TRIP}`);
  await clearGates(page);
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 180000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  try {
    await page.locator('.result-row, .results-row').first().click({ timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch { console.warn('no result row to open, shooting the bare map'); }
  await shoot(page, 'map');

  // ---- 2. The trip planner.
  await page.goto(`${BASE}/?tab=trip&${TRIP}`);
  await clearGates(page);
  await page.locator('.trip-guide-cta, .trip-launcher, .trip-sheet').first().waitFor({ timeout: 180000 });
  await shoot(page, 'trip');

  // ---- 3. The day planner, on the seeded Salzburg day. "Today's plan" is a
  // collapsible whose body is unmounted while closed, so open it first or the
  // screenshot is of a shut drawer.
  await page.goto(`${BASE}/?tab=day&${TRIP}`);
  await clearGates(page);
  const card = page.locator('.trip-saved-main', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 180000 });
  await card.click();
  const planHead = page.locator('.day-plan-collapse .day-collapse-head').first();
  await planHead.waitFor({ timeout: 60000 });
  const rows = page.locator('.day-timeline-row');
  if (await rows.count() === 0) await planHead.click();
  await rows.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await shoot(page, 'day');

  await browser.close();
  console.log('shots OK');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
