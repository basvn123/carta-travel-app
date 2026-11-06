// T1104 (ROADMAP I5): accounts that keep your work. Two simulated devices
// share one stubbed account (an in-memory account_things that answers per
// user, as the 065 row policies do), and the work made on one survives the
// move to the other, with the merge rule of src/auth/accountSync.js when the
// second device already holds work of its own.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncAccountThings, mergeKind, hashBody, readSyncState, SYNC_KEY,
} from '../src/auth/accountSync.js';
import { startNewTrip, listTrips, activeTripId, TRIPS_KEY } from '../src/planner/tripsStore.js';

const KEPT = 'carta.keptTrips.v1';
const SAVES = 'carta.savedJourneys.v1';
const DEVICE = 'carta.deviceTrip.v1';
const PD = 'carta.plannerDraft.v1';
const TD = 'carta.tripDraft.v1';

function device(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    json: (k) => JSON.parse(m.get(k) ?? 'null'),
  };
}

/** The account side: one table, rows per user, the upsert's conflict key. */
function account() {
  const rows = new Map();
  let calls = 0;
  return {
    rows,
    get calls() { return calls; },
    async fetch(userId) {
      calls += 1;
      return [...rows.values()].filter((r) => r.user_id === userId).map((r) => ({ ...r }));
    },
    async upsert(list) {
      for (const r of list) {
        assert.ok(['kept', 'journey', 'trip', 'device_trip'].includes(r.kind), r.kind);
        assert.equal(typeof r.body, 'object');
        rows.set(`${r.user_id}|${r.kind}|${r.item_id}`, { ...r });
      }
    },
    live(userId, kind) {
      return [...rows.values()].filter((r) => r.user_id === userId && r.kind === kind && !r.deleted_at).map((r) => r.item_id).sort();
    },
  };
}

const kept = (id, name, keptAt) => ({ id, name, country: 'PT', keptAt: new Date(keptAt).toISOString(), nights: 4 });
const plannerDraft = (name) => JSON.stringify({
  version: 2,
  settings: { answered: ['when'], when: { mode: 'exact', start: '2026-12-01', end: '2026-12-08', months: [], nights: 7 }, trip: { name, cover: '', created: 1 } },
});
const tripDraft = (ids) => JSON.stringify({ tripStart: '2026-12-01', tripEnd: '2026-12-08', stops: ids.map((d) => ({ destinationId: d, nights: 3 })), planned: true });
const deviceTrip = (key, savedAt, city) => JSON.stringify({ v: 1, key, savedAt, trip: { stops: [{ destinationId: city, nights: 3 }] } });

/** A signed-out phone with one of each thing, and a second trip in progress. */
function phoneWithWork() {
  const phone = device({
    [KEPT]: JSON.stringify([kept('k-porto', 'Porto', 1000), kept('k-split', 'Split', 900)]),
    [SAVES]: JSON.stringify(['j-alps-rail']),
    [PD]: plannerDraft('Balkans'),
    [TD]: tripDraft(['d:sarajevo', 'd:mostar']),
    [DEVICE]: deviceTrip('dt-one', 1500, 'd:lisbon'),
  });
  listTrips(phone, 2000); // tripsStore takes the trip in progress as its first entry
  startNewTrip(phone, 2100); // ...and keeps it in the list when a new one starts
  phone.setItem(PD, plannerDraft('Baltics'));
  phone.setItem(TD, tripDraft(['d:riga']));
  listTrips(phone, 2200);
  return phone;
}

const U = 'user-u';
const V = 'user-v';

test('signed-in work survives a device change: everything made on the phone arrives on a new laptop', async () => {
  const cloud = account();
  const phone = phoneWithWork();
  const first = await syncAccountThings({ userId: U, storage: phone, cloud, now: 5000 });
  // Two kept trips, one bookmark, two trips in progress, the device trip.
  assert.equal(first.moved, 6);
  assert.deepEqual(first.movedByKind, { kept: 2, journey: 1, trip: 2, device_trip: 1 });
  assert.deepEqual(cloud.live(U, 'kept'), ['k-porto', 'k-split']);
  assert.equal(readSyncState(phone).owner, U);

  const laptop = device();
  const res = await syncAccountThings({ userId: U, storage: laptop, cloud, now: 6000 });
  assert.equal(res.moved, 0);
  assert.equal(res.pulled, 6);
  assert.deepEqual(laptop.json(KEPT).map((r) => r.id), ['k-porto', 'k-split']);
  assert.equal(laptop.json(KEPT)[0].name, 'Porto');
  assert.deepEqual(laptop.json(SAVES), ['j-alps-rail']);
  assert.equal(laptop.json(DEVICE).key, 'dt-one');
  const names = listTrips(laptop, 6100).map((t) => t.meta.name).sort();
  assert.deepEqual(names, ['Balkans', 'Baltics']);
  // The laptop's own open trip is a fresh one: nothing arrived in the planner's keys.
  assert.equal(laptop.getItem(TD), null);
  assert.ok(res.changedKeys.includes(KEPT) && res.changedKeys.includes(TRIPS_KEY));

  // A second sync on either device changes nothing and pushes nothing.
  const again = await syncAccountThings({ userId: U, storage: laptop, cloud, now: 7000 });
  assert.equal(again.pushed, 0);
  assert.equal(again.pulled, 0);
  const phoneAgain = await syncAccountThings({ userId: U, storage: phone, cloud, now: 7100 });
  assert.equal(phoneAgain.pushed, 0);
});

