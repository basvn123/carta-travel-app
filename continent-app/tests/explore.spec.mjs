// Visual regression on Explore (PLAN.md E3).
//
//   node tests/explore.spec.mjs [url]     (default http://localhost:4173)
//
// Screenshots the rebuilt Explore at 390 / 768 / 1440, plus a filtered view,
// the map view and the empty-result state - six baselines under
// tests/baselines/ - and asserts the invariants a screenshot alone cannot:
// no horizontal body scroll at any width, no broken images anywhere on the
// page, and an accessible label on every kind glyph. The app ships one
// deliberate theme (no prefers-color-scheme block exists), so there is one
// baseline per state, not two.
//
// Deploys land as Vercel previews needing manual promotion: run this against
// the preview URL and read the result BEFORE promoting -
//   node tests/explore.spec.mjs https://<preview>.vercel.app
// A structural failure here is a red light on promotion. The committed
// baselines are the reference for reviewing what changed; the structural
// assertions are the gate.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const URL = process.argv[2] || 'http://localhost:4173/';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'baselines');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => {
  checks.push({ label, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`);
};

const boot = async (viewport) => {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('carta.tierLegendDismissed.v1', '0');
    } catch { /* fine */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  const nav = viewport.width < 769
    ? page.locator('.bottom-nav button', { hasText: /explore/i }).first()
    : page.locator('.header-nav-item', { hasText: /^\s*explore\s*$/i }).first();
  if (await nav.isVisible().catch(() => false)) await nav.click();
  await page.waitForTimeout(2200);
  return page;
};

const assertInvariants = async (page, label) => {
  const hscroll = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${label}: no horizontal body scroll`, !hscroll);
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent !== null)
      .map((i) => i.src.slice(0, 80)));
  check(`${label}: no broken images`, broken.length === 0, broken.slice(0, 2).join(' '));
  const unlabeled = await page.evaluate(() =>
    [...document.querySelectorAll('.kind-glyph')]
      .filter((g) => {
        const own = g.getAttribute('aria-label');
        const word = g.parentElement?.textContent?.trim();
        return !own && !word;
      }).length);
  check(`${label}: every kind glyph carries a label`, unlabeled === 0, String(unlabeled));
};

const shoot = async (page, name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};

try {
  for (const [name, vp] of [
    ['explore-390', { width: 390, height: 844 }],
    ['explore-768', { width: 768, height: 1024 }],
    ['explore-1440', { width: 1440, height: 940 }],
  ]) {
    const page = await boot(vp);
    await assertInvariants(page, name);
    await shoot(page, name);
    await page.close();
  }

  // Filtered view: a kind and a verdict, chips standing, count narrowed.
  let page = await boot({ width: 1440, height: 940 });
  await page.locator('.explore-side .xrail-toggle', { hasText: /^Village$/ }).first().click();
  await page.waitForTimeout(700);
  check('filtered: chip stands', await page.locator('.xchip', { hasText: /Village/ }).count() === 1);
  check('filtered: url carries state', page.url().includes('xk=village'));
  await assertInvariants(page, 'explore-filtered');
  await shoot(page, 'explore-filtered');

  // Map view on top of the same filter.
  await page.locator('.xview-toggle button', { hasText: /^Map$/ }).click();
  await page.waitForTimeout(4500);
  check('map: canvas renders', await page.locator('.xmap canvas').count() === 1);
  check('map: chips survive the toggle', await page.locator('.xchip', { hasText: /Village/ }).count() === 1);
  await assertInvariants(page, 'explore-map');
  await shoot(page, 'explore-map');
  await page.close();

  // Empty result: a search nothing matches.
  page = await boot({ width: 1440, height: 940 });
  const search = page.locator('#header-search-slot .results-search-input, .explore-search .results-search-input').first();
  await search.fill('zzz-no-such-place');
  await page.waitForTimeout(800);
  check('empty: states itself plainly', await page.locator('.explore-count-badge').isVisible());
  check('empty: zero cards', await page.locator('.xcard').count() === 0);
  await assertInvariants(page, 'explore-empty');
  await shoot(page, 'explore-empty');
  await page.close();
} catch (e) {
  check('suite ran to the end', false, String(e).split('\n')[0]);
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; `
  + `baselines -> ${OUT}`);
process.exit(failed.length ? 1 : 0);
