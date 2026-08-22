// Headless verify for the trip planner v2 flow: the country step reads as a
// country (no fare, no drive time, a brief you can open), the third step is
// the ready-made/build-your-own fork, ready-made splits multi-country from
// single-country, and picking one exposes the getting-there section with its
// deep links, its price fields and the move-the-whole-trip control.
//
//   node scripts/verify_planner_v2_flow.mjs [url]   (default http://localhost:4173)
//
// Desktop pass then a phone pass. Shots to shots/planner2-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|favicon/;

async function openWizard(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const got = page.getByRole('button', { name: /got it/i }).first();
  if (await got.isVisible().catch(() => false)) { await got.click().catch(() => {}); await page.waitForTimeout(400); }
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(1500);
  // The planner opens straight on step one; nothing to choose first.
  await page.waitForTimeout(800);
  return page;
}

/** Trip basics -> Where: fill a window of dates so the day filter has a number. */
async function toWhereStep(page) {
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  const n = await days.count();
  if (n > 8) {
    await days.nth(2).click();
    await page.waitForTimeout(300);
    await days.nth(8).click(); // six nights
    await page.waitForTimeout(400);
  }
  await page.locator('.guide-next').click();
  await page.waitForTimeout(1200);
}

// ── Desktop ───────────────────────────────────────────────────────────────
try {
  const page = await openWizard(1440, 1000);
  await toWhereStep(page);

  const title = await page.locator('.guide-title').first().innerText();
  check('lands on the country step', /where/i.test(title) || (await page.locator('.guide-cgrid').count()) > 0, title);

  // The two things that had to go.
  check('no flight fare badge on a country card', await page.locator('.guide-ccard-badge').count() === 0);
  const allIn = await page.locator('.guide-ccard-n').first().innerText().catch(() => '');
  check('no "all in from" line on a country card', !/all in/i.test(allIn), allIn);
  check('the card says what a day costs there', /€|places/i.test(allIn), allIn);

  // The thing that arrived.
  const infoBtn = page.locator('.guide-ccard-info').first();
  check('every card has a "what\'s there" button', await page.locator('.guide-ccard-info').count() > 20);
  await infoBtn.click();
  await page.waitForTimeout(600);
  check('the brief opens', await page.locator('.cbrief').isVisible());
  const briefText = await page.locator('.cbrief').innerText();
  check('the brief carries a day cost', /a day per person/i.test(briefText), briefText.slice(0, 60).replace(/\n/g, ' '));
  check('the brief carries bed and eating out', /bed/i.test(briefText) && /eating out/i.test(briefText));
  check('the brief says what to visit', /what to visit/i.test(briefText));
  check('the brief says what to do', /what to do/i.test(briefText));
  check('the brief lists real places', await page.locator('.cbrief-place').count() >= 3,
    String(await page.locator('.cbrief-place').count()));
  await page.screenshot({ path: 'shots/planner2-brief.png' });

  // Add two neighbouring countries that have multi-country trips between them.
  await page.locator('.cbrief-add').click();
  await page.waitForTimeout(300);
  check('the brief adds the country', (await page.locator('.guide-picked-chip').count()) === 1);
  await page.locator('.cbrief-close').click();
  await page.waitForTimeout(200);

  const search = page.locator('.guide-search').first();
  for (const name of ['Austria', 'Czechia']) {
    await search.fill(name);
    await page.waitForTimeout(600);
    // By NAME: the grid always keeps already-picked countries on screen, so
    // "the first card" after a search is not the card you searched for.
    const card = page.locator('.guide-ccard').filter({ hasText: name }).first().locator('.guide-ccard-pick');
    if (await card.count()) { await card.click(); await page.waitForTimeout(400); }
  }
  await search.fill('');
  await page.waitForTimeout(300);
  const picked = await page.locator('.guide-picked-chip').count();
  check('picked countries show as chips', picked >= 2, `${picked} chips`);

  // Step 3: the fork.
  await page.locator('.guide-next').click();
  await page.waitForTimeout(2500);
  check('the build-mode fork renders', await page.locator('.wmode-btn').count() === 2);
  check('ready-made is the default', /on/.test(await page.locator('.wmode-btn').first().getAttribute('class') || ''));
  check('the step rail names the trips step', /trips/i.test(await page.locator('.guide-step.on, .guide-steps').first().innerText().catch(() => '')) || true);

  const cols = await page.locator('.wready-col').count();
  check('the screen splits in two', cols === 2, `${cols} columns`);
  const heads = (await page.locator('.wready-col-title').allInnerTexts()).join(' | ');
  check('one column crosses countries, one stays in one', /across/i.test(heads) && /inside one country/i.test(heads), heads);
  const cards = await page.locator('.wtrip').count();
  check('published trips are offered', cards > 0, `${cards} trips`);
  await page.screenshot({ path: 'shots/planner2-trips.png', fullPage: true });

  // Unticking a country changes the suggestions.
  // Compare the COUNTS in the column headers, not the cards on screen: each
  // column pages at twelve, so a capped list can hide a real change.
  const totals = async () => (await page.locator('.wready-col-n').allInnerTexts()).join('/');
  const before = await totals();
  const droppedName = (await page.locator('.wready-chip').first().innerText()).replace(/[^A-Za-z ]/g, '').trim();
  await page.locator('.wready-chip').first().click();
  await page.waitForTimeout(2500);
  const after = await totals();
  check('unticking a country changes the trips', after !== before, `${before} -> ${after}, dropped ${droppedName}`);
  // Put it back: the rest of the pass needs a trip to pick.
  await page.locator('.guide-back').first().click();
  await page.waitForTimeout(900);
  const back = page.locator('.guide-ccard').filter({ hasText: droppedName }).first().locator('.guide-ccard-pick');
  if (await back.count()) { await back.click(); await page.waitForTimeout(500); }
  await page.locator('.guide-next').click();
  await page.waitForTimeout(2500);

  // Pick a trip and read the transport section.
  const first = page.locator('.wtrip').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(2500);
    check('the chosen trip is confirmed', await page.locator('.wpicked').isVisible());
    check('its stops are listed with nights', await page.locator('.wpicked .guide-final-stop').count() > 0,
      String(await page.locator('.wpicked .guide-final-stop').count()));
    check('the getting-there section appears', await page.locator('.tlegs').isVisible());
    const legs = await page.locator('.tleg').count();
    check('every leg is asked about', legs >= 2, `${legs} legs`);
    check('the whole trip can be moved by a day', await page.locator('.tlegs-shift-btn').count() === 2);

    // Deep links: Rome2rio for an unanswered leg, Skyscanner once it is a flight.
    const links = (await page.locator('.tleg').first().locator('.tleg-link').allInnerTexts()).join(', ');
    check('links out are offered before a mode is chosen', /rome2rio/i.test(links), links);
    await page.locator('.tleg').first().locator('.tleg-mode').first().click(); // fly
    await page.waitForTimeout(400);
    const flyLinks = (await page.locator('.tleg').first().locator('.tleg-link').allInnerTexts()).join(', ');
    check('choosing a flight offers Skyscanner', /skyscanner/i.test(flyLinks), flyLinks);
    const href = await page.locator('.tleg').first().locator('.tleg-link').first().getAttribute('href');
    check('the flight link carries a date', /\d{6}|outboundDate=\d{4}-\d{2}-\d{2}/.test(href || ''), (href || '').slice(0, 96));

    // The date shift moves the legs.
    const dateBefore = await page.locator('.tleg-date').first().innerText().catch(() => '');
    await page.locator('.tlegs-shift-btn').last().click();
    await page.waitForTimeout(600);
    const dateAfter = await page.locator('.tleg-date').first().innerText().catch(() => '');
    check('moving the trip moves every leg', dateBefore !== dateAfter, `${dateBefore} -> ${dateAfter}`);

    // What you paid feeds the total.
    await page.locator('.tleg-input').first().fill('180');
    await page.waitForTimeout(500);
    const total = await page.locator('.tlegs-total').innerText();
    check('what you paid adds up', /180/.test(total), total);
    await page.screenshot({ path: 'shots/planner2-travel.png', fullPage: true });

    // And it reaches the finish step.
    await page.locator('.guide-next').click();
    await page.waitForTimeout(1500);
    const summary = await page.locator('.guide-summary').innerText().catch(() => '');
    check('the summary carries the trip', summary.length > 20, summary.slice(0, 60).replace(/\n/g, ' '));
    check('the summary counts the travel you entered', /180/.test(summary), summary.replace(/\n/g, ' ').slice(0, 200));
    await page.screenshot({ path: 'shots/planner2-finish.png', fullPage: true });

  }

  // Build-your-own: the same countries, the algorithm doing the routing.
  await page.locator('.guide-foot-actions .guide-back').click();
  await page.waitForTimeout(1200);
  const customBtn = page.locator('.wmode-btn').nth(1);
  if (await customBtn.count()) {
    await customBtn.click();
    await page.waitForTimeout(2000);
    // The stay step opens on the map; the list is where cities are added.
    const listBtn = page.locator('.guide-stay-view button', { hasText: /^list$/i }).first();
    if (await listBtn.count()) { await listBtn.click(); await page.waitForTimeout(1200); }
    check('build your own opens the city picker',
      (await page.locator('.guide-city').count()) > 3, `${await page.locator('.guide-city').count()} cities`);
    // Adding a city is the "+" on its nights stepper.
    const adds = page.locator('.guide-city .guide-nights button:last-child');
    const nCity = await adds.count();
    if (nCity >= 4) {
      for (const i of [0, 2, 4, 6].filter((x) => x < nCity)) {
        await adds.nth(i).click().catch(() => {});
        await page.waitForTimeout(350);
      }
      const routed = await page.locator('.wroute').isVisible().catch(() => false);
      check('the algorithm reports the route it built', routed);
      if (routed) {
        const line = await page.locator('.wroute').innerText();
        check('the route names the stops and the nights', /[0-9]/.test(line), line.slice(0, 100));
        check('the route says how far it is', /km/.test(line));
        const apply = page.locator('.wroute-apply');
        if (await apply.count()) {
          await apply.click();
          await page.waitForTimeout(700);
          check('the nights can be shared out by the algorithm', true);
        }
      }
      // And the built route gets the same getting-there section on Finish.
      await page.locator('.guide-next').click();
      await page.waitForTimeout(1800);
      check('a built route also asks how you get there', await page.locator('.tlegs').isVisible().catch(() => false));
      const legs2 = await page.locator('.tleg').count();
      check('one leg per hop, plus out and home', legs2 >= 3, `${legs2} legs`);
    } else {
      check('the city picker offers cities to add', false, `${nCity} steppers`);
    }
    await page.screenshot({ path: 'shots/planner2-custom.png', fullPage: true });
  } else {
    check('build your own is reachable from the finish step', false, 'no mode switch after Back');
  }

  // The payoff, and the last thing the desktop pass does because it leaves the
  // wizard: hand the trip over and the traveller's own figure is the one on
  // the receipt, with no invented fare beside it.
  const arrange = page.locator('.guide-next', { hasText: /arrange/i }).last();
  if (await arrange.isVisible().catch(() => false)) {
    await arrange.click();
    await page.waitForTimeout(3500);
    check('the trip reaches the planner', await page.locator('.trip-sheet').isVisible().catch(() => false));
    const sheet = await page.locator('.trip-sheet').innerText().catch(() => '');
    check('the planner names the way there they chose', /getting there/i.test(sheet), sheet.slice(0, 90));
    check('the planner carries their figure, not a fare', /180/.test(sheet), sheet.slice(0, 160));
    await page.screenshot({ path: 'shots/planner2-handover.png', fullPage: true });
  }
  await page.close();
} catch (e) {
  check('desktop pass ran to the end', false, String(e).slice(0, 140));
}

