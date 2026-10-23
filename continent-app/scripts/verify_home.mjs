/**
 * The home page v2 (T606 batch, rebuilt from scratch; src/browse/home/).
 *
 * It drives a cold first visit (fresh browser storage) on a phone (390 x 844,
 * touch) and a desktop (1440 x 800), and checks what the T606 rebuild
 * promises:
 *
 *   home      a first visit with no link opens the home page
 *   h1        exactly one visible h1, the slogan
 *   primary   exactly one visible primary button, "Plan a trip"
 *   hscroll   nothing scrolls sideways
 *   hero      the film fills the page box and the window edge to edge
 *             (T620, T621), the slogan, the line and Ask Carta stand on it
 *             under one tint, and nothing else sits on it or under it (no
 *             pill, no bars, no pause, no credit line)
 *   header    (desktop) the app header is transparent and white on the film
 *             and the usual bar once the film has scrolled by (T621)
 *   film      a clip plays and the film moves on to the next shot by itself
 *   week      the week card shows one total and its lines; another place
 *             changes the total in place
 *   voices    six traveller tabs; a picked tab types its question and answers
 *             with its place
 *   story     five chapter tabs; the clip in view is the page language's and
 *             plays
 *   route     the route card draws itself in view and ends in a total
 *   why       five promise cards
 *   plans     three plan columns and the free sentence
 *   footer    the site footer ends the page
 *   jump      a jump to the foot of the page leaves no section waiting to
 *             arrive above it
 *   taps      (phone) every control measures at least 44 by 44 px
 *   fold      (phone) the primary ends above the bottom nav in the first screen
 *   ask       a question asked in the hero opens the chat on Explore, asked
 *             exactly once, and the header is the usual bar there (T621)
 *   copy      no dash, middot, banned word, catalogue count or "est." on the page
 *   console   no page error and no console error
 * And once, with prefers-reduced-motion:
 *   reduced   the film stands still, no section waits to arrive, and nothing
 *             on the page animates
 * And in en, de, es, fr, it and nl at 360 x 740:
 *   lang      no sideways scroll and no text cut with an ellipsis
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
  { key: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { key: 'desktop', viewport: { width: 1440, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
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
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // A dev server is not the data host's origin: the host refuses it (CORS),
    // a dev proxy for it has no status.json and drops the odd shard. These
    // say nothing about the page and never happen on Pages.
    if (/data\.carta-europetravel\.com.*CORS|net::ERR_FAILED|r2data\/status\.json|status of 404|status of 502/.test(text)
      && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) return;
    errors.push(`console: ${text}`);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT });
  await page.waitForSelector('.hv-page', { timeout: WAIT });
  await page.waitForSelector('.hv-slogan', { timeout: WAIT });
  await page.waitForSelector('.hv-week', { timeout: WAIT });
  return { ctx, page, errors };
}

/** Scroll the home page's own scroller to a section, then let it settle. */
async function toSection(page, sel, ms = 1600, offset = 40) {
  await page.evaluate(([s, o]) => {
    const box = document.querySelector('.hv-page');
    const el = document.querySelector(s);
    if (box && el) box.scrollTo(0, Math.max(0, el.offsetTop - o));
  }, [sel, offset]);
  await page.waitForTimeout(ms);
}

