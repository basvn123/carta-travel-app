// T870-T873 end check (plan flow v3, Batch F) on a NOPUBLIC build + public/.
//   node walk-f.mjs <port> <label> [outDir]
// 1. T870: a card opens the trip page (#tf=<id>, one history step): the bar,
//    the gallery with a credit, the head, the price card (the group total the
//    card shows, the cost bar in the four cost colours, four lines, one
//    primary, save), sticky from 1024 px; Back and Forward, the page's own
//    back, focus back on the card; an address with #tf= opens the page.
// 2. T871: who it is for (no dash, no empty slot), the fact band, the route
//    map and stops, what you would do, why it fits and the catch,
//    alternatives (one opens in place); a line opens its picker and back.
// 3. T872: Plan this trip lands on the trip page v4 (no wizard, no stepper).
// 4. T873: Ready to book (the flight, each stay, each hop, each with its link
//    out and Add what you paid); a price typed there is the traveller's own.
// 5. Dutch at 1440: the paragraph and the page's words.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const APP = 'C:/Users/Gebruiker/Documents/Portfolio/Travel App/continent-app';
const { chromium } = await import(`file:///${APP}/node_modules/playwright/index.mjs`);
const { normalizeSettings, draftPatch } = await import(`file:///${APP}/src/planner/flow/tripSettings.js`);
const PORT = process.argv[2] || 5870;
const LABEL = process.argv[3] || 'after';
const OUT = process.argv[4] || `C:/Users/Gebruiker/Documents/Portfolio/Travel App/Execution/P15/T870-T873-walk/${LABEL}`;
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
const GHENT = { name: 'Ghent', lat: 51.054, lng: 3.717, countryCode: 'BE' };
const settings = (extra = {}) => normalizeSettings({
  answered: ['tell', 'booked', 'who', 'sleep', 'priority', 'when', 'from'],
  party: { kind: 'couple', adults: 2 }, priority: 'balance', when: { mode: 'exact', start: '2026-11-21', end: '2026-11-28', nights: 7 },
  from: GHENT,
  guide: { shapes: ['towns'], likes: ['hiking', 'food'], weather: 'mild', reach: 'short', avoid: ['crowds'], budget: { kind: 'total', eur: 1200 }, ...(extra.guide || {}) },
  ...extra,
  trip: { name: 'Winter week', created: Date.now() },
});
const draftOf = (s) => JSON.stringify({ version: 2, savedAt: Date.now(), ...draftPatch(s, {}) });
const results = []; const errors = [];
const ok = (w, label, v, note = '') => { results.push({ w, label, ok: !!v, note }); console.log(`${v ? 'PASS' : 'FAIL'} [${w}] ${label}${note ? `  (${note})` : ''}`); };
const NOISE = /ERR_FAILED|config is not valid|favicon|CORS|Access-Control|net::ERR|Failed to load resource|Download the React DevTools|basemaps|cartocdn|maplibre|WebGL|style/i;
const noSideways = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const n = (s) => Number(String(s).replace(/[^0-9]/g, ''));
const browser = await chromium.launch();
const scrollerY = (p, set = null) => p.evaluate((v) => {
  let el = document.querySelector('.tff-list');
  for (el = el?.parentElement; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) break;
  }
  el = el || document.scrollingElement;
  if (v != null) el.scrollTop = v;
  return Math.round(el.scrollTop);
}, set);
const shot = async (page, name, full = false) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const step = async (w, name, fn) => { try { await fn(); } catch (e) { ok(w, `${name} ran`, false, e.message.split('\n')[0]); } };

async function open(W, draft, { lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${W}] pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`[${W}] console: ${m.text().slice(0, 200)}`); });
  await page.route('**/flights/*.json', (r) => {
    const code = r.request().url().match(/flights\/([A-Z_a-z]+)\.json/)?.[1];
    if (code === '_index') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: AIRLINES });
    return code === 'BRU' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sweep()) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/flights**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(([dd, lg]) => { try {
    localStorage.setItem('continent.lang.v1', lg); localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1'); localStorage.setItem('carta.welcomeSeen', '1'); localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('carta.plannerDraft.v1', dd); sessionStorage.setItem('seeded', '1'); }
  } catch { /* storage */ } }, [draft, lang]);
  await page.goto(`http://localhost:${PORT}/?o=BRU&oa=BRU&ah=p&dh=51.0540,3.7170,Ghent`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  const nav = page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1);
  await nav.click(); await page.waitForTimeout(1500);
  return { ctx, page };
}

