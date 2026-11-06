import test from 'node:test';
import assert from 'node:assert/strict';
import { trailHash } from '../src/lib/routeLinks.js';

test('an open walk writes #trail=ID&tc=CC', () => {
  assert.equal(trailHash('', { id: 63478, country: 'al' }), '#trail=63478&tc=AL');
  assert.equal(trailHash('', { id: 5, cc: 'AT' }), '#trail=5&tc=AT');
});

test('closing takes only our two params off and keeps the rest', () => {
  assert.equal(trailHash('#trail=5&tc=AT', null), '');
  assert.equal(trailHash('#access_token=x&trail=5&tc=AT', null), '#access_token=x');
});

test('opening another walk replaces the first', () => {
  assert.equal(trailHash('#trail=5&tc=AT', { id: 6, country: 'DE' }), '#trail=6&tc=DE');
});

test('a bad id writes nothing', () => {
  assert.equal(trailHash('', { id: 'x', country: 'AT' }), '');
});

import { trailFigures } from '../src/lib/cardFillings.js';

test('a rail tile carries length, time and climb (G13)', () => {
  const tr = { distance_m: 16419, duration_min: 470, ascent_m: 985 };
  assert.deepEqual(trailFigures(tr), ['16.4 km', '7 h 50 min', '+985 m']);
});

test('a missing figure is left out, never invented', () => {
  assert.deepEqual(trailFigures({ distance_m: 5000 }), ['5 km']);
});
