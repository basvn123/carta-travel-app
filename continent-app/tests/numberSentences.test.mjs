import test from 'node:test';
import assert from 'node:assert/strict';
import { NUMBER_SENTENCES, NUMBER_METRICS, numberSentence } from '../src/lib/numberSentences.js';
import { en } from '../src/i18n/en.js';
import { de } from '../src/i18n/de.js';
import { es } from '../src/i18n/es.js';
import { fr } from '../src/i18n/fr.js';
import { it as itCat } from '../src/i18n/it.js';
import { nl } from '../src/i18n/nl.js';

const CATALOGS = { en, de, es, fr, it: itCat, nl };
const tFor = (cat) => (key, vars) => String(cat[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => vars?.[n] ?? `{${n}}`);

// A figure inside every band of every metric.
const SAMPLES = {
  height: [400, 1800, 3100],
  prominence: [60, 300, 2136],
  isolation: [2, 12, 47.7],
  difficulty: ['walkUp', 'hike', 'mountainHike', 'scramble', 'alpine', 'viaFerrata', 'technical'],
  viewArea: [1200],
  pavedShare: [99, 80, 50, 10],
  trafficFree: [90, 50, 5],
  maxGrade: [4, 10, 20, 36],
  sacScale: ['strolling', 'hiking', 'mountain_hiking', 'demanding_mountain_hiking'],
  bathingWater: [95, 70, 20],
};

test('every metric has samples, a say() and keys in all six catalogues', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...NUMBER_METRICS].sort());
  for (const id of NUMBER_METRICS) {
    const m = NUMBER_SENTENCES[id];
    assert.ok(m.source && m.keys.length > 0, id);
    for (const [lang, cat] of Object.entries(CATALOGS)) {
      for (const key of m.keys) {
        assert.ok(typeof cat[key] === 'string' && cat[key].length > 10, `${lang} ${key}`);
        assert.ok(!/[\u2014\u00b7\u2022]/.test(cat[key]), `${lang} ${key} has a banned mark`);
      }
    }
  }
});

test('every sentence key is reachable and every figure gets a sentence', () => {
  for (const id of NUMBER_METRICS) {
    const reached = new Set();
    for (const v of SAMPLES[id]) {
      const out = NUMBER_SENTENCES[id].say(v, { fmt: String });
      assert.ok(out, `${id} ${v}`);
      assert.ok(NUMBER_SENTENCES[id].keys.includes(out.key), `${id} ${out.key} not declared`);
      reached.add(out.key);
    }
    assert.deepEqual([...reached].sort(), [...NUMBER_SENTENCES[id].keys].sort(), `${id} has an unreachable key`);
  }
});

test('a missing or unreadable figure gets no sentence, never an invented one', () => {
  for (const id of NUMBER_METRICS) {
    for (const v of [null, undefined, NaN, 'x']) {
      assert.equal(NUMBER_SENTENCES[id].say(v, { fmt: String }), null, `${id} ${String(v)}`);
    }
  }
  assert.equal(numberSentence('nope', 5, { t: (k) => k }), '');
});

test('the spec examples read as the spec says', () => {
  const t = tFor(en);
  assert.equal(numberSentence('prominence', 2136, { t, lang: 'en' }),
    'Rises 2,136 m above the lowest pass linking it to anything higher, so it stands alone rather than sitting on a ridge.');
  assert.equal(numberSentence('difficulty', 'scramble', { t }), 'Hands needed in places. Not for a first mountain day.');
  assert.equal(numberSentence('pavedShare', 20, { t }),
    'Mostly rough track. A gravel bike is ideal, a road bike will struggle.');
});

test('every sentence keeps its variables in every language', () => {
  for (const id of NUMBER_METRICS) {
    for (const key of NUMBER_SENTENCES[id].keys) {
      const vars = (en[key].match(/\{\w+\}/g) || []).sort().join();
      for (const [lang, cat] of Object.entries(CATALOGS)) {
        assert.equal((cat[key].match(/\{\w+\}/g) || []).sort().join(), vars, `${lang} ${key}`);
      }
    }
  }
});
