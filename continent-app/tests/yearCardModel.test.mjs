// G12 My trips atlas, Phase F: the year card's content (yearCardModel.js).
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearCard } from '../src/lib/atlasFacts.js';
import { yearCardModel, defaultStudio, pngSize, THEMES, dayOf } from '../src/auth/mytrips/yearCardModel.js';

const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ''}`;
const fmt = { t, nf: (n, d) => n.toFixed(d), money: (n) => `EUR ${Math.round(n)}`, month: (i) => `m${i}` };
const TRIPS = [
  { id: 'a', start: '2025-06-02', end: '2025-06-09', nights: 7, countries: ['NO'], stops: [{ city: 'Tromso', lat: 69.6, lon: 18.9 }], grade: 9, spendPP: 700 },
  { id: 'b', start: '2025-09-10', end: '2025-09-14', nights: 4, countries: ['PT'], stops: [{ city: 'Lagos', lat: 37.1, lon: -8.7 }], grade: 7, spendPP: null },
  { id: 'c', start: '2024-05-01', end: '2024-05-03', nights: 2, countries: ['BE'], stops: [], grade: null, spendPP: null },
];

test('the PNG is 1080 wide in each format', () => {
  assert.deepEqual(pngSize('story'), { w: 1080, h: 1920 });
  assert.deepEqual(pngSize('post'), { w: 1080, h: 1350 });
  assert.deepEqual(pngSize('square'), { w: 1080, h: 1080 });
});

test('the default card: the year title, the busiest month, countries, nights, trips', () => {
  const m = yearCardModel(yearCard(TRIPS, null), defaultStudio(), fmt);
  assert.equal(m.title, 'mt.ycIn{"year":2025}');
  assert.equal(m.insight, 'mt.ycMostIn{"month":"m5"}');
  assert.deepEqual(m.nums.map((n) => n[0]), ['2', '11', '2']);
  assert.equal(m.map, true);
  assert.equal(m.months.length, 12);
});

test('extremes, grade and a day follow the choices; an empty title falls back', () => {
  const cfg = { ...defaultStudio(), title: '  ', items: ['extremes', 'grade', 'money'] };
  const m = yearCardModel(yearCard(TRIPS, 2025), cfg, fmt);
  assert.equal(m.title, 'mt.ycIn{"year":2025}');
  assert.equal(m.insight, 'mt.ycFromTo{"a":"Tromso","b":"Lagos"}');
  assert.deepEqual(m.nums, [['8.0', 'mt.ycGrade'], ['EUR 100', 'mt.ycDay']]);
  assert.equal(m.months, null);
  assert.equal(m.map, false);
});

test('a day is never shown without logged spend', () => {
  const m = yearCardModel(yearCard(TRIPS, 2024), { ...defaultStudio(), items: ['money', 'grade'] }, fmt);
  assert.deepEqual(m.nums, []);
  assert.equal(dayOf([]), null);
});

test('every style names tokens only', () => {
  Object.values(THEMES).forEach((th) => Object.values(th).forEach((v) => assert.match(v, /^--(umber|neutral|sun)-\d+$/)));
});
