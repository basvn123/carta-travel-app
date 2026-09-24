// Scenario B walk-through (hotel/comfort couple, 5 nights, two adults):
// trip wizard via the Where quiz, then the day planner's landing flow into
// the chat planner. Read-only on the app; it only writes screenshots and a
// JSON log. Run from inside continent-app/:  node scripts/scenario_B.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PORT = 4222;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'shots/scenarios/B';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite preview never came up'); process.exit(1); }
}

const log = [];
const note = (k, v) => { log.push({ k, v }); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
const errors = [];
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|emrldtp|entrypoint_config|config is not valid/i;

const appData = JSON.parse(readFileSync('public/app_data.json', 'utf8'));
const dests = appData.destinations || {};
note('meta.window', { start: appData.meta?.start_date, end: appData.meta?.end_date, defaults: appData.meta?.defaults });

// The geocoder fixture is decided once the quiz has recommended a country.
let geoFixture = {
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel', address: { country: 'Italy', country_code: 'it' },
};

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
const wire = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 160));
  });
  return page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([geoFixture]),
  }));
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await seed(page);
await wire(page);

let n = 0;
const shot = async (name, full = false) => {
  n += 1;
  const file = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: full });
  note('shot', file);
  return file;
};
const text = () => page.evaluate(() => document.body.innerText);
const step = () => page.evaluate(() => {
  const a = document.querySelector('[aria-current="step"]');
  const b = document.querySelector('.shape-head-title');
  const c = document.querySelector('.shape-head-step');
  return [(a?.textContent || '').trim(), (b?.textContent || '').trim(), (c?.textContent || '').trim()].filter(Boolean).join(' | ');
});
const clickText = async (re, sel = 'button') => {
  const loc = page.locator(`${sel}:visible`, { hasText: re }).first();
  await loc.click({ timeout: 8000 });
  await page.waitForTimeout(600);
};
const next = async () => {
  const b = page.locator('.guide-next:visible').first();
  const disabled = await b.isDisabled().catch(() => null);
  note('next.disabled', disabled);
  await b.click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  note('step', await step());
};
const offscreen = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, docW: document.documentElement.scrollWidth };
}, sel);

