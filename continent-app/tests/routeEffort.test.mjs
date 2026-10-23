import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACES, BREAK_MIN_PER_HOUR, paceTime, clock, clockRange, sacGrade, sacLabel, sacBand,
  trailSacRaw, sacTone, sacRuns, hasSacSegments, averageGradePct, cycleShapeKey,
  durationBands, slopeState, rangeRankParts, hutParts, transitModes,
} from '../src/lib/routeEffort.js';
import { tripSacBand, tripDurationBands, tripReachable } from '../src/lib/trailCards.js';
import { cycleMatchesFacets, cycleFacetCounts } from '../src/lib/cycleStory.js';
import { routeBadges } from '../src/lib/cardFillings.js';
import { altitudeStep } from '../src/lib/metForecast.js';

const t = (key) => key;

test('the pace multipliers are the fixed ones and normal is the stored time', () => {
  assert.deepEqual(PACES.map((p) => [p.key, p.mult]),
    [['family', 1.3], ['normal', 1], ['fit', 0.8], ['runner', 0.6]]);
  assert.deepEqual(BREAK_MIN_PER_HOUR, [10, 15]);
});

test('paceTime applies the multiplier and adds 10 to 15 minutes of break per hour', () => {
  // Stored DIN 33466 time of 303 min (a 6.9 km walk with 1,220 m up).
  const normal = paceTime(303, 'normal');
  assert.equal(normal.walk, 303);
  assert.equal(normal.lo, Math.round(303 + (303 / 60) * 10));
  assert.equal(normal.hi, Math.round(303 + (303 / 60) * 15));
  const run = paceTime(303, 'runner');
  assert.equal(run.walk, Math.round(303 * 0.6));
  assert.ok(run.lo < normal.lo && run.hi < normal.hi);
  const fam = paceTime(120, 'family');
  assert.equal(fam.walk, 156);
  assert.equal(fam.lo, Math.round(156 + 2.6 * 10));
  assert.equal(paceTime(null, 'normal'), null);
  assert.equal(paceTime(0, 'normal'), null);
  assert.equal(paceTime(60, 'nonsense'), null);
});

test('clock and clockRange word minutes without a locale-bound "to"', () => {
  assert.equal(clock(45), '45 min');
  assert.equal(clock(60), '1 h');
  assert.equal(clock(125), '2 h 05 min');
  assert.equal(clock(null), null);
  assert.equal(clockRange(60, 60, (a, b) => `${a}|${b}`), '1 h');
  assert.equal(clockRange(60, 90, (a, b) => `${a}|${b}`), '1 h|1 h 30 min');
});

test('SAC reads the OSM word and the T spelling, and buckets T3 and up', () => {
  assert.equal(sacGrade('hiking'), 1);
  assert.equal(sacGrade('mountain_hiking'), 2);
  assert.equal(sacGrade('demanding_mountain_hiking'), 3);
  assert.equal(sacGrade('difficult_alpine_hiking'), 6);
  assert.equal(sacGrade('T4'), 4);
  assert.equal(sacGrade('t2;t3'), 2);
  assert.equal(sacGrade('wheelchair'), null);
  assert.equal(sacGrade(null), null);
  assert.equal(sacLabel('alpine_hiking'), 'T4');
  assert.equal(sacLabel('x'), null);
  assert.equal(sacBand('hiking'), 'T1');
  assert.equal(sacBand('mountain_hiking'), 'T2');
  assert.equal(sacBand('alpine_hiking'), 'T3');
  assert.equal(sacBand(undefined), null);
});

test('trailSacRaw prefers the row, then the detail tag, then the worst member way', () => {
  assert.equal(trailSacRaw({ sac_scale: 'hiking' }, { sac_scale: 'alpine_hiking' }), 'hiking');
  assert.equal(trailSacRaw({}, { sac_scale: 'alpine_hiking' }), 'alpine_hiking');
  assert.equal(trailSacRaw({}, { grade_parts: { sac_worst: 'demanding_mountain_hiking' } }),
    'demanding_mountain_hiking');
  assert.equal(trailSacRaw({}, {}), null);
});

test('sacRuns clips segments to the profile and uses the three existing tones', () => {
  assert.equal(sacTone('T1'), 0);
  assert.equal(sacTone('T2'), 0);
  assert.equal(sacTone('T3'), 1);
  assert.equal(sacTone('T5'), 2);
  assert.equal(sacTone('T9'), null);
  const profile = [[0, 100], [100, 110], [200, 120], [300, 130], [400, 140]];
  const runs = sacRuns(profile, [[0, 200, 'T2'], [200, 9999, 'T4'], [10, 5, 'T3'], [0, 50, 'bad']]);
  assert.deepEqual(runs, [{ cls: 0, from: 0, to: 2 }, { cls: 1, from: 2, to: 4 }]);
  assert.deepEqual(sacRuns(profile, null), []);
  assert.equal(hasSacSegments([[0, 100, 'T1']]), true);
  assert.equal(hasSacSegments([]), false);
  assert.equal(hasSacSegments(null), false);
});

