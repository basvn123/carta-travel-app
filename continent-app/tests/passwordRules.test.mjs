// T1164-f: the password forms check length and context words, no composition rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_RULES, checkPasswordRules, contextWords, passwordContextWord, passwordMeetsRules,
} from '../src/lib/passwordStrength.js';

test('no composition rules: a long lower-case phrase passes', () => {
  assert.deepEqual(PASSWORD_RULES.map((r) => r.key), ['len', 'context']);
  assert.equal(passwordMeetsRules('slow green river walks', { name: 'Ann Vos', email: 'ann@example.org' }), true);
});

test('the length floor still holds', () => {
  assert.equal(passwordMeetsRules('short'), false);
  assert.deepEqual(checkPasswordRules('short').find((r) => r.key === 'len'), { key: 'len', met: false });
});

test('context words: Carta, name parts and the e-mail local part, accents and case ignored', () => {
  const ctx = { name: 'Émile De Vries', email: 'emile.vries+trips@example.org' };
  const words = contextWords(ctx);
  for (const w of ['carta', 'emile', 'vries', 'trips']) assert.ok(words.includes(w), w);
  assert.ok(!words.includes('de'), 'parts under three characters are not context words');
  assert.equal(passwordContextWord('MyCARTAtrip2026', ctx), 'carta');
  assert.equal(passwordContextWord('hello-Emile-1999', ctx), 'emile');
  assert.equal(passwordMeetsRules('vriesvries123', ctx), false);
  assert.equal(passwordMeetsRules('olive harbour lantern', ctx), true);
});

test('no context given: only Carta is refused', () => {
  assert.equal(passwordContextWord('my carta password'), 'carta');
  assert.equal(passwordContextWord('anything else at all'), null);
});
