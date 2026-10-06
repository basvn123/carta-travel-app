import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickIcons, buildRails, railMatches, photoOf, cycleRouteKey, OPENING_RAILS,
  ICON_MAX, ICON_MIN, RAIL_MIN, RAIL_CAP,
} from '../src/lib/openingScreen.js';

const pic = (u) => [{ u }];
const beach = (id, cc, acclaim, extra = {}) => ({
  id, name: `Beach ${id}`, cc, score: 7, comp: { acclaim }, images: pic(`https://upload.wikimedia.org/x/${id}.jpg`), ...extra,
});

test('Band 1 ranks by acclaim and takes at most two per country', () => {
  const rows = [
    beach('a', 'IT', 0.99), beach('b', 'IT', 0.98), beach('c', 'IT', 0.97),
    beach('d', 'GR', 0.9), beach('e', 'ES', 0.8), beach('f', 'PT', 0.7),
    beach('g', 'HR', 0.6), beach('h', 'FR', 0.5), beach('i', 'IE', 0.4),
    beach('j', 'NO', 0.3), beach('k', 'SE', 0.2),
  ];
  const icons = pickIcons('beach', rows);
  assert.equal(icons.length, ICON_MAX);
  assert.deepEqual(icons.slice(0, 3).map((r) => r.id), ['a', 'b', 'd']);
  assert.ok(!icons.some((r) => r.id === 'c'), 'a third Italian beach is skipped');
});

test('Band 1 never uses a row without its own photograph, and snaps to six or nine', () => {
  const rows = Array.from({ length: 8 }, (_, i) => beach(`p${i}`, `C${i}`, 1 - i / 10));
  rows.push({ ...beach('nophoto', 'XX', 2), images: [] });
  const icons = pickIcons('beach', rows);
  assert.equal(icons.length, ICON_MIN);
  assert.ok(!icons.some((r) => r.id === 'nophoto'));
  assert.equal(pickIcons('beach', rows.slice(0, 2)).length, 0, 'under three is not a band');
  assert.equal(pickIcons('beach', rows.slice(0, 4)).length, 4);
});

test('photoOf reads each wire shape and invents nothing', () => {
  assert.equal(photoOf('cycle', { img: 'u' }), 'u');
  assert.equal(photoOf('trail', { img: { u: 'v' } }), 'v');
  assert.equal(photoOf('trail', {}), null);
  assert.equal(photoOf('lake', { images: [] }), null);
});

test('cycle sections of one route share a key, so the band shows the route once', () => {
  assert.equal(cycleRouteKey({ name: 'EuroVelo 6 - part Austria - leg 3' }), 'ev6');
  assert.equal(cycleRouteKey({ name: 'EV6 France 12' }), 'ev6');
  assert.equal(cycleRouteKey({ name: 'Eurovélo 17 : Arles' }), 'ev17');
  assert.equal(cycleRouteKey({ name: 'Murradweg Abs. 4 Ostufer' }),
    cycleRouteKey({ name: 'Murradweg Abs. 4a Westufer' }));
  assert.notEqual(cycleRouteKey({ name: 'Innweg' }), cycleRouteKey({ name: 'Aare-Route' }));
  const rows = [
    { id: 1, name: 'NCN National Route 1', cc: 'GB', score: 8.1, img: 'a' },
    { id: 2, name: 'NCN National Route 1', cc: 'GB', score: 7.9, img: 'b' },
    { id: 3, name: 'Innweg', cc: 'AT', score: 7.8, img: 'c' },
    { id: 4, name: 'Aare-Route', cc: 'CH', score: 7.7, img: 'd' },
  ];
  assert.deepEqual(pickIcons('cycle', rows).map((r) => r.id), [1, 3, 4]);
});

test('trail icons skip a second stage of the same family', () => {
  const tr = (id, k, size, rating) => ({
    id, name: `Walk ${id}`, country: 'IT', category: 'hike', rating, img: { u: `u${id}` }, fam: { k, size },
  });
  const rows = [tr(1, 'gta', 5, 9.9), tr(2, 'gta', 5, 9.8), tr(3, 'solo', 1, 9.7), tr(4, 'solo', 1, 9.6)];
  assert.deepEqual(pickIcons('trail', rows).map((r) => r.id), [1, 3, 4]);
});

test('a rail is the saved filter: its count is what the grid filter leaves', () => {
  const rows = [
    beach('a', 'IT', 0.5, { water: { class: 'Excellent' } }),
    beach('b', 'GR', 0.5, { water: { class: 'Excellent' } }),
    beach('c', 'ES', 0.5, { water: { class: 'Good' } }),
    beach('d', 'PT', 0.5, { water: { class: 'Excellent' } }),
    beach('e', 'HR', 0.5, { water: { class: 'Excellent' } }),
  ];
  const def = OPENING_RAILS.beach.find((r) => r.key === 'water');
  assert.equal(railMatches('beach', rows, def.facets).length, 4);
  const rails = buildRails('beach', rows);
  assert.equal(rails.length, 1, 'rails under the minimum are dropped');
  assert.equal(rails[0].n, RAIL_MIN);
  assert.ok(rails[0].rows.length <= RAIL_CAP);
});

test('a Europe-wide rail takes each country in turn', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => ({ ...beach(`it${i}`, 'IT', 0.5), score: 9 - i / 10, water: { class: 'Excellent' } })),
    { ...beach('gr', 'GR', 0.5), score: 5, water: { class: 'Excellent' } },
  ];
  const rail = buildRails('beach', rows).find((r) => r.def.key === 'water');
  assert.deepEqual(rail.rows.slice(0, 2).map((r) => r.cc), ['IT', 'GR']);
});

test('every rail title names an intent key, and no rail promises flights or crowds', () => {
  for (const [layer, defs] of Object.entries(OPENING_RAILS)) {
    assert.ok(defs.length >= 4 && defs.length <= 6, layer);
    for (const d of defs) assert.match(d.titleKey, /^open\.[a-z]+\.rail[A-Z]/);
    assert.ok(!defs.some((d) => /airport|august|quiet/i.test(d.key)));
  }
});
