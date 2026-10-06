import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slopeClass, slopeRuns, slopeShares, profileAt, pointAlong, monthCells,
  altitudeParts, lakeWedge, compassPoint, pavedShares, kmOf, trafficMix,
  ALT_SCALE_M,
} from '../src/lib/signature.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('slope classes use the wire steps, uphill or down', () => {
  assert.equal(slopeClass(4), 0);
  assert.equal(slopeClass(10), 0);
  assert.equal(slopeClass(10.1), 1);
  assert.equal(slopeClass(-12), 1);
  assert.equal(slopeClass(15.5), 2);
  assert.equal(slopeClass(null), 0);
});

test('slopeRuns merges neighbouring segments of one class', () => {
  // 0-100 flat, 100-200 +12 m (12%), 200-300 +20 m (20%), 300-400 +20 m
  const prof = [[0, 100], [100, 100], [200, 112], [300, 132], [400, 152]];
  assert.deepEqual(slopeRuns(prof), [
    { cls: 0, from: 0, to: 1 },
    { cls: 1, from: 1, to: 2 },
    { cls: 2, from: 2, to: 4 },
  ]);
  assert.deepEqual(slopeRuns([[0, 1]]), []);
  assert.deepEqual(slopeRuns(null), []);
});

test('slopeShares reads both the detail and the card names and sums to one', () => {
  const a = slopeShares({ steep10_pct: 55.3, steep15_pct: 38.8 });
  const b = slopeShares({ p10: 55.3, p15: 38.8 });
  assert.deepEqual(a, b);
  assert.ok(near(a.reduce((s, p) => s + p.share, 0), 1));
  assert.ok(near(a[2].share, 0.388));
  assert.ok(near(a[1].share, 0.165));
  assert.equal(slopeShares({ p10: 5 }), null);
  assert.equal(slopeShares(null), null);
});

test('profileAt interpolates height and reports the segment grade', () => {
  const prof = [[0, 100], [100, 110], [200, 110]];
  const r = profileAt(prof, 50);
  assert.ok(near(r.ele, 105));
  assert.ok(near(r.grade, 10));
  assert.ok(near(profileAt(prof, 500).ele, 110));
  assert.ok(near(profileAt(prof, -5).ele, 100));
});

test('pointAlong walks the line by distance', () => {
  const pts = [{ lon: 0, lat: 0, m: 0 }, { lon: 1, lat: 0, m: 100 }, { lon: 1, lat: 1, m: 200 }];
  assert.deepEqual(pointAlong(pts, 50), { lon: 0.5, lat: 0 });
  assert.deepEqual(pointAlong(pts, 150), { lon: 1, lat: 0.5 });
  assert.deepEqual(pointAlong(pts, 999), { lon: 1, lat: 1 });
  assert.equal(pointAlong([], 10), null);
});

test('monthCells needs all twelve, fills at the threshold and marks one peak', () => {
  const temps = [0, 0, 3, 8, 13, 19, 22, 23, 20, 15, 8, 3];
  const c = monthCells(temps, { threshold: 18 });
  assert.equal(c.length, 12);
  assert.deepEqual(c.filter((x) => x.on).map((x) => x.n), [6, 7, 8, 9]);
  assert.deepEqual(c.filter((x) => x.peak).map((x) => x.n), [8]);
  assert.ok(c.every((x) => x.h >= 0 && x.h <= 1));
  assert.equal(monthCells(temps.slice(1)), null);
  assert.equal(monthCells([...temps.slice(0, 11), null]), null);
});

test('altitudeParts puts prominence on top and never over the height', () => {
  const mb = altitudeParts(4806, 4692);
  assert.ok(near(mb.base + mb.prom, 4806 / ALT_SCALE_M));
  assert.ok(near(mb.prom, 4692 / ALT_SCALE_M));
  const capped = altitudeParts(1000, 5000);
  assert.ok(near(capped.base, 0));
  assert.ok(near(capped.prom, 0.2));
  assert.ok(near(altitudeParts(2000, null).prom, 0));
  assert.equal(altitudeParts(null, 100), null);
});

test('lakeWedge shares one log scale, so a tarn and a big lake both fit', () => {
  const tarn = lakeWedge(0.12, 8);
  const como = lakeWedge(145, 154);
  assert.ok(tarn.w < como.w && tarn.h < como.h);
  assert.ok(como.w <= 1 && como.h <= 1);
  assert.ok(lakeWedge(0.0001, 0.5).w >= 0.03);
  assert.equal(lakeWedge(145, null), null);
  assert.equal(lakeWedge(0, 10), null);
});

test('compassPoint names eight directions', () => {
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(215.1), 'SW');
  assert.equal(compassPoint(359), 'N');
  assert.equal(compassPoint(-90), 'W');
  assert.equal(compassPoint(null), null);
});

test('card and route bars', () => {
  assert.deepEqual(pavedShares(0.75).map((p) => p.share), [0.75, 0.25]);
  assert.equal(pavedShares(undefined), null);
  assert.equal(kmOf(0.5, 89926), '45.0 km');
  assert.equal(kmOf(0.5, null), undefined);
  const t = (k) => k;
  const mix = trafficMix({ free: 0.8, shared: 0.2, unknown: 0 }, t, 10000);
  assert.deepEqual(mix.map((p) => p.value), ['8.0 km', '2.0 km', '0.0 km']);
  assert.equal(trafficMix(null, t), null);
});

test('slopeRuns reads grade over about 90 m, so one noisy sample is no wall', () => {
  // 30 m steps, flat except one 6 m blip (20% over 30 m, under 10% over 90 m)
  const prof = [[0, 100], [30, 100], [60, 106], [90, 106], [120, 106], [150, 106], [180, 106]];
  assert.ok(slopeRuns(prof).every((r) => r.cls < 2));
  // a coarse profile (450 m steps) is read segment by segment
  const coarse = [[0, 100], [450, 100], [900, 190]];
  assert.deepEqual(slopeRuns(coarse).map((r) => r.cls), [0, 2]);
});
