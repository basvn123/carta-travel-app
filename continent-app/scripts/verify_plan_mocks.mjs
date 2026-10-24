// The trip planner flows that need a backend, against mocks (T675):
//   U  a booking upload fills the setup, then Your stays and where you land
//   L  live flights on the planned trip, ranked by what matters most, and
//      re-ranked from the trip settings gear
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
const ONLY = process.env.ONLY || 'ULNS';
if (ONLY.includes('U')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=plan&paymock`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pf-intro', { timeout: 30000 });
  await page.getByRole('button', { name: 'Start planning' }).click();
  await cont(page);
  await page.waitForSelector('#pf-tell');
  await page.locator('.pf-prompt input[type=file]').setInputFiles({ name: 'booking.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% booking\n') });
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
} catch (e) { check('U ran', false, e.message.split('\n')[0]); }

// ---- L. Live flights on the planned trip, ranked by what matters most ----
if (ONLY.includes('L')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pf-intro', { timeout: 30000 });
  await page.getByRole('button', { name: 'Start planning' }).click();
  await cont(page);
  await page.waitForSelector('#pf-tell');
  await page.fill('#pf-tell', 'A week in Portugal with my partner in May');
  await cont(page);
  note('L setup');
  const lseen = await walkSetup(page, { priority: /lowest price/i });
  note(`L setup screens: ${lseen.join(' | ')}`);
  await page.waitForSelector('.pf-create', { timeout: 10000 });
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.waitForSelector('.pf-home', { timeout: 30000 });
  note('L trip home');
  await page.locator('.pf-home .btn-primary').click();
  await page.waitForSelector('.ui-crows');
  note('L doors');
  await shot(page, 'L0-doors');
  await page.getByRole('radio', { name: /I know where/ }).click();
  await cont(page);
  await page.waitForSelector('.guide-foot', { timeout: 20000 });
  await page.waitForTimeout(1500);
  note('L where');
  await shot(page, 'L0-where');
  // Where: Portugal by hand.
  const pt = page.getByRole('button', { name: /^Portugal/ }).first();
  if (await pt.count()) await pt.click(); else await page.getByText('Portugal', { exact: true }).first().click();
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1500);
  if (await page.locator('.guide-template').count()) await page.locator('.guide-template').first().click();
  else { await page.locator('.guide-design-btn').first().click(); await page.locator('.guide-quiz-go').click(); }
  await page.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) {
    const next = page.locator('.guide-next').first();
    if (!(await next.count())) break;
    const label = (await next.textContent()) || '';
    if (await next.isDisabled()) { note(`engine next disabled: ${label}`); break; }
    await next.click();
    await page.waitForTimeout(1500);
    if (/Plan (it|my trip)/i.test(label)) break;
  }
  note('L days');
  await page.waitForSelector('.pf-days', { timeout: 20000 });
  await page.getByRole('radio', { name: /Not now/ }).click();
  await page.locator('.pf-days .pf-foot .btn-primary').click();
  await page.waitForSelector('.itin-flight', { timeout: 30000 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);
    note(`L t+${(i + 1) * 2}s calls ${flightCalls} url ${page.url().replace(BASE, '')} itin: ${((await page.locator('.itin-flight').first().textContent().catch(() => '')) || '').slice(0, 60)}`);
  }
  await shot(page, 'L1-planned');
  const first = (await page.locator('.itin-flight').first().textContent()) || '';
  check('L live flights were asked for', flightCalls > 0, `${flightCalls} calls`);
  check('L lowest price: the 59 flight with a change', /59/.test(first) && /TAP/.test(first), first.replace(/\s+/g, ' ').slice(0, 120));
  // Comfort first, from the trip settings.
  const gear = page.getByRole('button', { name: 'Trip settings' }).first();
  note(`L gear on the planned trip: ${await gear.count()}`);
  if (await gear.count()) {
    await gear.click();
  } else {
    await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Trip settings' }).first().click();
  }
  await page.waitForSelector('.pf-set');
  await page.locator('.pf-set').getByRole('button', { name: /matters most/i }).first().click();
  await page.getByRole('radio', { name: /Comfort first/ }).click();
  await page.locator('.pf-settings .pf-foot .btn-primary').first().click();
  await page.waitForTimeout(500);
  await shot(page, 'L1b-settings-saved');
  await page.keyboard.press('Escape');
  if (!(await page.locator('.itin-flight').count())) await page.goto(`${BASE}/?tab=trip`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.itin-flight', { timeout: 30000 });
  await page.waitForFunction(() => /89/.test(document.querySelector('.itin-flight')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const after = (await page.locator('.itin-flight').first().textContent()) || '';
  await shot(page, 'L2-comfort');
  check('L comfort first: the direct 89 flight', /89/.test(after) && /Brussels Airlines/.test(after), after.replace(/\s+/g, ' ').slice(0, 120));
  await page.context().close();
} catch (e) { check('L ran', false, e.message.split('\n')[0]); }

// ---- N. On a trip now ----
if (ONLY.includes('N')) try {
  const page = await fresh();
  await page.goto(`${BASE}/?tab=plan`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pf-intro', { timeout: 30000 });
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
  await page.getByRole('button', { name: 'Create trip' }).click();
  await page.waitForSelector('.pf-home', { timeout: 30000 });
  await page.locator('.pf-home .btn-primary').click();
  await page.waitForSelector('.ui-crows');
  await page.getByRole('radio', { name: /I know where/ }).click();
  await cont(page);
  await page.waitForSelector('.guide-foot', { timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot(page, 'N3-engine');
  const wz = (await draft(page)).wizard || {};
  check('N the engine starts in Porto', (wz.order || [])[0] === 'OPO' && (wz.countries || []).includes('Portugal'), `${JSON.stringify(wz.order)} ${JSON.stringify(wz.countries)}`);
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
