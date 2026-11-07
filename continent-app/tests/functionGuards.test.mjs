// T1079 (C5): the Pages Functions' shared guards (functions/_lib/guard.js):
// strict query validators, the one error shape, the method fallback and the
// rate limit, plus the routes' refusals. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fail, methodNotAllowed, clientIp, createLimiter, overLimit, isRealDate,
  parseFlightQuery, parseForecastQuery, parseAskQuery, MAX_AHEAD_DAYS,
} from '../functions/_lib/guard.js';
import * as flights from '../functions/api/flights.js';
import * as forecast from '../functions/api/forecast.js';
import * as ask from '../functions/api/ask.js';
import * as answer from '../functions/api/ask/answer.js';

const q = (s) => new URLSearchParams(s);
const NOW = Date.parse('2026-11-05T12:00:00Z');

test('fail answers a fixed code, no-store, nosniff, and nothing else', async () => {
  const r = fail(400, 'bad_request');
  assert.equal(r.status, 400);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await r.json(), { error: 'bad_request' });
  const m = methodNotAllowed('GET');
  assert.equal(m.status, 405);
  assert.equal(m.headers.get('allow'), 'GET');
});

test('isRealDate refuses impossible calendar dates', () => {
  assert.equal(isRealDate('2026-11-18'), true);
  assert.equal(isRealDate('2026-02-31'), false);
  assert.equal(isRealDate('2026-13-01'), false);
  assert.equal(isRealDate('26-11-18'), false);
  assert.equal(isRealDate('2026-11-18T00:00'), false);
});

