/**
 * The home page's clips (T606): screen recordings of the running app, one
 * per story chapter, in all six languages, for the phone frames in the
 * story panels (src/browse/home/HomeChapters.jsx). They replace T463's still
 * captures (scripts/shoot_home_screens.mjs, retired), which went stale when
 * the navigation changed.
 *
 * Every clip is the app itself opened through a real link and moved the way
 * a traveller moves it, so the home page never shows a screen the app cannot
 * reach or a click that did not happen:
 *
 *   find    Explore, "Lakes in the Alps in July" (?tab=map&xe=lake&xa=alps&xm=7),
 *           scrolled through the places
 *   place   Lake Bled's page (#dest=gem:bled), scrolled to what a day costs
 *   plan    the Julian Alps trip (#trip=), from its total down its route
 *   day     a day at Lake Bled (#day=), down its four stops
 *   share   the same day, down to its day kit and "Export and share"
 *
 * The trip and the day travel inside their links (lib/shareLink.js), so the
 * clips need no account. ?paymock opens the planned views a pass holder
 * sees; the seam only exists on the dev server.
 *
 * Each page loads and settles off the record, then the move is captured
 * through Chrome's screencast at device pixels;
 * FFmpeg cuts the clip from the move's start and writes, per chapter,
 * public/home/clips/<lang>/<id>.mp4 (H.264, plays everywhere; a VP9 WebM
 * failed to decode in Chrome on 2026-10-23) and .webp (the
 * clip's first frame, the poster), 546 by 1182 (a 390 by 844 phone captured
 * at 2x, stored at twice the size the page draws it).
 *
 * It does not start a server. Serve the app first (never `npm run dev`,
 * whose predev rewrites public/):
 *   npx vite --port 5203 --strictPort
 *   node scripts/record_home_clips.mjs --port=5203 [--lang=en,de] [--only=plan,day]
 * FFmpeg must be on the PATH. Run it again whenever a recorded screen changes.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = `http://${argv.host || 'localhost'}:${argv.port || 5203}/`;
const LANGS = String(argv.lang || 'en,nl,de,fr,es,it').split(',');
const ONLY = argv.only ? new Set(String(argv.only).split(',')) : null;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'home', 'clips');
const FFMPEG = argv.ffmpeg || 'ffmpeg';
const W = 390;
const H = 844;
const OUT_W = 546;
const OUT_H = 1182;

const link = (obj) => `1.${deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64url')}`;
// The story's trip: three towns in the Julian Alps, then one day at the lake
// (Bled Gorge, Bled Castle, St Martin's Church, Bled Island, by their index
// in public/poi/gem_3Abled.json). The same trip the route card draws.
const TRIP = link({
  stops: [{ destinationId: 'LJU', nights: 2 }, { destinationId: 'gem:bled', nights: 3 }, { destinationId: 'gem:bohinj', nights: 2 }],
  groupSize: 2, transportPref: 'public', tripStart: '2027-07-03', label: 'Julian Alps',
});
const DAY = link({
  v: 1, label: 'Lake Bled', start: '2027-07-05',
  stay: { lat: 46.3667, lon: 14.1112, label: 'Bled' },
  stops: [{ d: 'gem:bled', n: 1 }], a: { 0: { 0: [4, 2, 36, 34] } },
});

// Toasts and notices are moments, not the step.
const QUIET_CSS = `
  .bottom-slot, .confirm-toast, .undo-toast, .trip-save-toast, .tpage-toast,
  .maplibregl-ctrl-attrib-inner { visibility: hidden !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;
const SEED = [
  ['continent.homeSeen.v1', '1'], ['continent.guestMode.v1', '1'],
  ['continent.mapGuideDismissed.v1', '1'], ['carta.fareNoticeSeen', '1'],
  ['carta.welcomeSeen', '1'], ['continent.onboardingSeen.v1', '1'],
];

async function open(page, path, settle = 9000) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.addStyleTag({ content: QUIET_CSS });
  await page.waitForTimeout(settle);
}

/** Whatever scrolls the view under `sel` (or the page's tallest scroller),
 *  moved by `px` over `ms` with an ease in and out: a hand on a phone. */
async function glide(page, px, ms, sel = null) {
  await page.evaluate(([dy, dur, s]) => new Promise((done) => {
    const scrollerOf = (el) => {
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
        el = el.parentElement;
      }
      return document.scrollingElement;
    };
    let box = s ? scrollerOf(document.querySelector(s)) : null;
    if (!box) {
      const all = [...document.querySelectorAll('*')].filter((el) => {
        const cs = getComputedStyle(el);
        return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 300;
      });
      box = all.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] || document.scrollingElement;
    }
    const from = box.scrollTop;
    const t0 = performance.now();
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      box.scrollTop = from + dy * ease(k);
      if (k < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  }), [px, ms, sel]);
}

