// G15 Uitgaven and Reiskas: the money model in lib/spend/model.js. Cents,
// the split and its rounding, old rows as an equal split, the kas and its
// transfers, and the ledger bridge with no double count.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ME, kasPeople, splitEqual, equalAmounts, splitSum, splitFromAmounts, makeSpend, readSpend, readLedger,
  mineOnDay, kasBalances, kasTransfers, kasExtremes, roadSpendByCat, tripSpendPP,
} from '../src/lib/spend/model.js';
import { spendOnDay } from '../src/lib/myTrips.js';
import { toEur } from '../src/lib/currency.js';
import { spendPerPerson } from '../src/auth/pastTripMemory.js';

const EXTRAS = { people: [{ name: 'Sam' }, { name: 'Jo' }, { name: 'Lien' }] };
const PEOPLE = kasPeople(EXTRAS);

test('kasPeople: you first, then the named crew by their crew ids', () => {
  assert.deepEqual(PEOPLE.map((p) => p.id), [ME, 'p0', 'p1', 'p2']);
  assert.deepEqual(PEOPLE.map((p) => p.name), ['', 'Sam', 'Jo', 'Lien']);
});

test('kasPeople: nobody named, the group size still splits', () => {
  assert.deepEqual(kasPeople({ people: [] }, { groupSize: 3 }).map((p) => p.id), [ME, 'p0', 'p1']);
  assert.deepEqual(kasPeople({ people: [] }, { groupSize: 1 }).map((p) => p.id), [ME]);
});

test('kasPeople: a partly named crew is padded to the party size', () => {
  const extras = { people: [{ name: 'Sam' }] };
  const people = kasPeople(extras, { groupSize: 4 });
  assert.deepEqual(people.map((p) => p.id), [ME, 'p0', 'p1', 'p2']);
  assert.deepEqual(people.map((p) => p.name), ['', 'Sam', '', '']);
  // An old 40 EUR row reads as 10,00 a person, as the old Today showed.
  const old = readSpend({ id: '1', amount: 40, currency: 'EUR', paidBy: 0, sharers: null }, people, toEur);
  assert.equal(old.mine, 1000);
  // More named than the group size: everyone named counts.
  assert.equal(kasPeople(EXTRAS, { groupSize: 2 }).length, 4);
});

test('splitEqual: the odd cents go to the payer, the sum is exact', () => {
  const s = splitEqual(1000, [ME, 'p0', 'p1'], 'p1');
  assert.deepEqual(s, { me: 333, p0: 333, p1: 334 });
  assert.equal(splitSum(s), 1000);
  // A payer not among the sharers: the first sharer takes the odd cent.
  assert.deepEqual(splitEqual(1001, ['p0', 'p1'], ME), { p0: 501, p1: 500 });
  assert.deepEqual(splitEqual(0, [ME], ME), {});
  assert.deepEqual(equalAmounts(10, [ME, 'p0', 'p1'], ME), { me: 3.34, p0: 3.33, p1: 3.33 });
});

test('splitFromAmounts: per person in a foreign currency adds up exactly', () => {
  const s = splitFromAmounts({ me: '10', p0: '20', p1: '' }, 0.23, 690, 'p0');
  assert.equal(splitSum(s), 690);
  assert.deepEqual(Object.keys(s).sort(), ['me', 'p0']);
});

test('makeSpend: Iedereen, cents, remainder to the payer, mineCents, old fields kept', () => {
  const row = makeSpend({ amount: 10, currency: 'EUR', cat: 'food', desc: 'Lunch', payer: 'p1', mode: 'all' }, PEOPLE, { id: 'a', date: '2026-11-21' });
  assert.equal(row.cents, 1000);
  assert.equal(splitSum(row.split), 1000);
  assert.equal(row.split.p1, 250);
  assert.equal(row.mineCents, 250);
  assert.equal(row.priv, false);
  // An old reader still sees the group total in its category.
  assert.deepEqual(spendOnDay([row], '2026-11-21').byCat, { food: 10 });
  const odd = makeSpend({ amount: 10.01, payer: 'p0', mode: 'all' }, PEOPLE);
  assert.equal(odd.split.p0, 251);
  assert.equal(odd.mineCents, 250);
});

test('makeSpend: Alleen ik is private and yours alone; Per persoon must add up', () => {
  const mine = makeSpend({ amount: 8.5, payer: 'p0', mode: 'me', cat: 'other' }, PEOPLE);
  assert.equal(mine.priv, true);
  assert.equal(mine.payer, ME);
  assert.deepEqual(mine.split, { me: 850 });
  const each = makeSpend({ amount: 58, payer: 'p1', mode: 'each', shares: { me: '14,5'.replace(',', '.'), p0: 18, p1: 12, p2: 13.5 } }, PEOPLE);
  assert.equal(each.mineCents, 1450);
  assert.equal(each.split.p0, 1800);
  // Shares that do not reach the amount are corrected onto the payer, so a
  // draft the sheet let through always adds up.
  const short = makeSpend({ amount: 10, payer: 'p0', mode: 'each', shares: { me: 4, p0: 4 } }, PEOPLE);
  assert.equal(splitSum(short.split), 1000);
  assert.equal(makeSpend({ amount: 0 }, PEOPLE), null);
});

