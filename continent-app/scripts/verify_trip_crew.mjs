// Headless check of the trip crew: the one roster of who came, shared by the
// Travel record and the expense ledger (see src/auth/tripCrew.js).
//
// verify_past_trip.mjs already covers filing a past trip end to end. This is
// only about the roster:
//   1. Two people typed into "who came" come back on the record card, joined
//      in words, with no separator glyph.
//   2. They survive a reload (the roster lives on the device).
//   3. They are stored in extras.people as { name, userId } entries, which is
//      the array the expense ledger splits a bill by.
//   4. A trip filed before the roster moved (people: [] plus a legacy
//      memory.companions) still shows its people.
//   5. Mobile width: the who-came rows fit, nothing scrolls sideways.
//
// Run from inside continent-app/:  node scripts/verify_trip_crew.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
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

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const enterApp = async (page) => {
  try {
    await page.getByRole('button', { name: 'Continue without an account' }).click({ timeout: 12000 });
  } catch { /* auth not configured in this build */ }
  for (const label of ['Explore the map', 'Open the app', 'Got it', 'START HERE']) {
    try { await page.getByRole('button', { name: label }).first().click({ timeout: 2500 }); } catch { /* not shown */ }
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

// Visited is the third segment of the panel's tab strip.
const openVisited = async (page) => {
  await page.locator('.saved-tab:visible').nth(2).click();
  await page.waitForTimeout(400);
};

// Walk the calendar back to a month in the past and click a day in it. Not
// `.outside`: the six-week grid pads with the neighbouring months' days.
const pickPastDate = async (page, which, monthsBack, day) => {
  const cell = page.locator('.pasttrip-datecell').nth(which);
  await cell.locator('.date-field-trigger').click();
  const cal = page.locator('.cal').last();
  await cal.waitFor({ timeout: 5000 });
  for (let i = 0; i < monthsBack; i += 1) {
    await cal.getByRole('button', { name: 'Previous month' }).click();
    await page.waitForTimeout(80);
  }
  await cal.locator('.cal-day:not(.outside)').filter({ hasText: new RegExp(`^${day}$`) })
    .first().click();
  await page.waitForTimeout(250);
};

/** Files a past trip: one city, dates last month, and `names` in "who came". */
const fileTripWithCrew = async (page, names) => {
  await page.locator('.saved-add-past').click();
  const form = page.locator('.pasttrip-form');
  await form.waitFor({ timeout: 8000 });

  await form.locator('.pasttrip-input').first().fill('Salzburg');
  await page.waitForTimeout(600);
  await form.locator('.pasttrip-result').filter({ hasText: 'Salzburg' }).first().click();
  await page.waitForTimeout(200);

  await pickPastDate(page, 0, 1, 8);
  await pickPastDate(page, 1, 1, 12);

  await form.locator('.pasttrip-fold-head').filter({ hasText: 'Who came' }).first().click();
  await page.waitForTimeout(200);
  for (const name of names) {
    await form.locator('.pasttrip-ghost').filter({ hasText: 'Add a name' }).click();
    await page.waitForTimeout(120);
    await form.locator('.pasttrip-fold-body .pasttrip-input').last().fill(name);
  }
  await page.waitForTimeout(200);

  const save = form.locator('.pasttrip-save');
  if (await save.isDisabled()) throw new Error('save stayed disabled with a city and past dates filled in');
  await save.click();
  await page.waitForTimeout(1200);
};

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();

  /* ---- 1 to 3: file a trip, read the roster back ---- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterApp(page);
  await openSaved(page);
  await openVisited(page);

  await fileTripWithCrew(page, ['Sofie', 'Jonas']);
  await page.screenshot({ path: `${SHOTS}/crew-record.png` });

  const cardText = async () => page.locator('.uptrip-card.is-visited').first().innerText();
  let text = await cardText();
  if (/Sofie/.test(text) && /Jonas/.test(text)) ok('both people show on the record card');
  else fail(`the card does not name who came:\n${text}`);
  if (/Sofie and Jonas/.test(text)) ok('the card line reads "Sofie and Jonas"');
  else fail(`the crew line is not conjoined in words: "${text.replace(/\n/g, ' | ')}"`);
  if (/Sofie\s*[•·–—]\s*Jonas/.test(text)) fail('the crew line uses a banned separator glyph');
  else ok('no banned separator in the crew line');

  // The memory view names them too, next to the traveller count.
  await page.locator('.saved-card-footer').first().click();
  await page.locator('.memo').waitFor({ timeout: 5000 });
  const memo = await page.locator('.memo').innerText();
  if (/Sofie and Jonas/.test(memo)) ok('the opened memory names who came');
  else fail(`the memory view does not name who came:\n${memo.slice(0, 500)}`);

  /* ---- 2: survives a reload ---- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterApp(page);
  await openSaved(page);
  await openVisited(page);
  text = await cardText();
  if (/Sofie and Jonas/.test(text)) ok('the roster survives a reload');
  else fail(`the roster did not survive a reload: "${text.replace(/\n/g, ' | ')}"`);

  /* ---- 3: stored where the ledger reads it, in the new shape ---- */
  const stored = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('carta.tripextras.'));
    if (!key) return null;
    try { return { key, people: JSON.parse(window.localStorage.getItem(key))?.people }; } catch { return null; }
  });
  if (!stored?.people) {
    fail('no carta.tripextras.* row carries a people array');
  } else {
    const names = stored.people.map((p) => p?.name);
    if (names.includes('Sofie') && names.includes('Jonas')) {
      ok('the roster is in extras.people, the array the ledger splits by');
    } else {
      fail(`extras.people does not carry the crew: ${JSON.stringify(stored.people)}`);
    }
    if (stored.people.every((p) => p && typeof p === 'object' && 'userId' in p)) {
      ok('stored as { name, userId } entries, ready to carry a linked account');
    } else {
      fail(`the roster is not in the object shape: ${JSON.stringify(stored.people)}`);
    }
  }

  /* ---- 4: a trip filed before the roster moved ---- */
  // Rewrite the trip we just filed into the old shape, so the skeleton is one
  // the app really wrote and only the part under test is fabricated.
  const rewrote = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('carta.tripextras.'));
    if (!key) return false;
    const extras = JSON.parse(window.localStorage.getItem(key));
    extras.people = [];
    extras.memory = { ...extras.memory, companions: ['Marieke', 'Tom'] };
    window.localStorage.setItem(key, JSON.stringify(extras));
    return true;
  });
  if (!rewrote) fail('could not seed the legacy shape');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterApp(page);
  await openSaved(page);
  await openVisited(page);
  const legacyText = await cardText();
  if (/Marieke and Tom/.test(legacyText)) {
    ok('a trip filed before the roster moved still shows its people');
  } else {
    fail(`legacy companions did not render: "${legacyText.replace(/\n/g, ' | ')}"`);
  }
  await page.screenshot({ path: `${SHOTS}/crew-legacy.png` });
  await ctx.close();

  /* ---- 5: mobile width ---- */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mob.newPage();
  await mpage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterApp(mpage);
  await openSaved(mpage);
  await openVisited(mpage);
  await mpage.locator('.saved-add-past').click();
  await mpage.locator('.pasttrip-form').waitFor({ timeout: 8000 });
  await mpage.locator('.pasttrip-fold-head').filter({ hasText: 'Who came' }).first().click();
  await mpage.locator('.pasttrip-ghost').filter({ hasText: 'Add a name' }).click();
  await mpage.locator('.pasttrip-fold-body .pasttrip-input').last().fill('Anna de Vries');
  await mpage.waitForTimeout(300);
  const overflow = await mpage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow <= 1) ok('no sideways scroll at 390px');
  else fail(`page scrolls sideways by ${overflow}px at 390px`);
  await mpage.screenshot({ path: `${SHOTS}/crew-mobile.png` });
  await mob.close();

  await browser.close();
  if (srv) srv.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
};

run().catch((e) => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
  if (srv) srv.kill();
});
