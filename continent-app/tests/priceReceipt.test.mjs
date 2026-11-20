// G12, D10 (place-prices decision sections 1 and 2): the card and the
// receipt behind it read one calculation, so in all four basis cells (a day
// or the trip, each or the group) the receipt's total is the card's figure,
// with the same basis words, and its printed lines add up to it.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceFigure } from '../src/lib/settings/prices.js';
import { readSettings } from '../src/lib/settings/model.js';
import { receiptLines, dayInsight } from '../src/lib/price/priceSheet.js';
import { en } from '../src/i18n/en.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LOCALES = ['en', 'nl', 'de', 'fr', 'es', 'it'];
const cents = (v) => Math.round(v * 100) / 100;

// Rome as the audit measured it: bed 75.71, food 62.01 a person a day, the
// car 213.10 a person there and back.
const row = { cost: { dayEur: 137.72, stayEur: 75.71, foodEur: 62.01, way: { mode: 'car', perPerson: 213.1, hours: 14.3 } } };
const cell = (span, view) => readSettings({ price_span: span, price_view: view, group_size: 2, trip_nights: 7, date_mode: 'any' });
const CELLS = [['day', 'pp'], ['day', 'total'], ['trip', 'pp'], ['trip', 'total']];

test('card = receipt in all four basis cells', () => {
  for (const [span, view] of CELLS) {
    const m = cell(span, view);
    const card = priceFigure(row, m);
    const r = receiptLines(row, m);
    assert.equal(r.total, card.eur, `${span}/${view} total`);
    assert.deepEqual(r.basis, card.basis, `${span}/${view} basis`);
    assert.equal(r.span, span);
  }
});

test('the four cells: amounts, basis keys and where the way sits', () => {
  const dayPp = receiptLines(row, cell('day', 'pp'));
  assert.equal(dayPp.total, 137.72);
  assert.deepEqual(dayPp.basis, ['price.basis.day', {}]);
  assert.equal(dayPp.way.inTotal, false, 'a day keeps the way apart');
  assert.equal(dayPp.way.eur, 213.1);
  const dayGroup = receiptLines(row, cell('day', 'total'));
  assert.equal(dayGroup.total, 275.44);
  assert.deepEqual(dayGroup.basis, ['price.basis.dayGroup', { n: 2 }]);
  const tripPp = receiptLines(row, cell('trip', 'pp'));
  assert.equal(tripPp.total, cents(137.72 * 7 + 213.1));
  assert.deepEqual(tripPp.basis, ['price.basis.trip', { nights: 7 }]);
  assert.equal(tripPp.way.inTotal, true);
  assert.equal(tripPp.bed.each, 75.71, 'a night under the bed on a trip');
  const tripGroup = receiptLines(row, cell('trip', 'total'));
  assert.equal(tripGroup.total, cents((137.72 * 7 + 213.1) * 2));
  assert.deepEqual(tripGroup.basis, ['price.basis.tripGroup', { n: 2, nights: 7 }]);
  assert.equal(tripGroup.food.each, 124.02);
});

test('the printed lines and the rounding line add up to the total', () => {
  for (const [span, view] of CELLS) {
    const r = receiptLines(row, cell(span, view));
    const printed = r.bed.eur + r.food.eur + (r.way.inTotal ? r.way.eur : 0) + (r.rounding || 0);
    assert.equal(cents(printed), r.sum, `${span}/${view}`);
  }
});

test('a trip whose way has no figure says so and still totals the stay', () => {
  const r = receiptLines({ cost: { ...row.cost, way: { mode: 'train', perPerson: null, notKnown: true } } }, cell('trip', 'pp'));
  assert.equal(r.notKnown, true);
  assert.equal(r.way.missing, true);
  assert.equal(r.total, cents(137.72 * 7));
});

test('the insight speaks only at 10% or more off the usual day', () => {
  assert.equal(dayInsight(100, 105), null);
  assert.deepEqual(dayInsight(80, 100), { dir: 'under', eur: 20 });
  assert.deepEqual(dayInsight(120, 100, 2), { dir: 'over', eur: 40 });
  assert.equal(dayInsight(null, 100), null);
});

test('the new strings exist in six languages and the retired ones are gone', async () => {
  const want = ['price.basis.day', 'price.basis.dayGroup', 'price.basis.trip', 'price.basis.tripOne', 'price.basis.tripGroup',
    'price.basis.tripGroupOne', 'card.priceAria', 'price.insightUnder', 'price.insightOver', 'price.perNight', 'price.perDay',
    'price.total', 'price.flightsTitle', 'price.backToReceipt', 'price.lever.bed', 'price.lever.food', 'price.lever.way'];
  const gone = ['price.stay.basisLocal', 'price.yourSettings', 'price.food.basisCountry', 'price.way.basisCar', 'price.in.covers'];
  for (const code of LOCALES) {
    const cat = (await import(`../src/i18n/${code}.js`))[code];
    for (const k of want) assert.ok(cat[k], `${code} ${k}`);
    for (const k of gone) assert.equal(cat[k], undefined, `${code} still has ${k}`);
  }
  assert.equal(en['price.basis.tripGroup'], 'for {n}, {nights} nights');
});

test('cards draw the figure and its basis as one button, no wagons', () => {
  const rails = read('src/browse/ExploreRails.jsx');
  assert.match(rails, /<ReceiptButton place=\{p\}/);
  assert.doesNotMatch(rails, /RowFormation/);
  assert.match(read('src/browse/explore/PlaceRow.jsx'), /<PlaceFigure place=\{p\} t=\{t\} figRef=\{figRef\} \/>/);
  const sheet = read('src/components/price/PriceSheet.jsx');
  assert.match(sheet, /receiptLines\(\{ cost: s\.cost \}/);
  assert.doesNotMatch(sheet, /<Tabs /);
  assert.match(sheet, /lazy\(\(\) => import\('\.\/FlightTab\.jsx'\)\)/);
});
