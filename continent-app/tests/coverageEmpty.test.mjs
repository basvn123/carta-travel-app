// T367: the pure half of the coverage empty-state module (src/lib/coverageCases.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countryCase, countryGeo, pointGeo, nearestThree, kmBetween, kmTo, nearestRegions, otherLayer,
} from '../src/lib/coverageCases.js';

const coverage = {
  regions: {
    NL11: { lake: { r: 3, status: 'thin' }, mountain: { status: 'na', why: 'relief_below_250m' }, trail: { r: 40, status: 'ok' } },
    NL12: { lake: { r: 0, status: 'empty' }, mountain: { status: 'na', why: 'relief_below_250m' }, trail: { r: 12, status: 'ok' } },
    HU10: { beach: { r: 0, status: 'empty' }, trail: { r: 0, status: 'empty' } },
    HU21: { beach: { status: 'na', why: 'no_coast_or_large_lakes' }, trail: { r: 5, status: 'thin' } },
    EL30: { mountain: { r: 0, status: 'empty' }, beach: { r: 9, status: 'ok' } },
  },
};

test('a microstate keeps the document table and its area', () => {
  const c = countryCase(coverage, 'cycling', 'MC');
  assert.equal(c.key, 'tooSmall');
  assert.equal(c.code, 'not_applicable');
  assert.equal(c.area, 2);
  assert.equal(c.micro, true);
});

test('every region na with one why gives that sentence and points at another layer', () => {
  const c = countryCase(coverage, 'mountain', 'NL');
  assert.equal(c.key, 'noRelief');
  assert.equal(c.code, 'not_applicable');
  assert.equal(c.other, 'trails');
});

test('mixed na and empty regions never claim the layer is impossible', () => {
  const c = countryCase(coverage, 'beach', 'HU');
  assert.equal(c.key, 'empty');
  assert.equal(c.code, null);
});

test('the NUTS prefix finds Greece under EL', () => {
  assert.equal(otherLayer(coverage, 'GR', 'mountain'), 'beaches');
});

test('the contract code wins once it is on the wire', () => {
  const wire = {
    ...coverage,
    contract: {
      countries: {
        IT: { cycling: { code: 'way_only_not_derived', must: 4, must_published: 0 } },
        TR: { trail: { code: 'pending_partnership', detail: { holder: 'Culture Routes Society' } } },
        PL: { trail: { code: 'below_quota', must: 3, must_published: 3 } },
      },
    },
  };
  assert.equal(countryCase(wire, 'cycling', 'IT').key, 'wayOnly');
  const tr = countryCase(wire, 'trail', 'TR');
  assert.equal(tr.key, 'partnership');
  assert.equal(tr.holder, 'Culture Routes Society');
  // below_quota with nothing missing says only that coverage grows.
  assert.equal(countryCase(wire, 'trail', 'PL').key, 'empty');
});

const towns = [
  { iso2: 'BE', lat: 50.85, lon: 4.35 }, { iso2: 'BE', lat: 51.05, lon: 3.72 },
  { iso2: 'NL', lat: 52.37, lon: 4.9 }, { iso2: 'FR', lat: 50.63, lon: 3.06 },
  { iso2: 'DE', lat: 50.94, lon: 6.96 }, { iso2: 'LU', lat: 49.61, lon: 6.13 },
  { iso2: 'ES', lat: 40.42, lon: -3.7 },
];

test('countryGeo centres a country on its towns and finds its neighbours', () => {
  const g = countryGeo(towns, 'BE', 4);
  assert.ok(Math.abs(g.lat - 50.95) < 0.01);
  assert.equal(g.near.length, 4);
  assert.ok(!g.near.includes('ES'), g.near.join(','));
  assert.ok(!g.near.includes('BE'));
  assert.equal(countryGeo(towns, 'XX'), null);
  assert.deepEqual(countryGeo(towns, 'LI').near, ['CH', 'AT']);
});

test('pointGeo orders countries by their nearest town', () => {
  assert.equal(pointGeo(towns, { lat: 50.7, lon: 3.1 }, 'BE', 1).near[0], 'FR');
});

test('a line is measured to its nearest vertex, not its middle', () => {
  const line = { geometry: { type: 'LineString', coordinates: [[4.35, 50.85], [6.0, 52.0]] }, bbox: [4.35, 50.85, 6.0, 52.0] };
  assert.ok(kmTo({ lat: 50.85, lon: 4.35 }, line) < 0.01);
  // A line page measures its own vertices to the candidate's point.
  const beach = { lat: 50.85, lon: 4.36 };
  assert.ok(kmBetween(line, beach) < 1);
});

test('nearestThree leaves the empty country out and keeps the nearer border summit', () => {
  const rows = [
    { id: 1, cc: 'MC', name: 'Home', lat: 43.74, lon: 7.42 },
    { id: 2, cc: 'FR', name: 'Mont Agel', lat: 43.77, lon: 7.43 },
    { id: 3, cc: 'IT', name: 'Mont Agel', lat: 43.9, lon: 7.6 },
    { id: 4, cc: 'IT', name: 'Monte Grammondo', lat: 43.86, lon: 7.53 },
    { id: 5, cc: 'FR', name: 'Far', lat: 45.0, lon: 6.0 },
  ];
  const near = nearestThree(rows, { lat: 43.738, lon: 7.424 }, 'MC');
  assert.deepEqual(near.map((n) => n.row.id), [2, 4, 5]);
});

test('a stale region id finds the regions it nests in', () => {
  const regions = [
    { id: 'ITC11', name: 'Torino' }, { id: 'ITC12', name: 'Vercelli' },
    { id: 'ITC20', name: 'Valle d\'Aosta' }, { id: 'FRK21', name: 'Ain' },
  ];
  assert.deepEqual(nearestRegions(regions, 'ITC19').map((r) => r.id), ['ITC11', 'ITC12', 'ITC20']);
  assert.deepEqual(nearestRegions(regions, 'ZZ99'), []);
});

test('rows without a name (composed trips) are kept, not deduped away', () => {
  const rows = [
    { id: 'gr-a', cc: 'GR', lat: 40.6, lon: 22.9 },
    { id: 'me-b', cc: 'ME', lat: 42.4, lon: 19.3 },
  ];
  assert.equal(nearestThree(rows, { lat: 41, lon: 20 }, 'AL').length, 2);
});

test('the same composed route at two lengths is one row, and a trip through the country is left out', () => {
  const cities = [{ city: 'Ohrid' }, { city: 'Berat' }];
  const rows = [
    { id: 'mk-5', cc: 'MK', days: 5, cities, lat: 41.1, lon: 20.8 },
    { id: 'mk-7', cc: 'MK', days: 7, cities, lat: 41.1, lon: 20.8 },
    { id: 'mk-al', cc: 'MK', countries: ['MK', 'AL'], cities: [{ city: 'Tirana' }], lat: 41.3, lon: 19.8 },
    { id: 'gr-1', cc: 'GR', cities: [{ city: 'Ioannina' }], lat: 39.7, lon: 20.9 },
  ];
  assert.deepEqual(nearestThree(rows, { lat: 41, lon: 20 }, 'AL').map((r) => r.row.id), ['mk-5', 'gr-1']);
});
