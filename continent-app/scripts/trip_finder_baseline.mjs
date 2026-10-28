// Trip finder baseline (TF1, T792 to T796): the plan's example answers (two
// people from Brussels, 9 to 16 May, a few towns, hiking plus food and wine,
// mild, a short flight, avoid crowds, EUR 1,200 each) through the engine,
// and the four numbers the plan promises to move.
//
//   node scripts/trip_finder_baseline.mjs [--flights path/to/BRU.json] [--offline]
//
// The flight file is the sweep's (data/flights/BRU.json on the data host),
// fetched unless --flights names a local copy; --offline prices with none.
// The sweep looks about six weeks ahead, so the same answers also run on
// 21 to 28 November, inside its window. Read-only: it writes nothing.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findTrips } from '../src/lib/recommend/rank.js';
import { buildTrips } from '../src/lib/recommend/trips.js';
import { normalizeSettings } from '../src/planner/flow/tripSettings.js';
import { planScreens, GUIDE } from '../src/planner/flow/flowGraph.js';
import { flightFileUrl } from '../src/lib/flights/flightData.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = (p) => JSON.parse(readFileSync(join(here, '..', 'public', p), 'utf8'));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

async function flightsFile() {
  if (process.argv.includes('--offline')) return null;
  const local = arg('--flights');
  if (local && existsSync(local)) return JSON.parse(readFileSync(local, 'utf8'));
  try {
    const r = await fetch(flightFileUrl('BRU'));
    return r.ok ? r.json() : null;
  } catch { return null; }
}

const data = pub('app_data.json');
const layerIndexes = {
  trails: pub('trails/index.json'), beaches: pub('beaches/index.json'), lakes: pub('lakes/index.json'),
  mountains: pub('mountains/index.json'), cycling: pub('cycling/index.json'),
};
const countryInsights = pub('country_insights.json').countries;
const flights = await flightsFile();
const BRUSSELS = { iata: 'BRU', lat: 50.85, lon: 4.35, name: 'Brussels' };

const answers = (start, end, shapes = ['towns']) => normalizeSettings({
  answered: ['who', 'when', ...GUIDE],
  party: { kind: 'couple', adults: 2 },
  priority: 'balance',
  when: { mode: 'exact', start, end, nights: 7 },
  guide: { shapes, likes: ['hiking', 'food'], weather: 'mild', reach: 'short', avoid: ['crowds'], budget: { kind: 'total', eur: 1200 } },
});

/** Screens from the last Help me choose answer to the first whole-trip total (Finish). */
function stepsToTotal(s) {
  const list = planScreens(s, 'guide');
  const last = list.filter((id) => id.startsWith('g:')).at(-1);
  return list.indexOf('p:Finish') - list.indexOf(last);
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

function measure(label, s) {
  const input = { data, countryInsights, layerIndexes, settings: s, origin: BRUSSELS, flights, today: new Date().toISOString().slice(0, 10) };
  const trips = findTrips(input);
  const withFlight = trips.filter((t) => t.slots.find((x) => x.id === 'flight')?.eur != null).length;
  const top = trips.slice(0, 6);
  const inside = top.filter((t) => t.budget && t.budget.delta <= 0).length;
  console.log(`\n${label}`);
  console.log(`  trips                                   ${trips.length}`);
  console.log(`  steps from the last answer to a total   ${stepsToTotal(s)} (the screens are wired in TF2)`);
  console.log(`  results whose price includes a flight   ${pct(withFlight, trips.length)} (${withFlight} of ${trips.length})`);
  console.log(`  top 6 inside the EUR 1,200 budget       ${pct(inside, top.length)} (${inside} of ${top.length})`);
  for (const t of top) {
    const names = t.places.map((p) => data.destinations[p.id]?.city).join(' + ');
    const fl = t.slots.find((x) => x.id === 'flight');
    console.log(`    ${t.country.padEnd(16)} ${names.padEnd(42)} ${String(t.total.perPerson).padStart(5)} a person, flight ${fl.eur ?? 'not yet'}, match ${t.match?.pct ?? '-'}`);
  }
}

console.log(`flight file: ${flights ? `BRU, checked ${flights.checked}` : 'none'}`);
console.log('before (today\'s results): country cards priced a person a day for bed and food; 0% carry a flight; the budget ranks nothing');
measure('example answers, 9 to 16 May 2027', answers('2027-05-09', '2027-05-16'));
measure('the same answers, 21 to 28 Nov 2026 (inside the sweep)', answers('2026-11-21', '2026-11-28'));

// Time to build and rank 24 trips: any shape gives eight countries times three.
const s24 = answers('2026-11-21', '2026-11-28', []);
const base = { data, countryInsights, layerIndexes, settings: s24, origin: BRUSSELS, flights, today: '2026-10-28' };
findTrips(base);
const build = [];
const rank = [];
let n = 0;
for (let i = 0; i < 7; i++) {
  const inp = { ...base, data: { ...data } };
  let a = performance.now();
  const trips = buildTrips(inp);
  build.push(performance.now() - a);
  a = performance.now();
  findTrips(inp, { levers: { food: i % 2 ? 'cook' : 'out' } });
  rank.push(performance.now() - a);
  n = trips.length;
}
const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)].toFixed(1);
console.log(`\ntime, ${n} trips, after warm-up: build (memo miss) ${med(build)} ms median; re-rank with a lever ${med(rank)} ms median`);
