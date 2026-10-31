// T931, T938: the client half of a group trip: band, tallies, leader. The
// budgets and the band are for the whole trip, a person (T938).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandTopFrom, bandState, fitsBand, tally, leader, owesVote, barScale, tripTotal,
} from '../src/together/groupBand.js';

test('the band top is the lowest trip maximum, rounded down to 10, from three budgets', () => {
  assert.equal(bandTopFrom([1200, 907, 1500]), 900);
  assert.equal(bandTopFrom([1200, 910, 1500]), 910);
  assert.equal(bandTopFrom([1200, 907]), null);
  assert.equal(bandTopFrom([1200, 0, 'x', 800]), null);
  assert.equal(bandTopFrom([1200, 800], 2), 800);
});

test('band state reads the RPC row and never invents a top', () => {
  assert.deepEqual(bandState({ band_top: 900, members_set: 3, members: 3 }), { top: 900, set: 3, members: 3, ready: true });
  assert.equal(bandState({ band_top: null, members_set: 2, members: 3 }).ready, false);
  assert.equal(bandState(null).ready, false);
});

test('a trip total a person is the day price times the nights, whole euros', () => {
  assert.equal(tripTotal(64.4, 7), 451);
  assert.equal(tripTotal(80, 1), 80);
  assert.equal(tripTotal(80, 0), null);
  assert.equal(tripTotal(null, 7), null);
  assert.equal(tripTotal(80, 'x'), null);
});

test('fits compares trip totals: true, false, or unknown', () => {
  const band = bandState({ band_top: 900, members_set: 3, members: 3 });
  assert.equal(fitsBand(tripTotal(100, 7), band), true);
  assert.equal(fitsBand(900, band), true);
  assert.equal(fitsBand(tripTotal(140, 7), band), false);
  assert.equal(fitsBand(null, band), null);
  assert.equal(fitsBand(640, bandState(null)), null);
});

const opts = [{ id: 'a', kind: 'where' }, { id: 'b', kind: 'where' }, { id: 'c', kind: 'where' }];
const votes = [
  { kind: 'where', userId: 'sam', optionId: 'a' },
  { kind: 'where', userId: 'jo', optionId: 'b' },
  { kind: 'when', userId: 'jo', optionId: 'x' },
];

test('tally counts one question only', () => {
  const t = tally(opts, votes, 'me');
  assert.deepEqual(t.map((o) => o.count), [1, 1, 0]);
  assert.equal(t[0].share, 0.5);
  assert.equal(t.some((o) => o.mine), false);
  const t2 = tally(opts, [...votes, { kind: 'where', userId: 'me', optionId: 'b' }], 'me');
  assert.equal(t2[1].count, 2);
  assert.equal(t2[1].mine, true);
});

test('the leader is most votes, then the lower price, then the first added', () => {
  const prices = { a: 88, b: 72, c: 64 };
  assert.equal(leader(tally(opts, votes, 'me'), (o) => prices[o.id]).id, 'b');
  assert.equal(leader(tally(opts, votes, 'me')).id, 'a');
  assert.equal(leader(tally(opts, [], 'me')), null);
});

test('a vote is owed only on a question that has options', () => {
  assert.equal(owesVote(opts, votes, 'me', 'where'), true);
  assert.equal(owesVote(opts, votes, 'jo', 'where'), false);
  assert.equal(owesVote(opts, votes, 'me', 'when'), false);
});

test('the bar scale holds every figure', () => {
  const s = barScale([64, 72, 88, 90]);
  assert.ok(s.max >= 90);
  assert.equal(s.pct(0), 0);
  assert.ok(s.pct(90) < 100);
  assert.equal(barScale([]).max, 120);
});
