// T923 to T926: what My trips derives for its new tabs, in lib/myTrips.js.
// Readiness counts only what the trip, its bookings and its day plans hold.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessSteps, plannedDayNumbers, tripStops } from '../src/lib/myTrips.js';

const PLAN = {
  id: 'p1',
  start_date: '2026-11-20',
  end_date: '2026-11-26',
  stops: [
    { destination_id: 'LIS', arrive_date: '2026-11-20', depart_date: '2026-11-23' },
    { destination_id: 'OPO', arrive_date: '2026-11-23', depart_date: '2026-11-26' },
  ],
  choices: { groupSize: 2 },
};

test('tripStops: nights from the stop dates', () => {
  assert.deepEqual(tripStops(PLAN).map((s) => [s.id, s.nights]), [['LIS', 3], ['OPO', 3]]);
});

test('readinessSteps: an empty trip has only its dates', () => {
  const r = readinessSteps(PLAN, {});
  assert.equal(r.done, 1);
  assert.equal(r.next, 'travel');
  const beds = r.steps.find((s) => s.key === 'beds');
  assert.deepEqual([beds.n, beds.of, beds.done], [0, 2, false]);
  const days = r.steps.find((s) => s.key === 'days');
  assert.deepEqual([days.n, days.of], [0, 6]);
});

test('readinessSteps: a filled flight row, one stay and planned days count', () => {
  const extras = {
    bookings: { 'flight-out': { ref: 'TP1' }, 'stay-1': { price: '318' }, 'stay-0': { label: 'only a label' } },
    dayNotes: { 1: 'Belem', 2: ' ' },
    dayExtras: { 5: [{ name: 'Tram 28' }] },
  };
  const assignments = { 0: { 2: [4, 7] }, 1: { 0: [] } };
  const r = readinessSteps(PLAN, { extras, assignments });
  assert.equal(r.steps.find((s) => s.key === 'travel').done, true);
  assert.equal(r.steps.find((s) => s.key === 'beds').n, 1);
  assert.deepEqual(plannedDayNumbers(PLAN, { extras, assignments }), [1, 3, 5]);
  assert.equal(r.steps.find((s) => s.key === 'days').n, 3);
  assert.equal(r.next, 'beds');
});

test('readinessSteps: a typed stay price books that stop; the planner flight marked booked counts', () => {
  const plan = { ...PLAN, choices: { ownFlight: { booked: true }, ownStays: { LIS: 300, OPO: 280 } } };
  const r = readinessSteps(plan, {});
  assert.equal(r.steps.find((s) => s.key === 'travel').done, true);
  assert.equal(r.steps.find((s) => s.key === 'beds').done, true);
});

test('readinessSteps: no dates, no dates step', () => {
  const r = readinessSteps({ ...PLAN, start_date: null, end_date: null }, {});
  assert.equal(r.steps[0].done, false);
  assert.equal(r.next, 'dates');
});
