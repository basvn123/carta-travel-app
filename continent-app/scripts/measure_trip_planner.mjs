// T432: the trip planner's before and after numbers, one walk per viewport.
//
//   node scripts/measure_trip_planner.mjs --url=http://localhost:4240/ --label=after --shots=<dir>
//
// Walks the same trip on the old and the new planner (Nothing booked, from
// the default origin, flexible week, the first country by hand, the first
// published trip, no fares typed) and measures, per screen:
//   words     words of text in the first screen (what a traveller reads before scrolling)
//   chrome    the share of a phone screen taken by fixed header, footer and nav
//   width     the share of a 1440 px screen the step's content column uses
//   targets   tap targets under 44 px on the phone
// and for the trip: the price on the last wizard step, the price the planned
// trip opens on, and the share of the phone's first screen given to the map.
// Writes <shots>/measure-<label>.json and one PNG per screen.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = (argv.url || 'http://localhost:4240/').replace(/\/?$/, '/');
const LABEL = argv.label || 'run';
const OUT = argv.shots || 'shots/measure';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { key: 'phone', width: 390, height: 844, mobile: true },
  { key: 'desk1440', width: 1440, height: 900, mobile: false },
];

const euro = (s) => {
  const m = String(s || '').replace(/\s/g, '').match(/[\d.,]+\d/);
  if (!m) return null;
  let t = m[0];
  if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  return Number(t);
};

async function facts(page, mobile) {
  return page.evaluate(({ mobile: phone }) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
        && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    };
    // Words a traveller sees before scrolling.
    let words = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const el = n.parentElement;
      if (!el || !n.textContent.trim()) continue;
      if (el.closest('[aria-hidden="true"], .maplibregl-map, nav, .top-bar, header')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.width === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      words += n.textContent.trim().split(/\s+/).length;
    }
    // Fixed chrome: what stays on screen when the content scrolls.
    let chrome = 0;
    const seen = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height > vh * 0.6 || r.width < vw * 0.6) continue;
      if (seen.some((s) => s.contains(el))) continue;
      seen.push(el);
      chrome += Math.min(r.bottom, vh) - Math.max(r.top, 0);
    }
    // The wizard's step header and footer are flex bands, not fixed.
    for (const sel of ['.guide-head', '.guide-recap:not(.wiz-recap-inbody)', '.guide-foot', '.guide-estimate-band', '.settings-line', '.trip-topcard', '.trip-sheet-footer']) {
      const el = document.querySelector(sel);
      if (!el || !vis(el) || seen.some((s) => s.contains(el))) continue;
      const scroller = el.closest('.guide-body, .trip-sheet-scroll');
      if (scroller) continue;
      const page = document.querySelector('.trip-planner-screen.is-page .trip-sheet');
      if (page && page.contains(el) && sel === '.trip-topcard') continue;
      const r = el.getBoundingClientRect();
      chrome += Math.min(r.bottom, vh) - Math.max(r.top, 0);
    }
    // The step's content column.
    const col = document.querySelector('.wiz-main, .guide-canvas, .trip-sheet');
    const width = col ? col.getBoundingClientRect().width : 0;
    // Tap targets under 44 px (phone only).
    let small = 0;
    if (phone) {
      for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), [role="tab"], [role="radio"]')) {
        if (!vis(el) || el.closest('.maplibregl-map')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) small += 1;
      }
    }
    // The map's share of the first screen.
    let map = 0;
    for (const el of document.querySelectorAll('.trip-map')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      map = Math.max(map, (w * h) / (vw * vh));
    }
    return {
      words,
      chrome: Math.round((chrome / vh) * 100),
      width: Math.round((width / vw) * 100),
      targets: small,
      map: Math.round(map * 100),
    };
  }, { mobile });
}

async function walk(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile ? devices['iPhone 13'].userAgent : undefined,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  const rows = {};
  const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${vp.key}.png` });
    rows[name] = await facts(page, vp.mobile);
  };
  const next = async (ms = 1300) => {
    await page.locator('.guide-next:visible').first().click();
    await page.waitForTimeout(ms);
  };
  const out = { viewport: vp.key, screens: rows };
  try {
    await page.goto(`${BASE}?tab=trip&o=CRL&paymock`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.guide-next').first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);
    await shot('booked');
    await page.getByText(/^Nothing yet$/).first().click();
    await next();
    await shot('from');
    await next();
    if (await page.locator('.wwho').count()) { await shot('who'); await next(); }
    await page.getByText(/I'm flexible/).first().click();
    await page.locator('.guide-month-grid .guide-chip').nth(1).click().catch(() => {});
    await page.waitForTimeout(300);
    await shot('when');
    await next();
    await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
    await page.waitForTimeout(800);
    await page.locator('.guide-ccard-pick').first().click();
    await next(2500);
    await page.locator('.wtrip-choose').first().waitFor({ timeout: 45000 });
    await page.locator('.wtrip-choose').first().click();
    await page.waitForTimeout(900);
    await next(2500);
    await page.locator('.tleg').first().waitFor({ timeout: 45000 }).catch(() => {});
    await shot('getting');
    await next(1800);
    await shot('finish');
    const finishText = await page.locator('.plan-total-n:visible, .plan-total-btn-n:visible, .guide-summary-cost .guide-estimate-total b, .guide-estimate-figure b').first().textContent().catch(() => '');
    out.priceFinish = euro(finishText);
    await page.locator('.guide-next:visible').first().click();
    await page.waitForTimeout(3500);
    if (await page.locator('.pass-overlay').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    await shot('planned');
    const overText = await page.locator('.plan-total-n:visible, .itin-total-figs strong').first().textContent().catch(() => '');
    out.pricePlanned = euro(overText);
  } catch (e) {
    out.error = String(e).split('\n')[0].slice(0, 200);
  }
  await ctx.close();
  return out;
}

const browser = await chromium.launch();
const results = [];
for (const vp of VIEWS) {
  const r = await walk(browser, vp);
  results.push(r);
  console.log(`${vp.key}: finish ${r.priceFinish} planned ${r.pricePlanned}${r.error ? `  ERROR ${r.error}` : ''}`);
  for (const [name, f] of Object.entries(r.screens)) {
    console.log(`  ${name.padEnd(8)} words ${String(f.words).padStart(4)}  chrome ${String(f.chrome).padStart(3)}%  width ${String(f.width).padStart(3)}%  small ${f.targets}  map ${f.map}%`);
  }
}
await browser.close();
writeFileSync(`${OUT}/measure-${LABEL}.json`, JSON.stringify(results, null, 2));
