// G12 My trips atlas: the facts the record's graphics draw.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nightDates, nightsPerYear, nightsPerMonth, extremes, straightKm, routeKm,
  savedPerCountry, firstVisitYear, tripLogOrder, yearCard,
} from '../src/lib/atlasFacts.js';

const stop = (city, lat, lon, country) => ({ id: city, city, lat, lon, country });
const LIS = stop('Lisbon', 38.722, -9.139, 'PT');
const TRO = stop('Tromso', 69.649, 18.956, 'NO');
const ATH = stop('Athens', 37.98, 23.73, 'GR');
const BRU = stop('Bruges', 51.209, 3.224, 'BE');
const trips = [
  { id: 'a', title: 'Lisbon', start: '2022-04-10', end: '2022-04-16', countries: ['PT'], stops: [LIS], grade: 8, spendPP: 600 },
  { id: 'b', title: 'Tromso', start: '2025-02-01', end: '2025-02-06', countries: ['NO'], stops: [TRO], grade: 9, spendPP: null },
  { id: 'c', title: 'New Year', start: '2024-12-30', end: '2025-01-02', countries: ['BE'], stops: [BRU], grade: null },
  { id: 'd', title: 'Athens', start: '2026-05-03', end: null, nights: 2, countries: ['GR'], stops: [ATH], grade: 9 },
];

test('nights fall on their own dates, across a New Year too', () => {
  assert.deepEqual(nightDates(trips[2]), [[2024, 12], [2024, 12], [2025, 1]]);
  assert.equal(nightDates(trips[3]).length, 2);
  assert.deepEqual(nightDates({ start: 'soon' }), []);
});

test('nights per year and per month', () => {
  assert.deepEqual(nightsPerYear(trips), [
    { year: 2022, nights: 6 }, { year: 2024, nights: 2 }, { year: 2025, nights: 6 }, { year: 2026, nights: 2 },
  ]);
  const all = nightsPerMonth(trips);
  assert.equal(all.reduce((a, b) => a + b, 0), 16);
  assert.equal(all[1], 5);
  assert.deepEqual(nightsPerMonth(trips, { year: 2025 }).slice(0, 2), [1, 5]);
});

test('the four extremes and straight-line distance', () => {
  const x = extremes(trips);
  assert.equal(x.n.city, 'Tromso');
  assert.equal(x.s.city, 'Athens');
  assert.equal(x.e.city, 'Athens');
  assert.equal(x.w.city, 'Lisbon');
  assert.equal(extremes([]), null);
  const km = straightKm(LIS, TRO);
  assert.ok(km > 3790 && km < 3840, `${km}`);
  assert.equal(straightKm(LIS, {}), null);
  assert.ok(Math.abs(routeKm([LIS, BRU, TRO]) - (straightKm(LIS, BRU) + straightKm(BRU, TRO))) < 1e-9);
});

test('saved per country and the first-visit year', () => {
  assert.deepEqual(savedPerCountry([{ country: 'IT' }, { country: 'AT' }, { country: 'IT' }, {}]), [
    { country: 'IT', n: 2 }, { country: 'AT', n: 1 },
  ]);
  const fv = firstVisitYear([...trips, { id: 'e', start: '2023-03-01', end: '2023-03-04', countries: ['PT', 'ES'] }]);
  assert.deepEqual(fv, { PT: 2022, ES: 2023, BE: 2024, NO: 2025, GR: 2026 });
});

test('the trip log ranks by grade, newer first on a tie, grades given in place count', () => {
  const { rated, unrated } = tripLogOrder(trips);
  assert.deepEqual(rated.map((t) => t.id), ['d', 'b', 'a']);
  assert.deepEqual(unrated.map((t) => t.id), ['c']);
  const again = tripLogOrder(trips, { c: 10 });
  assert.equal(again.rated[0].id, 'c');
  assert.equal(again.unrated.length, 0);
});

test('the year card: the asked year, else the latest; money off without spend', () => {
  const y25 = yearCard(trips, 2025);
  assert.equal(y25.year, 2025);
  assert.equal(y25.nights, 5);
  assert.deepEqual(y25.countries, ['NO']);
  assert.equal(y25.avgGrade, 9);
  assert.equal(y25.hasMoney, false);
  const latest = yearCard(trips, 1999);
  assert.equal(latest.year, 2026);
  assert.deepEqual(latest.years, [2022, 2024, 2025, 2026]);
  assert.equal(yearCard(trips, 2022).hasMoney, true);
  assert.equal(yearCard([]).year, null);
});
