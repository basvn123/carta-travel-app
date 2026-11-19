// Logic wave 0a (QW#6, ROADMAP D13): the T1019 rule (the way home flies after
// the way out) now holds for the open-jaw trip (browse/cartaFlight.js) and
// the trip finder's nearest swept days (lib/recommend/adapters/flight.js).
// The fixture copies tests/flights.test.mjs "T1019"; no later flight in the
// spread is no price, never a wrong one.
// Run: node --test tests/openJaw.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openJawNear } from '../src/browse/cartaFlight.js';
import { flight } from '../src/lib/recommend/adapters/flight.js';

const fresh = Math.floor(Date.now() / 60000) - 60;
const leg = (eur) => [eur, 'U2', '08:00', '10:00', 0, fresh];

// Out to Rome on the 11th; a cheaper flight home on the 9th, the right one on the 12th.
const file = (backTo) => ({
  v: 1, from: 'BRU',
  to: { FCO: { '2027-01-11': leg(40) } },
  back: { [backTo]: { '2027-01-09': leg(20), '2027-01-12': leg(35) } },
});

test('open-jaw: the way home is after the way out', () => {
  const r = openJawNear(file('NAP'), 'FCO', 'NAP', '2027-01-11', '2027-01-10');
  assert.equal(r.out.date, '2027-01-11');
  assert.equal(r.back.date, '2027-01-12');
});

test('open-jaw: no flight home after the way out is no price', () => {
  const f = file('NAP');
  delete f.back.NAP['2027-01-12'];
  assert.equal(openJawNear(f, 'FCO', 'NAP', '2027-01-11', '2027-01-10'), null);
});

const priceNear = (f) => flight.price({
  trip: {
    gateway: { iata: 'FCO' }, origin: 'BRU', nights: 0,
    dates: { out: '2027-01-11', back: '2027-01-10' },
    party: { head: 1, adults: 1, children: 0, babies: 0 },
  },
  quote: { parts: { drive: 0, travel: 0, flights: 0 } },
  state: {},
  ctx: { data: { meta: {} }, flights: f, origin: { iata: 'BRU' }, lang: 'en' },
});

test('trip finder: the nearest swept way home is after the way out', () => {
  const p = priceNear(file('FCO'));
  assert.ok(p, 'priced from the nearest days');
  assert.equal(p.pick.facts.out.date, '2027-01-11');
  assert.equal(p.pick.facts.back.date, '2027-01-12');
});

test('trip finder: no flight home after the way out is no price', () => {
  const f = file('FCO');
  delete f.back.FCO['2027-01-12'];
  assert.equal(priceNear(f), null);
});
