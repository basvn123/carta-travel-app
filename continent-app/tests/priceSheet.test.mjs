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
import {
  handoff, inPriceRows, stayBasisKey, foodBasisKey, tabForPart, wayTabKey, capturedMonth,
} from '../src/lib/price/priceSheet.js';
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

test('the stay basis follows the data case', () => {
  const line = (extra = {}) => ({ key: 'bed', ...extra });
  assert.equal(stayBasisKey({ stayLevel: 'city', lines: [line({ provenance: { captured: '2026-11-03' } })] }), 'price.stay.basisLocal');
  assert.equal(stayBasisKey({ stayLevel: 'city', lines: [line()] }), 'price.stay.basisLocalNoDate');
  assert.equal(stayBasisKey({ stayLevel: 'city', lines: [line({ thin: true })] }), 'price.stay.basisThin');
  assert.equal(stayBasisKey({ stayLevel: 'region', lines: [line({ thin: true })] }), 'price.stay.basisWide');
  assert.equal(stayBasisKey({ stayLevel: 'city', lines: [line({ provenance: { repaired: true } })] }), 'price.stay.basisWide');
  assert.equal(capturedMonth({ lines: [line({ provenance: { captured: '2026-11-03' } })] }), '2026-11');
  assert.equal(foodBasisKey({ foodLevel: 'city' }), 'price.food.basisLocal');
  assert.equal(foodBasisKey({ foodLevel: 'country' }), 'price.food.basisCountry');
});

test('"In this price" lists bed, food, the day, transport not measured, the way apart', () => {
  const rows = inPriceRows({ dayEur: 149, stayEur: 116, foodEur: 33, way: { mode: 'plane', perPerson: 105 } }, { wayEur: 105 });
  assert.deepEqual(rows.map((r) => r.key), ['bed', 'food', 'sum', 'transport', 'way']);
  assert.equal(rows.find((r) => r.key === 'sum').eur, 149);
  assert.equal(rows.find((r) => r.key === 'transport').eur, null, 'no fare: not yet measured, never zero');
  assert.equal(rows.find((r) => r.key === 'way').apart, true);
  assert.equal(inPriceRows({ dayEur: 149 }, {}).find((r) => r.key === 'way').eur, null);
  const group = inPriceRows({ dayEur: 100, stayEur: 70, foodEur: 30 }, { group: true, seats: 2 });
  assert.equal(group.find((r) => r.key === 'sum').eur, 200);
  const src = read('src/components/price/PriceSheet.jsx');
  assert.match(src, /price\.notYetMeasured/);
  assert.match(src, /price\.in\.covers/);
});

test('each tab hands over to the dock row or studio step that moves its number', () => {
  assert.deepEqual(handoff('stay'), { studio: 'spend', key: 'price.changeStay' });
  assert.deepEqual(handoff('food'), { studio: 'spend', key: 'price.changeFood' });
  assert.deepEqual(handoff('flight'), { dock: 'trip', focus: 'from', key: 'price.changeFlight' });
  assert.deepEqual(handoff('in'), { dock: 'trip', focus: 'from', key: 'price.changeTrip' });
  assert.deepEqual(handoff('flight', { way: { mode: 'train' } }), { studio: 'way', key: 'price.changeWay' });
  // A studio step goes through the one studio door; the dock row exists.
  assert.match(read('src/components/price/PriceSheet.jsx'), /h\.studio \? openStudioAt\(ts, h\.studio\)/);
  assert.match(read('src/components/dock/TripDock.jsx'), /rowKey="from"/);
});

test('the tapped part chooses the tab; a ground way names its own tab', () => {
  assert.equal(tabForPart('way'), 'flight');
  assert.equal(tabForPart('bed'), 'stay');
  assert.equal(tabForPart('food'), 'food');
  assert.equal(tabForPart('day'), 'in');
  assert.equal(wayTabKey({ way: { mode: 'plane' } }), 'price.tabFlight');
  assert.equal(wayTabKey(null), 'price.tabFlight');
  assert.equal(wayTabKey({ way: { mode: 'bus' } }), 'way.bus');
  // The list row's parts open the sheet (not the old items popover), each
  // with its own part name, so the flight wagon lands on the Flight tab.
  const parts = read('src/browse/explore/HouseParts.jsx');
  assert.match(parts, /<SheetTrigger place=\{place\}[^>]*part="way">/);
  assert.match(parts, /<SheetTrigger place=\{place\}[^>]*part=\{key\}/);
  assert.match(parts, /<SheetTrigger place=\{place\} cost=\{cost\} triggerClass="xform-fig" part="day"/);
  assert.match(parts, /openPriceSheet\(\{ place: place \|\| \{ id: null \}, cost, tab: tabForPart\(part\), anchor: button \}\)/);
});

test('the sheet tabs are a tablist and the flight tab loads lazily', () => {
  const src = read('src/components/price/PriceSheet.jsx');
  assert.match(src, /lazy\(\(\) => import\('\.\/FlightTab\.jsx'\)\)/);
  assert.match(src, /<Tabs /);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-modal="false"/, 'the desktop popover is not modal');
});
