// G12 My trips atlas: a city projected with the plate's frame constants lands
// where the plate builder put it (fixtures from the run's prototype/prep_atlas.py).
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, frame, clampFrame, PLATE, viewBoxOf } from '../src/auth/mytrips/atlas/project.js';

const near = (got, want, tol = 0.15) => {
  assert.ok(Math.abs(got[0] - want[0]) <= tol && Math.abs(got[1] - want[1]) <= tol, `${got} vs ${want}`);
};

test('Hallstatt, Bergen, Lisbon and Tromso land on the plate', () => {
  near(project(47.562, 13.649), [506.7, 691.8]);
  near(project(60.391, 5.322), [374.2, 336.0]);
  near(project(38.722, -9.139), [26.6, 885.6]);
  near(project(69.649, 18.956), [525.5, 77.5]);
  near(project(37.98, 23.73), [738.9, 931.1]);
});

test('a place without a position has no point', () => {
  assert.equal(project(null, 4), null);
  assert.equal(project(51, Number.NaN), null);
});

test('frame keeps the slot aspect and a minimum width', () => {
  const one = frame([project(47.562, 13.649)], 2);
  assert.equal(one.w, 220);
  assert.ok(Math.abs(one.w / one.h - 2) < 1e-9);
  const wide = frame([project(38.722, -9.139), project(69.649, 18.956)], 1, { pad: 0 });
  assert.ok(wide.w >= 500 && wide.h >= 800);
  assert.ok(Math.abs(wide.w - wide.h) < 1e-9);
  const empty = frame([], 1);
  assert.equal(empty.w, PLATE.w);
  assert.match(viewBoxOf(one), /^[\d.-]+ [\d.-]+ 220\.0 110\.0$/);
});

test('clampFrame keeps a wide pane inside the plate at the pane aspect', () => {
  const f = clampFrame({ x: -100, y: 0, w: 1600, h: 800 });
  assert.ok(Math.abs(f.w / f.h - 2) < 1e-9);
  // Only the Atlantic side may run past the plate.
  assert.ok(f.x >= -400 - 1e-9 && f.x + f.w <= PLATE.w + 1e-9);
  assert.ok(f.y >= 0 && f.y + f.h <= PLATE.h + 1e-9);
  const east = clampFrame({ x: 800, y: 300, w: 400, h: 300 });
  assert.equal(east.w, 400);
  assert.ok(Math.abs(east.x + east.w - PLATE.w) < 1e-9);
});