test('a signed-out device that already has work: its work joins the account, none of it is replaced', async () => {
  const cloud = account();
  await syncAccountThings({ userId: U, storage: phoneWithWork(), cloud, now: 5000 });
  const tablet = device({
    [KEPT]: JSON.stringify([kept('k-gdansk', 'Gdansk', 3000)]),
    [SAVES]: JSON.stringify(['j-coast', 'j-alps-rail']),
    [DEVICE]: deviceTrip('dt-tablet', 3500, 'd:krakow'),
  });
  const res = await syncAccountThings({ userId: U, storage: tablet, cloud, now: 8000 });
  // Moved: the tablet's kept trip, its new bookmark and its own device trip.
  // The bookmark both had is not moved twice.
  assert.equal(res.movedByKind.kept, 1);
  assert.equal(res.movedByKind.journey, 1);
  assert.equal(res.movedByKind.device_trip, 1);
  assert.deepEqual(tablet.json(KEPT).map((r) => r.id), ['k-gdansk', 'k-porto', 'k-split']);
  assert.deepEqual(tablet.json(SAVES), ['j-coast', 'j-alps-rail']);
  // The device trip slot keeps its own trip; the phone's stays in the account.
  assert.equal(tablet.json(DEVICE).key, 'dt-tablet');
  assert.deepEqual(cloud.live(U, 'device_trip'), ['dt-one', 'dt-tablet']);
  assert.deepEqual(cloud.live(U, 'kept'), ['k-gdansk', 'k-porto', 'k-split']);
  assert.deepEqual(cloud.live(U, 'journey'), ['j-alps-rail', 'j-coast']);
});

test('the same thing changed on two devices: the newer change wins', async () => {
  const cloud = account();
  const phone = device({ [KEPT]: JSON.stringify([kept('k-porto', 'Porto', 1000)]) });
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 2000 });
  const laptop = device();
  await syncAccountThings({ userId: U, storage: laptop, cloud, now: 2100 });

  // The laptop keeps Porto again later (keep() moves it up with a new time and new figures).
  laptop.setItem(KEPT, JSON.stringify([{ ...kept('k-porto', 'Porto', 3000), nights: 6 }]));
  await syncAccountThings({ userId: U, storage: laptop, cloud, now: 3100 });
  // An edit the phone made offline EARLIER (kept at 2500) and syncs only now
  // does not overwrite it...
  phone.setItem(KEPT, JSON.stringify([{ ...kept('k-porto', 'Porto', 2500), nights: 2 }]));
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 3200 });
  assert.equal(phone.json(KEPT)[0].nights, 6);
  // ...and the phone now shows the newer one.
  const row = cloud.rows.get(`${U}|kept|k-porto`);
  assert.equal(row.body.nights, 6);
});

test('a thing removed on one device goes from the others; one changed later comes back', async () => {
  const cloud = account();
  const phone = device({
    [KEPT]: JSON.stringify([kept('k-porto', 'Porto', 1000), kept('k-split', 'Split', 900)]),
    [SAVES]: JSON.stringify(['j-a', 'j-b']),
  });
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 2000 });
  const laptop = device();
  await syncAccountThings({ userId: U, storage: laptop, cloud, now: 2100 });

  // Unkeep Split and unbookmark j-b on the phone.
  phone.setItem(KEPT, JSON.stringify([kept('k-porto', 'Porto', 1000)]));
  phone.setItem(SAVES, JSON.stringify(['j-a']));
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 3000 });
  assert.ok(cloud.rows.get(`${U}|kept|k-split`).deleted_at, 'Split is a tombstone');
  assert.deepEqual(cloud.live(U, 'journey'), ['j-a']);

  const res = await syncAccountThings({ userId: U, storage: laptop, cloud, now: 3100 });
  assert.equal(res.removed, 2);
  assert.deepEqual(laptop.json(KEPT).map((r) => r.id), ['k-porto']);
  assert.deepEqual(laptop.json(SAVES), ['j-a']);

  // A tablet that kept Split again AFTER the removal keeps it, and so does the account.
  const tablet = device({ [KEPT]: JSON.stringify([kept('k-split', 'Split', 4000)]) });
  await syncAccountThings({ userId: U, storage: tablet, cloud, now: 4100 });
  assert.deepEqual(cloud.live(U, 'kept'), ['k-porto', 'k-split']);
  assert.deepEqual(tablet.json(KEPT).map((r) => r.id), ['k-split', 'k-porto']);
});

