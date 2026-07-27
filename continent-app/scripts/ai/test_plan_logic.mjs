/**
 * Tests for the plan-day Edge Function's pure logic (supabase/functions/
 * plan-day/logic.mjs): sanitizers, the 2-opt route check and the
 * deterministic scheduler. Run from the repo root or continent-app:
 *
 *   node continent-app/scripts/ai/test_plan_logic.mjs
 *
 * No network, no keys: this is the half of the AI feature that must be
 * provably correct even when the AI itself is down.
 */
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logicPath = resolve(here, '../../../supabase/functions/plan-day/logic.mjs');
const {
  cleanText, haversineKm, sanitizeCandidates, sanitizeAiStops, twoOptOrder,
  scheduleDay, cacheKeyInput, modelChain, shouldFallOver, DEFAULT_MODEL_CHAIN,
} = await import(pathToFileURL(logicPath).href);

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
};

/* ---- cleanText: house style, clamps, control chars ---- */
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
check('em dash becomes comma', cleanText(`nice${EM}place`) === 'nice, place');
check('digit range keeps hyphen', cleanText(`open 10${EN}12h`) === 'open 10-12h');
check('control chars stripped', cleanText(`a${String.fromCharCode(7)}b`) === 'a b');
check('clamped to max', cleanText('x'.repeat(500), 100).length === 100);
check('non-string is empty', cleanText(null) === '');

/* ---- sanitizeCandidates ---- */
const rawCands = [
  { id: '0', name: 'Grand Place', lat: 50.8467, lon: 4.3525, kind: 'Square', rating: 9.2, mustSee: true, dwellMin: 25 },
  { id: '1', name: 'Atomium', lat: 50.8949, lon: 4.3416, kind: 'Landmark', rating: 9.0, mustSee: true, dwellMin: 75 },
  { id: '2', name: 'Manneken Pis', lat: 50.845, lon: 4.35, kind: 'Statue', rating: 7.2, dwellMin: 10 },
  { id: '3', name: 'Royal Palace', lat: 50.8417, lon: 4.3622, kind: 'Palace', rating: 8.0, dwellMin: 60 },
  { id: '4', name: 'Cathedral', lat: 50.8477, lon: 4.3603, kind: 'Cathedral', rating: 8.1, dwellMin: 40 },
  { id: 'bad', name: '', lat: 1, lon: 1 },
  { id: '0', name: 'Duplicate id', lat: 50.8, lon: 4.3 },
  { id: '9', name: 'No coords' },
];
const cands = sanitizeCandidates(rawCands);
check('candidates: keeps valid, drops empty-name/dupe/no-coords', cands.length === 5, `got ${cands.length}`);
check('candidates: dwell clamped sane', cands.every((c) => c.dwellMin >= 5 && c.dwellMin <= 360));

/* ---- sanitizeAiStops ---- */
const centre = { lat: 50.8467, lon: 4.3525 };
const aiStops = [
  { id: '1', name: 'Atomium', arrive: '09:30', dwellMin: 75, why: 'w', inCatalog: true },
  { id: '0', name: 'Grand Place', arrive: '11:30', dwellMin: 9999, why: 'w', inCatalog: true },
  { id: '0', name: 'Grand Place again', arrive: '12:00', dwellMin: 20, why: 'w', inCatalog: true },
  { id: '777', name: 'Hallucinated with fake id', arrive: '13:00', dwellMin: 30, why: 'w', inCatalog: true },
  { name: 'Chez Leon', arrive: '12:30', dwellMin: 90, why: 'big tables', inCatalog: false, lat: 50.8471, lon: 4.3535 },
  { name: 'Restaurant On The Moon', arrive: '14:00', dwellMin: 60, why: 'w', inCatalog: false, lat: 20.0, lon: 4.35 },
  { id: '2', name: 'Manneken Pis', arrive: '15:00', dwellMin: 10, why: 'w', inCatalog: true },
];
const { stops, dropped } = sanitizeAiStops(aiStops, cands, centre);
check('ai stops: catalogue ids resolved to our data', stops.filter((s) => !s.external).length === 3);
check('ai stops: duplicate id dropped', !stops.some((s) => s.name === 'Grand Place again'));
check('ai stops: hallucinated id dropped', !stops.some((s) => s.name.includes('Hallucinated')));
check('ai stops: near discovery kept, far one dropped', stops.filter((s) => s.external).length === 1);
check('ai stops: drop count honest', dropped === 3, `got ${dropped}`);
check('ai stops: dwell clamped', stops.every((s) => s.dwellMin <= 360));
const gp = stops.find((s) => s.id === '0');
check('ai stops: catalogue coords are ours', gp.lat === 50.8467 && gp.lon === 4.3525);

