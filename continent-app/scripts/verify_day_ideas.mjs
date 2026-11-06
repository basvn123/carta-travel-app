// T1089 needs: real data (POI shards under public/poi for the colosseum checks; the town 'Rome' is used when they are absent)
// T1089: refreshed for the five-step flow (Start, Days, Ideas, How, Plan): no yes/no
// choice any more (the search is the step, Skip is the footer), ideas carry a time-of-day select.
// Headless check of the day flow's new third question (prompt D4):
// "Anything you already want to do?"
//
// The step has to earn its place in a flow that was three questions long, so
// what is checked is that it costs nothing when the answer is no, and that
// when the answer is yes the answer actually REACHES both planning modes:
//   - the flow is four steps, and the rail says so;
//   - "No, surprise me" goes straight to How with no ideas taken;
//   - "Yes" reveals an autofocused search field;
//   - typing groups its hits (near the start point / shortlist / anywhere);
//   - a picked idea becomes a removable chip with a distance and a when;
//   - the CTA counts what has been taken;
//   - going on to "Build it myself" pre-adds the idea to the day tray;
//   - the two choice buttons are full width and 72px on a phone.
//
// Nominatim and Supabase are intercepted, so the run is deterministic.
//
// Run from inside continent-app/:  node scripts/verify_day_ideas.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

// CARTA_PORT (T389): a parallel session may hold the default port with its own
// preview, so a run can name its own server instead of testing someone else's.
const PORT = Number(process.env.CARTA_PORT) || 4195;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

// The POI shards are R2-only data; a container without them cannot find a sight
// by name, only a town. The checks then search for the town and say so.
const HAS_POI = existsSync('public/poi');
const IDEA_Q = HAS_POI ? 'colosseum' : 'rome';
if (!HAS_POI) console.log('  note (needs real data): public/poi absent, ideas are searched as the town "rome", not the colosseum');

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

// A stay in the middle of Rome, so the catalogue pools around it are rich.
const GEOCODE_STAY = [{
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy',
  name: 'Hotel Artemide', lat: '41.8996', lon: '12.4939',
  category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it' },
}];

// The "anywhere" pool: a place the catalogue has no row for, close enough to
// be a day trip, plus one far outside the 80 km cap that must be dropped.
const GEOCODE_IDEA = [
  {
    display_name: 'Trattoria Da Enzo, Via dei Vascellari, Rome, Lazio, Italy',
    name: 'Trattoria Da Enzo', lat: '41.8892', lon: '12.4781',
    category: 'amenity', type: 'restaurant',
    address: { country: 'Italy', country_code: 'it' },
  },
  {
    display_name: 'Trattoria Milanese, Milan, Lombardy, Italy',
    name: 'Trattoria Milanese', lat: '45.4640', lon: '9.1900',
    category: 'amenity', type: 'restaurant',
    address: { country: 'Italy', country_code: 'it' },
  },
];

