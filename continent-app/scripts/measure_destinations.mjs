// Measures the Destinations tab the way the T428 report states it, so the
// before and after figures come from one committed method.
//
//   node scripts/measure_destinations.mjs [--port=5298] [--shots=<dir>] [--label=before] [--cats=trips,trails]
//
// Serve a LOCAL build first (npm run build, then npx vite preview --port N):
// a build:pages bundle fetches its data from the live data host, which does
// not answer localhost. Prints one JSON line per section and viewport:
//
//   words      words in text visible on the first screen inside the tab
//              (aria-hidden and screen-reader-only text left out)
//   height     the tab scroller's scroll height in px, after the section
//              has settled (the opening plus the first page of the list)
//   numbers    visible text nodes on the whole tab that state a bare count:
//              a standalone figure that is not money, a distance, a height,
//              a duration, a score or a month day (the owner's "24 trips",
//              "8" on a country card, "See all 37", "1 to 4 of 12")
//   countHits  the first few of those, as text, so a reader can judge them
//   buttons    raw <button> elements on the tab that are not kit buttons
//   photos     photographs drawn on the first two screens
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PORT = arg('port', process.env.CARTA_PORT || '5298');
const SHOTS = arg('shots', '');
const LABEL = arg('label', 'now');
const BASE = `http://localhost:${PORT}/?tab=places`;
const CATS = arg('cats', 'trips,trails,beaches,lakes,mountains,cycling').split(',');
const VIEWS = [
  ['phone', { width: 390, height: 844 }, true],
  ['desk1440', { width: 1440, height: 900 }, false],
];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
for (const cat of CATS) {
  for (const [view, viewport, touch] of VIEWS) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await page.addInitScript((c) => {
      try {
        for (const [k, v] of [['continent.lang.v1', 'en'], ['continent.guestMode.v1', '1'],
          ['continent.homeSeen.v1', '1'], ['continent.mapGuideDismissed.v1', '1'], ['carta.welcomeSeen.v1', '1'],
          ['carta.places.v1', JSON.stringify({ cat: c, country: '', near: null })]]) {
          localStorage.setItem(k, v);
        }
        sessionStorage.clear();
      } catch { /* storage unavailable */ }
    }, cat);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.places-tab', { timeout: 60000 });
    await page.waitForTimeout(4000);
    const m = await page.evaluate((isTouch) => {
      const root = document.querySelector('.places-shell') || document.querySelector('.places-tab');
      const scroller = document.querySelector('.places-tab');
      const vh = window.innerHeight;
      const hidden = (el) => !!el.closest('[aria-hidden="true"], .sr-only, .frr-sr');
      const shown = (el) => {
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
      };
      const UNIT = /(€|km|\bm\b|days?|nights?|hours?|h\b|min|%|°|\/10|est\.)/i;
      const COUNTISH = /(^|\s|\()\d{1,4}(\s|\)|$)/;
      let words = 0;
      const countHits = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent.trim();
        const el = n.parentElement;
        if (!text || !el || hidden(el) || !shown(el)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom > 0 && r.top < vh) words += text.split(/\s+/).filter(Boolean).length;
        if (el.closest('.money, .score-chip, .rating-badge, time')) continue;
        if (COUNTISH.test(text) && !UNIT.test(text)) countHits.push(text.slice(0, 60));
      }
      const buttons = [...root.querySelectorAll('button')].filter((b) => !b.classList.contains('btn')
        && !b.classList.contains('icon-btn') && !b.classList.contains('chip') && b.getBoundingClientRect().width > 0).length;
      const photos = [...root.querySelectorAll('img')].filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 40 && r.top < vh * 2 && r.bottom > 0;
      }).length;
      return {
        words,
        height: scroller ? scroller.scrollHeight : null,
        numbers: countHits.length,
        countHits: countHits.slice(0, 10),
        buttons,
        photos,
        isTouch,
      };
    }, touch);
    console.log(JSON.stringify({ label: LABEL, cat, view, ...m }));
    if (SHOTS) {
      for (let i = 1; i <= 3; i++) {
        await page.screenshot({ path: `${SHOTS}/${LABEL}-${cat}-${view}-${i}.png` });
        const more = await page.evaluate(() => {
          const s = document.querySelector('.places-tab');
          const before = s.scrollTop;
          s.scrollBy(0, window.innerHeight - 80);
          return s.scrollTop !== before;
        });
        if (!more) break;
        await page.waitForTimeout(900);
      }
    }
    await page.close();
  }
}
await browser.close();
