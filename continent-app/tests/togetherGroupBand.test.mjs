// T931: the client half of a group trip: band, tallies, leader.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandTopFrom, bandState, fitsBand, tally, leader, owesVote, barScale,
} from '../src/together/groupBand.js';

test('the band top is the lowest maximum, rounded down to 5, from three budgets', () => {
  assert.equal(bandTopFrom([90, 74, 120]), 70);
  assert.equal(bandTopFrom([90, 75, 120]), 75);
  assert.equal(bandTopFrom([90, 74]), null);
  assert.equal(bandTopFrom([90, 0, 'x', 80]), null);
  assert.equal(bandTopFrom([90, 80], 2), 80);
});

test('band state reads the RPC row and never invents a top', () => {
  assert.deepEqual(bandState({ band_top: 70, members_set: 3, members: 3 }), { top: 70, set: 3, members: 3, ready: true });
  assert.equal(bandState({ band_top: null, members_set: 2, members: 3 }).ready, false);
  assert.equal(bandState(null).ready, false);
});

test('fits is true, false, or unknown', () => {
  const band = bandState({ band_top: 70, members_set: 3, members: 3 });
  assert.equal(fitsBand(64, band), true);
  assert.equal(fitsBand(70, band), true);
  assert.equal(fitsBand(88, band), false);
  assert.equal(fitsBand(null, band), null);
  assert.equal(fitsBand(64, bandState(null)), null);
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
