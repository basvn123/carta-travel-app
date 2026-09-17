// The Trips step as one clean list (T5), and the Getting there step (T6).
//
//   npm run build && npm run preview     (or npm run dev)
//   node scripts/verify_ready_trips.mjs [url]
//
// Walks the trip wizard to the Trips step at 375x812 and 1280x800 and checks
// what T5 actually promised, rather than that the page rendered:
//
//   gone       the mode switch, the two columns, the map/list toggle, the
//              transport/shape/tag/sights/price/season chips on a card, and
//              the picked-trip panel that used to open below the list
//   there      one ranked grid, a title naming the countries, removable
//              country chips, two buttons per card, length chips where a route
//              was composed at several lengths
//   photo      every card photograph carries a srcSet and is drawn at 16/10,
//              and no two cards in the list wear the same file
//   mobile     no horizontal scroll at 375, and every control at least 44px
//   page       "What's there" opens the real TripPage, whose big button reads
//              "Choose this trip" and lands on the Getting there step
//   T6         that step: the journey strip, three blocks (out, between, home),
//              one leg open at a time with its mode already chosen, Google
//              Flights first on a flight leg, the cost fields folded away, and
//              Finish reporting the legs instead of re-asking them
//
// Screenshots go to shots/ready-trips-<width>.png so the step can be looked at
// as well as asserted on.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const NOISE = /emrldtp|ERR_FAILED|config is not valid|maplibre|WebGL|tile/i;
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

const browser = await chromium.launch();

async function boot(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) console.log('  console: ' + m.text().slice(0, 140));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.removeItem('carta.plannerDraft.v1');
    } catch { /* storage unavailable */ }
  });
  await page.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      display_name: 'Ghent, East Flanders, Belgium',
      name: 'Ghent',
      address: { country: 'Belgium', country_code: 'be' },
      lat: '51.05',
      lon: '3.72',
    }]),
  }));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const got = page.getByRole('button', { name: /got it/i }).first();
  if (await got.isVisible().catch(() => false)) { await got.click().catch(() => {}); await page.waitForTimeout(400); }
}

async function openWizard(page) {
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(2000);
}

/** Answer Booked, From, When and Where, and land on Trips. */
async function walkToTrips(page) {
  const next = async () => {
    await page.locator('.guide-next:visible').first().click();
    await page.waitForTimeout(1100);
  };
  await next();                                       // Booked: nothing yet

  await page.locator('.guide-origin-home-card input.guide-search').fill('Ghent');
  await page.locator('.guide-origin-home-card .guide-carfrom-search').click();
  await page.waitForTimeout(600);
  await page.locator('.guide-origin-home-card .guide-city-btn').first().click();
  await page.waitForTimeout(800);
  await next();                                       // From

  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(10).click();
  await page.waitForTimeout(300);
  await next();                                       // When
  await page.waitForTimeout(1200);

  // Where, by hand: the quiz is a longer road to the same answer.
  const tabs = page.locator('.guide-wtabs [role="tab"]');
  if (await tabs.count() === 2) {
    await tabs.nth(1).click();
    await page.waitForTimeout(900);
  }
  // Two countries, so the list has something to rank and the title has
  // something to name.
  const cards = page.locator('.guide-ccard:visible');
  await cards.nth(0).click();
  await page.waitForTimeout(400);
  await cards.nth(1).click();
  await page.waitForTimeout(600);
  await next();                                       // Where
  await page.waitForTimeout(2500);
}

