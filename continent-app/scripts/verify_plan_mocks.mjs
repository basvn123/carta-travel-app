// T1089 needs: dist (U needs a build wired to the mock Supabase host; skips when the app never calls it)
// The trip planner flows that need a backend, against mocks (T675):
//   U  a booking upload fills the setup, then Your stays and where you land
//   L  (removed T1089: live flights on the planned trip, ranked by what
//      matters most. Its path, trip home -> four doors -> "I know where" ->
//      days, is gone; Start planning now runs the Help me choose quiz and
//      the trip finder. Needs a rewrite on that path: see the open register.)
//   N  on a trip now: where you are, until when, the engine starts there
//   S  "Plan a trip here" (?tab=trip&cc=PT) enters the flow on Where
//
// Build with the verify seams on and a fake Supabase host, so nothing ever
// reaches the real project (parse-booking is answered here):
//   VITE_E2E_SEAMS=1 VITE_SUPABASE_URL=http://sb.mock.test VITE_SUPABASE_ANON_KEY=mock-anon npx vite build
// Serve the build with the catalogue (public/) on a port, then
//   node scripts/verify_plan_mocks.mjs <shotdir> [width] [base]
//   ONLY=UL node scripts/verify_plan_mocks.mjs ...   runs some of them
// The service worker is blocked: page.route cannot see the fetches it serves.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[4] || `http://localhost:${process.env.CARTA_PORT || 5254}`;
const OUT = process.argv[2] || 'scripts/shots/plan-mocks';
const w = Number(process.argv[3] || 390);
fs.mkdirSync(OUT, { recursive: true });
const log = [];
const results = [];
const note = (msg) => { log.push(`[${w}] ${msg}`); console.log(`[${w}] ${msg}`); };
const check = (name, ok, extra = '') => { results.push({ name, ok }); note(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };

const BOOKINGS = [
  { kind: 'flight_out', title: 'TAP TP641 BRU to LIS', city: 'Lisbon', date: '2027-05-10', eur: 92, code: 'X7K2PQ' },
  { kind: 'stay', title: 'Casa do Largo', city: 'Lisbon', date: '2027-05-10', eur: 420 },
  { kind: 'stay', title: 'Ribeira Flats', city: 'Porto', date: '2027-05-14', eur: 310 },
  { kind: 'flight_home', title: 'Brussels Airlines SN3816 OPO to BRU', city: 'Porto', date: '2027-05-17', eur: 88, code: 'X7K2PQ' },
];
const FLIGHTS = [
  { price: 59, airline: 'TAP Air Portugal', dep: '06:05', arr: '11:40', stops: 1, flightNo: 'TP1' },
  { price: 89, airline: 'Brussels Airlines', dep: '10:15', arr: '12:30', stops: 0, flightNo: 'SN3811' },
];

const browser = await chromium.launch();
let flightCalls = 0;
let parseCalls = 0;
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 769 ? 844 : 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => note(`PAGEERROR ${e.message}`));
  await page.route('http://sb.mock.test/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/parse-booking')) {
      parseCalls += 1;
      await new Promise((r) => setTimeout(r, 600));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bookings: BOOKINGS, activities: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/rest/v1/') ? '[]' : '{}' });
  });
  page.on('request', (r) => { if (r.url().includes('/api/')) note(`request ${r.url().replace(BASE, '')}`); });
  await page.route((u) => u.pathname === '/api/flights', async (route) => {
    flightCalls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checked: new Date().toISOString(), link: 'https://www.google.com/travel/flights', flights: FLIGHTS }) });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1');
    } catch { /* none */ }
  });
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${w}-${name}.png` });
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o > 1) note(`OVERFLOW ${o}px on ${name}`);
};
const title = async (page) => (await page.locator('.pf-title').first().textContent().catch(() => '')) || '';
const cont = (page) => page.locator('.pf-foot .btn-primary').first().click();
const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || '{}'));
const bodyText = (page) => page.evaluate(() => document.body.innerText);

/** The setup questions after the free field, answering what the run names. */
async function walkSetup(page, { booked = null, priority = null, extra = null } = {}) {
  const seen = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(400);
    if (await page.locator('.pf-create').count()) break;
    const tt = await title(page);
    seen.push(tt);
    if (booked && /booked/i.test(tt)) for (const b of booked) await page.getByRole('checkbox', { name: b }).click();
    if (priority && /matters most/i.test(tt)) await page.getByRole('radio', { name: priority }).click();
    if (extra) await extra(page, tt);
    const btn = page.locator('.pf-foot .btn-primary').first();
    if (await btn.isDisabled()) { note(`continue disabled on ${tt}`); break; }
    await btn.click();
  }
  return seen;
}

// ---- U. A booking upload fills the setup and Your stays ----
const ONLY = process.env.ONLY || 'UNS';
if (ONLY.includes('U')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=plan&paymock`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pf-open', { timeout: 30000 });
  await page.getByRole('button', { name: 'Start planning' }).click();
  await cont(page);
  await page.waitForSelector('#pf-tell');
  await page.locator('.pf-prompt input[type=file]').setInputFiles({ name: 'booking.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% booking\n') });
  // The parse-booking call goes to the mock Supabase host baked into the build
  // (VITE_SUPABASE_URL=http://sb.mock.test). A dev server has no Supabase at
  // all, so the app never calls it: that is the missing precondition, not a
  // failure. Once the call is made the checks below run in full.
  await page.waitForTimeout(6000);
  if (parseCalls === 0) {
    const skip = new Error('SKIP (needs dist): the app made no parse-booking call; build with VITE_E2E_SEAMS=1 VITE_SUPABASE_URL=http://sb.mock.test VITE_SUPABASE_ANON_KEY=mock-anon');
    skip.skip = true;
    throw skip;
  }
  await page.waitForFunction(() => /Bookings read/.test(document.querySelector('.pf-note')?.textContent || ''), null, { timeout: 15000 });
  const read = (await page.locator('.pf-note').textContent()) || '';
  check('U upload is read', parseCalls === 1 && /4/.test(read), read.trim());
  await shot(page, 'U1-tell-read');
  await cont(page);
  const seen = await walkSetup(page, { priority: /A good balance/ });
  check('U booked, When and From are not asked again', !seen.some((s) => /booked|When do you|leave from/i.test(s)), seen.join(' | '));
  const d1 = await draft(page);
  check('U settings carry the bookings', d1.settings?.booked?.flights && d1.settings?.booked?.stays && d1.settings?.when?.start === '2027-05-10' && d1.settings?.when?.end === '2027-05-17', JSON.stringify(d1.settings?.when));
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.waitForSelector('.pf-home', { timeout: 30000 });
  await page.locator('.pf-home .btn-primary').click();
  await page.waitForSelector('.guide-foot', { timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot(page, 'U2-from');
  const d15 = await draft(page);
  check('U the flight out answers where you land', d15.wizard?.arrivalId === 'LIS', d15.wizard?.arrivalId);
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(1500);
  await shot(page, 'U3-stays');
  const d2 = await draft(page);
  const wz = d2.wizard || {};
  check('U Your stays: Lisbon 4 nights, Porto 3', JSON.stringify(wz.order) === '["LIS","OPO"]' && wz.nights?.LIS === 4 && wz.nights?.OPO === 3, `${JSON.stringify(wz.order)} ${JSON.stringify(wz.nights)}`);
  check('U the prices paid are the stays\' own', wz.ownStays?.LIS === 420 && wz.ownStays?.OPO === 310, JSON.stringify(wz.ownStays));
  const txt = await bodyText(page);
  check('U the stays step shows both towns', /Lisbon/.test(txt) && /Porto/.test(txt));
  await page.context().close();
} catch (e) { if (e.skip) note(e.message); else check('U ran', false, e.message.split('\n')[0]); }

// ---- L. Live flights: removed T1089 (see the header) ----

// ---- N. On a trip now ----
if (ONLY.includes('N')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pf-open', { timeout: 30000 });
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('radio', { name: /on a trip/i }).click();
  await cont(page);
  await page.getByRole('radio', { name: /Add my trip as it is/ }).click();
  await cont(page);
  await page.waitForSelector('#pf-tell');
  await cont(page);
  const seen = await walkSetup(page, {
    booked: [/Nothing yet/],
    extra: async (p, tt) => {
      if (/Where are you now/i.test(tt)) {
        await shot(p, 'N1-where');
        await p.locator('.from-input').fill('Porto');
        await p.locator('.from-row', { hasText: /^Porto/ }).first().click();
      }
      if (/Until when/i.test(tt)) {
        const days = p.locator('button[data-iso]:not([aria-disabled="true"]):not(.outside)');
        await days.nth(5).click();
        await shot(p, 'N2-until');
      }
    },
  });
  check('N asks where you are and until when, not When or From', seen.some((s) => /Where are you now/i.test(s)) && seen.some((s) => /Until when/i.test(s)) && !seen.some((s) => /When do you want|leave from/i.test(s)), seen.join(' | '));
  const d = await draft(page);
  const today = new Date().toISOString().slice(0, 10);
  check('N the trip runs from today', d.settings?.kind === 'now' && d.settings?.when?.start === today && d.settings?.when?.nights > 0 && /Porto/.test(d.settings?.now?.name || ''), JSON.stringify({ kind: d.settings?.kind, when: d.settings?.when, now: d.settings?.now?.name }));
  // T1089: the doors and "I know where" are gone from the plan flow; Start
  // planning runs the Help me choose quiz. The trip home still shows the
  // trip beginning today (a trip under way has no departure town).
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.waitForSelector('.pf-home', { timeout: 30000 });
  await shot(page, 'N3-home');
  const startDate = ((await page.locator('.pf-home-date').first().textContent().catch(() => '')) || '').trim();
  const todayText = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  check('N the trip home starts today', startDate === todayText, `${startDate} vs ${todayText}`);
  await page.context().close();
} catch (e) { check('N ran', false, e.message.split('\n')[0]); }

// ---- S. "Plan a trip here" enters the flow on Where ----
if (ONLY.includes('S')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=trip&cc=PT`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.guide-foot', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await shot(page, 'S1-seed');
  const flow = await page.locator('.trip-wizard-modal.wiz-flow').count();
  const wz = (await draft(page)).wizard || {};
  check('S the seed opens the flow\'s engine (the new look)', flow > 0);
  check('S on Where with Portugal picked', wz.stepName === 'Where' && (wz.countries || []).join() === 'Portugal', `${wz.stepName} ${JSON.stringify(wz.countries)}`);
  await page.context().close();
} catch (e) { check('S ran', false, e.message.split('\n')[0]); }

await browser.close();
const failed = results.filter((r) => !r.ok).length;
note(`${results.length - failed} of ${results.length} checks pass`);
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'));
process.exit(failed ? 1 : 0);
