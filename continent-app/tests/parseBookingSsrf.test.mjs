// T1211 (register row T1164-m): the parse-booking SSRF guard. The URL a
// traveller pastes is fetched server-side, so every hop must resolve to a
// public address: literal private IPs (v4, v6, IPv4-mapped v6), a public
// name that resolves to a private address (DNS rebinding), a redirect into
// loopback and a redirect chain that never ends are all refused, and a
// normal public page still loads. The guard (fetchGuard.mjs) takes fetch
// and the DNS resolver as arguments, so these run under Node with stubs;
// the last tests run the real handler (index.ts) through the T1164 loader
// with a stubbed Deno.resolveDns.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateAddress, checkFetchTarget, fetchPublic, MAX_REDIRECTS,
} from '../../supabase/functions/parse-booking/fetchGuard.mjs';
import { JWT_SECRET, resetWorld, loadEdge } from './fixtures/edge-auth/world.mjs';
import { signJwt } from './fixtures/edge-auth/supabase-stub.mjs';

// A fake DNS: name -> { A: [...], AAAA: [...] }. Unknown names fail, as
// Deno.resolveDns rejects with NotFound.
function dns(zone) {
  const calls = [];
  const resolveDns = async (host, type) => {
    calls.push(`${host} ${type}`);
    const rec = zone[host];
    if (!rec || !rec[type] || !rec[type].length) throw new Error('NotFound');
    return rec[type];
  };
  return { resolveDns, calls };
}

// A fake web: url -> Response factory. Records every URL fetched.
function web(pages) {
  const fetched = [];
  const doFetch = async (url, init) => {
    fetched.push(url);
    assert.equal(init.redirect, 'manual', 'redirects must never be followed by fetch itself');
    const page = pages[url];
    if (!page) return new Response('not found', { status: 404 });
    return page();
  };
  return { doFetch, fetched };
}

const redirect = (to, status = 302) => () => new Response(null, { status, headers: { location: to } });
const html = (body) => () => new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });

const PUBLIC_ZONE = {
  'blog.example.com': { A: ['93.184.215.14'], AAAA: ['2606:2800:21f:cb07:6820:80da:af6b:8b2c'] },
  'rebind.example.com': { A: ['10.0.0.5'] },
  'mixed.example.com': { A: ['93.184.215.14', '127.0.0.1'] },
  'v6only-private.example.com': { AAAA: ['fd12:3456::1'] },
  'mapped.example.com': { AAAA: ['::ffff:169.254.169.254'] },
  'hop.example.com': { A: ['93.184.215.15'] },
};

// ---------------------------------------------------------------- addresses

test('isPrivateAddress: private, loopback, link-local, CGNAT, multicast, broadcast and metadata IPv4 are refused', () => {
  for (const ip of ['10.0.0.5', '127.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254',
    '169.254.1.1', '100.64.0.1', '100.127.255.254', '0.0.0.0', '0.1.2.3', '224.0.0.1', '239.255.255.250',
    '255.255.255.255', '240.0.0.1', '198.18.0.1', '192.0.2.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('isPrivateAddress: private IPv6 and IPv4-mapped IPv6 are refused', () => {
  for (const ip of ['::1', '::', '[::1]', 'fc00::1', 'fd12:3456::1', 'fe80::1%eth0', 'ff02::1', 'fec0::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.5', '::ffff:169.254.169.254', '::ffff:7f00:1', '::ffff:a9fe:a9fe',
    '64:ff9b::a00:5', '2002:a00:5::1', '2001:db8::1', '::127.0.0.1', '0:0:0:0:0:ffff:c0a8:0101']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('isPrivateAddress: public addresses pass and junk does not', () => {
  for (const ip of ['93.184.215.14', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
  for (const junk of ['', 'example.com', '1.2.3', '256.1.1.1', '1::2::3', 'gggg::1']) {
    assert.equal(isPrivateAddress(junk), true, `junk ${junk}`);
  }
});

// ---------------------------------------------------------------- one URL

test('checkFetchTarget: literal private IPs (v4, v6, mapped) are refused without a DNS lookup', async () => {
  const { resolveDns, calls } = dns(PUBLIC_ZONE);
  for (const u of ['http://127.0.0.1/x', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data',
    'http://100.64.1.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/']) {
    assert.equal(await checkFetchTarget(u, resolveDns), '', u);
  }
  assert.deepEqual(calls, []);
});

test('checkFetchTarget: a public name that resolves to 10.0.0.5 is refused (DNS rebinding)', async () => {
  const { resolveDns, calls } = dns(PUBLIC_ZONE);
  assert.equal(await checkFetchTarget('https://rebind.example.com/trip', resolveDns), '');
  assert.ok(calls.includes('rebind.example.com A') && calls.includes('rebind.example.com AAAA'));
});

test('checkFetchTarget: one private address among public ones refuses the name; so does a private AAAA', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  assert.equal(await checkFetchTarget('https://mixed.example.com/', resolveDns), '');
  assert.equal(await checkFetchTarget('https://v6only-private.example.com/', resolveDns), '');
  assert.equal(await checkFetchTarget('https://mapped.example.com/', resolveDns), '');
});

test('checkFetchTarget: a name that does not resolve, or no resolver at all, is refused', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  assert.equal(await checkFetchTarget('https://nxdomain.example.com/', resolveDns), '');
  assert.equal(await checkFetchTarget('https://blog.example.com/', undefined), '');
});

test('checkFetchTarget: a public name with public A and AAAA passes', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  assert.equal(await checkFetchTarget('https://blog.example.com/salzburg', resolveDns), 'https://blog.example.com/salzburg');
});

// ---------------------------------------------------------------- the hops

test('fetchPublic: a normal public page is fetched once and returned', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const { doFetch, fetched } = web({ 'https://blog.example.com/salzburg': html('Hotel Sacher, ref ABC123') });
  const got = await fetchPublic('https://blog.example.com/salzburg', { fetch: doFetch, resolveDns });
  assert.equal(got.error, undefined);
  assert.equal(got.response.status, 200);
  assert.match(await got.response.text(), /ABC123/);
  assert.deepEqual(fetched, ['https://blog.example.com/salzburg']);
});

test('fetchPublic: a public redirect to another public host is followed', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const { doFetch, fetched } = web({
    'https://blog.example.com/short': redirect('https://hop.example.com/page'),
    'https://hop.example.com/page': html('ok'),
  });
  const got = await fetchPublic('https://blog.example.com/short', { fetch: doFetch, resolveDns });
  assert.equal(got.url, 'https://hop.example.com/page');
  assert.deepEqual(fetched, ['https://blog.example.com/short', 'https://hop.example.com/page']);
});

test('fetchPublic: a redirect from a public URL to http://127.0.0.1 is refused and never fetched', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const { doFetch, fetched } = web({ 'https://blog.example.com/evil': redirect('http://127.0.0.1/admin') });
  const got = await fetchPublic('https://blog.example.com/evil', { fetch: doFetch, resolveDns });
  assert.deepEqual(got, { error: 'blocked' });
  assert.deepEqual(fetched, ['https://blog.example.com/evil']);
});

test('fetchPublic: a relative redirect is resolved against the current URL; one to a rebinding name is refused', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const { doFetch, fetched } = web({
    'https://blog.example.com/a': redirect('/b', 301),
    'https://blog.example.com/b': redirect('https://rebind.example.com/c', 307),
  });
  const got = await fetchPublic('https://blog.example.com/a', { fetch: doFetch, resolveDns });
  assert.deepEqual(got, { error: 'blocked' });
  assert.deepEqual(fetched, ['https://blog.example.com/a', 'https://blog.example.com/b']);
});

