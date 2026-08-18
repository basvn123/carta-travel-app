// Headless check of "Add a past trip" in the Saved-trips panel: a trip that
// already happened is typed in and must come back as an ordinary record card,
// with the map, the ledger and the flags it would have had if Carta had
// planned it.
//   1. Guest device: the record is empty, the form fills in, the saved trip
//      appears as a visited card with its dates, and the ledger counts it.
//   2. The card survives a reload (it lives on the device, not in state).
//   3. Mobile width: the form fits, no sideways scroll.
// Run from inside continent-app/:  node scripts/verify_past_trip.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const enterApp = async (page) => {
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 });
  } catch { /* auth not configured in this build */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 3000 }); } catch { /* not shown */ }
  }
  await page.waitForTimeout(600);
};

const openSaved = async (page) => {
  const btn = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^(Saved trips|My trips)$/ }).locator('visible=true').first();
  await btn.waitFor({ timeout: 25000 });
  await btn.click();
  await page.locator('.saved-trips-panel').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
};

const openVisited = async (page) => {
  await page.locator('.saved-tabs button').nth(2).click();
  await page.waitForTimeout(400);
};

// Walk the calendar back to a month in the past and click a day in it.
const pickPastDate = async (page, which, monthsBack, day) => {
  const cell = page.locator('.pasttrip-datecell').nth(which);
  await cell.locator('.date-field-trigger').click();
  const cal = page.locator('.cal').last();
  await cal.waitFor({ timeout: 5000 });
  for (let i = 0; i < monthsBack; i += 1) {
    await cal.getByRole('button', { name: 'Previous month' }).click();
    await page.waitForTimeout(80);
  }
  // Not `.outside`: the six-week grid pads with the neighbouring months' days,
  // so a plain "3" can belong to the month before the one on show.
  await cal.locator('.cal-day:not(.outside)').filter({ hasText: new RegExp(`^${day}$`) })
    .first().click();
  await page.waitForTimeout(250);
};

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();

  // ── 1. Guest device: log a past trip and read it back ──
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterApp(page);
  await openSaved(page);
  await openVisited(page);

  const addBtn = page.locator('.saved-add-past');
  if (!await addBtn.count()) fail('no "Add a past trip" button on the Visited tab');
  await addBtn.click();
  const form = page.locator('.pasttrip-form');
  await form.waitFor({ timeout: 5000 });
  ok('form opens from the record heading');

  // Two cities, typed and picked out of the catalogue.
  for (const city of ['Salzburg', 'Munich']) {
    await form.locator('.pasttrip-input').first().fill(city);
    await page.waitForTimeout(300);
    const hit = form.locator('.pasttrip-result').filter({ hasText: city }).first();
    if (!await hit.count()) { fail(`no catalogue match for ${city}`); continue; }
    await hit.click();
    await page.waitForTimeout(150);
  }
  const chips = await form.locator('.pasttrip-place-name').allInnerTexts();
  if (chips.length !== 2) fail(`expected 2 city chips, got ${chips.length}: ${chips.join(', ')}`);
  else ok(`cities picked: ${chips.join(', ')}`);

  // A window that ended before today: last month, the 3rd to the 7th.
  await pickPastDate(page, 0, 1, 3);
  await pickPastDate(page, 1, 1, 7);
  const note = await form.locator('.pasttrip-note').last().innerText().catch(() => '');
  if (!/night/i.test(note)) fail(`no nights read-out after picking dates (saw "${note}")`);
  else ok(`dates read back as "${note}"`);

  // ── Everything a trip is, past where and when ──
  const openFold = async (title) => {
    await form.locator('.pasttrip-fold-head').filter({ hasText: title }).first().click();
    await page.waitForTimeout(150);
  };

  // Nights: move one off the first city, the trip's own length must not change.
  const nightsBefore = await form.locator('.pasttrip-stepper-val').allInnerTexts();
  await form.locator('.pasttrip-place').first().locator('.pasttrip-stepper button').first().click();
  const nightsAfter = await form.locator('.pasttrip-stepper-val').allInnerTexts();
  const sum = (l) => l.reduce((n, v) => n + Number(v), 0);
  if (sum(nightsBefore) !== sum(nightsAfter) || nightsBefore[0] === nightsAfter[0]) {
    fail(`nights stepper did not move a night between cities: ${nightsBefore} -> ${nightsAfter}`);
  } else ok(`nights per city: ${nightsAfter.join(' + ')}`);

  await openFold('Who came');
  await form.locator('.pasttrip-fold-body .pasttrip-stepper').first().locator('button').last().click();
  await form.locator('.pasttrip-ghost').filter({ hasText: 'Add a name' }).click();
  await form.locator('.pasttrip-fold-body .pasttrip-input').last().fill('Anna');

  await openFold('How you travelled');
  await form.locator('.pasttrip-mode').first().click(); // by air to the first city

  await openFold('Where you slept');
  await form.locator('.pasttrip-fold-body .pasttrip-input').first().fill('Hotel Elefant');
  await form.locator('.pasttrip-select').first().selectOption('hotel');

  await openFold('What it cost');
  const amounts = form.locator('.pasttrip-input.is-amount');
  await amounts.nth(0).fill('180');
  await amounts.nth(1).fill('320');
  await amounts.nth(2).fill('140');
  const total = await form.locator('.pasttrip-total b').innerText();
  if (!/640/.test(total)) fail(`spend total should be 640, read "${total}"`);
  else ok(`spend totals to ${total}`);

  await openFold('How it was');
  await form.locator('.pasttrip-rate').nth(7).click(); // 8/10
  await form.locator('.pasttrip-textarea').fill('Rain every afternoon, and the best schnitzel of my life.');
  const hlRow = form.locator('.pasttrip-listrow').last();
  await hlRow.locator('input').fill('The fortress at dusk');
  await hlRow.locator('button').click();
  if (await form.locator('.pasttrip-fold-body input[value="The fortress at dusk"]').count() !== 1) {
    fail('the highlight did not land in the list');
  } else ok('highlights, rating and story taken');

  await openFold('Photographs');
  await form.locator('.pasttrip-file').setInputFiles('scripts/fixtures/past_trip_photo.png');
  await page.waitForTimeout(400);
  if (await form.locator('.pasttrip-photo img').count() !== 1) fail('the photo did not attach');
  else {
    const src = await form.locator('.pasttrip-photo img').first().getAttribute('src');
    if (!/^data:image\/jpeg/.test(src || '')) fail('the photo was not downscaled to a jpeg data url');
    else ok('a photo attaches, downscaled, and becomes the cover');
  }

  // Anywhere off the catalogue is offered, without calling the geocoder here.
  await form.locator('.pasttrip-input').first().fill('Lokeren');
  await page.waitForTimeout(300);
  if (!await form.locator('.pasttrip-ghost').filter({ hasText: 'Lokeren' }).count()) {
    fail('no way to add a place the catalogue does not hold');
  } else ok('a place off the catalogue can be looked up');
  await form.locator('.pasttrip-input').first().fill('');

  const save = form.locator('.pasttrip-save');
  if (await save.isDisabled()) fail('save stays disabled with cities and past dates filled in');
  await page.screenshot({ path: `${SHOTS}/past_trip_form.png`, fullPage: false });
  await save.click();
  await page.waitForTimeout(900);

  if (await page.locator('.pasttrip-form').count()) fail('form stayed open after saving');
  const cards = page.locator('.uptrip-card.is-visited');
  if (await cards.count() !== 1) fail(`expected 1 visited card, got ${await cards.count()}`);
  else {
    const text = await cards.first().innerText();
    if (!/Salzburg/.test(text)) fail(`saved card does not name its cities: ${text}`);
    if (!/Visited/.test(text)) fail(`saved card is not marked visited: ${text}`);
    else ok(`card reads: ${text.replace(/\n/g, ' | ')}`);
  }
  const cardPhoto = await page.locator('.uptrip-photo').first().getAttribute('style');
  if (!/data:image\/jpeg/.test(cardPhoto || '')) fail('the card did not take your own photo as its cover');
  else ok('the card wears your photograph');

  const ledger = await page.locator('.ledger2').innerText().catch(() => '');
  if (!/Austria|Germany/.test(ledger)) fail(`ledger did not count the trip: ${ledger}`);
  else ok('ledger counts the logged trip');
  if (!await page.locator('.saved-map').count()) fail('no record map after logging a trip');
  else ok('record map is there');

  // ── The card carries what was entered, and opens the trip back up ──
  const footer = page.locator('.saved-card-footer').first();
  const footerText = await footer.innerText().catch(() => '');
  if (!/8\/10/.test(footerText) || !/640/.test(footerText)) {
    fail(`card footer does not summarise the memory: "${footerText}"`);
  } else ok(`card footer reads: ${footerText.replace(/\n/g, ' ')}`);
  await footer.click();
  await page.locator('.memo').waitFor({ timeout: 5000 });
  const memo = await page.locator('.memo').innerText();
  for (const [what, re] of [
    ['the story', /schnitzel/i],
    ['the highlight', /fortress at dusk/i],
    ['the rating', /\b8\b/],
    ['who came', /travellers|Anna/i],
    ['where you slept', /Hotel Elefant/],
    ['the receipt', /Total/i],
  ]) {
    if (!re.test(memo)) fail(`the memory view is missing ${what}`);
  }
  ok('the memory view reads back everything entered');
  // The panel is its own scroll container, so bring the memory into frame
  // before the shot rather than relying on the page scroll.
  await page.locator('.memo').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/past_trip_memory.png` });

  // ── Editing it keeps the same trip ──
  await page.locator('.memo-edit').click();
  await page.locator('.pasttrip-form').waitFor({ timeout: 5000 });
  const editForm = page.locator('.pasttrip-form');
  if (await editForm.locator('.pasttrip-place').count() !== 2) fail('edit did not prefill the cities');
  await editForm.locator('.pasttrip-input.is-plain').first().fill('Alpine summer');
  await editForm.locator('.pasttrip-save').click();
  await page.waitForTimeout(800);
  if (await page.locator('.uptrip-card.is-visited').count() !== 1) {
    fail('editing a logged trip made a second one');
  } else {
    const renamed = await page.locator('.uptrip-card.is-visited').first().innerText();
    if (!/Alpine summer/.test(renamed)) fail(`the rename did not stick: ${renamed}`);
    else ok('editing rewrites the same trip');
  }
  await page.screenshot({ path: `${SHOTS}/past_trip_record.png`, fullPage: true });

  // ── 2. It survives a reload ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterApp(page);
  await openSaved(page);
  await openVisited(page);
  if (await page.locator('.uptrip-card.is-visited').count() !== 1) {
    fail('the logged trip did not survive a reload');
  } else ok('the logged trip survives a reload');
  await ctx.close();

  // ── 3. Phone width ──
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mctx.newPage();
  mpage.on('pageerror', (e) => fail(`page error (mobile): ${e.message}`));
  await mpage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterApp(mpage);
  await openSaved(mpage);
  await openVisited(mpage);
  await mpage.locator('.saved-add-past').click();
  await mpage.locator('.pasttrip-form').waitFor({ timeout: 5000 });
  await mpage.waitForTimeout(300);
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail(`sideways scroll of ${overflow}px with the form open`);
  else ok('no sideways scroll on a phone');
  await mpage.screenshot({ path: `${SHOTS}/past_trip_form_mobile.png`, fullPage: false });
  await mctx.close();

  // ── 4. The account shape, through the ?savedmock seam: a logged trip is a
  //      trip plan there, and must render as one more record card. ──
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const apage = await actx.newPage();
  apage.on('pageerror', (e) => fail(`page error (mock): ${e.message}`));
  await apage.goto(`${BASE}/?savedmock`, { waitUntil: 'domcontentloaded' });
  await enterApp(apage);
  await openSaved(apage);
  await openVisited(apage);
  const before = await apage.locator('.uptrip-card.is-visited').count();
  await apage.locator('.saved-add-past').click();
  const mform = apage.locator('.pasttrip-form');
  await mform.waitFor({ timeout: 5000 });
  await mform.locator('.pasttrip-input').first().fill('Porto');
  await apage.waitForTimeout(300);
  await mform.locator('.pasttrip-result').filter({ hasText: 'Porto' }).first().click();
  await pickPastDate(apage, 0, 2, 4);
  await pickPastDate(apage, 1, 2, 9);
  await mform.locator('.pasttrip-save').click();
  await apage.waitForTimeout(700);
  const after = await apage.locator('.uptrip-card.is-visited').count();
  if (after !== before + 1) fail(`mock account path: ${before} cards became ${after}`);
  else {
    // The record is sorted by end date, so the logged trip sits wherever its
    // dates put it, not necessarily on top.
    const card = apage.locator('.uptrip-card.is-visited').filter({ hasText: 'Portugal' }).first();
    if (!await card.count()) fail('logged account trip is not named after its country');
    else ok(`account-shaped card reads: ${(await card.innerText()).replace(/\n/g, ' | ')}`);
  }
  await apage.screenshot({ path: `${SHOTS}/past_trip_account.png`, fullPage: true });
  await actx.close();

  await browser.close();
  if (srv) srv.kill();
  console.log(process.exitCode ? 'verify_past_trip: FAILED' : 'verify_past_trip: PASS');
};

run().catch((e) => { console.error(e); process.exit(1); });
