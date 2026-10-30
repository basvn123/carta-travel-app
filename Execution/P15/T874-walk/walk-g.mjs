// T874 end to end (plan flow v3, Batch G) on a NOPUBLIC build + public/.
//   node walk-g.mjs <port> <label> [persona ids, e.g. 1,2,3,4]
// Four people from the first sentence in Tell Carta to Plan your days, at
// 375 and 1440 wide: every screen and question is logged (title, the step
// counter, the marks), each persona's answers are checked against what the
// trip ends up holding, and the totals are compared: the results card, the
// finder's trip page and the trip page (TripSummary).
//   1. A family from Ghent (2 adults, 2 children), the whole trip planned, in Dutch.
//   2. A student from Leuven, the flight first, on a tight budget.
//   3. A couple from Antwerp who know where they go (two named towns).
//   4. Someone with a flight booked, typed in through I've booked part of it.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const PORT = process.argv[2] || 5874;
const LABEL = process.argv[3] || 'after';
const ONLY = (process.argv[4] || '1,2,3,4').split(',').map(Number);
const OUT = `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T874-walk/${LABEL}`;
const WIDTHS = (process.env.WIDTHS || '1440,375').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const fx = (n) => JSON.parse(readFileSync(`${APP}/tests/fixtures/${n}`, 'utf8'));
function sweep() {
  const f = fx('tf1-flights-BRU.json');
  const at = Math.floor(Date.now() / 60000) - 30;
  for (const side of [f.to, f.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
  f.checked = at; f.from = 'BRU'; return f;
}
const AIRLINES = readFileSync('C:/Users/Gebruiker/Documents/Portfolio/wt/t817-airlines-index.json', 'utf8');
const results = []; const errors = []; const logs = {};
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools|basemaps|cartocdn|maplibre|WebGL|style/i;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const eurOf = (s) => Number(String(s || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
const browser = await chromium.launch();
const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };

async function open(W, persona) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`[${persona.id}/${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${persona.id}/${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/*.json', (r) => {
    const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
    if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
    return code === 'BRU' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.addInitScript((lg) => { try {
    localStorage.setItem('continent.lang.v1', lg); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage */ } }, persona.lang);
  await page.goto(`http://localhost:${PORT}/${persona.query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1).click(); await page.waitForTimeout(1500);
  // Start planning, the kind sheet (A new trip), then Tell Carta.
  await page.locator('.pf-open-start').click(); await page.waitForTimeout(900);
  await page.locator('.pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(900);
  return { ctx, page };
}

const screen = (page) => page.evaluate(() => ({
  title: document.querySelector('.pf-title')?.innerText.trim() || '',
  count: document.querySelector('.pf-count, .pf-steps-count, .pf-progress-label')?.innerText.trim() || (document.querySelector('.pf-marks')?.parentElement?.innerText.match(/\d+ (of|van) \d+/)?.[0] || ''),
  marks: [...document.querySelectorAll('.pf-mark')].map((m) => (m.classList.contains('is-done') ? 'x' : m.getAttribute('aria-current') || m.classList.contains('is-on') || m.classList.contains('is-current') ? 'o' : '.')).join(''),
  picked: [...document.querySelectorAll('.pf [aria-checked="true"], .pf [aria-pressed="true"]')].map((e) => e.innerText.trim().split('\n')[0]).filter(Boolean),
}));
const pick = async (page, label) => {
  const el = page.locator('.pf').getByText(label, { exact: true }).first();
  if (await el.count()) { await el.click(); await page.waitForTimeout(250); return true; }
  return false;
};
const prim = (page) => page.locator('.pf .pf-foot .btn-primary:visible').last();
const draft = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || '{}'); } catch { return {}; } });

