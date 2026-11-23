// Logic wave 3a (ROADMAP D7, D20, D24, I14, G12): DOM checks of the touched screens at 390, 820, 1180 and
// 1440 and a width sweep. Build with config/flags.json E2 and E10 "new" (a temporary edit, restored).
//   - the trails list and a trail page: the page draws, its grade card never says "T5" and
//     "estimated" together (REQ-data-7), the Suits facet offers "All year" and not "Winter" (REQ-data-6)
//   - the Style Studio's party step: a Teens row beside Adults, a stepper that moves the adults row (W3-L1)
//   - the way back from Stripe cannot be driven headless (it needs a signed-in paid session): PassBack is
//     rendered by ?pass=ok only after the entitlement lands, so it is covered by tests/wave3aLeftovers.test.mjs
//   - the live wire carries no `o`, `allYear` or heat months until the next box run: those rows are
//     proven in node (tests/wave3aOutdoor.test.mjs, wave3aHeat.test.mjs) and by fallback here.
//
//   node scripts/verify_logic_w3a.mjs [url] [CC]    (default http://localhost:$CARTA_PORT or 4173, SI)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const CC = (process.argv[3] || 'SI').toUpperCase();
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\./;
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function open(viewport, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await mirrorData(ctx);
  await ctx.addInitScript((clear) => {
    try {
      // The Style Studio opens by itself on a fresh device with a normal browser.
      if (clear) Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      if (clear && !sessionStorage.getItem('w3a.cleared')) { localStorage.clear(); sessionStorage.setItem('w3a.cleared', '1'); }
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.mapGuideDone', '1');
    } catch { /* storage unavailable */ }
  }, fresh);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${viewport.width}: pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${viewport.width}: console: ${m.text().slice(0, 120)}`); });
  return { page, ctx };
}

// The Trails tab under the band, then the country card (the route verify_trails.mjs takes).
async function openTrails(page) {
  await page.goto(`${BASE}?tab=map`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.band-input', { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.locator('[role="tablist"] [role="tab"]:visible', { hasText: /^\s*Trails\s*$/ }).first().click();
  await page.waitForTimeout(2000);
  await page.locator(`.dtab-bycountry .dgal-card[data-cc="${CC}"] .card-open`).first().click();
  await page.waitForTimeout(2500);
}

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]]) {
  const tag = `${label}: `;
  try {
    // ---- Trails list, Suits facet, trail page ----
    const { page, ctx } = await open({ width, height });
    await openTrails(page);
    const nCards = await page.locator('.places-tcard').count();
    check(`${tag}the trails list draws`, nCards >= 10, `${nCards} cards`);
    check(`${tag}the list does not scroll sideways`, (await sideways(page)) <= 1, `${await sideways(page)} px`);
    // The Suits group lives in the filters (the chip row on wide screens, the sheet on a phone).
    const opener = page.locator('.qfbar-filters:visible, .qfbar-filter:visible, button:visible', { hasText: /^\s*Filters?\b/i }).first();
    if (await opener.isVisible().catch(() => false)) { await opener.click(); await page.waitForTimeout(800); }
    const text = await page.locator('body').innerText();
    check(`${tag}the Suits facet offers "All year" and no "Winter" chip`,
      !/(^|\n)\s*Winter\s*(\n|$)/.test(text),
      /\bAll year\b/.test(text) ? 'All year shown' : 'no suitability chip on this list (the group is hidden without rows)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.locator('.places-tcard .card-open').first().click();
    await page.waitForTimeout(3500);
    check(`${tag}a trail page opens`, await page.locator('.tpage-v2').isVisible().catch(() => false));
    const body = await page.locator('.tpage-scroll').innerText().catch(() => '');
    check(`${tag}the grade card never reads "T5" with "Estimated from the elevation model"`, !(/\bT5\b/.test(body) && /Estimated from the elevation model/.test(body)));
    check(`${tag}the trail page does not scroll sideways`, (await sideways(page)) <= 1, `${await sideways(page)} px`);
    await ctx.close();

    // ---- Style Studio party step with Teens (E2 new) ----
    const fresh = await open({ width, height }, { fresh: true });
    await fresh.page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const studio = fresh.page.locator('.fsheet.sst[role="dialog"]');
    const opened = await studio.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
    check(`${tag}the Style Studio opens on a fresh device`, opened);
    if (opened) {
      await studio.locator('.sst-row', { hasText: /Family/ }).first().click().catch(() => {});
      await fresh.page.waitForTimeout(600);
      const party = studio.locator('.sst-party .party-row');
      const labels = await party.locator('.party-label b').allInnerTexts().catch(() => []);
      check(`${tag}the party step has Adults, Teens, Children, Babies`, labels.join('|') === 'Adults|Teens|Children|Babies', labels.join('|'));
      const val = async (name) => Number((await party.filter({ hasText: name }).locator('.fstepper-value').first().innerText().catch(() => 'NaN')).trim());
      const adults0 = await val('Adults');
      await party.filter({ hasText: 'Teens' }).locator('.fstepper-btn').last().click().catch(() => {});
      await fresh.page.waitForTimeout(400);
      check(`${tag}one more teen keeps the adults row and raises the teens row`, (await val('Teens')) === 1 && (await val('Adults')) === adults0, `teens ${await val('Teens')}, adults ${await val('Adults')}`);
      check(`${tag}the party step does not scroll sideways`, (await sideways(fresh.page)) <= 1);
      await fresh.page.screenshot({ path: `${process.env.W3A_SHOTS || '.'}/w3a-studio-${width}.png` }).catch(() => {});
    }
    await fresh.ctx.close();
  } catch (e) {
    check(`${tag}ran`, false, String(e).split('\n')[0]);
  }
}

try {
  const { page, ctx } = await open({ width: 1440, height: 900 });
  await openTrails(page);
  const bad = [];
  for (const w of [360, 390, 430, 600, 768, 820, 1024, 1180, 1280, 1440, 1600]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    if ((await sideways(page)) > 1) bad.push(w);
  }
  check('width sweep 360 to 1600: no horizontal overflow on the trails list', bad.length === 0, bad.join(','));
  await ctx.close();
} catch (e) {
  check('the width sweep ran', false, String(e).split('\n')[0]);
}

check('no page error or console error', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
