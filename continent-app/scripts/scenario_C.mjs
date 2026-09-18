// Scenario C, trail runner: 4 nights in September 2026, one adult.
// Part 1 walks the guided trip wizard through the Where quiz to Finish.
// Part 2 walks the day flow to both forks (builder + Carta chat).
//
// Run from inside continent-app/:
//   node scripts/scenario_C.mjs trip
//   node scripts/scenario_C.mjs day [stayKey]
// Read-only on the app; serves dist/ through vite preview on 4223.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PART = process.argv[2] || 'trip';
const STAY_KEY = process.argv[3] || 'innsbruck';
const PORT = 4223;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = 'shots/scenarios/C';
mkdirSync(SHOTS, { recursive: true });

// Geocoder fixtures: one mountain town per candidate country.
const STAYS = {
  innsbruck: {
    query: 'Hotel Innsbruck', display_name: 'Hotel Innsbruck, Innrain, Innsbruck, Tyrol, Austria',
    name: 'Hotel Innsbruck', lat: '47.2664', lon: '11.3936', country: 'Austria', cc: 'at',
  },
  chamonix: {
    query: 'Hotel Chamonix', display_name: 'Hotel Le Morgane, Route du Bouchet, Chamonix-Mont-Blanc, Haute-Savoie, France',
    name: 'Hotel Le Morgane', lat: '45.9237', lon: '6.8694', country: 'France', cc: 'fr',
  },
  zermatt: {
    query: 'Hotel Zermatt', display_name: 'Hotel Bristol, Zermatt, Valais, Switzerland',
    name: 'Hotel Bristol', lat: '46.0207', lon: '7.7491', country: 'Switzerland', cc: 'ch',
  },
  cortina: {
    query: 'Hotel Cortina', display_name: 'Hotel Cortina, Corso Italia, Cortina d\'Ampezzo, Belluno, Veneto, Italy',
    name: 'Hotel Cortina', lat: '46.5405', lon: '12.1357', country: 'Italy', cc: 'it',
  },
  garmisch: {
    query: 'Hotel Garmisch', display_name: 'Hotel Zugspitze, Garmisch-Partenkirchen, Bavaria, Germany',
    name: 'Hotel Zugspitze', lat: '47.4917', lon: '11.0955', country: 'Germany', cc: 'de',
  },
  bled: {
    query: 'Hotel Bled', display_name: 'Hotel Park, Bled, Slovenia',
    name: 'Hotel Park', lat: '46.3628', lon: '14.1123', country: 'Slovenia', cc: 'si',
  },
};

let server = null;
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite preview never came up'); process.exit(1); }
}

const findings = [];
const note = (level, msg) => { findings.push(`${level}: ${msg}`); console.log(`${level.padEnd(4)} ${msg}`); };
const check = (name, ok, extra = '') => note(ok ? 'ok' : 'FAIL', `${name}${extra ? `  (${extra})` : ''}`);
const info = (msg) => note('info', msg);

const errors = [];
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|401|403|429|emrldtp|entrypoint_config|config is not valid/i;
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
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await seed(page);
wire(page);

// Network log of the plan-day call, so the report can say what the bot did.
const netlog = [];
page.on('response', async (r) => {
  const u = r.url();
  if (/plan-day|functions\/v1/.test(u)) {
    let body = '';
    try { body = (await r.text()).slice(0, 300); } catch { /* opaque */ }
    netlog.push(`${r.status()} ${u.slice(0, 120)} :: ${body}`);
  }
});
page.on('requestfailed', (r) => {
  if (/plan-day|functions\/v1/.test(r.url())) netlog.push(`FAILED ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`);
});

