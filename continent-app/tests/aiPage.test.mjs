// T1156 (F8): the "How Carta uses AI" page is wired (route, footer), every key
// it reads exists under aiPage.*, its text has no em or en dash, and its Ask and
// plan-day figures still match the blessed baseline and the model cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const en = read('src/i18n/en.js');
const text = (k) => en.match(new RegExp(`^\\s*"${k.replace('.', '\\.')}":\\s*"(.*)",$`, 'm'))?.[1];
const aiKeys = [...en.matchAll(/^\s*"(aiPage\.[\w.]+)":/gm)].map((m) => m[1]);

test('?legal=ai opens the page and the footer links to it', () => {
  assert.match(read('src/components/LegalFromUrl.jsx'), /ai: AiPage/);
  assert.match(read('src/components/SiteFooter.jsx'), /\?legal=ai/);
});

test('every aiPage key the component reads exists', () => {
  const src = read('src/components/AiPage.jsx');
  const direct = [...src.matchAll(/t\('(aiPage\.[\w.]+)'\)/g)].map((m) => m[1]);
  const feats = ['ask', 'plan', 'city', 'book'];
  const parts = { ask: ['Does', 'Model', 'Cannot', 'Checked', 'Numbers'], plan: ['Does', 'Model', 'Cannot', 'Checked', 'Numbers'], city: ['Does', 'Model', 'Cannot'], book: ['Does', 'Model', 'Cannot'] };
  const built = feats.flatMap((f) => [`aiPage.${f}H`, ...parts[f].map((p) => `aiPage.${f}${p}`)]);
  for (const k of [...direct, ...built]) assert.ok(text(k), `missing ${k}`);
});

test('aiPage text has no em or en dash', () => {
  assert.ok(aiKeys.length > 30);
  for (const k of aiKeys) assert.doesNotMatch(text(k) || '', /[–—]/, k);
});

test('Ask figures on the page match the blessed baseline and the card', () => {
  const base = JSON.parse(read('scripts/eval/ask-baseline.json'));
  const r = base.retrievers.rules;
  assert.equal(Math.round(r['hit@10'] * 100), 93);
  assert.equal(Math.round(r['recall@10'] * 100), 57);
  assert.equal(r.checks, 689);
  assert.equal(Math.round(r.grounding * 1000) / 10, 99.6);
  assert.equal(base.abstain.caught, 25);
  assert.equal(base.abstain.cases, 30);
  const page = text('aiPage.askNumbers');
  assert.match(page, /93 percent/);
  assert.match(page, /99\.6 percent of 689/);
  assert.match(page, /25 are refused/);
  const card = read('../docs/ai/model-card-ask.md');
  assert.match(card, /hit@10[^\n]*0\.930/);
  assert.match(card, /0\.996 of 689/);
  assert.match(card, /25 of 30 caught/);
});

test('plan-day page does not claim a human-rated quality score', () => {
  const page = text('aiPage.planNumbers');
  assert.match(page, /not yet measured it against human/);
  assert.doesNotMatch(page, /human[- ]rated quality score of/i);
});