async function toFinder(page) {
  await page.locator('.pf-trip-link').first().click(); await page.waitForTimeout(1500);
  await page.locator('.pf .pf-home .btn-primary, .pf .pf-foot .btn-primary').first().click(); await page.waitForTimeout(600);
  if (await page.locator('.pf-door[data-door="guide"]').count()) { await page.locator('.pf-door[data-door="guide"]').click(); await page.waitForTimeout(200); }
  await page.locator('.pf .pf-foot .btn-primary').last().click(); await page.waitForTimeout(400);
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tff-trips, .tff-load').count()) break;
    const prim = page.locator('.pf .pf-foot .btn-primary').last();
    if (await prim.count() && await prim.isEnabled()) await prim.click(); else await page.locator('.pf .pf-foot button:not([disabled])').first().click().catch(() => {});
    await page.waitForTimeout(450);
  }
  await page.locator('.tff-trips').waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
}

const pageFacts = (page) => page.evaluate(() => {
  const tp = document.querySelector('.tff-tp');
  if (!tp) return null;
  const q = (s) => tp.querySelector(s);
  const side = q('.tff-tp-side');
  const facts = q('.tff-tp-facts');
  return {
    title: q('h1')?.innerText.trim(),
    focusTitle: document.activeElement === q('h1'),
    hash: location.hash,
    back: q('.tff-tp-back')?.innerText.trim(),
    photos: tp.querySelectorAll('.tff-gal-slide').length,
    credit: q('.tff-tp-credit')?.innerText.trim() || '',
    creditHref: q('.tff-tp-credit')?.getAttribute('href') || '',
    meta: q('.tff-pv-meta')?.innerText.replace(/\s+/g, ' ').trim(),
    who: q('.tff-tp-prose')?.innerText.trim() || '',
    facts: [...tp.querySelectorAll('.tff-tp-fact')].map((f) => f.dataset.fact),
    factText: facts?.innerText.replace(/\s+/g, ' ').trim() || '',
    eur: Number((q('.tff-tp-eur')?.innerText || '').replace(/[^0-9]/g, '')),
    unit: q('.tff-tp-unit')?.innerText.trim(),
    segs: [...tp.querySelectorAll('.tff-tp-costbar > span')].map((s) => ({ cls: s.className, bg: getComputedStyle(s).backgroundColor })),
    lines: [...tp.querySelectorAll('.tff-tp-line')].map((l) => l.className.replace('tff-tp-line ', '')),
    dots: [...tp.querySelectorAll('.tff-tp-line .plan-total-dot')].map((d) => getComputedStyle(d).backgroundColor),
    primaries: tp.querySelectorAll('.btn-primary').length,
    plan: q('.tff-tp-plan')?.innerText.trim(),
    heart: Boolean(q('.tff-pv-heart')),
    sticky: side ? getComputedStyle(side).position : '',
    sideTop: side ? Math.round(side.getBoundingClientRect().top) : null,
    factsTop: facts ? Math.round(facts.getBoundingClientRect().top) : null,
    sideLeft: side ? Math.round(side.getBoundingClientRect().left) : null,
    map: Boolean(q('.tff-tp-map')),
    stops: tp.querySelectorAll('.tff-route-stop').length,
    sights: tp.querySelectorAll('.tff-sight').length,
    fits: Boolean(q('#tff-tp-fits')),
    catch: Boolean(q('#tff-tp-catch')),
    alts: tp.querySelectorAll('.tff-tp-alts .tff-card').length,
    listHidden: document.querySelector('.tff-under')?.hidden === true,
    width: Math.round(tp.getBoundingClientRect().width),
  };
});

