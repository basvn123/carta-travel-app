// T1114 (ROADMAP D10, owner decision 2 of 2026-11-05): the thin-bed and
// not-yet-measured notes come from ONE rule (lib/price/notes.js) and ONE
// component (components/PriceNotes.jsx) on the trip page, the Plan receipt,
// the Ask card and the Explore card, as on the destination price card.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());

const FX = JSON.parse(readFileSync(new URL('./fixtures/price/destinations.json', import.meta.url), 'utf8'));
const ALL = FX.destinations;
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

async function load() {
  const [{ default: React }, server, i18n, notes, stays, engine] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/i18n/index.jsx'), vite.ssrLoadModule('/src/components/PriceNotes.jsx'),
    vite.ssrLoadModule('/src/lib/staysData.js'), vite.ssrLoadModule('/src/lib/price/index.js'),
  ]);
  const rule = await vite.ssrLoadModule('/src/lib/price/notes.js');
  return { React, ...server, ...i18n, ...notes, ...stays, ...engine, ...rule };
}
function rowWith(m, n) {
  const rec = JSON.parse(JSON.stringify(FX.stays.LIS));
  for (const k of Object.keys(rec.src || {})) rec.src[k].n = n;
  m.setStayRecords({ ...FX.stays, LIS: rec });
  return m.priceDay(ALL.LIS, m.DEFAULT_PRICE_REQUEST, ALL);
}
const html = (m, el) => m.renderToStaticMarkup(m.React.createElement(m.I18nProvider, null, el));

test('the one rule: thin bed and the missing transport fare, once each, never invented', async () => {
  const m = await load();
  assert.deepEqual(m.priceNotes(rowWith(m, 2)), { thinBed: true, unmeasured: ['transport'] });
  assert.deepEqual(m.priceNotes(rowWith(m, 9)), { thinBed: false, unmeasured: ['transport'] });
  assert.deepEqual(m.priceNotes(null), { thinBed: false, unmeasured: [] });
  assert.deepEqual(m.priceNotes({ stayEur: 50 }), { thinBed: false, unmeasured: [] }, 'a row with no engine lines says nothing');
  const two = m.priceNotes([rowWith(m, 2), rowWith(m, 9)]);
  assert.equal(two.thinBed, true);
  assert.deepEqual(two.unmeasured, ['transport']);
});

test('the component draws both notes, and nothing for a clean row', async () => {
  const m = await load();
  const out = html(m, m.React.createElement(m.PriceNotes, { row: rowWith(m, 1) }));
  assert.match(out, /data-testid="price-notes"/);
  assert.match(out, /Bed price: few listings measured/);
  assert.match(out, /Local transport: not yet measured/);
  assert.doesNotMatch(out, /not-yet/, 'own classes, so the destination page hide rule never reaches them');
  const quiet = html(m, m.React.createElement(m.PriceNotes, { row: null }));
  assert.equal(quiet, '');
});

test('Explore card: the card price slot carries the notes from the card cost row', async () => {
  const m = await load();
  const row = rowWith(m, 2);
  const out = html(m, m.React.createElement(m.PriceNotes, { row, className: 'xprice-notes' }));
  assert.match(out, /xprice-notes/);
  assert.match(out, /data-note="bed"/);
  assert.match(src('browse/ExploreCards.jsx'), /<PriceNotes row=\{p\.cost\}/);
  assert.match(src('browse/ExploreRails.jsx'), /<PriceNotes row=\{p\.cost\}/);
});

test('Ask card: the stay section carries the notes from the destination cost row', async () => {
  const m = await load();
  const out = html(m, m.React.createElement(m.PriceNotes, { row: rowWith(m, 2), className: 'ac-trip-notes' }));
  assert.match(out, /ac-trip-notes/);
  assert.match(src('browse/ask/AskTripCard.jsx'), /<PriceNotes row=\{cost\}/);
});

test('Plan receipt: the day receipt draws the notes of the stop row the figures come from', async () => {
  const m = await load();
  const out = html(m, m.React.createElement(m.PriceNotes, { row: rowWith(m, 2), className: 'day-receipt-notes' }));
  assert.match(out, /day-receipt-notes/);
  assert.match(src('planner/DayCost.jsx'), /<PriceNotes row=\{dayCost\.row\}/);
  assert.match(src('planner/DayPlannerTab.jsx'), /row: costRow,/);
});

test('trip page: the cost card merges the notes of every stop, once each', async () => {
  const m = await load();
  const priced = { stayCosts: [{ day: rowWith(m, 2) }, { day: rowWith(m, 9) }, null] };
  const rows = priced.stayCosts.map((s) => s?.day);
  const out = html(m, m.React.createElement(m.PriceNotes, { row: rows, className: 'ccard-notes' }));
  assert.equal((out.match(/data-note="transport"/g) || []).length, 1);
  assert.equal((out.match(/data-note="bed"/g) || []).length, 1);
  assert.match(src('planner/trip/CostCard.jsx'), /<PriceNotes row=\{\(priced\?\.stayCosts/);
});

test('destination page: the price card uses the same rule and the same components', () => {
  const s = src('browse/DestPriceCard.jsx');
  assert.match(s, /priceNotes\(costRow\)\.unmeasured/);
  assert.match(s, /<ThinBedNote \/>/);
  assert.match(s, /<NotMeasuredValue \/>/);
});

test('the note strings exist in the six catalogues', () => {
  for (const l of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const text = src(`i18n/${l}.js`);
    assert.match(text, /"price\.noteBed": "[^"]+"/, l);
    assert.match(text, /"price\.noteMissing": "[^"]*\{part\}[^"]*"/, l);
  }
});
