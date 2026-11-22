// G12 Volgen (decision 6): the watch store's append rules, the move since
// the start, the lowest price, and the account merge and sync (kind 'watch',
// migration 076). Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendPoint, deltaSinceStart, lowest, latest, watch, unwatch, recordPrice, setWatchAlert,
  listWatched, readWatchState, seedWatch, mergeWatch, syncWatch, resetWatchSyncForTests, watchId, MAX_POINTS,
} from '../src/lib/watchStore.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const base = { id: 'stay:zauner', kind: 'stay', ref: 'zauner', label: 'Gasthof Zauner', pts: [], alert: false };

test('a point is added on a new price or a new day, never twice the same', () => {
  let it = appendPoint(base, { at: '2026-10-01T08:00:00Z', eur: 146 });
  assert.equal(it.pts.length, 1);
  assert.equal(appendPoint(it, { at: '2026-10-01T18:00:00Z', eur: 146 }), it);
  it = appendPoint(it, { at: '2026-10-01T19:00:00Z', eur: 142 });
  assert.equal(it.pts.length, 2);
  it = appendPoint(it, { at: '2026-10-02T08:00:00Z', eur: 142 });
  assert.equal(it.pts.length, 3);
  assert.equal(appendPoint(it, { at: '2026-09-01T08:00:00Z', eur: 99 }), it, 'an older measurement is not news');
  assert.equal(appendPoint(it, { at: '2026-10-03T08:00:00Z', eur: null }), it);
  assert.equal(appendPoint(it, { at: 'soon', eur: 120 }), it);
});

test('the history is capped but keeps the first point', () => {
  let it = base;
  for (let i = 0; i < MAX_POINTS + 20; i += 1) {
    it = appendPoint(it, { at: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(), eur: 100 + (i % 7) });
  }
  assert.equal(it.pts.length, MAX_POINTS);
  assert.equal(it.pts[0].at.slice(0, 10), '2026-01-01');
});

test('delta since the start, the lowest and the latest', () => {
  const it = { ...base, pts: [{ at: '2026-10-01', eur: 146 }, { at: '2026-10-08', eur: 118 }, { at: '2026-10-15', eur: 118 }, { at: '2026-11-21', eur: 126 }] };
  assert.equal(deltaSinceStart(it), -20);
  assert.deepEqual(lowest(it), { at: '2026-10-08', eur: 118 });
  assert.equal(latest(it).eur, 126);
  assert.equal(deltaSinceStart(base), null);
  assert.equal(lowest(base), null);
});

test('follow, measure, alert and stop on the device', () => {
  const storage = mem();
  const now = Date.UTC(2026, 10, 1);
  const w = watch({ kind: 'day', ref: 'LJU', label: 'Ljubljana', eur: 84 }, { storage, now });
  assert.equal(w.id, watchId('day', 'LJU'));
  assert.equal(w.pts.length, 1);
  assert.equal(watch({ kind: 'nope', ref: 'x' }, { storage }), null);
  assert.equal(recordPrice(w.id, { at: '2026-11-02T08:00:00Z', eur: 80 }, { storage }), true);
  assert.equal(recordPrice(w.id, { at: '2026-11-02T09:00:00Z', eur: 80 }, { storage }), false);
  setWatchAlert(w.id, true, { storage, now: now + 5 });
  assert.equal(listWatched(storage)[0].alert, true);
  unwatch(w.id, { storage, now: now + 9 });
  assert.equal(listWatched(storage).length, 0);
  assert.equal(readWatchState(storage).removed[w.id], now + 9);
});

test('the seam seeds once', () => {
  const storage = mem();
  const items = [{ ...base, pts: [{ at: '2026-10-01T08:00:00Z', eur: 146 }] }];
  seedWatch(items, { storage });
  seedWatch([{ ...base, id: 'other' }], { storage });
  assert.deepEqual(listWatched(storage).map((x) => x.id), ['stay:zauner']);
});

test('merge: points of both copies kept, newer fields win, tombstones travel', () => {
  const local = {
    v: 1, owner: 'u1', removed: { 'day:OLD': 50 },
    items: { 'stay:zauner': { ...base, alert: true, at: 200, pts: [{ at: '2026-10-01', eur: 146 }, { at: '2026-10-08', eur: 139 }] } },
  };
  const remote = [
    { kind: 'watch', item_id: 'stay:zauner', body: { ...base, alert: false, at: 100, pts: [{ at: '2026-10-01', eur: 146 }, { at: '2026-10-05', eur: 142 }] }, updated_at: '2026-10-05', deleted_at: null },
    { kind: 'watch', item_id: 'day:BLED', body: { id: 'day:BLED', kind: 'day', ref: 'BLED', at: 90, pts: [] }, updated_at: '2026-10-01', deleted_at: null },
    { kind: 'taste', item_id: 'x', body: {}, updated_at: '2026-10-01', deleted_at: null },
  ];
  const { state, rows } = mergeWatch(local, remote, 'u1');
  const z = state.items['stay:zauner'];
  assert.equal(z.alert, true);
  assert.deepEqual(z.pts.map((p) => p.eur), [146, 142, 139]);
  assert.ok(state.items['day:BLED']);
  assert.deepEqual(rows.map((r) => r.item_id).sort(), ['stay:zauner']);
  assert.equal(rows.every((r) => r.kind === 'watch'), true);
  const other = mergeWatch({ ...local, owner: 'u2' }, [], 'u1');
  assert.deepEqual(other.state.items, {}, 'another account\'s items are never copied over');
});

test('sync turns itself off when the kind is not allowed yet (no 076)', async () => {
  resetWatchSyncForTests();
  const storage = mem();
  watch({ kind: 'stay', ref: 'z', eur: 100 }, { storage, now: 1 });
  let calls = 0;
  const cloud = { fetch: async () => { calls += 1; return []; }, upsert: async () => { throw Object.assign(new Error('check'), { code: '23514' }); } };
  assert.equal((await syncWatch({ userId: 'u1', storage, cloud })).ok, false);
  assert.equal((await syncWatch({ userId: 'u1', storage, cloud })).ok, false);
  assert.equal(calls, 1);
  const ok = { fetch: async () => [], upsert: async (rows) => { assert.equal(rows.length, 1); } };
  resetWatchSyncForTests();
  assert.deepEqual(await syncWatch({ userId: 'u1', storage, cloud: ok }), { ok: true, pushed: 1 });
  assert.equal(readWatchState(storage).owner, 'u1');
});
