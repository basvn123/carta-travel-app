/**
 * The quality-floor audit (T193, brought into the repo by T186). It drives the
 * app headless at 380 by 800 (touch, phone user agent) and 1280 by 850 through
 * Explore, the trip planner, the day planner, the Destinations tab, the
 * journey and itinerary pages, the destination and region pages, the five
 * detail pages (trail, cycling, beach, lake, mountain), My trips, the account
 * hub and the legal text, and on every screen records what the carta-design
 * quality floor and spec 5.7 ask for:
 *
 *   hscroll      the page scrolls sideways
 *   h1, skips    not exactly one visible h1; a heading level skipped
 *   small        a control under 44 px on either side (a negative-inset
 *                ::before counts as the tap box; header and bottom-nav chrome
 *                and the map's transparent pin layer are left out, and so
 *                is a link inside a sentence, as WCAG exempts it)
 *   primaries    more than one --accent filled control in the view
 *   contrast     text under 4.5:1 against its first opaque ground (3:1 for
 *                large text; text on photographs skipped). Each entry is
 *                tagged [token] when it is one of the three token pairs the
 *                owner decides (T193-b) and [usage] otherwise
 *   monoEyebrow  uppercase mono with letters; monoProse: three words in mono
 *                (contrast, the mono checks and --ink-mute include the header
 *                and bottom nav; T193's run left that chrome out)
 *   fakeControls a pointer cursor nothing can focus, an <a> without href, or a
 *                role="button" or role="link" on something that is not one
 *   motion       with prefers-reduced-motion: reduce emulated, an element that
 *                still runs a CSS animation or transition longer than 10 ms
 *   serifSmall   the display serif below 18 px (it is for display sizes only)
 *   gradients    a gradient background outside the map
 *   inkMute      --ink-mute text outside 12 to 14 px (metadata size only)
 *   longBlocks, loadingText, errors   as before
 *
 * It does not start a server. Build and serve first, then point it at the port:
 *   npx vite build && npx vite preview --port 5206 --strictPort
 *   node scripts/verify_quality_floor.mjs <label> --port=5206 --out=<dir outside the repo>
 * Options: --only=explore,trip,day,pages,detail   --vp=mobile,desktop
 * The JSON lands in <out>/<label>/audit.json, screenshots beside it. Exit code
 * 1 when a floor check fails: horizontal scroll, h1 or heading order, more
 * than one primary, a phone target under 44 px, a mono eyebrow, a fake
 * control, motion under reduced motion, a small serif, a gradient, or a
 * [usage] contrast failure. [token] contrast failures and desktop targets
 * are reported but do not fail the run until the owner rules on T193-b and
 * T335-b; pass --strict to fail on them too.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LABEL = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'run';
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = `http://127.0.0.1:${argv.port || 5206}/`;
const OUT = path.join(argv.out || path.resolve('quality-floor-audit'), LABEL);
const VIEWPORTS = [
  { key: 'mobile', width: 380, height: 800, mobile: true },
  { key: 'desktop', width: 1280, height: 850, mobile: false },
].filter((v) => !argv.vp || argv.vp.split(',').includes(v.key));
const FLOWS = ['explore', 'trip', 'day', 'pages', 'detail'].filter((f) => !argv.only || argv.only.split(',').includes(f));

const report = [];
let consoleErrors = [];

async function audit(page, vp, flow, name) {
  const dir = `${OUT}/${vp.key}`;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/${flow}-${name}.png` });
  // Motion first, under an emulated reduced-motion preference: every element
  // in view that still carries a running CSS animation or a transition longer
  // than 10 ms. The preference is put back before the other checks.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const motion = await page.evaluate(() => {
    const secs = (v) => Math.max(...String(v).split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s) || 0)));
    const cls = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}`;
    const out = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.maplibregl-map')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (cs.animationName !== 'none' && secs(cs.animationDuration) > 0.01) out.add(`${cls(el)} animation ${cs.animationName}`);
      else if (cs.transitionProperty !== 'none' && secs(cs.transitionDuration) > 0.01) out.add(`${cls(el)} transition ${cs.transitionProperty.slice(0, 30)}`);
    }
    return [...out];
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const facts = await page.evaluate(() => {
    const doc = document.documentElement;
    const vis = (el) => {
      if (!el.isConnected) return false;
      if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight * 3 && r.right > 0 && r.left < innerWidth; };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || el.className || el.tagName)
      .toString().replace(/\s+/g, ' ').trim().slice(0, 40);
    const cls = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}`;
    const layers = [...document.querySelectorAll('[role="dialog"], .fsheet, .sheet-shell, .pass-overlay, .auth-modal, .saved-trips-panel, .account-shell')].filter(vis);
    const scope = layers.length ? layers[layers.length - 1] : document.body;
    const chrome = (el) => !!el.closest('.app-header, .bottom-nav');
    const targets = [...scope.querySelectorAll('button, a[href], [role="button"], input, select, [role="tab"], [role="option"], summary')]
      .filter(vis).filter(onScreen).filter((el) => !el.closest('.maplibregl-ctrl-attrib'));
    const tapRect = (el) => {
      const lab = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
      const r = (lab || el).getBoundingClientRect();
      const ps = getComputedStyle(el, '::before');
      if (ps.content === 'none' || ps.position !== 'absolute') return r;
      const px = (v) => (v.endsWith('px') ? Math.min(0, parseFloat(v)) : 0);
      return { width: r.width - px(ps.left) - px(ps.right), height: r.height - px(ps.top) - px(ps.bottom) };
    };
    // the transparent pin buttons over a map are sized to the pin by design (T190)
    const pinLayer = (el) => getComputedStyle(el).pointerEvents === 'none';
    // A link inside a sentence (a photo credit, a source) takes the line's
    // height; WCAG's target-size rules exempt inline links, and so does this.
    const inlineLink = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline'
      && [...el.parentElement.childNodes].some((n) => n !== el && n.nodeType === 3 && n.textContent.trim());
    const small = targets.filter((el) => !chrome(el) && !pinLayer(el) && !inlineLink(el))
      .map((el) => ({ el, r: tapRect(el) }))
      .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
      .map(({ el, r }) => `${label(el)} [${Math.round(r.width)}x${Math.round(r.height)}] <${cls(el)}>`);
    // rgb()/rgba(), and the color(srgb r g b / a) form Chrome computes for
    // color-mix(), whose channels run 0 to 1.
    const rgb = (s) => {
      const n = (s.match(/[\d.]+/g) || []).map(Number);
      if (!/^color\(srgb/.test(s)) return n;
      return [n[0] * 255, n[1] * 255, n[2] * 255, ...(n.length > 3 ? [n[3]] : [])].map((v, i) => (i < 3 ? Math.round(v) : v));
    };
    const ACC = ['224,90,71', '207,76,58', '176,67,26', '179,73,27'];
    const primaries = targets.filter((el) => !chrome(el)).filter((el) => {
      const c = rgb(getComputedStyle(el).backgroundColor);
      return c.length >= 3 && (c[3] === undefined || c[3] > 0.5) && ACC.includes(c.slice(0, 3).join(','));
    }).map((el) => `${label(el)} <${cls(el)}>`);
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis);
    const h1 = hs.filter((h) => h.tagName === 'H1').length;
    const skips = []; let prev = 0;
    for (const h of hs) { const n = Number(h.tagName[1]); if (prev && n > prev + 1) skips.push(`${h.tagName} after H${prev}: ${label(h)}`); prev = n; }
    const textEls = [...scope.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)).filter(vis).filter(onScreen);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    // Text laid over a photograph: an <img>, <picture> or <canvas> in a near
    // ancestor that sits under the text's box. Its ground is the photo, which
    // this check cannot read, so it is skipped like a background image.
    const overPhoto = (el) => {
      const r = el.getBoundingClientRect();
      let e = el.parentElement;
      for (let i = 0; e && i < 5; i += 1, e = e.parentElement) {
        for (const m of e.querySelectorAll('img, picture, canvas')) {
          if (m.contains(el)) continue;
          const q = m.getBoundingClientRect();
          if (q.left <= r.left + 1 && q.right >= r.right - 1 && q.top <= r.top + 1 && q.bottom >= r.bottom - 1) return true;
        }
      }
      return false;
    };
    const bgOf = (el) => {
      if (overPhoto(el)) return null;
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
        if (e.tagName === 'IMG' || e.tagName === 'CANVAS') return null;
        const c = rgb(cs.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c.slice(0, 3);
      }
      return [248, 246, 240];
    };
    const contrast = []; const monoEyebrow = []; const monoProse = []; const longBlocks = []; const loadingText = [];
    const inkMute = []; const serifSmall = []; const sansNumbers = [];
    for (const el of textEls) {
      if (el.closest('.maplibregl-ctrl-attrib, .maplibregl-canvas-container, .sr-only')) continue;
      const cs = getComputedStyle(el);
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const bg = bgOf(el);
      const fg = rgb(cs.color);
      if (bg && fg.length >= 3 && (fg[3] === undefined || fg[3] > 0.9)) {
        const L1 = lum(fg.slice(0, 3)); const L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
        const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
        if (ratio < need) {
          // The three pairs that are token decisions (T193-b): --ink-mute as
          // text, --accent (or its hover) as text, white on an --accent fill.
          const f = fg.slice(0, 3).join(','); const b = bg.join(',');
          const token = f === '125,131,147' || ACC.includes(f) || (f === '255,255,255' && ACC.includes(b));
          contrast.push(`[${token ? 'token' : 'usage'}] ${cls(el)} ${ratio.toFixed(2)} rgb(${f}) on rgb(${b}) "${own.slice(0, 24)}"`);
        }
        if (fg.slice(0, 3).join(',') === '125,131,147') {
          const size = parseFloat(cs.fontSize);
          if (size < 11.5 || size > 14.5) inkMute.push(`${cls(el)} ${size}px "${own.slice(0, 24)}"`);
        }
      }
      // The serif is for display headings and destination names (DESIGN.md,
      // T198). Running text, a control or anything under 13 px set in it is
      // out of role.
      if (/Fraunces/i.test(cs.fontFamily.split(',')[0]) && !chrome(el)
        && (parseFloat(cs.fontSize) < 13 || el.matches('p, li, dd, td, label, input, textarea, button, a[href]'))) serifSmall.push(`${cls(el)} ${cs.fontSize} "${own.slice(0, 24)}"`);
      if (/JetBrains/i.test(cs.fontFamily)) {
        if (cs.textTransform === 'uppercase' && /[a-z]{3}/i.test(own)) monoEyebrow.push(`${cls(el)} "${own.slice(0, 30)}"`);
        else if ((own.match(/[a-zA-Z\u00C0-\u024F]{3,}/g) || []).length >= 3) monoProse.push(`${cls(el)} "${own.slice(0, 40)}"`);
      }
      // A bare figure (a price, a count, a distance) set in the sans without
      // tabular figures. Reported, not gated: whether it sits in a column is
      // a reading the script cannot make.
      if (/^[€$£]?\s?\d[\d.,:\s]*\s?(€|%|km|m|h|min|°C?)?$/.test(own) && !/JetBrains/i.test(cs.fontFamily)
        && !/tabular-nums/.test(cs.fontVariantNumeric)) sansNumbers.push(`${cls(el)} "${own.slice(0, 16)}"`);
      if (/^loading\b/i.test(own)) loadingText.push(`${cls(el)} "${own.slice(0, 30)}"`);
    }
    for (const el of [...scope.querySelectorAll('p, li, dd, blockquote')].filter(vis).filter(onScreen)) {
      const w = (el.innerText || '').trim().split(/\s+/).filter(Boolean).length;
      if (w > 60) longBlocks.push(`${cls(el)} ${w}w`);
    }
    // Real <a> and real <button>: what a pointer can use but nothing can
    // focus (only the outermost such element counts), an <a> with no href,
    // and a button or link role on an element that is not one.
    const F = 'a[href],button,input,select,textarea,summary,label,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
    const fakeControls = [];
    for (const el of scope.querySelectorAll('*')) {
      if (!vis(el) || !onScreen(el) || chrome(el) || el.closest('.maplibregl-map')) continue;
      const cs = getComputedStyle(el);
      if (el.matches('a:not([href])') && (el.onclick || cs.cursor === 'pointer')) { fakeControls.push(`a without href: ${label(el)} <${cls(el)}>`); continue; }
      if (el.matches('[role="button"]:not(button), [role="link"]:not(a)') && !el.matches('label, summary')) { fakeControls.push(`role=${el.getAttribute('role')}: ${label(el)} <${cls(el)}>`); continue; }
      if (cs.cursor !== 'pointer' || el.closest(F) || el.querySelector(F)) continue;
      const par = el.parentElement;
      if (par && getComputedStyle(par).cursor === 'pointer' && !par.closest(F)) continue;
      fakeControls.push(`pointer only: ${label(el)} <${cls(el)}>`);
    }
    const gradients = [...scope.querySelectorAll('*')].filter(vis).filter(onScreen)
      .filter((el) => !el.closest('.maplibregl-map') && /gradient\(/.test(getComputedStyle(el).backgroundImage))
      .map((el) => `${cls(el)}`);
    const uniq = (a) => [...new Set(a)];
    return {
      hscroll: doc.scrollWidth - innerWidth,
      h1, skips: uniq(skips),
      small: uniq(small), primaries: uniq(primaries),
      contrast: uniq(contrast), monoEyebrow: uniq(monoEyebrow), monoProse: uniq(monoProse),
      longBlocks: uniq(longBlocks), loadingText: uniq(loadingText),
      fakeControls: uniq(fakeControls), gradients: uniq(gradients), inkMute: uniq(inkMute), serifSmall: uniq(serifSmall), sansNumbers: uniq(sansNumbers),
    };
  });
  const errs = [...new Set(consoleErrors)];
  consoleErrors = [];
  const row = { viewport: vp.key, flow, name, ...facts, motion, errors: errs };
  report.push(row);
  const tok = facts.contrast.filter((c) => c.startsWith('[token]')).length;
  console.log(`  ${vp.key}/${flow}-${name}: hs=${facts.hscroll} h1=${facts.h1} skips=${facts.skips.length} small=${facts.small.length} prim=${facts.primaries.length} contrast=${facts.contrast.length - tok}+${tok}tok eyebrow=${facts.monoEyebrow.length} monoProse=${facts.monoProse.length} fake=${facts.fakeControls.length} motion=${motion.length} serif=${facts.serifSmall.length} grad=${facts.gradients.length} mute=${facts.inkMute.length} long=${facts.longBlocks.length} loading=${facts.loadingText.length} err=${errs.length}`);
  return row;
}

// ── fixtures ──────────────────────────────────────────────────────────────
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|entrypoint_config|config is not valid/i;
const GEO = [{
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it' },
}];
const PLAN = {
  summary: 'A morning in ancient Rome, lunch in Monti, then the fountains and the Pantheon after the crowds thin.',
  stops: [
    { external: true, name: 'Colosseum', lat: 41.8902, lon: 12.4922, arrive: '09:30', dwellMin: 90, why: 'Book the first slot: by eleven the queue wraps the building.', walkMinFromPrev: 0 },
    { external: true, name: 'Roman Forum', lat: 41.8925, lon: 12.4853, arrive: '11:15', dwellMin: 75, why: 'Same ticket as the Colosseum, and the shade is better before noon.', walkMinFromPrev: 8 },
    { external: true, name: 'Monti, lunch', lat: 41.8946, lon: 12.4913, arrive: '12:45', dwellMin: 60, why: 'Trattorias here still price for locals.', walkMinFromPrev: 10 },
    { external: true, name: 'Trevi Fountain', lat: 41.9009, lon: 12.4833, arrive: '14:15', dwellMin: 30, why: 'Quietest in the early afternoon.', walkMinFromPrev: 14 },
    { external: true, name: 'Pantheon', lat: 41.8986, lon: 12.4769, arrive: '15:00', dwellMin: 45, why: 'Free to enter, and the light through the oculus is best mid-afternoon.', walkMinFromPrev: 9 },
  ],
  totals: { walkKm: 4.6, endTime: '16:00' },
};

// ── helpers ───────────────────────────────────────────────────────────────
const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
});

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile ? devices['iPhone 13'].userAgent : undefined,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  await seed(page);
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push('console: ' + m.text().slice(0, 160));
  });
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GEO),
  }));
  await page.route('**/functions/v1/plan-day**', async (r) => {
    await new Promise((res) => setTimeout(res, 1200));
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) });
  });
  return { ctx, page };
}

