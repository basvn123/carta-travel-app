// T434: what My trips knows about a traveller's trips, in lib/myTrips.js.
// Upcoming and past are decided by the dates alone, the countdown reads the
// same words on the day and while a trip runs, the visited record counts
// hand-marked countries without counting a wish, and a saved trip prices
// through the same priceTrip() the trip planner uses.
// Run: npm test (continent-app/). The pricing case uses public/app_data.json
// and skips without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  classifyTrips, whenParts, dayPlanEndDate, daysUntil, visitedRecord,
  plannerStateFromPlan, tripFigure, nightsBetween, yearOf,
} from '../src/lib/myTrips.js';

const TODAY = '2026-10-16';

test('classifyTrips: dates decide, undated trips are upcoming', () => {
  const plans = [
    { id: 'a', start_date: '2026-11-06', end_date: '2026-11-12' },
    { id: 'b', start_date: '2026-09-01', end_date: '2026-09-05' },
    { id: 'c', start_date: null, end_date: null },
    { id: 'd', start_date: '2026-10-14', end_date: '2026-10-18' },
    { id: 'e', start_date: '2026-08-01', end_date: '2026-08-03' },
  ];
  const dayPlans = [
    { id: 'x', startDate: '2026-10-10', stops: [{ days: 2 }] },
    { id: 'y', startDate: '2026-12-01', stops: [{ days: 1 }] },
  ];
  const r = classifyTrips({ plans, dayPlans, todayIso: TODAY });
  assert.deepEqual(r.upcomingPlans.map((p) => p.id), ['d', 'a', 'c']);
  assert.deepEqual(r.pastPlans.map((p) => p.id), ['b', 'e']);
  assert.deepEqual(r.upcomingDayPlans.map((p) => p.id), ['y']);
  assert.deepEqual(r.pastDayPlans.map((p) => p.id), ['x']);
});

test('whenParts: countdown words', () => {
  assert.deepEqual(whenParts('2026-11-06', '2026-11-12', TODAY), { key: 'saved.inDaysN', n: 21 });
  assert.deepEqual(whenParts('2026-10-17', '2026-10-18', TODAY), { key: 'saved.inDays1', n: 1 });
  assert.deepEqual(whenParts(TODAY, '2026-10-20', TODAY), { key: 'saved.departsToday' });
  assert.deepEqual(whenParts('2026-10-14', '2026-10-18', TODAY), { key: 'saved.underway' });
  assert.equal(whenParts('2026-10-01', '2026-10-03', TODAY), null);
  assert.deepEqual(whenParts(null, null, TODAY), { key: 'saved.noDatesYet' });
});

test('date helpers', () => {
  assert.equal(dayPlanEndDate({ startDate: '2026-10-30', stops: [{ days: 2 }, { days: 2 }] }), '2026-11-02');
  assert.equal(daysUntil('2026-10-20', TODAY), 4);
  assert.equal(nightsBetween('2026-11-06', '2026-11-12'), 6);
  assert.equal(nightsBetween(null, '2026-11-12'), 0);
  assert.equal(yearOf('2025-03-01'), 2025);
  assert.equal(yearOf(''), null);
});

test('visitedRecord: trips, memories and hand-marked countries; wishes never count', () => {
  const destinations = { LIS: { country: 'Portugal', city: 'Lisbon' }, BRU: { country: 'Belgium', city: 'Brussels' } };
  const r = visitedRecord({
    pastPlans: [{ id: 'p', destination_ids: ['LIS'], cities: ['Lisbon'], countries: ['Portugal'], start_date: '2026-05-01', end_date: '2026-05-05' }],
    pastDayPlans: [{ id: 'd', startDate: '2026-04-01', stops: [{ destinationId: 'BRU', days: 2 }] }],
    memories: { p: { places: [{ city: 'Sintra', country: 'Portugal' }] } },
    destinations,
    manualCountries: ['Iceland', 'Belgium'],
  });
  assert.deepEqual(r.countries, ['Belgium', 'Iceland', 'Portugal']);
  assert.ok(r.fromTrips.has('Portugal') && r.fromTrips.has('Belgium') && !r.fromTrips.has('Iceland'));
  assert.deepEqual(r.cities.sort(), ['Brussels', 'Lisbon', 'Sintra']);
  assert.equal(r.trips, 2);
  assert.equal(r.nights, 5);
});

test('plannerStateFromPlan: party and answers come from the first stop', () => {
  const plan = {
    stops: [
      { destination_id: 'LIS', arrive_date: '2026-11-06', depart_date: '2026-11-09' },
      { destination_id: 'OPO', arrive_date: '2026-11-09', depart_date: '2026-11-12' },
    ],
    choices: { groupSize: 3, children: 1, transportPref: 'train' },
  };
  const s = plannerStateFromPlan(plan, { stayTier: 'room' });
  assert.equal(s.tripStart, '2026-11-06');
  assert.deepEqual(s.stops.map((x) => x.nights), [3, 3]);
  assert.equal(s.groupSize, 3);
  assert.equal(s.children, 1);
  assert.equal(s.transportPref, 'train');
  assert.equal(s.stayTier, 'room');
  assert.equal(plannerStateFromPlan({ stops: [] }), null);
});

const DATA = new URL('../public/app_data.json', import.meta.url);
const have = existsSync(DATA);
test('tripFigure prices a saved trip the way the planner does', { skip: have ? false : 'no app_data.json' }, async () => {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const { priceTrip } = await import('../src/lib/tripTotal.js');
  const ids = Object.keys(data.destinations).filter((id) => data.destinations[id].costs).slice(0, 2);
  const plan = {
    stops: [
      { destination_id: ids[0], arrive_date: '2026-11-06', depart_date: '2026-11-09' },
      { destination_id: ids[1], arrive_date: '2026-11-09', depart_date: '2026-11-11' },
    ],
    choices: { groupSize: 2 },
  };
  const fig = tripFigure(plan, { data, stayTier: 'home' });
  assert.ok(fig, 'a two-stop trip is priced');
  const direct = priceTrip(plannerStateFromPlan(plan, { stayTier: 'home' }), { data });
  assert.equal(fig.total, direct.grandTotal);
  assert.equal(fig.party, 2);
  assert.equal(fig.est, true);
  assert.equal(tripFigure({ stops: [{ destination_id: 'nope', arrive_date: '2026-11-01', depart_date: '2026-11-02' }] }, { data }), null);
});