const seed = async (page) => {
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  });
  // The stay search and the idea search both hit Nominatim; they are told
  // apart by what is being asked for.
  await page.route('**/nominatim.openstreetmap.org/search**', (r) => {
    const q = decodeURIComponent(new URL(r.request().url()).searchParams.get('q') || '');
    const body = /artemide|hotel/i.test(q) ? GEOCODE_STAY : GEOCODE_IDEA;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

// Walk the flow to the ideas step: pick a stay, take the date as it opens.
const openIdeasStep = async (page) => {
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.locator('.day-stay-input').waitFor({ timeout: 120000 });
  await page.waitForTimeout(900);
  await page.locator('.day-stay-input').fill('Hotel Artemide Rome');
  await page.locator('.day-stay-input').press('Enter');
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  await page.locator('.day-stay-result').first().click();
  await page.locator('.dayw-chosen').waitFor({ timeout: 30000 });
  await page.locator('.guide-next').click();
  await page.locator('.dayw-when').waitFor({ timeout: 30000 });
  await page.locator('.guide-next').click();
  await page.locator('.day-ideas-input').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};

const readRail = (page) => page.evaluate(() => ({
  steps: [...document.querySelectorAll('.wiz-step .wiz-step-name')].map((n) => n.textContent.trim()),
  title: (document.querySelector('.shape-head-title')?.childNodes[0]?.textContent || '').trim(),
  counter: (document.querySelector('.shape-head-step')?.textContent || '').trim(),
  now: (document.querySelector('.wiz-step.now .wiz-step-name')?.textContent || '').trim(),
}));

try {
  await waitForServer();
  const browser = await chromium.launch();

  // ---- 1. The flow is five steps and the rail names the ideas step -------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    await seed(page);
    await openIdeasStep(page);
    const rail = await readRail(page);
    if (rail.steps.length !== 5) fail(`the rail shows ${rail.steps.length} steps, expected 5: ${rail.steps.join(' | ')}`);
    else ok(`rail: ${rail.steps.join(' > ')}`);
    if (!/3 of 5/.test(rail.counter)) fail(`the counter reads "${rail.counter}", expected "step 3 of 5"`);
    else ok(`counter reads "${rail.counter}"`);
    if (!/idea/i.test(rail.now)) fail(`the current step is "${rail.now}", not the ideas step`);

    const q = (await page.locator('.guide-title').innerText()).trim();
    if (!/already want to do/i.test(q)) fail(`the question reads "${q}"`);
    else ok(`question: "${q}"`);
    // Nothing taken: the footer offers Skip rather than a dead Next.
    const skip = (await page.locator('.guide-next').innerText()).trim();
    if (!/skip/i.test(skip)) fail(`the footer reads "${skip}", expected it to offer Skip`);
    else ok('with nothing taken the footer offers Skip');

    // The search is the step itself now: no yes/no choice in front of it.
    if (!(await page.locator('.day-ideas-input').isVisible())) fail('the search field is not on screen');
    else ok('the step opens on the search field');
    if (await page.locator('.day-ideas-choice').count()) fail('the old yes/no choice is still on screen');

    await page.screenshot({ path: `${SHOTS}/day-ideas-choice.png` });
    await ctx.close();
  }

  // ---- 2. Skip is a complete answer --------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    await seed(page);
    await openIdeasStep(page);
    await page.locator('.guide-next').click();
    await page.locator('.dayw-fork').waitFor({ timeout: 30000 });
    const rail = await readRail(page);
    if (!/4 of 5/.test(rail.counter)) fail(`Skip landed on "${rail.counter}", expected step 4 of 5`);
    else ok('Skip goes straight to How');
    await ctx.close();
  }

  // ---- 3. "Yes" reveals an autofocused field that groups its hits --------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    await seed(page);
    await openIdeasStep(page);
    await page.locator('.day-ideas-input').waitFor({ timeout: 30000 });

    // A name the Rome catalogue definitely holds. The geocoder pool is
    // debounced at 450ms and the catalogue pools are synchronous, so the read
    // waits for BOTH: a snapshot taken between them would report a real pool
    // as missing.
    await page.locator('.day-ideas-input').fill(IDEA_Q);
    await page.waitForTimeout(1800);
    const readGroups = () => page.evaluate(() => [...document.querySelectorAll('.day-ideas-group')].map((g) => ({
      label: (g.querySelector('.day-ideas-h')?.textContent || '').trim(),
      rows: [...g.querySelectorAll('.day-ideas-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
    })));
    const groups = await readGroups();
    if (!groups.length) fail('typing a well-known nearby sight produced no suggestions at all');
    else ok(`groups: ${groups.map((g) => `${g.label} (${g.rows.length})`).join(' | ')}`);

    // The catalogue pool is the one that matters most: it is the only one
    // whose hits carry an index the manual tray can pre-add.
    const near = groups.find((g) => /near your start/i.test(g.label));
    if (!near) fail(`the catalogue pool answered nothing for ${IDEA_Q} beside the stay: ${groups.map((g) => g.label).join(' | ')}`);
    else {
      ok(`the catalogue pool answered: ${near.rows.join(' | ')}`);
      // "Rome (Fiumicino)" is how the fares name a city; a day out is to Rome.
      const airporty = near.rows.filter((r) => /\((?:[A-Z]{3}|Fiumicino|Malpensa|Linate|Bergamo|Charleroi|Beauvais)\)/i.test(r));
      if (airporty.length) fail(`a suggestion wears its airport qualifier: ${airporty.join(' | ')}`);
      else ok('suggestions name towns, not airports');
    }

    // Every row has to carry a distance: "which of these is near me" is the
    // question the group heading only half answers.
    const rows = groups.flatMap((g) => g.rows);
    const withReach = rows.filter((r) => /min walk|km away/i.test(r));
    if (rows.length && !withReach.length) fail(`no suggestion row shows how far away it is: ${rows[0]}`);
    else if (rows.length) ok(`${withReach.length}/${rows.length} rows carry a distance`);

    // ---- The "anywhere" pool, and its 80 km cap -------------------------
    await page.locator('.day-ideas-input').fill('trattoria');
    await page.waitForTimeout(1600);
    const any = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.day-ideas-group')]
        .find((x) => /anywhere/i.test(x.querySelector('.day-ideas-h')?.textContent || ''));
      return g ? [...g.querySelectorAll('.day-ideas-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()) : [];
    });
    if (!any.length) fail('the geocoder pool returned nothing for a place off the catalogue');
    else {
      if (any.some((r) => /milanese/i.test(r))) fail(`a hit 470 km away survived the cap: ${any.join(' | ')}`);
      else ok(`anywhere pool capped to day-trip range: ${any.join(' | ')}`);
    }

    // ---- Picking one makes a chip with a distance and a when ------------
    await page.locator('.day-ideas-row').first().click();
    await page.locator('.day-ideas-chip').waitFor({ timeout: 30000 });
    const chip = await page.evaluate(() => {
      const c = document.querySelector('.day-ideas-chip');
      return {
        name: (c.querySelector('.day-ideas-chip-text b')?.textContent || '').trim(),
        reach: (c.querySelector('.day-ideas-chip-text small')?.textContent || '').trim(),
        whens: [...c.querySelectorAll('.day-ideas-when-select option')].map((o) => ({
          label: o.textContent.trim(), on: o.selected,
        })),
        hasRemove: !!c.querySelector('.day-ideas-chip-x'),
      };
    });
    if (!chip.name) fail('the picked idea became a chip with no name');
    else ok(`chip: ${chip.name} (${chip.reach || 'no distance'})`);
    if (!chip.hasRemove) fail('the chip cannot be removed');
    if (chip.whens.length !== 4) fail(`the chip offers ${chip.whens.length} times of day, expected 4`);
    else {
      const on = chip.whens.filter((w) => w.on);
      if (on.length !== 1 || !/any/i.test(on[0].label)) fail(`the default time of day is "${on.map((w) => w.label).join(',')}", expected Any`);
      else ok(`time of day: ${chip.whens.map((w) => w.label).join(' / ')}, defaulting to Any`);
    }

    // The box clears so the next idea starts fresh.
    const boxAfter = await page.locator('.day-ideas-input').inputValue();
    if (boxAfter) fail(`the search box kept "${boxAfter}" after a pick`);
    else ok('the box clears after a pick');

    // ---- The CTA counts what has been taken ----------------------------
    const cta = (await page.locator('.guide-next').innerText()).trim();
    const counted = (await page.locator('.dayw-foot-days').innerText()).trim();
    if (!/1 idea\b/i.test(counted)) fail(`the footer reads "${counted}", expected it to count one idea`);
    else ok(`footer count: "${counted}", CTA: "${cta}"`);

    // Choosing a time of day sticks.
    await page.locator('.day-ideas-when-select').first().selectOption('morning');
    await page.waitForTimeout(150);
    const morningOn = await page.evaluate(() => document.querySelector('.day-ideas-when-select')?.value === 'morning');
    if (!morningOn) fail('picking a time of day did not take');
    else ok('a time of day can be set on a chip');

    // ---- Removing it empties the answer again --------------------------
    await page.locator('.day-ideas-chip-x').first().click();
    await page.waitForTimeout(200);
    if (await page.locator('.day-ideas-chip').count()) fail('removing the chip left it on screen');
    else ok('an idea can be removed');
    const ctaEmpty = (await page.locator('.guide-next').innerText()).trim();
    if (!/skip/i.test(ctaEmpty)) fail(`the footer reads "${ctaEmpty}" with no ideas taken, expected Skip`);
    else ok('with nothing taken the footer offers Skip again');

    await page.screenshot({ path: `${SHOTS}/day-ideas-search.png` });
    await ctx.close();
  }

  // ---- 4. An idea reaches "Build it myself" ------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    await seed(page);
    await openIdeasStep(page);
    await page.locator('.day-ideas-input').waitFor({ timeout: 30000 });
    await page.locator('.day-ideas-input').fill(IDEA_Q);
    await page.waitForTimeout(1500);
    if (!(await page.locator('.day-ideas-row').count())) {
      await page.locator('.day-ideas-input').fill(HAS_POI ? 'colosseo' : 'roma');
      await page.waitForTimeout(1500);
    }
    const rowCount = await page.locator('.day-ideas-row').count();
    if (!rowCount) {
      fail('no catalogue suggestion to carry into the manual mode');
    } else {
      const name = (await page.locator('.day-ideas-row-text b').first().innerText()).trim();
      await page.locator('.day-ideas-row').first().click();
      await page.locator('.day-ideas-chip').waitFor({ timeout: 30000 });
      await page.locator('.guide-next').click();
      await page.locator('.dayw-fork').waitFor({ timeout: 30000 });
      await page.getByText(/plan it myself|build it myself/i).first().click();
      await page.locator('.dayex').waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      // The tray is the proof: the idea has to be a pick already made, not a
      // thing the traveller has to find on the map all over again.
      const tray = await page.evaluate(() => document.body.innerText);
      if (!tray.toLowerCase().includes(name.toLowerCase().slice(0, 10))) {
        fail(`"${name}" did not carry into the manual mode`);
      } else ok(`"${name}" was pre-added to the manual day`);
      await page.screenshot({ path: `${SHOTS}/day-ideas-manual.png`, fullPage: false });
    }
    await ctx.close();
  }

  // ---- 5. An idea settles the chat's town question ----------------------
  // Every idea in one town means the bot already knows where the day is, so
  // asking "which town?" would be asking something just answered.
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await ctx.newPage();
    await seed(page);

    // D5 note: this used to assert that naming an idea removes EXACTLY one
    // question, on the premise that the town is always asked otherwise. That
    // premise is gone. D5 also skips the town question when the town the day
    // would land in can already fill a day, which is true for Rome with or
    // without an idea, so both counts are legitimately equal.
    //
    // What still has to hold, and is what the ideas step is actually for:
    // naming a place never makes the conversation LONGER, and the town
    // question is not asked once the town is settled either way.
    await openIdeasStep(page);
    await page.locator('.guide-next').click();
    await page.locator('.dayw-fork').waitFor({ timeout: 30000 });
    await page.getByText(/let carta plan it|ask the carta bot|use the chatbot/i).first().click();
    await page.locator('.daychat-progress').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    const noIdeas = await page.evaluate(() => ({
      total: Number(((document.querySelector('.daychat-progress')?.textContent || '').match(/\d+/g) || [0, 0]).pop()),
    }));

    // Now the same flow WITH one idea taken.
    await openIdeasStep(page);
    await page.locator('.day-ideas-input').waitFor({ timeout: 30000 });
    await page.locator('.day-ideas-input').fill(IDEA_Q);
    await page.waitForTimeout(1800);
    if (!(await page.locator('.day-ideas-row').count())) {
      fail('no catalogue suggestion to settle the town with');
    } else {
      await page.locator('.day-ideas-row').first().click();
      await page.locator('.day-ideas-chip').waitFor({ timeout: 30000 });
      await page.locator('.guide-next').click();
      await page.locator('.dayw-fork').waitFor({ timeout: 30000 });
      await page.getByText(/let carta plan it|ask the carta bot|use the chatbot/i).first().click();
      await page.locator('.daychat-progress').waitFor({ timeout: 30000 });
      await page.waitForTimeout(600);
      const withIdeas = Number((((await page.locator('.daychat-progress').innerText()).match(/\d+/g)) || [0, 0]).pop());
      const townAsked = await page.getByText(/where do you want to spend the day\?/i).count();
      if (!noIdeas.total || !withIdeas) fail('could not read the chat question count');
      else if (withIdeas > noIdeas.total) {
        fail(`naming an idea made the chat LONGER: ${withIdeas} questions with, ${noIdeas.total} without`);
      } else if (townAsked) {
        fail('the town question was asked even though an idea settled the town');
      } else {
        ok(`an idea never lengthens the chat: ${withIdeas} questions with, ${noIdeas.total} without, town not asked`);
      }
    }
    await page.screenshot({ path: `${SHOTS}/day-ideas-chat.png` });
    await ctx.close();
  }

  // ---- 6. Phone: the step fits, the field and the footer are thumb-sized --
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await seed(page);
    await openIdeasStep(page);
    const m = await page.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); const b = e?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; };
      return { input: r('.day-ideas-input'), next: r('.guide-next') };
    });
    if (!m.input || m.input.w < 250) fail(`the search field is ${m.input?.w ?? 'missing'}px wide on a phone`);
    else ok(`phone: search field ${m.input.w}x${m.input.h}`);
    if (!m.next || m.next.h < 44) fail(`the footer button is ${m.next?.h ?? 'missing'}px tall on a phone, under 44`);
    else ok(`phone: footer button ${m.next.w}x${m.next.h}`);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (sideways) fail('the ideas step scrolls sideways on a phone');
    else ok('no sideways scroll on a phone');
    await page.screenshot({ path: `${SHOTS}/day-ideas-phone.png` });
    await ctx.close();
  }

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(process.exitCode ? '\nD4: some checks failed' : '\nD4: all checks passed');
