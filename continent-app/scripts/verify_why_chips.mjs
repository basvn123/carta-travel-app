// T1208 (ROADMAP G9): "why this place" chips and the refreshed price date, at
// a phone and a desktop width, on the shipped wire (fixture data). DOM checks,
// screenshots only when SHOTS names a folder:
//   1. Explore, no taste: no chip anywhere (no evidence on the traveller's side).
//   2. Explore with Yes on Castle and Big city in carta.taste.v1 and Not me on
//      UNESCO: chips render, at most two per card, never UNESCO.
//   3. Edinburgh's page: "Why this place" with every row carrying a
//      confidence word and its evidence, no UNESCO row; "Prices refreshed"
//      with a date from the price blocks' _asof.
//   4. Dutch: the chip reads "Kasteel" and the date line is Dutch.
//   5. No horizontal scroll at 390 px; no page errors.
// Needs a dev server: VITE_E2E_SEAMS=1 npx vite --port 5231 --strictPort
// Run from continent-app/:  CARTA_PORT=5231 node scripts/verify_why_chips.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT) || 5231;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const NOISE = /ERR_FAILED|config is not valid|content_overrides|net::|favicon|Failed to load resource/;

let failed = 0;
const fail = (msg) => { console.error('FAIL:', msg); failed += 1; };
const ok = (msg) => console.log('  ok:', msg);

const TASTE = {
  v: 1, owner: null, removed: {},
  verdicts: { 'set.castle': { v: 'accept', at: 1 }, 'set.big-city': { v: 'accept', at: 1 }, 'set.unesco': { v: 'reject', at: 1 } },
};

const seed = (ctx, { lang = 'en', taste = null } = {}) => ctx.addInitScript(([l, tst]) => {
  try {
    if (sessionStorage.getItem('why.seeded')) return;
    sessionStorage.setItem('why.seeded', '1');
    localStorage.setItem('continent.lang.v1', l);
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
    if (tst) localStorage.setItem('carta.taste.v1', JSON.stringify(tst));
    else localStorage.removeItem('carta.taste.v1');
  } catch { /* storage unavailable */ }
}, [lang, taste]);

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.bottom-nav, .desk-nav, nav', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(2500);
}

