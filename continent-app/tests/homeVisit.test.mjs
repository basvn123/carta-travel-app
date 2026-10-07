import test from 'node:test';
import assert from 'node:assert/strict';
import { readFirstVisit, markHomeSeen, HOME_SEEN_KEY } from '../src/lib/homeVisit.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('a first visit with no link is first', () => {
  assert.equal(readFirstVisit(mem(), '', ''), true);
});

test('a link wins: query string or hash is never a first visit', () => {
  assert.equal(readFirstVisit(mem(), '?tab=trip', ''), false);
  assert.equal(readFirstVisit(mem(), '', '#dest=LIS'), false);
});

test('marking seen makes the next visit a return visit', () => {
  const s = mem();
  assert.equal(readFirstVisit(s, '', ''), true);
  markHomeSeen(s);
  assert.equal(s.getItem(HOME_SEEN_KEY), '1');
  assert.equal(readFirstVisit(s, '', ''), false);
});

test('storage that throws is a return visit, never a loop', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readFirstVisit(bad, '', ''), false);
  assert.doesNotThrow(() => markHomeSeen(bad));
});
