// G16 (Vrienden and kringen, decision 0017): the kring tool's pure logic,
// the vote ranking, the best date window and the fairest fare.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankProposals, nextVote } from '../src/lib/circles/rank.js';
import { bestWindow, dayCounts, dayNumber, freeOn } from '../src/lib/circles/window.js';
import { fairest } from '../src/lib/circles/fairest.js';

const P = [
  { id: 'lis', created_at: '2026-11-01T10:00:00Z' },
  { id: 'por', created_at: '2026-11-02T10:00:00Z' },
  { id: 'nap', created_at: '2026-11-03T10:00:00Z' },
];

test('rank: score is up minus down, highest first', () => {
  const votes = [
    { proposal_id: 'nap', user_id: 'a', value: 1 },
    { proposal_id: 'nap', user_id: 'b', value: 1 },
    { proposal_id: 'lis', user_id: 'a', value: -1 },
    { proposal_id: 'por', user_id: 'c', value: 1 },
  ];
  const r = rankProposals(P, votes);
  assert.deepEqual(r.map((x) => [x.id, x.score, x.rank]), [['nap', 2, 1], ['por', 1, 2], ['lis', -1, 3]]);
  assert.deepEqual(r[0].upBy, ['a', 'b']);
});

test('rank: a tie goes to the earlier proposal, whatever the input order', () => {
  const votes = [{ proposal_id: 'nap', user_id: 'a', value: 1 }, { proposal_id: 'lis', user_id: 'b', value: 1 }];
  const r = rankProposals([P[2], P[1], P[0]], votes);
  assert.deepEqual(r.map((x) => x.id), ['lis', 'nap', 'por']);
});

test('rank: my local vote replaces my stored row, and 0 clears it', () => {
  const votes = [{ proposal_id: 'lis', user_id: 'me', value: 1 }, { proposal_id: 'por', user_id: 'x', value: 1 }];
  let r = rankProposals(P, votes, { me: 'me', values: { lis: -1 } });
  assert.equal(r.find((x) => x.id === 'lis').score, -1);
  assert.equal(r.find((x) => x.id === 'lis').mine, -1);
  r = rankProposals(P, votes, { me: 'me', values: { lis: 0 } });
  assert.equal(r.find((x) => x.id === 'lis').score, 0);
  assert.equal(r.find((x) => x.id === 'lis').mine, 0);
  r = rankProposals(P, votes, { me: 'me' });
  assert.equal(r.find((x) => x.id === 'lis').mine, 1);
  assert.equal(r[0].id, 'lis');
});

test('rank: no proposals, no votes, bad values', () => {
  assert.deepEqual(rankProposals([], []), []);
  const r = rankProposals(P, [{ proposal_id: 'por', user_id: 'a', value: 5 }]);
  assert.deepEqual(r.map((x) => x.score), [0, 0, 0]);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(0, -1), -1);
  assert.equal(nextVote(-1, 1), 1);
});

const M = ['a', 'b', 'c'];

test('window: the run where everyone is free wins over a longer partial run', () => {
  const av = [
    { user_id: 'a', start_date: '2027-05-01', end_date: '2027-05-20' },
    { user_id: 'b', start_date: '2027-05-01', end_date: '2027-05-20' },
    { user_id: 'c', start_date: '2027-05-12', end_date: '2027-05-15' },
  ];
  assert.deepEqual(bestWindow(av, M), { start: '2027-05-12', end: '2027-05-15', nights: 3, count: 3, total: 3 });
});

test('window: among equal counts the longest run, then the earliest', () => {
  const av = [
    { user_id: 'a', start_date: '2027-05-01', end_date: '2027-05-03' },
    { user_id: 'a', start_date: '2027-05-10', end_date: '2027-05-14' },
    { user_id: 'a', start_date: '2027-06-01', end_date: '2027-06-05' },
  ];
  assert.deepEqual(bestWindow(av, ['a']), { start: '2027-05-10', end: '2027-05-14', nights: 4, count: 1, total: 1 });
});

