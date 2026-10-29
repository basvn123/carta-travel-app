import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyHistory, record, undoStep, redoStep, describeChange, HISTORY_CAP,
} from '../src/planner/trip/editHistory.js';

const trip = (over = {}) => ({
  tripStart: '2026-11-21', tripEnd: '2026-11-28', groupSize: 2, children: 0, babies: 0,
  stops: [{ destinationId: 'hal', nights: 4 }, { destinationId: 'szg', nights: 3 }],
  set: { from: { name: 'Brussels' }, name: 'Austria' },
  ...over,
});

test('a change is one step; undo returns the state before it, redo the one after', () => {
  const a = trip();
  const b = trip({ stops: [{ destinationId: 'hal', nights: 4 }] });
  let h = record(emptyHistory(), a, b, { now: 1000 });
  assert.equal(h.past.length, 1);
  assert.equal(h.last.kind, 'stopRemoved');
  assert.equal(h.last.id, 'szg');
  const u = undoStep(h, b);
  assert.deepEqual(u.state, a);
  h = u.history;
  const r = redoStep(h, a);
  assert.deepEqual(r.state, b);
  assert.equal(r.history.past.length, 1);
});

test('a burst of the same change folds into one step that undoes the whole burst', () => {
  const s4 = trip();
  const s5 = trip({ stops: [{ destinationId: 'hal', nights: 5 }, { destinationId: 'szg', nights: 3 }] });
  const s6 = trip({ stops: [{ destinationId: 'hal', nights: 6 }, { destinationId: 'szg', nights: 3 }] });
  let h = record(emptyHistory(), s4, s5, { now: 1000 });
  h = record(h, s5, s6, { now: 1400 });
  assert.equal(h.past.length, 1);
  assert.deepEqual(undoStep(h, s6).state, s4);
  // the same change after the window is a new step
  const s7 = trip({ stops: [{ destinationId: 'hal', nights: 7 }, { destinationId: 'szg', nights: 3 }] });
  h = record(h, s6, s7, { now: 5000 });
  assert.equal(h.past.length, 2);
});

test('a different change inside the window is its own step', () => {
  const a = trip();
  const b = trip({ stops: [{ destinationId: 'hal', nights: 5 }, { destinationId: 'szg', nights: 3 }] });
  const c = trip({ stops: [{ destinationId: 'hal', nights: 5 }, { destinationId: 'szg', nights: 2 }] });
  let h = record(emptyHistory(), a, b, { now: 1000 });
  h = record(h, b, c, { now: 1400 });
  assert.equal(h.past.length, 2);
});

test('an equal state records nothing, and a new change clears redo', () => {
  const a = trip();
  assert.deepEqual(record(emptyHistory(), a, trip(), { now: 1 }), emptyHistory());
  const b = trip({ groupSize: 3 });
  let h = record(emptyHistory(), a, b, { now: 1 });
  h = undoStep(h, b).history;
  assert.equal(h.future.length, 1);
  h = record(h, a, trip({ groupSize: 4 }), { now: 9000 });
  assert.equal(h.future.length, 0);
});

test('the history keeps at most HISTORY_CAP steps', () => {
  let h = emptyHistory();
  let s = trip();
  for (let i = 0; i < HISTORY_CAP + 10; i += 1) {
    const n = trip({ groupSize: i + 3 });
    h = record(h, s, n, { now: i * 10000 });
    s = n;
  }
  assert.equal(h.past.length, HISTORY_CAP);
});

test('describeChange names what moved', () => {
  const a = trip();
  assert.equal(describeChange(a, trip({ stops: [...a.stops].reverse() })).kind, 'stopsMoved');
  assert.equal(describeChange(a, trip({ stops: [a.stops[0], { destinationId: 'ischl', nights: 3 }] })).kind, 'stopSwapped');
  assert.equal(describeChange(a, trip({ stops: [...a.stops, { destinationId: 'vie', nights: 2 }] })).id, 'vie');
  assert.equal(describeChange(a, trip({ tripEnd: '2026-11-29' })).kind, 'dates');
  assert.equal(describeChange(a, trip({ tripEnd: '2026-11-29', stops: [{ destinationId: 'hal', nights: 5 }, a.stops[1]] })).kind, 'balanced');
  assert.equal(describeChange(a, trip({ children: 1 })).kind, 'people');
  assert.equal(describeChange(a, trip({ set: { ...a.set, from: { name: 'Ghent' } } })).kind, 'from');
  assert.equal(describeChange(a, trip({ set: { ...a.set, name: 'Alps' } })).kind, 'name');
  assert.equal(describeChange(a, trip({ ownStays: { hal: 300 } })).kind, 'other');
  // the settings' own copy of the dates and the party fold into those steps
  assert.equal(describeChange(a, trip({ set: { ...a.set, when: { start: '2026-12-01' } } })).kind, 'dates');
  assert.equal(describeChange(a, trip({ set: { ...a.set, party: { adults: 3 } } })).kind, 'people');
});

test('changes of one action a few milliseconds apart are one step, named by the telling one', () => {
  const a = trip();
  const b = trip({ anchorOrigin: null, x: 1 });
  const c = { ...b, set: { ...b.set, from: { name: 'Ghent' } } };
  let h = record(emptyHistory(), a, b, { now: 1000 });
  h = record(h, b, c, { now: 1040 });
  assert.equal(h.past.length, 1);
  assert.equal(h.last.kind, 'from');
  assert.deepEqual(undoStep(h, c).state, a);
});

test('a change right after an Undo is a new step (the history has no last change then)', () => {
  const a = trip();
  const b = trip({ groupSize: 3 });
  let h = record(emptyHistory(), a, b, { now: 1000 });
  h = record(h, b, trip({ groupSize: 4 }), { now: 5000 });
  h = undoStep(h, trip({ groupSize: 4 })).history;
  assert.equal(h.last, null);
  h = record(h, b, trip({ children: 1, groupSize: 3 }), { now: 5100 });
  assert.equal(h.past.length, 2);
  assert.equal(h.last.kind, 'people');
});
