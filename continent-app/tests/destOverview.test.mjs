// T499: the destination page's tabs and Overview, the pure half
// (src/lib/destOverview.js, src/lib/dayIncludes.js, src/lib/featureHref.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEST_TABS, tabFromHash, hashWithTab, aroundCategories, defaultAroundKey,
  emptyOutdoorKinds, kindsList, pdfOutdoorRows,
} from '../src/lib/destOverview.js';
import { dayIncludesText, DAY_PARTS } from '../src/lib/dayIncludes.js';
import { featureHref, linkOpener } from '../src/lib/featureHref.js';

test('four tabs, always the same four', () => {
  assert.deepEqual(DEST_TABS, ['overview', 'nearby', 'when', 'practical']);
});

test('the address names a tab only for its own place', () => {
  assert.equal(tabFromHash('#dest=FCO&tab=nearby', 'FCO'), 'nearby');
  assert.equal(tabFromHash('#dest=FCO&tab=nearby', 'BCN'), null);
  assert.equal(tabFromHash('#dest=FCO&tab=bogus', 'FCO'), null);
  assert.equal(tabFromHash('#dest=gem%3Avalbona&tab=when', 'gem:valbona'), 'when');
  assert.equal(tabFromHash('', 'FCO'), null);
});

test('a tab is written into the place address, Overview writes none', () => {
  assert.equal(hashWithTab('#dest=FCO', 'FCO', 'practical'), '#dest=FCO&tab=practical');
  assert.equal(hashWithTab('#dest=FCO&tab=practical', 'FCO', 'overview'), '#dest=FCO');
  assert.equal(hashWithTab('#dest=gem%3Azungoli', 'gem:zungoli', 'when'), '#dest=gem%3Azungoli&tab=when');
  assert.equal(hashWithTab('#trail=5', 'FCO', 'when'), null);
  assert.equal(hashWithTab('', 'FCO', 'when'), null);
});

const rome = {
  around: {
    radius_km: 20,
    counts: { trails: 2, cycling: 1, lakes: 1 },
    trails: [
      { id: '196926', name: 'CNP', km: 11.2, score: 8.6, thumb: 'a.jpg' },
      { id: '7', name: 'Romea', km: 8, score: 8.2 },
    ],
    cycling: [{ id: '9', name: 'Nomentana', km: 4.1 }],
    lakes: [{ id: 'lk1', name: 'Parco', km: 7.3, score: 5 }],
  },
  nearby: {
    lakes: [{ id: 'lk1', name: 'Parco', km: 7.3 }, { id: 'lk2', name: 'Albano', km: 22.3, score: 9.1 }],
    beaches: [{ id: 'b1', name: 'Ostia', km: 25.8 }, { id: 'b2', name: 'Fregene', km: 30 }],
  },
  routes: {
    hiking: [
      { id: 196926, name: 'Cammino', km: 1.1, dir: 'se', rating: 8.6 },
      { id: 11, name: 'Francigena', km: 2, rating: 9 },
    ],
  },
  trips: [{ id: 'gem:a' }, { id: 'gem:b' }, { id: 'gem:c' }],
};

test('Around joins the readings of a kind, deduplicated by id, best first', () => {
  const cats = aroundCategories(rome);
  assert.deepEqual(cats.map((c) => c.key), ['walks', 'rides', 'peaks', 'lakes', 'beaches', 'trips']);
  const walks = cats[0];
  assert.equal(walks.count, 3);
  assert.deepEqual(walks.rows.map((r) => String(r.id)), ['11', '196926', '7']);
  // The around row of the same path kept its photograph.
  assert.equal(walks.rows[1].thumb, 'a.jpg');
  assert.equal(walks.rows[0].bearing, null);
  assert.equal(cats.find((c) => c.key === 'lakes').count, 2);
  assert.equal(cats.find((c) => c.key === 'peaks').count, 0);
  assert.equal(cats.find((c) => c.key === 'trips').count, 3);
});