test('makeSpend: a foreign spend keeps its currency and stores euro cents', () => {
  const row = makeSpend({ amount: 100, currency: 'PLN', rate: 0.23, payer: ME, mode: 'all' }, PEOPLE);
  assert.equal(row.currency, 'PLN');
  assert.equal(row.amount, 100);
  assert.equal(row.cents, 2300);
  assert.equal(row.mineCents, 575);
});

test('readSpend: an old row reads as an equal split with no payer', () => {
  const old = { id: '1', desc: 'Lunch', amount: 31.5, currency: 'EUR', paidBy: 0, sharers: null, date: '2026-11-21', cat: 'food' };
  const r = readSpend(old, PEOPLE, toEur);
  assert.equal(r.legacy, true);
  assert.equal(r.payer, null);
  assert.equal(r.cents, 3150);
  assert.equal(splitSum(r.split), 3150);
  assert.equal(r.mine, 3150 - 787 * 3);
  // An old row naming crew seats splits over those seats only.
  const seats = readSpend({ ...old, sharers: [0, 1] }, PEOPLE, toEur);
  assert.deepEqual(Object.keys(seats.split).sort(), ['p0', 'p1']);
  assert.equal(seats.mine, 0);
  assert.equal(readSpend({ id: 'memory:food', src: 'memory', amount: 400 }, PEOPLE), null);
});

test('mineOnDay: your share of a day, private rows included', () => {
  const rows = readLedger([
    makeSpend({ amount: 9.6, payer: ME, mode: 'all', cat: 'food' }, PEOPLE, { id: '1', date: '2026-11-21' }),
    makeSpend({ amount: 8.5, payer: ME, mode: 'me', cat: 'other' }, PEOPLE, { id: '2', date: '2026-11-21' }),
    makeSpend({ amount: 96, payer: 'p2', mode: 'all', cat: 'food' }, PEOPLE, { id: '3', date: '2026-11-20' }),
  ], PEOPLE, toEur);
  assert.deepEqual(mineOnDay(rows, '2026-11-21'), { cents: 240 + 850, byCat: { food: 240, other: 850 } });
});

test('kas: balances sum to zero, private and old rows stay out, transfers settle it', () => {
  const ledger = [
    makeSpend({ amount: 9.6, payer: ME, mode: 'all' }, PEOPLE, { id: '1' }),
    makeSpend({ amount: 12, payer: 'p0', mode: 'all' }, PEOPLE, { id: '2' }),
    makeSpend({ amount: 58, payer: 'p1', mode: 'each', shares: { me: 14.5, p0: 18, p1: 12, p2: 13.5 } }, PEOPLE, { id: '3' }),
    makeSpend({ amount: 8.5, payer: ME, mode: 'me' }, PEOPLE, { id: '7' }),
    makeSpend({ amount: 80, payer: ME, mode: 'all' }, PEOPLE, { id: '4' }),
    makeSpend({ amount: 96, payer: 'p2', mode: 'all' }, PEOPLE, { id: '5' }),
    makeSpend({ amount: 120, payer: ME, mode: 'all' }, PEOPLE, { id: '6' }),
    { id: '8', amount: 40, currency: 'EUR', paidBy: 0, sharers: null },
  ];
  const rows = readLedger(ledger, PEOPLE, toEur);
  const net = kasBalances(rows, [], PEOPLE);
  assert.equal(Object.values(net).reduce((s, v) => s + v, 0), 0);
  // You paid 9.60 + 80 + 120 and owe 2.40 + 3 + 14.50 + 20 + 24 + 30.
  assert.equal(net.me, 960 + 8000 + 12000 - (240 + 300 + 1450 + 2000 + 2400 + 3000));
  const tr = kasTransfers(net);
  assert.ok(tr.length <= PEOPLE.length - 1);
  // Paying every transfer settles the kas.
  const after = kasBalances(rows, tr, PEOPLE);
  assert.ok(Object.values(after).every((v) => v === 0));
  const { top, low } = kasExtremes(net);
  assert.equal(top, ME);
  assert.ok(low && low !== ME);
});

test('ledger bridge: your share only, never the group total, never twice', () => {
  const ledger = [
    makeSpend({ amount: 40, payer: ME, mode: 'all', cat: 'food' }, PEOPLE, { id: '1', date: '2026-11-20' }),
    makeSpend({ amount: 20, payer: 'p0', mode: 'all', cat: 'transport' }, PEOPLE, { id: '2', date: '2026-11-20' }),
    makeSpend({ amount: 6, payer: ME, mode: 'me', cat: 'other' }, PEOPLE, { id: '3', date: '2026-11-21' }),
    { id: 'memory:stay', src: 'memory', amount: 600, currency: 'EUR', cat: 'stay' },
  ];
  const road = roadSpendByCat(ledger, PEOPLE, toEur);
  assert.deepEqual(road, { food: 10, transport: 5, other: 6 });
  // No memory: the road spend is the trip's spend a person.
  assert.equal(tripSpendPP(null, road, toEur), 21);
  // A typed hotel total keeps the logged food; a typed food total wins over
  // the logged food, so food is not counted twice.
  const mem = { spend: { currency: 'EUR', stay: 600, food: 100 }, travellers: { adults: 2, children: 0 } };
  assert.equal(tripSpendPP(mem, road, toEur), 300 + 50 + 5 + 6);
  // With nothing logged, it is exactly the old memory figure.
  assert.equal(tripSpendPP(mem, {}, toEur), spendPerPerson(mem));
  assert.equal(tripSpendPP(null, {}, toEur), null);
});
