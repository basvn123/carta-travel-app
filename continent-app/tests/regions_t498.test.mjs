// T498: the region page's pure links to the catalogue (src/lib/regions.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionCentre, townsNear, nearestPriced, bestMonthsOf, regionsForCountry,
} from '../src/lib/regions.js';

// Amalfi-like: two beaches with coordinates, one trail without.
const cards = [
  { layer: 'beach', id: 'b1', lat: 40.63, lon: 14.48 },
  { layer: 'beach', id: 'b2', lat: 40.63, lon: 14.60 },
  { layer: 'trail', id: 7 },
];

const town = (id, iso2, lat, lon, extra = {}) => ({ id, city: id, iso2, lat, lon, ...extra });

test('regionCentre averages the items with coordinates and skips the rest', () => {
  const c = regionCentre(cards);
  assert.ok(Math.abs(c.lat - 40.63) < 1e-9);
  assert.ok(Math.abs(c.lon - 14.54) < 1e-9);
  assert.equal(regionCentre([{ id: 1 }]), null);
  assert.equal(regionCentre([]), null);
  assert.equal(regionCentre(null), null);
});

test('townsNear keeps the country, the radius and the best rated first', () => {
  const rows = [
    town('Positano', 'IT', 40.628, 14.485, { rating: { score: 8.6 } }),
    town('Amalfi', 'IT', 40.634, 14.602, { rating: { score: 8.9 } }),
    town('Naples', 'IT', 40.85, 14.27), // about 30 km out
    town('Elsewhere', 'FR', 40.63, 14.49, { rating: { score: 9.9 } }),
    town('Nowhere', 'IT', null, null),
  ];
  assert.deepEqual(townsNear(rows, cards, 'IT', 25).map((r) => r.id), ['Amalfi', 'Positano']);
  assert.deepEqual(townsNear(rows, cards, 'IT', 25, 1).map((r) => r.id), ['Amalfi']);
  assert.deepEqual(townsNear(rows, [{ id: 7 }], 'IT', 25), []);
  assert.deepEqual(townsNear(null, cards, 'IT'), []);
});

test('nearestPriced prefers the same country, then any, inside the radius', () => {
  const centre = { lat: 40.63, lon: 14.54 };
  const priced = (id, iso2, lat, lon) => town(id, iso2, lat, lon, { cost: { dayEur: 90 } });
  const rows = [
    priced('Foreign', 'FR', 40.631, 14.541),
    priced('Sorrento', 'IT', 40.626, 14.376),
    town('Unpriced', 'IT', 40.63, 14.54, { cost: {} }),
  ];
  assert.equal(nearestPriced(rows, centre, 'IT', 40).id, 'Sorrento');
  assert.equal(nearestPriced(rows, centre, 'ES', 40).id, 'Foreign');
  assert.equal(nearestPriced(rows, centre, 'IT', 5).id, 'Foreign');
  assert.equal(nearestPriced([priced('Far', 'IT', 45, 9)], centre, 'IT', 40), null);
  assert.equal(nearestPriced(rows, null, 'IT'), null);
});

test('bestMonthsOf needs climate on at least half the towns', () => {
  const c = (best) => ({ climate: best ? { best } : null });
  assert.deepEqual(bestMonthsOf([]), []);
  // One of three carries climate: under half, so nothing.
  assert.deepEqual(bestMonthsOf([c([5, 6]), c(null), c(null)]), []);
  // Two of four: exactly half, so the months at least half of those name.
  assert.deepEqual(bestMonthsOf([c([5, 6, 9]), c([6, 9, 10]), c(null), c(null)]), [5, 6, 9, 10]);
  assert.deepEqual(bestMonthsOf([c([5, 6, 9]), c([6, 9]), c([6, 7])]), [6, 9]);
  assert.deepEqual(bestMonthsOf([c([]), c([])]), []);
});

test('regionsForCountry returns the fullest coasts and ranges of one country', () => {
  const index = {
    regions: [
      { id: 'ITF3', kind: 'nuts2', country: 'IT', name: 'Campania', counts: { beach: 90 } },
      { id: 'COAST:IT-AMALFI', kind: 'coast', country: 'IT', name: 'Amalfi Coast', counts: { beach: 3, trail: 3, lake: 1 } },
      { id: 'RANGE:IT-DOLO', kind: 'range', country: 'IT', name: 'Dolomites', counts: { mountain: 40, trail: 30 } },
      { id: 'COAST:IT-EMPTY', kind: 'coast', country: 'IT', name: 'Empty', counts: {} },
      { id: 'COAST:FR-AZUR', kind: 'coast', country: 'FR', name: 'Azur', counts: { beach: 99 } },
    ],
  };
  assert.deepEqual(regionsForCountry(index, 'IT').map((r) => r.id), ['RANGE:IT-DOLO', 'COAST:IT-AMALFI']);
  assert.deepEqual(regionsForCountry(index, 'IT', { limit: 1 }).map((r) => r.id), ['RANGE:IT-DOLO']);
  assert.deepEqual(regionsForCountry(index, 'IT', { kinds: ['nuts2'] }).map((r) => r.id), ['ITF3']);
  assert.deepEqual(regionsForCountry(null, 'IT'), []);
  assert.deepEqual(regionsForCountry(index, ''), []);
});
