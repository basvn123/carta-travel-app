/**
 * The home page (T462; src/browse/home/). Replaces verify_landing.mjs, which
 * checked the T209 landing receipt this page replaced.
 *
 * It drives a cold first visit (fresh browser storage) on a phone (380 x 800,
 * touch) and a desktop (1280 x 800), and checks what the T462 plan promises:
 *
 *   home      a first visit with no link opens the home page
 *   h1        exactly one visible h1
 *   primary   exactly one visible primary button, "Plan a trip"
 *   hscroll   nothing scrolls sideways
 *   links     every control that goes somewhere is a real <a href> (the one
 *             exception: My trips, an overlay with no address, is a button)
 *   taps      (phone) every control measures at least 44 by 44 px
 *   fold      (phone) the primary ends above the bottom nav in the first screen
 *   carousel  the demo is a labelled carousel whose first stop is its pause
 *             control, with a tab per scene
 *   advance   the demo moves to the next scene within 6 s on its own
 *   pause     after Pause it holds its scene for 8 s; after Play it moves on
 *   offscreen scrolled out of view, it stops turning and freezes
 *   hidden    in a hidden browser tab it freezes
 *   sum       the trip's lines add up to its total, to the cent
 *   agree     the demo's day figure for its first town is the Explore card's
 *   search    the search field opens Explore with its search panel open
 *   tryone    the lakes question (the demo's own) opens Explore with xe=lake,
 *             xa=alps, xm=7 and its answer holds the demo's first town; every
 *             question's href carries its facets, so a new tab keeps it
 *   kind      the Trails tile opens Destinations on Trails
 *   copy      no catalogue count, dash, middot or banned word on the page
 *   console   no page error and no console error
 *   return    a second visit opens Destinations, and the brand mark leads home
 * And once, with prefers-reduced-motion:
 *   reduced   no pause control, no running animation, the Trip scene shown
 *             and still there 7 s later
 * And in en, de, es, fr, it and nl at 360 x 740, and en and de at 390 x 664
 * (an iPhone 13's visible viewport):
 *   lang      no sideways scroll, no text cut with an ellipsis outside the
 *             demo, the primary above the bottom nav
 *
 * It does not start a server. Serve the app first (never `npm run dev`, whose
 * predev rewrites public/):
 *   npx vite --port 5202 --strictPort
 *   node scripts/verify_home.mjs --port=5202
 * Options: --vp=mobile,desktop  --skip=lang,reduced  --timeout=240 (seconds
 * to wait for the demo on a cold dev server). Exit code 1 when a check fails.
 */