/** The trip page (TripSummary): its total, cost tiles, route and chips. */
const tpgFacts = (page) => page.evaluate(() => {
  const tpg = document.querySelector('.tpg');
  if (!tpg) return null;
  const band = tpg.querySelector('[data-testid="ts-total"]');
  return {
    name: tpg.querySelector('h1')?.innerText.trim(),
    total: Number(band?.querySelector('.tpg-band-n')?.dataset.total || NaN),
    tiles: band?.innerText.replace(/\s+/g, ' ').trim(),
    chips: tpg.querySelector('.tpg-chips')?.innerText.replace(/\s+/g, ' ').trim(),
    route: tpg.querySelector('.ts-route')?.innerText.replace(/\s+/g, ' ').trim(),
    book: [...tpg.querySelectorAll('.tpg-book-row')].map((r) => r.dataset.row),
    booked: tpg.querySelectorAll('.ts-route .ts-booked').length,
    wizard: document.querySelectorAll('.guide-canvas, .guide-foot, .guide-recap, .wz-rev, .wz-leg').length,
    planDays: [...document.querySelectorAll('.tpg-tool.is-primary, .tpg-dock-go')].filter((b) => b.offsetParent).length,
  };
});
/** The cost tab's lines (the Kosten/Costs tab), to add up against the total. */
async function costTab(page) {
  const tab = page.locator('.tpg-tabs [role="tab"]').nth(2);
  await tab.click(); await page.waitForTimeout(900);
  const text = await page.locator('.tpg').innerText();
  await page.locator('.tpg-tabs [role="tab"]').first().click(); await page.waitForTimeout(600);
  return text.replace(/\s+/g, ' ').slice(0, 1800);
}

/**
 * Drive the flow from Tell Carta to the trip page, answering each screen as
 * the persona would, and log every screen. Returns the log and the figures.
 */
