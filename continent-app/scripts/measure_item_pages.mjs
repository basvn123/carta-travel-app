// Measures the item pages (trail, beach, lake, mountain, cycle route, cycle
// tour) and the trips surfaces (a style's list, a trip page) the way the T430
// and T431 reports state them, so the before and after figures come from one
// committed method. The Destinations openings are measured by
// measure_destinations.mjs.
//
//   node scripts/measure_item_pages.mjs [--port=5298] [--shots=<dir>] [--label=before] [--only=trail,trip]
//
// Serve a LOCAL build first (npx vite build, then npx vite preview --port N).
// Prints one JSON line per page and viewport:
//
//   words      words in text visible on the first screen inside the page
//              (aria-hidden and screen-reader-only text left out)
//   sentences  sentences of visible prose on the whole page with folds as
//              they open (text runs ending in . ! or ?)
//   longRuns   paragraphs of more than 25 words on the whole page
//   photos     photographs drawn on the whole page, and on the first screen
//   folds      controls that open or close a section (aria-expanded)
//   height     the page scroller's scroll height in px
//   small      controls under 44 px on a touch viewport
//   primaries  primary buttons on the page
//   clipped    titles cut with an ellipsis or a line clamp (h1 to h3 and
//              card titles whose text overflows their box)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PORT = arg('port', process.env.CARTA_PORT || '5298');
const SHOTS = arg('shots', '');
const LABEL = arg('label', 'now');
const ONLY = arg('only', '');
const BASE = `http://localhost:${PORT}/?tab=places`;
const PAGES = [
  ['trail', '#trail=20050&tc=AT'],
  ['beach', '#beach=es-es-trenc-Q11919677&bc=ES'],
  ['lake', '#lake=si-lake-bled-Q648902&lc=SI'],
  ['mountain', '#mtn=mk-mount-korab-Q912579&mc=MK'],
  ['cycle', '#cycle=10&cc=LU'],
  ['tour', '#tour=de-ammer-amper-radweg-balanced'],
  ['trip', '#journey=ad-hiking-coma-pedrosa-madriu'],
  ['triplist', null],
].filter(([name]) => !ONLY || ONLY.split(',').includes(name));
const VIEWS = [
  ['phone', { width: 390, height: 844 }, true],
  ['desk1440', { width: 1440, height: 900 }, false],
];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
for (const [name, hash] of PAGES) {
  for (const [view, viewport, touch] of VIEWS) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await page.addInitScript((cat) => {
      try {
        for (const [k, v] of [['continent.lang.v1', 'en'], ['continent.guestMode.v1', '1'],
          ['continent.homeSeen.v1', '1'], ['continent.mapGuideDismissed.v1', '1'], ['carta.welcomeSeen.v1', '1'],
          ['carta.places.v1', JSON.stringify({ cat, country: '', near: null })]]) {
          localStorage.setItem(k, v);
        }
        sessionStorage.clear();
      } catch { /* storage unavailable */ }
    }, hash ? 'trails' : 'trips');
    let rootSel = '.tpage';
    let scrollSel = '.tpage .tpage-scroll';
    if (hash) {
      await page.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const ok = await page.waitForSelector('.tpage h1', { timeout: 60000 }).then(() => true, () => false);
      if (!ok) { console.log(JSON.stringify({ label: LABEL, page: name, view, error: 'no page' })); await page.close(); continue; }
    } else {
      // A style's list: open Trips, then the hiking style.
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.places-tab', { timeout: 60000 });
      await page.waitForTimeout(3000);
      const style = page.locator('.jsec .card, .jstyle-card').filter({ hasText: /Hiking/ }).first();
      await style.locator('a, button').first().click({ timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
      rootSel = '.places-shell';
      scrollSel = '.places-tab';
    }
    await page.waitForTimeout(3500);
    const m = await page.evaluate(({ isTouch, rootSel, scrollSel }) => {
      const root = document.querySelector(rootSel) || document.body;
      const scroller = document.querySelector(scrollSel) || document.scrollingElement;
      const vh = window.innerHeight;
      const hidden = (el) => !!el.closest('[aria-hidden="true"], .sr-only, .frr-sr');
      const visibleText = (onlyFirstScreen) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent.trim();
          if (!text || !n.parentElement || hidden(n.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (onlyFirstScreen && (r.bottom <= 0 || r.top >= vh)) continue;
          const cs = getComputedStyle(n.parentElement);
          if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
          out.push(text);
        }
        return out;
      };
      const words = visibleText(true).join(' ').split(/\s+/).filter(Boolean).length;
      const blocks = [...root.querySelectorAll('p, li, dd, blockquote')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !hidden(el);
      });
      let sentences = 0;
      let longRuns = 0;
      for (const b of blocks) {
        if (b.querySelector('p, li')) continue;
        const text = b.textContent.trim();
        sentences += (text.match(/[a-z0-9)][.!?](\s|$)/gi) || []).length;
        if (text.split(/\s+/).length > 25) longRuns += 1;
      }
      const imgs = [...root.querySelectorAll('img')].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width > 40 && r.height > 40 && !img.closest('[aria-hidden="true"]');
      });
      const photosFirst = imgs.filter((img) => {
        const r = img.getBoundingClientRect();
        return r.top < vh && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
      }).length;
      const controls = [...root.querySelectorAll('button, a[href], select, input, [role="tab"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.tagName === 'A' && el.closest('p') && getComputedStyle(el).display === 'inline') return false;
        if (el.classList.contains('card-open') && el.closest('.card.is-interactive')) return false;
        return true;
      });
      const small = isTouch ? controls.filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) < 43.5;
      }).map((el) => (el.className && String(el.className).split(' ')[0]) || el.tagName) : [];
      const prims = [...root.querySelectorAll('.btn-primary')].filter((el) => el.getBoundingClientRect().width > 0);
      const titles = [...root.querySelectorAll('h1, h2, h3, .card-title')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return false;
        return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2;
      });
      return {
        words,
        sentences,
        longRuns,
        photos: imgs.length,
        photosFirst,
        folds: root.querySelectorAll('[aria-expanded]').length,
        height: scroller ? scroller.scrollHeight : null,
        small: small.length,
        smallWhich: [...new Set(small)].slice(0, 8),
        primaries: prims.length,
        clipped: titles.length,
        clippedWhich: titles.slice(0, 5).map((el) => el.textContent.trim().slice(0, 50)),
      };
    }, { isTouch: touch, rootSel, scrollSel });
    console.log(JSON.stringify({ label: LABEL, page: name, view, ...m }));
    if (SHOTS) {
      for (let i = 1; i <= 4; i += 1) {
        await page.screenshot({ path: `${SHOTS}/${LABEL}-${name}-${view}-${i}.png` });
        const moved = await page.evaluate((sel) => {
          const s = document.querySelector(sel);
          if (!s) return false;
          const before = s.scrollTop;
          s.scrollBy(0, window.innerHeight - 100);
          return s.scrollTop !== before;
        }, scrollSel);
        if (!moved) break;
        await page.waitForTimeout(1200);
      }
    }
    await page.close();
  }
}
await browser.close();
