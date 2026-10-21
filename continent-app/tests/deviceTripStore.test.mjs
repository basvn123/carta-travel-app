import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_TRIP_KEY, loadDeviceTrip, saveDeviceTrip, clearDeviceTrip,
  deviceSaveDecision, deviceMeetsAccount, newDeviceKey,
} from '../src/planner/deviceTripStore.js';

function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const trip = { stops: [{ destinationId: 'TIA', nights: 3 }], planLabel: 'Albania' };

test('a kept trip reads back as written', () => {
  const s = memoryStore();
  assert.equal(saveDeviceTrip({ key: 'k1', trip }, s, 5), true);
  const d = loadDeviceTrip(s);
  assert.equal(d.key, 'k1');
  assert.equal(d.savedAt, 5);
  assert.deepEqual(d.trip, trip);
  clearDeviceTrip(s);
  assert.equal(loadDeviceTrip(s), null);
});

test('a private window that keeps nothing is a failure, not a save', () => {
  const throwing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
  assert.equal(saveDeviceTrip({ key: 'k', trip }, throwing), false);
  const forgetful = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.equal(saveDeviceTrip({ key: 'k', trip }, forgetful), false);
  assert.equal(saveDeviceTrip({ key: 'k', trip }, null), false);
});

test('a corrupt or empty record reads as no trip', () => {
  const s = memoryStore();
  s.setItem(DEVICE_TRIP_KEY, '{not json');
  assert.equal(loadDeviceTrip(s), null);
  s.setItem(DEVICE_TRIP_KEY, JSON.stringify({ v: 1, key: 'k', trip: { stops: [] } }));
  assert.equal(loadDeviceTrip(s), null);
});

test('the same trip saves again; another trip is a second trip', () => {
  assert.equal(deviceSaveDecision(null, null), 'write');
  assert.equal(deviceSaveDecision({ key: 'a' }, 'a'), 'write');
  assert.equal(deviceSaveDecision({ key: 'a' }, 'b'), 'second');
  assert.equal(deviceSaveDecision({ key: 'a' }, null), 'second');
});

test('at sign-in the traveller chooses only when the free account already has a trip', () => {
  assert.equal(deviceMeetsAccount(null, 3, false), 'none');
  assert.equal(deviceMeetsAccount({ key: 'a' }, 0, false), 'move');
  assert.equal(deviceMeetsAccount({ key: 'a' }, 2, true), 'move');
  assert.equal(deviceMeetsAccount({ key: 'a' }, 1, false), 'choose');
});

test('device keys are distinct', () => {
  assert.notEqual(newDeviceKey(), newDeviceKey());
});
