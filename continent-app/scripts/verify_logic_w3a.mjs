// Logic wave 3a (ROADMAP D7, D20, D24, I14, G12): DOM checks of the touched screens at 390, 820, 1180 and
// 1440 and a width sweep. Build with config/flags.json E2 and E10 "new" (a temporary edit, restored).
//   - the trails list and a trail page: the page draws, its grade card never says "T5" and
//     "estimated" together (REQ-data-7), the Suits group has no screen since G12 took All filters out of Trails (REQ-data-6; asserted as such)
//   - the Style Studio's party step: a Teens row beside Adults, a stepper that moves the adults row (W3-L1)
//   - the Suits facet: the live wire has no `allYear` yet, so the country file is route-intercepted
//     (some rows `winter` only, the way an old file reads; some `winter` and `allYear`); the check fails
//     when the chip is not on screen, never passes on absence
//   - the Near page of a place (Around tiles, rows and sort read through lib/outdoorRow.js on the legacy
//     keys the live wire still has). AroundHere.jsx is not mounted anywhere, so it has no screen
//   - Account, Your travel, Travellers: the Teens row beside Adults (E2 new)
//   - the way back from Stripe: a stubbed signed-in session whose ai_status answers a paid tier, on
//     ?pass=ok, with a kept reason: PassBack opens once; on a destination page it offers "Do it now"
//   Build with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set to stubs (the stub session needs
//   authConfigured) and config/flags.json E2, E9 and E10 "new" (temporary, restored).
//
//   node scripts/verify_logic_w3a.mjs [url] [CC]    (default http://localhost:$CARTA_PORT or 4173, SI)
//   CARTA_DATA_MIRROR=".../continent-app/public" fills a sparse worktree's data.
import { chromium } from 'playwright';
import { mirrorData } from './lib/dataMirror.mjs';

const BASE = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const CC = (process.argv[3] || 'SI').toUpperCase();
const browser = await chromium.launch();
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
const NOISE = /ERR_FAILED|config is not valid|content_overrides|Failed to load resource|Access to fetch at 'https:\/\/data\./;
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function open(viewport, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await mirrorData(ctx);
  await ctx.addInitScript((clear) => {
    try {
      // The Style Studio opens by itself on a fresh device with a normal browser.
      if (clear) Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      if (clear && !sessionStorage.getItem('w3a.cleared')) { localStorage.clear(); sessionStorage.setItem('w3a.cleared', '1'); }
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.mapGuideDone', '1');
    } catch { /* storage unavailable */ }
  }, fresh);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${viewport.width}: pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${viewport.width}: console: ${m.text().slice(0, 120)}`); });
  return { page, ctx };
}


const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const USER = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'traveller@example.com', email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Sam Okonkwo' }, app_metadata: { provider: 'email', providers: ['email'] },
  identities: [], created_at: '2026-01-01T00:00:00Z',
};
// A signed-in traveller with a Trip Pass, answered locally (no network to Supabase).
async function signedInContext(viewport, blocked) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await mirrorData(ctx);
  await ctx.route(/supabase\.co\//, (route) => {
    const url = route.request().url();
    if (/rpc\/ai_status/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        tier: 'trip', expiresAt: '2027-01-30T00:00:00Z', resetsAt: '2026-12-30T00:00:00Z',
        plansUsed: 0, plansCap: 20, plansLeft: 20, groundUsed: 0, groundCap: 30, groundLeft: 30 }) });
    }
    if (/auth\/v1\/user/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.addInitScript(({ ref, user, blockedReason }) => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('carta.mapGuideDone', '1');
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: 'stub', token_type: 'bearer', expires_in: 360000,
        expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'stub-refresh', user }));
      if (blockedReason && !sessionStorage.getItem('w3a.blockedSeeded')) {
        sessionStorage.setItem('carta.passBlocked', blockedReason);
        sessionStorage.setItem('w3a.blockedSeeded', '1');
      }
    } catch { /* storage unavailable */ }
  }, { ref: PROJECT_REF, user: USER, blockedReason: blocked });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${viewport.width}: pageerror: ${e.message.split('\n')[0]}`));
  return { ctx, page };
}