let n = 0;
const shot = async (name, full = false) => {
  n += 1;
  const file = `${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: full });
  console.log(`  shot ${file}`);
  return file;
};
const open = async (url) => {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3200);
};
const pause = (ms = 1000) => page.waitForTimeout(ms);
const visibleText = () => page.evaluate(() => document.body.innerText);
const stepTitle = async () => {
  const a = await page.locator('[aria-current="step"]:visible').first().textContent().then((s) => s.trim()).catch(() => '');
  if (a) return a;
  return page.locator('.shape-head-title:visible').first().textContent().then((s) => s.trim()).catch(() => '');
};
const railCount = () => page.locator('.shape-head-step:visible').first().textContent().then((s) => s.trim()).catch(() => '');
// Anything the 375px viewport cannot reach is a blocker in its own right.
const reachable = async (loc) => {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return false;
  return box.x >= 0 && box.x + box.width <= 375 && box.width > 0 && box.height > 0;
};
const nextBtn = () => page.locator('button.guide-next:visible').filter({ hasText: /^Next/ }).first();
const clickNext = async () => {
  const b = nextBtn();
  const label = await b.textContent().catch(() => '');
  const enabled = await b.isEnabled().catch(() => false);
  check(`Next button "${label.trim()}" enabled`, enabled);
  if (enabled) await b.click();
  await pause(1200);
};

if (PART === 'trip') {
  // 1. Booked
  await open('?tab=trip&paymock');
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  const none = page.locator('.guide-booked-none');
  check('Booked step: "Nothing yet" tile present and reachable', await reachable(none));
  await none.click();
  await pause(500);
  await shot('booked-nothing');
  await clickNext();

  // 2. From
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  await shot('from', true);
  await clickNext();

  // 3. When: 21 -> 25 Sep 2026, exact dates
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  const d21 = page.locator('.cal-day:not(.outside)[data-iso="2026-09-21"]');
  const d25 = page.locator('.cal-day:not(.outside)[data-iso="2026-09-25"]');
  check('When: 21 Sep cell present', (await d21.count()) > 0);
  await d21.first().click();
  await pause(300);
  await d25.first().click();
  await pause(600);
  const nightsTxt = await page.locator('.guide-when-nights').textContent().catch(() => '');
  check('When: reads 4 nights', /4 nights/.test(nightsTxt), nightsTxt.trim());
  await shot('when-4-nights', true);
  await clickNext();

  // 4. Where -> quiz
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  const helpTab = page.locator('#wtab-help');
  check('Where: "Help me choose" tab selected by default', (await helpTab.getAttribute('aria-selected')) === 'true');
  const chip = (label) => page.locator('.wq-chip').filter({ hasText: new RegExp(`^${label}$`) }).first();
  const trail = page.locator('.wq-chip', { hasText: 'Trail running' }).first();
  const road = page.locator('.wq-chip', { hasText: 'Road trip' }).first();
  check('quiz: Trail running chip reachable at 375px', await reachable(trail));
  await trail.click();
  await road.click();
  await pause(300);
  await shot('quiz-types', true);
  await page.locator('.wq-next').click();
  await pause(500);
  await page.locator('.wq-chip', { hasText: 'Smart mid-range' }).first().click();
  await pause(500);
  await page.locator('.wq-chip', { hasText: 'No preference' }).first().click();
  await pause(500);
  await page.locator('.wq-chip', { hasText: 'Anywhere in Europe' }).first().click();
  await pause(500);
  await page.locator('.wq-chip', { hasText: 'Keep moving' }).first().click();
  await pause(2500); // layer indexes arrive and sharpen the ranking
  const summaries = await page.locator('.wq-done').allTextContents();
  info(`quiz summaries: ${summaries.map((s) => s.replace(/\s+/g, ' ').trim()).join(' | ')}`);
  const monthLine = await page.locator('.wq-month').textContent().catch(() => '');
  info(`quiz month line: "${monthLine.trim()}"`);
  await shot('quiz-answered', true);

  // Recommendations (expand the second page too)
  if (await page.locator('.mcards-more').count()) { await page.locator('.mcards-more').click(); await pause(800); }
  const cards = await page.evaluate(() => [...document.querySelectorAll('.mcard')].map((c) => ({
    country: c.querySelector('.mcard-head b')?.textContent.trim(),
    match: c.querySelector('.mcard-match')?.textContent.replace(/\s+/g, ' ').trim() || '',
    why: [...c.querySelectorAll('.mcard-why li')].map((li) => li.textContent.trim()),
    places: [...c.querySelectorAll('.mcard-place-name')].map((p) => p.textContent.trim()),
    imgs: [...c.querySelectorAll('img')].map((i) => i.currentSrc || i.src).filter(Boolean).length,
  })));
  check('recommendations rendered', cards.length > 0, String(cards.length));
  cards.forEach((c, i) => info(`#${i + 1} ${c.country} | ${c.match} | ${c.why.join(' / ')} | places: ${c.places.join(', ')} | imgs ${c.imgs}`));
  const numbered = cards.every((c) => c.why.length > 0 && c.why.every((w) => /\d/.test(w)));
  check('every reason carries a number', numbered);
  const layerWords = cards.map((c) => c.why.some((w) => /rated trails|rated peaks/.test(w)));
  check('every card cites trails or peaks', layerWords.every(Boolean), layerWords.map((b, i) => `${cards[i].country}:${b}`).join(' '));
  const more = page.locator('.mcards-more');
  info(`show-more link: ${(await more.count()) ? (await more.textContent()).trim() : 'none'}`);
  await shot('recommendations', true);

  // Cross-check the printed numbers against the published indexes.
  try {
    const ti = JSON.parse(readFileSync('dist/trails/index.json', 'utf8'));
    const mi = JSON.parse(readFileSync('dist/mountains/index.json', 'utf8'));
    const tmap = new Map(ti.countries.map((c) => [String(c.country || c.cc).toUpperCase(), c.n_trips]));
    const mmap = new Map(mi.countries.map((c) => [String(c.cc).toUpperCase(), c.n]));
    const iso = await page.evaluate(() => [...document.querySelectorAll('.mcard')].map((c) => {
      const img = c.querySelector('.guide-flag-img-sm');
      return (img?.getAttribute('src') || img?.getAttribute('alt') || '').match(/([a-z]{2})\.(svg|png)|^([A-Z]{2})$/i)?.[1] || '';
    }));
    cards.forEach((c, i) => {
      const cc = (iso[i] || '').toUpperCase();
      const tr = c.why.find((w) => /rated trails/.test(w))?.match(/[\d,.]+/)?.[0]?.replace(/[,.]/g, '');
      const pk = c.why.find((w) => /rated peaks/.test(w))?.match(/[\d,.]+/)?.[0]?.replace(/[,.]/g, '');
      info(`index check ${c.country} (${cc || '?'}): card trails=${tr || '-'} index=${tmap.get(cc) ?? '-'}; card peaks=${pk || '-'} index=${mmap.get(cc) ?? '-'}`);
    });
    // The raw ranking by trails+peaks the prompt expects, for comparison.
    const byCount = [...new Set([...tmap.keys(), ...mmap.keys()])]
      .map((cc) => ({ cc, t: tmap.get(cc) || 0, m: mmap.get(cc) || 0 }))
      .sort((a, b) => (b.t + b.m) - (a.t + a.m)).slice(0, 8);
    info(`top by raw trails+peaks: ${byCount.map((x) => `${x.cc} ${x.t}+${x.m}`).join(', ')}`);
  } catch (e) { info(`index cross-check skipped: ${e.message}`); }

  // Country brief of the first recommendation
  const first = cards[0]?.country || '';
  const infoBtn = page.locator('.mcard .mcard-info').first();
  check(`"What's there" button reachable on ${first}`, await reachable(infoBtn));
  await infoBtn.click();
  await pause(2500);
  const briefOpen = await page.locator('.cbrief, .guide-where.has-brief').first().isVisible().catch(() => false);
  check('country brief opened', briefOpen);
  await shot('brief-top');
  // The Things to do fold is closed by default; open it and read the rails.
  const doFold = page.locator('#cb-do, [aria-controls="cb-do"], button:has-text("Things to do")').first();
  if (await doFold.count()) {
    const expanded = await doFold.getAttribute('aria-expanded').catch(() => null);
    info(`Things to do fold: aria-expanded=${expanded}`);
    if (expanded !== 'true') { await doFold.click(); await pause(3000); }
  }
  const groups = await page.locator('.cbrief-group-h').allTextContents();
  info(`brief rails in order: ${groups.map((g) => g.replace(/\s+/g, ' ').trim()).join(' > ')}`);
  check('first rail is the walking/trail rail', /walking|trail|hik/i.test(groups[0] || ''), groups[0] || 'none');
  const trailMeta = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.cbrief-group')].find((x) => /walking|trail|hik/i.test(x.querySelector('.cbrief-group-h')?.textContent || ''));
    return g ? [...g.querySelectorAll('.cbrief-rail-card')].map((c) => `${c.querySelector('b')?.textContent.trim()} [${c.querySelector('.cbrief-rail-why')?.textContent.trim() || ''}]`) : [];
  });
  info(`trail rail cards: ${trailMeta.join(' | ') || 'none'}`);
  await page.locator('.cbrief-group').first().scrollIntoViewIfNeeded().catch(() => {});
  await pause(500);
  await shot('brief-things-to-do', true);
  const briefWide = await page.evaluate(() => document.documentElement.scrollWidth > 375);
  check('no horizontal overflow with the brief open', !briefWide, `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`);

  // Trip thumbnails inside the brief: how tall do they actually render?
  const thumbs = await page.evaluate(() => [...document.querySelectorAll('.cbrief-trip img, .cbrief-trip [class*=img], .cbrief-trip [class*=photo]')].slice(0, 4).map((e) => { const b = e.getBoundingClientRect(); return `${e.className.split(' ')[0]} ${Math.round(b.width)}x${Math.round(b.height)}`; }));
  info(`brief trip thumbs: ${thumbs.join(', ') || 'none found'}`);
  const briefAdd = await page.locator('.cbrief-add:visible').first().textContent().catch(() => '');
  info(`brief sticky action: "${briefAdd.trim()}"`);
  await page.locator('.fsheet-close:visible').first().click().catch(() => info('no .fsheet-close to click'));
  await pause(800);
  check('brief sheet closed', (await page.locator('.fsheet-scrim').count()) === 0);
  // Add the country and go on
  const addBtn = page.locator('.mcard .mcard-add').first();
  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  await addBtn.click();
  await pause(600);
  const picked = await page.locator('.guide-picked-chip').allTextContents();
  check(`picked chip shows ${first}`, picked.join(' ').includes(first), picked.join(','));
  await clickNext();

  // 5. Trips
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  await pause(2500);
  const tripCards = page.locator('.wtrip-choose');
  const tc = await tripCards.count();
  check('Trips step lists ready-made trips', tc > 0, `${tc} cards`);
  const readyTitle = await page.locator('.wready-title').textContent().catch(() => '');
  const readyNote = await page.locator('.wready-note').textContent().catch(() => '');
  info(`Trips: "${readyTitle.replace(/\s+/g, ' ').trim()}"  note: "${readyNote.replace(/\s+/g, ' ').trim()}"`);
  const routes = await page.locator('.wtrip-route').allTextContents();
  info(`trip routes: ${routes.slice(0, 5).map((r) => r.replace(/\s+/g, ' ').trim()).join(' || ')}`);
  const days = await page.locator('.wtrip-days').allTextContents();
  info(`trip lengths: ${days.slice(0, 8).map((r) => r.replace(/\s+/g, ' ').trim()).join(', ')}`);
  await shot('trips-list', true);
  if (tc) {
    await tripCards.first().scrollIntoViewIfNeeded();
    await tripCards.first().click();
    await pause(1500);
    const chosen = await page.locator('.wtrip-choose', { hasText: /chosen|✓/i }).count();
    info(`chosen marker count after pick: ${chosen}; rail now ${await stepTitle()} / ${await railCount()}`);
    await shot('trip-picked', true);
  }
  // Picking may auto-advance to Getting there. If not, press Next.
  if (!/getting/i.test(await stepTitle())) await clickNext();

  // 6. Getting there
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  await pause(1500);
  const legs = await page.locator('.wpicked, .guide-leg, .getting-leg').allTextContents();
  info(`Getting there text: ${(await visibleText()).replace(/\s+/g, ' ').slice(0, 600)}`);
  await shot('getting-there', true);
  await clickNext();

  // 7. Finish
  info(`step rail: ${await stepTitle()} / ${await railCount()}`);
  await pause(1500);
  const arrange = page.locator('button.guide-next:visible', { hasText: /arrange/i }).first();
  check('Finish: "Let Carta arrange it" present', (await arrange.count()) > 0);
  check('Finish: arrange button enabled', await arrange.isEnabled().catch(() => false));
  info(`Finish text: ${(await visibleText()).replace(/\s+/g, ' ').slice(0, 900)}`);
  const fewer = page.locator('button[aria-label="Fewer"], .guide-people button:has-text("-")').first();
  info(`Finish: adults control present = ${await fewer.count() > 0}`);
  if (await fewer.count()) {
    await fewer.scrollIntoViewIfNeeded().catch(() => {});
    await fewer.click().catch(() => {});
    await pause(500);
    const party = await page.locator('.guide-people').first().textContent().catch(() => '');
    info(`Finish: party after one "-" tap: "${party.replace(/\s+/g, ' ').trim()}"`);
    await shot('finish-one-adult');
  }
  await shot('finish', true);
  const finishWide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('Finish: no horizontal overflow', finishWide <= 375, `scrollWidth ${finishWide}`);
}