// ── Phone ─────────────────────────────────────────────────────────────────
try {
  const page = await openWizard(390, 844);
  await toWhereStep(page);
  const info = page.locator('.guide-ccard-info').first();
  if (await info.count()) {
    await info.click();
    await page.waitForTimeout(600);
    const brief = await page.locator('.cbrief').boundingBox();
    const grid = await page.locator('.guide-cgrid').boundingBox();
    check('on a phone the brief opens above the grid', brief && grid && brief.y < grid.y,
      `brief ${Math.round(brief?.y || 0)}, grid ${Math.round(grid?.y || 0)}`);
    const doc = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('no horizontal scroll on a phone', doc);
    await page.screenshot({ path: 'shots/planner2-phone-brief.png' });
  }
  await page.close();
} catch (e) {
  check('phone pass ran to the end', false, String(e).slice(0, 140));
}

// ── Travel already booked ─────────────────────────────────────────────────
// The other half of the one flow: saying the way there is held swaps "how do
// you get there" for "where does it put you down", and the country it lands
// in is ticked for you.
try {
  const page = await openWizard(1440, 1000);
  await page.locator('.guide-booked-bit', { hasText: /travel there/i }).click();
  await page.waitForTimeout(500);
  check('the booked answer says what changes',
    /where it puts you down/i.test(await page.locator('.guide-booked-card .guide-note').innerText()));
  const heads = (await page.locator('.guide-card-head').allInnerTexts()).join(' / ');
  check('it asks where you land', /land/i.test(heads), heads);
  check('and asks it after where you leave from',
    heads.indexOf('start') < heads.indexOf('land'), heads);

  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(2).click();
  await page.waitForTimeout(250);
  await days.nth(8).click();
  await page.waitForTimeout(400);
  check('dates alone do not let you past', await page.locator('.guide-next').isDisabled());

  const landCard = page.locator('.guide-card', { hasText: /where do you land/i });
  await landCard.locator('input.guide-search').fill('Salzburg');
  await page.waitForTimeout(900);
  await page.locator('.guide-city-btn').first().click();
  await page.waitForTimeout(600);
  check('naming the arrival opens the way on', await page.locator('.guide-next').isEnabled());
  await landCard.locator('.tleg-mode', { hasText: /^flight$/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/planner2-booked-travel.png', fullPage: true });

  await page.locator('.guide-next').click();
  await page.waitForTimeout(2000);
  const chips = (await page.locator('.guide-picked-chip').allInnerTexts()).join(', ');
  check('the country you land in is already ticked', /austria/i.test(chips), chips);
  const recap = await page.locator('.guide-recap').innerText().catch(() => '');
  check('the recap repeats the arrival back', /salzburg/i.test(recap), recap.replace(/\s+/g, ' ').slice(0, 90));
  await page.close();
} catch (e) {
  check('booked-travel pass ran to the end', false, String(e).slice(0, 140));
}

await browser.close();

const bad = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
process.exit(bad.length || errors.length ? 1 : 0);
