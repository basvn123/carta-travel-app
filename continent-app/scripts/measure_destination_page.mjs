// Measures the destination page the way the T429 report states it, so the
// before and after figures come from one committed method (the T427 word
// count lived in a scratchpad and was lost).
//
//   node scripts/measure_destination_page.mjs [--port=5231] [--shots=<dir>] [--label=before]
//
// Serve a LOCAL build first (npm run build, then npx vite preview --port N):
// a build:pages bundle fetches its data from the live data host, which does
// not answer localhost. Prints one JSON line per page and viewport:
//
//   words        words in text visible on the first screen inside the page
//                (aria-hidden and screen-reader-only text left out)
//   height       the page's scroll height in px
//   folds        collapsed-or-collapsible sections (.dsec-toggle)
//   open         sections open without a click (section[id^="sec-"] whose
//                body shows without a toggle)
//   small        controls under 44 px on a touch viewport (inline links in
//                running text are left out, as in verify_quality_floor)
//   whenScreens  where "When to go" starts, in screens of the page's scroller
//   primary      whether the page's one primary is fully in view at load
//   primaries    how many primaries the page draws
//   day          the day figure the page prints, as text
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PORT = arg('port', process.env.CARTA_PORT || '5231');
const SHOTS = arg('shots', '');
const LABEL = arg('label', 'now');
const BASE = `http://localhost:${PORT}/`;
const PAGES = [['rome', 'FCO'], ['valbona', 'gem:valbona']];
const VIEWS = [
  ['phone', { width: 390, height: 844 }, true],
  ['desk1280', { width: 1280, height: 720 }, false],
  ['desk1440', { width: 1440, height: 900 }, false],
];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
for (const [name, id] of PAGES) {
  for (const [view, viewport, touch] of VIEWS) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    await page.addInitScript(() => {
      try {
        for (const [k, v] of [['continent.lang.v1', 'en'], ['continent.guestMode.v1', '1'],
          ['continent.homeSeen.v1', '1'], ['continent.mapGuideDismissed.v1', '1'], ['carta.welcomeSeen.v1', '1']]) {
          localStorage.setItem(k, v);
        }
        sessionStorage.clear();
      } catch { /* storage unavailable */ }
    });
    await page.goto(`${BASE}#dest=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.destp .destp-head', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate((isTouch) => {
      const root = document.querySelector('.destp');
      const scroller = root.querySelector('.destp-scroll');
      const vh = window.innerHeight;
      const hidden = (el) => !!el.closest('[aria-hidden="true"], .sr-only, .frr-sr');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let words = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent.trim();
        if (!text || !n.parentElement || hidden(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= vh) continue;
        const cs = getComputedStyle(n.parentElement);
        if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        words += text.split(/\s+/).filter(Boolean).length;
      }
      const controls = [...root.querySelectorAll('button, a[href], select, input, [role="tab"]')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (el.tagName === 'A' && el.closest('p') && getComputedStyle(el).display === 'inline') return false;
        // A card's title link is stretched over the whole card (kit Card):
        // the card is the target, not the line of text.
        if (el.classList.contains('card-open') && el.closest('.card.is-interactive')) return false;
        return true;
      });
      const small = isTouch ? controls.filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) < 43.5;
      }).map((el) => (el.className && String(el.className).split(' ')[0]) || el.tagName) : [];
      const prims = [...root.querySelectorAll('.btn-primary, .destp-plan-btn:not(.is-quiet):not(.is-day):not(.btn)')]
        .filter((el) => el.getBoundingClientRect().width > 0);
      const prim = prims[0];
      const pr = prim?.getBoundingClientRect();
      const when = root.querySelector('#sec-when');
      const sr = scroller.getBoundingClientRect();
      const day = root.querySelector('.dprice-day .money, .dfact dd');
      return {
        words,
        height: scroller.scrollHeight,
        folds: root.querySelectorAll('.dsec-toggle').length,
        open: [...root.querySelectorAll('section[id^="sec-"]')].filter((s) => !s.querySelector(':scope > .dsec-head .dsec-toggle')).length,
        small: small.length,
        smallWhich: [...new Set(small)].slice(0, 8),
        whenScreens: when ? +((when.getBoundingClientRect().top - sr.top) / scroller.clientHeight).toFixed(2) : null,
        primary: pr ? pr.top >= 0 && pr.bottom <= vh : false,
        primaries: prims.length,
        day: day ? day.textContent.trim() : null,
      };
    }, touch);
    console.log(JSON.stringify({ label: LABEL, page: name, view, ...m }));
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/${LABEL}-${name}-${view}-1.png` });
      await page.evaluate(() => document.querySelector('.destp-scroll').scrollBy(0, window.innerHeight - 80));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/${LABEL}-${name}-${view}-2.png` });
    }
    await page.close();
  }
}
await browser.close();
