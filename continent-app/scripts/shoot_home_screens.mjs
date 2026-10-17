/**
 * The home page's screens (T463): real captures of the running app, in all
 * six languages, for the phone and browser frames on the home page.
 *
 * Every screen is the app itself opened through a real link, so the home
 * page never shows a picture the app cannot reach:
 *
 *   find      Explore, "Lakes in the Alps in July" (?tab=map&xe=lake&xa=alps&xm=7)
 *   place     Lake Bled's page (#dest=gem:bled)
 *   trip      the Julian Alps trip (#trip=), its total at the top (the hero)
 *   plan      the same trip, scrolled to its priced route
 *   day       a day at Lake Bled (#day=), four catalogue places, timed
 *   share     the same day, scrolled to its day kit and "Export and share"
 *   desk      the Julian Alps trip on a laptop, receipt beside the map
 *
 * The trip and the day travel inside their links (lib/shareLink.js), so the
 * captures need no account. ?paymock opens the planned views a pass holder
 * sees; the seam only exists on the dev server.
 *
 * Output: public/home/<lang>/<screen>.webp, phone screens 600 px wide
 * (2x of the frame on desktop), the laptop screen 1728 px wide: the app at
 * 1152x720 and 1.5x, so the hero's large laptop shows it close to its own
 * size and its figures stay readable (T464; at 1440 px the hero drew it at
 * 0.41 and 14 px text came out under 6 px).
 *
 * It does not start a server. Serve the app first (never `npm run dev`,
 * whose predev rewrites public/):
 *   npx vite --port 5203 --strictPort
 *   node scripts/shoot_home_screens.mjs --port=5203 [--lang=en,de] [--only=plan,day]
 * Run it again whenever a captured screen changes.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'home');

const link = (obj) => `1.${deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64url')}`;

// The home page's story: three towns in the Julian Alps, then one day at the
// lake (Bled Gorge, Bled Castle, St Martin's Church, Bled Island, by their
// index in public/poi/gem_3Abled.json).
const TRIP = link({
  stops: [{ destinationId: 'LJU', nights: 2 }, { destinationId: 'gem:bled', nights: 3 }, { destinationId: 'gem:bohinj', nights: 2 }],
  groupSize: 2, transportPref: 'public', tripStart: '2027-07-03', label: 'Julian Alps',
});
const DAY = link({
  v: 1, label: 'Lake Bled', start: '2027-07-05',
  stay: { lat: 46.3667, lon: 14.1112, label: 'Bled' },
  stops: [{ d: 'gem:bled', n: 1 }], a: { 0: { 0: [4, 2, 36, 34] } },
});

// Toasts and notices are moments, not the screen.
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

async function context(browser, lang, phone) {
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: lang }
    : { viewport: { width: 1152, height: 720 }, deviceScaleFactor: 1.5, locale: lang });
  await ctx.addInitScript(({ seed, lang: l }) => {
    try {
      for (const [k, v] of seed) localStorage.setItem(k, v);
      localStorage.setItem('continent.lang.v1', l);
    } catch { /* storage unavailable */ }
  }, { seed: SEED, lang });
  return ctx;
}

async function open(page, path, settle = 9000) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.addStyleTag({ content: QUIET_CSS });
  await page.waitForTimeout(settle);
}

/** Scroll a heading to the top of whatever scrolls it, under the app bar. */
async function scrollToHeading(page, sel, offset) {
  await page.evaluate(([s, off]) => {
    const h = document.querySelector(s);
    if (!h) return;
    h.scrollIntoView({ block: 'start' });
    let el = h.parentElement;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop -= off; return; }
      el = el.parentElement;
    }
    window.scrollBy(0, -off);
  }, [sel, offset]);
  await page.waitForTimeout(1500);
}

async function openSharedTrip(page) {
  await open(page, `?paymock#trip=${TRIP}`, 7000);
  await page.locator('.share-trip-actions .guide-next').first().click({ timeout: 60000 });
  await page.waitForTimeout(9000);
  if (await page.locator('.pass-overlay').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
}

const PHONE = {
  find: async (page) => {
    await open(page, '?tab=map&xe=lake&xa=alps&xm=7', 12000);
  },
  place: async (page) => {
    await open(page, '#dest=gem%3Abled', 10000);
  },
  trip: async (page) => {
    await openSharedTrip(page);
  },
  plan: async (page) => {
    await openSharedTrip(page);
    await scrollToHeading(page, '#itin-route-h', 24);
  },
  day: async (page) => {
    await open(page, `?paymock#day=${DAY}`, 14000);
  },
  share: async (page) => {
    await open(page, `?paymock#day=${DAY}`, 14000);
    // The day's last stop whole at the top, the day kit and the exports
    // under it (the page ends there, so a heading cannot reach the top).
    await page.evaluate(() => {
      const stops = [...document.querySelectorAll('.dayw-stop, .itin-stop, [data-stop]')];
      (stops[stops.length - 1] || document.querySelector('#dayk-h'))?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const h = document.querySelector('#dayk-h');
      if (!h) return;
      const top = h.getBoundingClientRect().top;
      // About 320 px of the day above the kit: the last stop and "Day done".
      let el = h.parentElement;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop += top - 320; return; }
        el = el.parentElement;
      }
      window.scrollBy(0, top - 320);
    });
    await page.waitForTimeout(1500);
  },
};

const DESK = {
  desk: async (page) => {
    await openSharedTrip(page);
  },
};

/** A PNG screenshot, resized in the browser and encoded as WebP. */
async function toWebp(page, png, width, quality = 0.82) {
  return page.evaluate(async ({ b64, w, q }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, { b64: png.toString('base64'), w: width, q: quality });
}

const browser = await chromium.launch();
const encoder = await (await browser.newContext()).newPage();
let failed = 0;
for (const lang of LANGS) {
  const dir = join(OUT, lang);
  mkdirSync(dir, { recursive: true });
  for (const [set, phone, width] of [[PHONE, true, 600], [DESK, false, 1728]]) {
    for (const [name, go] of Object.entries(set)) {
      if (ONLY && !ONLY.has(name)) continue;
      const ctx = await context(browser, lang, phone);
      const page = await ctx.newPage();
      try {
        await go(page);
        // Every screen shows prices; a capture before they and the photos
        // have arrived is a blank or half-drawn page.
        await page.waitForFunction(() => /\d/.test(document.body.innerText) && /€/.test(document.body.innerText)
          && [...document.images].every((i) => {
            const r = i.getBoundingClientRect();
            const onScreen = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
            return !onScreen || (i.complete && i.naturalWidth > 0);
          }), null, { timeout: 120000 });
        await page.waitForTimeout(1000);
        // A page opened from a link focuses its first control; a capture is
        // a screen at rest, not a keyboard user's.
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.waitForTimeout(300);
        const png = await page.screenshot();
        const webp = await toWebp(encoder, png, width);
        writeFileSync(join(dir, `${name}.webp`), Buffer.from(webp, 'base64'));
        console.log(`ok    ${lang}/${name}.webp  ${Math.round(webp.length * 0.75 / 1024)} KB`);
      } catch (e) {
        failed += 1;
        console.log(`FAIL  ${lang}/${name}  ${String(e).split('\n')[0].slice(0, 160)}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
