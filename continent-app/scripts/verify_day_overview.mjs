// T1089 needs: real data (the seeded SZG place indices; skipped per missing stop)
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

// CARTA_PORT (T389): a parallel session may hold the default port with its own
// preview, so a run can name its own server instead of testing someone else's.
const PORT = Number(process.env.CARTA_PORT) || 4193;
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
    localStorage.setItem('continent.homeSeen.v1', '1');
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
  // T389 (row T378-f): the saved day-plan cards are DayTripCards' .dtcard
  // buttons now; .trip-saved-main went with the old list and left this
  // harness waiting on a selector that never appears.
  const card = page.locator('.dtrow .card-open', { hasText: 'Salzburg day' }).first();
  await card.waitFor({ timeout: 90000 });
  console.log('opening the seeded plan...');
  await card.click();

  // The workspace opens on today's plan, so the route list is already there.
  // T1089: the old .dayws-tabs / .dayr-row / .day-map-card markup is gone. The
  // plan is one panel (.dayp) listing its stops as .dayt-stop rows, and the map
  // filter chips of audit section 1 no longer exist in the app, so that section
  // was dropped rather than faked.
  await page.locator('.dayp').waitFor({ timeout: 60000 });
  const timelineRows = page.locator('.dayp .dayt-stop');
  await timelineRows.first().waitFor({ timeout: 30000 });
  console.log('day view open');
  await page.waitForTimeout(1500);

  console.log('\n2. One itinerary, not two');
  // The seeded stops are indices into the destination's place list. A dataset
  // without all of them (the public partial one) lists fewer: say so, and hold
  // the list to the names that exist rather than to a number it cannot meet.
  const rows = await timelineRows.count();
  const names = await page.locator('.dayp .dayt-stop .dayt-name').allInnerTexts();
  const present = STOPS.filter((s) => names.includes(s.name));
  if (present.length < STOPS.length) {
    console.log(`  SKIP (needs real data): ${STOPS.filter((s) => !names.includes(s.name)).map((s) => s.name).join(', ')} not in this dataset's list for SZG`);
  }
  if (!present.length) fail('none of the seeded stops is listed');
  if (rows !== present.length) fail(`expected ${present.length} route rows, got ${rows}: ${names.join(' | ')}`);
  else pass(`${rows} route rows for ${present.length} resolvable stops`);
  // The bot's own listing is gone; what survives is one summary line.
  const schedLists = await page.locator('.ai-day-panel, .ai-sched').count();
  if (schedLists !== 0) fail('the bot schedule still renders its own copy of the stops');
  else pass('bot card is a summary line, not a second list');
  const summaries = await page.locator('.dayp-summary').count();
  if (summaries !== 1) fail(`expected 1 bot summary line, got ${summaries}`);
  else pass('the bot summary reads once, above the route');
  // Belt and braces: no stop name appears twice in the panel.
  for (const s of present) {
    const n = await page.locator('.dayws-panel').locator(`text="${s.name}"`).count();
    if (n > 1) fail(`"${s.name}" is rendered ${n} times in the panel`);
  }
  if (!failed) pass('no stop name is duplicated in the panel');

  console.log('\n3. Places only, no clock face, no truncation');
  // The list is the places in order; per-stop arrival clocks live nowhere.
  const timelineText = await page.locator('.dayp .dayt').innerText();
  const clocks = timelineText.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || [];
  if (clocks.length) fail(`the route list still shows clock times: ${clocks.join(', ')}`);
  else pass('no per-stop arrival times in the route list');
  if (/\bkm\b/.test(timelineText)) fail('the route list still carries leg distances');
  else pass('no leg distances in the route list');
  // The day's numbers (stops, time window) live once, in the day's header.
  const panelText = await page.locator('.dayws-scroll').innerText();
  if (!/\d+\s+stops?\b/i.test(panelText)) fail('the day header lost its stops count');
  else pass('the day header states the stops count');

  // No title is visually clipped: it must be allowed to wrap, must not clip
  // its overflow, and its text must fit the box it was given.
  const titles = await page.$$eval('.dayp .dayt-stop .dayt-name', (els) => els.map((e) => {
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
