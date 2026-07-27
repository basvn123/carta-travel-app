// Headless check of the day planner overview after the UI/UX audit fixes.
//
// Three things the audit called out and this asserts:
//   1. The map filters live in ONE container, the active pill is deep slate
//      (not the alert-red terracotta), and quality filters are a collapsible
//      group rather than a second row mixed with the "my picks" view state.
//   2. Importing a Carta bot plan renders the day ONCE. Before this, the bot's
//      schedule card and the manual timeline both listed every stop.
//   3. The timeline speaks in macro phases and visit estimates, never in
//      per-stop arrival clocks, and never truncates a place name.
//
// Run from inside continent-app/:  node scripts/verify_day_overview.mjs
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

// Salzburg (SZG), the city the audit screenshots were taken in. Indices are
// stable positions in activities_full.json, which is exactly what assignments
// speak, so the plan can be seeded straight into localStorage.
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
    // An imported Carta bot plan for the same day: this is the state that used
    // to render the itinerary twice.
    localStorage.setItem(`carta.dayprefs.${planId}`, JSON.stringify({
      routeMode: 'manual',
      aiPlans: {
        '0:0': {
          summary: 'An old-town morning, the fortress at midday, gardens to finish.',
          stops: [
            ...stops.map((s, i) => ({
              id: String(s.idx),
              name: s.name,
              arrive: ['09:30', '10:14', '11:40', '14:20'][i],
              why: `Reason ${i + 1} from the Carta bot for visiting ${s.name}.`,
            })),
            {
              external: true,
              name: 'Sternbrau beer garden',
              lat: 47.7995,
              lon: 13.0421,
              why: 'A shaded courtyard for the late afternoon.',
            },
          ],
          totals: { walkKm: 4.2, endTime: '16:10' },
          appliedAt: Date.now(),
        },
      },
    }));
  }, { planId: PLAN_ID, stops: STOPS });

  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  console.log('loading app...');
  await page.goto(`${BASE}/?tab=day&o=CRL`);

  // Open the seeded plan from the day-planner landing list.
  const card = page.locator('.trip-saved-main', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  console.log('opening the seeded plan...');
  await card.click();

  // "Today's plan" is a collapsible whose BODY (the timeline) is unmounted
  // while closed, so it has to be opened before anything can be asserted.
  const planHead = page.locator('.day-plan-collapse .day-collapse-head').first();
  await planHead.waitFor({ timeout: 60000 });
  const timelineRows = page.locator('.day-timeline-row');
  if (await timelineRows.count() === 0) await planHead.click();
  await timelineRows.first().waitFor({ timeout: 30000 });
  console.log('day view open');
  await page.waitForTimeout(1500);

  console.log('\n1. Map filter toolbar');
  const card1 = page.locator('.day-map-card');
  await card1.first().waitFor({ timeout: 30000 });
  const cards = await card1.count();
  if (cards !== 1) fail(`expected 1 .day-map-card, got ${cards}`);
  else pass('filters sit in a single container');

  // The build's minifier collapses backdrop-filter to the -webkit- alias (it
  // does the same to .app-header), so both spellings have to be read.
  const blur = await card1.evaluate((el) => {
    const s = getComputedStyle(el);
    const v = [s.backdropFilter, s.webkitBackdropFilter, s.getPropertyValue('-webkit-backdrop-filter')];
    return v.find((x) => x && x !== 'none') || 'none';
  });
  if (blur === 'none') fail('container has no backdrop blur');
  else pass(`container backdrop blur: ${blur}`);

  // The active pill must be deep slate, never the terracotta used for alerts.
  const onBg = await page.locator('.day-map-chip.on').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const rgb = (onBg.match(/\d+/g) || []).map(Number);
  const reddish = rgb.length >= 3 && rgb[0] > 150 && rgb[0] - rgb[2] > 40;
  if (reddish) fail(`active filter is still alert-red: ${onBg}`);
  else pass(`active filter fill is ${onBg}`);

  // Quality filters start collapsed and are not a second always-on row.
  if (await page.locator('.day-map-quality').count() !== 0) fail('quality group is not collapsed by default');
  else pass('quality filters collapsed behind their own control');
  await page.locator('.day-map-quality-btn').click();
  const qCount = await page.locator('.day-map-quality .day-map-chip').count();
  if (qCount < 2) fail(`quality group opened with ${qCount} options`);
  else pass(`quality group opens with ${qCount} options`);
  await page.locator('.day-map-quality-btn').click();

  // The "my picks" view state lives outside the filter rows.
  const toggle = page.locator('.day-map-toggle');
  if (await toggle.count() !== 1) fail('the picks toggle is missing from its own control layer');
  else pass('picks toggle is its own control, not a rating filter');

  // The hint has real air under the card instead of being squeezed against it.
  const hintGap = await page.evaluate(() => {
    const c = document.querySelector('.day-map-card');
    const h = document.querySelector('.day-map-hint');
    if (!c || !h) return null;
    return Math.round(h.getBoundingClientRect().top - c.getBoundingClientRect().bottom);
  });
  if (hintGap == null || hintGap < 8) fail(`helper text is cramped under the card (gap ${hintGap}px)`);
  else pass(`helper text sits ${hintGap}px clear of the controls`);

  console.log('\n2. One itinerary, not two');
  const rows = await timelineRows.count();
  if (rows !== STOPS.length) fail(`expected ${STOPS.length} timeline rows, got ${rows}`);
  else pass(`${rows} timeline rows for ${STOPS.length} stops`);
  // The bot's own <ol> listing is gone; its card is a header only.
  const schedLists = await page.locator('.ai-day-panel .ai-sched').count();
  if (schedLists !== 0) fail('the bot schedule still renders its own copy of the stops');
  else pass('bot card is a header, not a second list');
  // Belt and braces: no stop name appears twice in the sidebar.
  for (const s of STOPS) {
    const n = await page.locator('.trip-sheet-scroll', { hasText: s.name })
      .locator(`text="${s.name}"`).count();
    if (n > 1) fail(`"${s.name}" is rendered ${n} times in the sidebar`);
  }
  if (!failed) pass('no stop name is duplicated in the sidebar');
  // The bot's reasons survived the merge, on the timeline rows themselves.
  const notes = await page.locator('.day-assigned-note.from-ai').count();
  if (notes !== STOPS.length) fail(`expected ${STOPS.length} bot reasons on rows, got ${notes}`);
  else pass('every row kept the bot reason that justified it');
  // Out-of-catalogue finds are listed once, outside the plan.
  const finds = await page.locator('.day-ai-find').count();
  if (finds !== 1) fail(`expected 1 bot discovery listed, got ${finds}`);
  else pass('bot discovery listed once beside its map pin');

  console.log('\n3. Macro blocks, no clock face, no truncation');
  const phases = await page.locator('.day-phase-label').allTextContents();
  if (!phases.length) fail('no macro phase headers on the timeline');
  else pass(`phase headers: ${phases.join(', ')}`);

  const timelineText = await page.locator('.day-timeline').innerText();
  const clocks = timelineText.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || [];
  if (clocks.length) fail(`timeline still shows arrival clock times: ${clocks.join(', ')}`);
  else pass('no per-stop arrival times on the timeline');

  const stays = await page.locator('.day-assigned-when').count();
  if (stays !== STOPS.length) fail(`expected ${STOPS.length} visit estimates, got ${stays}`);
  else pass('every stop carries a visit estimate instead');

  // No title is visually clipped. textContent is always the full name even
  // when CSS ellipsises it, so the check is on the layout: the title must be
  // allowed to wrap, must not clip its overflow, and its text must actually
  // fit the box it was given.
  const titles = await page.$$eval('.day-timeline-row .day-assigned-title', (els) => els.map((e) => {
    const s = getComputedStyle(e);
    return {
      text: e.textContent,
      wraps: s.whiteSpace !== 'nowrap' && s.whiteSpace !== 'pre',
      clips: s.overflow === 'hidden' || s.textOverflow === 'ellipsis',
      overflowing: e.scrollWidth > e.clientWidth + 1,
      w: e.clientWidth,
    };
  }));
  const bad = titles.filter((x) => !x.wraps || x.clips || x.overflowing);
  if (bad.length) fail(`clipped names: ${JSON.stringify(bad)}`);
  else pass(`every stop name wraps in full (widths ${titles.map((x) => x.w).join(', ')}px)`);

  await page.screenshot({ path: `${SHOTS}/day-overview-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 412, height: 900 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/day-overview-mobile.png` });

  await browser.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