async function explore(page) {
  await page.evaluate(() => { window.location.hash = ''; });
  const nav = page.locator('a, button', { hasText: /^(Explore|Ontdekken|Verkennen)$/ }).first();
  if (await nav.count()) await nav.click().catch(() => {});
  await page.waitForSelector('.xov, .xtile', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function openDest(page, id) {
  await page.evaluate((d) => { window.location.hash = `dest=${d}`; }, id);
  await page.waitForSelector('.destp .pt-title', { timeout: 90000 });
  await page.waitForFunction(() => !document.querySelector('.destp-wait'), null, { timeout: 90000 });
  await page.waitForTimeout(1200);
}

async function noHScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fail(`${label}: horizontal scroll ${over}px`); else ok(`${label}: no horizontal scroll`);
}

async function run(width, height, label) {
  console.log(`${label} (${width} x ${height})`);
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const errors = [];
  const wire = (page) => {
    page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text().slice(0, 140)); });
  };

  // 1. No taste, no chips.
  {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await seed(ctx);
    const page = await ctx.newPage(); wire(page);
    await boot(page); await explore(page);
    const n = await page.locator('.why-chips').count();
    if (n) fail(`${label}: ${n} chips with no taste`); else ok('no taste: no chips');
    await ctx.close();
  }

  // 2 and 3. Yes on Castle and Big city, Not me on UNESCO.
  {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await seed(ctx, { taste: TASTE });
    const page = await ctx.newPage(); wire(page);
    await boot(page); await explore(page);
    const sets = await page.locator('.why-chips').evaluateAll((els) => els.map((e) => ({
      nodes: (e.getAttribute('data-why') || '').split(' '), n: e.querySelectorAll('.why-chip').length,
      text: [...e.querySelectorAll('.why-chip')].map((c) => c.textContent).join(', '),
      label: e.querySelector('.sr-only')?.textContent || '',
    })));
    if (!sets.length) fail(`${label}: no chips on Explore with taste`);
    else ok(`${sets.length} cards with chips, first: ${sets[0].text}`);
    if (sets.some((s) => s.n > 2)) fail(`${label}: a card has more than two chips`);
    if (sets.some((s) => s.nodes.includes('set.unesco'))) fail(`${label}: a rejected node shows`);
    if (sets.some((s) => !s.label.startsWith('Why it fits you:'))) fail(`${label}: a chip set has no screen reader line`);
    if (sets.length) ok('at most two per card, never a rejected node, each with a screen reader line');
    const shown = page.locator('.xov:has(.why-chips), .xtile:has(.why-chips), .xstory:has(.why-chips)').filter({ visible: true });
    if (!(await shown.count())) fail(`${label}: no visible card with chips on the first screen`);
    else ok(`${await shown.count()} visible cards with chips`);
    if (SHOTS) await shown.first().screenshot({ path: `${SHOTS}/why-card-${label}.png`, timeout: 8000 }).catch((e) => console.log('  note: card shot', String(e).split('\n')[0]));
    await noHScroll(page, `${label} Explore`);

    await openDest(page, 'EDI');
    const sec = page.locator('#pt-why');
    if (!(await sec.count())) fail(`${label}: no "Why this place" on Edinburgh`);
    else {
      const rows = await sec.locator('.why-row').evaluateAll((els) => els.map((e) => ({
        node: e.getAttribute('data-node'),
        conf: e.querySelector('.why-conf')?.textContent || '',
        ev: [...e.querySelectorAll('.why-row-ev')].map((x) => x.textContent),
      })));
      ok(`Why this place: ${rows.map((r) => `${r.node} (${r.conf}; ${r.ev.join(' / ')})`).join(', ')}`);
      if (!rows.length) fail(`${label}: empty why section`);
      if (rows.some((r) => !/^(Strong evidence|Likely)$/.test(r.conf))) fail(`${label}: a row has no confidence word`);
      if (rows.some((r) => !r.ev.length || r.ev.some((x) => !x.trim()))) fail(`${label}: a row has no evidence`);
      if (rows.some((r) => r.node === 'set.unesco')) fail(`${label}: rejected UNESCO shows on the page`);
      if (!rows.some((r) => r.node === 'set.castle' && r.ev.some((x) => /You said yes to Castle/.test(x)))) fail(`${label}: Castle row without the traveller's evidence`);
      if (SHOTS) { await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: `${SHOTS}/why-page-${label}.png` }); }
    }
    const asof = page.locator('.why-asof').first();
    if (!(await asof.count())) fail(`${label}: no refreshed date`);
    else {
      const txt = await asof.innerText();
      const iso = await asof.getAttribute('data-asof');
      if (!/^Prices refreshed \d{1,2} \w{3} \d{4}/.test(txt) || !/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) fail(`${label}: date line "${txt}" (${iso})`);
      else ok(`date line: "${txt}" (${iso})`);
      if (SHOTS) { await asof.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/why-asof-${label}.png` }); }
    }
    await noHScroll(page, `${label} place page`);
    await ctx.close();
  }

  // 4. Dutch.
  {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await seed(ctx, { lang: 'nl', taste: TASTE });
    const page = await ctx.newPage(); wire(page);
    await boot(page);
    await openDest(page, 'EDI');
    const names = await page.locator('#pt-why .why-row-name').allInnerTexts();
    if (!names.includes('Kasteel')) fail(`${label}: Dutch rows ${names.join(', ')}`); else ok(`Dutch rows: ${names.join(', ')}`);
    const txt = await page.locator('.why-asof').first().innerText().catch(() => '');
    if (!/^Prijzen ververst op/.test(txt)) fail(`${label}: Dutch date line "${txt}"`); else ok(`Dutch date: "${txt}"`);
    await ctx.close();
  }

  if (errors.length) fail(`${label}: page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
  await browser.close();
}

await run(390, 844, 'phone');
await run(1440, 900, 'desktop');
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