test(`fetchPublic: more than ${MAX_REDIRECTS} redirects are refused`, async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const pages = {};
  for (let i = 0; i < 10; i++) pages[`https://blog.example.com/r${i}`] = redirect(`https://blog.example.com/r${i + 1}`);
  const { doFetch, fetched } = web(pages);
  const got = await fetchPublic('https://blog.example.com/r0', { fetch: doFetch, resolveDns });
  assert.deepEqual(got, { error: 'too_many_redirects' });
  assert.equal(fetched.length, MAX_REDIRECTS + 1);
});

test('fetchPublic: a first URL that fails the check is never fetched', async () => {
  const { resolveDns } = dns(PUBLIC_ZONE);
  const { doFetch, fetched } = web({});
  assert.deepEqual(await fetchPublic('https://rebind.example.com/', { fetch: doFetch, resolveDns }), { error: 'blocked' });
  assert.deepEqual(fetched, []);
});

// ---------------------------------------------------------------- the real handler

const ALICE = '0b9a1f62-1111-4c1d-9a55-aaaaaaaaaaaa';
const bearer = () => `Bearer ${signJwt({ sub: ALICE, role: 'authenticated', aal: 'aal1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET)}`;
const post = (body) => new Request('https://stub.supabase.local/functions/v1/parse-booking', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://www.carta-europetravel.com', Authorization: bearer() },
  body: JSON.stringify(body),
});

test('parse-booking handler: a URL whose name resolves to 10.0.0.5 answers url_unreachable with no fetch and no quota spent', async () => {
  const handler = await loadEdge('parse-booking');
  const w = resetWorld();
  w.users[ALICE] = { email: 'alice@example.test' };
  const { resolveDns, calls } = dns(PUBLIC_ZONE);
  globalThis.Deno.resolveDns = (host, type) => resolveDns(host, type);
  try {
    const res = await handler(post({ url: 'https://rebind.example.com/my-trip' }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'url_unreachable');
    assert.ok(calls.length > 0, 'the handler did not resolve the name');
    assert.deepEqual(w.fetches, [], 'the private address was fetched');
    assert.ok(!w.log.some((e) => e.rpc), 'quota was touched before the URL was checked');
  } finally {
    delete globalThis.Deno.resolveDns;
  }
});

test('parse-booking handler: a public URL redirecting to http://127.0.0.1 answers url_unreachable after one fetch', async () => {
  const handler = await loadEdge('parse-booking');
  const w = resetWorld();
  w.users[ALICE] = { email: 'alice@example.test' };
  const { resolveDns } = dns(PUBLIC_ZONE);
  globalThis.Deno.resolveDns = (host, type) => resolveDns(host, type);
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => { fetched.push(String(url)); return redirect('http://127.0.0.1:8080/')(); };
  try {
    const res = await handler(post({ url: 'https://blog.example.com/x' }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'url_unreachable');
    assert.deepEqual(fetched, ['https://blog.example.com/x']);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.Deno.resolveDns;
  }
});
