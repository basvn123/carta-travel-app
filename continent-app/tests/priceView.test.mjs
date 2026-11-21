// G12 My trips: the compact price control is a view of the one "Prijzen
// tonen" setting (lib/settings), and its factor matches grandTotal's stay.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceUnit, unitFactor, inUnit, moveInUnit, unitKey, setSpan, setWho, stepNights } from '../src/lib/price/priceView.js';
import { grandTotal } from '../src/lib/settings/prices.js';
import { MAX_TRIP_NIGHTS } from '../src/lib/settings/model.js';

const two = { adults: 2 };

test('the four units scale a day for one the way the settings do', () => {
  const base = { ...two, trip_nights: 5 };
  assert.equal(unitFactor({ ...base, price_span: 'day', price_view: 'pp' }), 1);
  assert.equal(unitFactor({ ...base, price_span: 'day', price_view: 'total' }), 2);
  assert.equal(unitFactor({ ...base, price_span: 'trip', price_view: 'pp' }), 5);
  assert.equal(unitFactor({ ...base, price_span: 'trip', price_view: 'total' }), 10);
  const c = { ...base, price_span: 'trip', price_view: 'total' };
  assert.equal(inUnit(94, c), grandTotal({ dayEur: 94 }, c).stay);
});

test('the unit reads the party and the nights', () => {
  const u = priceUnit({ ...two, price_span: 'trip', price_view: 'total', trip_nights: 7 });
  assert.deepEqual(u, { span: 'trip', group: true, seats: 2, n: 2, nights: 7 });
  assert.equal(priceUnit({}).span, 'day');
  assert.equal(inUnit(null, {}), null);
});

test('a move shows in the unit and hides when the basis changed', () => {
  const c = { ...two, price_span: 'day', price_view: 'total' };
  assert.equal(moveInUnit(100, 94, c), -12);
  assert.equal(moveInUnit(100, 94, c, { sameBasis: false }), null);
  assert.equal(moveInUnit(null, 94, c), null);
  assert.notEqual(unitKey(c), unitKey({ ...c, price_view: 'pp' }));
});

test('the control writes the same setting Explore writes', () => {
  let c = { ...two };
  c = setSpan('trip')(c);
  c = setWho('group')(c);
  assert.equal(c.price_span, 'trip');
  assert.equal(c.price_view, 'total');
  c = stepNights(1)({ ...c, trip_nights: 5 });
  assert.equal(c.trip_nights, 6);
  const top = { trip_nights: MAX_TRIP_NIGHTS };
  assert.equal(stepNights(1)(top), top);
  assert.equal(stepNights(-1)({ trip_nights: 1 }).trip_nights, 1);
});
