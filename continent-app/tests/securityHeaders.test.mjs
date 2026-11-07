// T1079 (C5): the "/*" stanza of public/_headers is the only place the
// security headers are set, so a test reads it and pins what must hold.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const text = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const lines = text.split(/\r?\n/);

/** The headers of one stanza, by lower-cased name. */
function stanza(path) {
  const at = lines.findIndex((l) => l.trim() === path);
  assert.ok(at >= 0, `no ${path} stanza`);
  const out = {};
  for (let i = at + 1; i < lines.length && /^\s+\S/.test(lines[i]); i += 1) {
    const m = lines[i].match(/^\s+([A-Za-z-]+):\s*(.+?)\s*$/);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

const site = stanza('/*');
const csp = Object.fromEntries(site['content-security-policy'].split(';').map((d) => {
  const [name, ...vals] = d.trim().split(/\s+/);
  return [name, vals];
}));

test('the site-wide stanza sets the security headers and no Cache-Control', () => {
  for (const h of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy',
    'permissions-policy', 'strict-transport-security', 'cross-origin-opener-policy']) {
    assert.ok(site[h], `missing ${h}`);
  }
  assert.equal(site['cache-control'], undefined, 'a Cache-Control here would join every path rule');
  assert.equal(site['x-content-type-options'], 'nosniff');
  assert.equal(site['x-frame-options'], 'DENY');
  assert.equal(site['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(site['cross-origin-opener-policy'], 'same-origin-allow-popups');
});

test('HSTS lasts at least a year, covers subdomains and asks for preload', () => {
  const v = site['strict-transport-security'];
  assert.ok(Number(v.match(/max-age=(\d+)/)[1]) >= 31536000);
  assert.match(v, /includeSubDomains/);
  assert.match(v, /preload/);
});

test('the permissions policy denies the features the app never uses', () => {
  const v = site['permissions-policy'];
  for (const f of ['camera', 'microphone', 'payment', 'usb', 'bluetooth', 'serial', 'accelerometer', 'gyroscope', 'display-capture']) {
    assert.match(v, new RegExp(`${f}=\\(\\)`), f);
  }
  assert.match(v, /geolocation=\(self\)/, 'the From picker uses geolocation');
});

test('the CSP has no script escape hatch and locks framing, plugins and forms', () => {
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  assert.ok(!csp['script-src'].includes("'unsafe-eval'"));
  assert.ok(!csp['script-src'].some((x) => x === '*' || x.startsWith('http')), 'scripts come from self only');
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.deepEqual(csp['form-action'], ["'self'"]);
  assert.ok('upgrade-insecure-requests' in csp);
});

test('connect-src carries no host nothing calls (no websocket host, no bare wildcard)', () => {
  const c = csp['connect-src'];
  assert.ok(c.length > 3, 'vacuous: connect-src is empty');
  assert.ok(!c.some((x) => x.startsWith('wss:')), 'no code opens a websocket; add the host with the feature');
  assert.ok(!c.includes('*') && !c.includes('https:') && !c.includes('http:'));
  assert.ok(c.every((x) => x === "'self'" || x.startsWith('https://')), 'https only');
});

test('every wildcard host in the CSP is on the reviewed list', () => {
  const reviewed = new Set(['https://*.cartocdn.com', 'https://*.supabase.co', 'https://*.wikipedia.org']);
  const wild = Object.values(csp).flat().filter((x) => x.includes('*'));
  assert.ok(wild.length > 0);
  for (const w of wild) assert.ok(reviewed.has(w), `${w} is a new wildcard: review it and add it here`);
});
