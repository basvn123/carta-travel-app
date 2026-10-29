// Trip finder baseline (TF1, T792 to T796): the plan's example answers (two
// people from Brussels, 9 to 16 May, a few towns, hiking plus food and wine,
// mild, a short flight, avoid crowds, EUR 1,200 each) through the engine,
// and the four numbers the plan promises to move. TF2 (T797 to T801) prints
// the after column: the steps to a total and the share of shown trips
// priced with a flight. TF3 (T802, T803) prints its own table: trips side
// by side, the lever re-rank split, compare cells equal to the trips' own
// figures, and the Plan tab's first load from two bundle measures.
//
//   node scripts/trip_finder_baseline.mjs [--flights path/to/BRU.json] [--offline]
//     [--bundle-before m.json --bundle-after m.json] [--walk t802-walk.json]
//
// The flight file is the sweep's (data/flights/BRU.json on the data host),
// fetched unless --flights names a local copy; --offline prices with none.
// The sweep looks about six weeks ahead, so the same answers also run on
// 21 to 28 November, inside its window. Read-only: it writes nothing.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findTrips, LEVERS } from '../src/lib/recommend/rank.js';
import { compareRows, MAX_COMPARE } from '../src/lib/recommend/compare.js';
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

/** Screens from the last Help me choose answer to the first whole-trip total.
 *  Before TF2 that total waited for Finish (4 steps). Since TF2 (T797) the
 *  answer is followed by g:trips, whose loader leads straight to the priced
 *  trips: no step between the last answer and a total. */
function stepsToTotal(s) {
  const list = planScreens(s, 'guide');
  const last = list.filter((id) => id.startsWith('g:') && id !== 'g:trips').at(-1);
  const total = list.includes('g:trips') ? 'g:trips' : 'p:Finish';
  return list.indexOf(total) - list.indexOf(last) - (total === 'g:trips' ? 1 : 0);
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
  console.log(`  steps from the last answer to a total   ${stepsToTotal(s)} (TF1 before: 4; since TF2 the loader leads to the totals)`);
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

// TF3 (T802, T803): compare and levers.
const tf3 = answers('2026-11-21', '2026-11-28', []);
const tf3Input = { data, countryInsights, layerIndexes, settings: tf3, origin: BRUSSELS, flights, today: '2026-10-28' };
const listed = findTrips(tf3Input);
let cells = 0;
let equal = 0;
for (let i = 0; i + MAX_COMPARE <= listed.length; i += MAX_COMPARE) {
  const cols = listed.slice(i, i + MAX_COMPARE);
  const rows = compareRows(cols, { settings: tf3, destinations: data.destinations });
  const own = {
    total: (t) => t.total.perPerson,
    flight: (t) => t.slots.find((x) => x.id === 'flight').eur,
    stay: (t) => t.slots.find((x) => x.id === 'stay').eur,
    budget: (t) => t.budget?.delta ?? null,
  };
  for (const r of rows.filter((x) => own[x.key])) {
    r.cells.forEach((c, k) => { cells += 1; if (c.value === own[r.key](cols[k])) equal += 1; });
  }
}
// The lever re-rank alone (the build is memoised), each value of each lever.
const perLever = Object.fromEntries(Object.entries(LEVERS).map(([g, def]) => {
  const xs = [];
  for (let i = 0; i < 20; i++) {
    const v = Object.keys(def.values)[i % Object.keys(def.values).length];
    const a = performance.now();
    findTrips(tf3Input, { levers: { [g]: v } });
    xs.push(performance.now() - a);
  }
  return [g, med(xs)];
}));
const readJson = (k) => { const f = arg(k); return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const before = readJson('--bundle-before');
const after = readJson('--bundle-after');
const walk = readJson('--walk');
const tapLine = walk?.timing
  ? Object.entries(walk.timing).map(([g, v]) => `${g} ${v.median} / ${v.worst} ms`).join('; ')
  : 'run wt/t802-walk.mjs and pass --walk';
console.log(`
TF3 (T802, T803), ${listed.length} trips, any shape, 21 to 28 Nov`);
console.log(`  trips the traveller can see side by side   before 1 (one receipt at a time), after up to ${MAX_COMPARE}`);
console.log(`  lever re-rank in node, median ms           ${Object.entries(perLever).map(([g, v]) => `${g} ${v}`).join(', ')} (the build: ${med(build)} ms, memoised)`);
console.log(`  lever tap to re-ordered list (390 px, 4x)  median / worst: ${tapLine}`);
console.log(`  compare cells equal to the trip's own      ${equal} of ${cells}`);
console.log(`  Plan tab first-load JS                     ${before ? before.planTabFirstLoadJs : '?'} -> ${after ? after.planTabFirstLoadJs : '?'} bytes; preloads ${before ? before.modulepreloads : '?'} -> ${after ? after.modulepreloads : '?'}`);
