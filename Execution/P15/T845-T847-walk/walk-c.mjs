// T845-T847 end check: trip page v4 Batch C on the NOPUBLIC build + public/, at 390, 1024 and 1440.
//   node walk-b.mjs [port] [outDir]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5836;
const OUT = process.argv[3] || 'C:/Users/Gebruiker/Documents/Portfolio/wt/v4c-shots';
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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
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
  const tab = (name) => page.locator('.tpg-tabs [role="tab"]').filter({ hasText: name });
  const wide = W >= 1024;

  await step(W, 'overview dots', async () => {
    ok(W, 'each tile carries its group\'s dot', await page.locator('.ct-tile .ct-dot').count() === 4);
    const cols = await page.locator('.ct-tile .ct-dot').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    ok(W, 'the four dots are four colours', new Set(cols).size === 4, cols.join(' '));
    ok(W, 'the budget card shows the total', await page.locator('[data-testid="tp-budget"]').count() === 1);
  });

  await step(W, 'costs', async () => {
    await tab('Costs').click(); await page.waitForTimeout(1500);
    const segs = await page.locator('.plan-costbar.is-groups > span').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    ok(W, 'the bar has a coloured segment per group', segs.length >= 3 && new Set(segs).size === segs.length, segs.join(' '));
    ok(W, 'four groups, each with its dot', await page.locator('.plan-total-group .plan-total-dot').count() === 4);
    ok(W, 'no People and Lifestyle box on Costs', await page.locator('.tpg-main .plan-total-inputs').count() === 0);
    ok(W, 'the total is a figure, not a button', await page.locator('.tpg-main .plan-total-open').count() === 0);
    ok(W, 'a flight line is named by its airports', await page.locator('.plan-total-group.is-travel .rcodes').count() >= 1);
    ok(W, 'no "Getting there" left on Costs', !/Getting there|Getting home/.test(await txt(page, '.tpg-main')));
    ok(W, 'no sideways scroll on Costs', await noSideways(page));
    await shot(page, `01-costs-${W}`, true);
    const btn = page.locator('.plan-total-group.is-stay .plan-total-group-btn');
    await btn.click(); await page.waitForTimeout(400);
    ok(W, 'a group folds', (await btn.getAttribute('aria-expanded')) === 'false' && await page.locator('.plan-total-group.is-stay .costrow').count() === 0);
    await btn.click(); await page.waitForTimeout(400);
    await page.locator('.plan-total-group.is-travel .plan-line-edit').first().click(); await page.waitForTimeout(1000);
    ok(W, 'a flight line\'s Change opens Change flight', await page.locator('.tpf-sheet').count() === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.locator('.plan-total-group.is-stay .plan-line-edit').first().click(); await page.waitForTimeout(1500);
    ok(W, 'the stay line\'s Change opens the route', /Itinerary/.test(await txt(page, '.tpg-tabs [aria-selected="true"]')));
  });

  await step(W, 'budget', async () => {
    await tab('Overview').click(); await page.waitForTimeout(800);
    const card = page.locator('[data-testid="tp-budget"]');
    await card.scrollIntoViewIfNeeded();
    ok(W, 'the budget card is in view on this tab', await card.isVisible());
    const totalNow = Number(await page.evaluate(() => document.querySelector('[data-total]')?.getAttribute('data-total')) || 'NaN');
    await card.locator('.tpbud-edit').click(); await page.waitForTimeout(300);
    // a trip budget a person just above what one person spends now
    const per = Number.isFinite(totalNow) ? totalNow / 2 : 1100;
    await card.locator('input').fill(String(Math.ceil(per) + 5));
    await card.locator('.btn').filter({ hasText: 'Save' }).click(); await page.waitForTimeout(1200);
    ok(W, 'the budget shows as a bar and a line', await card.locator('.tpbud-bar').count() === 1 && /under your budget/.test(await txt(page, '[data-testid="tp-budget"]')), await txt(page, '.tpbud-line'));
    await card.scrollIntoViewIfNeeded(); await shot(page, `02-budget-${W}`);
    // a dearer stay takes the trip over: the Undo message says so
    await tab('Itinerary').click(); await page.waitForTimeout(1500);
    const sel = page.locator('.itin-stay select').first();
    const values = await sel.locator('option').evaluateAll((o) => o.map((x) => x.value));
    await sel.selectOption(values.includes('hotel5') ? 'hotel5' : values[values.length - 1]); await page.waitForTimeout(1500);
    ok(W, 'going over the budget says so on the Undo message', /over your budget/.test(await txt(page, '.tpg-undo')), await txt(page, '.tpg-undo'));
    await page.locator('.tpg-undo .btn').filter({ hasText: 'Undo' }).click().catch(() => {}); await page.waitForTimeout(1200);
  });

  await step(W, 'share', async () => {
    await page.locator('[data-testid="tpg-share"]').click(); await page.waitForTimeout(800);
    ok(W, 'Share opens', await page.locator('.tpsh-sheet').count() === 1);
    ok(W, 'who can see it, three choices', await page.locator('.tpsh-sheet [role="radio"]').count() === 3);
    await shot(page, `03-share-${W}`);
    await page.locator('.tpsh-sheet .btn').filter({ hasText: 'Copy link' }).click(); await page.waitForTimeout(800);
    ok(W, 'Copy link says it copied', /copied/i.test(await txt(page, '.tpsh-sheet')), await txt(page, '.tpsh-note'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.locator('.tpg-top .icon-btn').last().click(); await page.waitForTimeout(800);
    ok(W, 'Trip settings opens', await page.locator('.pf-settings').count() === 1);
    ok(W, 'Trip settings no longer asks who can see it', !/Who can see it/.test(await txt(page, '.pf-settings')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 2));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} of ${results.length} passed; ${errors.length} page or console errors`);
for (const e of errors.slice(0, 20)) console.log(e);
