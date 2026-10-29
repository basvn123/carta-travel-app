// T809: the trips kept on this device (planner/tripsStore.js): the first run
// keeps the one trip in progress, a new trip keeps the last one, opening a
// trip writes its keys back, delete, and the open-or-start door that loads
// an account trip without writing over another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIPS_KEY, TRIP_KEYS, ensure, listTrips, openTrip, startNewTrip, deleteTrip,
  openOrStart, summarize, hasContent, activeTripId,
} from '../src/planner/tripsStore.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

const PD = 'carta.plannerDraft.v1';
const TD = 'carta.tripDraft.v1';
const plannerDraft = (name, extra = {}) => JSON.stringify({
  version: 2,
  settings: { answered: ['when'], when: { mode: 'exact', start: '2026-12-01', end: '2026-12-08', months: [], nights: 7 }, trip: { name, cover: '', created: 1 }, ...extra },
});
const tripDraft = (stops, extra = {}) => JSON.stringify({ tripStart: '2026-12-01', tripEnd: '2026-12-08', stops, planned: true, ...extra });

test('the first run keeps the trip in progress as the first entry', () => {
  const s = fakeStorage({ [PD]: plannerDraft('Lisbon week'), [TD]: tripDraft([{ destinationId: 'lis', nights: 4 }, { destinationId: 'por', nights: 3 }]) });
  const rec = ensure(s, 1000);
  assert.equal(rec.trips.length, 1);
  assert.equal(rec.trips[0].id, rec.activeId);
  const [one] = listTrips(s, 1000);
  assert.equal(one.meta.name, 'Lisbon week');
  assert.equal(one.meta.nights, 7);
  assert.deepEqual(one.meta.stops, ['lis', 'por']);
  assert.equal(one.meta.status, 'planned');
  assert.equal(one.active, true);
  // Nothing of the trip itself moved.
  assert.ok(s.getItem(PD) && s.getItem(TD));
});

test('a device with nothing in progress starts with an empty list', () => {
  const s = fakeStorage();
  assert.equal(listTrips(s).length, 0);
  assert.ok(activeTripId(s));
  assert.ok(s.getItem(TRIPS_KEY));
});

test('start new keeps the last trip and clears every trip key', () => {
  const s = fakeStorage({ [PD]: plannerDraft('First'), [TD]: tripDraft([{ destinationId: 'a', nights: 2 }]), 'carta.dayplan.tripdraft': '{"x":1}' });
  const first = activeTripId(s);
  const next = startNewTrip(s, 2000);
  assert.notEqual(next, first);
  for (const k of TRIP_KEYS) assert.equal(s.getItem(k), null, k);
  // The new trip is empty, so only the first is listed.
  const list = listTrips(s, 2001);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, first);
  assert.equal(list[0].active, false);
});

test('open writes the target back and keeps the open trip', () => {
  const s = fakeStorage({ [PD]: plannerDraft('First'), [TD]: tripDraft([{ destinationId: 'a', nights: 2 }]) });
  const first = activeTripId(s);
  const second = startNewTrip(s, 2000);
  s.setItem(PD, plannerDraft('Second'));
  assert.equal(listTrips(s, 3000).length, 2);
  assert.equal(openTrip(first, s, 4000), true);
  assert.equal(activeTripId(s), first);
  assert.equal(JSON.parse(s.getItem(PD)).settings.trip.name, 'First');
  assert.ok(s.getItem(TD));
  // The second came along in the list, its own keys only (no trip draft).
  assert.equal(openTrip(second, s, 5000), true);
  assert.equal(JSON.parse(s.getItem(PD)).settings.trip.name, 'Second');
  assert.equal(s.getItem(TD), null);
  // Opening the open trip changes nothing.
  assert.equal(openTrip(second, s, 6000), false);
});

test('the latest work comes first', () => {
  const s = fakeStorage({ [PD]: plannerDraft('Old') });
  startNewTrip(s, 2000);
  s.setItem(PD, plannerDraft('New'));
  const list = listTrips(s, 3000);
  assert.deepEqual(list.map((x) => x.meta.name), ['New', 'Old']);
});

test('delete drops a trip; deleting the open one leaves a new empty trip open', () => {
  const s = fakeStorage({ [PD]: plannerDraft('First') });
  const first = activeTripId(s);
  startNewTrip(s, 2000);
  s.setItem(PD, plannerDraft('Second'));
  const second = activeTripId(s);
  deleteTrip(first, s, 3000);
  assert.deepEqual(listTrips(s, 3001).map((x) => x.id), [second]);
  const after = deleteTrip(second, s, 4000);
  assert.notEqual(after, second);
  assert.equal(s.getItem(PD), null);
  assert.equal(listTrips(s, 4001).length, 0);
});

test('open or start: an account plan opens its entry, else a new trip', () => {
  const s = fakeStorage({ [PD]: plannerDraft('Mine'), [TD]: tripDraft([{ destinationId: 'a', nights: 2 }], { planId: 'p1' }) });
  const mine = activeTripId(s);
  // Another plan: the open trip is kept, a new trip takes the load.
  assert.equal(openOrStart((m) => m.planId === 'p2', s, 2000), true);
  assert.notEqual(activeTripId(s), mine);
  assert.equal(s.getItem(TD), null);
  // p1 again: back to its entry.
  assert.equal(openOrStart((m) => m.planId === 'p1', s, 3000), true);
  assert.equal(activeTripId(s), mine);
  // An empty open trip simply takes the load.
  startNewTrip(s, 4000);
  assert.equal(openOrStart((m) => m.planId === 'p9', s, 5000), false);
});

test('summary: months, status and what counts as a trip', () => {
  const pd = JSON.stringify({ settings: { answered: [], when: { mode: 'months', months: [5, 6], nights: 7 }, trip: { name: '', created: 0 } } });
  assert.equal(hasContent({ [PD]: pd }), false);
  const m = summarize({ [PD]: pd });
  assert.deepEqual(m.months, [5, 6]);
  assert.equal(m.nights, null, 'nights not answered are not shown');
  assert.equal(m.status, 'planning');
  assert.equal(hasContent({ [TD]: tripDraft([{ destinationId: 'x', nights: 1 }]) }), true);
  assert.equal(summarize({ [PD]: 'not json' }).name, '');
});

test('a full or blocked storage never throws', () => {
  const s = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => listTrips(s));
  assert.doesNotThrow(() => startNewTrip(s));
  assert.doesNotThrow(() => deleteTrip('x', s));
});