async function drive(page, P, W) {
  const log = []; const seen = new Map(); const fig = {};
  const field = page.locator('#pf-tell');
  await field.click(); await field.pressSequentially(P.sentence, { delay: 4 }); await page.waitForTimeout(1100);
  fig.chips = (await page.locator('.pf-read-chips .pf-read-chip:not(.is-missing)').allInnerTexts()).map((x) => x.trim());
  fig.missing = (await page.locator('.pf-read-chips .is-missing').allInnerTexts()).map((x) => x.trim());
  log.push({ screen: 'Tell Carta', chips: fig.chips, missing: fig.missing });
  await shot(page, `p${P.id}-01-tell-${W}`);
  if (P.afterTell) await P.afterTell(page, fig);
  await prim(page).click(); await page.waitForTimeout(1000);
  for (let k = 0; k < 40; k++) {
    if (await page.locator('.tpg').count()) break;
    if (await page.locator('.tff-tp').count()) {
      const t = await page.evaluate(() => ({ name: document.querySelector('.tff-tp h1')?.innerText.trim(), eur: Number((document.querySelector('.tff-tp-eur')?.innerText || '').replace(/[^0-9]/g, '')) / 100, lines: document.querySelector('.tff-tp-side')?.innerText.replace(/\s+/g, ' ').slice(0, 400) }));
      if (process.env.DEBUG) console.log('DEBUG', await page.evaluate(() => location.href + ' ## ' + Object.entries(localStorage).filter(([k, v]) => /origin|airport|choice|firstRun/i.test(k + v.slice(0, 2000))).map(([k, v]) => `${k}=${v.slice(0, 600)}`).join(' || ')));
      fig.tripPage = t; log.push({ screen: 'Trip page (finder)', name: t.name, total: t.eur, lines: t.lines });
      await shot(page, `p${P.id}-04-finder-trip-${W}`);
      await page.locator('.tff-tp-plan').click(); await page.waitForTimeout(3000); continue;
    }
    if (await page.locator('.tff-trips .tff-list .tff-card').count()) {
      const cards = await page.locator('.tff-list .tff-card').evaluateAll((els) => els.slice(0, 6).map((e) => ({ name: e.querySelector('.tff-card-name')?.innerText.trim(), total: e.querySelector('.tff-total-eur')?.innerText.replace(/\s+/g, ' ').trim(), catch: e.querySelector('.tff-card-catch')?.innerText.trim() })));
      const head = await page.evaluate(() => ({ h: document.querySelector('.tff-trips h1, .tff-trips h2')?.innerText.trim(), line: document.querySelector('.tff-chips, .tff-answers')?.innerText.replace(/\s+/g, ' ').trim() }));
      fig.cards = cards; fig.answersLine = head.line;
      log.push({ screen: 'Trips for you', head: head.h, line: head.line, cards });
      await shot(page, `p${P.id}-03-results-${W}`);
      const i = P.cardIndex ? await P.cardIndex(cards) : 0;
      fig.card = cards[i];
      await page.locator('.tff-list .tff-card').nth(i).locator('.tff-card-open').click(); await page.waitForTimeout(1600); continue;
    }
    if (await page.locator('.ffl .ffl-card').count()) {
      const rows = await page.locator('.ffl .ffl-card').evaluateAll((els) => els.map((e) => ({ name: e.querySelector('.card-title')?.innerText.trim(), fare: e.querySelector('.ffl-fare-n')?.innerText.trim(), lbl: e.querySelector('.ffl-fare-lbl')?.innerText.trim(), legs: [...e.querySelectorAll('.ffl-leg')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()) })));
      const chips = await page.locator('.tff-chips').innerText().catch(() => '');
      fig.flights = rows; fig.flightChips = chips.replace(/\s+/g, ' ');
      log.push({ screen: 'Pick your flight', chips: fig.flightChips, rows });
      await shot(page, `p${P.id}-03-flights-${W}`);
      fig.flight = rows[0];
      await page.locator('.ffl .ffl-card').first().locator('.card-open').click();
      await page.locator('.tpg').waitFor({ timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2000); continue;
    }
    if (await page.locator('.tff-load').count()) { await page.waitForTimeout(1500); continue; }
    const s = await screen(page);
    if (!s.title) { await page.waitForTimeout(800); continue; }
    const key = s.title;
    seen.set(key, (seen.get(key) || 0) + 1);
    if (seen.get(key) > 3) { log.push({ screen: key, stuck: true }); break; }
    const doors = await page.locator('.pf-doors .pf-door').evaluateAll((els) => els.map((e) => ({ door: e.dataset.door, on: e.getAttribute('aria-checked') === 'true' })));
    if (seen.get(key) === 1) {
      log.push({ screen: key, count: s.count, marks: s.marks, picked: s.picked, ...(doors.length ? { preselected: doors.find((d) => d.on)?.door } : {}) });
      if (P.shots?.test(key)) await shot(page, `p${P.id}-02-${key.replace(/[^a-z]+/gi, '-').toLowerCase().slice(0, 30)}-${W}`);
    }
    const act = P.answers.find(([re]) => re.test(key));
    const r = act ? await act[1](page, fig) : null;
    if (await page.locator('.tpg').count()) break;
    if (r === 'nav') { await page.waitForTimeout(1200); continue; }
    const btn = prim(page);
    if (await btn.count() && await btn.isEnabled()) await btn.click();
    await page.waitForTimeout(1200);
  }
  await page.locator('.tpg').waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);
  fig.tpg = await tpgFacts(page);
  log.push({ screen: 'Trip page (TripSummary)', ...fig.tpg });
  return { log, fig };
}

