// G12, D10 (Explore clean, 2026-11-20): the way there follows one chain so
// a trip figure is complete and carries no "+": the dated fare, the route's
// typical fare, a train, coach or car estimate when the chosen way has no
// fare, else the stay alone with no sign. The receipt names the step; a
// stay-only figure sorts after complete ones and never takes the best-value
// dot. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceFigure, priceSortValue } from '../src/lib/settings/prices.js';
import { readSettings } from '../src/lib/settings/model.js';
import { groundEstimate, wayRowsFor } from '../src/lib/settings/ways.js';
import { receiptLines, wayLegNote } from '../src/lib/price/priceSheet.js';
import { priceRequest } from '../src/lib/price/request.js';
import { notKnownWay } from '../src/lib/travelWay.js';
import { rule } from '../src/lib/price/config.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LOCALES = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const TRIP = readSettings({ price_span: 'trip', price_view: 'pp', group_size: 2, trip_nights: 7, date_mode: 'any' });
const DAY = readSettings({ price_span: 'day', price_view: 'pp', group_size: 2, trip_nights: 7, date_mode: 'any' });
const PARTY = { adults: 2, children: 0, babies: 0, seats: 2 };
const NOW = Date.parse('2026-11-18T12:00:00Z');
const CHECKED = (NOW - 3600000) / 60000;
const BAG = rule('request.default_bag');

const DESTS = {
  BRU: { tier: 'airport', iata: 'BRU', city: 'Brussels', country: 'Belgium', iso2: 'BE', lat: 50.9, lon: 4.48, city_lat: 50.85, city_lon: 4.35 },
  'gem:bruges': { tier: 'gem', city: 'Bruges', country: 'Belgium', iso2: 'BE', lat: 51.21, lon: 3.22, anchor_airport: 'BRU' },
  LIS: { tier: 'airport', iata: 'LIS', city: 'Lisbon', country: 'Portugal', iso2: 'PT', lat: 38.77, lon: -9.13 },
};
const HOME = { lat: 50.85, lon: 4.35, iso2: 'BE', country: 'Belgium', name: 'Brussels' };

const leg = (price) => [price, 'FR', '08:00', '10:00', 0, CHECKED];
function file(from, routes) {
  const f = { from, to: {}, back: {} };
  for (const [ap, { to = {}, back = {} }] of Object.entries(routes)) {
    f.to[ap] = Object.fromEntries(Object.entries(to).map(([d, p]) => [d, leg(p)]));
    f.back[ap] = Object.fromEntries(Object.entries(back).map(([d, p]) => [d, leg(p)]));
  }
  return f;
}
const ROUTE = {
  to: { '2026-12-01': 40, '2026-12-03': 30, '2026-12-10': 80, '2027-01-05': 20 },
  back: { '2026-12-08': 50, '2026-12-11': 25, '2026-12-17': 60, '2027-01-13': 90 },
};
const rowsFor = (mode, choices, home = HOME) => wayRowsFor({
  rows: Object.keys(DESTS).map((id) => ({ id, cost: { dayEur: 100, stayEur: 60, foodEur: 40 } })),
  destinations: DESTS, files: [file('BRU', { LIS: ROUTE })], request: priceRequest({ choices: { bag: BAG, ...choices } }),
  mode, home, party: PARTY, now: NOW,
});

test('step 1 and 2: a dated fare, else the route\'s typical fare', () => {
  const dated = rowsFor('plane', { date_mode: 'cheapest', trip_nights: 7 }).get('LIS').cost.way;
  assert.deepEqual([dated.mode, !!dated.typical, !!dated.estimated], ['plane', false, false]);
  const typical = rowsFor('plane', { date_mode: 'any' }).get('LIS').cost.way;
  assert.deepEqual([typical.mode, typical.typical, !!typical.estimated], ['plane', true, false]);
});

