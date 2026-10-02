// React render-cost meter for the two planners (T192).
//
//   node scripts/measure-planner-renders.mjs --url=http://127.0.0.1:5209/ [--runs=3] [--out=file.json]
//
// It installs a bare React DevTools hook before the app loads, which switches
// the dev build's fiber tree into ProfileMode, so every commit carries an
// actualDuration. On each commit the hook sums the root's render time and
// counts which components performed work. The same scripted walk is then
// driven through the trip wizard, the planned trip's editor and the day
// builder, and the totals are printed per phase. Run it on two commits and
// the difference is the render cost that moved. Numbers are wall-clock, so
// take the median of a few runs and compare on the same machine.
//
// Data and auth come through the ?*mock seams (lib/e2eSeams.js), Nominatim is
// intercepted, nothing is written anywhere.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = (argv.url || 'http://127.0.0.1:5209/').replace(/\/?$/, '/');
const RUNS = Number(argv.runs || 3);
const WATCH = ['TripPlannerTab', 'GuidedTripWizard', 'DayPlannerTab', 'TripMap', 'CityPickerMap', 'DayExploreMap'];

const GEO = [{
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it' },
}];

// Runs in the page before any script: the hook React looks for on boot.
const installHook = () => {
  const PerformedWork = 1;
  const stats = { commits: 0, renderMs: 0, longTaskMs: 0, pinsBuilt: 0, byName: {} };
  // TripMap clears and rebuilds every stop pin each time it redraws, so the
  // number of .trip-pin-shape elements added is an exact count of redraw work,
  // where the long-task total is wall-clock and swings with the GPU.
  const countPins = (node) => {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('trip-pin-shape')) stats.pinsBuilt += 1;
    stats.pinsBuilt += node.querySelectorAll('.trip-pin-shape').length;
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(countPins);
  }).observe(document, { childList: true, subtree: true });
  // Main-thread blocks of 50 ms or more, whatever caused them: this is where
  // effect work (a MapLibre redraw, a refit) shows up, which React's own
  // render timings never include.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) stats.longTaskMs += e.duration;
    }).observe({ type: 'longtask', buffered: false });
  } catch { /* no longtask support */ }
  const nameOf = (f) => {
    const t = f.type;
    if (typeof t === 'function') return t.displayName || t.name || null;
    if (t && typeof t === 'object') {
      if (t.$$typeof === Symbol.for('react.memo')) { const i = t.type; return (i && (i.displayName || i.name)) || null; }
      if (t.$$typeof === Symbol.for('react.forward_ref')) return (t.render && t.render.name) || null;
    }
    return null;
  };
  // A fiber that did no work this commit keeps its flags and timings from
  // the last time it rendered, so "rendered now" is a PerformedWork flag AND
  // a start time later than the previous commit.
  let lastCommit = 0;
  const walk = (root) => {
    let f = root;
    while (f) {
      if ((f.flags & PerformedWork) && f.actualStartTime > lastCommit) {
        const n = nameOf(f);
        if (n) {
          const row = stats.byName[n] || (stats.byName[n] = { renders: 0, ms: 0 });
          row.renders += 1;
          row.ms += f.actualDuration || 0;
        }
      }
      if (f.child) { f = f.child; continue; }
      while (f && !f.sibling) { f = f.return; if (f === root) { f = null; break; } }
      if (f) f = f.sibling;
    }
  };
  window.__rr = stats;
  window.__rrReset = () => { stats.commits = 0; stats.renderMs = 0; stats.longTaskMs = 0; stats.pinsBuilt = 0; stats.byName = {}; };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(), supportsFiber: true, isDisabled: false,
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
    onCommitFiberRoot(_id, root) {
      stats.commits += 1;
      stats.renderMs += root.current.actualDuration || 0;
      walk(root.current);
      lastCommit = performance.now();
    },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
    on() {}, off() {}, emit() {}, sub() { return () => {}; },
  };
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
};

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(installHook);
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GEO),
  }));
  return { ctx, page };
}

const settle = (page, ms = 400) => page.waitForTimeout(ms);
const snap = async (page, label, into) => {
  const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__rr)));
  await page.evaluate(() => window.__rrReset());
  into[label] = s;
};
const guideNext = async (page) => { await page.locator('.guide-next:visible').first().click(); await settle(page, 900); };
const clickText = async (page, re) => {
  const loc = page.getByText(re).first();
  if (await loc.isVisible().catch(() => false)) { await loc.click(); await settle(page, 300); }
};
const bump = async (page, sel, times) => {
  for (let i = 0; i < times; i += 1) {
    await page.locator(sel).last().click();
    await page.waitForTimeout(80);
  }
  await settle(page, 300);
};

