// T652: the shared helpers behind the four key stats (T649 to T651):
// lib/when.js, lib/crowdMonth.js, lib/mobility.js, lib/airportPick.js.
// Fixtures: tests/fixtures/keyStats.json, real pipeline output (Lake Como a
// seasonal lake, Paris a city with no airports[], Naxos an island).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveWhen, whenMonth, busiestMonth, xmFromSearch } from '../src/lib/when.js';
import { crowdFor, crowdTierFor, quietFor } from '../src/lib/crowdMonth.js';
import { mobilityOf, carFreeOf, noCarOk, mobilityStat, gettingAroundRows } from '../src/lib/mobility.js';
import { pickAirport, airportLine, flyLine, airportOptionLabel } from '../src/lib/airportPick.js';
import { en } from '../src/i18n/en.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/keyStats.json', import.meta.url), 'utf8'));
const { como, city, island } = fx;
const t = (k, p = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p[n]);
const TIER_WORD = ['Quiet', 'Moderate', 'Busy', 'Crowded'];

test('when: exact dates read the start month, a span holds both', () => {
  const w = resolveWhen({ dateFlex: null, departDate: '2026-08-12', returnDate: '2026-08-19', ownDates: true });
  assert.deepEqual(w, { kind: 'exact', month: 8, months: [8] });
  const span = resolveWhen({ departDate: '2026-07-28', returnDate: '2026-08-04', ownDates: true });
  assert.deepEqual(span, { kind: 'exact', month: 7, months: [7, 8] });
  assert.equal(whenMonth(span), 7);
});

test('when: a span uses the busiest month by crowd share', () => {
  const share = como.crowding.monthly.share;
  const oct = resolveWhen({ departDate: '2026-10-28', returnDate: '2026-11-04', ownDates: true });
  assert.equal(busiestMonth(oct, share), 10);
  const jul = resolveWhen({ departDate: '2026-06-29', returnDate: '2026-07-05', ownDates: true });
  assert.equal(busiestMonth(jul, share), 7);
  assert.equal(busiestMonth(resolveWhen({}), share), null);
});

test('when: a month, the Explore month filter and any time', () => {
  assert.deepEqual(resolveWhen({ dateFlex: 'month', departDate: '2026-11-03' }), { kind: 'month', month: 11, months: [11] });
  assert.equal(resolveWhen({ dateFlex: 'month', departDate: '2026-11-03', xm: 2 }).month, 2);
  assert.equal(resolveWhen({ dateFlex: 'any', departDate: '2026-11-03', ownDates: true }).kind, 'any');
  // Carta's own default dates are not a choice.
  assert.equal(resolveWhen({ departDate: '2026-11-03', returnDate: '2026-11-10', ownDates: false }).kind, 'any');
  assert.equal(whenMonth(resolveWhen({})), null);
});

test('crowds: Lake Como reads moderate in November and crowded in August', () => {
  const aug = crowdFor(como.crowding, resolveWhen({ xm: 8 }));
  const nov = crowdFor(como.crowding, resolveWhen({ xm: 11 }));
  assert.deepEqual([aug.tier, nov.tier], [3, 1]);
  assert.equal(TIER_WORD[nov.tier], t('crowd.moderate'));
  assert.equal(quietFor(como.crowding, resolveWhen({ xm: 11 })), true);
  assert.equal(quietFor(como.crowding, resolveWhen({ xm: 8 })), false);
});

test('crowds: any time names quiet and busy months; a flat year says so', () => {
  const p = crowdFor(como.crowding, resolveWhen({}));
  assert.equal(p.kind, 'pattern');
  assert.deepEqual(p.quiet, [1, 2, 11]);
  assert.deepEqual(p.busy, [4, 5, 6, 7, 8, 9, 10]);
  assert.equal(crowdFor({ tier: 2 }, resolveWhen({})).kind, 'flat');
  // Paris is busy all year: never quiet.
  assert.ok(crowdFor(city.crowding, resolveWhen({ xm: 7 })).tier >= 2);
});

test('crowds: no monthly series is the placeholder for a month, but the flag keeps the yearly level', () => {
  const bare = { tier: 1 };
  assert.equal(crowdFor(bare, resolveWhen({ xm: 8 })), null);
  assert.equal(crowdTierFor(bare, resolveWhen({ xm: 8 })), null);
  assert.equal(quietFor(bare, resolveWhen({ xm: 8 })), true);
  assert.equal(crowdFor(null, resolveWhen({})), null);
});

test('crowds: the island is moderate in winter, crowded in summer', () => {
  assert.equal(crowdFor(island.crowding, resolveWhen({ xm: 1 })).tier, 1);
  assert.equal(crowdFor(island.crowding, resolveWhen({ xm: 7 })).tier, 3);
});

