import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compassPoint, sunOf, beachFacing, beachWalkIn, mountainWayUp, lakeShore,
  minShoreKm, kmFigure, facingSummary, walkInSummary, wayUpSummary, shoreSummary,
} from '../src/lib/derivedModules.js';

// A stand-in translator that shows which key and which values were used.
const t = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

test('compassPoint rounds a bearing to the nearest of eight points', () => {
  assert.equal(compassPoint(0), 'n');
  assert.equal(compassPoint(22.4), 'n');
  assert.equal(compassPoint(22.6), 'ne');
  assert.equal(compassPoint(215.7), 'sw');
  assert.equal(compassPoint(350), 'n');
  assert.equal(compassPoint(-90), 'w');
  assert.equal(compassPoint(720 + 180), 's');
});

test('sunOf trusts the pipeline sunset flag over the bands', () => {
  assert.equal(sunOf(90, true), 'sunset');
  assert.equal(sunOf(90, false), 'morning');
  assert.equal(sunOf(180, false), 'midday');
  assert.equal(sunOf(240, false), 'evening');
  assert.equal(sunOf(0, false), 'behind');
  assert.equal(sunOf(320, false), 'behind');
  assert.equal(sunOf(44.9, false), 'behind');
  assert.equal(sunOf(45, false), 'morning');
});

test('beachFacing measures, refuses inland water, and says when it cannot', () => {
  assert.deepEqual(beachFacing({ aspect: 215.7 }), {
    state: 'measured', aspect: 216, point: 'sw', sun: 'midday',
  });
  assert.equal(beachFacing({ aspect: 280, sunset: true }).sun, 'sunset');
  // An aspect of 0 is due north, not a missing value.
  assert.equal(beachFacing({ aspect: 0 }).point, 'n');
  assert.deepEqual(beachFacing({ inland: true }), { state: 'inland' });
  assert.deepEqual(beachFacing({}), { state: 'none' });
  assert.deepEqual(beachFacing(null), { state: 'none' });
  assert.deepEqual(beachFacing({ aspect: 'x' }), { state: 'none' });
});

test('beachWalkIn reads the article first and treats a car park as a distance only', () => {
  assert.deepEqual(beachWalkIn({ access: 'steps', services: ['parking'] }),
    { state: 'access', access: 'steps', parking: true });
  // A boat-only cove keeps no car park line: the car park is not the way in.
  assert.deepEqual(beachWalkIn({ access: 'boat', services: ['parking'] }),
    { state: 'access', access: 'boat', parking: false });
  assert.deepEqual(beachWalkIn({ services: ['parking', 'food'] }), { state: 'parking' });
  assert.deepEqual(beachWalkIn({ access: 'teleport' }), { state: 'none' });
  assert.deepEqual(beachWalkIn({}), { state: 'none' });
});

const slotMap = (w) => Object.fromEntries(w.slots.map((s) => [s.key, s.state]));

test('mountainWayUp: a cable car to the top with an alpine walk', () => {
  // Hoher Dachstein as the AT wire carries it.
  const w = mountainWayUp({
    acc: ['liftTop'],
    lift: { kind: 'cableCar', src: 'curated', name: 'Dachstein Südwandbahn' },
    diff: { k: 'alpine', hard: 'technical', est: true },
  });
  assert.deepEqual(slotMap(w), { drive: 'off', lift: 'on', walk: 'off', climb: 'on' });
  assert.equal(w.primary, 'lift');
  assert.equal(w.liftKind, 'cableCar');
  assert.equal(w.liftName, 'Dachstein Südwandbahn');
  assert.equal(w.liftM, null);
  assert.equal(w.hard, 'technical');
  assert.equal(w.estimated, true);
});

test('mountainWayUp: road first, lifts nearby are only part of the way', () => {
  const w = mountainWayUp({
    acc: ['liftMountain', 'roadTop', 'trailhead'],
    lift: { kind: 'liftsNearby', src: 'osm', m: 1800 },
    diff: { k: 'hike', hard: 'mountainHike' },
  });
  assert.deepEqual(slotMap(w), { drive: 'on', lift: 'part', walk: 'on', climb: 'off' });
  assert.equal(w.primary, 'drive');
  // A lift that does not reach the top never reports metres to the summit.
  assert.equal(w.liftM, null);
  assert.equal(w.liftKind, '');
  // A harder grade that is still a walk is not a climb.
  assert.equal(w.hard, '');
});

test('mountainWayUp: the top station distance is kept, rounded', () => {
  const w = mountainWayUp({
    acc: ['liftTop'], lift: { kind: 'gondola', src: 'osm', m: 341.6 }, diff: { k: 'walkUp' },
  });
  assert.equal(w.liftM, 342);
  assert.equal(w.primary, 'lift');
});

test('mountainWayUp: no grade means walk and climb are unknown, not no', () => {
  const w = mountainWayUp({ acc: ['remote'] });
  assert.equal(w.graded, false);
  assert.equal(w.primary, null);
  assert.deepEqual(slotMap(w), { drive: 'off', lift: 'off', walk: 'off', climb: 'off' });
});

