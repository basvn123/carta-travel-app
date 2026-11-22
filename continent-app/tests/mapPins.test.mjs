// G12 map view: the pin layers (src/browse/explore/mapPins.js). The pill
// source holds only the pills that show (a pin under the floating chrome is
// left out); the best pin draws in its own layer; the hot and the picked pin
// are one-feature sources; a bubble under the chrome leaves too; nothing is
// set again when nothing changed (a new filter or data lays tiles out again,
// which cost the pan its frames); a tap finds the nearest dot within its
// 44 px area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPinFilters, pinAt } from '../src/browse/explore/mapPins.js';

function fakeMap(rendered = {}) {
  const filters = {};
  const data = {};
  const calls = { setData: 0, setFilter: 0, state: 0 };
  const state = {};
  return {
    filters,
    data,
    calls,
    getSource: (id) => ({ setData: (d) => { calls.setData += 1; data[id] = d; } }),
    getLayer: () => true,
    getLayoutProperty: () => 'visible',
    setFilter: (id, f) => { calls.setFilter += 1; filters[id] = f; },
    state,
    removeFeatureState: () => { for (const k of Object.keys(state)) delete state[k]; },
    setFeatureState: ({ id }, s) => { calls.state += 1; state[id] = s; },
    getFeatureState: ({ id }) => state[id] || {},
    queryRenderedFeatures: (where, { layers }) => (Array.isArray(where[0])
      ? (rendered.box || []) : layers.flatMap((l) => rendered[l] || [])),
    project: ([x, y]) => ({ x, y }),
  };
}
const feat = (id) => ({ type: 'Feature', properties: { id, fig: '€1' }, geometry: { type: 'Point', coordinates: [0, 0] } });
const ids = (map) => map.data.dests.features.map((f) => f.properties.id);

test('shown, best, hot and picked pins each have one place to draw', () => {
  const map = fakeMap();
  setPinFilters(map, { shown: ['a', 'b', 'h', 'p'], hiddenClusters: [7], best: 'b', hot: 'h', picked: 'p', featureOf: feat });
  assert.deepEqual(ids(map), ['a', 'b']);
  assert.deepEqual(map.data.dests.features.map((f) => f.properties.best), [0, 1]);
  // New data always re-places a symbol; a new filter did not (the pick at
  // 820 px drew nothing until the camera moved).
  assert.equal(map.data['dests-pick'].features[0].properties.id, 'p');
  assert.equal(map.data['dests-hot'].features[0].properties.id, 'h');
  // A bubble under the chrome fades by state, never by a filter.
  assert.deepEqual(map.state, { 7: { under: true } });
  assert.deepEqual(map.filters, {});
});

test('the best pin shows even when the cap left it out', () => {
  const map = fakeMap();
  setPinFilters(map, { shown: ['a'], best: 'z', featureOf: feat });
  assert.deepEqual(ids(map), ['a', 'z']);
});

test('the same pins again set no data and no filter', () => {
  const map = fakeMap();
  const state = { shown: ['a', 'b'], hiddenClusters: [3], best: 'b', featureOf: feat };
  setPinFilters(map, state);
  const before = { ...map.calls };
  setPinFilters(map, { ...state, shown: ['a', 'b'], hiddenClusters: [3] });
  assert.deepEqual(map.calls, before);
  setPinFilters(map, { ...state, shown: ['b'] });
  assert.equal(map.calls.setData, before.setData + 1);
  assert.equal(map.calls.setFilter, before.setFilter);
});

test('a tap takes a pill first, else the nearest dot within the slop', () => {
  const pill = { properties: { id: 'x' }, geometry: { coordinates: [0, 0] } };
  assert.equal(pinAt(fakeMap({ xpin: [pill] }), { x: 5, y: 5 }), pill);
  const near = { properties: { id: 'n' }, geometry: { coordinates: [10, 10] } };
  const far = { properties: { id: 'f' }, geometry: { coordinates: [30, 30] } };
  assert.equal(pinAt(fakeMap({ box: [far, near] }), { x: 12, y: 12 }), near);
  assert.equal(pinAt(fakeMap({ box: [far] }), { x: 0, y: 0 }, 22), null);
  // A faded bubble under the chrome is no target.
  const bubble = { id: 7, layer: { id: 'xcluster' }, properties: { point_count: 3 }, geometry: { coordinates: [0, 0] } };
  const m = fakeMap({ xcluster: [bubble] });
  m.state[7] = { under: true };
  assert.equal(pinAt(m, { x: 0, y: 0 }), null);
});
