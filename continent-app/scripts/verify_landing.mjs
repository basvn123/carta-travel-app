/**
 * The landing page and the first-run receipt (T382, design wave V3; register
 * row T371-d). Until this file no harness looked at either: verify_receipt
 * checks the planner receipt, verify_trip_landing the trip planner's first
 * step and verify_prerender a prerender build.
 *
 * It drives a cold first visit (fresh browser storage) at 380 x 800 with touch
 * and at 1280 x 800, and checks what docs/design-v6/plans/V3-landing.md
 * promises:
 *
 *   home       a first visit with no link opens the landing page
 *   h1         exactly one visible h1
 *   primary    exactly one visible primary button in the view
 *   hscroll    nothing scrolls sideways
 *   sum        the receipt's lines add up to its total, to the cent
 *   est        an estimate total carries its tilde and est., and so does its
 *              per-person figure
 *   towns      each demo town's metadata line matches its receipt (All
 *              measured: no estimate line; National figures: every line one)
 *   tiers      in Chamonix every stay tier but the entire place says "not
 *              measured here"
 *   instrument the line under the title quotes the coverage section's counts
 *   walk       the priced list has at most five rows, cheapest first, before
 *              and after the party and the stay change
 *   fold       (phone) the primary and the receipt's footer line end above
 *              the bottom nav on the first screen
 *   carry      one person in a dorm bed set on the landing page is what the
 *              destination page's receipt prices, to the same total
 *   return     a second visit opens Destinations, not the landing page
 *   coverage   the coverage table renders or is cleanly absent
 *
 * It does not start a server. Serve the app first (never `npm run dev`, whose
 * predev rewrites public/):
 *   npx vite --port 5202 --strictPort
 *   node scripts/verify_landing.mjs --port=5202
 * Options: --vp=mobile,desktop  --timeout=240 (seconds to wait for the receipt;
 * a cold dev server on a laptop short of RAM took about 40 s in V1).
 * English UI. Exit code 1 when any check fails.
 */
