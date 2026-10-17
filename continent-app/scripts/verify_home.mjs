/**
 * The home page (T463, after T462; src/browse/home/).
 *
 * It drives a cold first visit (fresh browser storage) on a phone (380 x 800,
 * touch) and a desktop (1280 x 800), and checks what the T463 plan promises:
 *
 *   home      a first visit with no link opens the home page
 *   h1        exactly one visible h1
 *   primary   exactly one visible primary button, "Plan a trip"
 *   hscroll   nothing scrolls sideways
 *   links     every control that goes somewhere is a real <a href> (the one
 *             exception: My trips, an overlay with no address, is a button)
 *   taps      (phone) every control measures at least 44 by 44 px
 *   fold      (phone) the primary ends above the bottom nav in the first screen
 *   screens   the hero's laptop and phone hold the trip captures of the
 *             page's language, loaded, each with an alt
 *   chapters  five chapters and one visible chapter bar of five tabs
 *   pinned    (desktop) the pinned phone shows the chapter in the middle of
 *             the page and stays where it is while the chapters scroll
 *   tabgo     (desktop) a chapter tab brings its chapter, and its screen
 *   track     (phone) Next moves the chapter track one slide, and the bar
 *             and the position follow
 *   who       six traveller cards, each a link, each with a pill: at least
 *             four name a place and its own day price in the house notation,
 *             cyclists a label
 *   height    (phone) the page is at most 2,900 px tall (T464; 4,006 before)
 *   laptop    (desktop) the hero's laptop screen is at least 760 px wide
 *   homedoor  the header's Home tab (desktop) or Account > Home (phone) leads
 *             home
 *   copy      no catalogue count, dash, middot or banned word on the page
 *   tryone    the lakes question opens Explore with xe=lake, xa=alps, xm=7,
 *             and Lake Bled is in its answer; every question carries facets
 *   return    the brand mark leads home
 *   search    the search field opens Explore with its search panel open
 *   kind      the cyclists' card opens Destinations on cycle routes
 *   console   no page error and no console error
 *   return    a second visit opens Destinations
 * And once, with prefers-reduced-motion:
 *   reduced   the pinned phone swaps screens with no transition, and nothing
 *             on the page animates
 * And in en, de, es, fr, it and nl at 360 x 740, and en and de at 390 x 664
 * (an iPhone 13's visible viewport):
 *   lang      no sideways scroll, no text cut with an ellipsis, the primary
 *             above the bottom nav
 *
 * It does not start a server. Serve the app first (never `npm run dev`,
 * whose predev rewrites public/):
 *   npx vite --port 5202 --strictPort
 *   node scripts/verify_home.mjs --port=5202
 * Options: --vp=mobile,desktop  --skip=lang,reduced  --timeout=240 (seconds
 * to wait for the page on a cold dev server). Exit code 1 when a check fails.
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
  await page.waitForSelector('.home-title', { timeout: WAIT });
  return { ctx, page, errors };
}

async function run(browser, vp) {
  const { ctx, page, errors } = await coldPage(browser, vp);
  const k = vp.key;
  check(k, 'home', await page.locator('.home-page').isVisible(), 'first visit opens the home page');

  const floor = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const h1 = [...document.querySelectorAll('h1')].filter(vis);
    const prim = [...document.querySelectorAll('.btn-primary')].filter(vis);
    const goes = [...document.querySelectorAll('.home-page .home-search, .home-page .home-try, .home-page .home-who-card, .home-page .home-cta, .home-page .home-door')]
      .filter(vis);
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
      .filter((e) => e.offsetParent)
      .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), r: e.getBoundingClientRect() }))
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

  // The hero's devices hold the captures in the page's language, loaded.
  await page.waitForFunction(() => [...document.querySelectorAll('.home-devices img')].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
  const shots = await page.evaluate(() => [...document.querySelectorAll('.home-devices img')]
    .map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0, alt: !!i.alt })));
  check(k, 'screens', shots.length === 2 && shots.every((s) => s.ok && s.alt && /^\/home\/en\/(desk|trip)\.webp$/.test(s.src)),
    JSON.stringify(shots));

  // The story: five chapters, a chapter bar of five; wide, one pinned phone
  // whose screen follows the chapter in view; narrow, a track that Next moves.
  const story = await page.evaluate(() => ({
    chapters: document.querySelectorAll('.home-chapter').length,
    tabs: [...document.querySelectorAll('.home-story-bar')].filter((b) => b.offsetParent)
      .map((b) => b.querySelectorAll('[role="tab"]').length),
  }));
  check(k, 'chapters', story.chapters === 5 && story.tabs.length === 1 && story.tabs[0] === 5, JSON.stringify(story));
  if (!vp.isMobile) {
    await page.evaluate(() => document.querySelectorAll('.home-chapter')[2].scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(900);
    const pin = await page.evaluate(() => ({
      on: document.querySelector('.home-story-phone .home-phone-img.is-on')?.getAttribute('src'),
      tab: document.querySelector('.home-story-bar.is-wide [aria-selected="true"]')?.textContent,
      top: Math.round(document.querySelector('.home-story-pin').getBoundingClientRect().top),
    }));
    await page.evaluate(() => document.querySelectorAll('.home-chapter')[4].scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(900);
    const pin2 = await page.evaluate(() => ({
      on: document.querySelector('.home-story-phone .home-phone-img.is-on')?.getAttribute('src'),
      top: Math.round(document.querySelector('.home-story-pin').getBoundingClientRect().top),
    }));
    check(k, 'pinned', /plan\.webp$/.test(pin.on || '') && pin.tab === 'Plan' && /share\.webp$/.test(pin2.on || '') && pin.top === pin2.top,
      `${pin.on} (${pin.tab}) at ${pin.top}, then ${pin2.on} at ${pin2.top}`);
    // A tab scrolls to its chapter.
    await page.click('.home-story-bar.is-wide [role="tab"] >> nth=1');
    await page.waitForTimeout(1500);
    const tabbed = await page.evaluate(() => document.querySelector('.home-story-phone .home-phone-img.is-on')?.getAttribute('src'));
    check(k, 'tabgo', /place\.webp$/.test(tabbed || ''), tabbed);
  } else {
    await page.evaluate(() => document.querySelector('.home-chapters').scrollIntoView({ block: 'center' }));
    const x0 = await page.evaluate(() => document.querySelector('.home-chapters').scrollLeft);
    await page.click('.home-track-next');
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      x: document.querySelector('.home-chapters').scrollLeft,
      pos: document.querySelector('.home-track-pos')?.textContent,
      tab: document.querySelector('.home-story-bar.is-narrow [aria-selected="true"]')?.textContent,
    }));
    check(k, 'track', after.x > x0 && after.pos === '2 of 5' && after.tab === 'Price', `${x0} -> ${after.x}, ${after.pos}, ${after.tab}`);
  }

  // The travellers: six cards, each a link, and a "from" price on those
  // whose question returns places (the guided data arrives on idle).
  await page.waitForFunction(() => document.querySelectorAll('.home-who-price').length >= 5, null, { timeout: 20000 }).catch(() => {});
  const who = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('a.home-who-card')].filter((a) => a.getAttribute('href')).length,
    prices: [...document.querySelectorAll('.home-who-price')].map((e) => e.textContent),
  }));
  // T464: each pill names its place before that place's own day price.
  const named = who.prices.filter((p) => / a day$/.test(p));
  check(k, 'who', who.cards === 6 && who.prices.length === 6 && named.length >= 4
    && named.every((p) => /^\S.*\S ~?€\d+( est\.)? a day$/.test(p)),
    `${who.cards} cards; ${who.prices.join(' | ')}`);

  // T464: the phone page is short enough to read in a few screens, and the
  // desktop laptop draws the app large enough to read its figures.
  const size = await page.evaluate(() => ({
    h: document.querySelector('.home-page').scrollHeight,
    desk: Math.round(document.querySelector('.home-browser-img')?.getBoundingClientRect().width || 0),
  }));
  if (vp.isMobile) check(k, 'height', size.h <= 2900, `page ${size.h} px (T463: 4,006 at 390x844)`);
  else check(k, 'laptop', size.desk >= 760, `laptop screen ${size.desk} px (T463: 586 at 1440)`);

  const copy = await page.evaluate((banned) => {
    const text = document.querySelector('.home-page').innerText;
    const bare = text.replace(/~?€\s?[\d.,]+|[\d.,]+\s?€/g, ' ');
    const counts = bare.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g) || [];
    const dashes = text.match(/[–—·•]/g) || [];
    const words = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    return { counts, dashes, words };
  }, BANNED);
  check(k, 'copy', !copy.counts.length && !copy.dashes.length && !copy.words.length, JSON.stringify(copy));

  // The lakes question hands its answer to Explore, and Lake Bled is in it.
  await page.evaluate(() => { document.querySelector('.home-page').scrollTop = 0; });
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('.home-hero a.home-try')].map((a) => a.getAttribute('href')));
  await page.click('.home-hero a.home-try[href*="xe=lake"]');
  await page.waitForFunction(() => /xe=lake/.test(window.location.search), null, { timeout: 15000 }).catch(() => {});
  const url = await page.evaluate(() => window.location.search);
  await page.waitForFunction(() => [...document.querySelectorAll('.xrow, .xtile, .xcard')]
    .some((c) => c.offsetParent && c.textContent.includes('Lake Bled')), null, { timeout: 15000 }).catch(() => {});
  const xp = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.xrow, .xtile, .xcard')].filter((e) => e.offsetParent);
    return { n: cards.length, bled: cards.some((c) => c.textContent.includes('Lake Bled')) };
  });
  check(k, 'tryone', /xe=lake/.test(url) && /xa=alps/.test(url) && /xm=7/.test(url) && xp.n >= 3 && xp.bled
    && hrefs.length === 3 && hrefs.every((h) => /[?&]xe=/.test(h)),
    `${url}; ${xp.n} places, Lake Bled ${xp.bled ? 'listed' : 'missing'}`);

  // Back home through the brand mark, then the search field.
  await page.click('a.app-header-brand');
  await page.waitForSelector('.home-page', { timeout: 15000 });
  check(k, 'return', await page.locator('.home-page').isVisible(), 'the brand mark leads home');
  // T464: a named door home as well: the header's Home tab on desktop, the
  // Account menu's Home row on a phone.
  await page.click('.home-hero a.home-try[href*="xe=lake"]');
  await page.waitForFunction(() => /xe=lake/.test(window.location.search), null, { timeout: 15000 }).catch(() => {});
  if (vp.isMobile) {
    await page.click('.bottom-nav [href*="account"], .bottom-nav button:has-text("Account")');
    await page.click('.account-help-section a.account-menu-row[href*="tab=home"]');
  } else {
    await page.click('.header-nav a.header-nav-item[href*="tab=home"]');
  }
  const door = await page.waitForSelector('.home-page', { timeout: 15000 }).then(() => true).catch(() => false);
  check(k, 'homedoor', door, vp.isMobile ? 'Account > Home leads home' : 'the Home tab leads home');
  await page.click('.home-hero .home-search');
  const sheet = await page.waitForSelector('.gsearch-sheet', { timeout: 15000 }).then(() => true).catch(() => false);
  check(k, 'search', sheet, sheet ? 'Explore opened with its search panel' : 'no search panel');
  await page.keyboard.press('Escape');

  // The cyclists' card opens Destinations on cycle routes.
  await page.click('a[href*="tab=home"]');
  await page.waitForSelector('.home-who-card', { timeout: 15000 });
  await page.locator('.home-who-card').nth(2).scrollIntoViewIfNeeded();
  await page.locator('.home-who-card').nth(2).click();
  const kind = await page.waitForFunction(() => {
    const t = document.querySelector('[data-cat="cycling"]');
    return t && (t.getAttribute('aria-selected') === 'true' || t.getAttribute('aria-pressed') === 'true'
      || t.classList.contains('is-selected')) && t.offsetParent;
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check(k, 'kind', kind, kind ? 'Destinations opened on Cycling' : 'Cycling not selected');

  check(k, 'console', errors.length === 0, errors.slice(0, 3).join(' | '));

  // A second visit opens Destinations.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const second = await page.waitForSelector('.places-tab', { timeout: WAIT }).then(() => true).catch(() => false);
  const homeAgain = await page.locator('.home-page').count();
  check(k, 'return', second && homeAgain === 0, 'a second visit opens Destinations');
  await ctx.close();
}

// Under reduced motion nothing on the page moves: the pinned phone's screens
// swap at once and no animation runs.
async function reduced(browser) {
  const vp = { key: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false };
  const { ctx, page } = await coldPage(browser, vp, { reducedMotion: 'reduce' });
  const r = await page.evaluate(() => {
    const img = document.querySelector('.home-story-phone .home-phone-img');
    return {
      dur: img ? getComputedStyle(img).transitionDuration : null,
      running: document.querySelector('.home-page').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    };
  });
  // The app's reduced-motion floor writes 0.01ms; anything under 1 ms is none.
  check('reduced', 'reduced', r.dur != null && parseFloat(r.dur) < 0.001 && r.running === 0, `transition ${r.dur}, running ${r.running}`);
  await ctx.close();
}

async function langs(browser) {
  const sets = [
    ...['en', 'de', 'es', 'fr', 'it', 'nl'].map((l) => [l, { width: 360, height: 740 }]),
    ['en', { width: 390, height: 664 }], ['de', { width: 390, height: 664 }],
    // A Pixel 5's visible viewport (T464, roadmap 1.9).
    ['en', { width: 393, height: 727 }], ['de', { width: 393, height: 727 }],
  ];
  for (const [lang, viewport] of sets) {
    const vp = { key: `${lang}${viewport.width}`, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const { ctx, page } = await coldPage(browser, vp, { lang });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.home-page');
      const wide = document.documentElement.scrollWidth > window.innerWidth || root.scrollWidth > root.clientWidth;
      const cut = [...root.querySelectorAll('*')].filter((e) => !e.closest('.home-tries-list, .home-story-bar, .home-browser-url'))
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
