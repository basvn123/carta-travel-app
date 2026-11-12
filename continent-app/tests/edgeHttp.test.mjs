// T1079 (C5): the Edge Functions' shared HTTP guards
// (supabase/functions/_shared/http.mjs) and a static contract over every
// function's source: CORS allow-list, capped body, no upstream message in a
// response, the Stripe webhook's signature check and idempotency key.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  allowedOrigin, withCors, readJson, bodyProblem, secretMatches, BodyError, APP_ORIGINS, securityEvent,
} from '../../supabase/functions/_shared/http.mjs';

const post = (body, headers = {}) => new Request('https://x/f', { method: 'POST', body, headers });

test('allowedOrigin passes the app origins, previews and localhost, and nothing else', () => {
  for (const o of APP_ORIGINS) assert.equal(allowedOrigin(o), o);
  assert.equal(allowedOrigin('https://abc123.carta-app.pages.dev'), 'https://abc123.carta-app.pages.dev');
  assert.equal(allowedOrigin('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(allowedOrigin('http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  for (const bad of ['https://evil.example', 'https://carta-europetravel.com.evil.example', 'http://www.carta-europetravel.com',
    'https://carta-app.pages.dev.evil.example', 'https://evilcarta-app.pages.dev', 'null', '', undefined, 'http://localhost.evil.example']) {
    assert.equal(allowedOrigin(bad), '', String(bad));
  }
  assert.equal(allowedOrigin('https://staging.example', 'https://staging.example/, https://b.example'), 'https://staging.example');
});

test('withCors answers a preflight for an app origin and refuses a foreign one', async () => {
  const h = withCors(async () => new Response('no'));
  const ok = await h(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://www.carta-europetravel.com' } }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://www.carta-europetravel.com');
  assert.match(ok.headers.get('access-control-allow-headers'), /authorization/);
  assert.equal(ok.headers.get('vary'), 'Origin');
  const foreign = await h(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});

test('withCors never sends a wildcard and drops one the handler set', async () => {
  const h = withCors(async () => new Response('x', { headers: { 'Access-Control-Allow-Origin': '*' } }));
  const foreign = await h(new Request('https://x/f', { headers: { origin: 'https://evil.example' } }));
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  const server = await h(new Request('https://x/f'));
  assert.equal(server.headers.get('access-control-allow-origin'), null, 'no Origin: nothing to allow');
  const app = await h(new Request('https://x/f', { headers: { origin: 'http://localhost:5173' } }));
  assert.equal(app.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('withCors turns an escaped exception into a fixed 500 without the message', async () => {
  const h = withCors(async () => { throw new Error('secret db detail'); });
  const r = await h(new Request('https://x/f'));
  assert.equal(r.status, 500);
  assert.equal(await r.text(), JSON.stringify({ code: 'server' }));
});

test('a refused request logs one security event with no credential in it (T1211, T1164-i)', async () => {
  const lines = [];
  const warn = console.warn;
  console.warn = (l) => lines.push(l);
  try {
    const refuse = withCors(async () => new Response('{}', { status: 401 }));
    await refuse(new Request('https://x.supabase.co/functions/v1/plan-day', {
      method: 'POST', headers: { authorization: 'Bearer secret.token.value', origin: 'https://evil.example' } }));
    const ok = withCors(async () => new Response('{}', { status: 200 }));
    await ok(new Request('https://x/functions/v1/plan-day', { method: 'POST' }));
  } finally { console.warn = warn; }
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes('secret.token.value'));
  const e = JSON.parse(lines[0]);
  assert.deepEqual({ ...e, at: 'x' }, { carta_security: 'auth_refused', fn: 'plan-day', method: 'POST', status: 401,
    credential: 'bearer', app_origin: false, at: 'x' });
  const out = [];
  securityEvent(new Request('https://x/functions/v1/notify'), 403, 'https://www.carta-europetravel.com', (l) => out.push(JSON.parse(l)));
  assert.equal(out[0].credential, 'none');
  assert.equal(out[0].app_origin, true);
});

test('readJson reads an object and refuses oversize, non-object and malformed bodies', async () => {
  assert.deepEqual(await readJson(post('{"a":1}'), 100), { a: 1 });
  await assert.rejects(readJson(post('{"a":1}'), 3), (e) => e instanceof BodyError && e.code === 'too_large');
  await assert.rejects(readJson(post('{"pad":"' + 'x'.repeat(200) + '"}'), 100), (e) => e.code === 'too_large');
  await assert.rejects(readJson(post('{"a":1}', { 'content-length': '999999' }), 100), (e) => e.code === 'too_large', 'declared length');
  for (const bad of ['', 'nope', '[1,2]', 'null', '"s"', '12']) {
    await assert.rejects(readJson(post(bad), 100), (e) => e.code === 'bad_json', JSON.stringify(bad));
  }
  assert.deepEqual(bodyProblem(new BodyError('too_large')), { status: 413, code: 'too_large' });
  assert.deepEqual(bodyProblem(new BodyError('bad_json')), { status: 400, code: 'bad_json' });
  assert.deepEqual(bodyProblem(new Error('x')), { status: 400, code: 'bad_json' });
});

test('secretMatches is true only for the exact secret', async () => {
  assert.equal(await secretMatches('s3cret', 's3cret'), true);
  assert.equal(await secretMatches('s3cret ', 's3cret'), false);
  assert.equal(await secretMatches('', 's3cret'), false);
  assert.equal(await secretMatches('s3cret', ''), false, 'an unset secret never matches');
  assert.equal(await secretMatches(undefined, 's3cret'), false);
});

const dir = new URL('../../supabase/functions/', import.meta.url);
const src = (n) => fs.readFileSync(new URL(`${n}/index.ts`, dir), 'utf8');
const WRAPPED = ['checkout', 'notify', 'parse-booking', 'plan-day', 'suggest-city'];

test('every browser-facing function wraps its handler in withCors and reads a capped body', () => {
  for (const n of WRAPPED) {
    const s = src(n);
    assert.match(s, /Deno\.serve\(withCors\(/, `${n} is not wrapped`);
    assert.match(s, /readJson\(req, MAX_BODY\)/, `${n} reads an uncapped body`);
    assert.match(s, /const MAX_BODY = \d/, `${n} has no body cap`);
    assert.doesNotMatch(s, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/, `${n} allows every origin`);
    assert.doesNotMatch(s, /req\.json\(\)/, `${n} still parses the body unbounded`);
  }
});

test('no function puts an upstream or database message in a response', () => {
  for (const n of [...WRAPPED, 'stripe-webhook', 'upload-scan']) {
    const s = src(n);
    assert.doesNotMatch(s, /json\(\d+,\s*\{[^}]*message:\s*\(?(err|error|e|canErr|entErr)/, `${n} echoes an error message`);
    assert.doesNotMatch(s, /new Response\(`[^`]*\$\{[^}]*(message|err)/i, `${n} echoes an error into a response body`);
  }
});

test('the functions that need a signed-in traveller resolve the JWT before any work', () => {
  for (const n of ['checkout', 'parse-booking', 'plan-day', 'suggest-city']) {
    const s = src(n);
    const auth = s.indexOf('auth.getUser()');
    assert.ok(auth > 0, `${n} never checks the user`);
    assert.ok(auth < s.indexOf('readJson(req'), `${n} reads the body before it checks who is asking`);
    assert.match(s, /json\(401, \{ code: 'auth' \}\)/);
  }
});

test('notify compares its secret in constant time', () => {
  const s = src('notify');
  assert.match(s, /secretMatches\(/);
  assert.doesNotMatch(s, /x-notify-secret'\) [!=]==/);
});

test('the Stripe webhook verifies the signature on the raw body before it parses or writes, and grants by session id', () => {
  const s = src('stripe-webhook');
  const sig = s.indexOf('constructEventAsync(raw');
  assert.ok(sig > 0, 'no signature verification');
  assert.ok(s.indexOf('req.text()') < sig, 'the raw body is read before the check');
  assert.ok(sig < s.indexOf("service.rpc("), 'a database call comes before the signature check');
  assert.match(s, /status: 400/);
  assert.match(s, /p_session_id: session\.id/, 'the grant is keyed on the checkout session (the ledger makes a replay a no-op)');
  const ledger = fs.readFileSync(new URL('../../supabase/migrations/007_passes.sql', import.meta.url), 'utf8');
  assert.match(ledger, /idempotent/i);
});
