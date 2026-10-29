// T840-T843 end check: trip page v4 Batch B on the NOPUBLIC build + public/, at 390, 1024 and 1440.
//   node walk-b.mjs [port] [outDir]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5836;
const OUT = process.argv[3] || 'C:/Users/Gebruiker/Documents/Portfolio/wt/v4b-shots';
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
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', pl); localStorage.setItem('carta.tripDraft.v1', tr); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, [PLANNER, TRIP]);
  await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  const nav = (re) => page.locator('.header-nav-item:visible, nav.bottom-nav[aria-label="Sections"] .bottom-nav-item:visible').filter({ hasText: re }).first();
  await nav(/Plan/).click(); await page.waitForTimeout(2500);
  if (!(await page.locator('.tpg').count())) {
    await page.locator(':is(a,button):visible').filter({ hasText: 'Slovenia' }).first().click(); await page.waitForTimeout(3000);
  }
  ok(W, 'the trip page opens', await page.locator('.tpg').count() === 1);
  await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Itinerary' }).click(); await page.waitForTimeout(2500);

  // T844: the route's flight cards carry no "Google Flights, checked" line.
  ok(W, 'no "Google Flights, checked" line on the route', !/Google Flights, checked/.test(await txt(page, '.tpg-main')));
  ok(W, 'the route still links out to Google Flights', await page.locator('.itin-route .flt-row-link, .itin-route a[href*="google"]').count() >= 1);
  await step(W, 'change flight', async () => {
    ok(W, 'a Change flight button on the flight rows', await page.locator('.itin-change-flight').count() >= 1, String(await page.locator('.itin-change-flight').count()));
    const before = await total(page);
    await page.locator('.itin-change-flight').first().click(); await page.waitForTimeout(1200);
    ok(W, 'Change flight opens', await page.locator('.tpf-sheet').count() === 1);
    const rows = await page.locator('.tpf-row').count();
    ok(W, 'the day\'s flights are listed', rows >= 2, String(rows));
    ok(W, 'no "Google Flights, checked" line in the sheet', !/Google Flights, checked/.test(await txt(page, '.tpf-sheet')));
    await shot(page, `01-change-flight-${W}`);
    await page.locator('.tpf-sheet [role="switch"]').first().click(); await page.waitForTimeout(800);
    const subs = await page.locator('.tpf-sub').allInnerTexts();
    ok(W, 'Direct flights only leaves only direct flights', subs.length > 0 && subs.every((x) => /Direct/.test(x)), subs.join(' | '));
    await page.locator('.tpf-sheet [role="switch"]').first().click(); await page.waitForTimeout(600);
    const other = page.locator('.tpf-row:not(.is-on)').first();
    if (await other.count()) {
      await other.click(); await page.waitForTimeout(1500);
      ok(W, 'picking a flight makes it the trip\'s flight', (await page.locator('.tpf-row.is-on').count()) === 1);
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    const after = await total(page);
    ok(W, 'the total follows the picked flight', Number.isFinite(after) && after !== before, `${before} to ${after}`);
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click().catch(() => {}); await page.waitForTimeout(1200);
    ok(W, 'Undo restores the flight and the total', (await total(page)) === before, String(await total(page)));
  });

  await step(W, 'swap city', async () => {
    const name2 = await txt(page, '.itin-stopcard.is-editable >> nth=1 >> .itin-stop-city');
    await page.locator('.itin-swap').nth(1).click(); await page.waitForTimeout(1000);
    ok(W, 'Swap city opens', await page.locator('.tps-sheet').count() === 1);
    ok(W, 'I know where lists the nearest places', await page.locator('.tps-row').count() >= 3);
    await page.locator('.tps-sheet input').first().fill('Piran'); await page.waitForTimeout(600);
    ok(W, 'search finds Piran', /Piran/.test(await txt(page, '.tps-row .tps-name')));
    await page.locator('.tps-sheet [role="radio"]').filter({ hasText: 'Help me choose' }).click(); await page.waitForTimeout(600);
    await page.locator('.tps-chips button').filter({ hasText: /Lakes/ }).first().click(); await page.waitForTimeout(800);
    ok(W, 'Help me choose lists Carta\'s picks', await page.locator('.tps-row').count() >= 1);
    await shot(page, `02-swap-help-${W}`);
    const pick = await txt(page, '.tps-row .tps-name');
    await page.locator('.tps-row').first().click(); await page.waitForTimeout(1500);
    const now2 = await txt(page, '.itin-stopcard.is-editable >> nth=1 >> .itin-stop-city');
    ok(W, 'the stop is swapped', now2 !== name2 && now2.includes(pick.split(' ')[0]), `${name2} to ${now2}`);
    ok(W, 'the Undo message names the swap', /Swapped in/.test(await txt(page, '.tpg-undo')));
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click(); await page.waitForTimeout(1200);
    ok(W, 'Undo brings the stop back', (await txt(page, '.itin-stopcard.is-editable >> nth=1 >> .itin-stop-city')) === name2);
  });

  await step(W, 'stay per stop', async () => {
    const sel = page.locator('.itin-stay select').first();
    ok(W, 'each stop offers its own stay type', await page.locator('.itin-stay select').count() === 2);
    const before = await total(page);
    const values = await sel.locator('option').evaluateAll((o) => o.map((x) => x.value));
    const pickV = values.includes('dorm') ? 'dorm' : values.find((v) => v && v !== 'home');
    await sel.selectOption(pickV); await page.waitForTimeout(1500);
    ok(W, 'a stop\'s own stay type changes the total', (await total(page)) !== before, `${before} to ${await total(page)} (${pickV})`);
    await page.locator('.itin-stopcard.is-editable').first().scrollIntoViewIfNeeded();
    await shot(page, `03-stay-${W}`);
  });

  await step(W, 'day trip', async () => {
    const before = await total(page);
    await page.locator('.itin-daytrips .btn').filter({ hasText: 'Add a day trip' }).first().click(); await page.waitForTimeout(1000);
    ok(W, 'Add a day trip opens', await page.locator('.tps-sheet').count() === 1);
    ok(W, 'places within a day out are listed', await page.locator('.tps-row').count() >= 1);
    await shot(page, `04-daytrip-picker-${W}`);
    await page.locator('.tps-row').first().click(); await page.waitForTimeout(1500);
    ok(W, 'the day trip shows on its stop', await page.locator('.itin-daytrip').count() === 1, await txt(page, '.itin-daytrip'));
    ok(W, 'the day trip adds to the total', (await total(page)) > before, `${before} to ${await total(page)}`);
    await page.locator('.itin-daytrip').first().scrollIntoViewIfNeeded(); await shot(page, `05-daytrip-${W}`);
    ok(W, 'no sideways scroll on Itinerary', await noSideways(page));
    await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Costs' }).click(); await page.waitForTimeout(1200);
    ok(W, 'Costs has a Day trips line', /Day trips/.test(await txt(page, '.tpg-main')));
    await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Days' }).click(); await page.waitForTimeout(1200);
    ok(W, 'Days names the day out', /a day out from/.test(await txt(page, '.tpg-main')));
    await shot(page, `06-days-${W}`);
  });
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 2));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} of ${results.length} passed; ${errors.length} page or console errors`);
for (const e of errors.slice(0, 20)) console.log(e);