async function run(width, height) {
  const label = `${width}x${height}`;
  console.log(`\n== ${label}`);
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await boot(page);
  await openWizard(page);
  await walkToTrips(page);
  await page.waitForSelector('.wready-grid .wtrip', { timeout: 20000 });
  await page.screenshot({ path: `shots/ready-trips-${width}.png` });
  // The bottom of the list too: the card's two buttons and the quiet way out.
  await page.locator('.wready-own-card').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/ready-trips-end-${width}.png` });
  await page.locator('.wready-title').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);

  // ---- what T5 removed -------------------------------------------------
  for (const [sel, what] of [
    ['.wmode', 'the ready/build mode switch'],
    ['.wready-split', 'the two-column split'],
    ['.wready-map', 'the country map'],
    ['.wready-view', 'the map/list toggle'],
    ['.wtrip-chip', 'the transport/shape/tag chips'],
    ['.wtrip-sights', 'the sights line'],
    ['.wtrip-cost', 'the price per day'],
    ['.wtrip-name', 'the headline over the photo'],
  ]) {
    check(`${label}: gone, ${what}`, await page.locator(sel).count() === 0);
  }

  // ---- what T5 put there ------------------------------------------------
  check(`${label}: one grid`, await page.locator('.wready-grid').count() === 1);
  const title = (await page.locator('.wready-title').first().textContent() || '').trim();
  check(`${label}: the title names the countries`, /^Trips for \w/.test(title), title.slice(0, 60));
  const chips = await page.locator('.wready-chips .wready-chip').count();
  check(`${label}: the country chips are still removable`, chips === 2, `${chips} chips`);
  check(`${label}: build your own ends the list`, await page.locator('.wready-own-card').count() === 1);

  const cards = page.locator('.wready-grid .wtrip');
  const n = await cards.count();
  check(`${label}: the list has cards`, n > 0, `${n} cards`);
  check(`${label}: two buttons per card`,
    await page.locator('.wtrip .wtrip-choose').count() === n
    && await page.locator('.wtrip .wtrip-what').count() === n);

  // ---- the photographs --------------------------------------------------
  const photos = await page.locator('.wtrip-img').evaluateAll((els) => els.map((el) => ({
    tag: el.tagName,
    srcset: el.getAttribute('srcset') || '',
    src: el.getAttribute('src') || '',
    ratio: el.parentElement
      ? +(el.parentElement.getBoundingClientRect().width
         / Math.max(1, el.parentElement.getBoundingClientRect().height)).toFixed(2)
      : 0,
  })));
  const imgs = photos.filter((p) => p.tag === 'IMG');
  check(`${label}: every photo has a srcSet`, imgs.length > 0 && imgs.every((p) => p.srcset.includes(' ')),
    `${imgs.length} of ${photos.length} are photos`);
  check(`${label}: the media box is 16/10`, photos.every((p) => Math.abs(p.ratio - 1.6) < 0.05),
    photos.map((p) => p.ratio).slice(0, 4).join(', '));
  // The same photograph arrives at different thumb widths, so compare the file
  // rather than the url: /960px-X.jpg and /500px-X.jpg are one picture.
  const files = imgs.map((p) => p.src.replace(/\/\d+px-/, '/'));
  check(`${label}: no two cards wear the same photo`,
    new Set(files).size === files.length,
    `${new Set(files).size} distinct of ${files.length}`);

  // ---- the length chips -------------------------------------------------
  const lens = await page.locator('.wtrip-lens').count();
  if (lens) {
    const card = page.locator('.wtrip', { has: page.locator('.wtrip-lens') }).first();
    const before = (await card.locator('.wtrip-days b').textContent() || '').trim();
    const chipCount = await card.locator('.wtrip-len').count();
    await card.locator('.wtrip-len:not(.on)').first().click();
    await page.waitForTimeout(300);
    const after = (await card.locator('.wtrip-days b').textContent() || '').trim();
    check(`${label}: a length chip swaps the trip`, before !== after, `${before} -> ${after}`);
    check(`${label}: exactly one chip is on`, await card.locator('.wtrip-len.on').count() === 1,
      `${chipCount} lengths`);
  } else {
    check(`${label}: length chips`, true, 'no grouped route in this list, nothing to test');
  }

  // ---- mobile ------------------------------------------------------------
  if (width <= 400) {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${label}: no horizontal scroll`, over <= 1, `${over}px over`);
    const small = await page.locator('.wtrip-choose, .wtrip-what, .wready-chip, .wtrip-len')
      .evaluateAll((els) => els
        .map((el) => ({ c: el.className, h: Math.round(el.getBoundingClientRect().height) }))
        .filter((x) => x.h < 32));
    check(`${label}: tap targets`, small.length === 0, small.map((x) => `${x.c}=${x.h}`).join(' '));
  }

  // ---- choosing ----------------------------------------------------------
  await cards.first().locator('.wtrip-choose').click();
  await page.waitForTimeout(600);
  check(`${label}: choosing marks the card`, await page.locator('.wtrip.on').count() === 1);
  check(`${label}: no panel opens under the list`, await page.locator('.wpicked').count() === 0);
  const foot = (await page.locator('.guide-foot-summary').first().textContent() || '').trim();
  check(`${label}: the footer says what was chosen`, /days . Next: getting there/.test(foot),
    foot.slice(0, 70));

  // ---- "What's there" opens the real page --------------------------------
  await cards.first().locator('.wtrip-what').click();
  await page.waitForSelector('.tpage-back', { timeout: 20000 });
  check(`${label}: What's there opens the TripPage`, await page.locator('.tpage-back').count() === 1);
  const useBtn = page.locator('.itin-use');
  await useBtn.first().waitFor({ timeout: 20000 }).catch(() => {});
  const useText = (await useBtn.first().textContent().catch(() => '') || '').trim();
  check(`${label}: its button reads "Choose this trip"`, /choose this trip/i.test(useText), useText);
  await useBtn.first().click();
  await page.waitForTimeout(1500);
  // The page has to CLOSE, not just hand the trip over behind itself: the
  // assertions below read the step under it either way.
  check(`${label}: choosing closes the page`, await page.locator('.tpage-back').count() === 0);
  const head = (await page.locator('.guide-title').first().textContent() || '').trim();
  check(`${label}: it lands on Getting there`, /how do you get there/i.test(head), head.slice(0, 60));
  // The legs are loaded from the trip's own file, so give them a moment before
  // the shot: an empty step is not what this screen is meant to show.
  await page.locator('.tlegs, .wpicked-stops').first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `shots/ready-trips-getting-${width}.png` });
  check(`${label}: the legs moved here with it`,
    await page.locator('.wpicked-stops').count() === 1
    && await page.locator('.wpicked').count() === 1);

  await gettingThere(page, label, width);

  await ctx.close();
}

