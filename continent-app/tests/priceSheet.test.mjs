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

// G12 (D10, owner 2026-11-19 and 2026-11-20): the source, the check date,
// "it may change" and a typical fare's flag live behind the info button by
// "Book on Google Flights", never as lines of text.
test('the flights screen keeps the Google Flights link with its source, date and warning behind the info button', () => {
  const src = read('src/components/price/FlightTab.jsx');
  assert.match(src, /googleFlightsLink\(ft\.home, ft\.airport, shown\.out\.date, \{ back: shown\.back\.date/);
  assert.match(src, /t\('price\.flight\.book'\)/);
  assert.match(src, /t\('price\.flight\.info', \{ date \}\)/);
  assert.match(src, /t\('price\.flight\.infoTypical'\)/);
  assert.doesNotMatch(src, /flight\.bookNote|checkedLabel|settingsSum\.typical|price\.flight\.dayFailed|price\.flight\.basis/);
  assert.match(en['price.flight.info'], /checked \{date\}\. It may change/);
  const href = googleFlightsLink('BRU', 'FCO', '2026-03-14', { back: '2026-03-21' });
  assert.match(href, /curr=EUR/);
  assert.match(decodeURIComponent(href), /2026-03-14 returning 2026-03-21/);
});

test('G12 (D10): the row way figure heads the screen until a pick, and no fare says no flight checked yet', () => {
  const src = read('src/components/price/FlightTab.jsx');
  const hook = read('src/components/price/useFlightTab.js');
  assert.match(hook, /!picked && rowWay/, 'the cards\' own figure until another flight is picked');
  assert.doesNotMatch(hook, /group: view/, 'always per person');
  assert.match(src, /t\('settingsSum\.noFlight'\)/);
  assert.match(read('src/components/price/PriceSheet.jsx'), /<FlightTab [^>]*way=\{s\.cost\?\.way/);
  assert.equal(en['settingsSum.noFlight'], 'No flight checked yet');
});