test('another account on the same device: the first account\'s things leave, signed-out work moves to the new one', async () => {
  const cloud = account();
  const shared = device({ [KEPT]: JSON.stringify([kept('k-porto', 'Porto', 1000)]), [SAVES]: JSON.stringify(['j-u']) });
  await syncAccountThings({ userId: U, storage: shared, cloud, now: 2000 });
  // Signed out (the things stay), then somebody keeps a trip without an account.
  shared.setItem(KEPT, JSON.stringify([kept('k-bled', 'Bled', 2500), kept('k-porto', 'Porto', 1000)]));

  const res = await syncAccountThings({ userId: V, storage: shared, cloud, now: 3000 });
  assert.equal(res.dropped, 2, 'Porto and the bookmark were the first account\'s');
  assert.equal(res.movedByKind.kept, 1);
  assert.deepEqual(cloud.live(V, 'kept'), ['k-bled']);
  assert.deepEqual(cloud.live(V, 'journey'), []);
  assert.deepEqual(shared.json(KEPT).map((r) => r.id), ['k-bled']);
  assert.deepEqual(shared.json(SAVES), []);
  // The first account still has its own, untouched.
  assert.deepEqual(cloud.live(U, 'kept'), ['k-porto']);
  assert.equal(readSyncState(shared).owner, V);

  // Back to the first account: its things come back, Bled stays with V.
  await syncAccountThings({ userId: U, storage: shared, cloud, now: 4000 });
  assert.deepEqual(shared.json(KEPT).map((r) => r.id), ['k-porto']);
  assert.deepEqual(cloud.live(U, 'kept'), ['k-porto']);
});

test('the previous account\'s open trip leaves the planner too, so it never becomes the new account\'s', async () => {
  const cloud = account();
  const shared = device({ [PD]: plannerDraft('Secret trip'), [TD]: tripDraft(['d:oslo']) });
  listTrips(shared, 1000);
  await syncAccountThings({ userId: U, storage: shared, cloud, now: 2000 });
  await syncAccountThings({ userId: V, storage: shared, cloud, now: 3000 });
  assert.equal(shared.getItem(TD), null);
  assert.deepEqual(listTrips(shared, 3100), []);
  assert.deepEqual(cloud.live(V, 'trip'), []);
});

test('the trip open in the planner is never overwritten by the account', async () => {
  const cloud = account();
  const phone = device({ [PD]: plannerDraft('Rome'), [TD]: tripDraft(['d:rome']) });
  listTrips(phone, 1000);
  const openId = activeTripId(phone);
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 2000 });
  // Another device wrote a newer copy of the same trip into the account.
  const row = cloud.rows.get(`${U}|trip|${openId}`);
  cloud.rows.set(`${U}|trip|${openId}`, {
    ...row, body: { ...row.body, keys: { ...row.body.keys, [TD]: tripDraft(['d:rome', 'd:naples']) } },
    updated_at: new Date(9000).toISOString(),
  });
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 3000 });
  assert.equal(phone.getItem(TD), tripDraft(['d:rome']), 'the planner keys are untouched');
  // Once another trip is open, the newer copy arrives.
  startNewTrip(phone, 3100);
  await syncAccountThings({ userId: U, storage: phone, cloud, now: 3200 });
  const entry = phone.json(TRIPS_KEY).trips.find((t) => t.id === openId);
  assert.equal(entry.keys[TD], tripDraft(['d:rome', 'd:naples']));
});

test('an account without migration 065: the sync throws and the device is left as it was', async () => {
  const phone = phoneWithWork();
  const before = JSON.stringify([KEPT, SAVES, TRIPS_KEY, DEVICE].map((k) => phone.getItem(k)));
  const missing = { fetch: async () => { const e = new Error('relation does not exist'); e.code = '42P01'; throw e; }, upsert: async () => {} };
  await assert.rejects(syncAccountThings({ userId: U, storage: phone, cloud: missing, now: 5000 }), (e) => e.code === '42P01');
  assert.equal(JSON.stringify([KEPT, SAVES, TRIPS_KEY, DEVICE].map((k) => phone.getItem(k))), before);
  assert.equal(phone.getItem(SYNC_KEY), null, 'nothing is marked as synced');
});

