import test from 'node:test';
import assert from 'node:assert/strict';
import { routePageUrl } from '../src/lib/routeLinks.js';

test('a hiking row links to its trail page with the country', () => {
  assert.equal(routePageUrl('hiking', { id: 191016, cc: 'it' }, 'https://x.test/'),
    'https://x.test/#trail=191016&tc=IT');
});

test('a cycling row links to its cycle page', () => {
  assert.equal(routePageUrl('cycling', { id: 7, cc: 'GB' }), '#cycle=7&cc=GB');
});

test('a row without a usable id has no address', () => {
  assert.equal(routePageUrl('hiking', { id: 'x' }), '');
  assert.equal(routePageUrl('hiking', null), '');
  assert.equal(routePageUrl('hiking', { id: 5 }), '#trail=5');
});
