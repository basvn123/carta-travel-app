// T176-c: the trail GPX and KML are free for a signed-out visitor.
//
//   CARTA_PORT=5202 node scripts/verify_trail_free_gpx.mjs [url]
//
// verify_trail_page.mjs runs with ?paymock, which fakes an entitlement so the
// download checks test the file. That hides the one thing T176 changed: the
// buttons must not ask for a pass at all. This harness opens a loop and a
// one-way trail (and the border trail Korab 9/1) with NO seam, as a guest,
// presses GPX and KML, and checks a file arrives and no paywall dialog does.
// It also reads the subtitle under the title on the border trail (T108-a).
// Runs at 390px and at 1280px. Needs public/trails/AL.json (dev server data).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const ORIGIN = new URL(BASE).origin;
const wire = JSON.parse(readFileSync('public/trails/AL.json', 'utf8'));
const hikes = wire.trips.filter((t) => t.category !== 'citytrip');
const loop = hikes.find((t) => t.is_loop);
const oneWay = hikes.find((t) => t.id === 63433) || hikes.find((t) => !t.is_loop);
const cases = [
  ['loop', loop], ['one-way (Korab 9/1)', oneWay],
];

const checks = [];
const check = (label, ok, note = '') => { checks.push({ label, ok, note }); };
const errors = [];
const NOISE = /status of 404|ERR_FAILED|config is not valid|Geolocation|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/;

const browser = await chromium.launch();
for (const [vpName, viewport] of [['phone 390', { width: 390, height: 844 }], ['desktop 1280', { width: 1280, height: 860 }]]) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.mapGuideDone', '1');
    } catch { /* storage unavailable */ }
    try {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    } catch { /* older engines */ }
  });
  for (const [kind, trail] of cases) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${vpName} pageerror: ` + e.message.split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${vpName} console: ` + m.text().slice(0, 140)); });
    const tag = `${vpName}, ${kind}`;
    await page.goto(`${ORIGIN}/#trail=${trail.id}&tc=AL`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.tpage').waitFor({ timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(5000);
    check(`${tag}: the page opens signed out`, await page.locator('.tpage').isVisible().catch(() => false));
    const noPay = async () => (await page.locator('.pass-overlay:visible').count()) === 0;

    const gpxP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.locator('.tpage-primary').click();
    const gpx = await gpxP;
    check(`${tag}: GPX downloads with no paywall`, !!gpx && /\.gpx$/.test(gpx?.suggestedFilename() || '') && await noPay(),
      gpx ? gpx.suggestedFilename() : 'no download');
    if (kind.startsWith('one-way')) {
      const sub = await page.locator('.tpage-sub').innerText().catch(() => '');
      check(`${tag}: border-trail subtitle is present and names no ISO code`, sub.length > 3 && !/\bAL\b/.test(sub), sub.replace(/\n/g, ' '));
    }

    const kmlP = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.locator('.tpage-act', { hasText: /google maps/i }).first().click();
    const kml = await kmlP;
    check(`${tag}: KML downloads with no paywall`, !!kml && /\.kml$/.test(kml?.suggestedFilename() || '') && await noPay(),
      kml ? kml.suggestedFilename() : 'no download');
    await page.screenshot({ path: `shots/trail-free-gpx-${vpName.replace(' ', '-')}-${trail.id}.png` });
    // No horizontal overflow on the page we touched.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tag}: no horizontal overflow`, over <= 1, `${over} px`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  [${c.note}]` : ''}`);
}
if (errors.length) { console.log('\npage errors:'); for (const e of errors) console.log('  ' + e); }
console.log(failed === 0 && errors.length === 0 ? '\nAll checks passed.' : `\n${failed} checks failed, ${errors.length} page errors.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
