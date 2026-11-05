// T1090 (ROADMAP C5): the CSP's style-src carries no 'unsafe-inline', and the
// hashes it does carry are those of the two <style> blocks the app writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expectedStyleSrc, shippedStyleSrc, HEADERS } from '../scripts/csp-hashes.mjs';

const headers = fs.readFileSync(HEADERS, 'utf8');
const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)[1];

test('no directive of the shipped CSP allows unsafe-inline', () => {
  assert.doesNotMatch(csp, /'unsafe-inline'/);
});

test('style-src is self plus the hashes of the print and prerender stylesheets', async () => {
  assert.equal(shippedStyleSrc(headers), await expectedStyleSrc(),
    'stale style-src: run node scripts/csp-hashes.mjs --write');
});

test('the CSP line stays under the Pages 2,000 character header limit', () => {
  assert.ok(csp.length < 2000, `CSP is ${csp.length} characters`);
});

// Static guard for code paths no screen of verify_csp.mjs reaches: an inline
// style="" in an HTML string, a setAttribute('style'), or a new <style>
// element is refused under this policy. Style through the CSSOM instead
// (el.style.x = ..., a React style prop), which no style-src governs. The one
// <style> the app writes is the print view's, whose hash is in the policy.
test('no source file writes an inline style the CSP would refuse', async () => {
  const { readdirSync, readFileSync, statSync } = fs;
  const path = await import('node:path');
  const root = new URL('../src/', import.meta.url).pathname;
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(n)) files.push(p);
  });
  walk(root);
  const bad = [];
  const rules = [
    [/style=\\?["']|style=\$\{/, 'style="" in a string'],
    [/setAttribute\(\s*['"`]style['"`]/, "setAttribute('style')"],
    [/createElement\(\s*['"`]style['"`]/, "createElement('style')"],
    [/<style[\s>]/, '<style> element'],
  ];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const [re, what] of rules) {
        if (!re.test(line)) continue;
        if (what === '<style> element' && f.endsWith('lib/tripExport.js') && line.includes('<style>${PRINT_CSS}</style>')) continue;
        bad.push(`${path.relative(root, f)}:${i + 1} ${what}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