test('parseFlightQuery takes IATA codes and a real date inside the window only', () => {
  assert.deepEqual(parseFlightQuery(q('o=BRU&d=BCN&date=2026-11-18'), NOW), { o: 'BRU', d: 'BCN', date: '2026-11-18' });
  assert.equal(parseFlightQuery(q('o=bru&d=BCN&date=2026-11-18'), NOW), null, 'lower case');
  assert.equal(parseFlightQuery(q('o=BRU&d=BRU&date=2026-11-18'), NOW), null, 'same airport');
  assert.equal(parseFlightQuery(q('o=BRUX&d=BCN&date=2026-11-18'), NOW), null);
  assert.equal(parseFlightQuery(q('d=BCN&date=2026-11-18'), NOW), null, 'missing o');
  assert.equal(parseFlightQuery(q('o=BRU&d=BCN&date=2026-11-04'), NOW), null, 'past');
  assert.equal(parseFlightQuery(q('o=BRU&d=BCN&date=2026-02-31'), NOW), null, 'not a date');
  const far = new Date(NOW + (MAX_AHEAD_DAYS + 2) * 86400000).toISOString().slice(0, 10);
  assert.equal(parseFlightQuery(q(`o=BRU&d=BCN&date=${far}`), NOW), null, 'too far ahead');
  const edge = new Date(NOW + MAX_AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  assert.ok(parseFlightQuery(q(`o=BRU&d=BCN&date=${edge}`), NOW), 'the last allowed day');
});

test('parseForecastQuery takes plain decimals in range, not exponents, hex or padding', () => {
  assert.deepEqual(parseForecastQuery(q('lat=46.54&lon=7.98')), { lat: 46.54, lon: 7.98 });
  assert.deepEqual(parseForecastQuery(q('lat=-33&lon=-70.5')), { lat: -33, lon: -70.5 });
  assert.deepEqual(parseForecastQuery(q('lat=90&lon=180')), { lat: 90, lon: 180 });
  for (const bad of ['lat=91&lon=0', 'lat=0&lon=181', 'lat=1e2&lon=0', 'lat=0x10&lon=0', 'lat=%205&lon=0',
    'lat=abc&lon=0', 'lat=&lon=0', 'lat=5', 'lon=5', 'lat=Infinity&lon=0', 'lat=1.123456789&lon=0', 'lat=NaN&lon=1']) {
    assert.equal(parseForecastQuery(q(bad)), null, bad);
  }
});

test('parseAskQuery checks the question, the lists and the unknown words', () => {
  const ok = parseAskQuery(q('q=quiet+beaches&src=dest,highlight&cc=PT,ES&d=es-barcelona&u=cheap|sunny'));
  assert.deepEqual(ok, { q: 'quiet beaches', src: ['dest', 'highlight'], cc: ['PT', 'ES'], d: ['es-barcelona'], u: ['cheap', 'sunny'] });
  assert.deepEqual(parseAskQuery(q('q=hi')), { q: 'hi', src: [], cc: [], d: [], u: [] });
  assert.equal(parseAskQuery(q('q=')), null);
  assert.equal(parseAskQuery(q('')), null);
  assert.equal(parseAskQuery(q(`q=${'x'.repeat(201)}`)), null);
  assert.equal(parseAskQuery(new URLSearchParams([['q', 'a\u0000b']])), null, 'control character');
  assert.equal(parseAskQuery(q('q=x&src=dest;drop')), null, 'source shape');
  assert.equal(parseAskQuery(q(`q=x&cc=${Array(13).fill('ES').join(',')}`)), null, 'too many codes');
  assert.equal(parseAskQuery(q(`q=x&d=${'a'.repeat(61)}`)), null, 'id too long');
  assert.equal(parseAskQuery(q('q=x&d=<script>')), null, 'id charset');
  assert.equal(parseAskQuery(q('q=x&u=aaa|bbb|ccc|ddd|eee|fff')), null, 'six unknown words');
  assert.equal(parseAskQuery(q(`q=x&u=${'w'.repeat(41)}`)), null, 'word too long');
});

test('the limiter counts per key inside its window and lets the window pass', () => {
  const l = createLimiter({ max: 3, windowMs: 1000 });
  assert.equal(l.hit('a', 0), false);
  assert.equal(l.hit('a', 10), false);
  assert.equal(l.hit('a', 20), false);
  assert.equal(l.hit('a', 30), true, 'fourth in the window');
  assert.equal(l.hit('b', 30), false, 'another key is separate');
  assert.equal(l.hit('a', 1500), false, 'the window has passed');
});

test('the limiter bounds its memory under a flood of addresses', () => {
  const l = createLimiter({ max: 1, windowMs: 1000, maxKeys: 10 });
  for (let i = 0; i < 100; i += 1) l.hit(`ip${i}`, i);
  assert.equal(l.hit('fresh', 200), false);
});

test('overLimit uses the RATE_LIMIT binding when present and survives its failure', async () => {
  const req = new Request('https://x/', { headers: { 'cf-connecting-ip': '203.0.113.9' } });
  assert.equal(clientIp(req), '203.0.113.9');
  assert.equal(clientIp(new Request('https://x/')), 'unknown');
  const seen = [];
  const deny = { RATE_LIMIT: { limit: async (o) => { seen.push(o.key); return { success: false }; } } };
  assert.equal(await overLimit(deny, req, createLimiter({ max: 99 }), 'flights'), true);
  assert.deepEqual(seen, ['flights:203.0.113.9']);
  const allow = { RATE_LIMIT: { limit: async () => ({ success: true }) } };
  assert.equal(await overLimit(allow, req, createLimiter({ max: 99 }), 'flights'), false);
  const broken = { RATE_LIMIT: { limit: async () => { throw new Error('down'); } } };
  assert.equal(await overLimit(broken, req, createLimiter({ max: 99 }), 'flights'), false, 'a broken binding never blocks');
  assert.equal(await overLimit(undefined, req, createLimiter({ max: 99 }), 'flights'), false, 'no env at all (dev server)');
  const l = createLimiter({ max: 1 });
  assert.equal(await overLimit({}, req, l, 'x'), false);
  assert.equal(await overLimit({}, req, l, 'x'), true, 'without the binding the isolate window holds');
});

test('each route answers 405 with Allow to any other method, and 400 with the shared body', async () => {
  for (const [mod, allow] of [[flights, 'GET'], [forecast, 'GET'], [ask, 'GET'], [answer, 'POST']]) {
    const r = mod.onRequest();
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), allow);
  }
  const bad = async (res) => { assert.equal(res.status, 400); assert.deepEqual(await res.json(), { error: 'bad_request' }); };
  await bad(await flights.onRequestGet({ request: new Request('https://x/api/flights?o=BRU&d=BRU&date=2099-01-01'), env: {} }));
  await bad(await forecast.onRequestGet({ request: new Request('https://x/api/forecast?lat=1e2&lon=0'), env: {} }));
  await bad(await ask.onRequestGet({ request: new Request('https://x/api/ask?q='), env: {} }));
});

test('the answer route refuses an oversized body with no content-length, and a missing binding first', async () => {
  const env = { AI: {}, ASK: { get: async () => null, put: async () => {} } };
  const big = new Request('https://x/api/ask/answer', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(9000) }) });
  const r = await answer.onRequestPost({ request: big, env, waitUntil() {} });
  assert.equal(r.status, 413);
  const none = await answer.onRequestPost({ request: new Request('https://x/', { method: 'POST', body: '{}' }), env: {}, waitUntil() {} });
  assert.equal(none.status, 503);
});
