/**
 * Roadmap 1.9 (T468): the phone problems the owner sees, measured on every
 * main screen at the visible viewports of the two phones the roadmap names.
 *
 *   iphone13  390 x 664  (an iPhone 13's Safari viewport with its bars)
 *   pixel5    393 x 727  (a Pixel 5's Chrome viewport with its bars)
 *   narrow    380 x 720  (the width where buttons were seen clipped)
 *
 * Per screen it records:
 *   hidden   a primary button that cannot be brought fully into view above
 *            the bottom nav: after scrolling it into view it still ends under
 *            the nav, or something else covers its centre
 *   clipped  a button, tab, chip or tile whose label is cut (wider than its
 *            box, or ended with an ellipsis)
 *   chrome   the share of the screen taken by fixed and sticky bars (the
 *            carta-design floor for a multi-step flow is a quarter)
 *   hscroll  the page scrolls sideways
 *
 * The roadmap's done condition: no hidden primary on the iPhone 13 and the
 * Pixel 5, no clipped button at 380 px, and the trip wizard's chrome at or
 * under a quarter of a Pixel 5. Writes scripts/shots/phone/report.json and a
 * PNG per screen and viewport. Exit code 1 when a condition fails.
 *
 * It does not start a server. Serve the app first (never `npm run dev`,
 * whose predev rewrites public/):
 *   npx vite --port 5210 --strictPort
 *   node scripts/verify_phone_chrome.mjs --port=5210 [--vp=pixel5] [--only=trip-when,day]
 * ?paymock and ?savedmock are dev-server seams.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = `http://${argv.host || 'localhost'}:${argv.port || 5210}/`;
const OUT = 'scripts/shots/phone';
mkdirSync(OUT, { recursive: true });
const ONLY = argv.only ? new Set(String(argv.only).split(',')) : null;

const VIEWPORTS = [
  { key: 'iphone13', width: 390, height: 664, dpr: 3, ua: devices['iPhone 13'].userAgent },
  { key: 'pixel5', width: 393, height: 727, dpr: 2.75, ua: devices['Pixel 5'].userAgent },
  { key: 'narrow', width: 380, height: 720, dpr: 2, ua: devices['Pixel 5'].userAgent },
].filter((v) => !argv.vp || String(argv.vp).split(',').includes(v.key));

const link = (obj) => `1.${deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64url')}`;
const TRIP = link({
  stops: [{ destinationId: 'LJU', nights: 2 }, { destinationId: 'gem:bled', nights: 3 }, { destinationId: 'gem:bohinj', nights: 2 }],
  groupSize: 2, transportPref: 'public', tripStart: '2027-07-03', label: 'Julian Alps',
});
const DAY = link({
  v: 1, label: 'Lake Bled', start: '2027-07-05',
  stay: { lat: 46.3667, lon: 14.1112, label: 'Bled' },
  stops: [{ d: 'gem:bled', n: 1 }], a: { 0: { 0: [4, 2, 36, 34] } },
});
const SEED = [
  ['continent.lang.v1', 'en'], ['continent.homeSeen.v1', '1'], ['continent.guestMode.v1', '1'],
  ['continent.mapGuideDismissed.v1', '1'], ['carta.fareNoticeSeen', '1'], ['carta.welcomeSeen', '1'],
  ['continent.onboardingSeen.v1', '1'], ['carta.mapGuideDone', '1'],
];

/** Everything measured on the screen as it stands. */
async function measure(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const shown = (el) => {
      if (!el.isConnected || el.closest('[aria-hidden="true"], [inert]')) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    // The nav counts only where it is on top: a full-screen page or a sheet
    // that covers it leaves the whole height to the page.
    const nav = document.querySelector('.bottom-nav');
    let navTop = vh;
    if (nav && shown(nav)) {
      const nr = nav.getBoundingClientRect();
      const probe = document.elementFromPoint(Math.round(nr.left + nr.width / 4), Math.round(nr.top + nr.height / 2));
      if (probe && nav.contains(probe)) navTop = nr.top;
    }
    // With a dialog open, only its own primaries are the screen's.
    const modals = [...document.querySelectorAll('[aria-modal="true"]')].filter(shown);
    const scope = modals.length ? modals[modals.length - 1] : document;

    // Primaries that cannot be brought above the nav.
    const hidden = [];
    for (const p of scope.querySelectorAll('.btn-primary')) {
      if (!shown(p) || p.closest('.bottom-nav, .app-header')) continue;
      p.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = p.getBoundingClientRect();
      if (r.right <= 0 || r.left >= vw) continue; // inside a sideways track, off to the side
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
      const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      const covered = !(hit && (hit === p || p.contains(hit)));
      if (r.bottom > navTop + 1 || covered) {
        hidden.push({
          text: (p.innerText || p.getAttribute('aria-label') || '').trim().slice(0, 40),
          bottom: Math.round(r.bottom), navTop: Math.round(navTop),
          by: covered && hit ? (hit.className && String(hit.className).split(' ')[0]) || hit.tagName : '',
        });
      }
    }

    // Labels cut inside their control.
    const clipped = [];
    for (const lab of document.querySelectorAll('.btn-label, .ui-tab, .ui-chip, .ui-tile-label, .bottom-nav-label, .header-nav-label, .plan-chooser-title')) {
      // A search field shows the typed query and may cut it: a field, not a label.
      if (!shown(lab) || lab.closest('.gsearch-trigger, .header-search-slot')) continue;
      const r = lab.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      const cs = getComputedStyle(lab);
      const cut = lab.scrollWidth > lab.clientWidth + 1 && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap');
      if (cut) clipped.push((lab.innerText || '').trim().slice(0, 40));
    }

    // Fixed and sticky chrome.
    let chrome = 0;
    const seen = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;
      if (r.height > vh * 0.6 || r.width < vw * 0.6) continue;
      if (seen.some((s) => s.contains(el))) continue;
      seen.push(el);
      chrome += Math.min(r.bottom, vh) - Math.max(r.top, 0);
    }
    // The wizard's head, recap and foot are flex bands outside its scroller.
    for (const sel of ['.guide-head', '.guide-recap:not(.wiz-recap-inbody)', '.guide-foot', '.guide-estimate-band', '.settings-line']) {
      for (const el of document.querySelectorAll(sel)) {
        if (!shown(el) || seen.some((s) => s.contains(el)) || el.closest('.guide-body, .trip-sheet-scroll')) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh) continue;
        seen.push(el);
        chrome += Math.min(r.bottom, vh) - Math.max(r.top, 0);
      }
    }
    const hs = document.documentElement.scrollWidth > vw + 1;
    return { hidden, clipped: [...new Set(clipped)], chrome: Math.round((chrome / vh) * 100), hscroll: hs };
  });
}

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
    isMobile: true, hasTouch: true, userAgent: vp.ua,
  });
  await ctx.addInitScript((seed) => { try { for (const [k, v] of seed) localStorage.setItem(k, v); } catch { /* none */ } }, SEED);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const open = async (page, path, wait, ms = 2500) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 180000 });
  if (wait) await page.locator(wait).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(ms);
};
const tap = async (page, sel, ms = 1200) => {
  await page.locator(sel).first().click({ timeout: 30000 });
  await page.waitForTimeout(ms);
};

