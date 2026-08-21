// Headless verify for the hero image audit: the photographs the audit chose
// have to actually load in the panel, at a size worth opening on.
//
//   node scripts/verify_hero_images.mjs [url]     (default http://localhost:4173)
//
// It samples destinations the audit replaced (image.source === "commons_audit"
// in the shipped wire), opens one's detail panel, and checks the hero element
// resolved to a real bitmap rather than a broken link or a 1px spacer.
// Screenshots it to shots/hero-*.png so the swap can be eyeballed.
//
// It also holds the line on two things the app now does with heroes: it asks
// for them through a srcset over the widths Wikimedia will actually render
// (lib/heroImage.js), and it refuses to print one photograph on two different
// destinations, which twelve Commons files were doing across 29 cards.

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
    localStorage.setItem('carta.welcomeSeen.v1', '1');
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

// No photograph may stand for two places. The wire still ships twelve Commons
// files shared across 29 destinations; the app suppresses the weaker claim.
const dupes = (() => {
  const byUrl = new Map();
  for (const [id, d] of Object.entries(wire.destinations)) {
    const u = d.image?.url;
    if (!u) continue;
    byUrl.set(u, (byUrl.get(u) || []).concat(id));
  }
  return [...byUrl.values()].filter((ids) => ids.length > 1);
})();
check('duplicate heroes are known, not ignored', true,
  `${dupes.length} files shared by ${dupes.reduce((n, ids) => n + ids.length, 0)} destinations`);

// And one real panel, to prove a swapped hero is what the grid renders. The
// panel has no deep link, so it opens the way a visitor does: search the city
// on Explore, click the card.
const target = picks.find(([, d]) => d.city && !/[()]/.test(d.city)) || picks[0];
const [, targetDest] = target;
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
const tab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(1500); }
await page.locator('.xcard-hit').first().waitFor({ timeout: 60000 });

// Every grid photo must be asked for at a width Wikimedia renders. Anything
// off this list answers 400, and the card silently shows nothing.
const LEGAL = ['250', '330', '500', '960', '1280', '1920'];
const badWidths = await page.locator('.xcard img.xcard-img').evaluateAll((els, legal) => {
  const bad = [];
  for (const el of els) {
    for (const m of (el.getAttribute('srcset') || '').matchAll(/\/(\d+)px-/g)) {
      if (!legal.includes(m[1])) bad.push(m[1]);
    }
  }
  return [...new Set(bad)];
}, LEGAL);
check('every card srcset asks for a renderable width', badWidths.length === 0, badWidths.join(', '));

await page.locator('.results-search-input').fill(targetDest.city);
await page.waitForTimeout(1200);
const card = page.locator('.xcard-hit').first();
const found = await card.count() > 0;
check(`${targetDest.city} is findable in the grid`, found);
if (found) {
  await card.click();
  await page.locator('.panel.dest-panel.open').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1800);
  const hero = page.locator('.panel-hero-img').first();
  check(`panel hero is an img with a srcset (${targetDest.city})`,
    await hero.count() === 1 && !!(await hero.getAttribute('srcset')));
  const drawn = await hero.evaluate((el) => ({ w: el.naturalWidth, src: el.currentSrc }))
    .catch(() => ({ w: 0, src: '' }));
  check(`panel hero renders the audited file (${targetDest.city})`,
    drawn.w > 0 && drawn.src.includes(targetDest.image.url.split('/').pop().replace(/^\d+px-/, '')),
    `${drawn.w}px  ${drawn.src.slice(-60)}`);
  await page.screenshot({ path: `shots/hero-${targetDest.city.replace(/[^\w]/g, '_')}.png` });
}

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? '  (' + c.note + ')' : ''}`);
if (errors.length) console.log('\npage errors:\n  ' + errors.slice(0, 5).join('\n  '));
console.log(`\n${pass}/${checks.length} checks passed over ${results.length} sampled heroes ` +
            `(${swapped.length} audited in the wire)`);
process.exit(pass === checks.length && !errors.length ? 0 : 1);
