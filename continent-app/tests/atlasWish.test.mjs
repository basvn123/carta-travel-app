// G12 My trips atlas, judge round 1: the wish hatch never hides "been".
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wishDraw } from '../src/auth/mytrips/atlas/wish.js';

test('a been country with saves keeps its been fill, the hatch laid over it', () => {
  assert.equal(wishDraw('been', true), 'over');
});

test('land neither been nor next takes the hatch as its fill', () => {
  assert.equal(wishDraw('none', true), 'fill');
  assert.equal(wishDraw('saved', true), 'fill');
});

test('the next trip keeps its own hatch; a country without saves is untouched', () => {
  assert.equal(wishDraw('next', true), 'next');
  assert.equal(wishDraw('next', false), 'next');
  assert.equal(wishDraw('been', false), '');
  assert.equal(wishDraw('none', false), '');
});