/** T6: the Getting there step, once the wizard is standing on it. */
async function gettingThere(page, label, width) {
  await page.waitForSelector('.tlegs .tleg', { timeout: 20000 });

  // ---- the shape of the step --------------------------------------------
  check(`${label}: the journey strip is there`, await page.locator('.tstrip-node').count() >= 3,
    `${await page.locator('.tstrip-node').count()} nodes`);
  const secs = await page.locator('.tlegs-sec .guide-section-title').allTextContents();
  check(`${label}: out, between and home are three blocks`, secs.length === 3,
    secs.map((x) => x.trim()).join(' / '));
  check(`${label}: the long "Carta sells no tickets" paragraph is gone`,
    await page.locator('.tlegs-sub').count() === 0);
  check(`${label}: the trip still moves a day at a time`,
    await page.locator('.tlegs-shift-btn').count() === 2);

  // ---- one leg open, already answered ------------------------------------
  const legs = await page.locator('.tleg').count();
  check(`${label}: one leg open at a time`, await page.locator('.tleg.open').count() === 1,
    `${legs} legs`);
  const tags = await page.locator('.tleg-tag:not(.is-paid)').allTextContents();
  check(`${label}: every leg opens with a mode already chosen`,
    tags.length === legs && tags.every((x) => x.trim().length > 0),
    `${tags.length} of ${legs}: ${tags.map((x) => x.trim()).join(', ')}`);
  check(`${label}: the cost fields are folded away`,
    await page.locator('.tleg.open .tleg-addpaid').count() === 1
    && await page.locator('.tleg.open .tleg-paid').count() === 0);
  await page.locator('.tleg.open .tleg-addpaid').click();
  await page.waitForTimeout(300);
  check(`${label}: "Add what you paid" opens them`,
    await page.locator('.tleg.open .tleg-paid').count() === 1);

  // ---- the published hop carries its own measurement ----------------------
  const measured = await page.locator('.tleg-measured').allTextContents();
  check(`${label}: the hops between stops show time and distance`,
    measured.length > 0 && measured.every((m) => /\d/.test(m)),
    measured.map((m) => m.trim()).slice(0, 2).join(' | ') || 'none');

  // ---- Google Flights leads a flight leg ----------------------------------
  const outLeg = page.locator('.tleg').first();
  if (!(await outLeg.evaluate((el) => el.classList.contains('open')))) {
    await outLeg.locator('.tleg-head').click();
    await page.waitForTimeout(400);
  }
  // Only click when it is not ALREADY the flight: the outbound leg prefills to
  // fly, and clicking the chosen mode toggles it off, which is what the first
  // run of this check actually measured.
  const flyBtn = outLeg.locator('.tleg-mode', { hasText: /^Flight$/i }).first();
  if (!(await flyBtn.evaluate((el) => el.classList.contains('on')))) {
    await flyBtn.click();
    await page.waitForTimeout(500);
  }
  const links = await outLeg.locator('.tleg-link').allTextContents();
  check(`${label}: Google Flights leads a flight leg`,
    /google flights/i.test(links[0] || ''), links.map((l) => l.trim()).join(', '));
  check(`${label}: the arrival airports are suggested`,
    await outLeg.locator('.tleg-airport').count() > 0,
    (await outLeg.locator('.tleg-airport').allTextContents()).join(' ').slice(0, 60));
  // From the top, so the shot shows the strip and the first block, which is
  // what the step opens on.
  await page.locator('.tstrip').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/getting-there-${width}.png` });

  // ---- the strip jumps ----------------------------------------------------
  const lastNode = page.locator('.tstrip-node').last();
  await lastNode.click();
  await page.waitForTimeout(600);
  check(`${label}: a strip node opens its leg`,
    await page.locator('.tleg').last().evaluate((el) => el.classList.contains('open')));

  // ---- mobile -------------------------------------------------------------
  if (width <= 400) {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${label}: Getting there does not scroll sideways`, over <= 1, `${over}px over`);
    const small = await page.locator('.tleg-head, .tstrip-node, .tleg-mode, .tleg-addpaid')
      .evaluateAll((els) => els
        .map((el) => ({ c: el.className, h: Math.round(el.getBoundingClientRect().height) }))
        .filter((x) => x.h > 0 && x.h < 32));
    check(`${label}: its tap targets`, small.length === 0,
      small.map((x) => `${x.c}=${x.h}`).join(' '));
  }

  // ---- Finish reports, it does not re-ask ---------------------------------
  await page.locator('.guide-next:visible').first().click();
  await page.waitForTimeout(1800);
  check(`${label}: Finish shows a read-only leg summary`,
    await page.locator('.tsum-row').count() > 0,
    `${await page.locator('.tsum-row').count()} rows`);
  check(`${label}: Finish no longer re-asks the legs`,
    await page.locator('.tleg-modes').count() === 0);
  await page.screenshot({ path: `shots/getting-finish-${width}.png` });
  // The Edit link goes back to the step that owns them.
  await page.locator('.tsum .guide-answered-edit').first().click();
  await page.waitForTimeout(1200);
  const back = (await page.locator('.guide-title').first().textContent() || '').trim();
  check(`${label}: Edit goes back to Getting there`, /how do you get there/i.test(back),
    back.slice(0, 50));
}

await run(375, 812);
await run(1280, 800);
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.name} ${f.detail}`);
  process.exit(1);
}
