// T1209 (ROADMAP G14): the G14 home's flag and pure parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HOME_G14, homeVariant, dayParts, pricedMonth, shareUrl, sampleHref, SAMPLE_JOURNEY, EXAMPLE_PLACE,
} from '../src/browse/home/homeVariant.js';
import { channelOf } from '../src/lib/channelCounts.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test('the flag is off until the design direction is approved (T1111-a)', () => {
  assert.equal(HOME_G14, false);
  assert.equal(homeVariant('', mem()), 'v3');
  assert.equal(homeVariant('?tab=home', null), 'v3');
});

test('?home=g14 previews the new home for the session, ?home=v3 goes back', () => {
  const s = mem();
  assert.equal(homeVariant('?home=g14', s), 'g14');
  assert.equal(homeVariant('', s), 'g14');
  assert.equal(homeVariant('?home=v3', s), 'v3');
  assert.equal(homeVariant('', s), 'v3');
  assert.equal(homeVariant('?home=other', mem()), 'v3');
  assert.equal(homeVariant('', mem(), true), 'g14');
});

test('blocked storage leaves the query alone in charge', () => {
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(homeVariant('?home=g14', bad), 'g14');
  assert.equal(homeVariant('', bad), 'v3');
});

test('the day example sums bed and food and never guesses', () => {
  const d = dayParts({ stayEur: 60, foodEur: 30, dayEur: 90 });
  assert.equal(d.total, 90);
  assert.deepEqual(d.parts.map((p) => [p.key, p.eur, p.share]), [['stay', 60, 66.7], ['food', 30, 33.3]]);
  assert.equal(dayParts(null), null);
  assert.equal(dayParts({ stayEur: 60, foodEur: null }), null);
  assert.equal(dayParts({ stayEur: 0, foodEur: 30 }), null);
});

test('the priced month follows the start date, else today', () => {
  assert.equal(pricedMonth('2027-03-04', 'en'), 'March');
  assert.equal(pricedMonth('2027-03-04', 'nl'), 'maart');
  assert.equal(pricedMonth(null, 'en', new Date(Date.UTC(2026, 10, 7))), 'November');
});

test('the referral link names a channel and the referral bucket, and no person', () => {
  const url = shareUrl('https://carta-europetravel.com/');
  assert.equal(url, 'https://carta-europetravel.com/?utm_source=waitlist_share&utm_medium=referral');
  const q = new URL(url).search;
  assert.deepEqual(channelOf(q), { channel: 'waitlist_share', medium: 'referral' });
  assert.deepEqual([...new URL(url).searchParams.keys()], ['utm_source', 'utm_medium']);
});

test('the sample trip and the example place exist in the shipped data', () => {
  assert.equal(sampleHref(), `#journey=${SAMPLE_JOURNEY}`);
  const j = new URL(`../public/journeys/journey/${SAMPLE_JOURNEY}.json`, import.meta.url);
  if (fs.existsSync(j)) assert.equal(JSON.parse(fs.readFileSync(j, 'utf8')).id, SAMPLE_JOURNEY);
  assert.equal(EXAMPLE_PLACE, 'gem:bled');
});

test('every home.g key is in all six languages with the same placeholders, no dashes', async () => {
  const langs = ['en', 'nl', 'de', 'fr', 'es', 'it'];
  const cats = {};
  for (const l of langs) cats[l] = (await import(`../src/i18n/${l}.js`))[l];
  const keys = Object.keys(cats.en).filter((k) => k.startsWith('home.g') && /^home\.g[A-Z]/.test(k));
  assert.ok(keys.length >= 17);
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const l of langs) {
    for (const k of keys) {
      assert.equal(typeof cats[l][k], 'string', `${l} ${k}`);
      assert.equal(ph(cats[l][k]), ph(cats.en[k]), `${l} ${k}`);
      assert.doesNotMatch(cats[l][k], /[–—]/, `${l} ${k}`);
    }
  }
});
