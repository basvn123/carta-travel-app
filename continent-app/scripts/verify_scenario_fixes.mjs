// Headless check of the fixes made after the three traveller-type walks
// (prompt I2): the Where quiz's spend answer sets the stay tier, the trip
// calendar reaches next May, a trail runner's cards quote peaks as well as
// trails and the brief leads with the trails rail, the chat planner opens on
// the wizard's answers, and a guest who reaches its last question is sent to
// sign in rather than to a request that can only 401.
//
// Run from inside continent-app/:  node scripts/verify_scenario_fixes.mjs
// Needs a fresh `npx vite build`.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4212;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'scripts/shots/scenario-fixes';
mkdirSync(SHOTS, { recursive: true });

let server = null;
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite preview never came up'); process.exit(1); }
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failed += 1;
};
const errors = [];
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|emrldtp|entrypoint_config|config is not valid/i;
const GEO = {
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel', address: { country: 'Italy', country_code: 'it' },
};
const planDayPosts = [];
const seed = (page, draft = null) => page.addInitScript((d) => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    if (d) localStorage.setItem('carta.plannerDraft.v1', JSON.stringify(d));
    else localStorage.removeItem('carta.plannerDraft.v1');
  } catch { /* storage unavailable */ }
}, draft);
const wire = async (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('request', (r) => { if (/plan-day/.test(r.url()) && r.method() === 'POST') planDayPosts.push(r.url()); });
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([GEO]),
  }));
};

const browser = await chromium.launch();
const newPage = async (draft = null) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await seed(page, draft);
  await wire(page);
  return page;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const draftOf = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || 'null'); } catch { return null; } });

/** Booked -> From -> When (flexible, a month) -> Where quiz, on one page. */
const runQuiz = async (page, { month, types, spend, around, distance, pace }) => {
  await page.goto(`${BASE}?tab=trip&paymock&o=BRU`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pause(3500);
  const next = async () => { await page.locator('.guide-next:visible').first().click({ timeout: 8000 }); await pause(700); };
  const chip = async (re) => { await page.locator('.wq-chip:visible', { hasText: re }).first().click({ timeout: 8000 }); await pause(500); };
  await page.locator('.guide-booked-none').click();
  await pause(300);
  await next(); // From
  await next(); // When
  await page.locator('button:visible', { hasText: /flexible/i }).first().click();
  await pause(500);
  const months = await page.locator('.guide-month-grid .guide-chip').allTextContents();
  await page.locator('.guide-month-grid .guide-chip', { hasText: month }).first().click();
  await pause(300);
  await next(); // Where
  const helpTab = page.locator('#wtab-help');
  if ((await helpTab.getAttribute('aria-selected')) !== 'true') await helpTab.click();
  await pause(400);
  for (const tp of types) await chip(tp);
  await page.locator('.wq-next:visible').click();
  await pause(500);
  await chip(spend);
  await chip(around);
  await chip(distance);
  await chip(pace);
  await pause(2500);
  return { months };
};

// ── 1. Comfort couple: May 2027 and the hotel tier ────────────────────────
{
  const page = await newPage();
  const { months } = await runQuiz(page, {
    month: 'May 2027', types: [/^Beach & relax$/i, /^Food & wine$/i], spend: /Hotels & comfort/i,
    around: /Fly in/i, distance: /Anywhere in Europe/i, pace: /One base/i,
  });
  check('when: flexible months reach May 2027', months.some((m) => /May 2027/.test(m)), months.slice(-3).join(', '));
  const d = await draftOf(page);
  check('quiz: Hotels & comfort sets travel style luxury (hotel4 tier)', d?.travelers?.lifestyle === 'luxury', String(d?.travelers?.lifestyle));
  check('quiz: the flexible month is stored', /2027-05/.test(String(d?.travelDates?.flexibleMonths?.[0] || d?.wizard?.flexMonth)), JSON.stringify(d?.travelDates?.flexibleMonths));
  await page.screenshot({ path: `${SHOTS}/01-couple-where.png` });
  await page.context().close();
}

// ── 2. Backpacker: the budget tier ────────────────────────────────────────
{
  const page = await newPage();
  await runQuiz(page, {
    month: 'Oct 2026', types: [/^Hidden gems$/i, /^Hiking$/i], spend: /Shoestring/i,
    around: /Fly in/i, distance: /Anywhere in Europe/i, pace: /A few stops/i,
  });
  const d = await draftOf(page);
  check('quiz: Shoestring sets travel style budget (hostel / private tier)', d?.travelers?.lifestyle === 'budget', String(d?.travelers?.lifestyle));
  await page.context().close();
}

// ── 3. Trail runner: peaks in the reasons, trails rail first ──────────────
{
  const page = await newPage();
  await runQuiz(page, {
    month: 'Sep 2026', types: [/Trail running/i, /Road trip/i], spend: /Smart mid-range/i,
    around: /No preference/i, distance: /Anywhere in Europe/i, pace: /Keep moving/i,
  });
  const cards = await page.locator('.mcard').allTextContents();
  check('cards: the reasons quote rated peaks as well as trails',
    cards.some((c) => /rated peaks/i.test(c)) && cards.some((c) => /rated trails/i.test(c)),
    (cards[0] || '').replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: `${SHOTS}/02-runner-cards.png` });
  await page.locator('.mcard .mcard-info').first().click();
  await pause(2500);
  // The rails sit in the "Things to do" fold, closed by default.
  const fold = page.locator('.dsec-head button', { hasText: /things to do/i }).first();
  if (await fold.count()) { await fold.click(); await pause(800); }
  const groups = await page.locator('.cbrief-group-h').allTextContents();
  check('brief: the first rail is hiking & trail running', /hiking & trail running/i.test(groups[0] || ''), groups.slice(0, 3).join(' > '));
  const imgH = await page.locator('.cbrief-trip-img').first().evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
  check('brief: trip thumbnails are not hairlines', imgH < 0 || imgH > 30, String(imgH));
  await page.screenshot({ path: `${SHOTS}/03-runner-brief.png` });
  await page.context().close();
}

