// G12 My trips atlas, Phase B: what the plate draws per tab (atlas/layers.js).
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rampOf, tripsLayer, europeLayer } from '../src/auth/mytrips/atlas/layers.js';

const HALL = { city: 'Hallstatt', lat: 47.56, lon: 13.65 };
const VIE = { city: 'Vienna', lat: 48.21, lon: 16.37 };
const LIS = { city: 'Lisbon', lat: 38.72, lon: -9.14 };
const POR = { city: 'Porto', lat: 41.15, lon: -8.61 };
const TRO = { city: 'Tromso', lat: 69.65, lon: 18.96 };

test('rampOf: newest year darkest, the fifth year back and older lightest', () => {
  assert.deepEqual(rampOf({ AT: 2026, PT: 2025, IT: 2024, ES: 2023, FR: 2022, GB: 2019 }),
    { 2019: 0, 2022: 0, 2023: 1, 2024: 2, 2025: 3, 2026: 4 });
  assert.deepEqual(rampOf({ BE: 2026 }), { 2026: 4 });
  assert.deepEqual(rampOf({}), {});
});

test('tripsLayer: no trip shows the whole of Europe', () => {
  const L = tripsLayer({ ahead: [] });
  assert.equal(L.state, 'empty');
  assert.equal(L.whole, true);
  assert.equal(L.summary.key, 'mt.mapTripsEmpty');
});

test('tripsLayer: nothing ahead but past trips draws their routes, no saffron point', () => {
  const L = tripsLayer({ ahead: [], past: [{ id: 'p', stops: [LIS, POR] }, { id: 'q', stops: [TRO] }] });
  assert.equal(L.state, 'past');
  assert.equal(L.routes.length, 1);
  assert.equal(L.routes[0].kind, 'past');
  assert.equal(L.stops.length, 3);
  assert.equal(L.stops.some((s) => s.sun), false);
  assert.deepEqual(L.summary, { key: 'mt.mapTripsPast', n: 2 });
});

test('tripsLayer: one trip frames its stops, the first stop takes the one saffron point', () => {
  const L = tripsLayer({ ahead: [{ id: 'a', title: 'Austria', stops: [HALL, VIE] }] });
  assert.equal(L.state, 'one');
  assert.equal(L.routes.length, 1);
  assert.equal(L.stops.filter((s) => s.sun).length, 1);
  assert.equal(L.labels[0].t, 'Hallstatt');
  assert.equal(L.summary.key, 'mt.mapTripsNext');
});

test('tripsLayer: many trips, still one saffron point; a trip without located stops is left out', () => {
  const L = tripsLayer({ ahead: [{ id: 'a', title: 'Austria', stops: [HALL] }, { id: 'b', title: 'Portugal', stops: [LIS, POR] }, { id: 'c', stops: [{ city: 'Nowhere' }] }] });
  assert.equal(L.state, 'many');
  assert.equal(L.summary.n, 2);
  assert.equal(L.stops.filter((s) => s.sun).length, 1);
  assert.deepEqual(L.routes.map((r) => r.id), ['b']);
});

test('tripsLayer: today puts "here" on the stop of the day, no saffron stop, legs done and to come', () => {
  const L = tripsLayer({ today: { id: 't', title: 'Portugal', stops: [LIS, POR] }, todayAt: { stopIndex: 0, dayNum: 2, of: 7 } });
  assert.equal(L.state, 'today');
  assert.equal(L.stops.length, 1);
  assert.ok(L.here[1] > L.stops[0].y, 'here is Lisbon, south of Porto');
  assert.ok(L.stops.every((s) => !s.sun), 'the saffron is the journey line bead');
  assert.deepEqual(L.routes.map((r) => r.kind), ['ahead']);
  assert.equal(L.summary.city, 'Lisbon');
  const M = tripsLayer({ today: { id: 't', title: 'Portugal', stops: [POR, LIS, HALL] }, todayAt: { stopIndex: 1, dayNum: 4, of: 6 } });
  assert.deepEqual(M.routes.map((r) => r.kind), ['done', 'ahead']);
  assert.equal(M.routes[0].pts.length, 2);
  assert.deepEqual(M.routes[0].pts[1], M.here);
  assert.deepEqual(M.routes[1].pts[0], M.here);
  assert.equal(M.focus.length, 3, 'the frame fits every stop');
});

test('europeLayer: years per country, hand marks, routes and corners', () => {
  const trips = [
    { id: 'p1', start: '2022-05-01', countries: ['PT'], stops: [LIS, POR] },
    { id: 'p2', start: '2024-06-01', countries: ['NO', 'PT'], stops: [TRO] },
  ];
  const E = europeLayer({ trips, been: new Set(['PT', 'NO', 'BE']) });
  assert.equal(E.state, 'record');
  assert.deepEqual(E.firstYear, { PT: 2022, NO: 2024 });
  assert.deepEqual([...E.hand], ['BE']);
  assert.deepEqual([...E.visits.PT].sort(), [2022, 2024]);
  assert.deepEqual(E.years, [2022, 2024]);
  assert.equal(E.routes.length, 1);
  assert.deepEqual(E.corners.map((c) => c.key), ['n', 's', 'e', 'w']);
  assert.equal(europeLayer({ been: new Set() }).state, 'empty');
});
