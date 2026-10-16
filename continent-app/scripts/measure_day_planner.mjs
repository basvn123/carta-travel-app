// T433: the day planner's before and after numbers, one walk per viewport.
//
//   node scripts/measure_day_planner.mjs --url=http://localhost:4260/ --label=after --shots=<dir>
//
// Walks the same day on the old and the new planner (a hotel in Rome, the
// first offered date, no ideas, Build it myself, the first three places with
// a photo, open the day) and measures, per screen:
//   words     words of text in the first screen (what a traveller reads before scrolling)
//   chrome    the share of the screen taken by fixed header, footer and nav
//   targets   tap targets under 44 px (phones only)
//   map       the share of the first screen given to a map
//   figure    whether a euro figure is in the first screen
// and for the walk: taps from the landing to a planned day.
// It drives both markups (the old .day-flow and the new wizard frame), so
// the same walk is measured before and after. Writes <shots>/measure-<label>.json.
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = (argv.url || 'http://localhost:4260/').replace(/\/?$/, '/');
const LABEL = argv.label || 'run';
const OUT = argv.shots || 'shots/measure-day';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { key: 'phone', width: 390, height: 844, mobile: true },
  { key: 'ipad', width: 820, height: 1180, mobile: true },
  { key: 'ipadl', width: 1024, height: 1366, mobile: true },
  { key: 'desk', width: 1440, height: 900, mobile: false },
].filter((v) => !argv.only || v.key === argv.only);

const GEO = [{
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it', city: 'Rome' },
}];

async function facts(page, mobile) {
  return page.evaluate(({ phone }) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
        && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    };
    let words = 0;
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const el = n.parentElement;
      if (!el || !n.textContent.trim()) continue;
      if (el.closest('[aria-hidden="true"], .maplibregl-map, nav, .top-bar, header.app-header, .bottom-nav')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.width === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      words += n.textContent.trim().split(/\s+/).length;
      text += ` ${n.textContent}`;
    }
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
    for (const sel of ['.guide-head', '.guide-foot', '.day-flow-top', '.dayex-tray', '.trip-topcard', '.day-wizard .guide-head']) {
      const el = document.querySelector(sel);
      if (!el || !vis(el) || seen.some((s) => s.contains(el))) continue;
      seen.push(el);
      const r = el.getBoundingClientRect();
      chrome += Math.min(r.bottom, vh) - Math.max(r.top, 0);
    }
    let small = 0;
    if (phone) {
      for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, [role="tab"], [role="radio"]')) {
        if (!vis(el) || el.closest('.maplibregl-map, .maplibregl-ctrl-attrib')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5) small += 1;
      }
    }
    let map = 0;
    for (const el of document.querySelectorAll('.trip-map, .dem-map, .maplibregl-map')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      map = Math.max(map, (w * h) / (vw * vh));
    }
    // T459: photographs in the first screen (the builder's "too many
    // pictures"), and the How cards' empty space: for each fork card, the
    // room between its last piece of content and its own bottom edge.
    let photos = 0;
    for (const img of document.querySelectorAll('.guide-canvas img')) {
      if (!vis(img)) continue;
      const r = img.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 60) photos += 1;
    }
    let forkGap = null;
    const forks = [...document.querySelectorAll('.dayw-fork-card')].filter(vis);
    if (forks.length === 2) {
      const ends = forks.map((card) => {
        let last = card.getBoundingClientRect().top;
        for (const el of card.querySelectorAll('img, span, b, small, p, h2, h3')) {
          const r = el.getBoundingClientRect();
          if (r.height && el.textContent.trim().length + (el.tagName === 'IMG' ? 1 : 0)) last = Math.max(last, r.bottom);
        }
        return card.getBoundingClientRect().bottom - last;
      });
      forkGap = Math.round(Math.abs(ends[0] - ends[1]));
    }
    return {
      words,
      photos,
      forkGap,
      chrome: Math.round((chrome / vh) * 100),
      targets: small,
      map: Math.round(map * 100),
      figure: /€\s?\d/.test(text),
    };
  }, { phone: mobile });
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
      for (const [k, v] of Object.entries({
        'continent.lang.v1': 'en', 'continent.guestMode.v1': '1', 'continent.homeSeen.v1': '1',
        'carta.welcomeSeen': '1', 'continent.onboardingSeen.v1': '1', 'carta.fareNoticeSeen': '1',
      })) localStorage.setItem(k, v);
    } catch { /* storage unavailable */ }
  });
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GEO) }));
  const rows = {};
  let taps = 0;
  const tap = async (loc) => { await loc.first().click(); taps += 1; await page.waitForTimeout(700); };
  const shot = async (name) => {
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${vp.key}.png` });
    rows[name] = await facts(page, vp.mobile);
  };
  const isNew = async () => (await page.locator('.day-wizard').count()) > 0;
  const next = async () => tap(page.locator((await isNew()) ? '.guide-next' : '.day-flow-next:visible'));
  try {
    await page.goto(`${BASE}?tab=day&o=CRL&paymock`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.day-stay-input').waitFor({ timeout: 90000 });
    await shot('start');
    await page.locator('.day-stay-input').fill('Hotel Artemide Rome');
    await tap(page.locator('.day-flow-search .trip-add-btn'));
    await tap(page.locator('.day-stay-result'));
    await next();
    await shot('when');
    if (!(await isNew())) {
      const cell = page.locator('.day-flow-date .cal-day:not(.disabled):not(.outside):not([disabled])');
      if (await cell.count()) await tap(cell.first());
    }
    await next();
    await shot('ideas');
    if (await isNew()) await next();
    else await tap(page.locator('.day-ideas-choice-btn').nth(1));
    await page.waitForTimeout(1200);
    await shot('how');
    await tap(page.locator((await isNew()) ? '.dayw-fork-card .card-open' : '.day-flow-card').nth(1));
    await page.locator('.dayex-card').first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(2500);
    await shot('build');
    const adds = page.locator('.dayex-card .dayex-add');
    for (let i = 0; i < 3; i += 1) await tap(adds.nth(i));
    await shot('build-picked');
    await page.keyboard.press('Escape');
    await tap(page.locator((await isNew()) ? '.guide-next' : '.dayex-tray-open'));
    await page.waitForTimeout(5000);
    await shot('planned');
  } catch (e) {
    rows.error = String(e).split('\n')[0].slice(0, 200);
    await page.screenshot({ path: `${OUT}/${LABEL}-ERROR-${vp.key}.png` }).catch(() => {});
  }
  rows.tapsToPlannedDay = taps;
  await ctx.close();
  return rows;
}

const browser = await chromium.launch();
const out = {};
for (const vp of VIEWS) {
  out[vp.key] = await walk(browser, vp);
  console.log(vp.key, JSON.stringify(out[vp.key]));
}
await browser.close();
writeFileSync(`${OUT}/measure-${LABEL}.json`, JSON.stringify(out, null, 2));
