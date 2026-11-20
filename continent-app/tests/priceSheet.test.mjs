// D10, G12 (explore polish step 6): the price sheet's honesty rules. The
// Flight tab never claims an exact or live fare, keeps its checked line and
// its Google Flights link; the Stay basis follows the data's real case;
// "In this price" says local transport is not yet measured; every tab's
// button hands over to the dock row that moves its number.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en } from '../src/i18n/en.js';
import { googleFlightsLink } from '../src/lib/flights/flights.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LOCALES = ['en', 'nl', 'de', 'fr', 'es', 'it'];

test('flight copy never says exact, live, available, guaranteed or seats left', async () => {
  // "seats" alone is honest in the lap-fee line ("shared over the seats");
  // a seat count is what the sweep does not know.
  const bad = Object.keys(en).filter((k) => k.startsWith('price.flight.')
    && /\b(exact|live|available|guaranteed)\b|\bseats? left\b/i.test(en[k]));
  assert.deepEqual(bad, []);
  for (const code of LOCALES) {
    const cat = (await import(`../src/i18n/${code}.js`))[code];
    const keys = Object.keys(cat).filter((k) => k.startsWith('price.'));
    assert.ok(keys.length > 80, `${code} has the sheet keys`);
    // No euro sign and no dash in any sheet string: money goes through formatMoney.
    assert.deepEqual(keys.filter((k) => /[€–—]/.test(cat[k])), [], code);
  }
});

test('the flight tab keeps its checked line and the Google Flights link', () => {
  const src = read('src/components/price/FlightTab.jsx');
  assert.match(src, /checkedLabel\(t, /, 'each leg says when it was checked');
  assert.match(src, /flight\.bookNote/, 'prices may have changed');
  assert.match(src, /googleFlightsLink\(ft\.home, ft\.airport, shown\.out\.date, \{ back: shown\.back\.date/);
  assert.match(src, /t\('flight\.book'\)/);
  assert.doesNotMatch(src, /flight\.bookReturn/, 'the button label stays short');
  const href = googleFlightsLink('BRU', 'FCO', '2026-03-14', { back: '2026-03-21' });
  assert.match(href, /curr=EUR/);
  assert.match(decodeURIComponent(href), /2026-03-14 returning 2026-03-21/);
});

test('the flight tab draws a duration only for a searched flight', () => {
  const src = read('src/components/price/FlightTab.jsx');
  assert.match(src, /leg\.source === 'live' \? durationOf\(t, leg\.min\) : null/);
});

test('G12 (D10): a typical fare is labelled typical, and no fare says no flight checked yet', () => {
  const src = read('src/components/price/FlightTab.jsx');
  assert.match(src, /way\?\.typical && way\.perPerson > 0 && !ft\.picked/, 'the row typical fare heads the tab until a checked day is picked');
  assert.match(src, /t\('settingsSum\.typical'\)/);
  assert.match(src, /t\('settingsSum\.noFlight'\)/);
  assert.match(read('src/components/price/PriceSheet.jsx'), /<FlightTab [^>]*way=\{s\.cost\?\.way/);
  assert.match(en['settingsSum.typical'], /^Typical fare/);
  assert.equal(en['settingsSum.noFlight'], 'No flight checked yet');
});
