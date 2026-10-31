// T942: "Plan a trip with these" for every kind, lib/savedPlan.js.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planFromSaves, cheapestStopDay } from '../src/lib/savedPlan.js';

const DESTS = {
  INN: { city: 'Innsbruck', lat: 47.27, lon: 11.39 },
  LJU: { city: 'Ljubljana', city_lat: 46.05, city_lon: 14.51 },
  OPO: { city: 'Porto', lat: 41.15, lon: -8.61 },
};

test('a place is a stop of 2 nights, in pick order', () => {
  const { stops, unplaced } = planFromSaves([{ kind: 'dest', id: 'OPO' }, { kind: 'dest', id: 'LJU' }], DESTS);
  assert.deepEqual(stops, [
    { dest: 'OPO', nights: 2, dayActivities: [] },
    { dest: 'LJU', nights: 2, dayActivities: [] },
  ]);
  assert.equal(unplaced.length, 0);
});

test('a trail or lake becomes a day at its nearest town, joining a picked place', () => {
  const { stops } = planFromSaves([
    { kind: 'trail', name: 'Zirbenweg', lat: 47.22, lon: 11.45 },
    { kind: 'dest', id: 'LJU' },
    { kind: 'lake', name: 'Lake Bled', lat: 46.36, lon: 14.09 },
    { kind: 'mountain', name: 'Patscherkofel', lat: 47.21, lon: 11.46 },
    { kind: 'cycle', name: 'Inn cycle path', lat: 47.3, lon: 11.5 },
  ], DESTS);
  assert.deepEqual(stops.map((s) => s.dest), ['INN', 'LJU']);
  assert.deepEqual(stops[0].dayActivities, ['Zirbenweg', 'Patscherkofel', 'Inn cycle path']);
  assert.equal(stops[0].nights, 3, 'one night more for each activity beyond two');
  assert.deepEqual(stops[1], { dest: 'LJU', nights: 2, dayActivities: ['Lake Bled'] });
});

test('nothing near enough, no point, or a kind the planner has no place for is left out', () => {
  const far = { kind: 'beach', name: 'Far away', lat: 60, lon: 25 };
  const nopoint = { kind: 'trail', name: 'No point' };
  const region = { kind: 'region', id: 'tuscany' };
  const gone = { kind: 'dest', id: 'XXX' };
  const { stops, unplaced } = planFromSaves([far, nopoint, region, gone], DESTS);
  assert.equal(stops.length, 0);
  assert.deepEqual(unplaced, [far, nopoint, region, gone]);
});

test('a stop never takes more than a week', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ kind: 'trail', name: `Walk ${i}`, lat: 47.27, lon: 11.39 }));
  assert.equal(planFromSaves(rows, DESTS).stops[0].nights, 7);
});

test('the bar prices only the stops, cheapest first; none priced is null', () => {
  const stops = [{ dest: 'INN' }, { dest: 'LJU' }, { dest: 'OPO' }];
  const eur = { INN: 96, LJU: 71 };
  assert.equal(cheapestStopDay(stops, (id) => eur[id]), 71);
  assert.equal(cheapestStopDay(stops, () => null), null);
  assert.equal(cheapestStopDay([], () => 10), null);
});
