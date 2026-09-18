// Scenario A, budget backpacker: CRL, 7 nights in October, no fixed
// destination. Walks the trip wizard (quiz path) and the day flow (chat
// path) at 375x812 and records what each screen actually shows.
//
// Run from inside continent-app/:  node scripts/scenario_A.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = 4221;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'shots/scenarios/A';
mkdirSync(SHOTS, { recursive: true });

let server = null;
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite preview never came up'); process.exit(1); }
}

const errors = [];
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|emrldtp|entrypoint_config|config is not valid/i;
const notes = [];
const note = (k, v) => { notes.push([k, v]); console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 160));
});
// Nominatim fixture: filled in after part 1 picks a recommended town.
let geoFixture = [{
  display_name: 'Hostel, Ljubljana, Slovenia', name: 'Hostel Celica',
  lat: '46.0569', lon: '14.5058', category: 'tourism', type: 'hostel',
  address: { country: 'Slovenia', country_code: 'si' },
}];
await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(geoFixture),
}));
// Watch the AI call so the report can say whether the bot went to a backend.
const netLog = [];
page.on('request', (rq) => { if (/functions\/v1|supabase/.test(rq.url())) netLog.push(rq.method() + ' ' + rq.url().slice(0, 120)); });
page.on('response', (rs) => { if (/functions\/v1/.test(rs.url())) netLog.push('<- ' + rs.status() + ' ' + rs.url().slice(0, 120)); });

