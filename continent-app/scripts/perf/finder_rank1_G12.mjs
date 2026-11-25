// G12 lane L0 (plan rethink): how long the trip finder takes until its
// rank 1 is stable, with the real candidate count, so the 4 s minimum
// loader (planner/finder/FindingTrips.jsx MIN_STAND_MS) is kept or cut on
// numbers rather than taste.
//
//   node scripts/perf/finder_rank1_G12.mjs [path/to/app_data.json] [cpuFactor]
//
// It runs the same steps as useTripFinder (finderHooks.js): price every
// candidate in 32 ms slices (priceSlices.js), rank what is priced after each
// slice, then rank the whole list. "Stable rank 1" is the first slice after
// which the partial rank 1 never changes again and equals the final one.
// Node on a desktop CPU is faster than a phone: the cpuFactor (default 4,
// the DevTools "mid-tier mobile" throttle this repo's perf harnesses use)
// scales the measured times into a phone estimate. The estimate is not a
// phone measurement.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCandidates } from '../../src/lib/recommend/candidates.js';
import { answerKey, priceCandidate } from '../../src/lib/recommend/trips.js';
import { rankTrips } from '../../src/lib/recommend/rank.js';
import { normalizeSettings } from '../../src/planner/flow/tripSettings.js';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataPath = process.argv[2] || path.join(APP, 'public', 'app_data.json');
const cpu = Number(process.argv[3] || 4);
if (!existsSync(dataPath)) {
  console.error(`No catalogue at ${dataPath}; pass the path to app_data.json.`);
  process.exit(1);
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const PUB = path.dirname(dataPath);
const insightsPath = path.join(PUB, 'country_insights.json');
const rawInsights = existsSync(insightsPath) ? JSON.parse(readFileSync(insightsPath, 'utf8')) : null;
const countryInsights = rawInsights?.countries || rawInsights || {};

// The five layer indexes as the app's loaders resolve them (the raw files,
// as tests/countryMatch.test.mjs reads them), so the finder sees the same
// layer reasons.
const readPub = (p) => (existsSync(path.join(PUB, p)) ? JSON.parse(readFileSync(path.join(PUB, p), 'utf8')) : null);
const layerIndexes = Object.fromEntries(['trails', 'beaches', 'lakes', 'mountains', 'cycling'].map((k) => [k, readPub(`${k}/index.json`)]));

// The swept BRU file the tests use, made fresh so its fares count as live.
const flights = JSON.parse(readFileSync(path.join(APP, 'tests', 'fixtures', 'tf1-flights-BRU.json'), 'utf8'));
const at = Math.floor(Date.now() / 60000) - 30;
for (const side of [flights.to, flights.back]) for (const days of Object.values(side)) for (const v of Object.values(days)) if (Array.isArray(v)) v[5] = at;
flights.checked = at;
flights.from = 'BRU';
const origin = { iata: 'BRU', lat: 50.85, lon: 4.35, name: 'Brussels' };
const today = new Date().toISOString().slice(0, 10);

const CASES = {
  'open, couple, food, months': { party: { kind: 'couple', adults: 2 }, when: { mode: 'months', months: [5], nights: 7 }, guide: { likes: ['food'] } },
  'open, family, beach+nature, any': { party: { kind: 'family', adults: 2, kids: 2, kidAges: [6, 9] }, when: { mode: 'any', nights: 7 }, guide: { likes: ['beach', 'nature'] } },
  'open, solo, culture, exact': { party: { kind: 'solo', adults: 1 }, when: { mode: 'exact', start: '2027-04-10', end: '2027-04-15', nights: 5 }, guide: { likes: ['culture'] } },
  'train way, couple': { party: { kind: 'couple', adults: 2 }, way: 'train', when: { mode: 'months', months: [6], nights: 7 }, guide: { likes: ['nature'] } },
};
const SLICE_MS = 32;
const now = () => performance.now();

function run(name, raw) {
  const settings = normalizeSettings({ answered: ['who', 'when', 'from'], ...raw });
  const input = { data, countryInsights, layerIndexes, settings, taste: null, origin, flights, lifestyle: null, stayTier: null, today };
  answerKey(input);
  const t0 = now();
  const candidates = buildCandidates(input);
  const tCand = now() - t0;
  const priced = [];
  const slices = [];
  let start = now();
  let pricingMs = 0;
  for (let i = 0; i < candidates.length; i++) {
    const a = now();
    priced.push(priceCandidate(candidates[i], input));
    pricingMs += now() - a;
    if (i < candidates.length - 1 && now() - start > SLICE_MS) {
      const r = now();
      const top = rankTrips(priced.slice(), { settings, data })[0]?.id || null;
      const rankMs = now() - r;
      slices.push({ n: priced.length, at: now() - t0, top, rankMs });
      start = now();
    }
  }
  const r = now();
  const final = rankTrips(priced, { settings, data });
  const finalRankMs = now() - r;
  const total = now() - t0;
  const top = final[0]?.id || null;
  let stableAt = total;
  let stableN = priced.length;
  for (let i = slices.length - 1; i >= 0; i--) {
    if (slices[i].top !== top) break;
    stableAt = slices[i].at;
    stableN = slices[i].n;
  }
  return { name, candidates: candidates.length, candidatesMs: tCand, pricingMs, slices: slices.length, finalRankMs, totalMs: total, stableAt, stableN, top };
}

const fmt = (ms) => `${Math.round(ms)} ms`;
const layers = Object.entries(layerIndexes).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
console.log(`catalogue ${path.basename(dataPath)}, layers ${layers}, phone estimate x${cpu}, slice ${SLICE_MS} ms`);
// One warm-up run on answers no case uses, so the JIT is warm but no case
// finds its own quotes cached (a reopened finder is memoised anyway).
run('warm-up', { party: { kind: 'friends', adults: 4 }, when: { mode: 'months', months: [9], nights: 4 }, guide: { likes: ['nightlife'] } });
for (const [name, raw] of Object.entries(CASES)) {
  const m = run(name, raw);
  console.log([
    `${name}:`,
    `${m.candidates} candidates (built in ${fmt(m.candidatesMs)}),`,
    `priced in ${fmt(m.pricingMs)} over ${m.slices + 1} slices,`,
    `final rank ${fmt(m.finalRankMs)},`,
    `all done ${fmt(m.totalMs)} (phone ~${fmt(m.totalMs * cpu)}),`,
    `rank 1 stable from ${fmt(m.stableAt)} (phone ~${fmt(m.stableAt * cpu)}) after ${m.stableN} trips, rank 1 = ${m.top}`,
  ].join(' '));
}