async function openSharedTrip(page) {
  await open(page, `?paymock#trip=${TRIP}`, 7000);
  await page.locator('.share-trip-actions .guide-next').first().click({ timeout: 60000 });
  await page.waitForTimeout(9000);
  if (await page.locator('.pass-overlay').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
}

// What scrolls a day plan's own list (the stops, then the day kit).
// The trip page scrolls inside its map drawer, 245 px tall on a phone.
const PLAN_LIST = '.map-drawer-scroll';
const DAY_LIST = '.dayw-stop, .itin-stop, [data-stop], #dayk-h';

/** Each chapter: `ready` loads it off the record, `move` is the clip. */
const CHAPTERS = {
  find: {
    // July dates, so the settings line agrees with "lakes in the Alps in July".
    ready: (page) => open(page, '?tab=map&xe=lake&xa=alps&xm=7&d=2027-07-03&r=2027-07-10', 12000),
    move: async (page) => { await page.waitForTimeout(900); await glide(page, 1500, 6200); await page.waitForTimeout(900); },
  },
  place: {
    ready: (page) => open(page, '#dest=gem%3Abled', 10000),
    move: async (page) => { await page.waitForTimeout(900); await glide(page, 900, 4200); await page.waitForTimeout(1200); await glide(page, 500, 2400); await page.waitForTimeout(800); },
  },
  plan: {
    ready: openSharedTrip,
    move: async (page) => { await page.waitForTimeout(1100); await glide(page, 700, 3600, PLAN_LIST); await page.waitForTimeout(1200); await glide(page, 800, 3600, PLAN_LIST); await page.waitForTimeout(800); },
  },
  day: {
    // The day's map fits its stops a few seconds after the page draws.
    ready: (page) => open(page, `?paymock#day=${DAY}`, 18000),
    // The day's stops only; the day kit is the next chapter's.
    move: async (page) => { await page.waitForTimeout(900); await glide(page, 700, 5600, DAY_LIST); await page.waitForTimeout(1200); },
  },
  share: {
    // From the day kit's heading down to the exports and the hand-over.
    ready: async (page) => {
      await open(page, `?paymock#day=${DAY}`, 18000);
      await page.waitForSelector('#dayk-h', { timeout: 60000 });
      await page.evaluate(() => {
        const h = document.querySelector('#dayk-h');
        h.scrollIntoView({ block: 'start' });
        let el = h.parentElement;
        while (el && el !== document.body) {
          const cs = getComputedStyle(el);
          if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop -= 120; return; }
          el = el.parentElement;
        }
      });
      await page.waitForTimeout(1500);
    },
    move: async (page) => { await page.waitForTimeout(900); await glide(page, 900, 5200, '#dayk-h'); await page.waitForTimeout(1600); },
  },
};

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

const browser = await chromium.launch();
let failed = 0;
for (const lang of LANGS) {
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  for (const [id, ch] of Object.entries(CHAPTERS)) {
    if (ONLY && !ONLY.has(id)) continue;
    const tmp = mkdtempSync(join(tmpdir(), `clip-${lang}-${id}-`));
    const ctx = await browser.newContext({
      viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: lang,
    });
    await ctx.addInitScript(({ seed, lang: l }) => {
      try {
        for (const [k, v] of seed) localStorage.setItem(k, v);
        localStorage.setItem('continent.lang.v1', l);
      } catch { /* storage unavailable */ }
    }, { seed: SEED, lang });
    const page = await ctx.newPage();
    try {
      await ch.ready(page);
      // Every step shows prices; a clip that starts before they and the
      // photos arrive opens on a half-drawn page.
      await page.waitForFunction(() => /\d/.test(document.body.innerText) && /€/.test(document.body.innerText)
        && [...document.images].every((i) => {
          const r = i.getBoundingClientRect();
          const onScreen = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
          return !onScreen || (i.complete && i.naturalWidth > 0);
        }), null, { timeout: 120000 });
      await page.waitForTimeout(600);
      // The move is captured through Chrome's screencast at device pixels
      // (Playwright's own video draws a 2x phone into a quarter of its frame):
      // a JPEG each time the screen changes, with the time it was drawn.
      const cdp = await ctx.newCDPSession(page);
      const frames = [];
      cdp.on('Page.screencastFrame', (f) => {
        frames.push({ data: f.data, t: f.metadata.timestamp });
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
      const startedAt = Date.now() / 1000;
      await ch.move(page);
      const endedAt = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      await ctx.close();
      if (frames.length < 2) throw new Error(`only ${frames.length} frame(s) captured`);
      // Each frame holds until the next one; the last until the move ended.
      const lines = [];
      frames.forEach((f, i) => {
        const name = `f${String(i).padStart(5, '0')}.jpg`;
        writeFileSync(join(tmp, name), Buffer.from(f.data, 'base64'));
        const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(f.t + 0.04, endedAt - startedAt + frames[0].t);
        lines.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
      });
      lines.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
      writeFileSync(join(tmp, 'frames.txt'), lines.join('\n'));
      const src = ['-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt')];
      // 546 by 1182: twice the phone frame's 273 px on the page, so it stays
      // sharp on a 2x screen at about half the bytes of the captured 780.
      const fit = `fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos:out_range=tv,format=yuv420p`;
      ffmpeg([...src, '-vf', fit, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-color_range', 'tv', '-movflags', '+faststart', join(dir, `${id}.mp4`)]);
      ffmpeg(['-i', join(tmp, 'f00000.jpg'), '-vf', `scale=${OUT_W}:${OUT_H}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '80', join(dir, `${id}.webp`)]);
      const kb = (f) => Math.round(statSync(join(dir, f)).size / 1024);
      console.log(`${lang}/${id}: ${(endedAt - startedAt).toFixed(1)} s, ${frames.length} frames, mp4 ${kb(`${id}.mp4`)} KB`);
    } catch (e) {
      failed += 1;
      console.error(`${lang}/${id} failed: ${e.message}`);
      await ctx.close().catch(() => {});
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}
await browser.close();
if (failed) {
  console.error(`${failed} clip(s) failed`);
  process.exit(1);
}
