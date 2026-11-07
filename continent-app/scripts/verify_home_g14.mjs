// T1209 (ROADMAP G14): DOM check of the G14 home behind its flag.
//
//   node scripts/verify_home_g14.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// Point it at a dev server or any static serve of a build with public/ data
// (boot.json). It checks, at 390 x 844 and 1440 x 900:
//   - without ?home= the page is today's home (the flag is off), not G14;
//   - with ?home=g14: one h1 with the promise, the example card with a
//     euro total and two lines (or no card at all, never an empty one),
//     the doors to Explore, the sample trip and the example place, the
//     waitlist form and the share button, no horizontal scroll, and every
//     control in the page body at least 44 px tall (the site footer aside);
//   - ?home=v3 goes back to today's home for the session.
// CHROMIUM_PATH picks a browser other than Playwright's own.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`).replace(/\/?$/, '/');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`); };

for (const vp of [{ label: 'phone', width: 390, height: 844 }, { label: 'desktop', width: 1440, height: 900 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}?tab=home`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  check(await page.locator('[data-testid="home-g14"]').count() === 0, `${vp.label}: the flag is off, today's home shows`);

  await page.goto(`${BASE}?tab=home&home=g14`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="home-g14"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="home-g14"]');
    const q = (s) => root.querySelector(s);
    const body = [...root.querySelectorAll('a, button, input')].filter((e) => !e.closest('.site-footer'));
    return {
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      card: !!q('.hg-card'),
      total: q('.hg-total-fig')?.textContent || '',
      lines: root.querySelectorAll('.hg-line').length,
      explore: !!q('.hg-doors a.btn'),
      sample: q('.hg-link')?.getAttribute('href') || '',
      place: q('.hg-foot a')?.getAttribute('href') || '',
      waitlist: !!q('[data-testid="waitlist"] input[type="email"]'),
      share: !!q('.hg-share button'),
      hscroll: document.documentElement.scrollWidth > window.innerWidth || root.scrollWidth > root.clientWidth,
      small: body.filter((e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.height < 44; }).map((e) => e.className),
    };
  });
  check(r.h1.length === 1 && r.h1[0].length > 0, `${vp.label}: one h1 (${r.h1[0] || 'none'})`);
  check(!r.card || (/\d/.test(r.total) && r.lines === 2), `${vp.label}: the example card is whole or absent (${r.total || 'no card'})`);
  check(r.explore, `${vp.label}: the Explore door`);
  check(/^#journey=/.test(r.sample), `${vp.label}: the sample trip door (${r.sample})`);
  check(!r.card || /^#dest=/.test(r.place), `${vp.label}: the example place door`);
  check(r.waitlist && r.share, `${vp.label}: the waitlist and the share button`);
  check(!r.hscroll, `${vp.label}: no horizontal scroll`);
  check(r.small.length === 0, `${vp.label}: 44 px targets (${r.small.join(', ') || 'all'})`);

  await page.goto(`${BASE}?tab=home&home=v3`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  check(await page.locator('[data-testid="home-g14"]').count() === 0, `${vp.label}: ?home=v3 goes back`);
  await ctx.close();
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log('\nSUCCESS: the G14 home holds at phone and desktop.');
