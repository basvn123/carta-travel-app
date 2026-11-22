// G12 My trips: the compact price control is a view of the one "Prijzen
// tonen" setting (lib/settings), and its factor matches grandTotal's stay.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceUnit, unitFactor, inUnit, moveInUnit, unitKey, setSpan, setWho, stepNights, basisOf, sameBasis, setPeople, MAX_PEOPLE } from '../src/lib/price/priceView.js';
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

test('the basis is the month, the stay style and the lifestyle (G12)', () => {
  const c = { ...two, date_mode: 'month', when_month: '2027-06', stay_tier: 'mid', lifestyle: { cafe: 1, dinner: 2 } };
  const b = basisOf(c);
  assert.equal(basisOf({ ...c, lifestyle: { dinner: 2, cafe: 1 } }), b, 'key order does not matter');
  assert.notEqual(basisOf({ ...c, when_month: '2027-07' }), b);
  assert.notEqual(basisOf({ ...c, stay_tier: 'budget' }), b);
  assert.notEqual(basisOf({ ...c, lifestyle: { cafe: 1, dinner: 3 } }), b);
  // The unit is no basis: the move is shown in it, not hidden by it.
  assert.equal(basisOf({ ...c, price_span: 'trip', price_view: 'total' }), b);
});

test('a saved move shows on the same basis, hides on another, and old saves keep showing it', () => {
  const c = { ...two, price_span: 'day', price_view: 'pp', stay_tier: 'mid' };
  const b = basisOf(c);
  assert.equal(sameBasis({ eur: 100, basis: b }, b), true);
  assert.equal(sameBasis({ eur: 100, basis: b }, basisOf({ ...c, stay_tier: 'top' })), false);
  assert.equal(sameBasis({ eur: 100 }, b), true, 'a save from before the basis was stored');
  assert.equal(moveInUnit(100, 90, c, { sameBasis: sameBasis({ eur: 100, basis: 'other' }, b) }), null);
  assert.equal(moveInUnit(100, 90, c, { sameBasis: sameBasis({ eur: 100 }, b) }), -10);
});

test('the move follows the unit: whole trip for 2 is the day move times the unit (G12)', () => {
  const day = { ...two, price_span: 'day', price_view: 'pp' };
  const trip = { ...two, price_span: 'trip', price_view: 'total', trip_nights: 7 };
  assert.equal(moveInUnit(100, 88, day), -12);
  assert.equal(moveInUnit(100, 88, trip), Math.round(-12 * unitFactor(trip)));
  assert.ok(unitFactor(trip) > unitFactor(day));
  assert.equal(Math.sign(moveInUnit(80, 95, trip)), 1, 'a rise stays a rise in any unit');
});

test('Voor N personen writes the People setting and the unit together (G12 polish)', () => {
  const two = setPeople(2)({ group_size: 1, price_view: 'pp', price_span: 'day', children: 0 });
  assert.equal(two.group_size, 2);
  assert.equal(two.price_view, 'total');
  assert.equal(priceUnit(two).n, 2);
  assert.equal(unitFactor(two), 2);
  const one = setPeople(1)({ group_size: 4, price_view: 'total', children: 2 });
  assert.deepEqual([one.group_size, one.price_view, one.children], [1, 'pp', 0]);
  assert.equal(priceUnit(one).n, 1);
  assert.equal(setPeople(999)({}).group_size, MAX_PEOPLE);
  assert.equal(setPeople(3)({ children: 5 }).children, 2);
});
