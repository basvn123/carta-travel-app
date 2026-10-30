// T857-T859 end check (plan flow v3, Batch B) on a NOPUBLIC build + public/.
//   node walk-b.mjs <port> <label> [outDir]
// Tell Carta: the sentence becomes chips as it is typed (dashed for what is
// still open), a chip opens its question in a popover whose answer the words
// then keep, Continue asks only what is open while the step marks tick the
// answered ones, and the named place (Portugal) carries into Help me choose
// (no weather or reach question), the trips for you (all in Portugal) and the
// planner's picked countries. Then the same in Dutch, at 1440.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const PORT = process.argv[2] || 5857;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T857-T859-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools/;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const browser = await chromium.launch();
const shot = async (page, name, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };

async function open(W, lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/BRU.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }));
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/flights/_index.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES }));
  await page.addInitScript((lg) => { try {
    localStorage.setItem('continent.lang.v1', lg); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage */ } }, lang);
  await page.goto(`http://localhost:${PORT}/?o=BRU`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  const nav = page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1);
  await nav.click(); await page.waitForTimeout(1500);
  // Start planning, the kind sheet, then Tell Carta.
  await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
  await page.locator('.pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(900);
  return { ctx, page };
}
const chipTexts = (page, sel) => page.locator(`.pf-read-chips ${sel}`).allInnerTexts().then((a) => a.map((x) => x.trim()));
const draft = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || '{}'); } catch { return {}; } });

const SENTENCE = 'A week in Portugal with my partner in May, beaches and good food, from Ghent, around 1,500 euro';

