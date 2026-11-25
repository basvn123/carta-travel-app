// G12 (plan rethink) browser pass: how long the Plan flow takes on an
// emulated phone to a stable rank 1, and how long "Search more" takes, so
// the 4 s minimum loader (planner/finder/FindingTrips.jsx MIN_STAND_MS) is
// judged on browser numbers, not on the node estimate of
// finder_rank1_G12.mjs. An EMULATED phone: a desktop CPU slowed by the CDP
// Emulation.setCPUThrottlingRate, a 390x844 touch viewport and Fast 4G
// (9 Mbps down, 170 ms RTT). Not a real device.
//
// The questions are answered unthrottled; the throttle starts just before
// the tap that asks for the trips, so the time is the request alone. Per
// run it records, from that tap: `allOn` every loader line ticked (the
// pricing done), `shown` the first priced rank 1 on screen, `stable` the
// last change of rank 1 within 5 s after, and Search more's time to its
// rows (the list) or alternatives (the lander).
//
// Build (fast build) and serve it with the data, then
//   node scripts/serve_static.mjs ../.fastbuild <public> 5872
//   node scripts/perf/plan_phone_timing_G12.mjs [base] [--rates 4,6] [--runs 3] [--sets A,B,C,D,L]
// Chromium runs with --disable-web-security: the live flight files sit on
// the data host, which allows only the real origins, and without them every
// flight is "Not yet" and the pricing is lighter than in production.
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://localhost:5872';
const RATES = opt('--rates', '4,6').split(',').map(Number);
const RUNS = Number(opt('--runs', '3'));
const SETS_ON = opt('--sets', 'A,B,C,D,L').split(',');
const FAST4G = { offline: false, latency: 170, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (9 * 1024 * 1024) / 8 };

const STYLES = {
  version: 1, active: 's1',
  list: [{ id: 's1', name: 'Food weekends', who: { kind: 'couple', adults: 2 }, stay: 'hotel3', way: 'plane', ways: ['plane'], priority: 'balance', explore: { shapes: ['towns'], likes: ['food', 'culture'], avoid: ['crowds'], around: 'public' }, days: { mornings: 'slow', pace: 'balanced' } }],
};
const sheet = (page) => page.locator('.pf-sheet');
const month = async (page, name) => {
  await sheet(page).getByText(/In a month or two/).first().click();
  await page.waitForTimeout(250);
  await sheet(page).getByRole('button', { name, exact: true }).first().click();
};
const noBudget = (page) => sheet(page).getByText('No set budget').first().click();
/** The answer sets: real answers, each ending on the tap that asks for the trips. */
const SETS = {
  A: { desc: 'no style, Surprise me, Show the trips now on the first question', at: /booked/, answers: [] },
  B: { desc: 'style (couple, food), May, Show the trips now on From', styles: STYLES, at: /leave from/, answers: [[/^When/, (p) => month(p, 'May')]] },
  C: { desc: 'style (couple, food), any time, Show the trips now on From', styles: STYLES, at: /leave from/, answers: [[/^When/, (p) => sheet(p).getByText('Any time, cheapest wins').first().click()]] },
  D: { desc: 'no style, every question answered (June, beaches), the last Continue', at: /How do you want to plan/, last: true, answers: [[/^When/, (p) => month(p, 'June')], [/up for/, (p) => sheet(p).getByText('Beaches').first().click()], [/budget\?/, noBudget]] },
  L: { desc: 'the lander, "Porto and Lisbon", June, the last Continue', line: 'Porto and Lisbon', at: /How do you want to plan/, last: true, lander: true, answers: [[/^When/, (p) => month(p, 'June')], [/budget\?/, noBudget]] },
};

