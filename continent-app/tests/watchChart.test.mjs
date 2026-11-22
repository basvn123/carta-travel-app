// G12 Bewaard: the watch chart's geometry (lib/watchChart.js), drawn from
// the measured points only.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chartGeometry } from '../src/lib/watchChart.js';

test('no points draw no chart', () => {
  assert.equal(chartGeometry([], 100, 50), null);
  assert.equal(chartGeometry(null, 100, 50), null);
});

test('the cheapest point sits lowest on the page, the last is now', () => {
  const g = chartGeometry([146, 140, 118, 125], 222, 54);
  assert.equal(g.dots.length, 4);
  assert.equal(g.lowest, 2);
  const ys = g.dots.map((p) => p.y);
  assert.equal(Math.max(...ys), ys[2], 'the lowest price is the lowest dot (largest y)');
  assert.equal(Math.min(...ys), ys[0], 'the highest price is the top dot');
  assert.deepEqual(g.dots.map((p) => p.now), [false, false, false, true]);
  assert.ok(g.dots[0].x < g.dots[3].x);
  assert.match(g.d, /^M[\d. L]+$/);
  assert.ok(g.area.endsWith('Z'));
});

test('one point or a flat series stays inside the box', () => {
  const one = chartGeometry([97], 200, 60);
  assert.equal(one.dots[0].x, 100, 'a single point sits in the middle');
  const flat = chartGeometry([90, 90, 90], 200, 60, { axis: true });
  flat.dots.forEach((p) => { assert.ok(p.y >= 0 && p.y <= 60 - flat.foot); });
});
