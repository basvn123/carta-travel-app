// price_trip through quoteTrip (T1215, row T1155-c): parity with the app's
// own trip price, flights and legs, and the eval of expected figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openData } from '../src/data.js';
import { priceTrip, tripStateFor, ToolError } from '../src/tools.js';
import { quoteTrip } from '../../../continent-app/src/lib/price/trip.js';
import { priceDay, priceRequest } from '../../../continent-app/src/lib/price/index.js';
import { legCost } from '../../../continent-app/src/lib/flights/flights.js';

const DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const data = openData(DIR);
const cat = JSON.parse(readFileSync(`${DIR}/app_data.json`, 'utf8'));
const EVAL = JSON.parse(readFileSync(fileURLToPath(new URL('./eval/price_trip.eval.json', import.meta.url)), 'utf8'));
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

// A swept file for AMS, checked now, so the engine's freshness rule keeps it.
const nowMin = Math.floor(Date.now() / 60000);
const AMS = {
  from: 'AMS',
  to: { BRU: { '2027-05-10': [89, 'KLM', '07:10', '08:05', 0, nowMin] } },
  back: { BRU: { '2027-05-15': [95, 'KLM', '19:00', '20:00', 0, nowMin] } },
};
const withSweep = { ...data, flights: (iata) => (iata === 'AMS' ? AMS : null) };

const quoteFor = (input, file = null) => {
  const { state, data: extra } = tripStateFor(input, file);
  return quoteTrip(state, { data: { destinations: cat.destinations, meta: { car_model: cat.meta.car_model, ...extra.meta }, flightsBy: extra.flightsBy } });
};

test('parity: every eval case equals quoteTrip part by part', () => {
  for (const c of EVAL.cases) {
    const r = priceTrip(data, c.input);
    const q = quoteFor(c.input);
    for (const [k, v] of Object.entries(r.parts)) assert.ok(near(v, q.parts[k]), `${c.name}: ${k} ${v} vs ${q.parts[k]}`);
    if (c.input.flights) assert.ok(near(r.total_eur, q.grandTotal), `${c.name}: total ${r.total_eur} vs ${q.grandTotal}`);
    else assert.ok(near(r.total_eur, q.grandTotal - q.parts.transfers - q.parts.travel - q.parts.flights - q.parts.airport - q.parts.drive), c.name);
    assert.equal(r.legs.length, c.input.stops.length - 1);
  }
});

test('eval: the expected figures hold', () => {
  let n = 0;
  for (const c of EVAL.cases) {
    const r = priceTrip(data, c.input);
    assert.ok(near(r.total_eur, c.expect.total_eur), `${c.name}: total ${r.total_eur}, expected ${c.expect.total_eur}`);
    for (const [k, v] of Object.entries(c.expect.parts)) assert.ok(near(r.parts[k], v), `${c.name}: ${k} ${r.parts[k]}, expected ${v}`);
    assert.deepEqual(r.legs.map((l) => [l.mode, l.total_eur]), c.expect.legs, c.name);
    if (c.expect.stops_total) assert.deepEqual(r.stops.map((s) => s.total_eur), c.expect.stops_total, c.name);
    n += 1;
  }
  assert.equal(n, 6);
});

test('stays: beds and days are the engine day row x seats x nights', () => {
  const r = priceTrip(data, { stops: [{ id: 'gem:bruges', nights: 3 }], adults: 2, stay: 'hotel3' });
  const req = { ...priceRequest({ choices: { group_size: 2, stay_tier: 'hotel3' } }), nights: 3 };
  const day = priceDay(cat.destinations['gem:bruges'], req, cat.destinations);
  assert.ok(near(r.stops[0].total_eur, day.dayEur * 2 * 3, 0.05), `${r.stops[0].total_eur} vs ${day.dayEur * 6}`);
  assert.equal(r.legs.length, 0);
  assert.equal(r.flights, null);
  assert.match(r.excludes, /flights/);
});

test('legs: the chosen mode prices the hop; a hire car adds the car', () => {
  const base = { stops: [{ id: 'BCN', nights: 2 }, { id: 'MAD', nights: 2 }], adults: 2, stay: 'private' };
  const auto = priceTrip(data, base);
  const bus = priceTrip(data, { ...base, leg_modes: ['bus'] });
  const car = priceTrip(data, { ...base, legs_by: 'car' });
  assert.equal(bus.legs[0].mode, 'bus');
  assert.equal(car.legs[0].mode, 'car');
  assert.ok(car.parts.car > 0);
  assert.equal(auto.parts.car, 0);
  assert.ok(near(bus.total_eur - auto.total_eur, bus.parts.between - auto.parts.between));
});

test('flights: typed fares are added as given, one way left to Carta', () => {
  const base = { stops: [{ id: 'gem:bruges', nights: 3 }, { id: 'gem:ghent', nights: 2 }], adults: 2, stay: 'hotel3', start: '2027-05-10' };
  const none = priceTrip(data, base);
  const typed = priceTrip(data, { ...base, flights: { out_eur: 180, back_eur: 210 } });
  assert.ok(near(typed.total_eur - none.total_eur, 390));
  assert.deepEqual(typed.unpriced_flights, []);
  const half = priceTrip(data, { ...base, flights: { out_eur: 180 } });
  assert.deepEqual(half.unpriced_flights, ['back']);
});

test('flights: a swept fare from the home airport, with bags, for the party', () => {
  const input = { stops: [{ id: 'gem:bruges', nights: 3 }, { id: 'gem:ghent', nights: 2 }], adults: 2, stay: 'hotel3', start: '2027-05-10', flights: { from: 'ams' } };
  const r = priceTrip(withSweep, input);
  const q = quoteFor(input, AMS);
  assert.equal(r.flights.swept_file, true);
  assert.equal(r.flights.carta.out.airline, 'KLM');
  const out = legCost({ price: 89, airline: 'KLM' }, { paying: 2, bagKey: q.request.baggage });
  assert.ok(near(r.flights.carta.out.total_eur, out.total));
  assert.ok(r.parts.flights > 89 * 2 + 95 * 2 - 0.01);
  assert.ok(near(r.total_eur, q.grandTotal));
  assert.deepEqual(r.unpriced_flights, []);
  // A home airport with no swept file prices nothing and says so.
  const bare = priceTrip(data, input);
  assert.equal(bare.flights.swept_file, false);
  assert.deepEqual(bare.unpriced_flights, ['out', 'back']);
  assert.throws(() => priceTrip(data, { ...input, flights: { from: 'A1' } }), ToolError);
});

test('errors: unknown place and empty stops', () => {
  assert.throws(() => priceTrip(data, { stops: [{ id: 'nope', nights: 1 }] }), ToolError);
  assert.throws(() => priceTrip(data, { stops: [] }), ToolError);
});
