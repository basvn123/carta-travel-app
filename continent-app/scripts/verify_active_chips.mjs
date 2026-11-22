// G12 map view round 2 (integration, 2026-11-20): an active filter chip is
// whole and in view on a phone, in six languages at 360 and 390 px. (a) The
// Explore list's applied row with Top rated on: the chip is never clipped by
// the scroller between Filters and Clear all (it stacks under them when it
// cannot fit). (b) The map's quick row with its last chip turned on: the chip
// moves to the front and the row swipes back, so it is in view.
//
//   node scripts/verify_active_chips.mjs   (a server at CARTA_PORT, default 4802;
//   CARTA_DATA_MIRROR for a worktree; SHOT=<dir> for German 360 shots)
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 4802;
const BASE = `http://127.0.0.1:${PORT}/`;
const LANGS = (process.env.LANGS || 'en,nl,de,fr,es,it').split(',');
const SIZES = (process.env.SIZES || '360x780,390x844').split(',').map((s) => s.split('x').map(Number));
const SHOT = process.env.SHOT || '';
const browser = await chromium.launch();
let bad = 0; let n = 0;
const seen = (rowSel, chipSel) => `(() => {
  const row = document.querySelector(${JSON.stringify(rowSel)});
  const chip = document.querySelector(${JSON.stringify(chipSel)});
  if (!row || !chip) return { ok: false, why: 'missing ' + (!row ? 'row' : 'chip') };
  const r = row.getBoundingClientRect(); const c = chip.getBoundingClientRect();
  const cs = getComputedStyle(row);
  const fs = parseFloat(cs.getPropertyValue('--fade-s')) || 0; const fe = parseFloat(cs.getPropertyValue('--fade-e')) || 0;
  const masked = cs.maskImage && cs.maskImage !== 'none';
  const left = Math.max(r.left + (masked ? fs : 0), 0); const right = Math.min(r.right - (masked ? fe : 0), innerWidth);
  return { ok: c.left >= left - 0.5 && c.right <= right + 0.5, chip: [Math.round(c.left), Math.round(c.right)], row: [Math.round(left), Math.round(right)], text: chip.textContent.trim().slice(0, 30) };
})()`;
for (const lang of LANGS) for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mirrorData(ctx);
  await ctx.route(/supabase\.co\//, (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  await page.addInitScript((l) => { localStorage.setItem('continent.lang.v1', l); localStorage.setItem('continent.guestMode.v1', '1'); localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen.v1', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1'); localStorage.setItem('carta.styleStudio.seen.v1', '1'); }, lang);
  // (a) list page applied row
  let a = { ok: false, why: 'not reached' };
  try {
    await page.goto(BASE + '?tab=explore', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('.hs-rail, .xrow', { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('.band-input').first().click();
    await page.getByRole('button', { name: /^(Filters|Filter|Filtres|Filtros|Filtri)\b/ }).first().click();
    await page.waitForSelector('.flt-show', { timeout: 10000 });
    await page.locator('.flt [data-group="score"] .ui-chip-choice').last().click();
    await page.waitForTimeout(800);
    await page.locator('.flt-show').click();
    await page.waitForTimeout(1200);
    a = await page.evaluate(seen('.xap.is-phone .xap-scroll', '.xap-chip'));
    if (SHOT && lang === 'de' && w === 360) await page.screenshot({ path: `${SHOT}/applied-de-360.png` });
  } catch (e) { a = { ok: false, why: String(e.message).split('\n')[0] }; }
  // (b) map quick row: the last quick chip on
  let b = { ok: false, why: 'not reached' };
  try {
    await page.goto(BASE + '?tab=map&xw=map', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('.band-quick .xquick-chip', { timeout: 90000 });
    await page.waitForTimeout(1500);
    const chips = page.locator('.band-quick .xquick-chip:not(.xquick-filters)');
    await chips.last().scrollIntoViewIfNeeded();
    await chips.last().tap();
    await page.waitForTimeout(1200);
    b = await page.evaluate(seen('.band-quick .xquick', '.band-quick .xquick-chip[aria-pressed="true"]'));
    if (SHOT && lang === 'de' && w === 360) await page.screenshot({ path: `${SHOT}/quick-de-360.png` });
  } catch (e) { b = { ok: false, why: String(e.message).split('\n')[0] }; }
  for (const [k, r] of [['applied', a], ['quick', b]]) { n++; if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${k} ${lang} ${w} ${JSON.stringify(r)}`); }
  await ctx.close();
}
console.log(`${n - bad}/${n} pass`);
await browser.close();
process.exit(bad ? 1 : 0);
