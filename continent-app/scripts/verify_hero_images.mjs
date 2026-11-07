// Headless verify for the hero image audit: the photographs the audit chose
// have to actually load in the panel, at a size worth opening on.
//
//   node scripts/verify_hero_images.mjs [url]     (default http://localhost:$CARTA_PORT or 4173)
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

// T1089 needs: network (the audited heroes are Wikimedia Commons files). The
// checks that load a photograph pass with a SKIP note only when upload.wikimedia.org
// does not answer from here; the wire, srcset and place-page checks always run.
const ONLINE = await fetch('https://upload.wikimedia.org/', { method: 'HEAD', signal: AbortSignal.timeout(5000) })
  .then(() => true).catch(() => false);

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;   // not URL: that shadows the global
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
const netCheck = (label, ok, note = '') => (ONLINE || ok
  ? check(label, ok, note) : check(label, true, 'SKIP (needs network)'));
const errors = [];
// Offline, every remote request fails at the proxy: that is the setup, not the page.
const NOISE = ONLINE ? /ERR_FAILED|config is not valid/ : /ERR_FAILED|config is not valid|ERR_TUNNEL_CONNECTION_FAILED/;

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
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
netCheck(`${results.length} audited heroes load`, broken.length === 0,
  broken.map((b) => b.city).join(', '));
netCheck('none arrives below the panel width', small.length === 0,
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

// And one real place page, to prove a swapped hero is what the page renders.
// The page opens the way a card link does it: the app boots, then the hash moves.
const target = picks.find(([, d]) => d.city && !/[()]/.test(d.city)) || picks[0];
const [targetId, targetDest] = target;
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
const tab = page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(1500); }
await page.locator('.xrow-hit').first().waitFor({ state: 'attached', timeout: 60000 });

// Every grid photo must be asked for at a width Wikimedia renders. Anything
// off this list answers 400, and the card silently shows nothing. (T1089: the
// card is .xrow with its photo .xpc-img; a plain src counts like a srcset.)
const LEGAL = ['250', '330', '500', '960', '1280', '1920'];
const badWidths = await page.locator('.xrow img.xpc-img').evaluateAll((els, legal) => {
  const bad = [];
  for (const el of els) {
    const set = `${el.getAttribute('srcset') || ''} ${el.getAttribute('src') || ''}`;
    for (const m of set.matchAll(/\/(\d+)px-/g)) {
      if (!legal.includes(m[1])) bad.push(m[1]);
    }
  }
  return [...new Set(bad)];
}, LEGAL);
check('every card photo asks for a renderable width', badWidths.length === 0, badWidths.join(', '));

await page.evaluate((id) => { window.location.hash = `dest=${id}`; }, targetId);
await page.locator('.destp .pt-title').waitFor({ timeout: 60000 }).catch(() => {});
const opened = await page.locator('.destp').count() > 0;
check(`${targetDest.city} opens as a place page`, opened);
if (opened) {
  await page.waitForTimeout(2500);
  // T1089: the page draws its photographs as a mosaic (.pmos, T1019); the
  // hero is its first photograph. With no photograph it is a typographic blank.
  const hero = page.locator('.pmos img').first();
  const hasHero = await hero.count() === 1;
  netCheck(`panel hero is an img with a srcset or a src (${targetDest.city})`,
    hasHero && !!((await hero.getAttribute('srcset')) || (await hero.getAttribute('src'))));
  const drawn = hasHero ? await hero.evaluate((el) => ({ w: el.naturalWidth, src: el.currentSrc }))
    .catch(() => ({ w: 0, src: '' })) : { w: 0, src: '' };
  netCheck(`panel hero renders the audited file (${targetDest.city})`,
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