if (PART === 'day') {
  const stay = STAYS[STAY_KEY];
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{
      display_name: stay.display_name, name: stay.name, lat: stay.lat, lon: stay.lon,
      category: 'tourism', type: 'hotel', address: { country: stay.country, country_code: stay.cc },
    }]),
  }));

  const toFork = async () => {
    await open('?tab=day&paymock');
    await page.locator('.day-flow-search input').waitFor({ timeout: 60000 });
    await page.locator('.day-flow-search input').fill(stay.query);
    await page.locator('.day-flow-search .trip-add-btn').click();
    await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
    const hit = await page.locator('.day-stay-hit').first().textContent();
    info(`geocoder hit: "${hit.replace(/\s+/g, ' ').trim()}"`);
    await page.locator('.day-stay-result').first().click();
    await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
    await pause(1500);
    const chosen = await page.locator('.day-flow-chosen').textContent();
    info(`chosen stay: "${chosen.replace(/\s+/g, ' ').trim()}"`);
    return chosen;
  };

  // Fork (a): the builder
  const chosen = await toFork();
  await shot('day-stay', true);
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  await pause(800);
  const banner = await page.locator('.day-flow-dest').textContent().catch(() => '');
  info(`when-step banner: "${banner.replace(/\s+/g, ' ').trim()}"`);
  const cell = page.locator('.day-flow-date .cal-day:not(.outside)[data-iso="2026-09-22"]');
  check('day When: 22 Sep cell present', (await cell.count()) > 0);
  await cell.first().click();
  await pause(500);
  await shot('day-when', true);
  await page.locator('.day-flow-next').click();
  await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
  await pause(500);
  await shot('day-ideas');
  await page.getByRole('button', { name: /surprise me/i }).click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
  await pause(800);
  const forkText = await page.locator('.day-flow-cards').textContent();
  info(`fork cards: "${forkText.replace(/\s+/g, ' ').trim().slice(0, 400)}"`);
  await shot('day-how', true);
  await page.locator('.day-flow-card').nth(1).click();
  await page.locator('.dayex-card').first().waitFor({ timeout: 60000 });
  await pause(4000); // trails / lakes layers load lazily
  const head = await page.locator('.dayex-head').textContent().catch(() => '');
  info(`builder head: "${head.replace(/\s+/g, ' ').trim()}"`);
  const rails = await page.evaluate(() => [...document.querySelectorAll('.dayex-rail')].map((r) => ({
    title: (r.querySelector('h2,h3,h4,.ps-title,.planner-section-title')?.textContent || r.textContent.slice(0, 40)).replace(/\s+/g, ' ').trim(),
    cards: [...r.querySelectorAll('.dayex-card')].map((c) => ({
      name: c.querySelector('.dayex-card-name')?.textContent.replace(/\s+/g, ' ').trim(),
      dist: c.querySelector('.dayex-card-dist')?.textContent.trim() || '',
      fact: c.querySelector('.dayex-card-fact')?.textContent.trim() || '',
      sub: c.querySelector('.dayex-card-sub')?.textContent.trim() || '',
      photo: !!c.querySelector('img[src]'),
    })),
  })));
  rails.forEach((r) => info(`rail "${r.title}": ${r.cards.length} cards :: ${r.cards.slice(0, 6).map((c) => `${c.name} {${c.dist}} {${c.fact}} {${c.sub}}${c.photo ? '' : ' [no photo]'}`).join(' | ')}`));
  const nature = rails.find((r) => /nature/i.test(r.title));
  check('builder: "Nature and trails" rail present', !!nature, rails.map((r) => r.title).join(' / '));
  if (nature) {
    const withFact = nature.cards.filter((c) => /km.*m up/.test(c.fact));
    check('nature rail: trail cards carry "N km, N m up"', withFact.length > 0, `${withFact.length}/${nature.cards.length}`);
    check('nature rail: every card carries a distance from the stay', nature.cards.every((c) => c.dist), nature.cards.filter((c) => !c.dist).map((c) => c.name).join(','));
  }
  // The nature chip filter view
  const natureChip = page.locator('.dayex-chips button', { hasText: /nature/i }).first();
  if (await natureChip.count()) {
    await natureChip.scrollIntoViewIfNeeded();
    await natureChip.click();
    await pause(800);
  }
  await shot('day-builder-nature', true);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('builder: no horizontal overflow', wide <= 375, `scrollWidth ${wide}`);
  // Add the first trail to the tray and read the summary
  const trailCard = page.locator('.dayex-card').filter({ hasText: /m up/ }).first();
  if (await trailCard.count()) {
    await trailCard.locator('.dayex-add').click().catch(async () => trailCard.locator('button').last().click());
    await pause(600);
    info(`tray after adding a trail: "${(await page.locator('.dayex-tray-summary').textContent()).trim()}"`);
    await shot('day-builder-tray');
  }

  // Fork (b): the chat planner
  await toFork();
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  await page.locator('.day-flow-date .cal-day:not(.outside)[data-iso="2026-09-22"]').first().click();
  await page.locator('.day-flow-next').click();
  await page.locator('.day-ideas-choice').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /surprise me/i }).click();
  await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
  await page.locator('.day-flow-card.primary').click();
  await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
  await pause(800);
  const foot = await page.locator('.chat-foot-warn').textContent().catch(() => '');
  info(`chat guest footer: "${foot.trim()}"`);
  await shot('chat-start');

  const transcript = [];
  for (let guard = 0; guard < 30; guard += 1) {
    if (await page.locator('.rbs').count()) break;
    if (await page.locator('.chat-result, .chat-bubble-warn').count()) break;
    const q = (await page.locator('.chat-body .chat-turn').last().locator('.chat-bubble.bot').last().textContent().catch(() => '')).trim();
    const progress = (await page.locator('.chat-progress').textContent().catch(() => '')).trim();
    const opts = await page.locator('.chat-body .chat-opt:visible').allTextContents();
    const send = page.locator('.chat-send:visible').first();
    const town = page.locator('.chat-town-picker .chat-opt').first();
    const pick = async (re) => {
      const o = page.locator('.chat-body .chat-opt:visible').filter({ hasText: re }).first();
      if (await o.count()) { await o.click(); return (await o.textContent()).replace(/\s+/g, ' ').trim(); }
      return null;
    };
    let did = '';
    if (await page.locator('.chat-free-final').count()) {
      await page.locator('.chat-free-final .chat-send').click(); did = '(send, no free text)';
    } else if (await town.count()) {
      const opts2 = await page.locator('.chat-town-picker .chat-opt').allTextContents();
      transcript.push(`town options: ${opts2.map((o) => o.replace(/\s+/g, ' ').trim()).join(' | ')}`);
      await town.click(); did = `town: ${opts2[0]?.replace(/\s+/g, ' ').trim()}`;
    } else if (await page.locator('.chat-opts-multi').count()) {
      did = `multi: ${await pick(/Something active/i)}`;
      if (!/active/i.test(did)) did += ` (no Active option; opts: ${opts.join(' | ')})`;
      await send.click();
    } else if (/steps|walk|far/i.test(q) && await page.locator('.chat-body .chat-opt:visible').filter({ hasText: /big day/i }).count()) {
      did = `steps: ${await pick(/big day/i)}`;
    } else if (await page.locator('.chat-body .chat-opt:visible').filter({ hasText: /big day/i }).count()) {
      did = `steps: ${await pick(/big day/i)}`;
    } else if (await page.locator('.chat-body .chat-opt:visible').filter({ hasText: /solo|just me/i }).count()) {
      did = `companions: ${await pick(/solo|just me/i)}`;
    } else if (await page.locator('.chat-body .chat-opt:visible').filter({ hasText: /full day|whole day/i }).count()) {
      did = `window: ${await pick(/full day|whole day/i)}`;
    } else if (await page.locator('.chat-opts-toggles').count() && await send.count()) {
      await send.click(); did = '(toggles: send as-is)';
    } else if (opts.length) {
      const o = page.locator('.chat-body .chat-opt:visible').first();
      did = `first: ${(await o.textContent()).replace(/\s+/g, ' ').trim()}`;
      await o.click();
    } else if (await send.count()) {
      await send.click(); did = '(send)';
    } else {
      transcript.push(`stuck at "${q}" ${progress}`);
      break;
    }
    transcript.push(`${progress} Q "${q}" -> ${did}`);
    await pause(400);
  }
  transcript.forEach((t) => info(`chat ${t}`));
  await shot('chat-answered', true);
  const building = await page.locator('.rbs').count();
  info(`route-building stage shown: ${building > 0}`);
  if (building) {
    await pause(1500);
    const rows = await page.locator('.rbs-line-row').allTextContents();
    info(`build log: ${rows.map((r) => r.trim()).join(' | ')}`);
    await shot('chat-building');
  }
  // Wait for either a result or a failure.
  await page.locator('.chat-result, .chat-bubble-warn').first().waitFor({ timeout: 90000 }).catch(() => {});
  await pause(1000);
  const failed = await page.locator('.chat-bubble-warn').count();
  if (failed) {
    const msg = await page.locator('.chat-bubble-warn').textContent();
    info(`chat FAILED with: "${msg.trim()}"`);
    const fallbackOpts = await page.locator('.chat-opts .chat-opt').allTextContents();
    info(`fallback options: ${fallbackOpts.join(' | ')}`);
    await shot('chat-fail', true);
    check('chat: a route was produced', false, msg.trim());
    // Take the offered way out and see where it lands.
    const manual = page.locator('.chat-opt', { hasText: /myself/i }).first();
    if (await manual.count()) {
      await manual.click();
      await pause(2500);
      info(`after "Plan it myself": builder on screen = ${await page.locator('.dayex').count() > 0}, cards ${await page.locator('.dayex-card').count()}`);
      await shot('chat-fallback-landing');
    }
  } else {
    const summary = await page.locator('.chat-result .chat-bubble.bot').first().textContent().catch(() => '');
    const stats = await page.locator('.chat-route-stats').textContent().catch(() => '');
    const stops = await page.evaluate(() => [...document.querySelectorAll('.ai-plan-route li, .ai-route-stop, .ai-plan-stop, .chat-route [class*="stop"]')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
    info(`chat result summary: "${summary.trim()}"`);
    info(`chat result stats: "${stats.trim()}"`);
    info(`chat route stops: ${stops.join(' || ') || (await page.locator('.chat-route').textContent()).replace(/\s+/g, ' ').slice(0, 800)}`);
    const routeText = await page.locator('.chat-route').textContent();
    check('chat: route includes a trail / hike / summit', /trail|hike|hiking|walk|weg|steig|klamm|alm|peak|summit|ridge|gipfel|lake|see\b/i.test(routeText), routeText.replace(/\s+/g, ' ').slice(0, 200));
    await shot('chat-result', true);
  }
  netlog.forEach((l) => info(`net ${l}`));
}

console.log('\nerrors:', errors.length ? errors : 'none');
await browser.close();
if (server) {
  server.kill();
  if (process.platform === 'win32' && server.pid) {
    try { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  }
}
console.log('\nFINDINGS');
findings.filter((f) => !f.startsWith('info')).forEach((f) => console.log(f));