test('step 3: no fare for the chosen way gives the best ground estimate, flagged', () => {
  // Bruges has no swept route from Brussels: the trip takes a ground way.
  const way = rowsFor('plane', { date_mode: 'any' }).get('gem:bruges').cost.way;
  assert.equal(way.estimated, true);
  assert.ok(['train', 'bus', 'car'].includes(way.mode), way.mode);
  assert.ok(way.perPerson > 0);
  // With a stub ground the pick is exact: only the car reaches it.
  const stub = (m) => (m === 'car' ? { mode: 'car', perPerson: 70, total: 140, hours: 3 } : null);
  assert.deepEqual(groundEstimate(DESTS['gem:bruges'], 'train', { home: HOME, party: PARTY, ground: stub }),
    { mode: 'car', perPerson: 70, hours: 3, estimated: true });
  // 'any' already weighed every ground way; no start, no estimate.
  assert.equal(groundEstimate(DESTS['gem:bruges'], 'any', { home: HOME, party: PARTY, ground: stub }), null);
  assert.equal(groundEstimate(DESTS['gem:bruges'], 'plane', { home: null, party: PARTY, ground: stub }), null);
  assert.equal(groundEstimate(DESTS['gem:bruges'], 'plane', { home: HOME, party: PARTY, ground: () => null }), null);
});

test('step 4: nothing reaches it, so the trip is the stay alone, notKnown', () => {
  const way = rowsFor('plane', { date_mode: 'any' }, null).get('gem:bruges').cost.way;
  assert.deepEqual(way, notKnownWay('plane'));
  const f = priceFigure({ cost: { dayEur: 100, stayEur: 60, foodEur: 40, way } }, TRIP);
  assert.deepEqual([f.eur, f.notKnown, f.missing, f.estimated, f.typical], [700, true, ['way'], false, false]);
});

test('the figure carries the step: typical and estimated flags on the whole trip only', () => {
  const est = { dayEur: 100, stayEur: 60, foodEur: 40, way: { mode: 'train', perPerson: 90, hours: 4, estimated: true } };
  const t = priceFigure({ cost: est }, TRIP);
  assert.deepEqual([t.eur, t.estimated, t.typical, t.notKnown, t.parts.wayEstimated], [790, true, false, false, true]);
  assert.equal(priceFigure({ cost: est }, DAY).estimated, false, 'a day holds no way');
});

test('a stay-only trip sorts after every complete one, however low', () => {
  const full = { cost: { dayEur: 100, stayEur: 60, foodEur: 40, way: { mode: 'train', perPerson: 300, estimated: true } } };
  const stayOnly = { cost: { dayEur: 20, stayEur: 10, foodEur: 10, way: notKnownWay('plane') } };
  assert.ok(priceSortValue(full, TRIP) < priceSortValue(stayOnly, TRIP));
  assert.ok(priceFigure(stayOnly, TRIP).eur < priceFigure(full, TRIP).eur, 'the stay alone reads lower');
  const map = read('src/browse/ExploreMap.jsx');
  assert.match(map, /eur: f\.notKnown \? -1 : Math\.round\(f\.eur\)/, 'a stay-only figure never takes the best-value dot');
});

test('the receipt names the step; a dated fare or a switched-off way says nothing', () => {
  const note = (way) => wayLegNote(receiptLines({ cost: { dayEur: 100, stayEur: 60, foodEur: 40, way } }, TRIP).way)[0];
  assert.equal(note({ mode: 'plane', perPerson: 120 }), null);
  assert.equal(note({ mode: 'plane', perPerson: 120, typical: true }), 'price.receipt.typical');
  assert.equal(note({ mode: 'train', perPerson: 90, estimated: true }), 'price.receipt.est.train');
  assert.equal(note({ mode: 'bus', perPerson: 50, estimated: true }), 'price.receipt.est.bus');
  assert.equal(note({ mode: 'car', perPerson: 70, estimated: true }), 'price.receipt.est.car');
  assert.equal(note(notKnownWay('plane')), 'price.receipt.wayNotPriced');
  assert.deepEqual(wayLegNote({ off: true, missing: false }), [null]);
});

test('the receipt words exist in six languages with no dash', async () => {
  const keys = ['price.receipt.typical', 'price.receipt.est.train', 'price.receipt.est.bus', 'price.receipt.est.car', 'price.receipt.wayNotPriced'];
  for (const code of LOCALES) {
    const cat = (await import(`../src/i18n/${code}.js`))[code];
    for (const k of keys) {
      assert.ok(cat[k], `${code} ${k}`);
      assert.ok(!/[–—+]/.test(cat[k]), `${code} ${k}`);
    }
  }
});

test('no "+" after a figure on a card or the receipt', () => {
  assert.doesNotMatch(read('src/browse/explore/HouseParts.jsx'), /xform-open|>\+</);
  assert.doesNotMatch(read('src/components/price/PriceSheet.jsx'), /rcp-open|>\+</);
});
