import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickValues, trailFilling, cycleFilling, cycleTourFilling, beachFilling, lakeFilling,
  mountainFilling, VALUE_COUNT, ICON_MAX,
} from '../src/lib/cardFillings.js';

// A catalogue stand-in: returns the key, with any params appended, so a test
// can see which string a filling asked for.
const t = (key, params) => (params && Object.keys(params).length
  ? `${key}(${Object.values(params).join(',')})` : key);

const assertCard = (fill) => {
  assert.equal(fill.values.length, VALUE_COUNT, 'exactly three values');
  assert.ok(fill.icons.length <= ICON_MAX, 'at most three icons');
  assert.ok(Array.isArray(fill.hook));
};

test('pickValues keeps three cells, lets a spare stand in, and keeps the order', () => {
  const cells = pickValues([
    { key: 'a', label: 'A', value: '1 m' },
    { key: 'b', label: 'B', value: null },
    { key: 'c', label: 'C', value: '3 m' },
    { key: 'd', label: 'D', value: '4 m' },
  ], t);
  assert.deepEqual(cells.map((c) => c.key), ['a', 'c', 'd']);
  assert.ok(cells.every((c) => !c.none));
});

test('pickValues marks a missing figure instead of dropping the cell', () => {
  const cells = pickValues([
    { key: 'a', label: 'A', value: '1 m' },
    { key: 'b', label: 'B', value: null },
    { key: 'c', label: 'C', value: undefined },
  ], t);
  assert.equal(cells.length, 3);
  assert.deepEqual(cells.map((c) => c.key), ['a', 'b', 'c']);
  assert.deepEqual(cells.map((c) => !!c.none), [false, true, true]);
  assert.equal(cells[1].value, 'card.none');
});

test('a walk: length first (the harness parses it), time, climb uphill; loop and highlights as icons', () => {
  const tr = {
    name: 'Sentiero', category: 'hike', country: 'IT', distance_m: 12400, duration_min: 250,
    ascent_m: 800, descent_m: 120, is_loop: true, difficulty: 'moderate',
    f: { g: 'hard', gs: 'derived', hl: ['summit', 'waterfall', 'lake', 'castle'], ref: 'CAI 12' },
    ele: { start: 500, end: 1180 },
  };
  const fill = trailFilling({ tr, assoc: { dest: null }, kindKey: 'trails.hike' }, { t, countryName: () => 'Italy' });
  assertCard(fill);
  assert.match(fill.values[0].value, /^12\.4 km$/);
  assert.match(fill.values[1].value, /^4\.2 h$/);
  assert.match(fill.values[2].value, /^\+\d/);
  assert.equal(fill.ref, 'CAI 12');
  assert.equal(fill.where, 'Italy');
  assert.equal(fill.icons[0].code, 'loop');
  assert.equal(fill.icons[0].cls, 'places-card-loop');
  assert.deepEqual(fill.hook.map((h) => h.cls), ['places-card-kind', 'places-card-diff est', 'places-card-hl', 'places-card-hl']);
});

test('a city day trades the climb for its stops', () => {
  const tr = { name: 'Old town', category: 'citytrip', distance_m: 5200, duration_min: 180, n_stops: 7 };
  const fill = trailFilling({ tr, assoc: {}, kindKey: 'trails.cityDay' }, { t });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.key), ['length', 'time', 'stops']);
  assert.equal(fill.values[2].value, '7');
  assert.equal(fill.ref, null);
});

test('a cycle route: length, climb and the traffic-free share', () => {
  const r = { name: 'NCN National Route 1', ref: '1', km: 28.6, asc: 58, free: 0.9302, loop: true,
    why: [{ code: 'railAccess', n: 3 }, { code: 'lakes', n: 2 }, { code: 'views', n: 30 }] };
  const fill = cycleFilling(r, { t, countryName: 'United Kingdom' });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.value), ['28.6 km', '+58 m', '93%']);
  assert.equal(fill.ref, null, 'the ref is already in the name');
  assert.deepEqual(fill.icons.map((i) => i.code), ['loop', 'rail', 'lake']);
});