try {
  // ───────────────────────────── TRIP TAB ─────────────────────────────
  await page.goto(`${BASE}?tab=trip&paymock&o=BRU`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  note('step', await step());
  note('hscroll', await offscreen('body'));
  await shot('trip-booked');

  // Booked: nothing booked.
  const noneBtn = page.locator('.guide-booked-none');
  note('booked.none.pressed', await noneBtn.getAttribute('aria-pressed'));
  await noneBtn.click();
  await page.waitForTimeout(400);
  await next();

  // From.
  note('from.text', (await text()).slice(0, 600));
  await shot('trip-from');
  await next();

  // When: try for May 2027 on the calendar and record where the bound is.
  await shot('trip-when-exact');
  const navs = page.locator('.cal-nav');
  note('cal.navs', await navs.count());
  const navLabels = await navs.evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label') || e.textContent.trim(), e.disabled]));
  note('cal.navLabels', navLabels);
  let lastMonth = '';
  for (let i = 0; i < 12; i += 1) {
    const nxt = navs.last();
    if (await nxt.isDisabled()) break;
    await nxt.click();
    await page.waitForTimeout(150);
  }
  lastMonth = await page.evaluate(() => [...document.querySelectorAll('.cal-head')].map((h) => h.textContent.trim()).join(' / '));
  note('cal.furthestMonth', lastMonth);
  await shot('trip-when-calendar-bound');

  // Flexible: 5 nights, May if offered.
  await clickText(/flexible/i);
  const monthChips = await page.locator('.guide-month-grid .guide-chip').allTextContents();
  note('when.monthChips', monthChips);
  const nightsBox = page.locator('.guide-people-lg');
  for (let i = 0; i < 10; i += 1) {
    const cur = (await nightsBox.locator('span').first().textContent()).trim();
    const v = Number(cur.match(/\d+/)?.[0]);
    if (v === 5) break;
    await nightsBox.locator('button').nth(v > 5 ? 0 : 1).click();
    await page.waitForTimeout(120);
  }
  note('when.nights', (await nightsBox.locator('span').first().textContent()).trim());
  const may = monthChips.find((c) => /may/i.test(c));
  const chosenMonth = may || monthChips.find((c) => /sep/i.test(c)) || monthChips[1];
  note('when.monthChosen', { may: Boolean(may), chosenMonth });
  await page.locator('.guide-month-grid .guide-chip', { hasText: chosenMonth }).first().click();
  await page.waitForTimeout(300);
  await shot('trip-when-flex');
  await next();

  // Where: quiz.
  note('where.tabs', await page.locator('.guide-wtabs button').allTextContents());
  const helpTab = page.locator('#wtab-help');
  note('where.helpSelected', await helpTab.getAttribute('aria-selected'));
  if ((await helpTab.getAttribute('aria-selected')) !== 'true') await helpTab.click();
  await page.waitForTimeout(500);
  await shot('trip-where-quiz-q1');
  await clickText(/^Beach & relax$/i, '.wq-chip');
  await clickText(/^Food & wine$/i, '.wq-chip');
  await page.locator('.wq-next:visible').click();
  await page.waitForTimeout(400);
  await clickText(/Hotels & comfort/i, '.wq-chip');
  await clickText(/Fly in/i, '.wq-chip');
  await clickText(/Anywhere in Europe/i, '.wq-chip');
  await clickText(/One base/i, '.wq-chip');
  await page.waitForTimeout(2500); // layer indexes
  note('where.quizSummary', await page.locator('.wq-done').allTextContents());
  note('where.monthLine', await page.locator('.wq-month').textContent().catch(() => ''));
  const cards = await page.evaluate(() => [...document.querySelectorAll('.mcard')].map((c) => ({
    country: c.querySelector('.mcard-head b')?.textContent.trim(),
    match: c.querySelector('.mcard-match')?.textContent.trim(),
    reasons: [...c.querySelectorAll('.mcard-why li')].map((li) => li.textContent.trim()),
    places: [...c.querySelectorAll('.mcard-place-name')].map((p) => p.textContent.trim()),
  })));
  note('where.cards', cards);
  note('where.more', await page.locator('.mcards-more').textContent().catch(() => ''));
  note('where.empty', await page.locator('.guide-empty:visible').allTextContents());
  await shot('trip-where-recommended', true);
  if (!cards.length) throw new Error('no recommendation cards');
  const pick = cards[0];
  await page.locator('.mcard .mcard-add').first().click();
  await page.waitForTimeout(500);
  note('where.picked', await page.locator('.guide-picked-chip').allTextContents());
  // Geocoder fixture: a hotel in the first pictured place of the top country.
  const placeName = pick.places[0];
  const dEntry = Object.entries(dests).find(([, d]) => d && d.city && d.city.toLowerCase().startsWith(String(placeName || '').toLowerCase()) && d.lat != null);
  if (dEntry) {
    const [id, d] = dEntry;
    geoFixture = {
      display_name: `Hotel Scenario B, ${d.city}, ${pick.country}`, name: 'Hotel Scenario B',
      lat: String(d.lat), lon: String(d.lon), category: 'tourism', type: 'hotel',
      address: { country: pick.country, country_code: String(d.iso2 || '').toLowerCase() },
    };
    note('geoFixture', { id, city: d.city, lat: d.lat, lon: d.lon });
  } else note('geoFixture', `no catalogue match for ${placeName}, keeping Rome`);
  await shot('trip-where-picked');
  await next();

  // Trips (or Stay).
  note('trips.text', (await text()).slice(0, 900));
  await shot('trip-trips', true);
  const choose = page.locator('.wtrip-choose:visible');
  let stopIds = [];
  if (await choose.count()) {
    const first = await page.locator('.wtrip').first().evaluate((c) => ({
      route: c.querySelector('.wtrip-route')?.textContent.trim(), days: c.querySelector('.wtrip-days')?.textContent.trim(),
    }));
    note('trips.first', first);
    await choose.first().click();
    await page.waitForTimeout(800);
    note('trips.chosen', await page.locator('.wtrip.on .wtrip-route').textContent().catch(() => ''));
  } else {
    note('trips.noneFit', await page.locator('.wready-empty').textContent().catch(() => ''));
    const own = page.locator('.wready-own-card:visible, .wready-empty .guide-back:visible').last();
    await own.click();
    await page.waitForTimeout(1000);
    note('step', await step());
    await shot('trip-stay-own');
    const city = page.locator('.guide-city-btn:visible').first();
    note('stay.firstCity', await city.textContent().catch(() => 'none'));
    await city.click();
    await page.waitForTimeout(800);
    const add = page.locator('.guide-city-side-add:visible');
    if (await add.count()) { await add.click(); await page.waitForTimeout(600); }
    note('stay.text', (await text()).slice(0, 700));
  }
  await shot('trip-trips-chosen', true);
  await next();

  // Getting there.
  note('getting.text', (await text()).slice(0, 1200));
  await shot('trip-getting', true);
  await next();

  // Finish.
  note('finish.step', await step());
  const finish = await page.evaluate(() => ({
    facts: [...document.querySelectorAll('.guide-summary-fact')].map((f) => f.textContent.trim().replace(/\s+/g, ' ')),
    stops: [...document.querySelectorAll('.guide-summary-stops .guide-final-stop')].map((f) => f.textContent.trim().replace(/\s+/g, ' ')),
    lines: [...document.querySelectorAll('.guide-estimate-line')].map((f) => f.textContent.trim().replace(/\s+/g, ' ')),
    title: document.querySelector('.guide-summary-title')?.textContent.trim().replace(/\s+/g, ' '),
  }));
  note('finish', finish);
  const draft = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('carta.plannerDraft.v1')); } catch { return null; } });
  note('finish.draft', { travelers: draft?.travelers, dates: draft?.travelDates, stops: draft?.stops, quiz: draft?.wizard?.quiz, countries: draft?.wizard?.countries });
  stopIds = (draft?.stops || []).map((s) => s.cityId);
  await shot('trip-finish', true);

  // What the Stays line would be per tier, replicated from nightlyFor().
  try {
    const rp = await import('../src/lib/runtime_pricing.js');
    const gs = (draft?.travelers?.adults || 2) + (draft?.travelers?.children || 0);
    const start = draft?.travelDates?.startDate || null;
    const perTier = {};
    for (const tier of ['private', 'home', 'hotel3', 'hotel4', 'hotel5']) {
      let sum = 0;
      for (const s of draft?.stops || []) {
        const d = dests[s.cityId];
        const a = d ? rp.accommodationPerPerson(d, 2, start, null, gs, tier) : null;
        const nightly = a && a.total > 0 ? Math.round((a.total * gs) / 2) : null;
        if (nightly != null) sum += nightly * (s.nights || 0);
      }
      perTier[tier] = sum;
    }
    note('finish.staysPerTier', { gs, start, perTier });
  } catch (e) { note('finish.staysPerTier.error', e.message); }

  // ───────────────────────────── DAY TAB ─────────────────────────────
  await page.goto(`${BASE}?tab=day&paymock&o=BRU`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('.day-flow-search input').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  note('day.step', await step());
  note('day.quickchips', await page.locator('.day-flow-quickchip').allTextContents());
  await shot('day-stay');
  await page.locator('.day-flow-search input').fill(geoFixture.name + ' ' + (geoFixture.display_name.split(',')[1] || ''));
  await page.locator('.day-flow-search .trip-add-btn').click();
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  note('day.hit', await page.locator('.day-stay-hit').first().textContent());
  await page.locator('.day-stay-result').first().click();
  await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
  note('day.chosen', await page.locator('.day-flow-chosen').textContent());
  await shot('day-stay-chosen');
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  note('day.when.chips', await page.locator('.day-flow-chip').allTextContents());
  note('day.when.banner', await page.locator('.day-flow-dest').textContent().catch(() => ''));
  // The trip's dates should be the obvious quick answer here; take whatever
  // the flow offers first, else the first enabled calendar day.
  const chip = page.locator('.day-flow-chips-center .day-flow-chip').first();
  if (await chip.count()) await chip.click();
  else await page.locator('.day-flow-date .cal-day:not([disabled]):not([aria-disabled="true"])').first().click();
  await page.waitForTimeout(400);
  await shot('day-when');
  await page.locator('.day-flow-next').click();
  await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
  note('day.ideas.text', (await text()).slice(0, 500));
  await shot('day-ideas');
  await page.getByRole('button', { name: /surprise me/i }).click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
  note('day.how.cards', await page.locator('.day-flow-card').allTextContents());
  await shot('day-how', true);
  await page.locator('.day-flow-card.primary').click();
  await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);

  const chatState = () => page.evaluate(() => ({
    progress: document.querySelector('.chat-progress')?.textContent.trim(),
    question: document.querySelector('.chat-bubble-live')?.textContent.trim(),
    options: [...document.querySelectorAll('.chat-body .chat-opt')].map((o) => ({ t: o.textContent.trim().replace(/\s+/g, ' '), on: o.classList.contains('on'), pressed: o.getAttribute('aria-pressed') })),
    chips: [...document.querySelectorAll('.chat-body .carta-plan-chip')].map((o) => ({ t: o.textContent.trim(), on: o.classList.contains('on') })),
    transcript: [...document.querySelectorAll('.chat-bubble-edit-text')].map((o) => o.textContent.trim()),
  }));
  const q1 = await chatState();
  note('chat.q1', q1);
  await shot('chat-q1-companions');
  await page.locator('.chat-body .chat-opt', { hasText: /^Partner/ }).first().click();
  await page.waitForTimeout(500);
  const q2 = await chatState();
  note('chat.q2', q2);
  await shot('chat-q2-window-start');
  await page.locator('.chat-body .chat-opt', { hasText: /full day/i }).first().click();
  await page.waitForTimeout(500);
  const q3 = await chatState();
  note('chat.q3', q3);
  await shot('chat-q3-steps');
  await page.locator('.chat-body .chat-opt', { hasText: /^Easy/ }).first().click();
  await page.waitForTimeout(500);
  const q4 = await chatState();
  note('chat.q4', q4);
  await shot('chat-q4-moods');
  // Walk forward without answering more than needed until the food question.
  for (let guard = 0; guard < 6; guard += 1) {
    const st = await chatState();
    if (/food/i.test(st.question || '')) break;
    if (await page.locator('.chat-town-picker').count()) {
      note('chat.townQuestion', st);
      await shot('chat-town');
      await page.locator('.chat-town-picker .chat-opt').first().click();
    } else if (await page.locator('.chat-opts-multi').count()) {
      await page.locator('.chat-send:visible').first().click();
    } else if (await page.locator('.chat-body .chat-opt:visible').count()) {
      await page.locator('.chat-body .chat-opt:visible').first().click();
    }
    await page.waitForTimeout(500);
  }
  const qFood = await chatState();
  note('chat.food', qFood);
  await shot('chat-food');
  note('chat.stayBanner', await page.locator('.day-flow-dest, .chat-head').allTextContents().catch(() => []));
} catch (e) {
  note('ERROR', e.message);
  await shot('error').catch(() => {});
} finally {
  note('errors', errors);
  writeFileSync(`${SHOTS}/log.json`, JSON.stringify(log, null, 1));
  await browser.close();
  if (server) {
    server.kill();
    if (process.platform === 'win32' && server.pid) {
      try { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
}
