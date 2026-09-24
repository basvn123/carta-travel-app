// Headless verify for prompt T8: the trip planner's flow polish, favourites
// and hand-offs.
//
//   1  the step rail collapses to one line + a sheet on a phone
//   2  the sticky footer clears the bottom nav and names its destination
//   3  the estimate band is i18n, absent on Where, collapsed by default
//   4  favourites: a shortlist row on Where, a star on a favourited trip
//   7  recap chips are buttons back to the step that set them
//
//   node scripts/verify_planner_t8.mjs [url]   (default http://localhost:4173)
//
// Items 5 and 6 (the Destinations hand-off and "Plan your days") need a
// published trip opened from the Destinations tab and a fully arranged plan;
// they are checked in their own pass at the bottom.
//
// Shots to shots/t8-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|favicon/;

async function openPlanner(width, height, { favs = [] } = {}) {
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
  // The shortlist rides in the URL (lib/urlState.js reads ?fav=), which is
  // also how a shared shortlist arrives, so this is the app's own door.
  const url = favs.length ? `${URL}?fav=${favs.join('.')}` : URL;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
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
  await page.waitForTimeout(1800);
  return page;
}

const nextStep = async (page) => {
  await page.locator('.guide-next').first().click();
  await page.waitForTimeout(1100);
};

const pickWindow = async (page, from = 2, to = 8) => {
  const sel = '.cal-day:not(.disabled):not(.outside)';
  if (await page.locator(sel).count() <= to) {
    const fwd = page.getByRole('button', { name: 'Next month' }).first();
    if (await fwd.count() && !(await fwd.isDisabled())) {
      await fwd.click();
      await page.waitForTimeout(500);
    }
  }
  const days = page.locator(sel);
  if (await days.count() <= to) return false;
  await days.nth(from).click();
  await page.waitForTimeout(300);
  await days.nth(to).click();
  await page.waitForTimeout(400);
  return true;
};

/** Booked -> From -> When -> Where. */
async function toWhereStep(page) {
  await nextStep(page);
  await nextStep(page);
  await pickWindow(page);
  await nextStep(page);
}

