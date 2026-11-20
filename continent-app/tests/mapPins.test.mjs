// G12 map view: the pin layers' filters (src/browse/explore/mapPins.js).
// A pin under the floating chrome leaves the pill layer; the best pin draws
// in its own layer; the hot and the picked pin are one-feature sources; a
// bubble under the chrome leaves too; a tap finds the nearest dot within
// its 44 px area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPinFilters, pinAt } from '../src/browse/explore/mapPins.js';

function fakeMap(rendered = {}) {
  const filters = {};
  const data = {};
  return {
    filters,
    data,
    getSource: (id) => ({ setData: (d) => { data[id] = d; } }),
    getLayer: () => true,
    getLayoutProperty: () => 'visible',
    setFilter: (id, f) => { filters[id] = f; },
    queryRenderedFeatures: (where, { layers }) => (Array.isArray(where[0])
      ? (rendered.box || []) : layers.flatMap((l) => rendered[l] || [])),
    project: ([x, y]) => ({ x, y }),
  };
}
const feat = (id) => ({ type: 'Feature', properties: { id, fig: '€1' }, geometry: { type: 'Point', coordinates: [0, 0] } });

test('hidden, best, hot and picked pins each have one place to draw', () => {
  const map = fakeMap();
  setPinFilters(map, { hidden: ['a'], hiddenClusters: [7], best: 'b', hot: 'h', picked: 'p', featureOf: feat });
  const pill = JSON.stringify(map.filters.xpin);
  for (const id of ['a', 'b', 'h', 'p']) assert.ok(pill.includes(`"${id}"`), id);
  assert.ok(JSON.stringify(map.filters['xpin-best']).includes('"b"'));
  // New data always re-places a symbol; a new filter did not (the pick at
  // 820 px drew nothing until the camera moved).
  assert.equal(map.data['dests-pick'].features[0].properties.id, 'p');
  assert.equal(map.data['dests-hot'].features[0].properties.id, 'h');
  assert.ok(JSON.stringify(map.filters.xcluster).includes('[7]'));
});

test('no hot or pick leaves their sources empty', () => {
  const map = fakeMap();
  setPinFilters(map, {});
  assert.equal(map.data['dests-pick'].features.length, 0);
  assert.equal(map.data['dests-hot'].features.length, 0);
});

test('a tap takes a pill first, else the nearest dot within the slop', () => {
  const pill = { properties: { id: 'x' }, geometry: { coordinates: [0, 0] } };
  assert.equal(pinAt(fakeMap({ xpin: [pill] }), { x: 5, y: 5 }), pill);
  const near = { properties: { id: 'n' }, geometry: { coordinates: [10, 10] } };
  const far = { properties: { id: 'f' }, geometry: { coordinates: [30, 30] } };
  assert.equal(pinAt(fakeMap({ box: [far, near] }), { x: 12, y: 12 }), near);
  assert.equal(pinAt(fakeMap({ box: [far] }), { x: 0, y: 0 }, 22), null);
});
