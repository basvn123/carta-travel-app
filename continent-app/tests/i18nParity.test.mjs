/* T1170 (ROADMAP I8): every locale carries every English key, with no
 * {placeholder} English lacks (a translation may drop one, never invent one), and the first-visit language follows the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.js';
import { detectBrowserLang } from '../src/i18n/detect.js';

const LOCALES = ['nl', 'de', 'fr', 'es', 'it'];
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

for (const code of LOCALES) {
  const cat = (await import(`../src/i18n/${code}.js`))[code];

  test(`${code}: no English key is missing`, () => {
    const missing = Object.keys(en).filter((k) => !(k in cat));
    assert.deepEqual(missing.slice(0, 20), [], `${missing.length} keys missing in ${code}.js, e.g. ${missing.slice(0, 5).join(', ')}`);
  });

  test(`${code}: no key that English lacks`, () => {
    const extra = Object.keys(cat).filter((k) => !(k in en));
    assert.deepEqual(extra.slice(0, 20), []);
  });

  test(`${code}: uses no {placeholder} English lacks`, () => {
    const bad = Object.keys(en).filter((k) => k in cat && vars(cat[k]).some((v) => !vars(en[k]).includes(v)));
    assert.deepEqual(bad.slice(0, 20), []);
  });

  test(`${code}: no empty string and no em or en dash`, () => {
    const bad = Object.keys(cat).filter((k) => typeof cat[k] !== 'string' || cat[k].trim() === '' || /[–—]/.test(cat[k]));
    assert.deepEqual(bad.slice(0, 20), []);
  });
}

test('browser language on first visit', () => {
  assert.equal(detectBrowserLang({ languages: ['fr-CH', 'en'] }), 'fr');
  assert.equal(detectBrowserLang({ languages: ['pt-BR', 'de-AT'] }), 'de');
  assert.equal(detectBrowserLang({ languages: ['nl_NL'] }), 'nl');
  assert.equal(detectBrowserLang({ language: 'IT-it' }), 'it');
  assert.equal(detectBrowserLang({ languages: ['ja', 'pt'] }), 'en');
  assert.equal(detectBrowserLang({ languages: [] }), 'en');
  assert.equal(detectBrowserLang(null), 'en');
});
