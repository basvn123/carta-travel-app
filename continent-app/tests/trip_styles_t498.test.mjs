// T498: the trip library's one figure a card ("From {eur} a person a day")
// and the weeks rail's country and nearby filter (src/lib/tripFilters.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  perDayFrom, cardPerDay, lowestPerDay, inCountry, weeksFor,
} from '../src/lib/tripFilters.js';
import { WEEK, SHORT } from '../src/lib/tripLength.js';

test('perDayFrom divides the low end by the days, whole euros', () => {
  assert.equal(perDayFrom({ low: 700, high: 900, days: 7 }), 100);
  assert.equal(perDayFrom({ low: 410, days: 7 }), 59);
  // No low end: the high end stands in, as styleFromPrice does.
  assert.equal(perDayFrom({ high: 350, days: 7 }), 50);
});

test('perDayFrom says nothing without a figure or days', () => {
  assert.equal(perDayFrom(null), null);
  assert.equal(perDayFrom({ low: 700, days: 0 }), null);
  assert.equal(perDayFrom({ low: 700 }), null);
  assert.equal(perDayFrom({ days: 7 }), null);
});

test('cardPerDay reads the card at the list length', () => {
  const card = { eur: { low: 700, high: 1050 }, days: 7, diff: 2 };
  assert.equal(cardPerDay(card, WEEK), 100);
  // The short version scales the total to 4 days: the day costs the same.
  assert.equal(cardPerDay(card, SHORT), 100);
  assert.equal(cardPerDay({ days: 7 }, WEEK), null);
});

test('lowestPerDay is the cheapest member, never an average', () => {
  const cards = [
    { eur: { low: 840, high: 1000 }, days: 7 },
    { eur: { low: 630, high: 900 }, days: 7 },
    { eur: { low: 1400, high: 1600 }, days: 14 },
    { days: 7 },
  ];
  assert.equal(lowestPerDay(cards, WEEK), 90);
  assert.equal(lowestPerDay([], WEEK), null);
  assert.equal(lowestPerDay(null, WEEK), null);
});

const LIB = [
  { id: 'it-a', cc: 'IT', lat: 40.63, lon: 14.6 },          // Amalfi
  { id: 'hr-b', cc: 'HR', countries: ['HR', 'SI'], lat: 45.08, lon: 13.64 },
  { id: 'it-c', cc: 'IT', lat: 45.46, lon: 9.19 },          // Milan
  { id: 'fr-d', cc: 'FR', countries: ['FR', 'IT'], lat: 43.7, lon: 7.27 },
  { id: 'gr-e', cc: 'GR' },
];

test('inCountry takes the main country and every country crossed', () => {
  assert.equal(inCountry(LIB[1], 'SI'), true);
  assert.equal(inCountry(LIB[1], 'IT'), false);
  assert.equal(inCountry(LIB[1], null), false);
});

test('weeksFor a country keeps the written order and crossings', () => {
  assert.deepEqual(weeksFor(LIB, { country: 'IT' }).map((c) => c.id), ['it-a', 'it-c', 'fr-d']);
  assert.deepEqual(weeksFor(LIB, { country: 'IT', max: 2 }).map((c) => c.id), ['it-a', 'it-c']);
  assert.deepEqual(weeksFor(LIB, { country: 'PT' }), []);
});

test('weeksFor near a point keeps cards within the radius', () => {
  const amalfi = { lat: 40.65, lon: 14.6, km: 60 };
  assert.deepEqual(weeksFor(LIB, { near: amalfi }).map((c) => c.id), ['it-a']);
  // A card with no point never passes a nearby test.
  assert.deepEqual(weeksFor(LIB, { near: { lat: 38, lon: 23.7, km: 5000 } }).map((c) => c.id).includes('gr-e'), false);
});

test('weeksFor with neither a country nor a point is empty', () => {
  assert.deepEqual(weeksFor(LIB, {}), []);
});

test('weeksFor puts rated cards first, stable otherwise, never mutating', () => {
  const rated = [
    { id: 'a', cc: 'IT', rating: 7 },
    { id: 'b', cc: 'IT' },
    { id: 'c', cc: 'IT', rating: 9 },
    { id: 'd', cc: 'IT', rating: 7 },
  ];
  const before = rated.map((c) => c.id).join();
  assert.deepEqual(weeksFor(rated, { country: 'IT' }).map((c) => c.id), ['c', 'a', 'd', 'b']);
  assert.equal(rated.map((c) => c.id).join(), before);
});
