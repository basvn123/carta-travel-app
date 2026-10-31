// T929: Plans that meet, computed client side from shown plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOverlaps, myWindows, friendWindows, laneGeometry, overlapKey, friendStaysIn,
} from '../src/together/overlaps.js';

const today = '2026-11-01';
const mine = [{
  id: 'p1', label: 'Lisbon and Porto',
  stops: [
    { destination_id: 'LIS', city: 'Lisbon', arrive_date: '2026-11-20', depart_date: '2026-11-24' },
    { destination_id: 'OPO', city: 'Porto', arrive_date: '2026-11-24', depart_date: '2026-11-27' },
  ],
}];
const sam = { ownerId: 'u-sam', ownerName: 'Sam', ownerHandle: 'sam', tripPlanId: 't1', label: 'Lisbon', startDate: '2026-11-21', endDate: '2026-11-25', cities: ['Lisbon'], destinationIds: ['LIS'] };

test('same city on shared days is one overlap, clipped to the shared days', () => {
  const out = computeOverlaps({ myPlans: mine, friendTrips: [sam], today });
  assert.equal(out.length, 1);
  assert.equal(out[0].destId, 'LIS');
  assert.equal(out[0].start, '2026-11-21');
  assert.equal(out[0].end, '2026-11-24');
  assert.equal(out[0].friendId, 'u-sam');
});

test('different city or no shared day is not an overlap', () => {
  const rome = { ...sam, tripPlanId: 't2', cities: ['Rome'], destinationIds: ['FCO'] };
  const later = { ...sam, tripPlanId: 't3', startDate: '2026-12-01', endDate: '2026-12-05' };
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [rome, later], today }).length, 0);
});

test('an arrival on the day the other leaves counts as one shared day', () => {
  const porto = { ...sam, tripPlanId: 't4', cities: ['Porto'], destinationIds: ['OPO'], startDate: '2026-11-27', endDate: '2026-11-30' };
  const out = computeOverlaps({ myPlans: mine, friendTrips: [porto], today });
  assert.equal(out.length, 1);
  assert.equal(out[0].start, '2026-11-27');
  assert.equal(out[0].end, '2026-11-27');
});

test('your switch off, the friend switch off, or not a friend: nothing', () => {
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [sam], today, meetOn: false }).length, 0);
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [sam], today, friendMeet: () => false }).length, 0);
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [sam], today, friendIds: new Set(['u-jo']) }).length, 0);
});

test('a multi-city friend trip needs per-stop dates', () => {
  const multi = { ...sam, tripPlanId: 't5', cities: ['Lisbon', 'Faro'], destinationIds: ['LIS', 'FAO'], startDate: '2026-11-10', endDate: '2026-11-30' };
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [multi], today }).length, 0);
  const stops = new Map([['t5', [
    { destination_id: 'LIS', city: 'Lisbon', arrive_date: '2026-11-10', depart_date: '2026-11-21' },
    { destination_id: 'FAO', city: 'Faro', arrive_date: '2026-11-21', depart_date: '2026-11-30' },
  ]]]);
  const out = computeOverlaps({ myPlans: mine, friendTrips: [multi], stopsByTrip: stops, today });
  assert.equal(out.length, 1);
  assert.equal(out[0].start, '2026-11-20');
  assert.equal(out[0].end, '2026-11-21');
});

test('city name matches where a stop has no catalogue id; ended stays are left out', () => {
  const plan = [{ id: 'p2', stops: [{ city: 'Lisbon', arrive_date: '2026-11-20', depart_date: '2026-11-22' }] }];
  const t = { ...sam, destinationIds: [] };
  assert.equal(computeOverlaps({ myPlans: plan, friendTrips: [t], today }).length, 1);
  assert.equal(computeOverlaps({ myPlans: plan, friendTrips: [t], today: '2026-12-01' }).length, 0);
});

test('hidden overlaps stay hidden, keyed stably', () => {
  const [o] = computeOverlaps({ myPlans: mine, friendTrips: [sam], today });
  assert.equal(o.key, overlapKey(o));
  assert.equal(computeOverlaps({ myPlans: mine, friendTrips: [sam], today, hidden: new Set([o.key]) }).length, 0);
});

test('windows ignore stops without dates', () => {
  assert.deepEqual(myWindows({ stops: [{ destination_id: 'X' }] }), []);
  assert.equal(friendWindows({ startDate: '2026-11-01', endDate: '2026-11-03', cities: ['A'], destinationIds: ['A'] }).length, 1);
});

test('lane geometry shares one scale', () => {
  const [o] = computeOverlaps({ myPlans: mine, friendTrips: [sam], today });
  const g = laneGeometry(o);
  assert.equal(g.days[0], '2026-11-20');
  assert.equal(g.days.at(-1), '2026-11-25');
  assert.equal(g.you.left, 0);
  assert.ok(g.them.left > 0);
  assert.ok(g.over.width <= g.you.width && g.over.width <= g.them.width);
});

test('friend stays in a picked window, else the soonest', () => {
  assert.equal(friendStaysIn({ friendTrips: [sam], start: '2026-11-24', end: '2026-11-30', today }).length, 1);
  assert.equal(friendStaysIn({ friendTrips: [sam], start: '2026-12-24', end: '2026-12-30', today }).length, 0);
  assert.equal(friendStaysIn({ friendTrips: [sam], today }).length, 1);
});