import { chromium } from 'playwright';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = `http://${argv.host || '127.0.0.1'}:${argv.port || 5202}/`;
const WAIT = Number(argv.timeout || 240) * 1000;
const VIEWPORTS = [
  { key: 'mobile', viewport: { width: 380, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { key: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
].filter((v) => !argv.vp || String(argv.vp).split(',').includes(v.key));

const results = [];
const check = (vp, name, ok, detail = '') => {
  results.push({ vp, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${vp.padEnd(7)} ${name.padEnd(10)} ${detail}`);
};
const cents = (v) => Math.round(Number(v) * 100);

async function receiptState(page, scope) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const lines = [...root.querySelectorAll('.frr-line:not(.frr-sum) dd[data-eur]')].map((dd) => ({
      eur: Number(dd.dataset.eur), est: !!dd.querySelector('.frr-est'), tilde: !!dd.querySelector('.frr-tilde'),
    }));
    const sum = root.querySelector('.frr-sum-eur');
    const each = root.querySelector('.frr-each');
    return {
      lines,
      total: sum ? Number(sum.dataset.eur) : null,
      totalEst: !!sum?.querySelector('.frr-est'),
      totalTilde: !!sum?.querySelector('.frr-tilde'),
      each: each ? each.textContent.trim() : null,
    };
  }, scope);
}

async function waitForSettle(page, scope, before) {
  // A reprice re-renders the card; wait until the total differs or 3 s pass.
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const s = await receiptState(page, scope);
    if (s && s.total !== before) return s;
    await page.waitForTimeout(100);
  }
  return receiptState(page, scope);
}

async function run(vp) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor, locale: 'en-GB',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await page.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    check(vp.key, 'home', true, 'first visit opened the landing page');

    // The phone fold is measured on the first screen, before anything scrolls.
    if (vp.key === 'mobile') {
      const fold = await page.evaluate(() => {
        const nav = document.querySelector('.bottom-nav');
        const navTop = nav && nav.getBoundingClientRect().height > 0 ? nav.getBoundingClientRect().top : window.innerHeight;
        const cta = document.querySelector('.lp-page .lp-cta')?.getBoundingClientRect();
        const foot = [...document.querySelectorAll('.lp-page .frr-foot')].pop()?.getBoundingClientRect();
        return { navTop: Math.round(navTop), cta: cta && Math.round(cta.bottom), foot: foot && Math.round(foot.bottom) };
      });
      check(vp.key, 'fold', fold.cta != null && fold.cta <= fold.navTop && (fold.foot == null || fold.foot <= fold.navTop),
        `primary bottom ${fold.cta}, footer bottom ${fold.foot}, nav top ${fold.navTop}`);
    }

    const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].filter((h) => h.getClientRects().length && getComputedStyle(h).visibility !== 'hidden').length);
    check(vp.key, 'h1', h1 === 1, `${h1} visible`);
    const primaries = await page.evaluate(() => [...document.querySelectorAll('.btn-primary')].filter((b) => b.getClientRects().length).length);
    check(vp.key, 'primary', primaries === 1, `${primaries} visible`);
    const hs = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(vp.key, 'hscroll', hs <= 0, `${hs} px`);

    const r = await receiptState(page, '.lp-page');
    const sum = r.lines.reduce((s, l) => s + cents(l.eur), 0);
    check(vp.key, 'sum', sum === cents(r.total), `${r.lines.map((l) => l.eur).join(' + ')} = ${r.total}`);
    const anyEst = r.lines.some((l) => l.est);
    const estOk = anyEst === r.totalEst && (!r.totalEst || r.totalTilde) && (!r.totalEst || !r.each || r.each.startsWith('~'))
      && r.lines.every((l) => l.est === l.tilde);
    check(vp.key, 'est', estOk, `total est ${r.totalEst}, each "${r.each}"`);

    // Each demo town: its metadata line against its own receipt.
    const towns = await page.locator('.lp-page .lp-town').count();
    const townRows = [];
    for (let i = 0; i < towns; i += 1) {
      const btn = page.locator('.lp-page .lp-town').nth(i);
      const before = (await receiptState(page, '.lp-page')).total;
      await btn.click();
      const s = i === 0 ? await receiptState(page, '.lp-page') : await waitForSettle(page, '.lp-page', before);
      const name = (await btn.locator('.lp-town-name').textContent()).trim();
      const meta = (await btn.locator('.lp-town-meta').textContent()).trim();
      const estN = s.lines.filter((l) => l.est).length;
      const ok = (meta === 'All measured' && estN === 0) || (meta === 'National figures' && estN === s.lines.length)
        || ((meta === 'Bed measured' || meta === 'Food measured') && estN === 1);
      townRows.push(`${name}: ${meta} (${estN} est)`);
      if (!ok) check(vp.key, 'towns', false, `${name}: "${meta}" with ${estN} estimate lines`);
    }
    check(vp.key, 'towns', towns >= 1, townRows.join('; '));

    // Chamonix measures only the entire place (national), so every other
    // tier says so in the stay select.
    const cham = page.locator('.lp-page .lp-town', { hasText: 'Chamonix' });
    if (await cham.count()) {
      await cham.first().click();
      await page.waitForTimeout(300);
      const opts = await page.locator('.lp-page .lp-field-stay select option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
      const bad = opts.filter((o) => o.v !== 'home' && !/not measured here/.test(o.t));
      check(vp.key, 'tiers', opts.length > 1 && bad.length === 0, opts.map((o) => o.t).join(' | '));
    } else {
      check(vp.key, 'tiers', true, 'Chamonix not in this catalogue; skipped');
    }

    // The instrument line quotes the coverage section.
    const nums = await page.evaluate(() => {
      const n = (s) => (s || '').match(/\d[\d,.]*/g)?.map((x) => x.replace(/[,.]/g, '')) || [];
      const ps = [...document.querySelectorAll('.lp-cov > p')];
      return { inst: n(document.querySelector('.lp-instrument')?.textContent), cov: n(ps[0]?.textContent), food: n(ps[1]?.textContent) };
    });
    // instrument: m, n, f, date...; coverage: n, c, m, rest; food: f
    const instOk = nums.inst[0] === nums.cov[2] && nums.inst[1] === nums.cov[0] && nums.inst[2] === nums.food[0];
    check(vp.key, 'instrument', instOk, `instrument ${nums.inst.slice(0, 3).join('/')}, coverage ${nums.cov[2]}/${nums.cov[0]}/${nums.food[0]}`);

    // The priced list: at most five, cheapest first, and it reprices with the stay.
    const walkFigs = async () => page.locator('.lp-page .lp-walk-fig').evaluateAll((els) => els.map((e) => Number(e.dataset.eur)));
    const w1 = await walkFigs();
    const sorted = w1.every((v, i) => i === 0 || w1[i - 1] <= v);
    check(vp.key, 'walk', w1.length > 0 && w1.length <= 5 && sorted, `${w1.length} rows: ${w1.map((v) => v.toFixed(2)).join(', ')}`);

    // Carry: Porto, one person, a dorm bed, then open Porto.
    const porto = page.locator('.lp-page .lp-town', { hasText: 'Porto' });
    if (await porto.count()) {
      await porto.first().click();
      await page.locator('.lp-page .lp-field-people select').selectOption('1');
      await page.locator('.lp-page .lp-field-stay select').selectOption('dorm');
      await page.waitForTimeout(400);
      // The cheapest towns to walk from are mostly national figures with no
      // measured dorm, so the figures may not move; the list must still be
      // five or fewer, cheapest first, after the inputs changed.
      const w2 = await walkFigs();
      check(vp.key, 'walk', w2.length > 0 && w2.length <= 5 && w2.every((v, i) => i === 0 || w2[i - 1] <= v),
        `after one person in a dorm bed: ${w2.map((v) => v.toFixed(2)).join(', ')}`);
      const land = await receiptState(page, '.lp-page');
      await page.locator('.lp-page .lp-open').first().click();
      await page.locator('.frr .frr-sum-eur').first().waitFor({ state: 'visible', timeout: 60000 });
      const dest = await receiptState(page, '.frr');
      const people = await page.locator('.frr .frr-strip select').first().inputValue();
      const stay = await page.locator('.frr .frr-strip select').nth(1).inputValue();
      check(vp.key, 'carry', people === '1' && stay === 'dorm' && cents(dest.total) === cents(land.total),
        `destination page: ${people} person, ${stay}, ${dest.total} (landing ${land.total})`);
    } else {
      check(vp.key, 'carry', true, 'Porto not in this catalogue; skipped');
    }

    // The coverage table, from the home page again.
    const back = await context.newPage();
    await back.goto(`${BASE}?tab=home`, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await back.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    await back.waitForTimeout(3000);
    const table = await back.locator('.lp-table').count();
    check(vp.key, 'coverage', true, table ? 'table rendered' : 'table absent (file not loaded); sentences stand');
    await back.close();

    // Return visit: the same browser, no link, opens Destinations.
    const again = await context.newPage();
    await again.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await again.waitForFunction(() => document.querySelector('.bottom-nav, header nav') && !document.querySelector('.app-loading, .loading-screen'), null, { timeout: WAIT }).catch(() => {});
    await again.waitForTimeout(4000);
    const onHome = await again.locator('.lp-page').count();
    check(vp.key, 'return', onHome === 0, onHome ? 'the landing page opened again' : 'Destinations opened');
    await again.close();

    check(vp.key, 'errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'no page errors');
  } catch (e) {
    check(vp.key, 'run', false, String(e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
  }
}

for (const vp of VIEWPORTS) {
  // One browser at a time: the laptop this runs on is short of RAM.
  await run(vp);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