/* ---- twoOptOrder: must beat a deliberately crossed route ---- */
// Four corners of a square visited in a crossing (bowtie) order: 2-opt must
// find the perimeter, which is ~17% shorter.
const sq = [
  { lat: 50.80, lon: 4.30 }, { lat: 50.82, lon: 4.32 },
  { lat: 50.80, lon: 4.32 }, { lat: 50.82, lon: 4.30 },
];
const dist = (order) => {
  let d = 0;
  for (let i = 1; i < order.length; i += 1) {
    d += haversineKm(sq[order[i - 1]].lat, sq[order[i - 1]].lon, sq[order[i]].lat, sq[order[i]].lon);
  }
  return d;
};
const bowtie = dist([0, 1, 2, 3]);
const opt = dist(twoOptOrder(sq));
check('2-opt: shorter than crossed path', opt < bowtie, `${opt.toFixed(2)} vs ${bowtie.toFixed(2)}`);

/* ---- scheduleDay ---- */
const sched = scheduleDay(stops, { stay: { lat: 50.846, lon: 4.352 }, groupSize: 7 });
check('schedule: every routed stop has an arrival time', sched.stops.every((s) => s.arrive));
check('schedule: starts at/after 09:30', sched.stops[0].arrive >= '09:30');
check('schedule: monotonic times', sched.stops.every((s, i, a) => i === 0 || a[i - 1].arrive <= s.arrive));
check('schedule: lunch inserted', sched.lunchAfter >= 0 && sched.lunchMin > 0);
check('schedule: totals present', sched.totalKm > 0 && /^\d{2}:\d{2}$/.test(sched.endTime));

// A deliberately terrible order (far Atomium sandwiched between two
// neighbouring old-town stops) must trigger the server-side re-optimize.
const terrible = [
  { id: '0', name: 'Grand Place', lat: 50.8467, lon: 4.3525, dwellMin: 25, why: '', external: false },
  { id: '1', name: 'Atomium', lat: 50.8949, lon: 4.3416, dwellMin: 75, why: '', external: false },
  { id: '2', name: 'Manneken Pis', lat: 50.845, lon: 4.35, dwellMin: 10, why: '', external: false },
  { id: '3', name: 'Royal Palace', lat: 50.8417, lon: 4.3622, dwellMin: 60, why: '', external: false },
];
const fixed = scheduleDay(terrible, { stay: { lat: 50.846, lon: 4.352 }, groupSize: 2 });
check('schedule: bad order re-optimized', fixed.optimized === true);
check('schedule: Atomium moved off position 2', fixed.stops[1].name !== 'Atomium');

// A already-good order must NOT be shuffled for a marginal gain.
const good = scheduleDay(
  [terrible[0], terrible[2], terrible[3], terrible[1]],
  { stay: { lat: 50.846, lon: 4.352 }, groupSize: 2 },
);
check('schedule: good order left alone', good.optimized === false);

// Group speed: same day takes longer on foot for 7 than for 2.
const solo = scheduleDay(terrible, { groupSize: 2 });
const seven = scheduleDay(terrible, { groupSize: 7 });
check('schedule: big group ends later', seven.endTime > solo.endTime, `${seven.endTime} vs ${solo.endTime}`);

/* ---- the walking budget: days that cannot be walked must not be sold ----
   Reported from the app as "About 89.4 km on foot, done around 11:32" for a
   route the traveller had asked to be short. Two faults met: the candidate
   deck reaches 20 km from the city centre so the model could graze right
   across it, and the clock wrapped at midnight, which turned a day ending at
   35:32 into a pleasant-sounding late morning. */

