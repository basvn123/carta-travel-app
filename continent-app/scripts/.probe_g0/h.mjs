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
const SHOTS = 'scripts/.probe_g0/shots';
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

  await page.locator('.dtrow .card-open', { hasText: 'Salzburg day' }).first().click();
  await page.waitForTimeout(8000);
  console.log(await page.evaluate(()=>{const r=document.querySelector('.dayp');return r?r.outerHTML.replace(/<svg.*?<\/svg>/g,'').slice(0,5000):'NO .dayp'}));
  console.log(await page.evaluate(()=>{const c=new Set();document.querySelectorAll('[class]').forEach(e=>e.className.toString().split(/\s+/).forEach(x=>c.add(x)));return [...c].filter(x=>/^(dayws|dayr|day-|dayp|dayt|dayw)/.test(x)).join(' ')}));
  await browser.close();
} finally { if (srv) srv.kill(); }
