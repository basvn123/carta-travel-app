// T849-T851 end check: trip page v4 Batch D (Days) on the NOPUBLIC build + public/, at 390, 1024 and 1440.
//   node walk-b.mjs [port] [outDir]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5836;
const OUT = process.argv[3] || 'C:/Users/Gebruiker/Documents/Portfolio/wt/v4d-shots';
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; return f;
}
const LIVE = fx('tf1-live-BRU-LJU.json');
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const s = normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-03', end: '2026-11-10', nights: 7 },
  trip: { name: 'Slovenia' },
});
const PLANNER = JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const TRIP = JSON.stringify({
  tripStart: '2026-11-03', tripEnd: '2026-11-10', planned: true, planLabel: 'Slovenia', groupSize: 2,
  stops: [{ destinationId: 'LJU', nights: 3, activities: [] }, { destinationId: 'gem:bled', nights: 4, activities: [] }],
});
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };
const txt = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
// The total as the Overview band holds it (data-total); the walk steps over and back.
const total = async (page) => {
  const tab = (name) => page.locator('.tpg-tabs [role="tab"]').filter({ hasText: name });
  const back = await page.locator('.tpg-tabs [aria-selected="true"]').first().innerText().catch(() => 'Itinerary');
  await tab('Overview').click(); await page.waitForTimeout(700);
  const v = Number(await page.locator('[data-total]').first().getAttribute('data-total').catch(() => 'NaN'));
  await tab(back.trim()).click(); await page.waitForTimeout(900);
  return v;
};

for (const W of (process.env.WIDTHS || '390,1024,1440').split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/BRU.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }));
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) }));
  await page.route('**/flights/_index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES }));
  await page.addInitScript(([pl, tr]) => { try {
    localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', pl); localStorage.setItem('carta.tripDraft.v1', tr); localStorage.setItem('carta.dayplan.tripdraft', JSON.stringify({ 0: { 0: [0, 1, 2] } })); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, [PLANNER, TRIP]);
  await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  const nav = (re) => page.locator('.header-nav-item:visible, nav.bottom-nav[aria-label="Sections"] .bottom-nav-item:visible').filter({ hasText: re }).first();
  await nav(/Plan/).click(); await page.waitForTimeout(2500);
  if (!(await page.locator('.tpg').count())) {
    await page.locator(':is(a,button):visible').filter({ hasText: 'Slovenia' }).first().click(); await page.waitForTimeout(3000);
  }
  ok(W, 'the trip page opens', await page.locator('.tpg').count() === 1);
  const tab = (name) => page.locator('.tpg-tabs [role="tab"]').filter({ hasText: name });
  const card = (n) => page.locator(`.tpd-day[data-day="${n}"]`);
  const openDays = async () => { await tab('Days').click(); await page.waitForTimeout(2500); };

  await step(W, 'day cards', async () => {
    await openDays();
    ok(W, 'a card for each of the 7 days', await page.locator('.tpd-day').count() === 7);
    const names = await card(1).locator('.tpd-places li').allInnerTexts();
    ok(W, 'day 1 lists its planned places by name', names.length >= 1 && names.every((n) => n.trim().length > 1), names.join(' | '));
    ok(W, 'an empty day says so', /Nothing planned yet/.test(await card(2).innerText()));
    ok(W, 'no price on the days', !/a person/.test(await txt(page, '.tpd')));
    ok(W, 'each day can be planned by hand', await page.locator('.tpd-day .tpd-acts .btn').count() === 7);
    ok(W, 'Let Carta plan the days is offered', await page.locator('.tpd-head .btn').filter({ hasText: 'Let Carta plan the days' }).count() === 1);
    ok(W, 'no sideways scroll on Days', await noSideways(page));
    await shot(page, `01-days-${W}`, true);
  });

  await step(W, 'own ideas', async () => {
    await page.locator('.tpi input').fill('Swim in Lake Bohinj');
    await page.locator('.tpi .btn').filter({ hasText: 'Add' }).click(); await page.waitForTimeout(800);
    ok(W, 'the idea is kept for later', /Swim in Lake Bohinj/.test(await txt(page, '.tpi-list')));
    await page.locator('.tpi-item select').first().selectOption('5'); await page.waitForTimeout(800);
    ok(W, 'put on day 5, it shows on that day', /Swim in Lake Bohinj/.test(await card(5).innerText()));
  });

  await step(W, 'a day in a few words', async () => {
    await card(2).locator('.tpd-note-add').click(); await page.waitForTimeout(300);
    await card(2).locator('textarea').fill('Old town, lazy lunch, castle at sunset');
    await card(2).locator('.btn').filter({ hasText: 'Save' }).click(); await page.waitForTimeout(800);
    const c2 = await card(2).innerText();
    ok(W, 'the few words show on the day', /castle at sunset/.test(c2));
    ok(W, 'a day with words is not "Nothing planned yet"', !/Nothing planned yet/.test(c2));
  });

  await step(W, 'pace per day', async () => {
    await card(3).locator('[role="radio"]').filter({ hasText: 'Packed' }).click(); await page.waitForTimeout(800);
    ok(W, 'day 3 is Packed', (await card(3).locator('[role="radio"][aria-checked="true"]').innerText()).includes('Packed'));
    ok(W, 'day 4 keeps the trip\'s pace', (await card(4).locator('[role="radio"][aria-checked="true"]').innerText()).includes('Balanced'));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('carta.dayprefs.tripdraft') || '{}'));
    ok(W, 'the pace is kept where the day planner reads it', stored?.dayPace?.['0-2'] === 'packed', JSON.stringify(stored?.dayPace || {}));
    await card(3).scrollIntoViewIfNeeded(); await shot(page, `02-day-cards-${W}`);
  });

  await step(W, 'kept after a reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    if (!(await page.locator('.tpg').count())) {
      await nav(/Plan/).click(); await page.waitForTimeout(2000);
      if (!(await page.locator('.tpg').count())) { await page.locator(':is(a,button):visible').filter({ hasText: 'Slovenia' }).first().click(); await page.waitForTimeout(3000); }
    }
    await openDays();
    ok(W, 'the idea, the words and the pace are still there',
      /Swim in Lake Bohinj/.test(await card(5).innerText())
      && /castle at sunset/.test(await card(2).innerText())
      && (await card(3).locator('[role="radio"][aria-checked="true"]').innerText()).includes('Packed'));
  });
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 2));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} of ${results.length} passed; ${errors.length} page or console errors`);
for (const e of errors.slice(0, 20)) console.log(e);
