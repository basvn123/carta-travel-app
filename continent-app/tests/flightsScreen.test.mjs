// G12 (D10, decision 2026-11-19 section 3): the flights screen's rules.
// A failed day answers at once and retries once by itself; the bars are
// fresh fares only with a break over long gaps; every figure is a person's,
// also when Settings shows the whole group; the airline badge reads 4.5:1.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDay, loadDay, RETRY_MS } from '../src/lib/flights/useLiveFlights.js';
import { fareDays, stripColumns, pairFigure } from '../src/lib/flights/fareDays.js';
import { airlineColour, contrast } from '../src/lib/flights/airlineColours.js';
import { flightPerSeat } from '../src/lib/party.js';
import { LIVE_MAX } from '../functions/api/flights.js';
import { MAX_FLIGHTS } from '../workers/shared/flightSearch.mjs';

const answer = { checked: '2026-11-20T09:00:00Z', flights: [{ price: 44, airline: 'FR', dep: '07:05', arr: '09:15', stops: 0, min: 130 }] };
const reply = (status, body = answer, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});
const queue = (...replies) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetchImpl, calls };
};
const q = { o: 'BRU', d: 'FCO', date: '2026-12-05' };

test('requestDay names what happened: ok, upstream, rate, broken, offline', async () => {
  assert.equal((await requestDay('BRU', 'FCO', '2026-12-05', queue(reply(200)).fetchImpl)).status, 'ok');
  assert.equal((await requestDay('BRU', 'FCO', '2026-12-05', queue(reply(502)).fetchImpl)).status, 'upstream');
  const rate = await requestDay('BRU', 'FCO', '2026-12-05', queue(reply(429, null, { 'retry-after': '3' })).fetchImpl);
  assert.deepEqual([rate.status, rate.retryAfter], ['rate', 3]);
  // A server without the Function hands back index.html: not JSON.
  assert.equal((await requestDay('BRU', 'FCO', '2026-12-05', queue(reply(200, '<!doctype html>')).fetchImpl)).status, 'broken');
  assert.equal((await requestDay('BRU', 'FCO', '2026-12-05', queue(new TypeError('offline')).fetchImpl)).status, 'offline');
});

test('a failed day retries once by itself after RETRY_MS, then stops', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const ok = queue(reply(502), reply(200));
  const won = await loadDay(q, { fetchImpl: ok.fetchImpl, wait });
  assert.deepEqual([won.status, won.tries, won.answer.flights.length], ['ok', 2, 1]);
  assert.deepEqual(waits, [RETRY_MS]);
  assert.equal(ok.calls.length, 2);

  const bad = queue(reply(502), reply(502), reply(200));
  const lost = await loadDay(q, { fetchImpl: bad.fetchImpl, wait });
  assert.deepEqual([lost.status, lost.tries, lost.answer], ['upstream', 2, null]);
  assert.equal(bad.calls.length, 2, 'never a third request: the Try again button is the traveller\'s');
});

test('a 429 is retried only after a short retry-after, never at once', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const short = queue(reply(429, null, { 'retry-after': '2' }), reply(200));
  assert.equal((await loadDay(q, { fetchImpl: short.fetchImpl, wait })).status, 'ok');
  assert.deepEqual(waits, [2000]);
  const long = queue(reply(429, null, { 'retry-after': '60' }), reply(200));
  const r = await loadDay(q, { fetchImpl: long.fetchImpl, wait });
  assert.deepEqual([r.status, r.tries, long.calls.length], ['rate', 1, 1]);
});

test('the bars are fresh fares only, in date order, with a break over a gap of more than 7 days', () => {
  const NOW = Date.parse('2026-11-20T12:00:00Z');
  const fresh = Math.round((NOW - 3600000) / 60000);
  const file = {
    from: 'BRU',
    to: {
      FCO: {
        '2026-12-09': [40, 'FR', '07:05', '09:15', 0, fresh],
        '2026-12-01': [61, 'FR', '07:05', '09:15', 0, fresh],
        '2026-12-04': null, // a swept null: maybe a direct-only search, so no "no flight"
        '2026-12-24': [32, 'W6', '21:55', '23:59', 0, fresh],
      },
    },
  };
  const days = fareDays(file, 'out', 'FCO', { from: '2026-11-21', to: '2027-02-01', now: NOW });
  const cols = stripColumns(days);
  assert.deepEqual(cols.map((c) => (c.gap ? `gap ${c.days}` : c.date)), ['2026-12-01', 'gap 7', '2026-12-09', 'gap 14', '2026-12-24']);
  assert.ok(cols.every((c) => c.gap || c.state === 'fare'));
  assert.deepEqual(stripColumns([]), []);
});

test('per person in group view: the pair figure is one person\'s, never times the seats', () => {
  const out = { date: '2026-12-05', price: 44, airline: 'FR', dep: '07:05', arr: '09:15', stops: 0 };
  const back = { date: '2026-12-12', price: 57, airline: 'FR', dep: '10:40', arr: '12:50', stops: 0 };
  const party = { adults: 4, seats: 4 };
  const fig = pairFigure(out, back, { party, bagKey: 'small' });
  assert.equal(fig.perPerson, flightPerSeat(fig.perSeat, party));
  assert.equal(fig.shown, fig.perPerson);
  // The group figure exists for other callers; the screen never asks for it.
  assert.equal(pairFigure(out, back, { party, bagKey: 'small', group: true }).shown, Math.round(fig.perPerson * 4 * 100) / 100);
});

test('the live day asks for every flight; the sweep keeps its cap', () => {
  assert.ok(LIVE_MAX > MAX_FLIGHTS);
  assert.equal(MAX_FLIGHTS, 12);
});

test('every airline badge reads at 4.5:1 or more; an unknown code is the house umber', () => {
  for (const code of ['FR', 'U2', 'W6', 'VY', 'KL', 'HV', 'PC', 'BT', 'V7', 'XQ', 'D8', 'ZZ', '', null]) {
    const { bg, ink } = airlineColour(code);
    assert.ok(contrast(bg, ink) >= 4.5, `${code}: ${bg} on ${ink} is ${contrast(bg, ink).toFixed(2)}`);
  }
  assert.equal(airlineColour('ZZ').bg, '#73321a'); // the house's deepest terracotta since K1 step C
  assert.equal(airlineColour('fr').bg, airlineColour('FR').bg);
});
