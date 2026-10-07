// The landing page's receipt demonstration and coverage figures (T209,
// src/lib/landing.js). Run: npm test (continent-app/)
//
// The fixtures pin the arithmetic and the honesty flags. The real-data test
// runs when public/app_data.json is present: the three demo towns must
// price, and every figure must keep its cents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  defaultStart, pickDemoTowns, priceReceipt, catalogueFacts, coverageRows, DEMO_TOWNS,
} from '../src/lib/landing.js';
import { DEFAULT_LIFESTYLE } from '../src/lib/runtime_pricing.js';
import { priceReceipt as firstRunReceipt } from '../src/lib/firstRun.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');

const costs = (level) => ({
  meal_mid_eur: 25, meal_cheap_eur: 12, fastfood_eur: 8, drink_out_eur: 3, cocktail_eur: 9.6,
  coffee_eur: 2.3, grocery_day_eur: 11.5, club_entry_eur: 8.64, level,
});
const measured = {
  id: 'AAA', city: 'Measured', iso2: 'PT',
  accommodation: {
    per_person_night_eur: 28.25, cleaning_per_person_eur: 14.12, level: 'city',
    n_listings: 10833, captured: '2026-06-23', source_place: 'Measured',
    capacity_buckets: { 2: 95, 3: 99, 4: 119 },
    tiers: { dorm_pp_night_eur: 21.74, private_room_night_eur: 62.1 },
  },
  costs: costs('city'),
};
const national = {
  id: 'BBB', city: 'National', iso2: 'FR',
  accommodation: { per_person_night_eur: 40.62, cleaning_per_person_eur: 20.31, level: 'country' },
  costs: costs('country'),
};
const input = (over = {}) => ({
  people: 2, nights: 7, tier: 'home', start: '2026-11-07', lifestyle: DEFAULT_LIFESTYLE, model: null, ...over,
});
const cents = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

test('the default stay starts on the first Saturday at least four weeks out', () => {
  assert.equal(defaultStart('2026-10-07'), '2026-11-07');
  assert.equal(defaultStart('2026-10-03'), '2026-10-31');   // a Saturday lands on a Saturday
  assert.equal(defaultStart('2026-10-04'), '2026-11-07');
  assert.equal(new Date('2026-11-07T00:00:00Z').getUTCDay(), 6);
});

test('a measured town prices with no estimate anywhere, to the cent', () => {
  const r = priceReceipt(measured, input());
  assert.ok(r);
  assert.equal(r.est, false);
  assert.equal(r.stay.est, false);
  assert.equal(r.ground.est, false);
  assert.equal(r.stay.listings, 10833);
  assert.equal(r.stay.place, 'Measured');
  assert.equal(r.nights, 7);
  assert.equal(r.from, '2026-11-07');
  assert.equal(r.to, '2026-11-14');
  // The ground line is the printed per-day figure times days times people.
  assert.equal(r.ground.eur, Math.round(r.ground.perDay * 7 * 2 * 100) / 100);
  assert.equal(r.total, Math.round((r.stay.eur + r.ground.eur) * 100) / 100);
  assert.equal(r.each, Math.round((r.total / 2) * 100) / 100);
  for (const v of [r.stay.eur, r.ground.eur, r.total, r.each]) assert.ok(cents(v), `${v} keeps two decimals`);
  assert.equal(priceReceipt(measured, input({ people: 1 })).each, null);
});

test('the landing receipt is the first-run receipt, line for line (T099)', () => {
  for (const dest of [measured, national]) {
    for (const tier of ['home', 'dorm', 'private']) {
      const r = priceReceipt(dest, input({ tier }));
      const f = firstRunReceipt(dest, {
        from: '2026-11-07', to: '2026-11-14', people: 2, stayTier: tier, lifestyle: DEFAULT_LIFESTYLE,
      });
      assert.equal(r.total, f.total);
      assert.deepEqual(r.lines, f.lines);
    }
  }
});

test('a national figure is an estimate, and so is the total that holds it', () => {
  const r = priceReceipt(national, input());
  assert.equal(r.stay.est, true);
  assert.equal(r.ground.est, true);
  assert.equal(r.est, true);
  const mixed = priceReceipt({ ...measured, costs: costs('country') }, input());
  assert.equal(mixed.stay.est, false);
  assert.equal(mixed.ground.est, true);
  assert.equal(mixed.est, true);
});

