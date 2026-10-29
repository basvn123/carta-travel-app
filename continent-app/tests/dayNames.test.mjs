import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPlaceNames, townItems, needsShard } from '../src/planner/trip/dayNames.js';

const dest = { id: 'LJU', activities: { items: [{ name: 'Castle' }, { name: 'Market' }] } };
const full = [{ name: 'Castle' }, { name: 'Dragon Bridge' }, { name: 'Market' }, { name: 'Tivoli Park' }];
const customs = [{ name: 'Dinner at Gostilna' }];

test('a day reads back its places from the full list the planner used, own places after it', () => {
  assert.deepEqual(dayPlaceNames({ dest, picks: [1, 3, 4], fetched: { LJU: full }, customs }), ['Dragon Bridge', 'Tivoli Park', 'Dinner at Gostilna']);
});

test('without the full list the short list and own places stand in, and unknown indices are left out', () => {
  assert.deepEqual(dayPlaceNames({ dest, picks: [0, 2, 9], customs }), ['Castle', 'Dinner at Gostilna']);
  assert.deepEqual(dayPlaceNames({ dest, picks: [] }), []);
});

test('a town carrying its full list needs no shard', () => {
  assert.equal(needsShard(dest), true);
  assert.equal(needsShard({ activities: { items_full: full } }), false);
  assert.equal(townItems({ id: 'x', activities: { items_full: full } }).length, 4);
});
