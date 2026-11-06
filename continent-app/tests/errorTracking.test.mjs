// T1120 (H2): a seeded error produces a scrubbed event; nothing is sent without a DSN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureError, trackingConfig, resetReporter } from '../src/lib/errorReporter.js';
import { buildEvent, buildEnvelope, parseDsn, scrubText, stripUrl, sampled } from '../src/lib/errorEvent.js';
import { captureFunctionError, withTracking } from '../functions/_lib/track.js';

const DSN = 'https://abc123@o42.ingest.de.sentry.io/777';
const seeded = () => {
  const e = new Error('Failed for jane.doe@example.com at https://carta.app/trip?token=SECRET&x=1#/trip/abc from 203.0.113.9 key eyJhbGciOiJI.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4');
  e.stack = `Error: x\n    at Foo (https://carta.app/assets/index-1.js?v=2:10:5)\n    at https://carta.app/assets/index-1.js:20:7`;
  return e;
};
const wire = (body) => body.split('\n').map((l) => JSON.parse(l));

test('seeded error becomes a scrubbed event', () => {
  resetReporter();
  const sent = [];
  const ok = captureError(seeded(), { source: 'boundary', name: 'explore', over: { VITE_ERROR_DSN: DSN, VITE_ERROR_SAMPLE: '1' }, transport: (u, b) => sent.push([u, b]) });
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  const [url, body] = sent[0];
  assert.match(url, /^https:\/\/o42\.ingest\.de\.sentry\.io\/api\/777\/envelope\/\?sentry_key=abc123/);
  for (const bad of ['jane.doe', 'SECRET', 'token=', '203.0.113.9', 'eyJhbGci', '#/trip']) assert.ok(!body.includes(bad), bad);
  const [, , ev] = wire(body);
  assert.equal(ev.user, undefined); assert.equal(ev.request, undefined); assert.equal(ev.breadcrumbs, undefined);
  assert.equal(ev.tags.name, 'explore');
  assert.match(ev.exception.values[0].value, /\[email\]/);
  assert.equal(ev.exception.values[0].stacktrace.frames[1].filename, '/assets/index-1.js');
});

test('nothing is sent without a DSN, with the kill switch, or with a bad DSN', () => {
  for (const over of [{}, { VITE_ERROR_DSN: '' }, { VITE_ERROR_DSN: 'nope' }, { VITE_ERROR_DSN: 'http://k@h/1' },
    { VITE_ERROR_DSN: DSN, VITE_ERROR_TRACKING: 'off' }, { VITE_ERROR_DSN: DSN, VITE_ERROR_SAMPLE: '0' }]) {
    resetReporter();
    let n = 0;
    assert.equal(captureError(seeded(), { over, transport: () => { n++; } }), false);
    assert.equal(n, 0);
  }
  assert.equal(trackingConfig({}), null);
});

test('dedupe and per-load cap', () => {
  resetReporter();
  const over = { VITE_ERROR_DSN: DSN, VITE_ERROR_SAMPLE: '1' };
  let n = 0; const t = () => { n++; };
  const same = new Error('same');
  assert.equal(captureError(same, { over, transport: t }), true);
  assert.equal(captureError(same, { over, transport: t }), false);
  for (let i = 0; i < 10; i++) captureError(new Error(`other ${i}`), { over, transport: t });
  assert.equal(n, 5);
});

test('scrub helpers', () => {
  assert.equal(stripUrl('https://a.b/c?d=1#e'), 'https://a.b/c');
  assert.equal(scrubText('word '.repeat(100)).length, 303);
  assert.equal(parseDsn('https://k@h.io/12').endpoint, 'https://h.io/api/12/envelope/?sentry_key=k&sentry_version=7');
  assert.equal(sampled(1), true); assert.equal(sampled(0), false); assert.equal(sampled(0.5, () => 0.1), true);
  const env = buildEnvelope(buildEvent(new Error('a')), DSN);
  assert.equal(wire(env).length, 3);
});

test('function errors: scrubbed, no query, no-op without DSN', async () => {
  const sent = [];
  const request = new Request('https://carta.app/api/ask?q=my%20secret%20trip', { headers: { 'cf-connecting-ip': '198.51.100.4', cookie: 'a=b' } });
  const env = { SENTRY_DSN: DSN, CF_PAGES_COMMIT_SHA: 'abc', CF_PAGES_BRANCH: 'main' };
  await captureFunctionError(seeded(), { env, request, name: 'api/ask', transport: (u, b) => sent.push(b) });
  assert.equal(sent.length, 1);
  for (const bad of ['secret', '198.51.100.4', 'cookie', 'jane.doe']) assert.ok(!sent[0].includes(bad), bad);
  assert.equal(wire(sent[0])[2].tags.path, '/api/ask');
  assert.equal(captureFunctionError(seeded(), { env: {}, request, transport: () => assert.fail('sent') }), null);
  assert.equal(captureFunctionError(seeded(), { env: { ...env, SENTRY_OFF: '1' }, request, transport: () => assert.fail('sent') }), null);
});

test('withTracking answers 500 or the fallback, passes normal responses', async () => {
  const request = new Request('https://carta.app/api/x');
  const ok = await withTracking('x', async () => new Response('fine'))({ request, env: {} });
  assert.equal(await ok.text(), 'fine');
  const bad = await withTracking('x', async () => { throw new Error('boom'); })({ request, env: {} });
  assert.equal(bad.status, 500);
  assert.deepEqual(await bad.json(), { error: 'server' });
  const fb = await withTracking('x', async () => { throw new Error('boom'); }, { fallback: () => new Response('next') })({ request, env: {} });
  assert.equal(await fb.text(), 'next');
});
