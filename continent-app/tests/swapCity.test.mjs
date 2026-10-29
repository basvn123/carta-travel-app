import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swapCandidates, swapPicks } from '../src/planner/trip/swapCity.js';

const prof = (likes, size) => ({ likes: Object.fromEntries(Object.entries(likes).map(([k, v]) => [k, [v, null]])), size });
const place = (id, city, lat, lon, score, taste = null) => ({ id, city, lat, lon, rating: { score }, taste });
const destinations = {
  hal: place('hal', 'Hallstatt', 47.562, 13.649, 9.0),
  ischl: place('ischl', 'Bad Ischl', 47.711, 13.623, 7.5, prof({ hiking: 0.9, lakes: 0.3, culture: 0.3 }, 'town')),
  stw: place('stw', 'Sankt Wolfgang', 47.739, 13.448, 8.0, prof({ hiking: 0.1, lakes: 0.95, culture: 0.2 }, 'village')),
  gosau: place('gosau', 'Gosau', 47.58, 13.53, 7.0, prof({ hiking: 0.95, lakes: 0.1, culture: 0.1 }, 'village')),
  szg: place('szg', 'Salzburg', 47.8, 13.04, 8.8, prof({ hiking: 0.2, lakes: 0.1, culture: 0.95 }, 'city')),
  vie: place('vie', 'Vienna', 48.2, 16.37, 9.2, prof({ culture: 0.99 }, 'city')),
};

test('with no query the nearest places come first, the trip\'s own stops left out', () => {
  const r = swapCandidates({ destinations, from: destinations.hal, exclude: ['hal', 'szg'] });
  assert.deepEqual(r.map((x) => x.dest.id), ['gosau', 'ischl', 'stw', 'vie']);
  assert.ok(r[0].km > 0 && r[0].km < 15);
});

test('a search finds a place by name, accents and case aside, best match first', () => {
  const r = swapCandidates({ destinations, from: destinations.hal, query: 'SANKT wolf' });
  assert.equal(r[0].dest.id, 'stw');
  assert.equal(swapCandidates({ destinations, from: destinations.hal, query: 'zzz' }).length, 0);
});

test('the reach keeps the picks close to the stop', () => {
  const near = swapCandidates({ destinations, from: destinations.hal, exclude: ['hal'], maxKm: 60 });
  assert.ok(!near.some((x) => x.dest.id === 'vie'));
});

test('Carta\'s picks rank the places in reach by what the traveller wants there', () => {
  const hiking = swapPicks({ destinations, from: destinations.hal, exclude: ['hal', 'szg'], likes: ['hiking'], reach: 'near' });
  assert.ok(hiking.length > 0);
  assert.ok(hiking.every((x) => x.km <= 60));
  const lakes = swapPicks({ destinations, from: destinations.hal, exclude: ['hal', 'szg'], likes: ['lakes'], reach: 'near' });
  assert.notDeepEqual(hiking.map((x) => x.dest.id), lakes.map((x) => x.dest.id));
});