async function runOnce(rate, key) {
  const set = SETS[key];
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript((st) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      for (const [k, v] of [['continent.lang.v1', 'en'], ['continent.homeSeen.v1', '1'], ['continent.mapGuideDismissed.v1', '1'], ['carta.fareNoticeSeen', '1']]) localStorage.setItem(k, v);
      if (st) localStorage.setItem('carta.travelStyles.v1', JSON.stringify(st));
    }, set.styles || null);
    const cdp = await ctx.newCDPSession(page);
    await page.goto(`${BASE}/?tab=plan`);
    await page.waitForSelector('.pf-door', { timeout: 120000 });
    await page.waitForTimeout(1500);
    if (set.line) { await page.locator('.pf-door').getByText('A place').first().click(); await page.locator('#pf-door-field').fill(set.line); }
    await page.locator('.pf-door .btn-primary').first().click();
    let last = '';
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(300);
      const tt = ((await page.locator('.pf-title').first().textContent({ timeout: 500 }).catch(() => '')) || '').trim();
      if (tt && tt !== last) {
        last = tt;
        const a = set.answers.find(([re]) => re.test(tt));
        if (a) { await a[1](page); await page.waitForTimeout(200); }
      }
      if (tt && set.at.test(tt)) break;
      const btn = page.locator('.pf-foot .btn-primary').first();
      if ((await btn.count()) && !(await btn.isDisabled())) { await btn.click(); continue; }
      const r = sheet(page).locator('[role=radio]').first();
      if (await r.count()) await r.click();
    }
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', FAST4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const tap = set.last ? page.locator('.pf-foot .btn-primary').first() : page.locator('.pf-show-now').first();
    const t0 = await page.evaluate(() => performance.now());
    await tap.click();
    const out = await page.evaluate(async ({ t0, lander }) => {
      const r = { allOn: null, shown: null, rank1: [] };
      const rank1 = () => {
        const c = document.querySelector(lander ? '.tff-tp-price' : '.tff-list .tff-card');
        if (!c) return null;
        const name = lander ? (document.querySelector('main h1')?.textContent || '') : (c.querySelector('.tff-card-name')?.textContent || '');
        return `${name.trim()} ${(c.textContent.match(/€[\d,]+/) || [''])[0]}`;
      };
      let prev = null;
      const start = performance.now();
      while (performance.now() - start < 90000) {
        await new Promise((res) => setTimeout(res, 50));
        const now = performance.now() - t0;
        const lines = document.querySelectorAll('.tff-brief-line');
        if (r.allOn == null && lines.length && [...lines].every((l) => l.classList.contains('is-on'))) r.allOn = Math.round(now);
        const k = rank1();
        if (k && /€\d/.test(k)) {
          if (r.shown == null) r.shown = Math.round(now);
          if (k !== prev) { r.rank1.push([Math.round(now), k]); prev = k; }
          if (now - r.shown > 5000) break;
        }
      }
      return r;
    }, { t0, lander: Boolean(set.lander) });
    out.stable = out.rank1.length ? out.rank1[out.rank1.length - 1][0] : null;
    const more = page.getByRole('button', { name: /search more/i }).first();
    out.more = null;
    if (await more.count()) {
      await more.scrollIntoViewIfNeeded().catch(() => {});
      const m0 = await page.evaluate(() => performance.now());
      await more.click();
      out.more = await page.evaluate(async ({ m0, lander }) => {
        const start = performance.now();
        while (performance.now() - start < 60000) {
          await new Promise((res) => setTimeout(res, 50));
          const sm = document.querySelector('.tff-search-more');
          const done = lander
            ? document.querySelectorAll('section[aria-labelledby="tff-tp-alts"] [data-alt]').length > 0
            : Boolean(sm && sm.querySelector('.tff-row-cards li, .tff-spendref'));
          if (done) return Math.round(performance.now() - m0);
        }
        return null;
      }, { m0, lander: Boolean(set.lander) });
    }
    return out;
  } finally {
    await browser.close();
  }
}

const median = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const worst = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.max(...v) : null; };
console.log('EMULATED phone (desktop CPU throttled), not a real device. ms from the tap that asks for the trips.');
for (const rate of RATES) {
  for (const key of SETS_ON) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await runOnce(rate, key).catch((e) => ({ error: e.message.slice(0, 120) }));
      runs.push(r);
      console.log(JSON.stringify({ rate, set: key, run: i + 1, ...r }));
    }
    const col = (k) => runs.map((r) => r[k]);
    console.log(`${rate}x ${key} (${SETS[key].desc}): pricing done median ${median(col('allOn'))} worst ${worst(col('allOn'))}; rank 1 shown median ${median(col('shown'))} worst ${worst(col('shown'))}; stable median ${median(col('stable'))} worst ${worst(col('stable'))}; Search more median ${median(col('more'))} worst ${worst(col('more'))}`);
  }
}
