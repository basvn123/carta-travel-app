import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overviewRegion, overviewScore, overviewReason, reasonText, regionLine,
} from '../src/lib/placeOverview.js';
import { regionFromHash } from '../src/lib/regions.js';

// T504 (roadmap 1.5): one overview per place, the same words in the list,
// on the map and in the phone drawer.

const guided = {
  areas: [
    { id: 'alps', kind: 'mountains', label: { en: 'Alps' } },
    { id: 'tuscany', kind: 'region', label: { en: 'Tuscany', nl: 'Toscane' } },
    { id: 'amalfi', kind: 'coast', label: { en: 'Amalfi Coast' } },
  ],
  d: {
    SIE: { a: ['alps', 'tuscany'] },
    POS: { a: ['amalfi', 'alps'] },
    ALP: { a: ['alps'] },
    NON: {},
  },
};

const t = (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;

test('the region prefers a region, then a coast, then a range, in the reader language', () => {
  assert.equal(overviewRegion(guided, 'SIE', 'en'), 'Tuscany');
  assert.equal(overviewRegion(guided, 'SIE', 'nl'), 'Toscane');
  assert.equal(overviewRegion(guided, 'SIE', 'de'), 'Tuscany');
  assert.equal(overviewRegion(guided, 'POS', 'en'), 'Amalfi Coast');
  assert.equal(overviewRegion(guided, 'ALP', 'en'), 'Alps');
  assert.equal(overviewRegion(guided, 'NON', 'en'), null);
  assert.equal(overviewRegion(null, 'SIE', 'en'), null);
});

test('the region line names the region and the country, or the country alone', () => {
  const p = { iso2: 'IT', country: 'Italy' };
  assert.match(regionLine(p, 'Tuscany', t), /^overview\.regionCountry\(region=Tuscany,country=/);
  assert.equal(typeof regionLine(p, null, t), 'string');
  assert.ok(!regionLine(p, null, t).startsWith('overview.'));
});

test('the score is the base Score until the wire carries a month score', () => {
  const base = { score: 8.4, tier: 2 };
  assert.equal(overviewScore({ rating: base }, 10), base);
  assert.equal(overviewScore({ rating: base }, null), base);
  const withMonths = { rating: { ...base, month_scores: { 11: 6.1 } } };
  assert.equal(overviewScore(withMonths, 11).score, 6.1);
  assert.equal(overviewScore(withMonths, 11).month, 11);
  assert.equal(overviewScore(withMonths, 7).score, 8.4);
  assert.equal(overviewScore(withMonths, null).score, 8.4);
  assert.equal(overviewScore({}, 3), null);
});

test('one reason, the first that exists', () => {
  const p = { climate: { best: [5, 6, 7, 8, 9] }, rating: { month_why: { 11: 'Huts and lifts closed' } } };
  assert.deepEqual(overviewReason(p, { why: 'Beach 3 km away', month: 7 }), { kind: 'why', text: 'Beach 3 km away' });
  assert.deepEqual(overviewReason(p, { month: 11 }), { kind: 'monthWhy', text: 'Huts and lifts closed' });
  assert.deepEqual(overviewReason(p, { month: 7 }), { kind: 'goodIn', month: 7 });
  assert.deepEqual(overviewReason(p, { month: 2 }), { kind: 'bestIn', months: [5, 6, 7, 8, 9] });
  assert.deepEqual(overviewReason(p, {}), { kind: 'bestIn', months: [5, 6, 7, 8, 9] });
  assert.equal(overviewReason({}, { month: 3 }), null);
});

test('the reason is worded through i18n', () => {
  const fmt = { monthName: (m) => `M${m}`, monthRanges: (ms) => ms.join('-') };
  assert.equal(reasonText({ kind: 'goodIn', month: 7 }, t, fmt), 'gs.whyMonth(month=M7)');
  assert.equal(reasonText({ kind: 'bestIn', months: [5, 6] }, t, fmt), 'explore.bestMonths(months=5-6)');
  assert.equal(reasonText({ kind: 'why', text: 'x' }, t, fmt), 'x');
  assert.equal(reasonText(null, t, fmt), null);
});

test('the region page address reads #region=, alone or after a country', () => {
  assert.equal(regionFromHash('#region=COAST:IT-AMALFI'), 'COAST:IT-AMALFI');
  assert.equal(regionFromHash('#country=IT&region=COAST%3AIT-AMALFI'), 'COAST:IT-AMALFI');
  assert.equal(regionFromHash('#country=IT'), null);
  assert.equal(regionFromHash('#region=bad<id>'), null);
  assert.equal(regionFromHash(''), null);
});
