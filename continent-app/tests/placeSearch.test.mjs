import test from 'node:test';
import assert from 'node:assert/strict';
import { foldName, nameRank, rankPlaces } from '../src/lib/placeSearch.js';

const towns = (...names) => names.map((city, i) => ({ id: String(i), city }));

test('the whole name beats a prefix, a prefix beats a word start, a word start beats a mid-word match', () => {
  const rows = towns('Agrigento', 'Mont-Gentil', 'Gentioux', 'Gent');
  assert.deepEqual(rankPlaces(rows, 'gent').map((r) => r.city), ['Gent', 'Gentioux', 'Mont-Gentil', 'Agrigento']);
});

test('a word start is found after a space, a hyphen, an apostrophe or a stop', () => {
  assert.equal(nameRank('Monte Argentario', 'arg'), 2);
  assert.equal(nameRank("L'Aquila", 'aquila'), 2);
  assert.equal(nameRank('Saint-Malo', 'malo'), 2);
  assert.equal(nameRank('Argentan', 'gent'), 3);
  assert.equal(nameRank('Bled', 'xyz'), -1);
});

test('matching ignores case and accents, and the l with stroke folds to l', () => {
  assert.equal(foldName('Zürich'), 'zurich');
  assert.equal(foldName('Łódź'), 'lodz');
  assert.equal(nameRank('Łódź', 'lodz'), 0);
});

test('inside one rank the shorter name comes first, then the alphabet; the limit holds', () => {
  const rows = towns('Bledington', 'Bledsoe', 'Bledow');
  assert.deepEqual(rankPlaces(rows, 'bled').map((r) => r.city), ['Bledow', 'Bledsoe', 'Bledington']);
  assert.equal(rankPlaces(towns('Aa', 'Ab', 'Ac', 'Ad'), 'a', 2).length, 2);
  assert.deepEqual(rankPlaces(rows, ''), []);
});