// Stops scattered over the whole 20 km radius, none within walking range of
// another. There is no walkable day in here and the scheduler must say so
// rather than invent an 90 km one.
const CENTRE = { lat: 47.7933, lon: 13.0043 };
const at = (dLat, dLon, n, dwellMin = 45) => ({
  id: String(n), name: `Stop ${n}`, dwellMin, why: '', external: false,
  lat: CENTRE.lat + dLat, lon: CENTRE.lon + dLon,
});
const scattered = [at(0.15, 0, 1), at(-0.15, 0, 2), at(0, 0.22, 3), at(0, -0.22, 4),
  at(0.12, 0.18, 5), at(-0.12, -0.18, 6), at(0.16, -0.1, 7), at(-0.16, 0.12, 8)];
const spread = scheduleDay(scattered, { groupSize: 2 });
check('budget: a scattered deck never becomes an 80 km walk',
  spread.totalKm <= 12, `${spread.totalKm} km`);
check('budget: the unreachable stops are reported, not silently kept',
  spread.farDropped > 0 && spread.stops.length < scattered.length);

// The clock must never wrap: an impossible day has to LOOK impossible.
const hhmm = /^(\d{2,}):([0-5]\d)$/;
check('clock: end time is well formed', hhmm.test(spread.endTime));
const marathon = scheduleDay([at(0, 0, 1, 350), at(0.004, 0.004, 2, 350), at(0.008, 0, 3, 350)],
  { groupSize: 2 });
check('clock: a day past midnight reads past 24h, not wrapped',
  Number(marathon.endTime.split(':')[0]) >= 24, marathon.endTime);

// A tight city cluster with two far strays: keep the day, lose the strays.
const cluster = [at(0.002, 0, 1), at(0.006, 0.004, 2), at(0.011, -0.002, 3), at(0.004, 0.009, 4)];
const withStrays = scheduleDay([...cluster, at(0.14, 0.16, 9), at(-0.15, -0.13, 10)], { groupSize: 2 });
check('budget: the walkable cluster survives its outliers',
  withStrays.stops.length === cluster.length && withStrays.farDropped === 2,
  `kept ${withStrays.stops.length}, dropped ${withStrays.farDropped}`);

// A day that already fits must come through completely untouched.
const untouched = scheduleDay(cluster, { groupSize: 2 });
check('budget: a walkable day is left alone',
  untouched.stops.length === cluster.length && untouched.farDropped === 0);

// The traveller's own answer is ENFORCED, not just mentioned in the prompt.
const tight = scheduleDay(cluster, { groupSize: 2, maxWalkKm: 1 });
check('budget: maxWalkKm is honoured', tight.totalKm <= 1, `${tight.totalKm} km`);
check('budget: a bigger budget keeps more of the day',
  scheduleDay(cluster, { groupSize: 2, maxWalkKm: 20 }).stops.length >= tight.stops.length);

// A stay beyond walking range is a ride the app draws separately, so its
// distance must not be billed to the walking budget.
const farStay = scheduleDay(cluster, { groupSize: 2, stay: { lat: 48.2, lon: 13.5 } });
check('stay: a distant stay is not walked', farStay.fromStay === false);
check('stay: a distant stay adds no walking', farStay.totalKm < 3, `${farStay.totalKm} km`);
const nearStay = scheduleDay(cluster, { groupSize: 2, stay: { lat: CENTRE.lat - 0.008, lon: CENTRE.lon } });
check('stay: a stay round the corner still starts the walk', nearStay.fromStay === true);
check('stay: walking from it costs more than starting at stop 1',
  nearStay.totalKm > untouched.totalKm);

/* ---- cacheKeyInput ---- */
const base = {
  model: 'm', destId: 'd', month: 8, groupSize: 7, pace: 'balanced', vibe: 'mix',
  avoidHills: false, freeText: 'Paella', lang: 'en', candidates: cands,
};
check('cache key: stable', cacheKeyInput(base) === cacheKeyInput({ ...base }));
check('cache key: free text case-folded', cacheKeyInput(base) === cacheKeyInput({ ...base, freeText: 'paella' }));
check('cache key: group band 5-6 vs 7+ differ', cacheKeyInput({ ...base, groupSize: 6 }) !== cacheKeyInput(base));
check('cache key: month matters', cacheKeyInput({ ...base, month: 12 }) !== cacheKeyInput(base));
// A refinement must never be served the un-refined plan from cache, and two
// different refinements must never collide with each other.
check('cache key: refinement changes the key',
  cacheKeyInput({ ...base, refine: 'more museums' }) !== cacheKeyInput(base));