// ── Phone: the step rail, the footer, the estimate band ───────────────────
try {
  const page = await openPlanner(375, 812);

  check('T8.1 phone shows the one-line rail, not the seven-step one',
    (await page.locator('.wiz-mini:visible').count()) === 1
    && (await page.locator('.wiz-steps:visible').count()) === 0);

  const mini = (await page.locator('.wiz-mini').innerText()).replace(/\s+/g, ' ');
  const head = (await page.locator('.shape-head-title').innerText()).replace(/\s+/g, ' ');
  check('T8.1 it says how far along the form is',
    /step\s+1\s+of\s+\d+/i.test(mini), mini.slice(0, 60));
  check('T8.1 the step is named once, in the header above it',
    /booked/i.test(head) && !/booked/i.test(mini), `${head} / ${mini}`);
  check('T8.1 it carries a progress bar', await page.locator('.wiz-mini-bar > span').count() === 1);

  // No horizontal scroll at 375: the reason the rail was replaced.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('T8.1 no horizontal scroll at 375px', overflow <= 1, String(overflow));

  await page.screenshot({ path: 'shots/t8-phone-step1.png' });

  // The sheet behind it.
  await page.locator('.wiz-mini').click();
  await page.waitForTimeout(600);
  const sheet = page.locator('.fsheet.wiz-steps-sheet');
  check('T8.1 tapping it opens the step sheet', await sheet.isVisible());
  const rows = page.locator('.wiz-sheet-step');
  check('T8.1 the sheet lists every step', await rows.count() >= 6, String(await rows.count()));
  check('T8.1 steps still to come are not clickable',
    await page.locator('.wiz-sheet-step.todo > button[disabled]').count() > 0);
  await page.screenshot({ path: 'shots/t8-phone-steps-sheet.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('T8.1 Escape closes the sheet, not the wizard',
    (await sheet.count()) === 0 && (await page.locator('.wiz-mini').count()) === 1);

  // T8.2 the footer.
  const foot = page.locator('.guide-foot');
  const footBox = await foot.boundingBox();
  const navBox = await page.locator('.bottom-nav').boundingBox().catch(() => null);
  check('T8.2 the footer sits clear of the bottom nav',
    !navBox || footBox.y + footBox.height <= navBox.y + 1,
    navBox ? `foot ends ${Math.round(footBox.y + footBox.height)}, nav starts ${Math.round(navBox.y)}` : 'no nav');
  const nextH = (await page.locator('.guide-next').boundingBox()).height;
  check('T8.2 Next is a 44px tap target', nextH >= 44, String(Math.round(nextH)));

  const nextLabel = await page.locator('.guide-next').innerText();
  check('T8.2 Next names where it goes', /next:/i.test(nextLabel), nextLabel);

  // T8.3 the estimate band is absent on the opening questions and on Where.
  check('T8.3 no estimate band on step 1', await page.locator('.guide-estimate-band').count() === 0);

  await toWhereStep(page);
  check('T8.3 no estimate band on Where', await page.locator('.guide-estimate-band').count() === 0);
  const whereLabel = await page.locator('.guide-next').innerText();
  check('T8.2 Next on Where names the step after it',
    /next:/i.test(whereLabel) && !/next:\s*where/i.test(whereLabel), whereLabel);

  await page.screenshot({ path: 'shots/t8-phone-where.png' });
  await page.close();
} catch (e) {
  check('phone pass ran to the end', false, String(e).slice(0, 160));
}

// ── Phone: favourites on Where, and the recap chips ───────────────────────
try {
  const page = await openPlanner(375, 812, { favs: ['gem:andorra-la-vella'] });
  await toWhereStep(page);
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
  await page.waitForTimeout(800);

  const row = page.locator('.guide-shortrow');
  check('T8.4 the shortlist row sits above the grid', await row.isVisible());
  if (await row.count()) {
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    check('T8.4 it names the countries the shortlist holds',
      /andorra/i.test(rowText), rowText.slice(0, 70));
    const grid = await page.locator('.guide-cgrid').boundingBox();
    const rowBox = await row.boundingBox();
    check('T8.4 above, not below', rowBox.y < grid.y, `${Math.round(rowBox.y)} < ${Math.round(grid.y)}`);
    const chipH = (await page.locator('.guide-shortrow-chip').first().boundingBox()).height;
    check('T8.4 its chips are 44px tap targets', chipH >= 44, String(Math.round(chipH)));
    check('T8.4 the matching card still carries its badge',
      await page.locator('.guide-ccard-fav').count() > 0);
    await page.screenshot({ path: 'shots/t8-shortlist-row.png' });

    // Tapping one adds the country, which is the point of the row.
    await page.locator('.guide-shortrow-chip').first().click();
    await page.waitForTimeout(500);
    check('T8.4 tapping a shortlist chip picks the country',
      await page.locator('.guide-picked-chip').count() >= 1);
  }

  // T8.7 the recap chips.
  const recapLinks = page.locator('.guide-recap-chip.is-link');
  check('T8.7 the recap carries chips that go back', await recapLinks.count() > 0,
    String(await recapLinks.count()));
  if (await recapLinks.count()) {
    const h = (await recapLinks.first().boundingBox()).height;
    check('T8.7 a tappable chip is 44px on a phone', h >= 44, String(Math.round(h)));
    const stepBefore = await page.locator('.shape-head-title').innerText();
    // The dates chip goes back to When, which is behind us.
    const dateChip = recapLinks.filter({ hasText: /\d/ }).last();
    await dateChip.click();
    await page.waitForTimeout(900);
    const stepAfter = await page.locator('.shape-head-title').innerText();
    check('T8.7 tapping one moves the form back to that step',
      stepAfter !== stepBefore, `${stepBefore} -> ${stepAfter}`);
    check('T8.7 and it is a step that was already answered',
      /when/i.test(stepAfter), stepAfter);
  }
  await page.screenshot({ path: 'shots/t8-recap-jump.png' });
  await page.close();
} catch (e) {
  check('favourites/recap pass ran to the end', false, String(e).slice(0, 160));
}

// ── Desktop: the rail stays, the estimate band is translated ──────────────
try {
  const page = await openPlanner(1280, 800);
  check('T8.1 desktop keeps the full named rail',
    (await page.locator('.wiz-steps:visible').count()) === 1
    && (await page.locator('.wiz-mini:visible').count()) === 0);

  await toWhereStep(page);
  check('T8.3 no estimate band on Where (desktop too)',
    await page.locator('.guide-estimate-band').count() === 0);

  // Pick a country, then take a published trip, which is the shortest path to
  // an estimate with real nights in it. The band only exists once something is
  // priced; a band over an empty trip would be an anchor set at zero.
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
  await page.waitForTimeout(800);
  await page.locator('.guide-ccard-pick').first().click();
  await page.waitForTimeout(600);
  await nextStep(page);            // Where -> Trips
  await page.waitForTimeout(2200);

  // T8.4 the star on a favourited ready-made trip.
  const cards = await page.locator('.wtrip').count();
  check('T8.4 the ready-made list renders cards', cards > 0, String(cards));
  check('T8.4 nothing is starred before anything is favourited',
    await page.locator('.wtrip-star').count() === 0);

  if (cards) {
    await page.locator('.wtrip-choose').first().click();
    await page.waitForTimeout(900);
    await nextStep(page);          // Trips -> Getting there
    await page.waitForTimeout(2000);
  }

  const band = page.locator('.guide-estimate-band');
  if (await band.count()) {
    check('T8.3 the band is closed by default',
      !(await band.evaluate((el) => el.classList.contains('open'))));
    const bandText = (await band.innerText()).replace(/\s+/g, ' ');
    check('T8.3 nothing in the band is hardcoded English left untranslated',
      /estimate so far/i.test(bandText) && /details/i.test(bandText), bandText.slice(0, 80));
    await page.locator('.guide-estimate-main').click();
    await page.waitForTimeout(500);
    check('T8.3 it opens into the breakdown',
      await page.locator('.guide-estimate-detail').isVisible());
    check('T8.3 the breakdown totals itself',
      await page.locator('.guide-estimate-total').count() === 1);
  } else {
    check('T8.3 the band appears once there is something to price', false, 'no band on step 5');
  }
  await page.screenshot({ path: 'shots/t8-desktop-estimate.png' });

  // T8.6 through to the end, where "Plan your days" has to be waiting.
  for (let i = 0; i < 4 && (await page.locator('.guide-next').count()); i += 1) {
    const label = await page.locator('.guide-next').innerText();
    if (/arrange/i.test(label)) {
      await page.locator('.guide-next').click();
      await page.waitForTimeout(3000);
      break;
    }
    if (await page.locator('.guide-next').isDisabled()) break;
    await nextStep(page);
  }
  // Arranging a trip trips the paywall (usePaywall, on the transition into the
  // planned view). It is not what this run is testing and it covers the sheet,
  // so close it before touching anything underneath.
  const pass = page.locator('.pass-overlay');
  if (await pass.count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    if (await pass.count()) {
      await pass.locator('.pass-close, [aria-label*="lose" i]').first().click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  check('T8.6 the paywall can be dismissed off the arranged trip',
    await page.locator('.pass-overlay').count() === 0);

  const planDay = page.locator('.trip-planday-btn');
  check('T8.6 the arranged trip offers "Plan your days"', await planDay.count() === 1,
    String(await planDay.count()));
  if (await planDay.count()) {
    check('T8.6 it reads as the primary next step, above Save',
      (await planDay.boundingBox()).y < (await page.locator('.trip-save-planned-btn').boundingBox()).y);
    await page.screenshot({ path: 'shots/t8-planday.png' });
    await planDay.click();
    await page.waitForTimeout(2500);
    check('T8.6 it lands in the day planner',
      await page.locator('.day-flow-screen, .day-ws').count() > 0);
  }
  await page.close();
} catch (e) {
  check('desktop pass ran to the end', false, String(e).slice(0, 160));
}

// ── The two hand-offs: a published trip into the planner, and Plan your days
try {
  const page = await openPlanner(1280, 800);
  // Straight in through the share hash the Destinations tab uses, which is the
  // same door openTripInPlanner opens.
  await page.goto(`${URL}#itin=ad-andorra-la-vella-barcelona-chain-5d`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  const useBtn = page.locator('.itin-use').first();
  if (await useBtn.isVisible().catch(() => false)) {
    await useBtn.click();
    await page.waitForTimeout(2500);
    const sheetText = (await page.locator('.trip-sheet').innerText()).replace(/\s+/g, ' ');
    check('T8.5 an undated published trip lands on the travel window',
      /when/i.test(sheetText), sheetText.slice(0, 90));
    check('T8.5 and says why it is asking',
      await page.locator('.trip-awaiting-dates').count() === 1);

    // The point of the hand-off: the published trip says the hop to Barcelona
    // is a bus, and the planner must not ask that question again.
    const draft = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('carta.tripDraft.v1') || 'null'); }
      catch { return null; }
    });
    check('T8.5 the trip keeps its stops', (draft?.stops || []).length === 2,
      String((draft?.stops || []).length));
    const modes = Object.values(draft?.legModes || {});
    check('T8.5 and the mode of every leg it published',
      modes.length > 0 && modes.every((m) => typeof m === 'string' && m),
      JSON.stringify(draft?.legModes || {}));
    await page.screenshot({ path: 'shots/t8-trip-handoff.png' });
  } else {
    check('T8.5 the trip page offers "use this trip"', false, 'no .itin-use found');
  }
  await page.close();
} catch (e) {
  check('hand-off pass ran to the end', false, String(e).slice(0, 160));
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