// The Trails tab under the band, then the country card (the route verify_trails.mjs takes).
async function openTrails(page) {
  await page.goto(`${BASE}?tab=map`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.band-input', { timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.locator('[role="tablist"] [role="tab"]:visible', { hasText: /^\s*Trails\s*$/ }).first().click();
  await page.waitForTimeout(2000);
  await page.locator(`.dtab-bycountry .dgal-card[data-cc="${CC}"] .card-open`).first().click();
  await page.waitForTimeout(2500);
}

for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]]) {
  const tag = `${label}: `;
  try {
    // ---- Trails list, Suits facet, trail page ----
    const { page, ctx } = await open({ width, height });
    await page.route(new RegExp(`/trails/${CC}\\.json`), async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      (body.trips || []).slice(0, 24).forEach((trip, i) => {
        const f = trip.f || (trip.f = {});
        f.sd = [...(f.sd || []), 'winter', ...(i % 2 ? ['allYear'] : [])];
      });
      await route.fulfill({ response: res, json: body });
    });
    await openTrails(page);
    const nCards = await page.locator('.places-tcard').count();
    check(`${tag}the trails list draws`, nCards >= 10, `${nCards} cards`);
    check(`${tag}the list does not scroll sideways`, (await sideways(page)) <= 1, `${await sideways(page)} px`);
    // The Suits group (with its "All year" chip) is built from the intercepted country file
    // (some rows `winter` only, as an old file reads; some `winter` and `allYear`) but G12 took
    // "All filters" out of Trails, so the quick row holds only QUICK_GROUPS.trails and no screen
    // draws the group today. This asserts exactly that, so the day the group gets a screen again
    // this check names it; the chip's label and fallback are proven in tests/wave3aOutdoor.test.mjs.
    const quick = (await page.locator('button:visible').allInnerTexts()).map((x) => x.trim());
    // A phone has no quick facet row at all; wider screens show the four QUICK_GROUPS.trails chips.
    const chipsOk = width < 820 || ['How hard', 'Walk length', 'Climb', 'Shape'].every((g) => quick.includes(g));
    check(`${tag}the Suits group has no screen yet: no Suits or Winter button, the quick row is the four chips (wide) or absent (phone)`,
      chipsOk && !quick.includes('Suits') && !quick.includes('Winter') && !quick.includes('All year'),
      quick.filter((x) => /hard|length|Climb|Shape|Suit|Winter|year/i.test(x)).join(' | ') || 'no facet chips');
    await page.locator('.places-tcard .card-open').first().click();
    await page.waitForTimeout(3500);
    check(`${tag}a trail page opens`, await page.locator('.tpage-v2').isVisible().catch(() => false));
    const body = await page.locator('.tpage-scroll').innerText().catch(() => '');
    check(`${tag}the grade card never reads "T5" with "Estimated from the elevation model"`, !(/\bT5\b/.test(body) && /Estimated from the elevation model/.test(body)));
    check(`${tag}the trail page does not scroll sideways`, (await sideways(page)) <= 1, `${await sideways(page)} px`);
    await ctx.close();

    // ---- Style Studio party step with Teens (E2 new) ----
    const fresh = await open({ width, height }, { fresh: true });
    await fresh.page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const studio = fresh.page.locator('.fsheet.sst[role="dialog"]');
    const opened = await studio.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
    // The first-visit studio is a phone and tablet flow (verify_first_style.mjs); on a wide screen it
    // opens from the corner disc, so there the party step is not reached and is reported as such.
    check(`${tag}the Style Studio opens on a fresh device${width >= 1180 ? ' (not at this width: skipped)' : ''}`, opened || width >= 1180, opened ? '' : 'not auto-opened at this width');
    if (opened) {
      await studio.locator('.sst-row', { hasText: /family/i }).first().click().catch(() => {});
      await fresh.page.waitForTimeout(600);
      const party = studio.locator('.sst-party .party-row');
      const labels = await party.locator('.party-label b').allInnerTexts().catch(() => []);
      check(`${tag}the party step has Adults, Teens, Children, Babies`, labels.join('|') === 'Adults|Teens|Children|Babies', labels.join('|'));
      const val = async (name) => Number((await party.filter({ hasText: name }).locator('.fstepper-value').first().innerText().catch(() => 'NaN')).trim());
      const adults0 = await val('Adults');
      await party.filter({ hasText: 'Teens' }).locator('.fstepper-btn').last().click().catch(() => {});
      await fresh.page.waitForTimeout(400);
      check(`${tag}one more teen keeps the adults row and raises the teens row`, (await val('Teens')) === 1 && (await val('Adults')) === adults0, `teens ${await val('Teens')}, adults ${await val('Adults')}`);
      check(`${tag}the party step does not scroll sideways`, (await sideways(fresh.page)) <= 1);
      await fresh.page.screenshot({ path: `${process.env.W3A_SHOTS || '.'}/w3a-studio-${width}.png` }).catch(() => {});
    }
    await fresh.ctx.close();
  } catch (e) {
    check(`${tag}ran`, false, String(e).split('\n')[0]);
  }
}