const D = (...a) => a; // a readable pair
const PERSONAS = [
  {
    id: 1, lang: 'nl', who: 'Family from Ghent, 2 adults and 2 children, the whole trip planned (Dutch)',
    query: '?o=BRU&oa=BRU.CRL&ah=2&dh=51.0540,3.7170,Gent',
    sentence: 'Met het gezin, 2 volwassenen en 2 kinderen van 6 en 9, een week in december vanuit Gent, plan alles voor ons, budget 3000 euro',
    shots: /Hoeveel moet Carta|Waar heb je zin|Hoe reis je graag/,
    answers: [
      D(/al geboekt/, (p) => pick(p, 'Nog niets')),
      D(/Hoe wil je er komen/, (p) => pick(p, 'Vliegen')),
      D(/Hoe ver wil je rijden/, (p) => pick(p, '2 uur')),
      D(/^Mijn reis$|Nieuwe reis/, async (p) => { const b = p.locator('.pf').getByRole('button', { name: 'Begin met plannen' }); if (await b.count()) { await b.click(); return 'nav'; } return null; }),
      D(/Hoeveel moet Carta/, (p) => p.locator('.pf-door[data-door="guide"]').click()),
      D(/Waar heb je zin in/, async (p) => { await pick(p, 'Stranden'); await pick(p, 'Cultuur en geschiedenis'); }),
      D(/Welk weer/, (p) => pick(p, 'Maakt me niet uit')),
      D(/Hoe ver wil je gaan/, (p) => pick(p, 'Overal in Europa')),
    ],
    expect: { adults: 2, kids: 2, from: 'Gent', budget: 3000, door: 'guide' },
  },
  {
    id: 2, lang: 'en', who: 'Student from Leuven, the flight first, tight budget',
    query: '?o=BRU&oa=BRU.CRL&ah=2&dh=50.8798,4.7005,Leuven',
    sentence: 'Just a cheap flight for me alone from Leuven, 4 nights in November, max 900 euro, a hostel is fine',
    shots: /How much should Carta|airport/,
    answers: [
      D(/booked already/, (p) => pick(p, 'Nothing yet')),
      D(/What matters most/, (p) => pick(p, 'The lowest price')),
      D(/How do you want to get there/, (p) => pick(p, 'Fly')),
      D(/How far would you go to an airport/, (p) => pick(p, '2 hours')),
      D(/^My trip$|New trip/, async (p) => { const b = p.locator('.pf').getByRole('button', { name: 'Start planning' }); if (await b.count()) { await b.click(); return 'nav'; } return null; }),
      D(/How much should Carta/, (p) => p.locator('.pf-door[data-door="flight"]').click()),
    ],
    expect: { adults: 1, kids: 0, from: 'Leuven', budget: 900, door: 'flight' },
  },
  {
    id: 3, lang: 'en', who: 'Couple from Antwerp who know where (Prague and Cesky Krumlov)',
    query: '?o=BRU&oa=BRU.CRL&ah=2&dh=51.2194,4.4025,Antwerp',
    sentence: 'My partner and I from Antwerp, 21 to 28 November in Prague and Cesky Krumlov, mid-range hotels',
    shots: /How much should Carta|Where are you going/,
    answers: [
      D(/booked already/, (p) => pick(p, 'Nothing yet')),
      D(/How do you want to get there/, (p) => pick(p, 'Fly')),
      D(/How far would you go to an airport/, (p) => pick(p, '2 hours')),
      D(/^My trip$|New trip/, async (p) => { const b = p.locator('.pf').getByRole('button', { name: 'Start planning' }); if (await b.count()) { await b.click(); return 'nav'; } return null; }),
      D(/How much should Carta/, (p) => p.locator('.pf-door[data-door="know"]').click()),
    ],
    expect: { adults: 2, kids: 0, from: 'Antwerp', door: 'know', towns: ['Prague', 'Český Krumlov'] },
  },
  {
    id: 4, lang: 'en', who: 'Two from Ghent with a flight booked, typed in',
    query: '?o=BRU&oa=BRU.CRL&ah=2&dh=51.0540,3.7170,Ghent',
    sentence: 'We already booked our flights to Prague, 21 to 28 November, two of us from Ghent',
    shots: /How much should Carta|What have you booked/,
    answers: [
      D(/booked already/, async (p) => { /* the words said flights; keep them */ }),
      D(/^My trip$|New trip/, async (p) => { const b = p.locator('.pf').getByRole('button', { name: 'Start planning' }); if (await b.count()) { await b.click(); return 'nav'; } return null; }),
      D(/How much should Carta/, (p) => p.locator('.pf-door[data-door="booked"]').click()),
      D(/What have you booked/, async (p, fig) => {
        if (fig.typed) return; fig.typed = true;
        fig.prefill = [];
        for (const [kind, date, eur] of [['Flight there', '2026-11-21', '142'], ['Flight home', '2026-11-28', '128']]) {
          await p.getByRole('button', { name: 'Type it in' }).click(); await p.waitForTimeout(300);
          const seg = p.locator('.pf-booked-form').getByRole('radio', { name: kind });
          if ((await seg.getAttribute('aria-checked')) !== 'true') await seg.click();
          const town = (await p.locator('.pf-booked-form .pf-booked-town .pf-booked-name').innerText().catch(() => '')).trim();
          const day = await p.locator('.pf-booked-form input[type="date"]').inputValue();
          fig.prefill.push({ kind, town, day });
          if (!town) { await p.locator('.pf-booked-form .pf-place-input').fill('prague'); await p.waitForTimeout(500); await p.locator('.pf-booked-form .pf-place-hit').first().click(); await p.waitForTimeout(200); }
          if (day !== date) await p.locator('.pf-booked-form input[type="date"]').fill(date);
          await p.locator('.pf-booked-form input[inputmode="decimal"]').fill(eur);
          if (kind === 'Flight there') await shot(p, `p4-02a-booked-form-${p.viewportSize().width}`);
          await p.getByRole('button', { name: 'Add this booking' }).click(); await p.waitForTimeout(400);
        }
        fig.bookedRows = (await p.locator('.pf-booked-row').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
        await shot(p, `p4-02b-booked-typed-${p.viewportSize().width}`);
      }),
    ],
    expect: { adults: 2, kids: 0, from: 'Ghent', door: 'booked', paid: 270 },
  },
];

for (const P of PERSONAS.filter((x) => ONLY.includes(x.id))) {
  for (const W of WIDTHS) {
    await step(`${P.id}/${W}`, `persona ${P.id}`, async () => {
      const tag = `${P.id}/${W}`;
      const { ctx, page } = await open(W, P);
      const { log, fig } = await drive(page, P, W);
      logs[tag] = { who: P.who, log, fig };
      const d = await draft(page);
      const s = d.settings || {};
      const tpg = fig.tpg;
      ok(tag, 'reaches the trip page (TripSummary) with no wizard', tpg && tpg.wizard === 0, tpg?.name);
      // Asked twice: a screen title met again after the flow moved on.
      const titles = log.filter((x) => x.screen && !x.stuck).map((x) => x.screen);
      const twice = titles.filter((x, i) => titles.indexOf(x) !== i);
      ok(tag, 'no screen asked twice', !twice.length && !log.some((x) => x.stuck), twice.join(', ') || (log.find((x) => x.stuck)?.screen || ''));
      // Answers the words gave are not asked again as screens.
      const screens = log.map((x) => x.screen).join(' | ');
      fig.screens = screens;
      if (P.expect.adults != null) ok(tag, 'the party carries to the trip page', new RegExp(`${P.expect.adults} (adult|volwassen)`).test(tpg?.chips || '') && (!P.expect.kids || new RegExp(`${P.expect.kids} (child|kind)`).test(tpg?.chips || '')), tpg?.chips);
      ok(tag, 'the home town carries to the trip page', (tpg?.chips || '').includes(P.expect.from) || (tpg?.route || '').includes(P.expect.from), `${tpg?.chips}`);
      ok(tag, `the door the words chose is preselected (${P.expect.door})`, log.find((x) => x.preselected)?.preselected === P.expect.door, log.find((x) => x.preselected)?.preselected);
      ok(tag, 'the door is kept on the trip', s.door === P.expect.door, s.door);
      // Prices: the card, the finder's trip page and TripSummary.
      if (fig.card) {
        const card = eurOf(fig.card.total);
        ok(tag, 'card total = finder trip page total (whole euros)', Math.abs(card - Math.round(fig.tripPage?.eur)) <= 1, `${card} vs ${fig.tripPage?.eur}`);
        ok(tag, 'finder trip page total = TripSummary total (to the cent)', Math.abs(fig.tripPage?.eur - tpg?.total) < 0.02, `${fig.tripPage?.eur} vs ${tpg?.total}`);
      }
      if (fig.flight) {
        ok(tag, 'the picked flight lands on the trip page (its times)', (() => { const m = fig.flight.legs[0]?.match(/(\d\d:\d\d) to (\d\d:\d\d)/); return m && (tpg?.route || '').includes(`${m[1]} to ${m[2]}`); })(), fig.flight.legs[0]);
        if (P.expect.budget) ok(tag, 'the flight list keeps to the budget (fare for one under it)', fig.flights.every((r) => eurOf(r.fare) <= P.expect.budget), fig.flights.map((r) => r.fare).join(', '));
      }
      if (P.expect.towns) ok(tag, 'the named towns are the route, in order', P.expect.towns.every((x) => (tpg?.route || '').includes(x)) && tpg.route.indexOf(P.expect.towns[0]) < tpg.route.indexOf(P.expect.towns[1]), (tpg?.route || '').slice(0, 160));
      if (P.expect.paid) ok(tag, "the words' booked flight fills the typed form (town and day, both ways)", (fig.prefill || []).length === 2 && fig.prefill.every((x) => x.town === 'Prague') && fig.prefill[0].day === '2026-11-21' && fig.prefill[1].day === '2026-11-28', JSON.stringify(fig.prefill));
      if (P.expect.paid) ok(tag, 'the typed flight is the traveller\'s own, both ways booked', tpg?.booked >= 2 && /Your own/.test(tpg?.route || ''), `${tpg?.booked} booked`);
      if (P.expect.budget && tpg?.total && P.id === 1) ok(tag, 'the planned trip is inside the budget said in the words', tpg.total <= P.expect.budget, `${tpg.total} of ${P.expect.budget}`);
      ok(tag, 'trip page: no sideways scroll', await noSideways(page));
      await shot(page, `p${P.id}-05-trip-${W}`);
      fig.costs = await costTab(page).catch(() => '');
      // Plan your days.
      const go = page.locator('.tpg-tool.is-primary:visible, .tpg-dock-go:visible').first();
      ok(tag, 'Plan your days is the trip page\'s one primary', tpg?.planDays >= 1);
      if (await go.count()) {
        await go.click(); await page.waitForTimeout(2000);
        const sheetTitle = () => page.evaluate(() => ({ title: document.querySelector('.fsheet h2, .fsheet .fsheet-title, [role="dialog"] h2')?.innerText.trim() || '', count: document.querySelector('.fsheet, [role="dialog"]')?.innerText.match(/\d+ (of|van) \d+/)?.[0] || '', opts: [...document.querySelectorAll('.fsheet [role="radio"], .fsheet [role="checkbox"], [role="dialog"] [role="radio"]')].map((e) => e.innerText.trim()) }));
        const first = await sheetTitle();
        ok(tag, 'Plan your days opens the day questions', first.title.length > 0, `${first.title} ${first.count}`);
        await shot(page, `p${P.id}-06-days-${W}`);
        const days = [];
        for (let k = 0; k < 9; k++) {
          const q = await sheetTitle();
          if (!q.title) break;
          days.push(q);
          const o = page.locator('.fsheet [role="radio"], [role="dialog"] [role="radio"]').first();
          if (await o.count() && !(await page.locator('.fsheet [aria-checked="true"], [role="dialog"] [aria-checked="true"]').count())) await o.click().catch(() => {});
          const go2 = page.locator('.fsheet .btn-primary:visible, [role="dialog"] .btn-primary:visible').last();
          if (!(await go2.count()) || !(await go2.isEnabled())) break;
          if (/plant de dagen|plans the days/i.test(q.title)) break;
          await go2.click(); await page.waitForTimeout(800);
        }
        fig.days = days; log.push({ screen: 'Plan your days', questions: days.map((q) => `${q.title} (${q.count}): ${q.opts.join(' / ')}`) });
      }
      writeFileSync(`${OUT}/p${P.id}-${W}.json`, JSON.stringify({ log, fig, settings: s }, null, 1));
      await ctx.close();
    });
  }
}

await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass} of ${results.length} pass; console errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) console.log(e);
