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

// T1054-b: deleting the account clears this device's copy without asking,
// once the server delete has succeeded (a failed delete keeps everything).
test('deleteAccount clears this device\'s things after the account is gone', () => {
  const src = readFileSync(new URL('../src/auth/AuthContext.jsx', import.meta.url), 'utf8');
  const start = src.indexOf('const deleteAccount = useCallback(');
  assert.ok(start > 0, 'deleteAccount not found');
  const body = src.slice(start, src.indexOf('}, []);', start));
  const rpc = body.indexOf("rpc('delete_user')");
  const thrown = body.indexOf('if (error) throw error;');
  const clear = body.indexOf('clearDeviceThings()');
  assert.ok(rpc > 0 && thrown > rpc, 'the delete RPC and its error check come first');
  assert.ok(clear > thrown, 'clearDeviceThings() runs only after a successful delete');
  assert.doesNotMatch(body, /clearDevice\s*[=:]/, 'deletion does not make clearing optional');
});

// Logic wave 0a (N5, audit J-W5): the clear is complete. The address mirror
// goes whole, with the travel styles, the invite token, typed fares and
// recent searches; settings and one-off notes still stay.
test('the address mirror and every other person key are cleared', () => {
  for (const k of ['continent.state.v1', 'carta.travelStyles.v1', 'carta.pendingCoplan', 'carta.ownFares',
    'carta.finderPlan.once', 'carta.priceDropAsk.v1', 'carta.dock.recent', 'carta.search.recent', 'carta.search.picked']) {
    assert.equal(isDeviceThing(k), true, k);
  }
  for (const k of ['continent.lang.v1', 'continent.guestMode.v1', 'carta.cartaTrips.filters.v1', 'carta.plan.place.v1',
    'carta.dayDetail.v1', 'carta.pendingPass']) {
    assert.equal(isDeviceThing(k), false, k);
  }
  const local = memoryStorage({ 'continent.state.v1': 'cf=IT&dh=50.85,4.35,H&fav=d:BRU&g=3', 'continent.lang.v1': 'nl' });
  clearDeviceThings({ storages: [local], indexedDB: null });
  assert.deepEqual(local.keys(), ['continent.lang.v1']);
  const cookies = readFileSync(new URL('../src/components/CookiesPage.jsx', import.meta.url), 'utf8');
  const block = cookies.slice(cookies.indexOf('your things'), cookies.indexOf('one-off notes'));
  assert.match(block, /continent\.state\.v1/);
});

test('sign-out with a clear and account delete stop persisting and leave for the clean address', () => {
  const auth = readFileSync(new URL('../src/auth/AuthContext.jsx', import.meta.url), 'utf8');
  const signOut = auth.slice(auth.indexOf('const signOut = useCallback('), auth.indexOf('}, []);', auth.indexOf('const signOut = useCallback(')));
  assert.ok(signOut.indexOf('stopPersisting()') > 0 && signOut.indexOf('stopPersisting()') < signOut.indexOf('clearDeviceThings()'));
  const del = auth.slice(auth.indexOf('const deleteAccount = useCallback('), auth.indexOf('}, []);', auth.indexOf('const deleteAccount = useCallback(')));
  assert.ok(del.indexOf('stopPersisting()') > 0 && del.indexOf('stopPersisting()') < del.indexOf('clearDeviceThings()'));
  const panel = readFileSync(new URL('../src/auth/AccountPanel.jsx', import.meta.url), 'utf8');
  const fin = panel.slice(panel.indexOf('const finishSignOut = async'), panel.indexOf('const signOutEverywhere'));
  assert.match(fin, /leaveForCleanAddress\(\)/);
  assert.doesNotMatch(fin, /reload\(/);
  assert.match(panel, /await deleteAccount\(\);\s*onClose\(\);\s*leaveForCleanAddress\(\);/);
  const leave = panel.slice(panel.indexOf('function leaveForCleanAddress'), panel.indexOf('function leaveForCleanAddress') + 300);
  assert.match(leave, /location\.assign\(window\.location\.origin \+ window\.location\.pathname\)/);
});

test('after stopPersisting the address and the mirror are left alone', async () => {
  const store = new Map();
  const calls = [];
  globalThis.window = {
    location: { search: '?fav=d:BRU', pathname: '/nl/', hash: '' },
    history: { state: null, replaceState: (...a) => calls.push(a) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
  try {
    const { persistState, stopPersisting } = await import('../src/lib/urlState.js');
    persistState({ choices: { group_size: 2 } });
    assert.equal(calls.length, 1);
    assert.equal(store.size, 1);
    store.clear();
    stopPersisting();
    persistState({ choices: { group_size: 3, drive_home: { lat: 50.8, lon: 4.3, name: 'H' } } });
    assert.equal(calls.length, 1);
    assert.equal(store.size, 0);
  } finally {
    delete globalThis.window;
  }
});

// Judge 1 (N5): a failed remote sign-out still clears the device, because
// AccountPanel leaves for the clean address in its own `finally`.
test('sign-out with remove clears the device even when the remote sign-out fails', () => {
  const auth = readFileSync(new URL('../src/auth/AuthContext.jsx', import.meta.url), 'utf8');
  const start = auth.indexOf('const signOut = useCallback(');
  const body = auth.slice(start, auth.indexOf('}, []);', start));
  assert.match(body, /try \{\s*await supabase\.auth\.signOut\(\);\s*\} finally \{[\s\S]*if \(clearDevice\) \{ stopPersisting\(\); clearDeviceThings\(\); \}/);
});
