import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestDrawerState, nextDrawerState, drawerVisiblePx, STRIP_PX } from '../src/lib/mapDrawerState.js';

test('the handle cycles strip, half, full, back to the map', () => {
  assert.equal(nextDrawerState('strip'), 'half');
  assert.equal(nextDrawerState('half'), 'full');
  assert.equal(nextDrawerState('full'), 'strip');
});

test('a released drag snaps to the nearest stop', () => {
  assert.equal(nearestDrawerState(80, 700), 'strip');
  assert.equal(nearestDrawerState(330, 700), 'half');
  assert.equal(nearestDrawerState(640, 700), 'full');
  assert.equal(nearestDrawerState(300, 0), 'strip');
});

test('the strip is 72 px and never more than the host shows', () => {
  assert.equal(drawerVisiblePx('strip', 700), STRIP_PX);
  assert.equal(drawerVisiblePx('half', 700), 350);
  assert.equal(drawerVisiblePx('full', 700), 700);
  assert.equal(drawerVisiblePx('half', 100), STRIP_PX);
});