test('averageGradePct is ascent plus descent over length, else ascent per km over ten', () => {
  assert.equal(averageGradePct({ distanceM: 4576, ascentM: 8, descentM: 769 }), 17);
  assert.equal(averageGradePct({ distanceM: 10000, ascentM: 500, descentM: 500 }), 10);
  assert.equal(averageGradePct({ distanceM: 10000, ascentM: 500 }), 5);
  assert.equal(averageGradePct({ distanceM: 6935, ascentM: 1220 }), 17.6);
  assert.equal(averageGradePct({ ascentPerKm: 176 }), 17.6);
  assert.equal(averageGradePct({ distanceM: 0, ascentM: 10 }), null);
  assert.equal(averageGradePct({}), null);
  assert.equal(averageGradePct(), null);
});

test('cycle shape reads rt first, then the mapper loop tag', () => {
  assert.equal(cycleShapeKey({ rt: 'out_back', loop: true }), 'out_back');
  assert.equal(cycleShapeKey({ loop: true }), 'loop');
  assert.equal(cycleShapeKey({ loop: false }), null);
  assert.equal(cycleShapeKey(null), null);
});

test('duration bands are cumulative "up to" bands and the cycle facet uses them', () => {
  assert.deepEqual(durationBands(90), ['d120', 'd240', 'd360', 'd480']);
  assert.deepEqual(durationBands(300), ['d360', 'd480']);
  assert.deepEqual(durationBands(600), []);
  assert.deepEqual(durationBands(null), []);
  assert.deepEqual(tripDurationBands({ duration_min: 200 }), ['d240', 'd360', 'd480']);
  const rows = [
    { km: 20, dur: { min: 90 } }, { km: 60, dur: { min: 300 } }, { km: 90 },
  ];
  assert.equal(rows.filter((r) => cycleMatchesFacets(r, { duration: ['d120'] })).length, 1);
  assert.equal(rows.filter((r) => cycleMatchesFacets(r, { duration: ['d360'] })).length, 2);
  const counts = cycleFacetCounts(rows);
  assert.equal(counts.get('duration:d360'), 2);
  assert.equal(counts.get('duration:d480'), 2);
});

test('trail filters read the row keys and are empty without them', () => {
  assert.equal(tripSacBand({ sac_scale: 'demanding_mountain_hiking' }), 'T3');
  assert.equal(tripSacBand({}), null);
  assert.equal(tripReachable({ transit: { rail: false, bus: true } }), true);
  assert.equal(tripReachable({ transit: { rail: false } }), false);
  assert.equal(tripReachable({}), false);
  assert.deepEqual(transitModes({ rail: true, bus: false, ferry: true }), ['rail', 'ferry']);
});

test('slope warning is over 30 degrees only', () => {
  assert.equal(slopeState(31), 'warn');
  assert.equal(slopeState(30), 'ok');
  assert.equal(slopeState(12), 'ok');
  assert.equal(slopeState(null), null);
});

test('range rank and hut parts tolerate absence', () => {
  assert.deepEqual(rangeRankParts({ n: 13, h: 1, p: 4 }), { n: 13, height: 1, prominence: 4 });
  assert.deepEqual(rangeRankParts({ n: 5, h: 2 }), { n: 5, height: 2, prominence: null });
  assert.equal(rangeRankParts(null), null);
  assert.deepEqual(hutParts({ name: 'Toni-Lenz-Huette', m: 420, beds: 38, web: 'https://x.example' }),
    { name: 'Toni-Lenz-Huette', m: 420, beds: 38, open: null, phone: null, web: 'https://x.example', email: null });
  assert.equal(hutParts({ name: 'A', web: 'javascript:alert(1)' }).web, null);
  assert.equal(hutParts({}), null);
});

test('route badges keep their four slots and say so when a figure is missing', () => {
  const full = routeBadges({ sac: 'mountain_hiking', km: '6.9 km', climb: '+1,220 m', minutes: '5 h 03 min', withSac: true }, t);
  assert.deepEqual(full.map((c) => c.key), ['sac', 'length', 'climb', 'time']);
  assert.equal(full[0].value, 'T2');
  assert.ok(full.every((c) => !c.none));
  const bare = routeBadges({ withSac: true }, t);
  assert.equal(bare.length, 4);
  assert.ok(bare.every((c) => c.none && c.value === 'data.notYet'));
  const ride = routeBadges({ km: '10 km', climb: null, minutes: '38 min', withSac: false }, t);
  assert.deepEqual(ride.map((c) => c.key), ['length', 'climb', 'time']);
  assert.equal(ride[1].value, 'data.notYet');
});

test('the forecast altitude is validated, clamped and stepped', () => {
  assert.equal(altitudeStep(null), null);
  assert.equal(altitudeStep(''), null);
  assert.equal(altitudeStep('abc'), undefined);
  assert.equal(altitudeStep('2995'), 3000);
  assert.equal(altitudeStep('2974'), 2950);
  assert.equal(altitudeStep('-40'), 0);
  assert.equal(altitudeStep('99999'), 5000);
});