// ---- Near page, Account Who with Teens, the way back from Stripe ----
for (const [label, width, height] of [['phone 390', 390, 844], ['tablet 820', 820, 1180], ['tablet 1180', 1180, 820], ['desktop 1440', 1440, 900]]) {
  const tag = `${label}: `;
  try {
    // Near page: Around tiles on a place, a kind's own page, its rows and sort.
    const { page, ctx } = await open({ width, height });
    await page.goto(`${BASE}?tab=map#dest=LJU&tab=nearby`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const tiles = page.locator('.ar-tile:visible');
    await tiles.first().waitFor({ state: 'visible', timeout: 40000 }).catch(() => {});
    check(`${tag}the place's Around tiles draw`, (await tiles.count()) > 0, `${await tiles.count()} tiles`);
    if (await tiles.count()) {
      await tiles.first().click();
      await page.locator('.near-page').waitFor({ timeout: 15000 }).catch(() => {});
      const rows = await page.locator('.near-grid > *').count();
      check(`${tag}the Near page lists rows read through outdoorRow`, rows > 0, `${rows} rows`);
      const facts = (await page.locator('.near-grid').innerText().catch(() => '')).trim();
      check(`${tag}a row prints its facts (km, climb or height) or none, never "undefined" or "NaN"`, !/undefined|NaN/.test(facts));
      const sort = page.locator('.near-sort:visible').first();
      if (await sort.count()) {
        await sort.locator('button, [role="radio"], label', { hasText: /Best/i }).first().click().catch(() => {});
        await page.waitForTimeout(500);
      }
      check(`${tag}the Near page does not scroll sideways`, (await page.evaluate(() => { const el = document.querySelector('.near-page'); return el.scrollWidth - el.clientWidth; })) <= 1);
    }
    await ctx.close();

    // Account, Your travel, Travellers: the Teens row (E2 new).
    const acc = await open({ width, height });
    await acc.page.goto(`${BASE}?tab=map`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await acc.page.locator('.account-door').first().click({ timeout: 30000 });
    const panel = acc.page.locator('.account-panel');
    await panel.waitFor({ timeout: 15000 });
    // The hub's Travellers line leads to Your travel; there the same word is the row that opens the editor.
    const travellers = () => panel.getByText('Travellers', { exact: true }).last();
    await travellers().click();
    await acc.page.waitForTimeout(800);
    if (!(await acc.page.locator('.party-rows').count())) {
      await travellers().click();
      await acc.page.waitForTimeout(800);
    }
    const labels = await acc.page.locator('.party-rows .party-row-label').allInnerTexts().catch(() => []);
    check(`${tag}Account's Travellers sheet shows Adults, Teens, Children, Babies`, labels.join('|') === 'Adults|Teens|Children|Babies', labels.join('|'));
    if (labels.includes('Teens')) {
      const row = acc.page.locator('.party-rows .party-row').filter({ hasText: 'Teens' });
      await row.locator('.fstepper-btn').last().click();
      await acc.page.waitForTimeout(400);
      check(`${tag}one more teen reads 1 on the Teens row`, (await row.locator('.fstepper-value').innerText()).trim() === '1');
    }
    check(`${tag}the Travellers sheet does not scroll sideways`, (await sideways(acc.page)) <= 1);
    await acc.ctx.close();

    // The way back from Stripe: a Trip Pass has landed, the blocked gate was 'export'.
    const back = await signedInContext({ width, height }, 'export');
    await back.page.goto(`${BASE}?pass=ok#dest=LJU`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const title = back.page.locator('#pass-back-title');
    const shown = await title.waitFor({ state: 'visible', timeout: 60000 }).then(() => true, () => false);
    check(`${tag}the way back opens on ?pass=ok once the Trip Pass is known`, shown);
    if (shown) {
      const sheet = back.page.locator('.pass-sheet:visible');
      check(`${tag}it names what was blocked (export)`, /export it now/i.test(await sheet.innerText()));
      const again = sheet.locator('button', { hasText: 'Do it now' });
      check(`${tag}on a destination page the primary button offers the action again`, (await again.count()) === 1);
      check(`${tag}the sheet fits the screen`, (await sheet.evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth)));
      await (await again.count() ? again : sheet.locator('button', { hasText: 'Continue' })).first().click();
      await back.page.waitForTimeout(800);
      check(`${tag}it closes and stays closed after the button`, (await title.count()) === 0);
      check(`${tag}the address lost ?pass=ok`, !/[?&]pass=/.test(back.page.url()));
    }
    await back.ctx.close();
  } catch (e) {
    check(`${tag}near, account, way back ran`, false, String(e).split('\n')[0]);
  }
}

try {
  const { page, ctx } = await open({ width: 1440, height: 900 });
  await openTrails(page);
  const bad = [];
  for (const w of [360, 390, 430, 600, 768, 820, 1024, 1180, 1280, 1440, 1600]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    if ((await sideways(page)) > 1) bad.push(w);
  }
  check('width sweep 360 to 1600: no horizontal overflow on the trails list', bad.length === 0, bad.join(','));
  await ctx.close();
} catch (e) {
  check('the width sweep ran', false, String(e).split('\n')[0]);
}

check('no page error or console error', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
