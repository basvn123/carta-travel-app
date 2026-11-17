// House style G1 (brand lane): which addresses show the 404. Every path the
// app understands keeps its behaviour; only addresses it cannot read do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isUnknownPath } from '../src/lib/notFound.js';

test('the app root, its files and the language roots are not lost', () => {
  for (const p of ['/', '/index.html', '/404.html', '/nl/', '/nl', '/de/', '/it']) assert.equal(isUnknownPath(p), false, p);
});

test('paths the URL scheme reads keep their behaviour', () => {
  for (const p of ['/spain', '/spain/sevilla', '/nl/spain/sevilla', '/trips/abc123', '/trips/abc123/receipt', '/journeys/alps-week', '/guides/g1']) {
    assert.equal(isUnknownPath(p), false, p);
  }
});

test('an address the app cannot read is lost', () => {
  for (const p of ['/nope', '/en/whatever/else/here', '/nl/nonsense-page', '/Spain/Sevilla', '/spain/sevilla/extra/deep']) {
    assert.equal(isUnknownPath(p), true, p);
  }
});

test('the 404 copy exists in all six languages, without dashes', () => {
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const src = readFileSync(new URL(`../src/i18n/${lang}.js`, import.meta.url), 'utf8');
    for (const k of ['nf.title', 'nf.text', 'nf.map', 'nf.plan']) {
      const m = new RegExp(`"${k.replace('.', '\\.')}":\\s*"([^"]+)"`).exec(src);
      assert.ok(m, `${lang} ${k}`);
      assert.ok(!/[–—·]/.test(m[1]), `${lang} ${k} has no dash or middot`);
    }
  }
});