// ── 4. Day chat: opens on the wizard's answers; guest is sent to sign in ──
{
  const draft = {
    version: 2, savedAt: Date.now(),
    origin: null, nearbyAirports: [],
    travelDates: { isFlexible: true, startDate: '', endDate: '', durationNights: 5, flexibleMonths: ['2027-05'] },
    travelers: { adults: 2, children: 0, lifestyle: 'luxury' },
    selectedDestination: 'Italy', selectedTransit: null, itineraryType: 'custom', stops: [],
    wizard: { step: 4, countries: ['Italy'], buildMode: 'ready', tripPickId: null, dateMode: 'flex', flexMonth: '2027-05', flexNights: 5,
      quiz: { types: ['beach', 'food'], typesDone: true, spend: 'luxury', around: 'flytrain', distance: 'any', pace: 'base', avoid: [], editing: '' } },
  };
  const page = await newPage(draft);
  // No ?paymock here: the seam also stands in for a signed-in traveller at
  // the bot's gate, and this section is about the guest.
  await page.goto(`${BASE}?tab=day`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pause(3500);
  await page.locator('.day-flow-search input').fill('Hotel Artemide Rome');
  await page.locator('.day-flow-search .trip-add-btn').click();
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  await page.locator('.day-stay-result').first().click();
  await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
  await page.locator('.day-flow-next').click();
  await pause(800);
  const chip = page.locator('.day-flow-chips-center .day-flow-chip').first();
  if (await chip.count()) await chip.click();
  await pause(300);
  await page.locator('.day-flow-next').click();
  await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /surprise me/i }).click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
  await page.locator('.day-flow-card.primary').click();
  await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
  await pause(500);
  const on = async () => page.locator('.chat-body .chat-opt.on, .chat-body [aria-pressed="true"]').allTextContents();
  check('chat q1: Partner is already lit', (await on()).some((s) => /partner/i.test(s)), (await on()).join(' | '));
  await page.screenshot({ path: `${SHOTS}/04-chat-q1.png` });
  await page.locator('.chat-body .chat-opt', { hasText: /^Partner/ }).first().click();
  await pause(500);
  check('chat q2: Late start is already lit', (await on()).some((s) => /late/i.test(s)), (await on()).join(' | '));
  await page.locator('.chat-body .chat-opt', { hasText: /full day/i }).first().click();
  await pause(500);
  check('chat q3: Easy steps is already lit', (await on()).some((s) => /easy/i.test(s)), (await on()).join(' | '));
  await page.locator('.chat-body .chat-opt', { hasText: /^Easy/ }).first().click();
  await pause(500);
  check('chat q4: Beach mood is already lit from the quiz', (await on()).some((s) => /beach/i.test(s)), (await on()).join(' | '));
  // Answer whatever comes until the food question, then check Sit-down.
  for (let i = 0; i < 6; i += 1) {
    const lit = await on();
    if (lit.some((s) => /sit-down|sit down/i.test(s))) break;
    if (await page.locator('.chat-town-picker').count()) await page.locator('.chat-town-picker .chat-opt').first().click();
    else if (await page.locator('.chat-send:visible').count()) await page.locator('.chat-send:visible').first().click();
    else if (await page.locator('.chat-body .chat-opt:visible').count()) await page.locator('.chat-body .chat-opt:visible').first().click();
    await pause(500);
  }
  check('chat food: Sit-down lunch is already lit', (await on()).some((s) => /sit/i.test(s)), (await on()).join(' | '));
  await page.screenshot({ path: `${SHOTS}/05-chat-food.png` });
  // Run to the end: a guest must land on the sign-in bubble, and no request
  // to plan-day may leave the browser.
  for (let i = 0; i < 8; i += 1) {
    if (await page.locator('.chat-bubble-warn').count()) break;
    if (await page.locator('.chat-town-picker').count()) await page.locator('.chat-town-picker .chat-opt').first().click();
    else if (await page.locator('.chat-send:visible').count()) await page.locator('.chat-send:visible').first().click();
    else if (await page.locator('.chat-body .chat-opt:visible').count()) await page.locator('.chat-body .chat-opt:visible').first().click();
    await pause(600);
  }
  check('chat end (guest): the account bubble shows with a Sign in button',
    (await page.locator('.chat-bubble-warn').count()) > 0 && (await page.locator('.chat-opt', { hasText: /^Sign in$/ }).count()) > 0);
  check('chat end (guest): no plan-day request was sent', planDayPosts.length === 0, String(planDayPosts.length));
  await page.screenshot({ path: `${SHOTS}/06-chat-guest-gate.png` });
  await page.context().close();
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
if (server) server.kill();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
