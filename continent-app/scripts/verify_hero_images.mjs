// Headless verify for the hero image audit: the photographs the audit chose
// have to actually load in the panel, at a size worth opening on.
//
//   node scripts/verify_hero_images.mjs [url]     (default http://localhost:4173)
//
// It samples destinations the audit replaced (image.source === "commons_audit"
// in the shipped wire), opens each one's detail panel, and checks the hero
// element resolved to a real bitmap rather than a broken link or a 1px spacer.
// Screenshots the first few to shots/hero-*.png so the swaps can be eyeballed.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:4173/';   // not URL: that shadows the global
const SAMPLE = Number(process.argv[3] || 12);

const wire = JSON.parse(readFileSync(new URL('../public/app_data.json', import.meta.url), 'utf8'));
const swapped = Object.entries(wire.destinations)
  .filter(([, d]) => (d.image || {}).source === 'commons_audit');
if (!swapped.length) {
  console.log('no audited heroes in the wire: run audit_hero_images.py patch, then npm run data');
  process.exit(1);
}
// Spread the sample across the list rather than taking the head, so one bad
// country cannot look like a pass.
const step = Math.max(1, Math.floor(swapped.length / SAMPLE));
const picks = swapped.filter((_, i) => i % step === 0).slice(0, SAMPLE);

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.welcomeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);

// The wire is the same file the app boots from, so every URL the panel will
// request is checkable without driving the UI once per destination. Fetching
// them from inside the page keeps the browser's own cache and headers.
const results = await page.evaluate(async (urls) => {
  const out = [];
  for (const [id, city, url] of urls) {
    const r = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = url;
    });
    out.push({ id, city, url, ...r });
  }
  return out;
}, picks.map(([id, d]) => [id, d.city, d.image.url]));

const broken = results.filter((r) => !r.w);
const small = results.filter((r) => r.w && r.w < 640);
check(`${results.length} audited heroes load`, broken.length === 0,
  broken.map((b) => b.city).join(', '));
check('none arrives below the panel width', small.length === 0,
  small.map((s) => `${s.city} ${s.w}px`).join(', '));

// And one real panel, to prove a swapped hero is what the band renders. The
// panel has no deep link, so it opens the way a visitor does: search the city,
// click the row. The hero is a background-image on .panel-hero, not an <img>.
const target = picks.find(([, d]) => d.city && !/[()]/.test(d.city)) || picks[0];
const [, targetDest] = target;
await page.goto(`${BASE}?tab=map&o=CRL`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.locator('.result-row').first().waitFor({ timeout: 90000 });
const search = page.locator('input[type="search"], .search-input, input[placeholder]').first();
await search.fill(targetDest.city);
await page.waitForTimeout(1200);
const row = page.locator('.result-row', { hasText: targetDest.city }).first();
const found = await row.count() > 0;
check(`${targetDest.city} is findable in the list`, found);
if (found) {
  await row.click();
  await page.locator('.panel.dest-panel.open').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const bg = await page.locator('.panel-hero').first()
    .evaluate((el) => getComputedStyle(el).backgroundImage).catch(() => '');
  check(`panel hero renders the audited file (${targetDest.city})`,
    bg.includes(targetDest.image.url), bg.slice(0, 90));
  await page.screenshot({ path: `shots/hero-${targetDest.city.replace(/[^\w]/g, '_')}.png` });
}

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? '  (' + c.note + ')' : ''}`);
if (errors.length) console.log('\npage errors:\n  ' + errors.slice(0, 5).join('\n  '));
console.log(`\n${pass}/${checks.length} checks passed over ${results.length} sampled heroes ` +
            `(${swapped.length} audited in the wire)`);
process.exit(pass === checks.length && !errors.length ? 0 : 1);