test('a failed push leaves nothing marked as synced, so the next sync moves it again', async () => {
  const cloud = account();
  const phone = device({ [KEPT]: JSON.stringify([kept('k-porto', 'Porto', 1000)]) });
  const flaky = { fetch: cloud.fetch, upsert: async () => { throw new Error('offline'); } };
  await assert.rejects(syncAccountThings({ userId: U, storage: phone, cloud: flaky, now: 2000 }));
  assert.equal(phone.getItem(SYNC_KEY), null);
  const res = await syncAccountThings({ userId: U, storage: phone, cloud, now: 3000 });
  assert.equal(res.moved, 1);
  assert.deepEqual(cloud.live(U, 'kept'), ['k-porto']);
});

test('mergeKind: the rule table', () => {
  const b = (n) => ({ n });
  const L = (entries) => new Map(entries.map(([id, body, stamp]) => [id, { body, stamp }]));
  const R = (entries) => new Map(entries.map(([id, body, stamp, deleted]) => [id, { body, stamp, deleted: Boolean(deleted) }]));
  const seen = (entries) => Object.fromEntries(entries.map(([id, body, s]) => [id, { s, h: hashBody(body) }]));
  const now = 10000;

  // Local only, never synced: pushed and counted as moved.
  let m = mergeKind({ local: L([['a', b(1), 100]]), remote: R([]), now });
  assert.deepEqual([m.stats.moved, m.push.length, m.next.has('a')], [1, 1, true]);
  // Remote only, never here: pulled.
  m = mergeKind({ local: L([]), remote: R([['a', b(1), 100]]), now });
  assert.deepEqual([m.stats.pulled, m.push.length, m.next.has('a')], [1, 0, true]);
  // Removed here after the last sync: a tombstone, newer than the row.
  m = mergeKind({ local: L([]), remote: R([['a', b(1), 100]]), seen: seen([['a', b(1), 100]]), now });
  assert.equal(m.push[0].deleted, true);
  assert.ok(m.push[0].stamp > 100);
  // Removed here, but the account copy changed after the last sync: it comes back.
  m = mergeKind({ local: L([]), remote: R([['a', b(2), 500]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual([m.next.get('a').body, m.push.length], [b(2), 0]);
  // A tombstone over an unchanged copy: removed here.
  m = mergeKind({ local: L([['a', b(1), 100]]), remote: R([['a', {}, 500, true]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual([m.next.has('a'), m.stats.removed], [false, 1]);
  // A tombstone over a copy changed here later: kept and pushed back.
  m = mergeKind({ local: L([['a', b(3), 900]]), remote: R([['a', {}, 500, true]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual([m.next.has('a'), m.push.length], [true, 1]);
  // Both, the same body: nothing to do.
  m = mergeKind({ local: L([['a', b(1), 100]]), remote: R([['a', b(1), 100]]), seen: seen([['a', b(1), 100]]), now });
  assert.equal(m.push.length + m.stats.pulled, 0);
  // Both, different, the account newer: pulled. This device newer: pushed.
  m = mergeKind({ local: L([['a', b(1), 100]]), remote: R([['a', b(2), 500]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual(m.next.get('a').body, b(2));
  m = mergeKind({ local: L([['a', b(3), 900]]), remote: R([['a', b(2), 500]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual([m.next.get('a').body, m.push.length], [b(3), 1]);
  // A body changed here without its own time moving (the open trip): counts as now.
  m = mergeKind({ local: L([['a', b(3), 100]]), remote: R([['a', b(2), 500]]), seen: seen([['a', b(1), 100]]), now });
  assert.deepEqual([m.next.get('a').body, m.push[0].stamp], [b(3), now]);
  // Locked and the account newer: held, not pulled, not pushed.
  m = mergeKind({ local: L([['a', b(1), 100]]), remote: R([['a', b(2), 500]]), seen: seen([['a', b(1), 100]]), locked: new Set(['a']), now });
  assert.deepEqual([m.next.get('a').body, m.next.get('a').hold, m.push.length], [b(1), true, 0]);
});

test('hashBody ignores key order', () => {
  assert.equal(hashBody({ a: 1, b: [1, { c: 2, d: 3 }] }), hashBody({ b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.notEqual(hashBody({ a: 1 }), hashBody({ a: 2 }));
});