test('mountainWayUp: a scramble is the climb slot', () => {
  const w = mountainWayUp({ acc: ['trailhead'], diff: { k: 'scramble' } });
  assert.equal(w.primary, 'climb');
  assert.deepEqual(slotMap(w), { drive: 'off', lift: 'off', walk: 'off', climb: 'on' });
});

test('minShoreKm is a circle of the same area', () => {
  assert.equal(minShoreKm(0), null);
  assert.equal(minShoreKm(null), null);
  // 1 km2: 2 * sqrt(pi) = 3.545 km
  assert.ok(Math.abs(minShoreKm(1) - 3.5449) < 0.001);
  // Lake Como, 145 km2: about 42.7 km, against a real shore near four times that.
  assert.ok(Math.abs(minShoreKm(145) - 42.69) < 0.01);
});

test('lakeShore: path, short and unswept', () => {
  const como = lakeShore({
    why: [{ k: 'area', km2: 145 }, { k: 'shorePath', km: 12.5 }],
    comp: { shore: 0.552 },
    size: { areaKm2: 145 },
  });
  assert.equal(como.state, 'path');
  assert.equal(como.km, 12.5);
  assert.ok(como.minKm > 42 && como.minKm < 43);

  const fenced = lakeShore({ why: [{ k: 'privateShore' }], comp: { shore: 0.21 }, size: {} });
  assert.deepEqual(fenced, { state: 'short', private: true, launch: false, minKm: null });

  const launch = lakeShore({ why: [{ k: 'shoreLaunch' }], comp: { shore: 0.3 } });
  assert.equal(launch.launch, true);

  // The pipeline's no-reading defaults: nobody swept this shore.
  assert.deepEqual(lakeShore({ why: [], comp: { shore: 0.45 } }), { state: 'unswept' });
  assert.deepEqual(lakeShore({ why: [], comp: { shore: 0.62 } }), { state: 'unswept' });
  assert.deepEqual(lakeShore({ why: [], comp: {} }), { state: 'unswept' });
  // A measured path wins even on a default score.
  assert.equal(lakeShore({ why: [{ k: 'shorePath', km: 0.4 }], comp: { shore: 0.45 } }).state, 'path');
});

test('kmFigure keeps one decimal under 10 km and none above', () => {
  assert.equal(kmFigure(2.44), '2.4');
  assert.equal(kmFigure(42.69), '43');
  assert.equal(kmFigure(12.5, 'de'), '13');
  assert.equal(kmFigure(1.25, 'de'), '1,3');
  assert.equal(kmFigure('x'), '');
});

test('the summaries name the answer or say it was not measured', () => {
  assert.equal(facingSummary({ state: 'measured', point: 'sw', sun: 'sunset' }, t),
    'derived.facingSum{"point":"derived.pointSw","sun":"derived.sunShortSunset"}');
  assert.equal(facingSummary({ state: 'inland' }, t), 'derived.facingInlandSum');
  assert.equal(facingSummary({ state: 'none' }, t), 'derived.notMeasured');

  assert.equal(walkInSummary({ state: 'access', access: 'steps' }, t), 'beach.accessSteps');
  assert.equal(walkInSummary({ state: 'parking' }, t), 'derived.walkinParkingSum');
  assert.equal(walkInSummary({ state: 'none' }, t), 'derived.notMeasured');

  assert.equal(wayUpSummary({ primary: 'drive' }, t), 'derived.upSumDrive');
  assert.equal(wayUpSummary({ primary: 'lift' }, t, { liftWord: 'Cable car to the top' }), 'Cable car to the top');
  assert.equal(wayUpSummary({ primary: 'walk' }, t, { gradeWord: 'Hike' }), 'Hike');
  assert.equal(wayUpSummary({ primary: 'climb' }, t), 'derived.slotClimb');
  assert.equal(wayUpSummary({ primary: null }, t), 'derived.notMeasured');

  assert.equal(shoreSummary({ state: 'path', km: 12.5 }, t), 'derived.shoreSum{"km":"13"}');
  assert.equal(shoreSummary({ state: 'short' }, t), 'derived.shoreShortSum');
  assert.equal(shoreSummary({ state: 'unswept' }, t), 'derived.notMeasured');
});

test('lakeShore: a missing shore reason on a full list may have been cut', () => {
  // Lake Como's ten reasons, as the IT wire carries them: none about the shore.
  const ten = ['kindLake', 'area', 'depth', 'mountains', 'glacier', 'cliffs',
    'waterfall', 'forest', 'castle', 'waterExcellent'].map((k) => ({ k }));
  assert.deepEqual(lakeShore({ why: ten, comp: { shore: 0.552 } }), { state: 'cut' });
  // A reason from after the shore block made it on, so the absence is real.
  const reached = [...ten.slice(0, 9), { k: 'services' }];
  assert.equal(lakeShore({ why: reached, comp: { shore: 0.552 } }).state, 'short');
  // Fewer than ten reasons: nothing was trimmed.
  assert.equal(lakeShore({ why: ten.slice(0, 9), comp: { shore: 0.552 } }).state, 'short');
  assert.equal(shoreSummary({ state: 'cut' }, t), 'derived.notMeasured');
});
