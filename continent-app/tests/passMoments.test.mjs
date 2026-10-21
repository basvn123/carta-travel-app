// T497: the paid moments of roadmap 1.15 point 5. Which plan the pass sheet
// opens on, that every moment's copy exists in all six languages with the
// figures left to pricing.js, and that the free sentence is one key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REASON_COPY, SOFT, initialPick, FAIL_KEY } from '../src/lib/passMoments.js';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { de } from '../src/i18n/de.js';
import { fr } from '../src/i18n/fr.js';
import { es } from '../src/i18n/es.js';
import { it as itCat } from '../src/i18n/it.js';

const LANGS = { en, nl, de, fr, es, it: itCat };

test('a paid moment opens on the Trip Pass (T488-g)', () => {
  for (const reason of ['export', 'exportCal', 'exportMap', 'import', 'save', 'plans', 'ground', 'browse', 'pricing']) {
    assert.equal(initialPick(reason, 'free'), 'trip', reason);
  }
});

test('an offer nobody asked for keeps the yearly plan, a Trip Pass running out is offered days', () => {
  assert.equal(initialPick('plansLow', 'free'), 'year');
  assert.equal(initialPick('expiring', 'year'), 'year');
  assert.equal(initialPick('expiring', 'trip'), 'trip');
});

test('a plan chosen before signing in wins', () => {
  assert.equal(initialPick('export', 'free', 'year'), 'year');
  assert.equal(initialPick('plansLow', 'free', 'trip'), 'trip');
  assert.equal(initialPick('export', 'free', 'bogus'), 'trip');
});

test('sharing and the celebrate offer are gone (T488-b, T488-c)', () => {
  assert.equal(REASON_COPY.share, undefined);
  assert.equal(REASON_COPY.celebrate, undefined);
  assert.equal(SOFT.has('celebrate'), false);
});

test('every moment heading names the Trip Pass in full, in all six languages', () => {
  for (const [lang, cat] of Object.entries(LANGS)) {
    for (const [reason, copy] of Object.entries(REASON_COPY)) {
      for (const key of [copy.heading, copy.sub].filter(Boolean)) {
        assert.ok(typeof cat[key] === 'string' && cat[key].length > 0, `${lang} ${key}`);
        assert.doesNotMatch(cat[key], /[–—·•€]|EUR/, `${lang} ${key}`);
      }
      if (['export', 'exportCal', 'exportMap', 'import', 'save', 'ground'].includes(reason)) {
        assert.match(cat[copy.heading], /Trip Pass/, `${lang} ${copy.heading}`);
      }
      // A price in the line under the heading comes in as {price}, never typed.
      if (copy.sub && /\{price\}/.test(en[copy.sub])) assert.match(cat[copy.sub], /\{price\}/, `${lang} ${copy.sub}`);
    }
  }
});

test('the free sentence is one key in six languages and never says 100% free', () => {
  assert.equal(en['pass.freeSentence'], 'Planning is free. A Trip Pass adds exports, more saved trips and more AI plans.');
  for (const [lang, cat] of Object.entries(LANGS)) {
    assert.ok(cat['pass.freeSentence'], lang);
    assert.doesNotMatch(cat['pass.freeSentence'], /100/, lang);
    assert.equal(cat['pass.freeLine'], undefined, `${lang} pass.freeLine retired`);
  }
});

test('every checkout failure has its sentence', () => {
  for (const key of new Set(Object.values(FAIL_KEY))) {
    for (const [lang, cat] of Object.entries(LANGS)) assert.ok(cat[key], `${lang} ${key}`);
  }
});

test('the pricing page strings exist in all six languages', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('pricing.'));
  assert.ok(keys.length >= 18);
  for (const [lang, cat] of Object.entries(LANGS)) {
    for (const k of keys) assert.ok(cat[k], `${lang} ${k}`);
  }
});