test('a tier the town does not measure falls back to an entire place, and says so', () => {
  const r = priceReceipt(national, input({ tier: 'dorm' }));
  assert.equal(r.stay.tier, 'home');
  assert.equal(r.stay.tierAsked, 'dorm');
  assert.equal(r.stay.tierFallback, true);
  const d = priceReceipt(measured, input({ tier: 'dorm' }));
  assert.equal(d.stay.tier, 'dorm');
  assert.equal(d.stay.tierFallback, false);
  assert.equal(d.stay.listings, null);   // a hostel rate is not counted in listings
});

test('the footer names one changed input: a cheaper measured bed, else other nights', () => {
  const r = priceReceipt(measured, input());
  assert.equal(r.alt.kind, 'tier');
  assert.equal(r.alt.tier, 'dorm');
  assert.ok(r.alt.total < r.total);
  const n = priceReceipt(national, input());
  assert.equal(n.alt.kind, 'nights');
  assert.equal(n.alt.nights, 4);
  assert.equal(n.alt.est, true);
  assert.equal(priceReceipt(national, input({ nights: 4 })).alt.nights, 7);
});

test('the demo towns come in order, skip a missing one, and never come up empty', () => {
  const dests = { [DEMO_TOWNS[2]]: { ...measured, id: DEMO_TOWNS[2] }, [DEMO_TOWNS[0]]: { ...national, id: DEMO_TOWNS[0] } };
  assert.deepEqual(pickDemoTowns(dests).map((d) => d.id), [DEMO_TOWNS[0], DEMO_TOWNS[2]]);
  const fallback = pickDemoTowns({ AAA: measured, BBB: national });
  assert.deepEqual(fallback.map((d) => d.id), ['AAA']);
  assert.deepEqual(pickDemoTowns({}), []);
});

test('catalogue facts count measured beds and food, and read the place count from meta', () => {
  const f = catalogueFacts({ AAA: measured, BBB: national }, { n_destinations: 2 });
  assert.deepEqual(f, { places: 2, countries: 2, bedsMeasured: 1, foodMeasured: 1 });
});

test('coverage rows sum published and listed and leave not-applicable regions out', () => {
  const cov = {
    generated_at: '2026-09-04T00:08:22Z',
    regions: {
      A: { trail: { r: 4, l: 1, status: 'thin' }, beach: { status: 'na' }, lake: { r: 0, l: 0, status: 'empty' } },
      B: { trail: { r: 0, l: 0, status: 'empty' }, beach: { r: 2, l: 3, status: 'ok' } },
    },
  };
  const out = coverageRows(cov);
  const trail = out.rows.find((r) => r.key === 'trail');
  const beach = out.rows.find((r) => r.key === 'beach');
  const lake = out.rows.find((r) => r.key === 'lake');
  assert.deepEqual(trail, { key: 'trail', published: 4, listed: 1, empty: 1, applies: 2 });
  assert.deepEqual(beach, { key: 'beach', published: 2, listed: 3, empty: 0, applies: 1 });
  assert.deepEqual(lake, { key: 'lake', published: 0, listed: 0, empty: 1, applies: 1 });
  assert.equal(out.regions, 2);
  assert.equal(coverageRows(null), null);
  assert.equal(coverageRows({ regions: {} }), null);
});

const appData = join(pub, 'app_data.json');
test('the shipped demo towns price, with every figure to the cent', { skip: !existsSync(appData) }, () => {
  const d = JSON.parse(readFileSync(appData, 'utf8'));
  const towns = pickDemoTowns(d.destinations);
  assert.ok(towns.length >= 1);
  for (const town of towns) {
    for (const tier of ['home', 'dorm', 'private', 'hotel3']) {
      for (const people of [1, 2, 6]) {
        const r = priceReceipt(town, input({ tier, people, model: d.meta.accommodation_model }));
        assert.ok(r, `${town.id} ${tier} ${people} prices`);
        for (const v of [r.stay.eur, r.ground.eur, r.total]) {
          assert.ok(Number.isFinite(v) && v > 0 && cents(v), `${town.id} ${v}`);
        }
        assert.equal(r.est, r.stay.est || r.ground.est);
      }
    }
  }
});
