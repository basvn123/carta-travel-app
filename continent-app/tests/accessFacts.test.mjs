import test from 'node:test';
import assert from 'node:assert/strict';
import { accessCard } from '../src/lib/accessFacts.js';
import { en } from '../src/i18n/en.js';

const dict = en;
const t = (k, v = {}) => String(dict[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n]);

test('no row or an empty row gives no card', () => {
  assert.equal(accessCard(undefined, t, 'en'), null);
  assert.equal(accessCard({ _src: 'openstreetmap', _asof: '2026-11-07' }, t, 'en'), null);
  assert.equal(accessCard({ station: { wc: 'maybe' } }, t, 'en'), null);
});

test('lines say mapped as, and the source and date follow', () => {
  const c = accessCard({
    station: { wc: 'yes', m: 300, name: 'Gent-Sint-Pieters' },
    toilets: { n: 2, m: 200 },
    places: { yes: 3, limited: 1, no: 1, named: ['Museum A', 'Museum B'] },
    _src: 'openstreetmap', _asof: '2026-11-07',
  }, t, 'en');
  assert.match(c.lines[0], /^Gent-Sint-Pieters is mapped as step-free/);
  assert.match(c.lines[1], /2 accessible toilets are mapped/);
  assert.match(c.lines[2], /3 of 5 mapped museums/);
  assert.match(c.lines[3], /Museum A and Museum B/);
  assert.match(c.source, /OpenStreetMap contributors, November 2026/);
  assert.match(c.source, /not a guarantee/);
});

test('a "no" station is stated as mapped, never softened', () => {
  const c = accessCard({ station: { wc: 'no', m: 10 } }, t, 'en');
  assert.match(c.lines[0], /nearest mapped station is mapped as not step-free/);
});