async function tripRun(browser, out) {
  const { ctx, page } = await newPage(browser);
  try {
    await page.goto(`${BASE}?tab=trip&o=CRL&paymock`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.locator('.guide-next').first().waitFor({ timeout: 240000 });
    await settle(page, 1500);
    await page.evaluate(() => window.__rrReset());

    // Booked, From, When: ten nights bumps on the When step re-render the
    // whole wizard each time, which is where unstable memo inputs show up.
    await clickText(page, /^Nothing yet$/);
    await guideNext(page);
    await page.locator('.guide-airport-chip, .guide-origin-home-card').first().waitFor({ timeout: 30000 }).catch(() => {});
    await guideNext(page);
    await clickText(page, /I'm flexible/);
    await bump(page, '.guide-people-lg button', 10);
    const month = page.locator('.guide-month-grid .guide-chip').nth(1);
    if (await month.count()) await month.click();
    await settle(page, 300);
    await snap(page, 'wizard-when', out);

    // Where by hand, then the trips shelf, then the getting-there and finish
    // steps through to the planned view.
    await guideNext(page);
    await page.locator('.guide-wtabs [role="tab"]').first().waitFor({ timeout: 30000 });
    await page.locator('.guide-wtabs [role="tab"]').nth(0).click();
    await settle(page, 500);
    for (const label of [/^Hidden gems$/, /^Hiking$/]) {
      const chip = page.locator('.wq-chip').filter({ hasText: label }).first();
      if (await chip.count()) await chip.click(); else await page.locator('.wq-chip').first().click();
      await page.waitForTimeout(200);
    }
    await page.locator('.wq-next').click().catch(() => {});
    await settle(page, 400);
    await clickText(page, /^Shoestring$/);
    await clickText(page, /Fly in, then trains/);
    await clickText(page, /Anywhere in Europe/);
    await clickText(page, /^A few stops$/);
    await page.locator('.mcard').first().waitFor({ timeout: 30000 }).catch(() => {});
    await settle(page, 800);
    await snap(page, 'wizard-quiz', out);
    await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
    await settle(page, 800);
    await page.locator('.guide-ccard-pick').first().click();
    await settle(page, 600);
    await snap(page, 'wizard-where', out);
    await guideNext(page);
    // Ten nights bumps can leave no ready-made trip of that exact length in
    // the picked country; widen to any length so the walk always has trips.
    await page.locator('.wtrip, .guide-empty, button:has-text("Show any length")').first().waitFor({ timeout: 45000 }).catch(() => {});
    await clickText(page, /^Show any length$/);
    await page.locator('.wtrip').first().waitFor({ timeout: 45000 });
    await settle(page, 1200);
    await page.locator('.wtrip-choose').first().click();
    await settle(page, 900);
    await snap(page, 'wizard-trips', out);
    await guideNext(page);
    await page.locator('.tleg-head').first().waitFor({ timeout: 45000 }).catch(() => {});
    await settle(page, 1500);
    await guideNext(page);
    await page.locator('.guide-summary-title, .guide-summary-fact').first().waitFor({ timeout: 30000 }).catch(() => {});
    await settle(page, 800);
    await snap(page, 'wizard-finish', out);
    await guideNext(page);
    await settle(page, 2500);
    if (await page.locator('.pass-overlay').count()) { await page.keyboard.press('Escape'); await settle(page, 500); }
    await page.locator('.trip-planday-btn, .trip-sheet').first().waitFor({ timeout: 30000 }).catch(() => {});
    await settle(page, 1200);
    await snap(page, 'planned-view', out);

    // The planned trip's own editor: select each stop, then ten nights bumps
    // on the first stop, each of which reprices the whole itinerary.
    await page.locator('.trip-edit-btn').first().click();
    await settle(page, 900);
    const stops = page.locator('.trip-stop-wrap');
    const n = Math.min(await stops.count(), 4);
    for (let i = 0; i < n; i += 1) { await stops.nth(i).click(); await settle(page, 250); }
    await bump(page, '.trip-stops .trip-stop-wrap:first-child .trip-step-btn', 10);
    await snap(page, 'planned-edit', out);
  } catch (e) {
    out.tripError = String(e).split('\n')[0].slice(0, 200);
  }
  await ctx.close();
}

async function dayRun(browser, out) {
  const { ctx, page } = await newPage(browser);
  try {
    await page.goto(`${BASE}?tab=day&o=CRL&paymock`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.locator('.day-flow-search input').waitFor({ timeout: 240000 });
    await settle(page, 1000);
    await page.evaluate(() => window.__rrReset());
    await page.locator('.day-flow-search input').fill('Hotel Artemide Rome');
    await page.locator('.day-flow-search .trip-add-btn').click();
    await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
    await page.locator('.day-stay-result').first().click();
    await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
    await page.locator('.day-flow-next').first().click();
    await settle(page, 900);
    await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
    const cells = page.locator('.day-flow-date .cal-day:not(.disabled):not(.outside):not([aria-disabled="true"]):not([disabled])');
    if (await cells.count() > 3) await cells.nth(3).click();
    await settle(page, 300);
    await page.locator('.day-flow-next').first().click();
    await settle(page, 900);
    await page.locator('.day-ideas-choice-btn').first().waitFor({ timeout: 30000 });
    await page.locator('.day-ideas-choice-btn').nth(1).click();
    await page.locator('.day-flow-card').first().waitFor({ timeout: 30000 });
    await page.locator('.day-flow-card').nth(1).click();
    await page.locator('.dayex-card').first().waitFor({ timeout: 45000 });
    await settle(page, 2500);
    await snap(page, 'day-flow', out);

    // The builder: add five places one by one; every add re-renders the
    // workspace with a longer day, then the tray opens.
    for (let i = 0; i < 5; i += 1) {
      const add = page.locator('.dayex-add').first();
      if (!(await add.count())) break;
      await add.click({ timeout: 15000 });
      await settle(page, 500);
    }
    await page.locator('.dayex-tray-summary').first().click().catch(() => {});
    await settle(page, 900);
    await snap(page, 'day-build', out);
  } catch (e) {
    out.dayError = String(e).split('\n')[0].slice(0, 200);
  }
  await ctx.close();
}

const browser = await chromium.launch();
const runs = [];
try {
  for (let i = 0; i < RUNS; i += 1) {
    const out = {};
    await tripRun(browser, out);
    await dayRun(browser, out);
    runs.push(out);
    const line = Object.entries(out).map(([k, v]) => (v && v.commits != null ? `${k} ${v.commits}c ${v.renderMs.toFixed(0)}ms lt${v.longTaskMs.toFixed(0)} pins${v.pinsBuilt}` : `${k}: ${v}`));
    console.log(`run ${i + 1}: ${line.join(' | ')}`);
  }
} finally {
  await browser.close();
}

// Median per phase, plus the watched components' render counts and inclusive ms.
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const phases = [...new Set(runs.flatMap((r) => Object.keys(r).filter((k) => r[k] && r[k].commits != null)))];
const summary = {};
for (const p of phases) {
  const rows = runs.map((r) => r[p]).filter(Boolean);
  summary[p] = {
    commits: median(rows.map((r) => r.commits)),
    renderMs: median(rows.map((r) => r.renderMs)),
    longTaskMs: median(rows.map((r) => r.longTaskMs || 0)),
    pinsBuilt: median(rows.map((r) => r.pinsBuilt || 0)),
    components: Object.fromEntries(WATCH.map((c) => [c, {
      renders: median(rows.map((r) => r.byName[c]?.renders || 0)),
      ms: median(rows.map((r) => r.byName[c]?.ms || 0)),
    }])),
  };
}
console.log('\nphase            commits  renderMs  longTask  pins   ' + WATCH.map((w) => w.padEnd(18)).join(''));
for (const [p, s] of Object.entries(summary)) {
  const comps = WATCH.map((w) => `${s.components[w].renders}r/${s.components[w].ms.toFixed(0)}ms`.padEnd(18)).join('');
  console.log(`${p.padEnd(16)} ${String(s.commits).padStart(7)}  ${s.renderMs.toFixed(0).padStart(8)}  ${s.longTaskMs.toFixed(0).padStart(8)}  ${String(s.pinsBuilt).padStart(4)}   ${comps}`);
}
if (argv.out) writeFileSync(argv.out, JSON.stringify({ base: BASE, runs, summary }, null, 2));