for (const W of WIDTHS) {
  await step(W, 'tell carta', async () => {
    const { ctx, page } = await open(W);
    const field = page.locator('#pf-tell');
    const before = await chipTexts(page, '.is-missing');
    ok(W, 'with no words every setup question is a dashed chip', before.length === 6, before.join(' | '));
    await field.click();
    await field.pressSequentially(SENTENCE, { delay: 8 });
    await page.waitForTimeout(900);
    const on = await chipTexts(page, '.pf-read-chip:not(.is-missing)');
    const miss = await chipTexts(page, '.is-missing');
    const want = ['Portugal', 'May', '7 nights', '2 adults', 'Beaches', 'Food and wine', 'From Ghent', `${String.fromCharCode(0x20ac)}1,500 for 2`];
    ok(W, 'the words become selected chips', want.every((x) => on.includes(x)), on.join(' | '));
    ok(W, 'what the words leave open is dashed: booked, sleep, priority', miss.join('|') === 'Booked anything?|Where to sleep?|What matters most?', miss.join(' | '));
    const left = (await page.locator('#pf-read-left').innerText()).trim();
    ok(W, 'the line under the chips counts what is left', /^3 questions left/.test(left), left);
    ok(W, 'chips: no sideways scroll', await noSideways(page));
    await shot(page, `01-tell-chips-${W}`);

    // A tap on a chip opens its question in a popover; its answer wins over the words.
    await page.locator('.pf-read-chip').filter({ hasText: '2 adults' }).click(); await page.waitForTimeout(700);
    const pop = page.locator('.fsheet.pf-read-pop');
    ok(W, 'the who chip opens a popover with the Who question', await pop.count() === 1 && /Who/i.test(await pop.innerText()));
    ok(W, 'on a pointer screen the popover hangs from the chip, on a phone it is a sheet', W < 500 ? true : /is-anchored/.test(await pop.getAttribute('class')));
    await pop.locator('.ui-crow').filter({ hasText: 'With the family' }).click(); await page.waitForTimeout(300);
    await shot(page, `02-chip-popover-${W}`);
    await pop.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(700);
    await field.press('End');
    await field.pressSequentially(', in a hostel', { delay: 8 });
    await page.waitForTimeout(900);
    const on2 = await chipTexts(page, '.pf-read-chip:not(.is-missing)');
    ok(W, 'the popover answer stays as the words go on (2 adults, 2 children)', on2.includes('2 adults, 2 children'), on2.join(' | '));
    ok(W, 'a stay type in the words is a chip and answers where to sleep', on2.includes('Dorm bed') && !(await chipTexts(page, '.is-missing')).includes('Where to sleep?'), on2.join(' | '));
    const opened = await page.locator('.pf-read-chip[aria-expanded="true"]').count();
    ok(W, 'chips name their popover (aria-haspopup) and none stays open', (await page.locator('.pf-read-chip[aria-haspopup="dialog"]').count()) >= 8 && opened === 0);

    // Continue asks only what is open; the marks tick what is answered.
    await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(900);
    const t1 = (await page.locator('.pf-title').first().innerText()).trim();
    ok(W, 'Continue opens the first open question (Booked)', /booked/i.test(t1), t1);
    const marks = await page.locator('.pf-mark').count();
    const done = await page.locator('.pf-mark.is-done').count();
    ok(W, 'the step marks: one a screen, the answered ones ticked', marks === 8 && done === 5, `${done} of ${marks} ticked`);
    await shot(page, `03-marks-${W}`);
    await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(900);
    const t2 = (await page.locator('.pf-title').first().innerText()).trim();
    ok(W, 'then What matters most, skipping the answered ones', /matters/i.test(t2), t2);
    await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(1200);
    // Create the trip, then its page, Start planning, Help me choose.
    for (let k = 0; k < 4 && !(await page.locator('.pf-home').count()); k++) {
      await page.locator('.pf .pf-foot .btn-primary:visible').last().click().catch(() => {}); await page.waitForTimeout(1200);
    }
    const d = await draft(page);
    ok(W, 'the words named Portugal: the planner holds it as the picked country', JSON.stringify(d.wizard?.countries || []) === '["Portugal"]', JSON.stringify(d.wizard?.countries));
    ok(W, 'the settings keep each answer with its source', d.settings?.sources?.when === 'words' && !d.settings?.sources?.who, JSON.stringify(d.settings?.sources));
    await page.locator('.pf').getByRole('button', { name: 'Start planning' }).click(); await page.waitForTimeout(800);
    await page.locator('.pf .ui-crow').filter({ hasText: /choose|Guide|help/i }).first().click().catch(() => {});
    await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(900);
    const titles = [];
    for (let k = 0; k < 9 && !(await page.locator('.tff-trips').count()); k++) {
      titles.push((await page.locator('.pf-title').first().innerText().catch(() => '')).trim());
      const prim = page.locator('.pf .pf-foot .btn-primary').last();
      if (await prim.count() && await prim.isEnabled()) await prim.click(); else await page.locator('.pf .pf-foot button:not([disabled])').first().click().catch(() => {});
      await page.waitForTimeout(700);
    }
    ok(W, 'Help me choose skips weather, reach and likes (the words gave them)', titles.length && !titles.some((x) => /weather|far|how far|like/i.test(x)), titles.join(' | '));
    await page.locator('.tff-trips').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const cards = await page.locator('.tff-card').allInnerTexts();
    ok(W, 'every trip for you is in Portugal', cards.length > 0 && cards.every((c) => /Portugal/.test(c)), `${cards.length} cards`);
    await shot(page, `04-trips-portugal-${W}`);
    // Plan this trip keeps the picked country.
    await page.locator('.tff-card .tff-card-meta').first().click(); await page.waitForTimeout(900);
    await page.locator('.tff-pv').getByRole('button', { name: 'Plan this trip' }).click(); await page.waitForTimeout(3000);
    const d2 = await draft(page);
    ok(W, 'Plan this trip keeps Portugal among the planner\'s countries', (d2.wizard?.countries || []).includes('Portugal'), JSON.stringify(d2.wizard?.countries));
    await ctx.close();
  });
}

await step(1440, 'dutch', async () => {
  const { ctx, page } = await open(1440, 'nl');
  const field = page.locator('#pf-tell');
  await field.click();
  await field.pressSequentially('Met ons gezin met 2 kinderen en een baby, 10 nachten naar Italië in juli, vanuit Gent', { delay: 8 });
  await page.waitForTimeout(900);
  const on = await chipTexts(page, '.pf-read-chip:not(.is-missing)');
  ok(1440, 'nl: Italy, July, 10 nights, the family and From Ghent as chips', ['Italië', 'juli', '10 nachten', 'Vanuit Gent'].every((x) => on.some((c) => c.toLowerCase() === x.toLowerCase())) && on.some((c) => /2 kinderen/.test(c) && /baby/.test(c)), on.join(' | '));
  const miss = await chipTexts(page, '.is-missing');
  ok(1440, 'nl: the dashed chips are in Dutch', miss.includes('Waar slapen?'), miss.join(' | '));
  await shot(page, `05-tell-nl-1440`);
  await ctx.close();
});

await browser.close();
const fails = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} pass; errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log('  ', e);
