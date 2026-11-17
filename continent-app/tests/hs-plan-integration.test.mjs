// House style integration (G1), builder P: the plan home's house head, the
// retired slogan keys, the trail season estimate with its basis, and the
// Ready-made unit said once beside the first section title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { de } from '../src/i18n/de.js';
import { fr } from '../src/i18n/fr.js';
import { es } from '../src/i18n/es.js';
import { it } from '../src/i18n/it.js';

const CATS = { en, nl, de, fr, es, it };

test('the empty plan home names its job in every language', () => {
  for (const [lang, cat] of Object.entries(CATS)) {
    assert.ok(cat['pf.home.planTitle'], `${lang} pf.home.planTitle`);
    assert.equal(cat['pf.home.title'], undefined, `${lang} pf.home.title is retired`);
    assert.equal(cat['pf.home.titleAccent'], undefined, `${lang} pf.home.titleAccent is retired`);
  }
});

test('the estimated trail season says what it is estimated from', () => {
  for (const [lang, cat] of Object.entries(CATS)) {
    assert.ok(cat['ox.seasonEst'].split(/\s+/).length >= 3, `${lang}: ${cat['ox.seasonEst']}`);
  }
});

test('Ready-made trips say the unit once, in the first section head', () => {
  const src = readFileSync(new URL('../src/planner/flow/CartaTrips.jsx', import.meta.url), 'utf8');
  assert.equal((src.match(/tp\.bud\.kindDay/g) || []).length, 1);
  assert.match(src, /pf-carta-hrow/);
});
