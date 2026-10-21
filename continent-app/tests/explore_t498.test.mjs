import test from 'node:test';
import assert from 'node:assert/strict';
import { countryFromHash, countryHash, routeFromSearch, tabHref } from '../src/lib/urlState.js';
import {
  baseOfOutdoor, pointOfOutdoor, mapRowOf, mapIdOf, regionsForLayer,
} from '../src/lib/exploreLayers.js';

test('the country page address reads and writes #country=', () => {
  assert.equal(countryFromHash('#country=it'), 'IT');
  assert.equal(countryFromHash('#dest=ROM&country=PT'), 'PT');
  assert.equal(countryFromHash('#country=ITA'), null);
  assert.equal(countryFromHash('#region=COAST:IT-AMALFI'), null);
  assert.equal(countryFromHash(''), null);
  assert.equal(countryFromHash(undefined), null);
  assert.equal(countryHash('pt'), '#country=PT');
  assert.equal(countryFromHash(countryHash('es')), 'ES');
});

test('an Explore category rides in the address, the library included', () => {
  assert.equal(tabHref('places', '', { cat: 'beaches' }), '?tab=explore&cat=beaches');
  assert.equal(routeFromSearch('?tab=explore&cat=beaches').view, 'places');
  assert.equal(routeFromSearch('?tab=explore&cat=beaches').cat, 'beaches');
  // Older addresses still open (LEGACY_TABS): Destinations lands in Explore.
  assert.equal(routeFromSearch('?tab=destinations').view, 'places');
  // Places is the default: no category, no tab.
  assert.equal(routeFromSearch('?tab=explore').view, 'map');
});

test('an outdoor item names its base town where the wire has one', () => {
  assert.deepEqual(baseOfOutdoor('beaches', { base: { id: 'gem:x', city: 'X' } }), { id: 'gem:x', city: 'X' });
  assert.deepEqual(baseOfOutdoor('lakes', { base: { id: 'gem:como', city: 'Lake Como' } }), { id: 'gem:como', city: 'Lake Como' });
  assert.deepEqual(baseOfOutdoor('mountains', { near: { dest_id: 'gem:c', city: 'Courmayeur' } }), { id: 'gem:c', city: 'Courmayeur' });
  assert.deepEqual(baseOfOutdoor('trails', { tr: {}, assoc: { destId: 'NAP', dest: { city: 'Naples' } } }), { id: 'NAP', city: 'Naples' });
  assert.equal(baseOfOutdoor('cycling', { id: 1 }), null);
  assert.equal(baseOfOutdoor('beaches', {}), null);
  assert.equal(baseOfOutdoor('beaches', null), null);
});

test('an outdoor item has a point: its own, its anchor, or its extent', () => {
  assert.deepEqual(pointOfOutdoor('beaches', { lat: 40, lon: 14 }), { lat: 40, lon: 14 });
  assert.deepEqual(pointOfOutdoor('cycling', { bbox: [10, 40, 12, 42] }), { lat: 41, lon: 11 });
  assert.deepEqual(pointOfOutdoor('trails', { tr: { bbox: [0, 0, 2, 2] } }), { lat: 1, lon: 1 });
  assert.deepEqual(pointOfOutdoor('trails', { tr: { category: 'citytrip', anchor: { lat: 5, lon: 6 }, bbox: [0, 0, 2, 2] } }), { lat: 5, lon: 6 });
  assert.equal(pointOfOutdoor('cycling', { bbox: [1, 2] }), null);
});

test('a map row carries a layer-unique id, a tier from the score, the base cost', () => {
  const r = mapRowOf('beaches', { id: 7, lat: 40, lon: 14 }, { name: 'Spiaggia', cc: 'IT', country: 'Italy', score: 8.6, cost: { dayEur: 92 } });
  assert.equal(r.id, mapIdOf('beaches', 7));
  assert.equal(r.id, 'beaches:7');
  assert.equal(r.rating.tier, 3);
  assert.equal(r.cost.dayEur, 92);
  assert.equal(mapRowOf('beaches', { id: 8 }, { name: 'No point' }), null);
  assert.equal(mapRowOf('lakes', { id: 9, lat: 1, lon: 1 }, { name: 'L', score: null }).rating, null);
});

test('a layer\'s regions in a country, the fullest first, none without the layer', () => {
  const index = {
    regions: [
      { id: 'A', name: 'Amalfi', kind: 'coast', country: 'IT', counts: { beach: 3, trail: 3 } },
      { id: 'B', name: 'Cilento', kind: 'coast', country: 'IT', counts: { beach: 4 } },
      { id: 'C', name: 'Dolomites', kind: 'range', country: 'IT', counts: { trail: 40 } },
      { id: 'D', name: 'Algarve', kind: 'coast', country: 'PT', counts: { beach: 9 } },
    ],
  };
  assert.deepEqual(regionsForLayer(index, 'IT', 'beaches').map((r) => r.id), ['B', 'A']);
  assert.deepEqual(regionsForLayer(index, 'IT', 'trails').map((r) => r.id), ['C', 'A']);
  assert.deepEqual(regionsForLayer(index, 'IT', 'lakes'), []);
  assert.deepEqual(regionsForLayer(null, 'IT', 'beaches'), []);
  assert.equal(regionsForLayer(index, 'IT', 'trails', 1).length, 1);
});