async function run(browser, vp) {
  const { ctx, page, errors } = await coldPage(browser, vp);
  const k = vp.key;
  check(k, 'home', await page.locator('.hv-page').isVisible(), 'first visit opens the home page');

  const floor = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
    const h1 = [...document.querySelectorAll('h1')].filter(vis);
    const prim = [...document.querySelectorAll('.btn-primary')].filter(vis);
    const box = document.querySelector('.hv-page');
    return {
      h1: h1.length, h1Text: h1[0]?.textContent.trim(),
      prim: prim.length, primText: prim[0]?.textContent.trim(),
      wide: document.documentElement.scrollWidth > window.innerWidth || (box?.scrollWidth || 0) > (box?.clientWidth || 0),
    };
  });
  check(k, 'h1', floor.h1 === 1, `${floor.h1} visible, "${floor.h1Text}"`);
  check(k, 'primary', floor.prim === 1, `${floor.prim} visible, "${floor.primText}"`);
  check(k, 'hscroll', !floor.wide, floor.wide ? 'sideways scroll' : '');

  // The hero (T620): the film fills the page's visible box from edge to edge
  // (a hair inside on a wider screen), the slogan, Ask Carta and the primary
  // stand on it, and nothing sits on the film but those words.
  const hero = await page.evaluate(() => {
    const box = document.querySelector('.hv-page').getBoundingClientRect();
    const stage = document.querySelector('.hv-hero-stage');
    const r = stage.getBoundingClientRect();
    const inside = (sel) => { const e = document.querySelector(sel); return !!e && stage.contains(e); };
    return {
      wGap: Math.round(box.width - r.width), hShare: r.height / box.height,
      words: inside('.hv-slogan') && inside('.hv-sub') && inside('#hv-ask') && inside('.hv-ask-go-main'),
      extras: stage.querySelectorAll('.hv-pill, .hv-film-steps, .hv-film-pause, .hv-cta, button[aria-pressed]').length
        + document.querySelectorAll('.hv-film-credit').length,
      tint: getComputedStyle(document.querySelector('.hv-film'), '::after').backgroundColor,
      winGap: Math.round(window.innerWidth - r.width),
      // The page hides sideways overflow, so hscroll cannot see a field
      // that runs off the film: every word and control must end inside it.
      spill: [...stage.querySelectorAll('.hv-hero-copy *')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
      }).length,
    };
  });
  check(k, 'hero', hero.wGap <= 1 && hero.winGap <= 1 && hero.hShare >= 0.95 && hero.spill === 0 && hero.words && hero.extras === 0 && /^(rgba?|color)\(/.test(hero.tint),
    `gap to page ${hero.wGap}px, to window ${hero.winGap}px, ${Math.round(hero.hShare * 100)}% of the page box, words on film ${hero.words}, ${hero.spill} spilling, ${hero.extras} extras, tint ${hero.tint}`);

  // The header on the film (T621, wider screens): transparent and white over
  // the film, the usual bar once the film has scrolled by.
  if (!vp.isMobile) {
    const bar = (pos) => page.evaluate(async (y) => {
      const box = document.querySelector('.hv-page');
      box.scrollTo(0, y === 'past' ? document.querySelector('.hv-hero-stage').offsetHeight + 40 : 0);
      await new Promise((r) => setTimeout(r, 400));
      const tb = document.querySelector('.top-bar');
      const cs = getComputedStyle(tb);
      return { state: document.documentElement.dataset.homeFilm, bg: cs.backgroundColor,
        ink: getComputedStyle(tb.querySelector('.header-nav-item')).color,
        overlap: Math.round(document.querySelector('.hv-hero-stage').getBoundingClientRect().top) };
    }, pos);
    const under = await bar('top');
    const past = await bar('past');
    await bar('top');
    const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    check(k, 'header', under.state === 'under' && clear(under.bg) && /255, 255, 255/.test(under.ink) && under.overlap === 0
      && past.state === 'past' && !clear(past.bg),
      `top: ${under.state}, ${under.bg}, ink ${under.ink}, film at ${under.overlap}px; past: ${past.state}, ${past.bg}`);
  }

  // The film: a clip playing, and the next shot by itself, with no control.
  await page.waitForFunction(() => {
    const v = document.querySelector('.hv-shot.is-on video');
    return v && v.readyState >= 2 && !v.paused && v.currentTime > 0;
  }, null, { timeout: 60000 }).catch(() => {});
  const film0 = await page.evaluate(() => ({
    shot: [...document.querySelectorAll('.hv-shot')].findIndex((s) => s.classList.contains('is-on')),
    running: document.querySelector('.hv-film')?.classList.contains('is-running')
      && !document.querySelector('.hv-shot.is-on video')?.paused,
  }));
  await page.waitForTimeout(9800);
  const film1 = await page.evaluate(() => [...document.querySelectorAll('.hv-shot')].findIndex((s) => s.classList.contains('is-on')));
  check(k, 'film', film0.running && film1 !== film0.shot, `shot ${film0.shot} then ${film1}`);

  if (vp.isMobile) {
    const fold = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      const cta = document.querySelector('.hv-ask-go-main');
      return { top: nav ? nav.getBoundingClientRect().top : window.innerHeight, cta: cta?.getBoundingClientRect().bottom };
    });
    check(k, 'fold', fold.cta != null && fold.cta <= fold.top, `primary ends ${Math.round(fold.cta)}, nav at ${Math.round(fold.top)}`);
  }

  // The week card.
  await toSection(page, '.hv-week');
  const week0 = await page.evaluate(() => ({
    total: document.querySelector('.hv-week-total-fig')?.textContent.trim(),
    rows: document.querySelectorAll('.hv-week-rows .costrow').length,
  }));
  await page.locator('.hv-week-places [role="radio"]').nth(3).click();
  await page.waitForTimeout(500);
  const week1 = await page.evaluate(() => document.querySelector('.hv-week-total-fig')?.textContent.trim());
  check(k, 'week', /\d/.test(week0.total || '') && week0.rows >= 3 && week1 !== week0.total,
    `${week0.rows} lines, total ${week0.total} then ${week1}`);

  // The voices.
  await toSection(page, '.hv-voices');
  const tabs = page.locator('.hv-voices [role="tab"]');
  const nTabs = await tabs.count();
  await tabs.nth(1).click();
  await page.waitForTimeout(3500);
  const voice = await page.evaluate(() => ({
    q: document.querySelector('.hv-say-you .sr-only')?.textContent.trim(),
    typed: document.querySelector('.hv-say-you [aria-hidden="true"]')?.textContent.trim(),
    place: document.querySelector('.hv-answer-name')?.textContent.trim(),
  }));
  check(k, 'voices', nTabs === 6 && voice.typed === voice.q && voice.place === 'Albufeira',
    `${nTabs} tabs, answer "${voice.place}"`);

  // The story.
  await toSection(page, '.hv-story', 5200, -60);
  const story = await page.evaluate(() => {
    const v = document.querySelector('.hv-phone-screen');
    return {
      tabs: document.querySelectorAll('.hv-story [role="tab"]').length,
      src: v?.currentSrc || '', t: v?.currentTime || 0, err: v?.error?.code || null,
      lang: document.documentElement.lang,
    };
  });
  check(k, 'story', story.tabs === 5 && story.src.includes(`/home/clips/${story.lang || 'en'}/`) && story.t > 0.5 && !story.err,
    `${story.tabs} tabs, ${story.src.split('/home/')[1] || 'no clip'} at ${story.t.toFixed(1)} s${story.err ? `, error ${story.err}` : ''}`);

  // The route.
  await toSection(page, '.hv-route', 3600);
  const route = await page.evaluate(() => ({
    drawn: document.querySelector('.hv-route-card')?.classList.contains('is-drawn'),
    total: document.querySelector('.hv-route-total')?.textContent.trim(),
    pills: document.querySelectorAll('.hv-route-pill').length,
  }));
  check(k, 'route', route.drawn && route.pills === 3 && /\d/.test(route.total || ''), `${route.pills} towns, "${route.total}"`);

  await toSection(page, '.hv-why', 800);
  check(k, 'why', (await page.locator('.hv-why-card').count()) === 5, '');
  await toSection(page, '.hv-plans', 800);
  const plans = await page.evaluate(() => ({
    cols: document.querySelectorAll('.hv-plan').length,
    free: document.querySelector('.hv-plans .hv-lead')?.textContent.trim(),
  }));
  check(k, 'plans', plans.cols === 3 && !!plans.free, `${plans.cols} columns`);

  // A jump to the foot: nothing above the screen may still wait to arrive.
  await page.evaluate(() => { const b = document.querySelector('.hv-page'); b.scrollTo(0, b.scrollHeight); });
  await page.waitForTimeout(1200);
  const jump = await page.evaluate(() => ({
    waiting: [...document.querySelectorAll('.hv-page [data-reveal="wait"]')]
      .filter((s) => s.getBoundingClientRect().top < window.innerHeight).map((s) => s.className),
    footer: !!document.querySelector('.hv-page .site-footer-col'),
  }));
  check(k, 'footer', jump.footer, '');
  check(k, 'jump', jump.waiting.length === 0, jump.waiting.join(', '));

  if (vp.isMobile) {
    const small = await page.evaluate(() => [...document.querySelectorAll('.hv-page a, .hv-page button, .hv-page [role="tab"]')]
      .filter((e) => e.offsetParent && !e.closest('.site-footer-col') && !e.closest('.hv-caption'))
      .map((e) => ({ t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 43.5 || x.r.width < 43.5))
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
    check(k, 'taps', small.length === 0, small.slice(0, 6).join('; '));
  }

  const copy = await page.evaluate((banned) => {
    const text = document.querySelector('.hv-page')?.innerText || '';
    const bad = [];
    if (/[–—·•]/.test(text)) bad.push('dash or middot');
    if (/\best\./i.test(text)) bad.push('"est."');
    for (const w of banned) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) bad.push(w);
    if (/\b\d{1,3}(,\d{3})+\s+(places|destinations|trails)\b/i.test(text)) bad.push('a catalogue count');
    return bad;
  }, BANNED);
  check(k, 'copy', copy.length === 0, copy.join(', '));

  // Ask Carta from the hero (T621): the chat opens on Explore already asking,
  // and the question is asked once.
  await page.evaluate(() => document.querySelector('.hv-page').scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.fill('#hv-ask', 'A beach in May for two under 900 euros');
  const t0 = Date.now();
  await page.press('#hv-ask', 'Enter');
  await page.waitForSelector('.ac .ac-q', { timeout: 30000 }).catch(() => {});
  const opened = Date.now() - t0;
  await page.waitForTimeout(2500);
  const asked = await page.evaluate(() => ({
    qs: document.querySelectorAll('.ac .ac-q').length,
    film: document.documentElement.dataset.homeFilm || null,
    bar: getComputedStyle(document.querySelector('.top-bar')).backgroundColor,
  }));
  check(k, 'ask', asked.qs === 1 && !asked.film, `chat open in ${opened} ms, ${asked.qs} question(s) asked, header ${asked.bar}`);
  check(k, 'console', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function reduced(browser) {
  const vp = VIEWPORTS.find((v) => v.key === 'desktop') || VIEWPORTS[0];
  const { ctx, page } = await coldPage(browser, vp, { reducedMotion: 'reduce' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.querySelector('.hv-page'); b.scrollTo(0, b.scrollHeight / 2); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    running: document.querySelector('.hv-film')?.classList.contains('is-running'),
    waiting: document.querySelectorAll('.hv-page [data-reveal="wait"]').length,
    moving: document.getAnimations().filter((a) => a.playState === 'running'
      && a.effect?.target?.closest?.('.hv-page')).length,
  }));
  check('reduced', 'reduced', !r.running && r.waiting === 0 && r.moving === 0,
    `film running ${r.running}, ${r.waiting} waiting, ${r.moving} animations`);
  await ctx.close();
}

async function langs(browser) {
  for (const lang of ['en', 'de', 'es', 'fr', 'it', 'nl']) {
    const vp = { key: lang, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const { ctx, page } = await coldPage(browser, vp, { lang });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const box = document.querySelector('.hv-page');
      const cut = [...box.querySelectorAll('h1, h2, h3, p, a, button, span')]
        .filter((e) => e.offsetParent && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)
        .map((e) => e.textContent.trim().slice(0, 30));
      return { wide: document.documentElement.scrollWidth > innerWidth || box.scrollWidth > box.clientWidth, cut };
    });
    check(lang, 'lang', !r.wide && r.cut.length === 0, `${r.wide ? 'sideways scroll; ' : ''}${r.cut.join(' | ')}`);
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
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
