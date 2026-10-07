import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, GLOSSARY_IDS, glossaryKeys, glossaryIdIn, glossarySplit } from '../src/lib/glossary.js';
import { en } from '../src/i18n/en.js';
import { de } from '../src/i18n/de.js';
import { es } from '../src/i18n/es.js';
import { fr } from '../src/i18n/fr.js';
import { it as itCat } from '../src/i18n/it.js';
import { nl } from '../src/i18n/nl.js';

const CATALOGS = { en, de, es, fr, it: itCat, nl };

// The starting sets of the trips spec (C7) and the destinations spec (4.1).
const REQUIRED = [
  'hardpack', 'bora', 'hut-to-hut', 'singletrack', 'ehic', 'vignette', 'tbe',
  'fire-road', 'scree', 'via-ferrata', 'sac-scale', 'prominence', 'isolation', 'col',
  'massif', 'bothy', 'refuge', 'traverse', 'out-and-back', 'loop', 'waymarking', 'gr',
  'eurovelo', 'node-network', 'rail-trail', 'greenway', 'traffic-free', 'gravel-bike',
  'bathing-water', 'blue-flag', 'secchi', 'blue-green-algae', 'shoulder-season',
  'snow-line', 'natura-2000', 'gpx', 'wave-height', 'thermocline',
];

test('every required term is in the glossary', () => {
  for (const id of REQUIRED) assert.ok(GLOSSARY[id], `missing term ${id}`);
  assert.ok(REQUIRED.length >= 38);
});

test('every term has its words in all six catalogues, with no dashes', () => {
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    assert.ok(cat['glossary.dotLabel'].includes('{term}'), `${lang} dotLabel`);
    for (const id of GLOSSARY_IDS) {
      const k = glossaryKeys(id);
      for (const key of [k.term, k.text]) {
        assert.ok(typeof cat[key] === 'string' && cat[key].length > 2, `${lang} ${key}`);
        assert.ok(!/[—·•]/.test(cat[key]), `${lang} ${key} has a banned mark`);
      }
      assert.ok(cat[k.text].length <= 330, `${lang} ${id} is too long for two sentences`);
    }
  }
});

test('no catalogue carries a glossary key the glossary does not know', () => {
  const ids = new Set(GLOSSARY_IDS);
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    for (const key of Object.keys(cat)) {
      const m = key.match(/^glossary\.(.+)\.(term|text)$/);
      if (m) assert.ok(ids.has(m[1]), `${lang} has a stray ${key}`);
    }
  }
});

test('glossaryIdIn finds a term in free text and not a look-alike', () => {
  assert.equal(glossaryIdIn('40% hardpack'), 'hardpack');
  assert.equal(glossaryIdIn('Bring your EHIC'), 'ehic');
  assert.equal(glossaryIdIn('GR 20 across Corsica'), 'gr');
  assert.equal(glossaryIdIn('Paved road'), null);
  assert.equal(glossaryIdIn(''), null);
});

test('glossarySplit puts one dot after the first mention of each term and keeps the words', () => {
  const line = 'Mostly hardpack, then more hardpack and a GR 20 link.';
  const parts = glossarySplit(line);
  assert.equal(parts.filter((p) => p.term === 'hardpack').length, 1);
  assert.equal(parts.filter((p) => p.term === 'gr').length, 1);
  assert.equal(parts.filter((p) => p.text != null).map((p) => p.text).join(''), line);
  assert.deepEqual(glossarySplit('Nothing to explain'), [{ text: 'Nothing to explain' }]);
});
