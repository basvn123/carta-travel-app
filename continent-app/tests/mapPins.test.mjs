// G12 map view: the pin layers' filters (src/browse/explore/mapPins.js).
// A pin under the floating chrome leaves the pill layer; the best, the hot
// and the picked pin each draw in their own layer only; a bubble under the
// chrome leaves too; a tap finds the nearest dot within its 44 px area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPinFilters, pinAt } from '../src/browse/explore/mapPins.js';

function fakeMap(rendered = {}) {
  const filters = {};
  return {
    filters,
    getLayer: () => true,
    getLayoutProperty: () => 'visible',
    setFilter: (id, f) => { filters[id] = f; },
    queryRenderedFeatures: (where, { layers }) => (Array.isArray(where[0])
      ? (rendered.box || []) : layers.flatMap((l) => rendered[l] || [])),
    project: ([x, y]) => ({ x, y }),
  };
}

test('hidden, best, hot and picked pins each have one layer', () => {
  const map = fakeMap();
  setPinFilters(map, { hidden: ['a'], hiddenClusters: [7], best: 'b', hot: 'h', picked: 'p' });
  const pill = JSON.stringify(map.filters.xpin);
  for (const id of ['a', 'b', 'h', 'p']) assert.ok(pill.includes(`"${id}"`), id);
  assert.deepEqual(map.filters['xpin-picked'], ['==', ['get', 'id'], 'p']);
  assert.ok(JSON.stringify(map.filters['xpin-best']).includes('"b"'));
  assert.ok(JSON.stringify(map.filters['xpin-hot']).includes('"h"'));
  assert.ok(JSON.stringify(map.filters.xcluster).includes('[7]'));
});

test('no best, hot or pick matches no place', () => {
  const map = fakeMap();
  setPinFilters(map, {});
  assert.deepEqual(map.filters['xpin-picked'], ['==', ['get', 'id'], '\u0000']);
});

test('a tap takes a pill first, else the nearest dot within the slop', () => {
  const pill = { properties: { id: 'x' }, geometry: { coordinates: [0, 0] } };
  assert.equal(pinAt(fakeMap({ xpin: [pill] }), { x: 5, y: 5 }), pill);
  const near = { properties: { id: 'n' }, geometry: { coordinates: [10, 10] } };
  const far = { properties: { id: 'f' }, geometry: { coordinates: [30, 30] } };
  assert.equal(pinAt(fakeMap({ box: [far, near] }), { x: 12, y: 12 }), near);
  assert.equal(pinAt(fakeMap({ box: [far] }), { x: 0, y: 0 }, 22), null);
});
