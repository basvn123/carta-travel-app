// T1054 (ROADMAP N5, audit P-09): signing out can remove this device's copy of
// the traveller's own things, and leaves settings and the sign-in alone.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { isDeviceThing, clearDeviceThings, DEVICE_THING_KEYS } = await import('../src/lib/deviceData.js');

function memoryStorage(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

test('trips, bookings, crew and chats are the traveller\'s things; settings are not', () => {
  for (const k of ['carta.trips.v1', 'carta.booked.trip-42', 'carta.together.me',
    'carta.dayplan.tripdraft', 'carta.ask.chats.v1', 'carta.mytrips.done.v1', 'carta.dayChat.v1:abc']) {
    assert.equal(isDeviceThing(k), true, k);
  }
  for (const k of ['continent.lang.v1', 'carta.tripLength', 'carta.destFolds.v2',
    'carta.paywall.snooze.v1', 'sb-abc-auth-token', 'carta.tripsX', 'carta.booked', null]) {
    assert.equal(isDeviceThing(k), false, String(k));
  }
});

test('clearDeviceThings empties both storages of things and deletes the file database', () => {
  const local = memoryStorage({
    'carta.trips.v1': '[]', 'carta.booked.t1': '{}', 'carta.together.hiddenMeets': '[]',
    'continent.lang.v1': 'nl', 'carta.tripLength': '7', 'sb-x-auth-token': 'session',
  });
  const session = memoryStorage({ 'carta.tripDraft.v1': '{}', 'carta:boot': '1' });
  const deleted = [];
  const n = clearDeviceThings({ storages: [local, session], indexedDB: { deleteDatabase: (d) => deleted.push(d) } });
  assert.equal(n, 4);
  assert.deepEqual(local.keys(), ['carta.tripLength', 'continent.lang.v1', 'sb-x-auth-token']);
  assert.deepEqual(session.keys(), ['carta:boot']);
  assert.deepEqual(deleted, ['carta-files']);
});

test('a blocked storage or a missing IndexedDB never throws', () => {
  const blocked = { get length() { throw new Error('blocked'); } };
  assert.equal(clearDeviceThings({ storages: [blocked, null], indexedDB: undefined }), 0);
});

test('every key the cookies page lists under "your things" is covered', () => {
  const src = readFileSync(new URL('../src/components/CookiesPage.jsx', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('your things'), src.indexOf('one-off notes'));
  const listed = [...block.matchAll(/carta\.[A-Za-z.*0-9]+/g)].map((m) => m[0].replace(/\.$/, ''));
  assert.ok(listed.length >= 15, `found ${listed.length} keys in the cookies page`);
  for (const k of listed) {
    const probe = k.endsWith('*') ? k.slice(0, -1) + 'x' : k;
    assert.equal(isDeviceThing(probe), true, `${k} is listed under "your things" but not cleared`);
  }
  assert.ok(DEVICE_THING_KEYS.length >= listed.length - 2);
});