test('window: minNights drops to a lower count when the full group has too short a run', () => {
  const av = [
    { user_id: 'a', start_date: '2027-05-01', end_date: '2027-05-10' },
    { user_id: 'b', start_date: '2027-05-01', end_date: '2027-05-10' },
    { user_id: 'c', start_date: '2027-05-04', end_date: '2027-05-05' },
  ];
  assert.equal(bestWindow(av, M, { minNights: 1 }).count, 3);
  const w = bestWindow(av, M, { minNights: 3 });
  assert.deepEqual(w, { start: '2027-05-01', end: '2027-05-10', nights: 9, count: 2, total: 3 });
});

test('window: overlapping ranges of one member count once, a range across months', () => {
  const av = [
    { user_id: 'a', start_date: '2027-04-28', end_date: '2027-05-03' },
    { user_id: 'a', start_date: '2027-04-30', end_date: '2027-05-02' },
    { user_id: 'b', start_date: '2027-04-29', end_date: '2027-05-04' },
  ];
  const counts = dayCounts(av, ['a', 'b']);
  assert.equal(counts.get('2027-05-01'), 2);
  assert.equal(counts.get('2027-04-28'), 1);
  assert.deepEqual(bestWindow(av, ['a', 'b']), { start: '2027-04-29', end: '2027-05-03', nights: 4, count: 2, total: 2 });
  assert.deepEqual(freeOn(av, ['a', 'b'], '2027-04-28'), ['a']);
});

test('window: no availability, no members, a non-member and bad rows', () => {
  assert.equal(bestWindow([], M), null);
  assert.equal(bestWindow([{ user_id: 'a', start_date: '2027-05-01', end_date: '2027-05-03' }], []), null);
  const av = [
    { user_id: 'zz', start_date: '2027-05-01', end_date: '2027-05-30' },
    { user_id: 'a', start_date: '2027-05-09', end_date: '2027-05-01' },
    { user_id: 'a', start_date: 'soon', end_date: '2027-05-01' },
  ];
  assert.equal(bestWindow(av, M), null);
});

test('window: one member, and the day maths survives a clock change', () => {
  // The last Sunday of March moves the clock in Europe; day numbers are UTC.
  assert.equal(dayNumber('2027-03-29') - dayNumber('2027-03-27'), 2);
  const w = bestWindow([{ user_id: 'a', start_date: '2027-03-26', end_date: '2027-03-30' }], ['a']);
  assert.deepEqual(w, { start: '2027-03-26', end: '2027-03-30', nights: 4, count: 1, total: 1 });
});

test('fairest: the complete proposal with the smallest spread', () => {
  const rows = [
    { id: 'lis', fares: { a: 120, b: 180, c: 150 } },
    { id: 'por', fares: { a: 140, b: 150, c: 145 } },
    { id: 'nap', fares: { a: 60, b: null, c: 70 } },
  ];
  const f = fairest(rows, M);
  assert.equal(f.fairestId, 'por');
  assert.deepEqual(f.rows[0], { id: 'lis', avg: 150, spread: 60, min: 120, max: 180, priced: 3, complete: true });
  assert.equal(f.rows[2].complete, false);
  assert.equal(f.rows[2].avg, 65);
});

test('fairest: none when every proposal is incomplete; ties to the lower average', () => {
  assert.equal(fairest([{ id: 'x', fares: { a: 10 } }, { id: 'y', fares: {} }], ['a', 'b']).fairestId, null);
  const tie = fairest([{ id: 'x', fares: { a: 100, b: 120 } }, { id: 'y', fares: { a: 50, b: 70 } }], ['a', 'b']);
  assert.equal(tie.fairestId, 'y');
  assert.deepEqual(fairest([], M), { rows: [], fairestId: null });
  assert.equal(fairest([{ id: 'x', fares: {} }], []).rows[0].complete, false);
});
