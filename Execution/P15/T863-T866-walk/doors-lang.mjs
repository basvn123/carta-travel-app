// T863: the doors in the longest translations at 375 and 1440: every title inside its tile.
//   node doors-lang.mjs <port>
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5863;
const s = normalizeSettings({ answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from', 'way', 'airports'], party: { kind: 'couple', adults: 2 },
  when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 }, from: { name: 'Ghent', lat: 51.054, lng: 3.717 }, trip: { name: 'Door week', created: Date.now() } });
const draft = JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const browser = await chromium.launch();
let fails = 0;
for (const lang of ['de', 'nl', 'fr', 'es', 'it']) for (const W of [375, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 812 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([dd, l]) => { localStorage.setItem('continent.lang.v1', l); localStorage.setItem('continent.guestMode.v1', '1'); localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', dd); sessionStorage.setItem('seeded', '1'); } }, [draft, lang]);
  await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').filter({ hasText: /Plan|Pianific/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('.pf-trip-link').first().click(); await page.waitForTimeout(1200);
  await page.locator('.pf-home .pf-foot .btn-primary').click(); await page.waitForTimeout(800);
  const r = await page.locator('.pf-door').evaluateAll((els) => els.map((e) => {
    const l = e.querySelector('.ui-tile-label'); const b = e.getBoundingClientRect(); const lb = l.getBoundingClientRect();
    return { t: l.innerText, fit: l.scrollWidth <= l.clientWidth + 1 && lb.right <= b.right + 1 && lb.bottom <= b.bottom + 1 };
  }));
  const side = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const ok = r.length === 4 && r.every((x) => x.fit) && side;
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${lang} ${W}: ${r.map((x) => x.t).join(' | ')}`);
  if (lang === 'de' && W === 375) await page.screenshot({ path: `${APP}/../Execution/P15/T863-T866-walk/after/11-doors-de-375.png` });
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} failed` : 'all fit');