test('the default chip is the fullest category with at least two, else the first', () => {
  assert.equal(defaultAroundKey(aroundCategories(rome)), 'walks');
  // Zungoli: one ride and seven day trips opens on Day trips.
  const zungoli = aroundCategories({
    around: { cycling: [{ id: 1 }] },
    trips: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}` })),
  });
  assert.equal(defaultAroundKey(zungoli), 'trips');
  const thin = aroundCategories({ around: { lakes: [{ id: 1 }] }, trips: [{ id: 'x' }] });
  assert.equal(defaultAroundKey(thin), 'lakes');
  assert.equal(defaultAroundKey(aroundCategories({})), null);
});

test('the empty kinds are named together, in the language own or-list', () => {
  const empty = emptyOutdoorKinds(aroundCategories({ around: { cycling: [{ id: 1 }] } }));
  assert.deepEqual(empty.map((c) => c.key), ['walks', 'peaks', 'lakes', 'beaches']);
  assert.equal(kindsList(['trail', 'peak', 'lake', 'beach'], 'en'), 'trail, peak, lake or beach');
  assert.equal(kindsList(['beach'], 'en'), 'beach');
  assert.match(kindsList(['Wanderweg', 'Gipfel'], 'de'), /oder/);
});

test('the PDF prints the nearby rows the 20 km reading lacks, and a radius that covers them', () => {
  const { layers, km } = pdfOutdoorRows(rome.around, rome.nearby);
  const lakes = layers.find((l) => l.layer === 'lakes');
  assert.deepEqual(lakes.rows.map((r) => r.id), ['lk1', 'lk2']);
  assert.equal(lakes.count, 2);
  assert.ok(layers.some((l) => l.layer === 'beaches'));
  assert.equal(km, 30);
  // No around at all: the nearby rows still print.
  assert.equal(pdfOutdoorRows(null, { mountains: [{ id: 'm', km: 40 }] }).layers[0].layer, 'mountains');
});

test('the day sentence is built from its parts, one key per part', () => {
  const dict = {
    'dest.dayPart.bed': 'a bed',
    'dest.dayPart.food': 'food and drink',
    'dest.dayPart.transport': 'local transport',
    'dest.dayPartJoin': 'plus',
    'dest.dayIncludes': '{parts}.',
  };
  const t = (k, v = {}) => (dict[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n]);
  assert.deepEqual(DAY_PARTS, ['bed', 'food']);
  assert.equal(dayIncludesText(t), 'A bed plus food and drink.');
  assert.equal(dayIncludesText(t, ['bed', 'food', 'transport']), 'A bed plus food and drink plus local transport.');
  assert.equal(dayIncludesText(t, []), '');
});

test('an item page is a link with its share hash', () => {
  assert.equal(featureHref('trails', { id: 196926, cc: 'IT' }), '#trail=196926&tc=IT');
  assert.equal(featureHref('trail', { id: 5, cc: 'AL' }), '#trail=5&tc=AL');
  assert.equal(featureHref('mountain', { id: 'al-x', cc: 'AL' }), '#mtn=al-x&mc=AL');
  assert.equal(featureHref('lakes', { id: 'it-lake', cc: 'IT' }), '#lake=it-lake&lc=IT');
  assert.equal(featureHref('beaches', { id: 'b', cc: 'IT' }), '#beach=b&bc=IT');
  assert.equal(featureHref('cycling', { id: 9, cc: 'IT' }), '#cycle=9&cc=IT');
  assert.equal(featureHref('dest', { id: 'gem:theth' }), '#dest=gem%3Atheth');
  assert.equal(featureHref('trips', { id: 1 }), null);
  assert.equal(featureHref('trails', {}), null);
});

test('a plain click opens in place, a modifier click is left to the browser', () => {
  let opened = 0;
  let prevented = 0;
  const h = linkOpener(() => { opened += 1; });
  h({ button: 0, preventDefault: () => { prevented += 1; } });
  h({ button: 0, metaKey: true, preventDefault: () => { prevented += 1; } });
  h({ button: 1, preventDefault: () => { prevented += 1; } });
  assert.equal(opened, 1);
  assert.equal(prevented, 1);
});