/** The screens, each one opened fresh or reached by a walk. */
const SCREENS = [
  ['destinations', async (p) => open(p, '?tab=places', '.places-tab')],
  ['destination', async (p) => open(p, '#dest=gem%3Abled', '.destp', 4000)],
  ['report-sheet', async (p) => {
    await open(p, '#dest=gem%3Abled', '.destp', 4000);
    await p.locator('.report-link').first().scrollIntoViewIfNeeded();
    await tap(p, '.report-link');
  }],
  // The keyboard up (rows T386-d, T406-d): the page 40 percent shorter, the
  // message typed, Send must still come into view inside the sheet.
  ['report-keyboard', async (p) => {
    await open(p, '#dest=gem%3Abled', '.destp', 4000);
    await p.locator('.report-link').first().scrollIntoViewIfNeeded();
    await tap(p, '.report-link');
    const vs = p.viewportSize();
    await p.setViewportSize({ width: vs.width, height: Math.round(vs.height * 0.6) });
    await p.locator('.report-input').first().click();
    await p.keyboard.type('The price looks old.');
    await p.waitForTimeout(800);
  }],
  ['explore-list', async (p) => open(p, '?tab=map&xe=lake&xa=alps&xm=7', '.bottom-nav', 5000)],
  ['plan-chooser', async (p) => { await open(p, '?tab=places', '.bottom-nav-plus'); await tap(p, '.bottom-nav-plus', 700); }],
  ['lifestyle', async (p) => { await open(p, '?tab=map', '.bottom-nav', 5000); await tap(p, '.settings-part-lifestyle:visible, .lifestyle-btn:visible'); }],
  ['pass', async (p) => { await open(p, '?tab=places', '.shell-pass-btn'); await tap(p, '.shell-pass-btn:visible'); }],
  ['account', async (p) => { await open(p, '?tab=places', '.bottom-nav'); await tap(p, '.bottom-nav .bottom-nav-item >> nth=-1'); }],
  ['mytrips', async (p) => {
    await open(p, '?tab=places&savedmock', '.bottom-nav');
    await p.locator('.bottom-nav-item', { hasText: 'My trips' }).first().click();
    await p.waitForTimeout(2500);
  }],
  ['trip-planned', async (p) => {
    await open(p, `?paymock#trip=${TRIP}`, '.share-trip-actions .guide-next', 3000);
    await tap(p, '.share-trip-actions .guide-next', 6000);
    if (await p.locator('.pass-overlay').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
  }],
  ['day', async (p) => open(p, `?paymock#day=${DAY}`, '.bottom-nav', 9000)],
  ['day-start', async (p) => open(p, '?tab=day', '.bottom-nav', 4000)],
];

/** The trip wizard, walked step by step on one page (measure_trip_planner's walk). */
async function wizard(page, record) {
  const next = async (ms = 1400) => { await page.locator('.guide-next:visible').first().click(); await page.waitForTimeout(ms); };
  await open(page, '?tab=trip&o=CRL&paymock', '.guide-next', 1500);
  await record('trip-booked');
  await page.getByText(/^Nothing yet$/).first().click();
  await next();
  if (await page.locator('.worigin').count() && !(await page.locator('.wwho').count())) { await record('trip-from'); await next(); }
  if (await page.locator('.wwho').count()) { await record('trip-who'); await next(); }
  await page.getByText(/I'm flexible/).first().click();
  await page.locator('.guide-month-grid .guide-chip').nth(1).click().catch(() => {});
  await page.waitForTimeout(300);
  await record('trip-when');
  await next();
  await record('trip-where');
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
  await page.waitForTimeout(800);
  await page.locator('.guide-ccard-pick').first().click();
  await next(2500);
  await page.locator('.wtrip-choose').first().waitFor({ timeout: 45000 });
  await record('trip-pick');
  await page.locator('.wtrip-choose').first().click();
  await page.waitForTimeout(900);
  await next(2500);
  await page.locator('.tleg').first().waitFor({ timeout: 45000 }).catch(() => {});
  await record('trip-getting');
  await next(1800);
  await record('trip-finish');
}

const report = {};
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  report[vp.key] = {};
  const record = (page) => async (name) => {
    if (ONLY && !ONLY.has(name)) return;
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${vp.key}-${name}.png` });
    report[vp.key][name] = await measure(page);
    await page.evaluate(() => { const s = document.scrollingElement; if (s) s.scrollTop = 0; });
  };
  for (const [name, go] of SCREENS) {
    if (ONLY && !ONLY.has(name)) continue;
    const { ctx, page, errors } = await newPage(browser, vp);
    try {
      await go(page);
      await record(page)(name);
      if (errors.length) report[vp.key][name].errors = errors.slice(0, 2);
    } catch (e) {
      report[vp.key][name] = { error: String(e).split('\n')[0].slice(0, 160) };
    }
    await ctx.close();
  }
  if (!ONLY || [...ONLY].some((n) => n.startsWith('trip-') && n !== 'trip-planned')) {
    const { ctx, page } = await newPage(browser, vp);
    try { await wizard(page, record(page)); } catch (e) { report[vp.key]['trip-walk'] = { error: String(e).split('\n')[0].slice(0, 160) }; }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

let failed = 0;
for (const [vk, screens] of Object.entries(report)) {
  for (const [name, r] of Object.entries(screens)) {
    if (r.error) { console.log(`ERROR ${vk.padEnd(9)} ${name.padEnd(14)} ${r.error}`); failed += 1; continue; }
    const bad = [];
    if (vk !== 'narrow' && r.hidden.length) bad.push(`hidden: ${r.hidden.map((h) => `${h.text} (${h.bottom}/${h.navTop}${h.by ? ` by ${h.by}` : ''})`).join('; ')}`);
    if (vk === 'narrow' && r.clipped.length) bad.push(`clipped: ${r.clipped.join(' | ')}`);
    if (vk === 'pixel5' && name.startsWith('trip-') && name !== 'trip-planned' && r.chrome > 25) bad.push(`chrome ${r.chrome}% > 25%`);
    if (r.hscroll) bad.push('sideways scroll');
    console.log(`${bad.length ? 'FAIL ' : 'PASS '} ${vk.padEnd(9)} ${name.padEnd(14)} chrome ${String(r.chrome).padStart(3)}%  ${bad.join('  ')}`);
    if (bad.length) failed += 1;
  }
}
console.log(`\n${failed ? `${failed} screen(s) failed` : 'all screens passed'}; report in ${OUT}/report.json`);
process.exit(failed ? 1 : 0);
