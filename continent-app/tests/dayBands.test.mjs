// T501: the parts of the day, tap moves across them, adds into a part,
// "Best route" inside the parts, dinner on the clock, the detail level and
// tickets in the day's price.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_BANDS, dayPhase, buildDaySchedule, rowBands, moveStopInDay, canMoveStop,
  insertStopInBand, optimizeWithinBands, prunePins, stopPhaseLabels,
} from '../src/planner/daySchedule.js';
import { loadDayDetail, saveDayDetail, normalizeDetail } from '../src/planner/dayDetail.js';
import { parseEuroCharge, ticketOf, dayTicketTotals, dayReceiptFigures } from '../src/lib/dayTickets.js';

// A day of stops by id, each visit `dwell` minutes, every walk 15 minutes.
function bandsFor(dwell) {
  return (order, pins) => rowBands(buildDaySchedule({
    items: order,
    legMin: () => 15,
    dwellMin: (id) => dwell[id] ?? 60,
    pinOf: (id) => pins[id] || null,
  }));
}

test('three parts, no midday: morning to 12:00, afternoon to 17:00, evening after', () => {
  assert.deepEqual(DAY_BANDS.map((b) => b.key), ['morning', 'afternoon', 'evening']);
  assert.equal(dayPhase(11 * 60 + 59).key, 'morning');
  assert.equal(dayPhase(12 * 60).key, 'afternoon');
  assert.equal(dayPhase(13 * 60).key, 'afternoon');
  assert.equal(dayPhase(17 * 60).key, 'evening');
  assert.deepEqual(stopPhaseLabels([{ arrive: '09:30' }, { arrive: '13:00' }, { arrive: '13:30' }]),
    ['day.phaseMorning', 'day.phaseAfternoon', null]);
});

test('a stop pinned to the evening waits for 17:00, and dinner follows the last visit', () => {
  const s = buildDaySchedule({
    items: ['a', 'b'], legMin: () => 10, dwellMin: () => 60, pinOf: (id) => (id === 'b' ? 'evening' : null),
  });
  assert.equal(s.rows[0].arriveMin, 9 * 60 + 30);
  assert.equal(s.rows[1].arriveMin, 17 * 60);
  assert.deepEqual(rowBands(s), ['morning', 'evening']);
  assert.equal(s.dinner.afterIndex, 1);
  assert.equal(s.dinner.startMin, 18 * 60);
});

test('dinner slots after the first visit ending past 18:00 when more follow', () => {
  const s = buildDaySchedule({
    items: ['a', 'b', 'c'], legMin: () => 0, dwellMin: (id) => (id === 'a' ? 9 * 60 : 30), startMin: 9 * 60 + 30,
  });
  // a ends 18:30 (lunch only after a stop that ends past 12:30 with more to come: after a)
  assert.equal(s.lunch.afterIndex, 0);
  assert.equal(s.dinner.afterIndex, 1);
});

test('move earlier and later swap inside a part, then cross one part at a time', () => {
  const bf = bandsFor({});
  const order = ['a', 'b', 'c'];
  // all three in the morning (09:30, 10:45, 12:00 is afternoon: c)
  assert.deepEqual(bf(order, {}), ['morning', 'morning', 'afternoon']);
  // b later: swaps with... c is in another part, so b crosses into the afternoon by a pin
  const later = moveStopInDay({ order, pins: {}, i: 1, dir: 1, bandsFor: bf });
  assert.deepEqual(later.order, order);
  assert.equal(later.pins.b, 'afternoon');
  assert.equal(bf(later.order, later.pins)[1], 'afternoon');
  // a earlier: first row of the first part cannot move
  assert.equal(moveStopInDay({ order, pins: {}, i: 0, dir: -1, bandsFor: bf }), null);
  // c later: last part is evening, so it can still cross
  const cLater = moveStopInDay({ order, pins: {}, i: 2, dir: 1, bandsFor: bf });
  assert.equal(cLater.pins.c, 'evening');
  // an evening stop moved earlier steps into the afternoon (empty), not over a stop
  const back = moveStopInDay({ order: cLater.order, pins: cLater.pins, i: 2, dir: -1, bandsFor: bf });
  assert.equal(back.pins.c, 'afternoon');
  assert.deepEqual(back.order, order);
});

test('move earlier jumps over the stop before when a pin cannot pull it back', () => {
  // a runs 09:30 to 12:30, so b (no pin) starts in the afternoon; a pin to
  // the morning changes nothing, so b jumps over a.
  const bf = bandsFor({ a: 180 });
  const r = moveStopInDay({ order: ['a', 'b'], pins: {}, i: 1, dir: -1, bandsFor: bf });
  assert.deepEqual(r.order, ['b', 'a']);
  assert.equal(r.pins.b, undefined);
});

