import test from 'node:test';
import assert from 'node:assert/strict';
import { doFacts, kindSlug } from '../src/lib/doFacts.js';

// A stand-in for t(): a missing key comes back as the key, like the app's.
const LABELS = {
  'dest.doType.swim': 'Swim', 'dest.doKind.viewpoint': 'Viewpoint', 'dest.doFree': 'Free',
  'dest.doPaid': 'Paid', 'dest.doMin': '{n} min', 'dest.doHours': '{n} h',
  'dest.doLabel.kind': 'Type', 'dest.doLabel.fee': 'Entry', 'dest.doLabel.duration': 'Visit', 'dest.doLabel.town': 'Town',
};
const t = (k, v = {}) => (LABELS[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n]);
const by = (facts) => Object.fromEntries(facts.map((f) => [f.k, f.value]));

test('a bare activity has no subcategory, price, duration or town', () => {
  assert.deepEqual(by(doFacts({ type: 'activity', name: 'x' }, t)),
    { kind: null, fee: null, duration: null, town: null });
});

test('a non-activity type labels the subcategory', () => {
  assert.equal(by(doFacts({ type: 'swim' }, t)).kind, 'Swim');
});

test('the POI kind wins, labelled when known and raw otherwise', () => {
  assert.equal(by(doFacts({ type: 'activity', kind: 'Viewpoint' }, t)).kind, 'Viewpoint');
  assert.equal(by(doFacts({ type: 'activity', kind: 'Rope bridge' }, t)).kind, 'Rope bridge');
  assert.equal(kindSlug('Sauna & baths'), 'sauna_baths');
});

test('price, duration and town read the harvested keys', () => {
  assert.deepEqual(by(doFacts({ kind: 'Cave', fee: 'yes', fee_eur: 12.5, duration_min: 45, town: 'Bellagio' }, t)),
    { kind: 'Cave', fee: '€12.50', duration: '45 min', town: 'Bellagio' });
  assert.equal(by(doFacts({ fee: 'no' }, t)).fee, 'Free');
  assert.equal(by(doFacts({ fee: 'yes' }, t)).fee, 'Paid');
  assert.equal(by(doFacts({ duration_min: 120 }, t)).duration, '2 h');
});
