// T441: how long Explore's map takes to answer, from pressing Map to
//   (a) a visible map canvas, and
//   (b) the first price label on the map.
// Three runs each, desktop (1440 x 900) and phone (390 x 844, 4x CPU
// throttle), against a served build. The median is reported.
//
//   npx vite build && npx vite preview --port 5231
//   node scripts/measure_explore_map.mjs 5231 [label]
//
// Run it before and after a change on the same machine; the absolute
// figures depend on the machine and the network to the basemap host.
import { chromium, devices } from 'playwright';

const [port = '5231', label = 'run'] = process.argv.slice(2);
const browser = await chromium.launch();
const out = [];
const VIEWS = [
  ['desk', { viewport: { width: 1440, height: 900 } }],
  ['phone', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }],
];
for (const [vp, opts] of VIEWS) {
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('continent.lang.v1', 'en');
        localStorage.setItem('continent.guestMode.v1', '1');
        localStorage.setItem('continent.homeSeen.v1', '1');
        localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      } catch { /* storage unavailable */ }
    });
    const page = await ctx.newPage();
    if (vp === 'phone') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.goto(`http://localhost:${port}/?tab=map`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.keyboard.press('Escape');
    // The Map control: the desktop switch or the phone's floating one.
    const btn = page.locator(':is(button, [role="radio"]):visible', { hasText: /^\s*Map\s*$/ }).first();
    const t0 = await page.evaluate(() => performance.now());
    await btn.click();
    const canvas = await page.waitForFunction(() => {
      const m = document.querySelector('.xmap.is-ready .maplibregl-canvas');
      return m && m.getBoundingClientRect().height > 50 ? performance.now() : false;
    }, null, { timeout: 30000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    const price = await page.waitForFunction(() => {
      const l = [...document.querySelectorAll('.xmap-kpin.is-label')].find((e) => e.getBoundingClientRect().width > 0);
      return l ? performance.now() : false;
    }, null, { timeout: 15000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    out.push({ vp, run, canvasMs: canvas ? Math.round(canvas - t0) : null, firstPriceMs: price ? Math.round(price - t0) : null });
    await ctx.close();
  }
}
await browser.close();
const med = (a) => {
  const v = a.filter((x) => x != null).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
for (const vp of ['desk', 'phone']) {
  const r = out.filter((x) => x.vp === vp);
  console.log(JSON.stringify({
    label, vp,
    canvasMedianMs: med(r.map((x) => x.canvasMs)),
    firstPriceMedianMs: med(r.map((x) => x.firstPriceMs)),
    runs: r.map((x) => [x.canvasMs, x.firstPriceMs]),
  }));
}