test('a cycle tour: days, length and the day ride', () => {
  const fill = cycleTourFilling({ title: 'Tour', days: 5, km: 300, pace: 'easy', towns: ['A', 'B'] }, { t, countryName: 'Austria' });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.key), ['days', 'length', 'perDay']);
  assert.equal(fill.values[2].value, '60 km');
  assert.equal(fill.where, 'Austria, A, B');
});

test('a beach without a length lets the nearest town stand in', () => {
  const beach = { name: 'Dhermi', region: 'Himare', aspect: 193.6, water: { class: 'Excellent' },
    base: { city: 'Dhermi', km: 3.8 }, tags: ['waterExcellent'], why: [], lifeguard: true };
  const fill = beachFilling(beach, { t, countryName: 'Albania' });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.key), ['faces', 'water', 'town']);
  assert.equal(fill.values[0].value, 'card.dirS');
  assert.equal(fill.where, 'Himare, Albania');
  assert.equal(fill.icons[0].code, 'lifeguard');
});

test('a lake: area, depth or altitude, and the warmest month marked as an estimate', () => {
  const lake = { name: 'Lake', size: { areaKm2: 0.07, elevM: 1616 },
    swim: { rule: 'yes', temps: [1, 2, 3, 4, 5, 6, 17.6, 12, 9, 5, 0, -5] }, tags: [], why: [] };
  const fill = lakeFilling(lake, { t, countryName: 'Andorra' });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.key), ['area', 'alt', 'warm']);
  assert.equal(fill.values[0].value, '0.07 km²');
  assert.equal(fill.values[2].value, '~18 °C');
  assert.equal(fill.values[2].title, 'card.estimate');
  assert.equal(fill.icons[0].code, 'swim');
  assert.equal(fill.swim.rule, 'yes');
});

test('a mountain: height (with the harness class), prominence and the way to a higher peak', () => {
  const m = { name: 'Teide', ele: 3715, prom: 3715, isoKm: 47.7, view: { km2: 900, peaks: 0 }, range: 'Tenerife',
    lift: { kind: 'cableCar' }, tags: ['lift', 'summitFood', 'viewpoint'], acc: ['liftTop'],
    diff: { k: 'hike', est: true }, why: [] };
  // difficultyLabel drops a key the catalogue does not carry, so this stub
  // carries the one word it needs.
  const tw = (key, params) => (key === 'mtn.diffHike' ? 'Hike' : t(key, params));
  const fill = mountainFilling(m, { t: tw, countryName: 'Spain' });
  assertCard(fill);
  assert.deepEqual(fill.values.map((v) => v.key), ['height', 'prom', 'higher']);
  assert.equal(fill.values[0].cls, 'places-mcard-ele');
  assert.equal(fill.values[2].value, '47.7 km');
  assert.deepEqual(fill.icons.map((i) => i.code), ['lift', 'food', 'viewpoint']);
  assert.equal(fill.hook[0].text, 'Hike');
  assert.equal(fill.hook[0].est, true);
  assert.ok(!fill.hook.some((h) => /lift/i.test(h.text)), 'the lift is on the photograph, not in the hook');
});

test('a mountain without its isolation falls back to the area in view', () => {
  const m = { name: 'Bump', ele: 900, prom: 40, view: { km2: 120 }, tags: [], why: [] };
  const fill = mountainFilling(m, { t });
  assert.deepEqual(fill.values.map((v) => v.key), ['height', 'prom', 'inView']);
  assert.equal(fill.values[2].value, '120 km²');
});

test('a walk whose name already carries its ref gets no second chip', () => {
  const tr = { name: 'Mount Korab (9/1)', category: 'hike', distance_m: 12100, duration_min: 420,
    f: { ref: '9/1' } };
  const fill = trailFilling({ tr, assoc: {}, kindKey: 'trails.hike' }, { t });
  assert.equal(fill.ref, null);
});