check('cache key: different refinements differ',
  cacheKeyInput({ ...base, refine: 'more museums' }) !== cacheKeyInput({ ...base, refine: 'less walking' }));
check('cache key: same refinement is cacheable',
  cacheKeyInput({ ...base, refine: 'More Museums' }) === cacheKeyInput({ ...base, refine: 'more museums' }));
check('cache key: previous plan is part of a refinement',
  cacheKeyInput({ ...base, refine: 'x', prevStopIds: ['a'] })
  !== cacheKeyInput({ ...base, refine: 'x', prevStopIds: ['b'] }));
// Events hinge on the exact day, not just the month; without events the
// month is enough and two dates in one month still share a cache entry.
check('cache key: events mode keys on the exact date',
  cacheKeyInput({ ...base, wantEvents: true, dateISO: '2026-08-04' })
  !== cacheKeyInput({ ...base, wantEvents: true, dateISO: '2026-08-05' }));
check('cache key: without events the month is enough',
  cacheKeyInput({ ...base, dateISO: '2026-08-04' }) === cacheKeyInput({ ...base, dateISO: '2026-08-05' }));
check('cache key: asking for events changes the key',
  cacheKeyInput({ ...base, wantEvents: true }) !== cacheKeyInput(base));

/* ---- events survive validation as flagged discoveries ---- */
const withEvent = sanitizeAiStops([
  { id: '0', name: 'Grand Place', arrive: '09:30', dwellMin: 30, why: 'w', inCatalog: true },
  { name: 'Gentse Feesten', arrive: '14:00', dwellMin: 120, why: 'Check this year dates', inCatalog: false, isEvent: true, lat: 50.8465, lon: 4.3520 },
  { name: 'Fake Far Festival', arrive: '16:00', dwellMin: 60, why: 'w', inCatalog: false, isEvent: true, lat: 10, lon: 4.35 },
], cands, centre).stops;
check('events: near event kept and flagged', withEvent.some((s) => s.isEvent === true && s.external));
check('events: far event dropped', !withEvent.some((s) => s.name.includes('Fake Far')));
check('events: catalogue stops never flagged as events',
  withEvent.filter((s) => !s.external).every((s) => !s.isEvent));

/* ---- model fallback chain ---- */

check('chain: default when nothing is configured',
  modelChain('', '').join() === DEFAULT_MODEL_CHAIN.join());
check('chain: GEMINI_MODELS replaces the chain outright',
  modelChain('', 'a, b ,c').join() === 'a,b,c');
check('chain: a pinned model leads, fallbacks stay behind it',
  modelChain('gemini-3.5-flash-lite', '')[0] === 'gemini-3.5-flash-lite');
check('chain: pinning does not duplicate the model further down',
  modelChain('gemini-3.5-flash-lite', '')
    .filter((m) => m === 'gemini-3.5-flash-lite').length === 1);
check('chain: pinning keeps the rest of the fallbacks',
  modelChain('gemini-3.5-flash-lite', '').length === DEFAULT_MODEL_CHAIN.length);
check('chain: blank entries are dropped', !modelChain('', 'a,,  ,b').includes(''));
check('chain: never unbounded', modelChain('', 'a,b,c,d,e,f,g,h').length <= 6);
// A spent budget, a retired model and Google's "high demand" 503 all mean
// "try the next rung". A 400 is our own malformed request and would fail
// identically everywhere, so it must stop the chain.
check('fallover: 429 spent budget advances', shouldFallOver(429));
check('fallover: 404 retired model advances', shouldFallOver(404));
check('fallover: 503 high demand advances', shouldFallOver(503));
check('fallover: 400 bad request stops the chain', !shouldFallOver(400));
check('fallover: 403 bad key stops the chain', !shouldFallOver(403));

if (failures) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll plan-day logic tests passed.');
