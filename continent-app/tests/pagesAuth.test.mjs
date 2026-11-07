// T1164 (C10): auth tests for the Cloudflare Pages Functions. They are
// anonymous by design (flight prices, forecasts, Ask: public data, guarded by
// validation and the rate limit, T1079 and T1157), so the security property
// is the opposite one: a caller's credential changes nothing and is never
// forwarded to an upstream, and no Pages Function holds a Supabase key or
// reads a user token. Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as flights from '../functions/api/flights.js';
import * as forecast from '../functions/api/forecast.js';

const CREDS = {
  authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.c2ln',
  cookie: 'sb-access-token=eyJhbGciOiJIUzI1NiJ9.x.y; sb-refresh-token=r',
  apikey: 'service-role-guess',
};

async function withFetch(answer, run) {
  const real = globalThis.fetch;
  const realCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input?.url || input), headers: Object.fromEntries(new Headers(init.headers || {}).entries()) });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try { return { out: await run(), calls }; } finally { globalThis.fetch = real; globalThis.caches = realCaches; }
}

const day = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const ROUTES = {
  forecast: { mod: forecast, url: 'https://x/api/forecast?lat=46.54&lon=7.98' },
  flights: { mod: flights, url: `https://x/api/flights?o=BRU&d=BCN&date=${day}` },
};

for (const [name, { mod, url }] of Object.entries(ROUTES)) {
  test(`${name}: a credential on the request changes nothing and never reaches the upstream`, async () => {
    const run = (headers) => withFetch({}, async () => {
      const r = await mod.onRequestGet({ request: new Request(url, { headers }), env: {}, waitUntil() {} });
      return { status: r.status, body: await r.text() };
    });
    const anon = await run({});
    const creds = await run(CREDS);
    assert.deepEqual(creds.out, anon.out, `${name} answered differently with a credential`);
    assert.ok(creds.calls.length > 0 || anon.out.status !== 200, `${name}: no upstream call to inspect`);
    for (const c of creds.calls) {
      // Values, not names: the flights client sends its own consent cookie
      // (SOCS), which is fine; the caller's cookie or token must never ride along.
      const sent = JSON.stringify(c);
      for (const [h, v] of Object.entries(CREDS)) {
        for (const piece of v.split(/[ ;=]+/).filter((x) => x.length > 8)) assert.ok(!sent.includes(piece), `${name} forwarded the caller's ${h} to ${c.url}`);
      }
      assert.ok(!('authorization' in c.headers) && !('apikey' in c.headers), `${name} sent an auth header upstream`);
    }
  });
}

function sources(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = `${dir}/${n}`;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(m?js|ts)$/.test(n)) out.push(p);
  }
  return out;
}

test('no Pages Function reads a user token or cookie, or holds a Supabase key', () => {
  const root = new URL('../functions', import.meta.url).pathname;
  const files = sources(root);
  assert.ok(files.length >= 10, `only ${files.length} function files found`);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/headers\.get\(\s*['"](authorization|cookie)['"]/i.test(src), `${f} reads a credential header`);
    // One known holder (T1139): the AI event sink writes ai_model_events with
    // the service role. Pinned here so no second use appears unreviewed; the
    // least-privilege fix is register row T1164-c.
    if (f.endsWith('/_lib/aiEvents.mjs')) {
      assert.equal((src.match(/SUPABASE_SERVICE_ROLE_KEY'\)/g) || []).length, 1, 'aiEvents reads the service key more than once');
      assert.equal((src.match(/\/rest\/v1\/[a-z_]+/g) || []).join(), '/rest/v1/ai_model_events', 'aiEvents writes beyond ai_model_events');
    } else {
      assert.ok(!/SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|service_role/.test(src), `${f} names a service-role key`);
    }
    assert.ok(!/supabase-js|createClient\(/.test(src), `${f} opens a Supabase client`);
  }
});
