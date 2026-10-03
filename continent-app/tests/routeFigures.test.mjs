import test from 'node:test';
import assert from 'node:assert/strict';
import { dayRelief } from '../src/lib/weekShape.js';
import { weekRelief, surfaceMix, trafficSplit } from '../src/lib/routeFigures.js';

const pct = (mix) => mix.map((s) => [s.tone, Math.round(s.share * 100)]);

test('dayRelief reads climb and descent as written', () => {
  const r = (s) => dayRelief({ title: 'Day', dayStats: s }, 'hiking');
  assert.deepEqual(r('15 km, 950 m ascent, 800 m descent, 6-7 hours.'), { km: 15, up: 950, down: 800, rest: false });
  assert.deepEqual(r('9 km in / 250 m up, 550 m down / T3'), { km: 9, up: 250, down: 550, rest: false });
  assert.equal(r('14 km / +1,000 / −1,000 m').up, 1000);
  assert.equal(r('14 km / +1,000 / −1,000 m').down, 1000);
  assert.equal(r('12 km return, 1,470 m, 7-9 h').up, 1470);
  assert.equal(r('16 km, 1,000 m ascent, negligible descent').down, 0);
  assert.equal(r('13 km, negligible ascent, 900 m descent').up, 0);
  // A height after a place name is not a climb.
  assert.equal(r('6 km of town walking / Escaldes 1,100 m').up, null);
  // No descent is ever guessed from the climb.
  assert.equal(r('17 km, 900 m').down, null);
});

test('weekRelief draws only route styles with enough stated days', () => {
  const day = (n, s) => ({ day: n, title: `Day ${n}`, dayStats: s });
  const trip = {
    tripTypeSlug: 'cycling',
    itinerary: [day(1, '40 km / +450 m'), day(2, 'Rest day'), day(3, '60 km / 900 m ascent'), day(4, '30 km')],
  };
  const r = weekRelief(trip);
  assert.equal(r.show, true);
  assert.equal(r.up, 1350);
  assert.equal(r.top.day, 3);
  assert.equal(r.moving, 3);
  assert.equal(r.upMissing, 1);
  assert.equal(r.downDays, 0);
  assert.equal(weekRelief({ ...trip, tripTypeSlug: 'city' }).show, false);
  assert.equal(weekRelief({ ...trip, itinerary: [day(1, '30 km'), day(2, '40 km'), day(3, '20 km / +100 m')] }).show, false);
});

test('surfaceMix splits the Istria sentence into four segments', () => {
  const mix = surfaceMix('approximately 40% compacted limestone hardpack (the Parenzana formation), 45% paved secondary road, 10% loose gravel on unrestored sections between Vizinada and Baldasi, 5% cobbled hilltown setts. Tunnels are unlit.');
  assert.deepEqual(pct(mix), [['paved', 45], ['gravel', 40], ['gravel', 10], ['other', 5]]);
  assert.deepEqual(mix.map((s) => s.label), ['Paved secondary road', 'Compacted limestone hardpack', 'Loose gravel', 'Cobbled hilltown setts']);
  const tr = trafficSplit(mix);
  assert.equal(Math.round(tr.free * 100), 50);
  assert.equal(Math.round(tr.shared * 100), 45);
  assert.equal(Math.round(tr.unknown * 100), 5);
});

test('surfaceMix keeps the unstated share and rejects split sections', () => {
  assert.deepEqual(pct(surfaceMix('~95% asphalt, short crushed-limestone sections')), [['paved', 95], ['unknown', 5]]);
  assert.deepEqual(pct(surfaceMix('around 85% asphalt greenway and small roads, the remainder compacted crushed limestone')), [['paved', 85], ['gravel', 15]]);
  // Two sections of 100% each are not one route.
  assert.equal(surfaceMix('North shore 70% path, 25% road, 5% limestone. South shore 95% separated path.'), null);
  // A gradient is not a surface.
  assert.deepEqual(pct(surfaceMix('80% asphalt rail-trail, 20% compacted crushed stone and gravel, gradients almost never above 2%')), [['paved', 80], ['gravel', 20]]);
  assert.equal(surfaceMix('Asphalt and compacted gravel, almost entirely traffic-free'), null);
});

test('trafficSplit does not claim a hedged or mixed share', () => {
  const tr = trafficSplit(surfaceMix('90% asphalt (much of it dedicated cycleway), 10% compacted gravel'));
  assert.equal(Math.round(tr.unknown * 100), 90);
  const mixed = trafficSplit(surfaceMix('85% asphalt greenway and small roads, 15% gravel'));
  assert.equal(Math.round(mixed.unknown * 100), 85);
});
