// T940: Settle up for group trips, the pure half (src/together/settle.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, splitCents, balances, simplify, settleUp, MAX_EXACT,
} from '../src/together/settle.js';

const sum = (list) => list.reduce((s, x) => s + x, 0);

/** Applies transfers to balances; every balance must end at zero. */
function settlesAll(net, transfers) {
  const left = new Map(net);
  for (const t of transfers) {
    assert.ok(t.amountCents > 0);
    assert.notEqual(t.from, t.to);
    left.set(t.from, (left.get(t.from) || 0) + t.amountCents);
    left.set(t.to, (left.get(t.to) || 0) - t.amountCents);
  }
  for (const v of left.values()) assert.equal(v, 0);
}

test('typed euros become cents, anything else is null', () => {
  assert.equal(toCents('12,50'), 1250);
  assert.equal(toCents('12.5'), 1250);
  assert.equal(toCents(' 240 '), 24000);
  assert.equal(toCents('0'), null);
  assert.equal(toCents('-5'), null);
  assert.equal(toCents('1.234'), null);
  assert.equal(toCents('abc'), null);
});

test('an equal split hands the odd cents to the first ids, the same on every device', () => {
  const s = splitCents(1000, ['c', 'a', 'b']);
  assert.deepEqual([...s.entries()], [['a', 334], ['b', 333], ['c', 333]]);
  assert.equal(sum([...s.values()]), 1000);
  assert.equal(splitCents(1000, []).size, 0);
  assert.equal(splitCents(0, ['a']).size, 0);
  assert.deepEqual([...splitCents(500, ['a', 'a', 'b']).values()], [250, 250]);
});

test('balances: paid minus shares, settlements move money back, the sum is zero', () => {
  const net = balances([
    { paidBy: 'sam', amountCents: 24000, splitAmong: ['me', 'sam', 'jo'] },
    { paidBy: 'me', amountCents: 9000, splitAmong: ['me', 'sam', 'jo'] },
    { paidBy: 'jo', amountCents: 4500, splitAmong: ['me', 'jo'] },
  ]);
  assert.equal(net.get('sam'), 13000);
  assert.equal(net.get('me'), -4250);
  assert.equal(net.get('jo'), -8750);
  assert.equal(sum([...net.values()]), 0);
  const after = balances(
    [{ paidBy: 'sam', amountCents: 3000, splitAmong: ['sam', 'jo'] }],
    [{ from: 'jo', to: 'sam', amountCents: 1500 }],
  );
  assert.equal(after.get('sam'), 0);
  assert.equal(after.get('jo'), 0);
});

test('simplify settles every balance with the fewest transfers', () => {
  const net = new Map([['sam', 13000], ['me', -4250], ['jo', -8750]]);
  const tr = simplify(net);
  assert.equal(tr.length, 2);
  settlesAll(net, tr);
  assert.deepEqual(tr[0], { from: 'jo', to: 'sam', amountCents: 8750 });
});

test('simplify settles each zero-sum group on its own', () => {
  // {a, b, c} and {d, e, f} each add up to zero: 6 people, 2 groups, so
  // 4 transfers rather than 5.
  const net = { a: 300, b: -100, c: -200, d: 700, e: -350, f: -350 };
  const tr = simplify(net);
  settlesAll(new Map(Object.entries(net)), tr);
  assert.equal(tr.length, 4); // 6 people in 2 groups: 6 - 2
  const greedyish = { x: 400, y: 300, z: -350, w: -350 };
  const tr2 = simplify(greedyish);
  settlesAll(new Map(Object.entries(greedyish)), tr2);
  assert.equal(tr2.length, 3);
});

test('nothing owed gives no transfers; a broken ledger is refused', () => {
  assert.deepEqual(simplify(new Map([['a', 0], ['b', 0]])), []);
  assert.deepEqual(simplify({}), []);
  assert.throws(() => simplify({ a: 100, b: -50 }));
});

test('beyond the exact limit it still settles everything', () => {
  const net = {};
  const n = MAX_EXACT + 4;
  for (let i = 0; i < n - 1; i += 1) net[`p${String(i).padStart(2, '0')}`] = (i % 2 ? -1 : 1) * (100 + i * 7);
  net.last = -Object.values(net).reduce((s, v) => s + v, 0);
  const tr = simplify(net);
  settlesAll(new Map(Object.entries(net)), tr);
  assert.ok(tr.length <= n - 1);
});

test('settleUp returns the spend, the balances and the transfers', () => {
  const r = settleUp(
    [{ paidBy: 'a', amountCents: 1000, splitAmong: ['a', 'b'] }],
    [],
  );
  assert.equal(r.spentCents, 1000);
  assert.deepEqual(r.transfers, [{ from: 'b', to: 'a', amountCents: 500 }]);
});
