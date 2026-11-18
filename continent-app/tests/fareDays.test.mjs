// D10 (explore polish, flight-tab.md): the Flight tab's day strip and pair
// figure. A day nobody checked or a stale fare never becomes a bar, a
// searched empty day is a ring, and the default figure is the row's own.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fareWindow, fareDays, barHeight, pairFigure, airportPairs, flightBasis, addDays } from '../src/lib/flights/fareDays.js';
import { legCost } from '../src/lib/flights/flights.js';
import { flightPerSeat } from '../src/lib/party.js';

const NOW = Date.parse('2026-03-01T12:00:00Z');
const min = (ms) => Math.round(ms / 60000);
const fresh = min(NOW - 3600000);
const stale = min(NOW - 60 * 86400000);
const file = {
  from: 'BRU',
  to: {
    FCO: {
      '2026-03-05': [41, 'FR', '06:40', '08:55', 0, fresh],
      '2026-03-08': null,
      '2026-03-11': [29, 'W6', '21:55', '23:59', 0, fresh],
      '2026-03-14': [60, 'SN', '09:00', '13:40', 1, stale],
    },
  },
  back: {
    FCO: {
      '2026-03-06': [30, 'FR', '19:10', '21:25', 0, fresh],
      '2026-03-12': [44, 'FR', '19:10', '21:25', 0, fresh],
    },
  },
};

test('fresh fares are bars, null is none, stale and unsearched days are left out', () => {
  const days = fareDays(file, 'out', 'FCO', { from: '2026-03-02', to: '2026-03-31', now: NOW });
  assert.deepEqual(days.map((d) => [d.date, d.state]), [['2026-03-05', 'fare'], ['2026-03-08', 'none'], ['2026-03-11', 'fare']]);
  assert.equal(days[0].leg.price, 41);
});

test('an unchecked wanted day gets one entry; a checked one stays a fare', () => {
  const a = fareDays(file, 'out', 'FCO', { from: '2026-03-02', to: '2026-03-31', wanted: '2026-03-14', now: NOW });
  assert.deepEqual(a.find((d) => d.date === '2026-03-14'), { date: '2026-03-14', leg: null, state: 'unchecked' });
  const b = fareDays(file, 'out', 'FCO', { from: '2026-03-02', to: '2026-03-31', wanted: '2026-03-11', now: NOW });
  assert.equal(b.filter((d) => d.date === '2026-03-11').length, 1);
  assert.equal(b.find((d) => d.date === '2026-03-11').state, 'fare');
});

test('back days on or before the way out are before; sorted; unknown airport is empty', () => {
  const days = fareDays(file, 'back', 'FCO', { from: '2026-03-02', to: '2026-03-31', after: '2026-03-06', now: NOW });
  assert.deepEqual(days.map((d) => d.state), ['before', 'fare']);
  assert.deepEqual(fareDays(file, 'out', 'XXX', { now: NOW }), []);
});

test('fareWindow: exact plus or minus 14, month and next for back, any to day 330, clipped at tomorrow', () => {
  const today = '2026-03-01';
  const exact = { when: { kind: 'exact', start: '2026-03-10', end: '2026-03-17' } };
  assert.deepEqual(fareWindow(exact, 'out', { today }), { from: '2026-03-02', to: '2026-03-24', wanted: '2026-03-10' });
  assert.deepEqual(fareWindow(exact, 'back', { today }), { from: '2026-03-03', to: '2026-03-31', wanted: '2026-03-17' });
  const month = { when: { kind: 'month', ym: '2026-05' } };
  assert.deepEqual(fareWindow(month, 'out', { today }), { from: '2026-05-01', to: '2026-05-31', wanted: null });
  assert.deepEqual(fareWindow(month, 'back', { today, outDate: '2026-05-20' }), { from: '2026-05-20', to: '2026-06-30', wanted: null });
  const any = { when: { kind: 'any' } };
  assert.deepEqual(fareWindow(any, 'out', { today }), { from: '2026-03-02', to: addDays(today, 330), wanted: null });
  assert.equal(fareWindow(any, 'back', { today, outDate: '2026-04-01' }).from, '2026-04-02');
});

test('barHeight starts at zero with a floor', () => {
  assert.equal(barHeight(50, 100), 36);
  assert.equal(barHeight(100, 100), 72);
  assert.equal(barHeight(1, 100), 6);
  assert.equal(barHeight(null, 100), 6);
});

test('pairFigure is the row formula (legCost per seat, flightPerSeat for the party)', () => {
  const out = { price: 41, airline: 'FR' };
  const back = { price: 44, airline: 'FR' };
  const parties = [
    { adults: 1, children: 0, babies: 0, seats: 1 },
    { adults: 2, children: 0, babies: 0, seats: 2 },
    { adults: 2, children: 1, babies: 1, seats: 3 },
  ];
  for (const bagKey of ['small', 'priority_10kg', 'checked_20kg']) {
    for (const party of parties) {
      const row = flightPerSeat(legCost(out, { paying: 1, bagKey }).perSeat + legCost(back, { paying: 1, bagKey }).perSeat, party);
      const f = pairFigure(out, back, { party, bagKey });
      assert.equal(f.perPerson, row, `${bagKey} ${party.seats}`);
      assert.equal(f.shown, row);
      assert.equal(pairFigure(out, back, { party, bagKey, group: true }).shown, Math.round(row * party.seats * 100) / 100);
    }
  }
  assert.equal(pairFigure(out, null, {}), null);
});

test('airportPairs: homes without a file left out, no pair is legs null, selected first', () => {
  const other = { from: 'CRL', to: { FCO: {} }, back: { FCO: {} } };
  const data = {
    flights: file,
    flightsBy: { BRU: file, CRL: other },
    meta: { home_airports: [{ iata: 'CRL' }, { iata: 'EIN' }, { iata: 'BRU' }], selected_origin: 'BRU' },
  };
  const req = { when: { kind: 'any' } };
  const rows = airportPairs(data, 'FCO', req, { party: { adults: 1, children: 0, babies: 0, seats: 1 }, bagKey: 'small', now: NOW });
  assert.deepEqual(rows.map((r) => r.iata), ['BRU', 'CRL']);
  assert.equal(rows[1].legs, null);
  assert.equal(rows[1].perPerson, null);
});

test('flightBasis picks near when a leg moved, else by date mode', () => {
  const exact = { when: { kind: 'exact', start: '2026-03-10', end: '2026-03-17' } };
  assert.equal(flightBasis(exact, { out: { date: '2026-03-10' }, back: { date: '2026-03-17' } }), 'days');
  assert.equal(flightBasis(exact, { out: { date: '2026-03-11' }, back: { date: '2026-03-17' } }), 'near');
  assert.equal(flightBasis({ when: { kind: 'month', ym: '2026-05' } }, null), 'month');
  assert.equal(flightBasis({ when: { kind: 'any' } }, null), 'any');
  assert.equal(flightBasis({ when: { kind: 'any' } }, null, { picked: true }), 'picked');
});