test('mobility: the stat and the no car flag read mobility.car_free', () => {
  assert.equal(carFreeOf(como), 'good');
  assert.equal(carFreeOf(island), 'hard');
  assert.equal(noCarOk(como), true);
  assert.equal(noCarOk(island), false);
  assert.equal(mobilityOf({ local_transport: { mobility: { car_free: 'maybe' } } }), null);
  const s = mobilityStat(como, t);
  assert.equal(s.value, 'Easy without a car');
  assert.equal(s.note, 'By train and bus. A car helps for trailheads and lake villages.');
});

test('mobility: empty modes read well; absent mobility is the placeholder and the old flag rule', () => {
  const s = mobilityStat(city, t);
  assert.equal(s.value, 'Easy without a car');
  assert.equal(s.note, null);
  assert.equal(mobilityStat({ local_transport: { car_needed: false } }, t), null);
  assert.equal(noCarOk({ local_transport: { car_needed: false, transit_quality: 'good' } }), true);
  assert.equal(noCarOk({ local_transport: { car_needed: true, transit_quality: 'good' } }), false);
  assert.equal(noCarOk({}), false);
  const hard = mobilityStat({ local_transport: { mobility: { car_free: 'hard', modes: [], parking_hard: true } } }, t);
  assert.equal(hard.note, 'Parking is hard.');
});

test('airport: Lake Como takes the shortest public transport, not the road estimate', () => {
  const p = pickAirport({ airports: como.airports });
  assert.deepEqual([p.iata, p.minutes, p.mode, p.road], ['BGY', 146, 'train', false]);
  assert.equal(airportLine(p, t, 'Not available yet'), 'BGY, 146 min by train');
  assert.equal(flyLine(p, t), 'Fly to BGY, then 146 min by train');
});

test('airport: only road estimates are worded by road, never by train', () => {
  const p = pickAirport({ airports: island.airports });
  assert.deepEqual([p.iata, p.minutes, p.road], ['JMK', 47, true]);
  assert.equal(airportLine(p, t), 'JMK, 47 min by road');
  assert.doesNotMatch(airportLine(p, t), /train/);
  assert.equal(airportOptionLabel({ mode: 'car', minutes: 47, source: 'road_estimate' }, t), '47 min by road, estimate');
});

test('airport: a place with no airports[] falls back to its single airport record', () => {
  // By hand: the dossier's single record for a city that is its own airport town.
  const own = pickAirport({ airport: 'CDG', transfer_min: 35, transfer_mode: 'train', transfer_source: 'gtfs' });
  assert.deepEqual([own.iata, own.minutes, own.mode], ['CDG', 35, 'train']);
  const noMode = pickAirport({ airport: 'CDG', transfer_min: 35 });
  assert.equal(noMode.mode, null);
  assert.equal(airportLine(noMode, t, 'Not available yet'), 'CDG, 35 min. Mode: Not available yet');
  assert.equal(airportLine(pickAirport({ airport: 'CDG' }), t), 'CDG');
  assert.equal(pickAirport({}), null);
  assert.equal(pickAirport(null), null);
});

test('airport: a public transport time beats a shorter road estimate; train plus bus has its own word', () => {
  const p = pickAirport({ airports: [{ iata: 'XXX', options: [
    { mode: 'car', minutes: 20, source: 'road_estimate' },
    { mode: 'train+bus', minutes: 75, source: 'gtfs:x' }] }] });
  assert.equal(p.minutes, 75);
  assert.equal(airportLine(p, t), 'XXX, 75 min by train and bus');
});

test('when: the Explore month filter in the URL wins over the dates (destination page)', () => {
  assert.equal(xmFromSearch('?tab=map&xm=11'), 11);
  assert.equal(xmFromSearch('?xm=13'), null);
  assert.equal(xmFromSearch('?tab=map'), null);
  const w = resolveWhen({ xm: xmFromSearch('?xm=11'), dateFlex: 'any' });
  assert.deepEqual([w.kind, whenMonth(w)], ['month', 11]);
});

test('getting there: car and transit rows read the mobility stat, never "a car is needed"', () => {
  const r = gettingAroundRows(como, { car_needed: true, rental_eur_day: 52 }, t, 'en', (n) => `~${n}`);
  assert.equal(r.transit, 'Easy without a car. By train and bus. A car helps for trailheads and lake villages.');
  assert.equal(r.tone, 'good');
  assert.equal(r.rental, 'Rental ~52 a day.');
  assert.equal(gettingAroundRows(como, { car_needed: false }, t).rental, null);
  assert.equal(gettingAroundRows({ local_transport: {} }, { car_needed: true }, t), null);
});