const open = async (page, url) => {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);
};
const click = async (page, sel, ms = 700) => {
  const loc = page.locator(sel).first();
  await loc.waitFor({ timeout: 30000 });
  await loc.click();
  await page.waitForTimeout(ms);
};
const clickText = async (page, re, ms = 500) => {
  const loc = page.getByText(re).first();
  if (await loc.isVisible().catch(() => false)) { await loc.click(); await page.waitForTimeout(ms); return true; }
  console.log(`    (no control matching ${re})`);
  return false;
};
const dismissPass = async (page) => {
  if (!(await page.locator('.pass-overlay').count())) return;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.pass-overlay').count()) {
    await page.locator('.pass-overlay .pass-close, .pass-overlay [aria-label*="lose" i]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
};
const guideNext = async (page, ms = 1300) => {
  await page.locator('.guide-next:visible').first().click();
  await page.waitForTimeout(ms);
};

// ── the trip planner ──────────────────────────────────────────────────────
async function tripFlow(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  const shot = (name) => audit(page, vp, 'trip', name);
  try {
    await open(page, '?tab=trip&o=CRL&paymock');
    await page.locator('.guide-next').first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);

    // 1 Booked
    await shot('01-booked');
    await clickText(page, /^Nothing yet$/);
    await guideNext(page);

    // 2 From
    await page.locator('.guide-airport-chip, .guide-origin-home-card').first().waitFor({ timeout: 30000 }).catch(() => {});
    await shot('02-from');
    await guideNext(page);

    // 3 When: flexible, 7 nights, a month
    await clickText(page, /I'm flexible/);
    for (let i = 0; i < 25; i += 1) {
      const cur = (await page.locator('.guide-people-lg span').first().textContent().catch(() => '0')).trim();
      const k = Number(cur.match(/\d+/)?.[0] || 0);
      if (k === 7 || !k) break;
      await page.locator('.guide-people-lg button').nth(k < 7 ? 1 : 0).click();
      await page.waitForTimeout(60);
    }
    const month = page.locator('.guide-month-grid .guide-chip').nth(1);
    if (await month.count()) await month.click();
    await page.waitForTimeout(300);
    await shot('03-when');
    await guideNext(page);

    // 4 Where: the quiz tab, answered
    await page.locator('.guide-wtabs [role="tab"]').first().waitFor({ timeout: 30000 });
    await page.locator('.guide-wtabs [role="tab"]').nth(0).click();
    await page.waitForTimeout(500);
    for (const label of [/^Hidden gems$/, /^Hiking$/]) {
      const chip = page.locator('.wq-chip').filter({ hasText: label }).first();
      if (await chip.count()) await chip.click(); else await page.locator('.wq-chip').first().click();
      await page.waitForTimeout(200);
    }
    await page.locator('.wq-next').click().catch(() => {});
    await page.waitForTimeout(400);
    await clickText(page, /^Shoestring$/);
    await clickText(page, /Fly in, then trains/);
    await clickText(page, /Anywhere in Europe/);
    await clickText(page, /^A few stops$/);
    await page.locator('.mcard').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot('04-where-quiz');

    // the country brief, opened from the first recommendation
    if (await page.locator('.mcard-info').count()) {
      await click(page, '.mcard-info', 1500);
      await page.locator('.cbrief, .cbrief-close').first().waitFor({ timeout: 30000 }).catch(() => {});
      await shot('05-where-brief');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      if (await page.locator('.cbrief-close:visible').count()) {
        await page.locator('.cbrief-close:visible').first().click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    // the pick-by-hand tab
    await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
    await page.waitForTimeout(800);
    await shot('06-where-hand');
    await click(page, '.guide-ccard-pick', 600);
    await guideNext(page, 2500);

    // 5 Trips
    await page.locator('.wtrip').first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(1200);
    await shot('07-trips');

    // the trip page, opened from a card
    await click(page, '.wtrip-what', 1500);
    await page.locator('.tpage-back').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot('08-trip-page');
    await page.locator('.tpage-back').first().click();
    await page.waitForTimeout(700);

    await click(page, '.wtrip-choose', 900);
    await guideNext(page, 2500);

    // 6 Getting there
    await page.locator('.tleg-head').first().waitFor({ timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('09-getting-there');
    await guideNext(page, 1800);

    // 7 Finish
    await page.locator('.guide-summary-title, .guide-summary-fact').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot('10-finish');

    // the planned view
    await guideNext(page, 3500);
    await dismissPass(page);
    await page.locator('.trip-planday-btn, .trip-sheet').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot('11-planned');
  } catch (e) {
    console.log(`  ERROR trip/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'trip', name: 'aborted', error: String(e).slice(0, 300) });
    await page.screenshot({ path: `${OUT}/${vp.key}/trip-ERROR.png` }).catch(() => {});
  }
  await ctx.close();
}

// ── the day planner ───────────────────────────────────────────────────────
const answerStay = async (page) => {
  await page.locator('.day-flow-search input').fill('Hotel Artemide Rome');
  await page.locator('.day-flow-search .trip-add-btn').click();
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  await page.locator('.day-stay-result').first().click();
  await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
};
const pickDate = async (page) => {
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  const cells = page.locator('.day-flow-date .cal-day:not(.disabled):not(.outside):not([aria-disabled="true"]):not([disabled])');
  if (await cells.count() > 3) await cells.nth(3).click();
  await page.waitForTimeout(300);
};
const addIdea = async (page, q) => {
  const input = page.locator('.day-ideas-input');
  await input.fill(q);
  await page.locator('.day-ideas-row').first().waitFor({ timeout: 30000 });
  await page.locator('.day-ideas-row').first().click();
  await page.waitForTimeout(400);
};
const walkBot = async (page, stopAt) => {
  for (let guard = 0; guard < 30; guard += 1) {
    if (await page.locator('.rbs, .chat-result').count()) return;
    const prog = (await page.locator('.chat-progress').textContent().catch(() => '')).trim();
    if (stopAt && new RegExp(`^\\D*${stopAt}\\b`).test(prog)) return;
    const send = page.locator('.chat-send:visible').first();
    const town = page.locator('.chat-town-picker .chat-opt').first();
    const opt = page.locator('.chat-body .chat-opt:visible').first();
    if (await page.locator('.chat-free-final').count()) await page.locator('.chat-free-final .chat-send').click();
    else if (await town.count()) await town.click();
    else if (await page.locator('.chat-opts-multi').count()) {
      const first = page.locator('.chat-opts-multi .chat-opt').first();
      if (await first.count() && !(await page.locator('.chat-opts-multi .chat-opt.on').count())) await first.click();
      await send.click();
    } else if (await opt.count()) await opt.click();
    await page.waitForTimeout(350);
  }
};

async function dayFlow(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  const shot = (name) => audit(page, vp, 'day', name);
  try {
    await open(page, '?tab=day&o=CRL&paymock&savedmock');
    await page.locator('.day-flow-search input').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1000);

    // 1 Start point
    await shot('01-start');

    // the Continue-a-trip sheet
    if (await page.locator('.dtcard').count()) {
      await click(page, '.dtcard', 900);
      await page.locator('.dtday-sheet').waitFor({ timeout: 15000 }).catch(() => {});
      await shot('02-continue-sheet');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else console.log('    (no Continue-a-trip card rendered)');

    await answerStay(page);
    await click(page, '.day-flow-next', 900);

    // 2 When
    await pickDate(page);
    await shot('03-when');
    await click(page, '.day-flow-next', 900);

    // 3 Ideas, yes, with two of them
    await page.locator('.day-ideas-choice-btn').first().waitFor({ timeout: 30000 });
    await page.locator('.day-ideas-choice-btn').first().click();
    await page.waitForTimeout(500);
    await addIdea(page, 'Colosseum');
    await page.locator('.day-ideas-clear').click().catch(() => {});
    await addIdea(page, 'Pantheon');
    await page.waitForTimeout(500);
    await shot('04-ideas');
    await click(page, '.day-ideas-body .day-flow-next', 900);

    // 4 How
    await page.locator('.day-flow-card').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await shot('05-how');

    // the bot, at its third question, then its answer
    await click(page, '.day-flow-card.primary', 1200);
    await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
    await walkBot(page, 3);
    await page.waitForTimeout(400);
    await shot('06-bot-q3');
    // The bot's answer needs a signed-in account (T193-d): audit it when it
    // comes, and say so when it does not, without failing the run.
    await walkBot(page, 0);
    if (await page.locator('.chat-result').waitFor({ timeout: 15000 }).then(() => true, () => false)) {
      await page.waitForTimeout(2500);
      await shot('07-bot-result');
    } else console.log('    (the bot result needs an account; not audited)');
  } catch (e) {
    console.log(`  ERROR day/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'day', name: 'aborted', error: String(e).slice(0, 300) });
    await page.screenshot({ path: `${OUT}/${vp.key}/day-ERROR.png` }).catch(() => {});
  }
  await ctx.close();

  // Build it myself: a fresh page, the quick answers, then the builder.
  const b = await newPage(browser, vp);
  const bshot = (name) => audit(b.page, vp, 'day', name);
  try {
    await open(b.page, '?tab=day&o=CRL&paymock');
    await b.page.locator('.day-flow-search input').waitFor({ timeout: 90000 });
    await answerStay(b.page);
    await click(b.page, '.day-flow-next', 900);
    await pickDate(b.page);
    await click(b.page, '.day-flow-next', 900);
    await b.page.locator('.day-ideas-choice-btn').first().waitFor({ timeout: 30000 });
    await b.page.locator('.day-ideas-choice-btn').nth(1).click();
    await b.page.locator('.day-flow-card').first().waitFor({ timeout: 30000 });
    await b.page.locator('.day-flow-card').nth(1).click();
    await b.page.locator('.dayex-card').first().waitFor({ timeout: 45000 });
    await b.page.waitForTimeout(2500);
    await bshot('08-build-list');
    await b.page.locator('.dayex-add').first().click({ timeout: 15000 });
    await b.page.waitForTimeout(400);
    const viewSwitch = b.page.locator('.dayex-view button').nth(1);
    if (await viewSwitch.isVisible().catch(() => false)) {
      await viewSwitch.click();
      await b.page.waitForTimeout(3000);
      await bshot('09-build-map');
      await b.page.locator('.dayex-view button').nth(0).click();
      await b.page.waitForTimeout(600);
    } else {
      // Desktop keeps the map beside the list; the list shot already has it.
      await b.page.waitForTimeout(2000);
      await bshot('09-build-map');
    }
    await click(b.page, '.dayex-tray-summary', 900);
    await bshot('10-build-tray');
  } catch (e) {
    console.log(`  ERROR builder/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'day', name: 'builder-aborted', error: String(e).slice(0, 300) });
    await b.page.screenshot({ path: `${OUT}/${vp.key}/day-builder-ERROR.png` }).catch(() => {});
  }
  await b.ctx.close();
}

// ── explore ──
async function exploreFlow(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  const shot = (name) => audit(page, vp, 'explore', name);
  try {
    await open(page, '?tab=map');
    await page.locator('.xcard, .railcard').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(2500);
    await shot('01-idle');
    await open(page, '?tab=map&xk=village');
    await page.locator('.xcard').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    await shot('02-filtered');
    const info = page.locator('.xcard-info:visible').first();
    if (await info.count()) { await info.click(); await page.waitForTimeout(700); await shot('03-preview'); await page.keyboard.press('Escape'); }
    await open(page, '?tab=map&xw=map');
    await page.locator('.maplibregl-canvas').first().waitFor({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await shot('04-map');
    if (vp.mobile) {
      await open(page, '?tab=map');
      await page.locator('.places-filter-btn:visible').first().waitFor({ timeout: 120000 });
      await page.locator('.places-filter-btn:visible').first().click();
      await page.waitForTimeout(900);
      await shot('05-filters');
    }
  } catch (e) {
    console.log(`  ERROR explore/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'explore', name: 'aborted', error: String(e).slice(0, 300) });
  }
  await ctx.close();
}

// ── the remaining surfaces (T186): one fresh page per screen ──
// Each step opens itself and returns false when the surface did not render.
const FOLDS = 'button.dsec-toggle[aria-expanded="false"], button.tday-more[aria-expanded="false"], button.jpage-lrow-btn[aria-expanded="false"]';
const visible = (page, sel) => page.locator(sel).locator('visible=true').first();
const PAGES = {
  'dest-list': async (page) => { await open(page, ''); await page.locator('.places-ccard').first().waitFor({ timeout: 120000 }); await page.waitForTimeout(1500); },
  'dest-trails': async (page) => {
    await open(page, '');
    await page.locator('.places-ccard').first().waitFor({ timeout: 120000 });
    await visible(page, '.side-cat:has-text("Trails"), .places-cat:has-text("Trails")').click();
    await page.waitForTimeout(3000);
  },
  journey: async (page) => {
    await open(page, '');
    await visible(page, '.jstyle-card:has-text("Cycling")').click({ timeout: 120000 });
    await page.waitForTimeout(1500);
    await visible(page, '.jcard').click();
    await page.locator('.jpage-hook, .jpage').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
  },
  itinerary: async (page) => {
    await open(page, '#itin=at-salzburg-vienna-chain-6d');
    await page.locator('.itin-route, .tpage, .jpage').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(2500);
  },
  destination: async (page) => {
    await open(page, '?tab=map');
    await page.locator('.xcard').first().waitFor({ timeout: 120000 });
    await visible(page, '.xcard-hit').click();
    await page.locator('.destp-grid').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(3000);
  },
  region: async (page) => {
    await open(page, '#region=COAST:BE-BELGIAN-COAST');
    await page.waitForTimeout(6000);
  },
  saved: async (page) => {
    await open(page, '?savedmock');
    await page.locator('.places-ccard, .app').first().waitFor({ timeout: 120000 });
    // The desktop header says Saved trips, the phone's bottom nav My trips.
    await page.locator('.header-nav-item, .bottom-nav-item').filter({ hasText: /^(Saved trips|My trips)$/ })
      .locator('visible=true').first().click();
    await page.locator('.saved-trips-panel').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
  },
  account: async (page) => {
    await open(page, '');
    await page.locator('.places-ccard').first().waitFor({ timeout: 120000 });
    await visible(page, '.account-avatar-btn, .bottom-nav-item:has-text("Account")').click();
    await page.waitForTimeout(1500);
  },
  legal: async (page) => { await open(page, '?legal=terms'); await page.waitForTimeout(3000); },
};
const DETAIL = {
  trail: ['#trail=197956&tc=IT', '.tpage'],
  cycle: ['#cycle=10&cc=LU', '[data-testid="cycle-page"]'],
  beach: ['#beach=it-guvano-Q3780024&bc=IT', '.bpage'],
  lake: ['#lake=it-lake-como-Q15523&lc=IT', '.lpage'],
  mountain: ['#mtn=it-mont-blanc-Q583&mc=IT', '.mpage'],
};
for (const [k, [hash, sel]] of Object.entries(DETAIL)) {
  DETAIL[k] = async (page) => {
    await open(page, hash);
    await page.locator(sel).first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(3500);
  };
}

async function eachScreen(browser, vp, flow, steps) {
  for (const [name, step] of Object.entries(steps)) {
    const { ctx, page } = await newPage(browser, vp);
    try {
      await step(page);
      await audit(page, vp, flow, name);
      // Opened folds hold controls and text too: open them and look again.
      const folds = await page.locator(FOLDS).count();
      if (folds) {
        await page.evaluate((s) => document.querySelectorAll(s).forEach((b) => b.getClientRects().length && b.click()), FOLDS);
        await page.waitForTimeout(800);
        await audit(page, vp, flow, `${name}-open`);
      }
    } catch (e) {
      console.log(`  ERROR ${flow}/${name}/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
      report.push({ viewport: vp.key, flow, name, error: String(e).slice(0, 300) });
      await page.screenshot({ path: `${OUT}/${vp.key}/${flow}-${name}-ERROR.png` }).catch(() => {});
    }
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n${vp.key} ${vp.width}x${vp.height}`);
    if (FLOWS.includes('explore')) await exploreFlow(browser, vp);
    if (FLOWS.includes('trip')) await tripFlow(browser, vp);
    if (FLOWS.includes('day')) await dayFlow(browser, vp);
    if (FLOWS.includes('pages')) await eachScreen(browser, vp, 'pages', PAGES);
    if (FLOWS.includes('detail')) await eachScreen(browser, vp, 'detail', DETAIL);
  }
} finally { await browser.close(); }
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/audit.json`, JSON.stringify(report, null, 2));
const ok = report.filter((r) => !r.error);
const sum = (k, rows = ok, f = () => true) => rows.reduce((s, r) => s + (Array.isArray(r[k]) ? r[k].filter(f).length : 0), 0);
const phone = ok.filter((r) => r.viewport === 'mobile');
const desk = ok.filter((r) => r.viewport === 'desktop');
const isTok = (c) => c.startsWith('[token]');
// The floor: each of these must be zero for the run to pass.
const FLOOR = {
  'screens with horizontal scroll': ok.filter((r) => r.hscroll > 0).length,
  'screens without exactly one h1': ok.filter((r) => r.h1 !== 1).length,
  'skipped heading levels': sum('skips'),
  'views with more than one filled primary': ok.filter((r) => r.primaries.length > 1).length,
  'targets under 44 px, phone': sum('small', phone),
  'uppercase mono eyebrows': sum('monoEyebrow'),
  'fake controls': sum('fakeControls'),
  'motion under reduced motion': sum('motion'),
  'serif out of its display role': sum('serifSmall'),
  'gradients': sum('gradients'),
  'text under 4.5:1, usage': sum('contrast', ok, (c) => !isTok(c)),
};
// Reported, gated only with --strict (owner rows T193-b and T335-b).
const OWNER = {
  'text under 4.5:1, token pairs': sum('contrast', ok, isTok),
  'targets under 44 px, desktop': sum('small', desk),
};
const INFO = {
  screens: ok.length,
  aborted: report.length - ok.length,
  'prose set in mono': sum('monoProse'),
  '--ink-mute outside 12 to 14 px': sum('inkMute'),
  'bare figures in the sans without tabular-nums': sum('sansNumbers'),
  'blocks over 60 words': sum('longBlocks'),
  'bare Loading text': sum('loadingText'),
  'console errors': sum('errors'),
};
const totals = { floor: FLOOR, owner: OWNER, info: INFO };
writeFileSync(`${OUT}/summary.json`, JSON.stringify(totals, null, 2));
console.log('\nFLOOR');
for (const [k, v] of Object.entries(FLOOR)) console.log(`  ${v === 0 ? 'PASS' : 'FAIL'}  ${k}: ${v}`);
console.log('OWNER DECISIONS (T193-b, T335-b)');
for (const [k, v] of Object.entries(OWNER)) console.log(`  ${argv.strict ? (v === 0 ? 'PASS' : 'FAIL') : 'INFO'}  ${k}: ${v}`);
console.log('INFO');
for (const [k, v] of Object.entries(INFO)) console.log(`        ${k}: ${v}`);
// A screen that did not open is a check that did not run, so it fails too.
const failed = !ok.length || INFO.aborted > 0 || Object.values(FLOOR).some((v) => v > 0)
  || (argv.strict && Object.values(OWNER).some((v) => v > 0));
process.exitCode = failed ? 1 : 0;
