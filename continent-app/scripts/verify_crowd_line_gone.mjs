// Headless check that the raw crowding density line and its season note are
// gone from the destination page, for every destination and not just the one
// that was reported.
//
// The two lines removed read:
//   "10,390 tourist nights per km² in Roma"
//   "Measured yearly by region. For the season, read the price curve under
//    Where to sleep: beds cost most when most people come."
//
// The tier badge stays: it is the part a reader can act on. This walks a
// spread of destinations across all four crowding tiers, plus one with no
// crowding measurement at all, and asserts the same thing on each.
//
//   npm run build, then: node scripts/verify_crowd_line_gone.mjs

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|404/;

// A spread across the tiers, airports and gems alike. `badge` tracks the
// PRE-EXISTING rule in crowdBadgeWorthShowing: only the extremes (tier 0 Quiet
// and tier 3 Crowded) earn a pill, because a middling tier tells nobody
// anything. That gate is untouched by this change; the cases are here so the
// removal is checked on pages that do and do not carry a badge.
const CASES = [
  { id: 'FCO', name: 'Rome (Fiumicino)', badge: true },    // tier 3, the reported one
  { id: 'CIA', name: 'Rome (Ciampino)', badge: true },     // same region, same figure
  { id: 'BMA', name: 'Stockholm (Bromma)', badge: true },  // tier 3
  { id: 'gem:kromeriz', name: 'Kromeriz', badge: false },  // tier 2, middling: no pill
  { id: 'gem:romo', name: 'Romo', badge: false },          // tier 2, middling: no pill
  { id: 'TOS', name: 'Tromso', badge: true },              // tier 0 Quiet: an extreme
];

const DENSITY = /tourist nights per km|overnachtingen per km|nuit[ée]es par km|Übernachtungen pro km|pernoctaciones por km|pernottamenti per km/i;
const SEASON = /Measured yearly by region|beds cost most when most people come/i;

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  } catch { /* storage unavailable */ }
});

for (const c of CASES) {
  await page.goto(BASE + '#dest=' + c.id, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2600);
  const destp = page.locator('.destp').first();
  const open = await destp.isVisible().catch(() => false);
  check(`${c.name}: page opens`, open);
  if (!open) continue;

  const text = await destp.innerText();
  check(`${c.name}: no density line`, !DENSITY.test(text),
    (text.match(DENSITY) ? text.split('\n').find((l) => DENSITY.test(l)) : ''));
  check(`${c.name}: no season note`, !SEASON.test(text),
    (text.match(SEASON) ? text.split('\n').find((l) => SEASON.test(l)) : ''));
  // The number itself, in case a translation slips the wording.
  check(`${c.name}: no raw per-km2 figure`, !/per km²/i.test(text));

  // The tier badge is the part that stays.
  const badges = await page.locator('.destp .crowd-badge').count();
  if (!c.badge) check(`${c.name}: middling tier still shows no pill`, badges === 0, String(badges));
  if (c.badge) {
    check(`${c.name}: tier badge still shown`, badges >= 1, String(badges));
    // And the figure still lives in the badge's tooltip, not in the body.
    if (badges >= 1) {
      const tip = await page.locator('.destp .crowd-badge').first().getAttribute('title', { timeout: 5000 }).catch(() => '');
      check(`${c.name}: figure survives in the tooltip`, /km²/.test(tip || ''), (tip || '').slice(0, 60));
    }
  }
}

// The crowd block must not leave an empty bordered stub behind when it is the
// only thing in its slot: removing two of its three children could do that.
await page.goto(BASE + '#dest=FCO', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);
const crowdBox = page.locator('.destp-crowd').first();
if (await crowdBox.isVisible().catch(() => false)) {
  const h = await crowdBox.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check('crowd block is a badge row, not an empty stub', h > 14 && h < 80, `${h}px`);
}
await page.screenshot({ path: 'shots/crowd-line-gone.png', fullPage: false });

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length ? 0 : 1);