for (const W of WIDTHS) {
  await step(W, 'walk', async () => {
    const { ctx, page } = await open(W, draftOf(settings()));
    await toFinder(page);
    await shot(page, `01-results-${W}`);
    const first = page.locator('.tff-list .tff-card').first();
    const cardName = (await first.locator('.tff-card-name').innerText()).trim();
    const cardEur = n(await first.locator('.tff-total-eur').innerText());
    const cardCatch = (await first.locator('.tff-card-catch').count()) > 0;
    const href = await first.locator('.tff-card-open').getAttribute('href');
    ok(W, 'T870 card: the name is a link to the trip page', /^#tf=tf_/.test(href || ''), href);
    const yBefore = await scrollerY(page, 260);
    await first.locator('.tff-card-photos, .tff-card-media').first().click({ position: { x: 40, y: 40 } }).catch(() => first.locator('.tff-card-open').click());
    await page.waitForTimeout(1500);
    let f = await pageFacts(page);
    ok(W, 'T870 a card opens the trip page, not a dialog', f && (await page.locator('[role="dialog"].tff-pv').count()) === 0, f?.title);
    ok(W, 'T870 the page has its own address (#tf=)', f?.hash === href, f?.hash);
    ok(W, 'T870 the list is hidden under the page', f?.listHidden);
    ok(W, 'T870 the heading is the trip name and takes focus', f?.title === cardName && f.focusTitle, f?.title);
    ok(W, 'T870 the bar goes back to Trips for you', f?.back === 'Trips for you');
    ok(W, 'T870 the gallery has photos', f?.photos >= 1, String(f?.photos));
    ok(W, 'T871 a photo credit links the file page (T811-c)', /^Photo: /.test(f?.credit) && /commons\.wikimedia\.org|geograph/.test(f?.creditHref), f?.credit);
    ok(W, 'T870 the head names country, dates, nights, bases', /nights/.test(f?.meta || '') && /base/.test(f?.meta || ''), f?.meta);
    ok(W, 'T870 the price card total is the card total for the group', f?.eur === Math.round(cardEur * 100) || Math.round(f?.eur / 100) === cardEur, `${f?.eur} vs ${cardEur}`);
    ok(W, 'T870 the price card says for 2', /for 2/.test(f?.unit || ''), f?.unit);
    const colours = new Set((f?.segs || []).map((s) => s.bg));
    ok(W, 'T870 the cost bar has a segment a group in its own colour', f?.segs.length >= 3 && colours.size === f.segs.length, JSON.stringify(f?.segs.map((s) => s.cls)));
    ok(W, 'T870 four lines: travel, around, stay, food, each with its dot', ['is-travel', 'is-stay', 'is-food', 'is-around'].every((c) => f?.lines.includes(c)) && f.dots.length === 4 && new Set(f.dots).size === 4, f?.lines.join());
    ok(W, 'T870 one primary on the page: Plan this trip', f?.primaries === 1 && f.plan === 'Plan this trip');
    ok(W, 'T870 save sits beside it', f?.heart);
    if (W >= 1024) {
      ok(W, 'T870 the price card is a sticky side column from 1024 px', f?.sticky === 'sticky' && f.sideLeft > W / 2, `${f?.sticky} at ${f?.sideLeft}`);
      ok(W, 'T870 the page caps at 1180 px', f?.width <= 1180, String(f?.width));
    } else {
      ok(W, 'T870 on a phone the price card follows the fact band, in the content', f?.sticky !== 'sticky' && f.sideTop > f.factsTop, `${f?.sideTop} > ${f?.factsTop}`);
    }
    ok(W, 'T871 who it is for: a paragraph with no dash and no empty slot', f?.who.length > 60 && !/[\u2013\u2014\u00b7]|\{\w+\}/.test(f.who), f?.who);
    ok(W, 'T871 the paragraph names the trip\'s first place', f?.who.includes(cardName.split(/ and |, /)[0]), f?.who.slice(0, 80));
    ok(W, 'T871 the fact band: door to door, weather, crowds, getting around, airport', ['door', 'weather', 'crowds', 'around', 'airport'].every((k) => f?.facts.includes(k)), f?.factText);
    ok(W, 'T871 the route: a map and a stop a place', f?.map && f.stops >= 1, String(f?.stops));
    ok(W, 'T871 why it fits, and the catch where the card names one', f?.fits && (!cardCatch || f.catch), `catch on card ${cardCatch}, on page ${f?.catch}`);
    ok(W, 'T871 not quite right: up to three alternatives', f?.alts >= 1 && f.alts <= 3, String(f?.alts));
    ok(W, 'T870 no sideways scroll', await noSideways(page));
    await page.waitForTimeout(1500);
    await shot(page, `02-trip-page-${W}`);
    for (const [sel, nm] of [['.tff-tp-side', '02b-price'], ['.tff-tp-map', '02c-route'], ['#tff-tp-do', '02d-do'], ['.tff-tp-alts', '02e-alts']]) {
      await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await shot(page, `${nm}-${W}`);
    }

    // Back (the browser's), then forward, then the page's own back.
    await page.goBack(); await page.waitForTimeout(900);
    const back1 = await page.evaluate(() => ({ hash: location.hash, list: !document.querySelector('.tff-under')?.hidden && !document.querySelector('.tff-tp'), focus: document.activeElement?.classList.contains('tff-card-open') }));
    back1.y = await scrollerY(page);
    ok(W, 'T870 Back returns to the list, focus on the card', back1.hash === '' && back1.list && back1.focus, JSON.stringify(back1));
    ok(W, 'T870 the list is where it was', Math.abs(back1.y - yBefore) < 40, `${back1.y} vs ${yBefore}`);
    await page.goForward(); await page.waitForTimeout(900);
    ok(W, 'T870 Forward opens the trip again', (await pageFacts(page))?.title === cardName);
    await page.locator('.tff-tp-back').click(); await page.waitForTimeout(900);
    ok(W, 'T870 the page\'s back control returns to the list', (await page.evaluate(() => location.hash)) === '' && (await page.locator('.tff-tp').count()) === 0);

    // A line opens its picker; back returns to the page.
    await first.locator('.tff-card-open').click(); await page.waitForTimeout(1200);
    const stayLine = page.locator('.tff-tp-line.is-stay button');
    if (await stayLine.count()) {
      await stayLine.click(); await page.waitForTimeout(600);
      ok(W, 'T870 a line opens its picker in the page', (await page.locator('.tff-tp.is-picking .tff-pick').count()) === 1);
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      ok(W, 'T870 Escape leaves the picker for the page', (await page.locator('.tff-tp:not(.is-picking)').count()) === 1);
    } else ok(W, 'T870 the stay line has choices', false);

    // An alternative opens in place, the address follows.
    const altName = (await page.locator('.tff-tp-alts .tff-card-name').first().innerText()).trim();
    await page.locator('.tff-tp-alts .tff-card-open').first().click(); await page.waitForTimeout(1200);
    const alt = await pageFacts(page);
    ok(W, 'T871 an alternative opens in its place', alt?.title === altName && alt.hash.startsWith('#tf=') && alt.hash !== href, alt?.title);
    // An address with #tf= opens the page (a reload).
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
    const nav = page.locator('.header-nav-item:visible, nav.bottom-nav .bottom-nav-item:visible').nth(1);
    if (!(await page.locator('.tff-tp, .tff-trips, .tff-load').count())) { await nav.click().catch(() => {}); }
    await page.locator('.tff-tp').waitFor({ timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const re = await pageFacts(page);
    ok(W, 'T870 a reload on #tf= opens that trip\'s page', re?.title === altName, re?.title || 'no page');

    // T872: Plan this trip lands on the trip page v4, no wizard.
    const planEur = re?.eur;
    await page.locator('.tff-tp-plan').click(); await page.waitForTimeout(3000);
    const landed = await page.evaluate(() => ({
      tpg: Boolean(document.querySelector('.tpg')),
      wizard: document.querySelectorAll('.guide-canvas, .guide-foot, .guide-recap, .wz-rev, .wz-leg').length,
      hash: location.hash,
      name: document.querySelector('.tpg h1')?.innerText.trim(),
      total: document.querySelector('[data-testid="ts-total"] .tpg-band-n')?.dataset.total || document.querySelector('.tpg-band-n')?.innerText || '',
    }));
    ok(W, 'T872 Plan this trip lands on the trip page', landed.tpg && landed.wizard === 0, JSON.stringify(landed));
    ok(W, 'T872 the trip page address leaves with the plan', landed.hash === '');
    ok(W, 'T872 the trip page total is the finder page total', Math.abs(Number(landed.total) - planEur / 100) < 1.5, `${landed.total} vs ${planEur / 100}`);
    await shot(page, `03-landed-${W}`);

    // T873: Ready to book.
    const rb = await page.evaluate(() => {
      const sec = document.querySelector('[data-testid="tpg-book"]');
      if (!sec) return null;
      return {
        title: sec.querySelector('h2')?.innerText.trim(),
        rows: [...sec.querySelectorAll('.tpg-book-row')].map((r) => ({
          key: r.dataset.row, title: r.querySelector('.ts-node-title')?.innerText.trim(),
          link: r.querySelector('.tpg-book-link')?.getAttribute('href') || '', target: r.querySelector('.tpg-book-link')?.getAttribute('target') || '',
          paid: Boolean(r.querySelector('.plan-paid-add, .plan-paid')),
        })),
        note: sec.querySelector('.tpg-book-note')?.innerText.trim(),
        car: Boolean(document.querySelector('[data-testid="ts-car"]')),
      };
    });
    ok(W, 'T873 Ready to book is on the trip page', rb?.title === 'Ready to book');
    const keys = (rb?.rows || []).map((r) => r.key);
    ok(W, 'T873 the flight there, each stay, the flight home', keys[0] === 'flight-out' && keys.at(-1) === 'flight-back' && keys.filter((k) => k.startsWith('stay-')).length >= 1, keys.join());
    ok(W, 'T873 every row links out in a new tab and offers Add what you paid', (rb?.rows || []).every((r) => r.link && r.target === '_blank' && r.paid), JSON.stringify((rb?.rows || []).map((r) => [r.key, Boolean(r.link), r.paid])));
    ok(W, 'T873 the flight links to Google Flights, a stay to its book site', /google\.com\/travel\/flights/.test(rb?.rows[0]?.link || '') && /booking\.com|airbnb|hostelworld/.test(rb?.rows.find((r) => r.key.startsWith('stay'))?.link || ''));
    ok(W, 'T873 one line says prices may have changed', /may have changed/.test(rb?.note || ''));
    const stayRow = page.locator('.tpg-book-row[data-row="stay-0"]');
    await stayRow.locator('.plan-paid-add').click(); await page.waitForTimeout(300);
    await stayRow.locator('input').fill('321'); await stayRow.locator('input').press('Enter'); await page.waitForTimeout(900);
    const yours = await stayRow.locator('.ts-node-fig').innerText();
    ok(W, 'T873 a price typed there is the traveller\'s own', /321/.test(yours) && /yours|your/i.test(yours), yours.replace(/\s+/g, ' '));
    await page.locator('[data-testid="tpg-book"]').scrollIntoViewIfNeeded();
    await shot(page, `04-ready-to-book-${W}`);
    ok(W, 'T873 no sideways scroll on the trip page', await noSideways(page));
    writeFileSync(`${OUT}/rb-${W}.json`, JSON.stringify(rb, null, 1));
    await ctx.close();
  });
}

// Dutch at 1440: the paragraph and the page's words.
await step(1440, 'dutch', async () => {
  const { ctx, page } = await open(1440, draftOf(settings()), { lang: 'nl' });
  await toFinder(page);
  await page.locator('.tff-list .tff-card-open').first().click(); await page.waitForTimeout(1500);
  const f = await pageFacts(page);
  ok('nl', 'T871 the paragraph in Dutch, every slot filled', /^Voor /.test(f?.who || '') && !/\{\w+\}|[\u2013\u2014]/.test(f.who), f?.who);
  ok('nl', 'T870 the page in Dutch', f?.back === 'Reizen voor jou' && f.plan && !/tf\.|tp\./.test(f.factText), `${f?.back} ${f?.plan}`);
  await shot(page, '05-trip-page-nl-1440');
  await ctx.close();
});

await browser.close();
writeFileSync(`${OUT}/walk.json`, JSON.stringify({ results, errors }, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass} of ${results.length} pass; console errors: ${errors.length}`);
for (const e of errors) console.log(e);
