// T835-T839 end check: the trip page v4 Batch A on the dev server, at 390, 1024 and 1440.
//   node walk-a.mjs [port] [outDir]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5173;
const OUT = process.argv[3] || 'C:/Users/Gebruiker/Documents/Portfolio/wt/v4a-shots';
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const s = normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 },
  trip: { name: 'Austria' },
});
const PLANNER = JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const TRIP = JSON.stringify({
  tripStart: '2026-11-21', tripEnd: '2026-11-28', planned: true, planLabel: 'Austria', groupSize: 2,
  stops: [{ destinationId: 'gem:hallstatt', nights: 4, activities: [] }, { destinationId: 'SZG', nights: 3, activities: [] }],
});
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };
const txt = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

for (const W of (process.env.WIDTHS || '390,1024,1440').split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/BRU.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }));
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' }));
  await page.route('**/flights/_index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES }));
  await page.addInitScript(([pl, tr]) => { try {
    localStorage.setItem('continent.lang.v1', 'en'); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', pl); localStorage.setItem('carta.tripDraft.v1', tr); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, [PLANNER, TRIP]);
  await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForTimeout(3000);
  const nav = (re) => page.locator('.header-nav-item:visible, nav.bottom-nav[aria-label="Sections"] .bottom-nav-item:visible').filter({ hasText: re }).first();
  await nav(/Plan/).click(); await page.waitForTimeout(2500);
  // Plan home lists the trip: open it.
  if (!(await page.locator('.tpg').count())) {
    await page.locator(':is(a,button):visible').filter({ hasText: 'Austria' }).first().click(); await page.waitForTimeout(2500);
  }
  const wide = W >= 1024;

  await step(W, 'trip page', async () => {
    ok(W, 'the trip page opens', await page.locator('.tpg').count() === 1);
    ok(W, 'no Edit trip and no Editing bar', await page.locator('.tpg-tool', { hasText: 'Edit trip' }).count() === 0 && await page.locator('.tpg-editbar').count() === 0);
    ok(W, 'cost band has no sub-line', await page.locator('.tpg-band-sub').count() === 0);
    ok(W, 'tiles have no sub-lines', await page.locator('.ct-sub').count() === 0);
    ok(W, 'four tiles', await page.locator('.ct-tile').count() === 4);
    ok(W, 'Add what you paid is offered', await page.locator('.tpg-band-paid').count() === 1);
    ok(W, 'no sideways scroll on Overview', await noSideways(page));
    await shot(page, `01-overview-${W}`);
    await shot(page, `01-overview-full-${W}`, true);
  });

  await step(W, 'name in place', async () => {
    await page.locator('.tpg-rename').click(); await page.waitForTimeout(300);
    ok(W, 'the name turns into a field', await page.locator('.tpg-name-input').count() === 1);
    await page.locator('.tpg-name-input').fill('Austria lakes');
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    ok(W, 'Enter keeps the new name', (await txt(page, 'h1.tpg-name')).includes('Austria lakes'));
  });

  await step(W, 'dates chip', async () => {
    const before = await txt(page, '[data-chip="dates"]');
    await page.locator('[data-chip="dates"]').click(); await page.waitForTimeout(700);
    ok(W, 'Dates opens its own editor', await page.locator('.tpe-sheet.is-dates').count() === 1);
    if (wide) ok(W, 'the editor hangs from the chip', await page.locator('.tpe-sheet.is-dates.is-anchored').count() === 1);
    await shot(page, `02-dates-${W}`);
    // the end one day later: the window holds 8 nights against 7
    await page.locator('.tpe-sheet .ui-seg button, .tpe-sheet [role="radio"]').filter({ hasText: /^End/ }).first().click().catch(() => {});
    await page.locator('.tpe-sheet [data-date="2026-11-29"], .tpe-sheet button[aria-label*="29 November"], .tpe-sheet button[aria-label*="November 29"]').first().click();
    await page.waitForTimeout(500);
    ok(W, 'the editor asks where the night goes', await page.locator('.tpe-sheet .tpb').count() === 1);
    await shot(page, `03-dates-balance-${W}`);
    await page.locator('.tpe-sheet .btn-primary').last().click(); await page.waitForTimeout(1200);
    const after = await txt(page, '[data-chip="dates"]');
    ok(W, 'the dates chip changed', after !== before && /29 Nov/.test(after), after);
    ok(W, 'an Undo message shows', await page.locator('.tpg-undo').count() === 1);
    await shot(page, `04-undo-toast-${W}`);
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click(); await page.waitForTimeout(1200);
    ok(W, 'Undo puts the dates back', (await txt(page, '[data-chip="dates"]')) === before, await txt(page, '[data-chip="dates"]'));
    if (wide) {
      ok(W, 'Redo is ready after Undo', await page.locator('[data-testid="tpg-redo"]:not([disabled])').count() === 1);
      await page.locator('[data-testid="tpg-redo"]').click(); await page.waitForTimeout(1000);
      ok(W, 'Redo brings the change back', /29 Nov/.test(await txt(page, '[data-chip="dates"]')));
      await page.locator('[data-testid="tpg-undo"]').click(); await page.waitForTimeout(1000);
    }
  });

  await step(W, 'people chip', async () => {
    await page.locator('[data-chip="people"]').click(); await page.waitForTimeout(600);
    ok(W, 'People opens its own editor', await page.locator('.tpe-sheet.is-people').count() === 1);
    await page.locator('.tpe-sheet .party-row').first().locator('button').last().click();
    await page.locator('.tpe-sheet .btn-primary').last().click(); await page.waitForTimeout(1000);
    ok(W, 'People now 3 adults', /3 adults/.test(await txt(page, '[data-chip="people"]')), await txt(page, '[data-chip="people"]'));
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click().catch(() => {}); await page.waitForTimeout(800);
    ok(W, 'Undo takes the party back', /2 adults/.test(await txt(page, '[data-chip="people"]')));
  });

  await step(W, 'from chip', async () => {
    await page.locator('[data-chip="from"]').click(); await page.waitForTimeout(700);
    ok(W, 'From opens its own editor', await page.locator('.tpe-sheet.is-from').count() === 1);
    await shot(page, `05-from-${W}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    ok(W, 'Escape closes it', await page.locator('.tpe-sheet').count() === 0);
  });

  await step(W, 'itinerary', async () => {
    await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Itinerary' }).click(); await page.waitForTimeout(1500);
    ok(W, 'two stops with their own controls', await page.locator('.itin-stopcard.is-editable').count() === 2);
    ok(W, 'arrive and leave tiles', await page.locator('.itin-ios').count() === 2);
    ok(W, 'flights named by their airports', await page.locator('.itin-end .rcodes').count() >= 1, String(await page.locator('.itin-end .rcodes').count()));
    ok(W, 'between stops moved under the route', await page.locator('.itin-route-extra .trip-transport-chips').count() === 1);
    ok(W, 'no sideways scroll on Itinerary', await noSideways(page));
    await shot(page, `06-itinerary-${W}`);
    await shot(page, `06-itinerary-full-${W}`, true);
    const first = page.locator('.itin-stopcard.is-editable').first();
    await first.locator('.fstepper-btn').last().click(); await page.waitForTimeout(600);
    ok(W, 'one more night asks where it comes from', await first.locator('.itin-balance').count() === 1);
    await first.scrollIntoViewIfNeeded(); await shot(page, `07-nights-balance-${W}`);
    // take it from Salzburg: the second choice
    await first.locator('.itin-balance [role="radio"]').nth(1).click(); await page.waitForTimeout(200);
    await first.locator('.itin-balance .btn-primary').click(); await page.waitForTimeout(1200);
    const n1 = await first.locator('.fstepper-value').innerText();
    const n2 = await page.locator('.itin-stopcard.is-editable').nth(1).locator('.fstepper-value').innerText();
    ok(W, 'Hallstatt 5 and Salzburg 2 after Apply', n1 === '5' && n2 === '2', `${n1}/${n2}`);
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click().catch(() => {}); await page.waitForTimeout(1000);
    ok(W, 'Undo restores 4 and 3', (await first.locator('.fstepper-value').innerText()) === '4');
    await page.locator('.itin-stop-remove').nth(1).click(); await page.waitForTimeout(1200);
    ok(W, 'Remove takes the stop off at once', await page.locator('.itin-stopcard.is-editable').count() === 1);
    ok(W, 'the Undo message names the stop', /Removed Salzburg/.test(await txt(page, '.tpg-undo')), await txt(page, '.tpg-undo'));
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click(); await page.waitForTimeout(1200);
    ok(W, 'Undo brings Salzburg back', await page.locator('.itin-stopcard.is-editable').count() === 2);
    await page.locator('.itin-add > .btn').click(); await page.waitForTimeout(600);
    ok(W, 'Add a stop opens the add block', await page.locator('.itin-add-body .trip-add-row').count() === 1);
    await page.locator('.itin-add-body .btn').filter({ hasText: 'Done adding' }).click();
    if (!wide) {
      await page.locator('.trip-more-btn').first().click(); await page.waitForTimeout(400);
      ok(W, 'the More menu holds Redo or Undo', await page.locator('.trip-more-menu .trip-undo-item, .trip-more-menu .trip-redo-item').count() >= 1);
      await page.keyboard.press('Escape');
    }
  });

  await step(W, 'costs', async () => {
    await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Costs' }).click(); await page.waitForTimeout(1200);
    const body = await txt(page, '.tpg-main');
    ok(W, 'no "prices are your own" line', !/prices are your own/i.test(body));
    ok(W, 'no sideways scroll on Costs', await noSideways(page));
    await shot(page, `08-costs-${W}`);
  });

  await step(W, 'add what you paid', async () => {
    await page.locator('.tpg-tabs [role="tab"]').filter({ hasText: 'Overview' }).click(); await page.waitForTimeout(800);
    await page.locator('.tpg-band-paid').click(); await page.waitForTimeout(1200);
    ok(W, 'Add what you paid opens the Itinerary', /Itinerary/.test(await txt(page, '.tpg-tabs [aria-selected="true"]')));
  });
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 2));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} of ${results.length} passed; ${errors.length} page or console errors`);
for (const e of errors.slice(0, 20)) console.log(e);
