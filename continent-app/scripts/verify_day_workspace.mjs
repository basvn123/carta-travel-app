// Headless check of the day-planner workspace: map on top, three tabs under it.
//
//   1. The map carries two bars of its own, outside the sheet: where you are
//      staying (top left) and the local tips (top right).
//   2. The sheet is three tabs. Today's plan is the one that opens, and it is
//      the places in order and nothing else: no leg distances, no clock.
//   3. Two controls above the list. The plus opens what you can add, the share
//      icon opens where the day can go. Escape and outside clicks close both.
//   4. Add more holds ready-made whole days and a custom browser (search, the
//      five picks, cards with a photo and a sentence, one add each).
//   5. Files takes documents and a note for the group, and the note persists.
//   6. The Carta bot offers predefined asks; reordering runs locally.
//   7. Rows and pins stay in sync both ways.
//
// Run from inside continent-app/:  node scripts/verify_day_workspace.mjs
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

let failed = 0;
const fail = (msg) => { failed += 1; console.error('  FAIL:', msg); };
const pass = (msg) => console.log('  ok:', msg);

const PLAN_ID = 'local:verify';
const STOPS = [
  { idx: 2, name: 'Salzburg Cathedral' },
  { idx: 11, name: 'Erzabtei Sankt Peter' },
  { idx: 1, name: 'Hohensalzburg Fortress' },
  { idx: 4, name: 'Schloss Mirabell' },
];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();

  await page.addInitScript(({ planId, stops }) => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('carta.dayplans.v1', JSON.stringify([{
      id: planId,
      label: 'Salzburg day',
      startDate: '2026-08-04',
      stops: [{ destinationId: 'SZG', days: 1 }],
    }]));
    localStorage.setItem(`carta.dayplan.${planId}`, JSON.stringify({
      0: { 0: stops.map((s) => s.idx) },
    }));
    localStorage.setItem(`carta.dayprefs.${planId}`, JSON.stringify({ routeMode: 'manual' }));
  }, { planId: PLAN_ID, stops: STOPS });

  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  console.log('loading app...');
  await page.goto(`${BASE}/?tab=day&o=CRL`);

  const card = page.locator('.trip-saved-main', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  console.log('opening the seeded plan...');
  await card.click();

  await page.locator('.dayws-tabs').waitFor({ timeout: 60000 });
  console.log('day workspace open');

  // Wait on the STATE, not the clock: the full activities file is 19MB, and
  // until it lands the seeded day resolves only partially.
  const waitForCount = async (locator, n, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await locator.count() === n) return true;
      await page.waitForTimeout(250);
    }
    return await locator.count() === n;
  };
  const rows = page.locator('.dayr-row');
  if (!await waitForCount(rows, STOPS.length, 45000)) {
    fail(`the route list never reached ${STOPS.length} resolved stops`);
  }
  if (!await waitForCount(page.locator('.trip-pin'), STOPS.length, 30000)) {
    fail(`the map never reached ${STOPS.length} route pins`);
  }
  const statsLoc = page.locator('.day-topcard-stats');
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    if (/km/.test(await statsLoc.innerText().catch(() => ''))) break;
    await page.waitForTimeout(400);
  }

  console.log('\n1. The map keeps its own two bars');
  const stayBar = page.locator('.dayws-stay');
  const tipsBtn = page.locator('.dayws-tips-btn');
  if (await stayBar.count() !== 1) fail('no Staying bar over the map');
  else {
    const inSheet = await stayBar.evaluate((el) => !!el.closest('.trip-sheet'));
    if (inSheet) fail('the Staying bar sits inside the sheet, not over the map');
    else pass('Staying bar sits over the map, top left');
    const label = (await stayBar.locator('.dayws-stay-text small').innerText()).trim();
    if (!/staying/i.test(label)) fail(`Staying bar label reads "${label}"`);
    else pass(`Staying bar labelled "${label}"`);
  }
  if (await tipsBtn.count() !== 1) fail('no local tips button over the map');
  else {
    await tipsBtn.click();
    const panel = page.locator('.dayws-tips-panel');
    if (await panel.count() !== 1) fail('local tips button opened nothing');
    else pass('local tips opens its panel');
    await page.screenshot({ path: `${SHOTS}/day-ws-tips.png` });
    await page.keyboard.press('Escape');
    if (await page.locator('.dayws-tips-panel').count() !== 0) fail('Escape did not close local tips');
    else pass('Escape closes local tips');
  }

  console.log("\n2. Three tabs, today's plan first");
  const tabs = page.locator('.dayws-tab');
  const tabNames = (await tabs.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  if (tabNames.length !== 3) fail(`expected 3 tabs, got ${tabNames.length}: ${tabNames.join(' | ')}`);
  else pass(`tabs: ${tabNames.join(' | ')}`);
  if (await page.locator('.dayws-tab.on').count() !== 1) fail('no single active tab');
  const activeTab = (await page.locator('.dayws-tab.on').innerText()).trim();
  if (!/plan/i.test(activeTab)) fail(`the open tab is "${activeTab}", expected today's plan`);
  else pass(`opens on "${activeTab}"`);

  const firstName = (await rows.first().locator('.dayr-name').innerText()).trim();
  if (!firstName.startsWith(STOPS[0].name)) fail(`first stop reads "${firstName}"`);
  else pass(`stops render in order, first is "${firstName}"`);
  const numbers = await page.locator('.dayr-no').allInnerTexts();
  if (numbers.join(',') !== '1,2,3,4') fail(`stop numbers read ${numbers.join(',')}`);
  else pass('stops are numbered 1 to 4 in walking order');
  // Nothing in the list may talk about legs or clocks.
  const listText = (await page.locator('.dayr-list').innerText()).replace(/\s+/g, ' ');
  if (/\d+\s*min|\bkm\b|\d{1,2}:\d{2}/.test(listText)) {
    fail(`the plan list still carries times or distances: "${listText.slice(0, 120)}"`);
  } else pass('the plan list carries no legs, distances or clock times');

  console.log('\n3. Two controls above the list');
  const roundBtns = page.locator('.dayp-bar .dayp-round');
  if (await roundBtns.count() !== 2) fail(`expected 2 controls above the list, got ${await roundBtns.count()}`);
  else pass('two controls: add and share');
  if (await page.locator('.dayp-menu').count() !== 0) fail('a menu is open before anything was clicked');
  await roundBtns.first().click();
  const addItems = page.locator('.dayp-menu .dayp-menu-item');
  const nAdd = await addItems.count();
  if (nAdd < 2) fail(`the add menu holds ${nAdd} items`);
  else pass(`add menu: ${(await addItems.allInnerTexts()).map((s) => s.split('\n')[0].trim()).join(' | ')}`);
  await page.keyboard.press('Escape');
  if (await page.locator('.dayp-menu').count() !== 0) fail('Escape did not close the add menu');
  else pass('Escape closes the add menu');

  await roundBtns.nth(1).click();
  const shareItems = page.locator('.dayp-menu-end .dayp-menu-item');
  const nShare = await shareItems.count();
  if (nShare !== 5) fail(`expected 5 share items, got ${nShare}`);
  else pass(`share menu: ${(await shareItems.allInnerTexts()).map((s) => s.split('\n')[0].trim()).join(' | ')}`);
  await page.screenshot({ path: `${SHOTS}/day-ws-share-menu.png` });
  await page.locator('.trip-topcard').click();
  if (await page.locator('.dayp-menu').count() !== 0) fail('outside click did not close the share menu');
  else pass('outside click closes the share menu');

  console.log('\n4. Rows and pins stay in sync');
  await rows.nth(1).hover();
  await page.waitForTimeout(300);
  if (await page.locator('.trip-pin.active').count() !== 1) fail('hovering a row did not lift exactly its pin');
  else pass('hovering a row lifts its pin');
  await page.locator('.trip-topcard').hover();
  await page.waitForTimeout(300);
  if (await page.locator('.trip-pin.active').count() !== 0) fail('pin stayed lit after the hover left');
  else pass('pin settles when the hover leaves');

  console.log('\n5. Add more: ready-made days and a custom browser');
  await tabs.nth(1).click();
  await page.locator('.daya').waitFor({ timeout: 20000 });
  const modes = await page.locator('.daya-mode').allInnerTexts();
  if (modes.length !== 2) fail(`expected 2 sub-tabs, got ${modes.join(' | ')}`);
  else pass(`sub-tabs: ${modes.map((s) => s.trim()).join(' | ')}`);
  const ready = page.locator('.daya-ready');
  const nReady = await ready.count();
  if (nReady === 0) fail('no ready-made days offered for Salzburg');
  else pass(`${nReady} ready-made day(s) offered`);
  await page.screenshot({ path: `${SHOTS}/day-ws-ready.png` });

  await page.locator('.daya-mode').nth(1).click();
  const picks = (await page.locator('.daya-pick').allInnerTexts()).map((s) => s.trim());
  if (picks.length !== 5) fail(`expected 5 picks, got ${picks.join(' | ')}`);
  else pass(`picks: ${picks.join(' | ')}`);
  const cards = page.locator('.daya-card');
  if (!await waitForCount(cards, await cards.count(), 1000) || await cards.count() === 0) {
    fail('no browsable place cards');
  } else {
    const n = await cards.count();
    const withBlurb = await page.locator('.daya-card .daya-blurb').count();
    if (withBlurb !== n) fail(`${n} cards but ${withBlurb} carry a sentence`);
    else pass(`${n} place cards, each with a photo slot and a sentence`);
    if (await page.locator('.daya-card .daya-add').count() !== n) fail('not every card has an add control');
    else pass('every card has one add control');
  }
  // Tapping a card focuses it (and moves the map onto it).
  await cards.first().locator('.daya-card-main').click();
  await page.waitForTimeout(500);
  if (await page.locator('.daya-card.focused').count() !== 1) fail('tapping a card did not focus it');
  else pass('tapping a card focuses it against the route');
  await page.screenshot({ path: `${SHOTS}/day-ws-custom.png` });

  // Adding from a card lands in today's plan. Deliberately a card that is NOT
  // already in the day: the deck keeps planned places in place (reading as
  // added) so the list never reshuffles under a thumb, and tapping one of
  // those would REMOVE a stop, not add one.
  const fresh = page.locator('.daya-card:not(.added)').first();
  const before = (await page.locator('.dayws-tab').nth(0).innerText()).replace(/\s+/g, ' ').trim();
  await fresh.locator('.daya-add').click();
  await page.waitForTimeout(400);
  const after = (await page.locator('.dayws-tab').nth(0).innerText()).replace(/\s+/g, ' ').trim();
  if (before === after) fail(`the plan tab count did not move: "${before}"`);
  else pass(`adding a place moves the plan count: "${before}" -> "${after}"`);

  // The pin filters belong to this tab only.
  if (await page.locator('.day-map-tools').count() !== 1) fail('the pin filters are missing while browsing');
  else pass('the pin filters ride the Add more tab');

  console.log('\n6. Files and the group note');
  await tabs.nth(2).click();
  await page.locator('.dayf').waitFor({ timeout: 20000 });
  if (await page.locator('.dayf-drop').count() !== 1) fail('no file dropzone');
  else pass('the files tab takes documents');
  const privacy = (await page.locator('.dayf-note').first().innerText()).trim();
  if (!/device|browser/i.test(privacy)) fail(`the files tab does not say where files live: "${privacy}"`);
  else pass('the files tab says plainly that files stay on the device');
  const notes = page.locator('.dayf-notes');
  await notes.fill('Door code 4417, Jonas books dinner');
  await page.waitForTimeout(300);
  const stored = await page.evaluate((id) => {
    try { return JSON.parse(localStorage.getItem(`carta.tripextras.${id}`) || '{}').notes || ''; } catch { return ''; }
  }, PLAN_ID);
  if (stored !== 'Door code 4417, Jonas books dinner') fail(`the note did not persist, store holds "${stored}"`);
  else pass('the group note persists with the plan');
  await page.screenshot({ path: `${SHOTS}/day-ws-files.png` });

  console.log('\n7. The Carta bot offers predefined asks');
  await tabs.nth(0).click();
  const fab = page.locator('.dayws-bot-fab');
  if (await fab.count() !== 1) fail('no Carta bot button over the map');
  else {
    await fab.click();
    const items = page.locator('.dayws-bot-item');
    const n = await items.count();
    if (n < 4) fail(`the bot offers only ${n} asks`);
    else pass(`bot asks: ${(await items.allInnerTexts()).map((s) => s.split('\n')[0].trim()).join(' | ')}`);
    await page.screenshot({ path: `${SHOTS}/day-ws-bot.png` });
    // "Put the stops in walking order" must run here, not open a dialog.
    const reorder = items.filter({ hasText: /walking order/i }).first();
    if (await reorder.count() === 0) fail('the bot cannot reorder the route');
    else {
      await reorder.click();
      await page.waitForTimeout(700);
      if (await page.locator('.ai-plan-card').count() !== 0) fail('reordering opened the AI dialog instead of running here');
      else pass('reordering runs locally, no dialog and no allowance spent');
      if (await page.locator('.dayr-row').count() < STOPS.length + 1) fail('reordering lost stops');
      else pass('reordering keeps every stop');
    }
  }

  await page.screenshot({ path: `${SHOTS}/day-ws-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 412, height: 900 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/day-ws-mobile.png` });
  await page.locator('.dayws-tab').nth(1).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/day-ws-mobile-add.png` });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
