// QUOTA-016 (logic wave 0a, ROADMAP I5/N5, owner default 11): a trip a
// friend shares to co-plan never counts toward the free plan's one trip, and
// a device trip is never kept over it.
// Run: node --test tests/ownTrips.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { ownTrips, deviceMeetsAccount } = await import('../src/planner/deviceTripStore.js');

const stored = { key: 'k1', trip: { stops: [{ destinationId: 'FCO' }] } };

test('co-planned trips are not the traveller\'s own', () => {
  const plans = [{ id: 1, coplan: true }, { id: 2, coplan: false }, { id: 3 }];
  assert.deepEqual(ownTrips(plans).map((p) => p.id), [2, 3]);
  assert.deepEqual(ownTrips(null), []);
});

test('only a co-planned trip on the account: the device trip moves across', () => {
  const own = ownTrips([{ id: 9, coplan: true }]);
  assert.equal(own.length, 0);
  assert.equal(deviceMeetsAccount(stored, own.length, false), 'move');
});

test('the keep choice offers the traveller\'s own trip, never the friend\'s', () => {
  const own = ownTrips([{ id: 9, coplan: true }, { id: 4 }]);
  assert.equal(deviceMeetsAccount(stored, own.length, false), 'choose');
  assert.equal(own[0].id, 4);
});

test('both count sites in useTripSave use the own list', () => {
  const src = readFileSync(new URL('../src/planner/trip/useTripSave.js', import.meta.url), 'utf8');
  assert.equal((src.match(/fetchTripPlans\(user\.id\)/g) || []).length, 2);
  assert.equal((src.match(/existing = ownTrips\(await fetchTripPlans\(user\.id\)\)/g) || []).length, 2);
});
