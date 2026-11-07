// T1215 (T1152-c, ROADMAP F3): the trip finder's order reads the taste
// chips' verdicts. A rejection is a bounded negative, an acceptance a
// bounded boost, nothing changes without verdicts, and the answers still
// lead. Deterministic: hand-built places and trips, no catalogue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankTrips, tasteNudge, TASTE_STEP, TASTE_CAP } from '../src/lib/recommend/rank.js';
import { tasteWeights, tasteLeanOf, REJECT_WEIGHT, ACCEPT_WEIGHT } from '../src/lib/taste/profile.js';
import { slotTotals } from '../src/lib/recommend/slots.js';
import { normalizeSettings } from '../src/planner/flow/tripSettings.js';
import { verdictsKey } from '../src/lib/taste/store.js';

const settings = () => normalizeSettings({
  answered: ['who', 'when'],
  party: { kind: 'couple', adults: 2 },
  when: { mode: 'exact', start: '2027-05-09', end: '2027-05-16', nights: 7 },
  guide: { shapes: ['towns'], likes: ['hiking'], weather: 'mild', reach: 'short', avoid: [], budget: { kind: 'total', eur: 0 } },
});
const place = (city, categories, hiking = 0.8) => ({
  city, categories, rating: { score: 8 },
  taste: {
    likes: { hiking: [hiking, { n: 4, best: `${city} trail`, band: 'good', minutes: 12 }] },
    crowd_by_month: Array(12).fill(0), car_need: false, tmax_by_month: Array(12).fill(20),
  },
});
const DESTS = {
  sea: place('Seaside', ['beach']),
  lake: place('Lakeside', ['lake']),
  // The same as Seaside on every answer, so only the taste can split them.
  sea2: place('Seaside Two', ['beach']),
};
const data = { destinations: DESTS };
const slot = (id, eur) => ({ id, labelKey: `tf.slot.${id}`, owner: 'carta', eur, eurGroup: eur * 2, pick: null, options: null, because: null, quality: 'modelled' });
const trip = (id, places) => {
  const slots = [slot('flight', 100), slot('stay', 500), slot('food', 150), slot('local', 50)];
  return { id, country: 'Testland', iso2: 'TL', places, month: 5, nights: 7, gateway: { iata: 'TST', minutes: 30, mode: 'bus' }, slots, total: slotTotals(slots), signals: {} };
};
const TRIPS = [trip('a-sea', [{ id: 'sea', nights: 7 }]), trip('b-lake', [{ id: 'lake', nights: 7 }])];
const v = (node, verdict) => ({ [node]: { v: verdict, at: 1 } });
const rank = (verdicts) => rankTrips(TRIPS, { settings: settings(), data, tasteLean: tasteLeanOf(tasteWeights(verdicts)) });

test('no verdicts: no lean, the order and scores are the same as before', () => {
  assert.equal(tasteLeanOf(tasteWeights({})), null);
  const plain = rankTrips(TRIPS, { settings: settings(), data });
  const none = rank({});
  assert.deepEqual(none.map((t) => [t.id, t.score]), plain.map((t) => [t.id, t.score]));
  assert.equal(plain[0].id, 'a-sea', 'equal trips break on the id');
});

test('a rejection sinks the trips that carry it by REJECT_WEIGHT x TASTE_STEP, never filters them', () => {
  const plain = rankTrips(TRIPS, { settings: settings(), data });
  const r = rank(v('set.beach', 'reject'));
  assert.deepEqual(r.map((t) => t.id), ['b-lake', 'a-sea']);
  assert.equal(r.length, 2, 'a rejection is a negative, not a filter');
  const before = plain.find((t) => t.id === 'a-sea').score;
  const after = r.find((t) => t.id === 'a-sea').score;
  assert.ok(Math.abs((before - after) - Math.min(TASTE_CAP, -REJECT_WEIGHT * TASTE_STEP)) < 1e-9);
  assert.equal(r.find((t) => t.id === 'b-lake').score, plain.find((t) => t.id === 'b-lake').score);
});

test('an acceptance lifts the trips that carry it by ACCEPT_WEIGHT x TASTE_STEP', () => {
  const r = rank(v('set.lake', 'accept'));
  assert.deepEqual(r.map((t) => t.id), ['b-lake', 'a-sea']);
  const plain = rankTrips(TRIPS, { settings: settings(), data });
  const lift = r[0].score - plain.find((t) => t.id === 'b-lake').score;
  assert.ok(Math.abs(lift - ACCEPT_WEIGHT * TASTE_STEP) < 1e-9);
});

test('the nudge is weighed by nights and capped at TASTE_CAP either way', () => {
  const lean = tasteLeanOf({ 'set.beach': -10, 'set.lake': 10 });
  assert.equal(tasteNudge(trip('x', [{ id: 'sea', nights: 7 }]), lean, DESTS), -TASTE_CAP);
  assert.equal(tasteNudge(trip('y', [{ id: 'lake', nights: 7 }]), lean, DESTS), TASTE_CAP);
  const half = tasteLeanOf(tasteWeights(v('set.beach', 'reject')));
  const mixed = tasteNudge(trip('z', [{ id: 'sea', nights: 2 }, { id: 'lake', nights: 6 }]), half, DESTS);
  assert.ok(Math.abs(mixed - (REJECT_WEIGHT * 2 / 8) * TASTE_STEP) < 1e-9);
  assert.equal(tasteNudge(trip('w', [{ id: 'nowhere', nights: 3 }]), half, DESTS), 0);
  assert.equal(tasteNudge(trip('n', [{ id: 'sea', nights: 3 }]), null, DESTS), 0);
});

test('a node meets its nearest weighted ancestor; the more specific verdict wins', () => {
  const d = { categories: ['beach'] };
  // A Yes on the place's own node beats a Not me on its parent.
  const lean = tasteLeanOf({ 'set.beach': ACCEPT_WEIGHT, 'set.coast': REJECT_WEIGHT });
  assert.equal(lean(d), ACCEPT_WEIGHT);
});

test('the answers still lead: a rejection never lifts a trip that fits worse above the cap', () => {
  const weak = { ...DESTS, sea3: place('Weak Sea', ['beach'], 0.55), lake3: place('Poor Lake', ['lake'], 0.1) };
  const trips = [trip('fits', [{ id: 'sea3', nights: 7 }]), trip('poor', [{ id: 'lake3', nights: 7 }])];
  const r = rankTrips(trips, { settings: settings(), data: { destinations: weak }, tasteLean: tasteLeanOf(tasteWeights(v('set.beach', 'reject'))) });
  assert.equal(r[0].id, 'fits', 'a lake trip under the main-like minimum stays below');
});

test('the finder reruns on a verdict change: the key is node and verdict, sorted, no times', () => {
  assert.equal(verdictsKey({ b: { v: 'reject', at: 2 }, a: { v: 'accept', at: 1 } }), 'a:accept,b:reject');
  assert.equal(verdictsKey({}), '');
});