test('canMoveStop: the first morning row cannot go earlier, the last evening row cannot go later', () => {
  assert.equal(canMoveStop(['morning', 'afternoon'], 0, -1), false);
  assert.equal(canMoveStop(['morning', 'afternoon'], 1, 1), true);
  assert.equal(canMoveStop(['morning', 'evening'], 1, 1), false);
  assert.equal(canMoveStop(['afternoon'], 0, -1), true);
});

test('a place added to a part goes to the end of that part, pinned', () => {
  const r = insertStopInBand({ order: ['a', 'b', 'c'], pins: { c: 'evening' }, id: 'x', band: 'afternoon', bands: ['morning', 'afternoon', 'evening'] });
  assert.deepEqual(r.order, ['a', 'b', 'x', 'c']);
  assert.equal(r.pins.x, 'afternoon');
  const end = insertStopInBand({ order: ['a'], pins: {}, id: 'x', band: null, bands: ['morning'] });
  assert.deepEqual(end.order, ['a', 'x']);
  assert.equal(end.pins.x, undefined);
  const morning = insertStopInBand({ order: ['a', 'b'], pins: {}, id: 'x', band: 'morning', bands: ['morning', 'afternoon'] });
  assert.deepEqual(morning.order, ['a', 'x', 'b']);
  assert.equal(morning.pins.x, undefined);
});

test('best route reorders inside each part only', () => {
  const out = optimizeWithinBands({
    order: ['a', 'b', 'c', 'd'],
    bands: ['morning', 'morning', 'afternoon', 'afternoon'],
    optimize: (ids) => [...ids].reverse(),
    anchorOf: () => null,
  });
  assert.deepEqual(out, ['b', 'a', 'd', 'c']);
  assert.deepEqual(prunePins({ a: 'evening', z: 'evening', b: 'morning' }, ['a', 'b']), { a: 'evening' });
});

test('the detail level defaults to the list and survives broken storage', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadDayDetail(store), 'list');
  saveDayDetail('parts', store);
  assert.equal(loadDayDetail(store), 'parts');
  saveDayDetail('nonsense', store);
  assert.equal(loadDayDetail(store), 'list');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadDayDetail(broken), 'list');
  assert.doesNotThrow(() => saveDayDetail('hour', broken));
  assert.equal(normalizeDetail('hour'), 'hour');
});

test('tickets: a readable euro charge counts, a fee without one is not known, nothing is made up', () => {
  assert.equal(parseEuroCharge('12 EUR'), 12);
  assert.equal(parseEuroCharge('EUR 12.50'), 12.5);
  assert.equal(parseEuroCharge('€8,50'), 8.5);
  assert.equal(parseEuroCharge('12 EUR; 6 EUR (child)'), 12);
  assert.equal(parseEuroCharge('15 CHF'), null);
  assert.equal(parseEuroCharge('10 to 15 EUR'), null);
  assert.equal(parseEuroCharge('12'), null);
  assert.deepEqual(ticketOf({ fee: 'yes', charge: '16 EUR' }), { kind: 'known', eur: 16 });
  assert.deepEqual(ticketOf({ tags: { fee: 'yes' } }), { kind: 'unknown' });
  assert.deepEqual(ticketOf({ fee: 'no' }), { kind: 'free' });
  assert.deepEqual(ticketOf({ name: 'Pantheon' }), { kind: 'none' });
  const t = dayTicketTotals([{ fee: 'yes', charge: '5 EUR' }, { fee: 'yes' }, { charge: '16 EUR' }, {}]);
  assert.deepEqual(t, { perPerson: 21, known: 2, unknown: 1 });
});

test('the day receipt: per person lines times the party, tickets only when known', () => {
  const r = dayReceiptFigures({ stayEur: 50, foodEur: 37, tickets: { perPerson: 21, known: 2, unknown: 1 }, party: 2 });
  assert.deepEqual(r.lines.map((l) => [l.key, l.eur]), [['bed', 100], ['food', 74], ['tickets', 42]]);
  assert.equal(r.each, 108);
  assert.equal(r.total, 216);
  assert.equal(r.unknownTickets, 1);
  const none = dayReceiptFigures({ stayEur: 50, foodEur: 37, tickets: { perPerson: 0, known: 0, unknown: 0 } });
  assert.deepEqual(none.lines.map((l) => l.key), ['bed', 'food']);
  assert.equal(none.total, 87);
});