let n = 0;
const shot = async (name, full = false) => {
  n += 1;
  const file = `${SHOTS}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: full });
  console.log(`shot ${file}`);
  return file;
};
const open = async (url) => {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
};
const text = () => page.evaluate(() => document.body.innerText);
const headStep = async () => {
  const title = await page.locator('.shape-head-title:visible').first().textContent().catch(() => '');
  const count = await page.locator('.shape-head-step:visible').first().textContent().catch(() => '');
  return `${(title || '').trim()} / ${(count || '').trim()}`;
};
const next = async (label) => {
  const btn = page.locator('.guide-next:visible').first();
  const txt = (await btn.textContent().catch(() => '')).trim();
  const dis = await btn.isDisabled().catch(() => true);
  note(`next button on ${label}`, `${txt} (disabled=${dis})`);
  if (!dis) await btn.click();
  await page.waitForTimeout(1200);
};
const clickText = async (re, what) => {
  const loc = page.getByText(re).first();
  const ok = await loc.isVisible().catch(() => false);
  if (ok) await loc.click(); else note(`MISSING control`, `${what} (${re})`);
  await page.waitForTimeout(400);
  return ok;
};
const offscreenControls = () => page.evaluate(() => {
  const w = window.innerWidth;
  return [...document.querySelectorAll('button, a, input')]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ r: el.getBoundingClientRect(), t: `${el.className || el.tagName}: ${(el.textContent || el.placeholder || '').trim().slice(0, 40)}` }))
    .filter((x) => x.r.width > 0 && (x.r.right > w + 1 || x.r.left < -1))
    .map((x) => `${x.t} [${Math.round(x.r.left)}..${Math.round(x.r.right)}]`)
    .slice(0, 8);
});
const hscroll = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  // ───────────────────────── PART 1: trip wizard ─────────────────────────
  console.log('\n== Part 1: trip wizard ==');
  await open('?tab=trip&o=CRL&paymock');
  note('step', await headStep());
  await shot('trip-booked');
  await clickText(/^Nothing yet$/, 'Booked: Nothing yet');
  note('booked none pressed', await page.locator('.guide-booked-none').getAttribute('aria-pressed'));
  await next('Booked');

  // From
  note('step', await headStep());
  const airports = await page.locator('.guide-airport-chip').allTextContents();
  note('airports near (From)', airports.map((s) => s.replace(/\s+/g, ' ').trim()));
  const originText = await page.locator('.guide-origin-home-card').innerText().catch(() => '');
  note('From card text', originText.replace(/\s+/g, ' ').slice(0, 300));
  note('explore card on From', await page.locator('.guide-explore-card').count());
  await shot('trip-from', true);
  await next('From');

  // When
  note('step', await headStep());
  await clickText(/I'm flexible/, 'When: flexible');
  // nights: read and step to 7
  for (let i = 0; i < 25; i += 1) {
    const cur = (await page.locator('.guide-people-lg span').first().textContent()).trim();
    const k = Number(cur.match(/\d+/)?.[0] || 0);
    if (k === 7) break;
    await page.locator('.guide-people-lg button').nth(k < 7 ? 1 : 0).click();
    await page.waitForTimeout(80);
  }
  note('nights reading', (await page.locator('.guide-people-lg span').first().textContent()).trim());
  const monthChips = await page.locator('.guide-month-grid .guide-chip').allTextContents();
  note('month chips', monthChips);
  const octChip = page.locator('.guide-month-grid .guide-chip').filter({ hasText: /Oct/ }).first();
  if (await octChip.count()) await octChip.click(); else note('MISSING control', 'October chip');
  await page.waitForTimeout(300);
  note('month chip pressed', (await page.locator('.guide-month-grid .guide-chip.on').textContent().catch(() => 'none')).trim());
  await shot('trip-when', true);
  await next('When');

  // Where: quiz
  note('step', await headStep());
  const tabs = await page.locator('.guide-wtabs button').allTextContents();
  note('where tabs', tabs);
  await clickText(/Help me choose/, 'Where: quiz tab');
  for (const label of [/^Hidden gems$/, /^Hiking$/]) {
    const chip = page.locator('.wq-chip').filter({ hasText: label }).first();
    if (await chip.count()) await chip.click(); else note('MISSING control', `quiz chip ${label}`);
    await page.waitForTimeout(250);
  }
  note('quiz types pressed', await page.locator('.wq-chip.on').allInnerTexts().then((a) => a.map((x) => x.trim())));
  await page.locator('.wq-next').click().catch(() => note('MISSING control', 'quiz Done'));
  await page.waitForTimeout(400);
  await clickText(/^Shoestring$/, 'quiz: Shoestring');
  await clickText(/Fly in, then trains/, 'quiz: flytrain');
  await clickText(/Anywhere in Europe/, 'quiz: anywhere');
  await clickText(/^A few stops$/, 'quiz: fewstops');
  await page.waitForTimeout(1500);
  const doneRows = await page.locator('.wq-done').allInnerTexts();
  note('quiz answered rows', doneRows.map((s) => s.replace(/\s+/g, ' ')));
  note('quiz month line', (await page.locator('.wq-month').textContent().catch(() => '(none)')).trim());
  const cards = await page.evaluate(() => [...document.querySelectorAll('.mcard')].map((c) => ({
    country: c.querySelector('.mcard-head b')?.textContent.trim(),
    match: c.querySelector('.mcard-match')?.textContent.trim(),
    why: [...c.querySelectorAll('.mcard-why li')].map((li) => li.textContent.trim()),
    places: [...c.querySelectorAll('.mcard-place-name')].map((p) => p.textContent.trim()),
    w: Math.round(c.getBoundingClientRect().width),
  })));
  note('country match cards', cards);
  note('cards shown / more link', `${cards.length} / ${(await page.locator('.mcards-more').textContent().catch(() => '(none)')).trim()}`);
  note('explore card on Where', await page.locator('.guide-explore-card').count());
  note('horizontal overflow px (Where)', await hscroll());
  note('offscreen controls (Where)', await offscreenControls());
  await shot('trip-where-quiz', true);
  // budget levels of the recommended countries, from the published insights
  const insights = await page.evaluate(async () => {
    try { return await (await fetch('/country_insights.json')).json(); } catch { return null; }
  });
  if (insights) {
    const byName = (name) => {
      const rows = Array.isArray(insights) ? insights : Object.values(insights);
      const r = rows.find((x) => x.country === name || x.name === name);
      return r ? { budget_level: r.budget_level, daily: r.daily_budget_eur, best: r.best_months } : null;
    };
    note('budget levels of recommendations', cards.map((c) => [c.country, byName(c.country)]));
  }
  // Add the first two recommended countries
  const adds = page.locator('.mcard-add');
  await adds.nth(0).click().catch(() => note('MISSING control', 'first Add'));
  await page.waitForTimeout(300);
  if ((await adds.count()) > 1) await adds.nth(1).click().catch(() => {});
  await page.waitForTimeout(500);
  note('picked chips', await page.locator('.guide-picked-chip').allTextContents());
  await shot('trip-where-picked');
  await next('Where');

  // Trips
  note('step', await headStep());
  await page.waitForTimeout(2500);
  const trips = await page.evaluate(() => [...document.querySelectorAll('.wtrip')].map((c) => ({
    route: c.querySelector('.wtrip-route')?.textContent.trim().replace(/\s+/g, ' '),
    days: c.querySelector('.wtrip-days')?.textContent.trim(),
    lens: [...c.querySelectorAll('.wtrip-len')].map((b) => b.textContent.trim()),
    body: c.querySelector('.wtrip-body')?.innerText.replace(/\s+/g, ' ').slice(0, 200),
  })));
  note('trip cards', trips);
  note('trips title', (await page.locator('.wready-title').textContent().catch(() => '(none)')).replace(/\s+/g, ' ').trim());
  note('trips note', (await page.locator('.wready-note').textContent().catch(() => '(none)')).replace(/\s+/g, ' ').trim());
  note('trips empty state', (await page.locator('.wready-empty').textContent().catch(() => '')).replace(/\s+/g, ' ').trim());
  note('trips page text mentions rail/bus/train', /rail|train|bus/i.test(await page.locator('.wready').innerText().catch(() => '')));
  await shot('trip-trips', true);
  await page.locator('.wtrip-choose').first().click().catch(() => note('MISSING control', 'Choose trip'));
  await page.waitForTimeout(800);
  note('footer after choose', (await page.locator('.guide-foot-summary').innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
  await shot('trip-trips-chosen');
  await next('Trips');

  // Getting there
  note('step', await headStep());
  await page.waitForTimeout(3000);
  note('getting: picked trip', (await page.locator('.wpicked-head').innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
  note('getting: stops', await page.locator('.wpicked-stops .guide-final-stop').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' '))));
  // The legs are an accordion (one open at a time): open each in turn and
  // read it while it is open. Leg 1 (the way in) is shot open.
  const heads = page.locator('.tleg-head');
  const hc = await heads.count();
  note('getting: legs', hc);
  const legs = [];
  for (let i = 0; i < hc; i += 1) {
    if ((await heads.nth(i).getAttribute('aria-expanded')) !== 'true') await heads.nth(i).click().catch(() => {});
    await page.waitForTimeout(350);
    legs.push(await page.evaluate((k) => {
      const l = document.querySelectorAll('.tleg')[k];
      return {
        route: l.querySelector('.tleg-route')?.textContent.trim().replace(/\s+/g, ' '),
        head: l.querySelector('.tleg-head')?.innerText.trim().replace(/\s+/g, ' '),
        mode: l.querySelector('.tleg-mode.on')?.textContent.trim(),
        modes: [...l.querySelectorAll('.tleg-mode')].map((m) => m.textContent.trim()),
        airports: [...l.querySelectorAll('.tleg-airport')].map((a) => a.textContent.trim().replace(/\s+/g, ' ')),
        links: [...l.querySelectorAll('.tleg-link')].map((a) => `${a.textContent.trim()} -> ${a.href.slice(0, 110)}`),
        measured: l.querySelector('.tleg-measured')?.textContent.trim(),
        body: l.querySelector('.tleg-body')?.innerText.replace(/\s+/g, ' ').slice(0, 260),
      };
    }, i));
    if (i === 0) { await shot('trip-getting-leg1', true); }
  }
  note('getting: legs detail', legs);
  note('getting: Google Flights Explore link', await page.evaluate(() => [...document.querySelectorAll('a[href*="google.com/travel"], .guide-explore-card')].map((a) => `${a.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)} -> ${a.href.slice(0, 100)}`)));
  note('getting: jaw hint', (await page.locator('.tlegs-jaw').textContent().catch(() => '(none)')).trim());
  note('horizontal overflow px (Getting)', await hscroll());
  note('offscreen controls (Getting)', await offscreenControls());
  await shot('trip-getting', true);
  await next('Getting');

  // Finish
  note('step', await headStep());
  await page.waitForTimeout(1500);
  const est = await page.evaluate(() => ({
    lines: [...document.querySelectorAll('.guide-estimate-line')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
    facts: [...document.querySelectorAll('.guide-summary-fact')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
    stops: [...document.querySelectorAll('.guide-summary-stops .guide-final-stop')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
    car: document.querySelector('.guide-car-advice')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 300),
    title: document.querySelector('.guide-summary-title')?.innerText.replace(/\s+/g, ' ').trim(),
    legs: [...document.querySelectorAll('.guide-summary-leg')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
    draft: (() => { try { return JSON.parse(localStorage.getItem('carta.tripDraft.v1') || 'null'); } catch { return null; } })(),
    store: (() => { try { return JSON.parse(localStorage.getItem('carta.plannerDraft.v1') || 'null'); } catch { return null; } })(),
    lsKeys: Object.keys(localStorage),
  }));
  note('finish: title', est.title);
  note('finish: facts', est.facts);
  note('finish: stops', est.stops);
  note('finish: ground legs', est.legs);
  note('finish: estimate lines', est.lines);
  note('finish: car advice', est.car);
  note('finish: tripDraft keys', est.draft ? Object.keys(est.draft) : null);
  note('finish: plannerDraft travelers/quiz/style', { travelers: est.store?.travelers, quiz: est.store?.quiz, keys: est.store ? Object.keys(est.store) : null });
  note('finish: localStorage keys', est.lsKeys);
  note('finish: page mentions hostel/private room/budget', (await text()).match(/hostel|private room|budget|shoestring/gi));
  note('horizontal overflow px (Finish)', await hscroll());
  await shot('trip-finish', true);
  note('finish CTA', (await page.locator('.guide-foot .guide-next').textContent().catch(() => '')).trim());

  // ───────────────────────── PART 2: day flow ─────────────────────────
  console.log('\n== Part 2: day flow ==');
  // Pick a town from the top recommended country's evidence places.
  const appData = JSON.parse(readFileSync('dist/app_data.json', 'utf8'));
  const dests = Object.values(appData.destinations);
  let town = dests.find((x) => x.city === 'Zakopane' && cards.some((c) => c.country === x.country)) || null;
  for (const c of cards) {
    if (town) break;
    for (const p of c.places || []) {
      const d = dests.find((x) => x.city === p && x.country === c.country);
      if (d) { town = d; break; }
    }
    if (town) break;
  }
  if (!town) town = dests.find((x) => x.city === 'Ljubljana') || dests[0];
  note('day: chosen town', `${town.city}, ${town.country} (${town.lat}, ${town.lon})`);
  geoFixture = [{
    display_name: `Hostel ${town.city}, ${town.city}, ${town.country}`, name: `Hostel ${town.city}`,
    lat: String(town.lat), lon: String(town.lon), category: 'tourism', type: 'hostel',
    address: { country: town.country, country_code: town.iso2.toLowerCase() },
  }];

  await open('?tab=day&o=CRL&paymock');
  note('day: rail counter', (await page.locator('.day-flow-top .shape-head-step').textContent().catch(() => '(none)')).trim());
  note('day: question', (await page.locator('.day-flow-q').textContent().catch(() => '')).trim());
  await shot('day-stay');
  await page.locator('.day-flow-search input').fill(`Hostel ${town.city}`);
  await page.locator('.day-flow-search .trip-add-btn').click();
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  note('day: geocoder hits', await page.locator('.day-stay-hit').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' '))));
  await page.locator('.day-stay-result').first().click();
  await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
  note('day: chosen stay', (await page.locator('.day-flow-chosen').innerText()).replace(/\s+/g, ' '));
  await shot('day-stay-chosen');
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  note('day: banner', (await page.locator('.day-flow-dest').innerText().catch(() => '')).replace(/\s+/g, ' '));
  // Pick a date in October 2026: walk the calendar forward until an enabled October cell shows.
  let picked = '';
  for (let i = 0; i < 6 && !picked; i += 1) {
    const cal = await page.locator('.day-flow-date').innerText();
    if (/October 2026/i.test(cal)) {
      const cell = page.locator('.day-flow-date .cal-day:not([aria-disabled="true"]):not([disabled])').filter({ hasText: /^1[0-9]$/ }).first();
      if (await cell.count()) { await cell.click(); picked = (await cell.textContent()).trim(); break; }
    }
    const fwd = page.locator('.day-flow-date button[aria-label*="ext" i], .day-flow-date .cal-nav-next, .day-flow-date button:has-text("›")').first();
    if (await fwd.count()) await fwd.click(); else break;
    await page.waitForTimeout(250);
  }
  note('day: date picked', picked || 'NONE (calendar nav not found)');
  note('day: calendar head', (await page.locator('.day-flow-date').innerText()).split('\n').slice(0, 3).join(' | '));
  await shot('day-when');
  const whenNext = page.locator('.day-flow-next');
  note('day: when Next disabled', await whenNext.isDisabled());
  if (!(await whenNext.isDisabled())) await whenNext.click();
  await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
  note('day: ideas choices', await page.locator('.day-ideas-choice button').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' '))));
  await shot('day-ideas');
  await page.getByRole('button', { name: /surprise me/i }).click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  note('day: fork cards', await page.locator('.day-flow-card').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' ').slice(0, 220))));
  await shot('day-how', true);
  await page.locator('.day-flow-card.primary').click();
  await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  note('chat: foot warning (guest)', (await page.locator('.chat-foot-warn').textContent().catch(() => '(none)')).trim());
  await shot('day-chat-start');

  // Walk the questionnaire with the scenario's answers.
  const asked = [];
  for (let guard = 0; guard < 24; guard += 1) {
    if (await page.locator('.rbs, .chat-result, .chat-bubble-warn').count()) break;
    const q = (await page.locator('.chat-bubble-live').textContent().catch(() => '')).trim();
    if (!q) { await page.waitForTimeout(300); continue; }
    asked.push(q);
    const opt = (re) => page.locator('.chat-body .chat-opt:visible').filter({ hasText: re }).first();
    if (/coming/i.test(q)) await opt(/Just me/).click();
    else if (/much of the day/i.test(q)) await opt(/^A full day$/).click();
    else if (/walking/i.test(q)) {
      const o = opt(/^Normal/);
      note('chat: steps options', await page.locator('.chat-body .chat-opt:visible').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' '))));
      await o.click();
    } else if (/mood/i.test(q)) {
      const on = await page.locator('.chat-opts-multi .chat-opt.on, .chat-opts-multi .chat-opt[aria-pressed="true"]').allInnerTexts();
      note('chat: moods pre-ticked', on);
      await opt(/Parks & nature/).click().catch(() => {});
      await opt(/Hidden gems/).click().catch(() => {});
      await page.locator('.chat-send-multi').click();
    } else if (/spend the day/i.test(q)) {
      note('chat: town options', await page.locator('.chat-body .chat-opt:visible').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, ' ').slice(0, 60))));
      await page.locator('.chat-town-picker .chat-opt, .chat-body .chat-opt:visible').first().click();
    } else if (/food/i.test(q)) {
      const chips = await page.locator('.chat-opts-nudge .chat-opt').allInnerTexts();
      note('chat: diet chips', chips);
      note('chat: diet chips', await page.locator('.carta-plan-chip').allInnerTexts());
      await page.locator('.carta-plan-chip').filter({ hasText: /Cheap eats/ }).first().click().catch(() => note('MISSING control', 'Cheap eats chip'));
      note('chat: diet on', await page.locator('.carta-plan-chip.on').allInnerTexts());
      await page.waitForTimeout(200);
      await shot('day-chat-food');
      await opt(/Something quick/).click();
    } else if (/been here before/i.test(q)) await opt(/first/i).click();
    else if (await page.locator('.chat-free-final').count()) await page.locator('.chat-free-final .chat-skip').click();
    else await page.locator('.chat-body .chat-opt:visible').first().click();
    await page.waitForTimeout(500);
  }
  note('chat: questions asked', asked);
  // Wait for a result or a failure
  await page.locator('.chat-result, .chat-bubble-warn').first().waitFor({ timeout: 90000 }).catch(async () => note('chat: no result/fail within 90s', await page.locator('.chat-body').innerText().then((s) => s.replace(/\s+/g, ' ').slice(-300))));
  await page.waitForTimeout(800);
  note('chat: network to functions', netLog);
  const outcome = await page.evaluate(() => ({
    warn: document.querySelector('.chat-bubble-warn')?.textContent.trim(),
    failOpts: [...document.querySelectorAll('.chat-bubble-warn ~ .chat-opts .chat-opt, .chat-turn .chat-opts .chat-opt')].map((b) => b.textContent.trim()).slice(0, 4),
    summary: document.querySelector('.chat-result .chat-bubble')?.textContent.trim(),
    stops: [...document.querySelectorAll('.chat-route li, .chat-route-stop, .chat-stop')].map((s) => s.innerText.replace(/\s+/g, ' ').slice(0, 120)),
    stats: document.querySelector('.chat-route-stats')?.textContent.trim(),
    transcript: [...document.querySelectorAll('.chat-bubble-edit-text')].map((b) => b.textContent.trim()),
  }));
  note('chat: outcome', outcome);
  await shot('day-chat-outcome', true);

  // Fallback: plan it myself -> the builder. What do its rails rank first?
  const manual = page.getByRole('button', { name: /Plan it myself/i }).first();
  if (await manual.isVisible().catch(() => false)) {
    await manual.click();
    await page.locator('.dayex-card').first().waitFor({ timeout: 30000 }).catch(() => note('builder: no cards', ''));
    await page.waitForTimeout(1500);
  } else {
    note('chat: no manual fallback offered', outcome.warn || '(result phase)');
    // Import the bot result and look at the day instead.
    const imp = page.locator('.chat-import');
    if (await imp.isVisible().catch(() => false)) { await imp.click(); await page.waitForTimeout(3000); }
  }
  const rails = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('.dayex-rail-title, .dayex-head, h3')].map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)).slice(0, 12),
    cards: [...document.querySelectorAll('.dayex-card')].slice(0, 14).map((c) => c.innerText.replace(/\s+/g, ' ').slice(0, 140)),
    freeMentions: (document.body.innerText.match(/\bfree\b|no fee|€\s?0\b/gi) || []).length,
    tray: document.querySelector('.dayex-tray-summary')?.textContent.trim(),
  }));
  note('builder: rails', rails);
  note('horizontal overflow px (builder)', await hscroll());
  await shot('day-builder', true);
} catch (e) {
  note('SCRIPT ERROR', e.message.split('\n')[0]);
  await shot('error-state', true).catch(() => {});
}

console.log('\n== console/page errors ==');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
if (server) {
  server.kill();
  if (process.platform === 'win32' && server.pid) {
    try { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  }
}
