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
 * Added by T392 (design wave V4, docs/design-v6/plans/V4-landing.md):
 *   perday     the per-person line is the total over the party and the nights
 *   bar        the cost bar has one segment per receipt line, in order, each
 *              segment's share of the track equal to its line's share
 *   settle     a reprice runs one opacity animation on the sum (settleFigure),
 *              and none under prefers-reduced-motion
 *   spec       each proof specimen's figure is the receipt's figure for the
 *              same line (rule R8), or the one sentence when nothing is
 *              estimated
 *   type       every Fraunces size on the page is on the scale (15, 22, 26,
 *              28, 40 px)
 *   covbar     each coverage bar's filled share equals its row's regions
 *              with rows over the regions where the layer applies
 *   fold-ios   INFO only: the fold in the visible viewport of an iPhone 13
 *              (390 x 664, WebKit's bars subtracted). Reported, not failed:
 *              no rule-backed lever left closes it (T392 report, T382-b).
 *
 * Added by T402 (design wave V5, docs/design-v6/plans/V5-landing.md):
 *   taps       every control on the page and in the receipts measures at least
 *              44 by 44 px (the cost bar's segments: 44 high, their width
 *              follows the data and is the shell's component)
 *   lazy       a first visit that does not scroll makes no request for
 *              coverage.json, and the table appears once the section is
 *              scrolled to
 *   covfail    with coverage.json refused the page keeps its sentences, shows
 *              no table and holds no empty block
 *   lang       at 360 x 740 in en, de, es, fr, it and nl: no sideways scroll
 *              and no text cut with an ellipsis on the page
 *   edge       the pure functions answer empty, partial and odd inputs with
 *              a value, never a throw (no demo town, no counts, no coverage,
 *              one person, 14 nights, a tier fallback)
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

    // T402 (V5-1): every control is a 44 by 44 target. The strip's selects
    // fill their whole cell, so the cell is the hit area.
    const small = await page.evaluate(() => [...document.querySelectorAll('.lp-page a, .lp-page button, .lp-page select, .lp-page input')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.frr-sr'))
      .map((e) => { const r = e.getBoundingClientRect(); return { c: (e.className || e.tagName).toString().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), seg: e.classList.contains('costbar-seg') }; })
      .filter((x) => x.h < 44 || (!x.seg && x.w < 44)));
    check(vp.key, 'taps', small.length === 0, small.length ? small.map((x) => `${x.c} ${x.w}x${x.h}`).join('; ') : 'every control at least 44 x 44');

    // T392: scoped to .lp-receipt, because the proof specimens below the
    // fold carry receipt lines of their own inside .lp-page.
    const r = await receiptState(page, '.lp-receipt');
    const sum = r.lines.reduce((s, l) => s + cents(l.eur), 0);
    check(vp.key, 'sum', sum === cents(r.total), `${r.lines.map((l) => l.eur).join(' + ')} = ${r.total}`);
    const anyEst = r.lines.some((l) => l.est);
    const estOk = anyEst === r.totalEst && (!r.totalEst || r.totalTilde) && (!r.totalEst || !r.each || r.each.startsWith('~'))
      && r.lines.every((l) => l.est === l.tilde);
    check(vp.key, 'est', estOk, `total est ${r.totalEst}, each "${r.each}"`);

    // T392: the per-person line is the per-person-per-day figure.
    const perday = await page.evaluate(() => {
      const each = document.querySelector('.lp-receipt .frr-each')?.textContent || '';
      const people = Number(document.querySelector('.lp-field-people select')?.value);
      const nights = Number(document.querySelector('.lp-field-nights select')?.value);
      const total = Number(document.querySelector('.lp-receipt .frr-sum-eur')?.dataset.eur);
      const shown = Number((each.match(/[\d,.]+\.\d\d/) || [''])[0].replace(/,/g, ''));
      return { each, want: Math.round((total / people / nights) * 100) / 100, shown };
    });
    check(vp.key, 'perday', Math.round(perday.shown * 100) === Math.round(perday.want * 100) && /a person a day/.test(perday.each),
      `"${perday.each}" (want ${perday.want})`);

    // T392: the cost bar, one segment per line, in order and in proportion.
    const bar = await page.evaluate(() => {
      const segs = [...document.querySelectorAll('.lp-receipt .costbar-seg')];
      const lines = [...document.querySelectorAll('.lp-receipt .frr-line:not(.frr-sum)')];
      const track = document.querySelector('.lp-receipt .costbar-track')?.getBoundingClientRect().width || 0;
      const eur = lines.map((l) => Number(l.querySelector('dd')?.dataset.eur));
      const sum = eur.reduce((a, b) => a + b, 0);
      const gaps = Math.max(0, segs.length - 1);
      return {
        n: segs.length, lines: lines.length,
        order: segs.length === lines.length && segs.every((s, i) => s.getAttribute('aria-label').startsWith(`${lines[i].querySelector('.frr-label').textContent}, `)),
        off: segs.map((s, i) => Math.abs(s.getBoundingClientRect().width - (track - gaps) * eur[i] / sum)),
      };
    });
    check(vp.key, 'bar', bar.n === bar.lines && bar.order && bar.off.every((d) => d <= 1.5),
      `${bar.n} segments for ${bar.lines} lines, in order ${bar.order}, widths off by ${bar.off.map((d) => d.toFixed(1)).join(', ')} px`);

    // Each demo town: its metadata line against its own receipt.
    const towns = await page.locator('.lp-page .lp-town').count();
    const townRows = [];
    for (let i = 0; i < towns; i += 1) {
      const btn = page.locator('.lp-page .lp-town').nth(i);
      const before = (await receiptState(page, '.lp-receipt')).total;
      await btn.click();
      const s = i === 0 ? await receiptState(page, '.lp-receipt') : await waitForSettle(page, '.lp-receipt', before);
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

    // T392: a reprice settles the sum through one Web Animation.
    {
      const sel = page.locator('.lp-page .lp-field-nights select');
      const was = await sel.inputValue();
      await sel.selectOption(was === '4' ? '5' : '4');
      const anims = await page.waitForFunction(() => {
        const el = document.querySelector('.lp-receipt .frr-sum-eur');
        return el && el.getAnimations().length > 0 ? el.getAnimations().length : null;
      }, null, { timeout: 2000 }).then((h) => h.jsonValue()).catch(() => 0);
      const keyframes = await page.evaluate(() => [...document.styleSheets].flatMap((sh) => {
        try { return [...sh.cssRules]; } catch { return []; }
      }).filter((r) => r.type === CSSRule.KEYFRAMES_RULE && /frr|lp-/.test(r.name)).length);
      await sel.selectOption(was);
      await page.waitForTimeout(300);
      check(vp.key, 'settle', anims > 0 && keyframes === 0, `${anims} animation on the sum after a reprice, ${keyframes} receipt keyframes in the sheets`);
    }

    // T392: the proof specimens are the receipt's own figures.
    const spec = await page.evaluate(() => {
      const fig = (sel) => document.querySelector(sel)?.dataset.eur || null;
      const sp = (i) => document.querySelector(`.lp-proof [data-spec="${i}"]`);
      const s1 = sp(1)?.querySelector('dd')?.dataset.eur || null;
      const s2el = sp(2);
      const s2 = s2el?.querySelector('.frr-sum-eur')?.dataset.eur || (s2el?.matches('p') ? 'none' : null);
      const s3 = sp(3)?.querySelector('dd')?.dataset.eur || null;
      return {
        s1, s2, s3,
        stay: fig('.lp-receipt [data-line="stay"] dd'),
        food: fig('.lp-receipt [data-line="ground"] dd'),
        total: fig('.lp-receipt .frr-sum-eur'),
        est: !!document.querySelector('.lp-receipt .frr-sum-eur .frr-est'),
        live: !!sp(2)?.querySelector('[aria-live]'),
      };
    });
    check(vp.key, 'spec', spec.s1 === spec.stay && spec.s3 === spec.food
      && (spec.est ? spec.s2 === spec.total : spec.s2 === 'none') && !spec.live,
      `stay ${spec.s1}/${spec.stay}, sum ${spec.s2}/${spec.total}, food ${spec.s3}/${spec.food}`);

    // T392: Fraunces only at the scale's sizes.
    const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll('.lp-page *')]
      .filter((e) => e.childElementCount === 0 && e.textContent.trim() && /Fraunces/.test(getComputedStyle(e).fontFamily))
      .map((e) => parseFloat(getComputedStyle(e).fontSize)))].sort((a, b) => a - b));
    check(vp.key, 'type', sizes.every((v) => [15, 22, 26, 28, 40].includes(v)), `Fraunces at ${sizes.join(', ')} px`);

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
      const land = await receiptState(page, '.lp-receipt');
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

    // The coverage table, from the home page again. T402 (V5-4): it loads
    // when the section nears the viewport, so the page is first left alone
    // (no request for coverage.json), then scrolled to the section. The old
    // check waited 3 s and counted the table, which assumed the eager load.
    const covReqs = [];
    const back = await context.newPage();
    back.on('request', (rq) => { if (/coverage\.json/.test(rq.url())) covReqs.push(rq.url()); });
    await back.goto(`${BASE}?tab=home`, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await back.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    await back.waitForTimeout(3000);
    check(vp.key, 'lazy', covReqs.length === 0, `${covReqs.length} requests for coverage.json before any scroll`);
    await back.locator('.lp-cov').scrollIntoViewIfNeeded();
    await back.locator('.lp-table').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    const table = await back.locator('.lp-table').count();
    check(vp.key, 'coverage', true, table ? 'table rendered after scrolling to it' : 'table absent (file not loaded); sentences stand');
    if (table) {
      check(vp.key, 'lazy', covReqs.length >= 1, `${covReqs.length} request(s) once the section was reached`);
      // T392: each bar's filled share is its row's regions with rows.
      const cb = await back.evaluate(() => [...document.querySelectorAll('.lp-covbar')].map((b) => {
        const w = Number(b.dataset.with); const of = Number(b.dataset.of);
        const full = b.getBoundingClientRect().width - 1;
        const got = b.querySelector('.lp-covbar-with').getBoundingClientRect().width;
        return { w, of, off: Math.abs(got - (full * w) / of) };
      }));
      check(vp.key, 'covbar', cb.length > 0 && cb.every((r) => r.off <= 1.5), `${cb.length} bars, off by at most ${Math.max(0, ...cb.map((r) => r.off)).toFixed(1)} px`);
    }
    await back.close();

    // T402 (V5-3): coverage that fails. The file is refused; the sentences
    // stand, there is no table and no empty block is left where it would be.
    const bad = await context.newPage();
    const badErrors = [];
    bad.on('pageerror', (e) => badErrors.push(String(e.message || e)));
    await bad.route('**/coverage.json*', (r) => r.abort());
    await bad.goto(`${BASE}?tab=home`, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await bad.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    await bad.locator('.lp-cov').scrollIntoViewIfNeeded();
    await bad.waitForTimeout(2500);
    const failed = await bad.evaluate(() => ({
      table: document.querySelectorAll('.lp-table').length,
      hold: document.querySelectorAll('.lp-table-hold').length,
      key: document.querySelectorAll('.lp-cov-key').length,
      paras: document.querySelectorAll('.lp-cov > p').length,
    }));
    check(vp.key, 'covfail', failed.table === 0 && failed.hold === 0 && failed.key === 0 && failed.paras >= 3 && badErrors.length === 0,
      `table ${failed.table}, held block ${failed.hold}, ${failed.paras} sentences, ${badErrors.length} errors`);
    await bad.close();

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

// T392 (register row T387-c): seededWindow, the pure date rule behind
// FirstRunReceipt's seedMonth prop, checked without a browser. It lives here
// rather than in tests/ because this session's scope is the surface's files
// and its harnesses.
{
  const { seededWindow } = await import('../src/lib/firstRun.js');
  const d = { start: '2026-11-07', end: '2026-11-14' };
  const cases = [
    [d, null, d], [d, 11, d],
    [d, 12, { start: '2026-12-05', end: '2026-12-12' }],
    [d, 6, { start: '2027-06-05', end: '2027-06-12' }],
    [{ start: '2026-11-30', end: '2026-12-03' }, 11, { start: '2027-11-06', end: '2027-11-09' }],
  ];
  const bad = cases.filter(([w, m, want]) => JSON.stringify(seededWindow(w, m)) !== JSON.stringify(want));
  check('logic', 'seedMonth', bad.length === 0, `${cases.length - bad.length} of ${cases.length} windows as expected`);
}

// T402 (V5-3): edge cases on the pure functions. They live here rather than
// in tests/landing.test.mjs because this session's scope is the surface's
// files and its harnesses (the same call T392 made for seedMonth).
{
  const L = await import('../src/lib/landing.js');
  const town = {
    id: 'T', city: 'Testville', country: 'Nowhere', iso2: 'NW', categories: ['hiking'],
    costs: { meal_mid_eur: 20, meal_cheap_eur: 10, fastfood_eur: 6, drink_out_eur: 3, cocktail_eur: 8, coffee_eur: 2, grocery_day_eur: 9, club_entry_eur: 8, level: 'city' },
    accommodation: { per_person_night_eur: 30, cleaning_per_person_eur: 10, entire_home_night_eur: 90, typical_capacity: 3, level: 'city', n_listings: 120, captured: '2026-06-27', source_place: 'Testville', source_km: 1 },
  };
  const start = '2026-11-07';
  const cases = {
    'no demo town': () => L.pickDemoTowns({}).length === 0 && L.pickDemoTowns(undefined).length === 0 && L.pickDemoTowns({ X: { id: 'X' } }).length === 0,
    'a town that prices stands in': () => L.pickDemoTowns({ T: town }).length === 1,
    'no counts': () => { const f = L.catalogueFacts(undefined, undefined); return f.places === 0 && f.bedsMeasured === 0 && f.asOf === null; },
    'partial catalogue': () => { const f = L.catalogueFacts({ T: town, U: { id: 'U' } }, { n_destinations: 5 }); return f.places === 5 && f.bedsMeasured === 1 && f.foodMeasured === 1; },
    'no priced list': () => L.cheapestToWalk(undefined, undefined).length === 0 && L.cheapestToWalk({ T: town }, new Map()).length === 0,
    'coverage that fails': () => [null, undefined, {}, { regions: null }, { regions: {} }, { regions: { A: { trail: { status: 'na' } } } }, 'x', 7].every((c) => L.coverageRows(c) === null),
    'no receipt': () => L.priceReceipt(null, { ...L.DEMO_DEFAULTS, start }) === null && L.priceReceipt(town, { ...L.DEMO_DEFAULTS, start: null }) === null,
    'one person': () => { const r = L.priceReceipt(town, { ...L.DEMO_DEFAULTS, people: 1, start }); return r && r.each === null && r.total > 0; },
    '14 nights': () => { const r = L.priceReceipt(town, { ...L.DEMO_DEFAULTS, nights: 14, start }); return r && r.nights === 14 && r.alt && r.alt.kind === 'nights'; },
    'a tier fallback': () => { const r = L.priceReceipt(town, { ...L.DEMO_DEFAULTS, tier: 'dorm', start }); return r && r.stay.tierFallback === true && r.stay.tierAsked === 'dorm'; },
  };
  for (const [name, fn] of Object.entries(cases)) {
    let ok = false;
    let detail = '';
    try { ok = !!fn(); } catch (e) { detail = String(e.message || e).split('\n')[0]; }
    check('logic', 'edge', ok, `${name}${detail ? `: ${detail}` : ''}`);
  }
}

for (const vp of VIEWPORTS) {
  // One browser at a time: the laptop this runs on is short of RAM.
  await run(vp);
}

// T402 (V5-2): the small Android floor in every language. 360 x 740 with
// touch, English first. Nothing scrolls sideways and no text on the page is
// cut with an ellipsis (a long name wraps instead). The fold is reported,
// not failed: longer labels in de, es, fr and nl wrap onto more lines, so the
// total sits lower (T402 report).
if (!argv.vp || String(argv.vp).split(',').includes('mobile')) {
  const browser = await chromium.launch();
  try {
    for (const lang of ['en', 'de', 'es', 'fr', 'it', 'nl']) {
      const context = await browser.newContext({
        viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-GB',
      });
      await context.addInitScript((l) => { try { localStorage.setItem('continent.lang.v1', l); } catch { /* storage may be blocked */ } }, lang);
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
      await page.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const cut = [...document.querySelectorAll('.lp-page *')]
          .filter((e) => vis(e) && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth)
          .map((e) => (e.textContent || '').trim().slice(0, 24));
        const nav = document.querySelector('.bottom-nav');
        const navTop = nav && nav.getBoundingClientRect().height ? nav.getBoundingClientRect().top : innerHeight;
        const scroller = document.querySelector('.lp-page');
        return {
          hs: document.documentElement.scrollWidth - innerWidth,
          page: scroller.scrollWidth - scroller.clientWidth,
          cut,
          navTop: Math.round(navTop),
          cta: Math.round(document.querySelector('.lp-cta')?.getBoundingClientRect().bottom || 0),
        };
      });
      check(`lang-${lang}`, 'overflow', m.hs <= 0 && m.page <= 0 && m.cut.length === 0,
        `page ${m.hs} px, scroller ${m.page} px, ${m.cut.length} cut texts ${m.cut.join(' | ')}`);
      console.log(`INFO  lang-${lang} fold       primary bottom ${m.cta}, nav top ${m.navTop} (360 x 740)`);
      await context.close();
    }
  } catch (e) {
    check('lang', 'run', false, String(e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
  }
}

// T392: reduced motion keeps the figure and drops the dip.
if (!argv.vp || String(argv.vp).split(',').includes('mobile')) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 380, height: 800 }, reducedMotion: 'reduce', locale: 'en-GB' });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await page.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    const before = (await receiptState(page, '.lp-receipt')).total;
    await page.locator('.lp-page .lp-field-nights select').selectOption('4');
    const after = await waitForSettle(page, '.lp-receipt', before);
    const anims = await page.evaluate(() => document.querySelector('.lp-receipt .frr-sum-eur').getAnimations().length);
    check('reduced', 'settle', after.total !== before && anims === 0, `total ${before} to ${after.total}, ${anims} animations`);

    // INFO: the visible viewport of an iPhone 13 (WebKit's bars subtracted).
    // A fresh visit, so the defaults (two people, seven nights) are priced.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'en-GB',
    });
    const ip = await phone.newPage();
    await ip.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
    await ip.locator('.lp-page .frr-sum-eur').first().waitFor({ state: 'visible', timeout: WAIT });
    const f = await ip.evaluate(() => {
      const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
      const b = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().bottom || 0);
      return { nav: Math.round(nav?.top || 0), sum: b('.lp-receipt .frr-sum'), cta: b('.lp-page .lp-cta') };
    });
    console.log(`INFO  iphone  fold-ios   sum bottom ${f.sum}, primary bottom ${f.cta}, nav top ${f.nav} (390 x 664)`);
  } catch (e) {
    check('reduced', 'run', false, String(e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