import { chromium } from 'playwright';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = `http://${argv.host || '127.0.0.1'}:${argv.port || 5202}/`;
const WAIT = Number(argv.timeout || 240) * 1000;
const SKIP = new Set(String(argv.skip || '').split(',').filter(Boolean));
const VIEWPORTS = [
  { key: 'mobile', viewport: { width: 380, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { key: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
].filter((v) => !argv.vp || String(argv.vp).split(',').includes(v.key));
const BANNED = ['seamless', 'unlock', 'effortless', 'elevate', 'leverage', 'empower', 'curated', 'simply', 'just', 'easy'];

const results = [];
const check = (vp, name, ok, detail = '') => {
  results.push({ vp, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${vp.padEnd(8)} ${name.padEnd(9)} ${detail}`);
};
const toCents = (s) => {
  // English money, cents on a receipt: ~€1,234.56 est.
  const m = String(s).match(/\d[\d,]*\.\d{2}/);
  return m ? Math.round(Number(m[0].replace(/,/g, '')) * 100) : null;
};

async function coldPage(browser, vp, opts = {}) {
  const ctx = await browser.newContext({
    viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor || 1, reducedMotion: opts.reducedMotion || 'no-preference',
  });
  if (opts.lang) await ctx.addInitScript((l) => { try { localStorage.setItem('continent.lang.v1', l); } catch {} }, opts.lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-page', { timeout: WAIT });
  await page.waitForSelector('.home-demo .ui-tab, .home-hero.is-solo', { timeout: WAIT });
  return { ctx, page, errors };
}

const sceneOf = (page) => page.evaluate(() => document.querySelector('.home-demo .ui-tab[aria-selected="true"]')?.textContent || null);

async function waitScene(page, from, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await sceneOf(page);
    if (s && s !== from) return s;
    await page.waitForTimeout(150);
  }
  return from;
}

async function run(browser, vp) {
  const { ctx, page, errors } = await coldPage(browser, vp);
  const k = vp.key;
  check(k, 'home', await page.locator('.home-page').isVisible(), 'first visit opens the home page');

  const floor = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const h1 = [...document.querySelectorAll('h1')].filter(vis);
    const prim = [...document.querySelectorAll('.btn-primary')].filter(vis);
    const goes = [...document.querySelectorAll('.home-page .home-search, .home-page .home-try, .home-page .home-kind, .home-page .home-cta, .home-page .home-door, .home-page .home-demo-act, .home-page .card-open')];
    const notLinks = goes.filter((e) => !(e.tagName === 'A' && e.getAttribute('href'))).map((e) => e.textContent.trim());
    return {
      h1: h1.length, prim: prim.length, primText: prim[0]?.textContent.trim(),
      wide: document.documentElement.scrollWidth > window.innerWidth
        || (document.querySelector('.home-page')?.scrollWidth || 0) > (document.querySelector('.home-page')?.clientWidth || 0),
      notLinks,
    };
  });
  check(k, 'h1', floor.h1 === 1, `${floor.h1} visible`);
  check(k, 'primary', floor.prim === 1, `${floor.prim} visible, "${floor.primText}"`);
  check(k, 'hscroll', !floor.wide, floor.wide ? 'sideways scroll' : '');
  check(k, 'links', floor.notLinks.length <= 1, floor.notLinks.length ? `not <a href>: ${floor.notLinks.join(' | ')}` : '');

  if (vp.isMobile) {
    const small = await page.evaluate(() => [...document.querySelectorAll('.home-page a, .home-page button, .home-page summary')]
      .filter((e) => e.offsetParent && !e.closest('.home-scenes'))
      // A card's title link is stretched over the card (04-ui.css .card-open::after): its target is the card.
      .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), r: (e.classList.contains('card-open') ? e.closest('.card') : e).getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 43.5 || x.r.width < 43.5))
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
    check(k, 'taps', small.length === 0, small.slice(0, 6).join('; '));
    const fold = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      const cta = document.querySelector('.home-cta');
      const top = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : window.innerHeight;
      return { cta: cta?.getBoundingClientRect().bottom, top };
    });
    check(k, 'fold', fold.cta != null && fold.cta <= fold.top, `primary ends ${Math.round(fold.cta)}, nav at ${Math.round(fold.top)}`);
  }

  const car = await page.evaluate(() => {
    const d = document.querySelector('.home-demo');
    if (!d) return null;
    const first = d.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
    return {
      role: d.getAttribute('aria-roledescription'), label: d.getAttribute('aria-label'),
      firstIsPause: !!first?.classList.contains('home-demo-pause'), tabs: d.querySelectorAll('[role="tab"]').length,
    };
  });
  check(k, 'carousel', car && car.role === 'carousel' && car.label && car.firstIsPause && car.tabs === 4,
    JSON.stringify(car));

  // The demo turns on its own. Keep the pointer off it (hover stops it).
  await page.mouse.move(2, 2);
  const s0 = await sceneOf(page);
  const s1 = await waitScene(page, s0, 6500);
  check(k, 'advance', s1 && s1 !== s0, `${s0} -> ${s1}`);

  await page.click('.home-demo-pause');
  await page.mouse.move(2, 2);
  const held = await sceneOf(page);
  await page.waitForTimeout(8000);
  const still = await sceneOf(page);
  await page.click('.home-demo-pause');
  await page.mouse.move(2, 2);
  const moved = await waitScene(page, still, 6500);
  check(k, 'pause', held === still && moved !== still, `held ${held}, after 8 s ${still}, after Play ${moved}`);

  // The trip's lines add up (read once, any scene: every scene is in the DOM).
  const trip = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('.home-line .money')].map((e) => e.textContent),
    sum: document.querySelector('.home-sum .money')?.textContent,
  }));
  const linesC = trip.lines.map(toCents);
  check(k, 'sum', trip.lines.length >= 2 && linesC.reduce((a, b) => a + b, 0) === toCents(trip.sum),
    `${trip.lines.join(' + ')} = ${trip.sum}`);

  // Off screen: scroll the page past the demo.
  await page.evaluate(() => { const p = document.querySelector('.home-page'); p.scrollTop = p.scrollHeight; });
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => document.querySelector('.home-demo')?.dataset);
  check(k, 'offscreen', off && off.turning === 'false' && off.paused === 'true', JSON.stringify(off));
  await page.evaluate(() => { document.querySelector('.home-page').scrollTop = 0; });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const hid = await page.evaluate(() => document.querySelector('.home-demo')?.dataset.paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check(k, 'hidden', hid === 'true', `paused=${hid}`);

  const copy = await page.evaluate((banned) => {
    const text = document.querySelector('.home-page').innerText;
    const bare = text.replace(/~?€\s?[\d.,]+|[\d.,]+\s?€/g, ' ');
    const counts = bare.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g) || [];
    const dashes = text.match(/[–—·•]/g) || [];
    const words = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    return { counts, dashes, words };
  }, BANNED);
  check(k, 'copy', !copy.counts.length && !copy.dashes.length && !copy.words.length, JSON.stringify(copy));

  const firstTown = await page.evaluate(() => ({
    city: document.querySelector('.home-result-name')?.textContent,
    fig: document.querySelector('.home-result .home-dayfig .money')?.textContent,
  }));

  // The first question hands its answer to Explore.
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a.home-try')].map((a) => a.getAttribute('href')));
  await page.click('a.home-try[href*="xe=lake"]');
  await page.waitForFunction(() => /[?&]tab=map\b|^\?(?!.*tab=)/.test(window.location.search) && /xe=lake/.test(window.location.search), null, { timeout: 15000 }).catch(() => {});
  const url = await page.evaluate(() => window.location.search);
  // The list fills once the guided vocabulary is in (fetched on idle from the home page).
  await page.waitForFunction((city) => [...document.querySelectorAll('.xrow, .xtile, .xcard')]
    .some((c) => c.offsetParent && c.textContent.includes(city)), firstTown.city, { timeout: 8000 }).catch(() => {});
  const xp = await page.evaluate((city) => {
    const cards = [...document.querySelectorAll('.xrow, .xtile, .xcard')].filter((e) => e.offsetParent);
    const hit = cards.find((c) => c.textContent.includes(city));
    return { n: cards.length, fig: hit?.querySelector('.money')?.textContent || null };
  }, firstTown.city);
  check(k, 'tryone', /xe=lake/.test(url) && /xa=alps/.test(url) && /xm=7/.test(url) && xp.n >= 3 && xp.fig
    && hrefs.length === 3 && hrefs.every((h) => /[?&]xe=/.test(h)),
    `${url}; ${xp.n} places, ${firstTown.city} ${xp.fig ? 'listed' : 'missing'}`);
  check(k, 'agree', xp.fig && xp.fig === firstTown.fig, `home ${firstTown.fig}, Explore ${xp.fig}`);

  // Back home through the brand mark, then the search field.
  await page.click('a[href*="tab=home"]');
  await page.waitForSelector('.home-page', { timeout: 15000 });
  check(k, 'return', await page.locator('.home-page').isVisible(), 'the brand mark leads home');
  await page.click('.home-search');
  const sheet = await page.waitForSelector('.gsearch-sheet', { timeout: 15000 }).then(() => true).catch(() => false);
  check(k, 'search', sheet, sheet ? 'Explore opened with its search panel' : 'no search panel');
  await page.keyboard.press('Escape');

  await page.click('a[href*="tab=home"]');
  await page.waitForSelector('.home-kind', { timeout: 15000 });
  await page.click('.home-kind >> nth=1');
  const kind = await page.waitForFunction(() => {
    const t = document.querySelector('[data-cat="trails"]');
    return t && (t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-pressed') === 'true'
      || t.classList.contains('is-selected')) && t.offsetParent;
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check(k, 'kind', kind, kind ? 'Destinations opened on Trails' : 'Trails not selected');

  check(k, 'console', errors.length === 0, errors.slice(0, 3).join(' | '));

  // A second visit opens Destinations.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const second = await page.waitForSelector('.places-tab', { timeout: WAIT }).then(() => true).catch(() => false);
  const homeAgain = await page.locator('.home-page').count();
  check(k, 'return', second && homeAgain === 0, 'a second visit opens Destinations');
  await ctx.close();
}

async function reduced(browser) {
  const vp = VIEWPORTS[0] || { key: 'mobile', viewport: { width: 380, height: 800 }, isMobile: true, hasTouch: true };
  const { ctx, page } = await coldPage(browser, vp, { reducedMotion: 'reduce' });
  const r0 = await page.evaluate(() => {
    const d = document.querySelector('.home-demo');
    return {
      pause: !!d.querySelector('.home-demo-pause'),
      running: d.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      scene: d.querySelector('.ui-tab[aria-selected="true"]')?.textContent,
    };
  });
  await page.waitForTimeout(7000);
  const r1 = await sceneOf(page);
  check('reduced', 'reduced', !r0.pause && r0.running === 0 && r0.scene === 'Trip' && r1 === 'Trip',
    `pause ${r0.pause}, running ${r0.running}, scene ${r0.scene} then ${r1}`);
  await ctx.close();
}

async function langs(browser) {
  const sets = [
    ...['en', 'de', 'es', 'fr', 'it', 'nl'].map((l) => [l, { width: 360, height: 740 }]),
    ['en', { width: 390, height: 664 }], ['de', { width: 390, height: 664 }],
  ];
  for (const [lang, viewport] of sets) {
    const vp = { key: `${lang}${viewport.width}`, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const { ctx, page } = await coldPage(browser, vp, { lang });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.home-page');
      const wide = document.documentElement.scrollWidth > window.innerWidth || root.scrollWidth > root.clientWidth;
      const cut = [...root.querySelectorAll('*')].filter((e) => !e.closest('.home-scenes, .home-tries-list, .home-demo-tabs'))
        .filter((e) => e.children.length === 0 && e.offsetParent && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.textContent.trim().slice(0, 30));
      const nav = document.querySelector('.bottom-nav');
      const top = nav && nav.getClientRects().length ? nav.getBoundingClientRect().top : window.innerHeight;
      const cta = document.querySelector('.home-cta')?.getBoundingClientRect().bottom;
      return { wide, cut, fold: cta != null && cta <= top, cta: Math.round(cta), top: Math.round(top) };
    });
    check(vp.key, 'lang', !r.wide && !r.cut.length && r.fold,
      `${r.wide ? 'sideways scroll; ' : ''}${r.cut.length ? `cut: ${r.cut.join(', ')}; ` : ''}primary ${r.cta} / nav ${r.top}`);
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) await run(browser, vp);
  if (!SKIP.has('reduced')) await reduced(browser);
  if (!SKIP.has('lang')) await langs(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
