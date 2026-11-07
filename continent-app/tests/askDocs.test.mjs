// T1168 (ROADMAP B8): Ask the docs. The chunker, the extractive answer with
// citations, the grounding check, the site copy of the core, the eval gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { core, buildDocsIndex, modelAnswer } from '../../scripts/docs/ask_docs.mjs';
import { runAskDocsEval, gate, BASELINE_PATH } from '../scripts/eval/ask-docs/eval.mjs';

const MD = [
  '# Guide', '', 'Intro text for the guide that is long enough to keep.', '',
  '## Backups', '', 'Run `backup.sh` nightly. It keeps 14 copies on the box.', '',
  '### Restore', '', 'Restore to a scratch database first. Never restore over the live project.', '',
  '```', '# not a heading', '```', '',
  '## Prices', '', 'Prices come from the price engine, one config.',
].join('\n');

test('chunkMarkdown: heading paths, anchors, fences are not headings, no dashes', () => {
  const ps = core.chunkMarkdown('guide.md', `${MD}\n\nA dash \u2014 here and \u2013 there stays out.`);
  const restore = ps.find((p) => p.anchor === 'restore');
  assert.equal(restore.head, 'Backups > Restore');
  assert.equal(restore.title, 'Guide');
  assert.ok(ps.every((p) => !/[\u2013\u2014]/.test(p.text)));
  assert.ok(ps.some((p) => p.text.includes('# not a heading')));
  assert.ok(ps.every((p) => p.text.length <= core.MAX_CHARS * 2));
});

test('answer: cited, grounded, linked to the section; abstains off topic', () => {
  const idx = core.buildIndex(core.chunkMarkdown('guide.md', MD));
  const a = core.answer(idx, 'how do I restore a backup?');
  assert.equal(a.abstained, false);
  assert.match(a.text, /\[1\]/);
  assert.equal(a.citations[0].link, 'guide.md#restore');
  assert.ok(core.groundingCheck(a).ok);
  const off = core.answer(idx, 'recipe for lasagne');
  assert.equal(off.abstained, true);
  assert.deepEqual(off.citations, []);
});

test('groundingCheck: catches a missing mark, a bad mark and an invented number', () => {
  const c = [{ n: 1, text: 'It keeps 14 copies.' }];
  assert.ok(core.groundingCheck({ abstained: false, text: 'It keeps 14 copies. [1]', citations: c }).ok);
  assert.equal(core.groundingCheck({ abstained: false, text: 'It keeps 14 copies.', citations: c }).ok, false);
  assert.equal(core.groundingCheck({ abstained: false, text: 'It keeps 14 copies. [2]', citations: c }).ok, false);
  assert.equal(core.groundingCheck({ abstained: false, text: 'It keeps 30 copies. [1]', citations: c }).ok, false);
});

test('the docs site copy of the core is the script (run: cp scripts/docs/ask_docs_core.js docs/assets/ask-docs/core.js)', () => {
  const a = readFileSync(new URL('../../scripts/docs/ask_docs_core.js', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../../docs/assets/ask-docs/core.js', import.meta.url), 'utf8');
  assert.equal(a, b);
});

test('the real docs index builds and answers with a citation', () => {
  const idx = buildDocsIndex();
  assert.ok(idx.N > 1000);
  const a = core.answer(idx, 'how do I restore a database backup?');
  assert.equal(a.abstained, false);
  assert.ok(a.citations.some((c) => c.path.startsWith('runbooks/backup')));
});

test('modelAnswer: uses the registry prompt, the ask gateway feature, and drops an ungrounded rewrite', async () => {
  const idx = core.buildIndex(core.chunkMarkdown('guide.md', MD));
  const base = core.answer(idx, 'how do I restore a backup?');
  const seen = [];
  const good = await modelAnswer(base, 'q', {}, async (req) => { seen.push(req); return { ok: true, text: 'Restore to a scratch database first. [1]' }; });
  assert.equal(good.ok, true);
  assert.equal(seen[0].feature, 'ask');
  assert.match(seen[0].system, /Carta's internal documentation/);
  assert.match(seen[0].user, /\[1\]/);
  const bad = await modelAnswer(base, 'q', {}, async () => ({ ok: true, text: 'It keeps 99 copies. [1]' }));
  assert.equal(bad.ok, false);
  assert.equal((await modelAnswer(base, 'q', {}, async () => ({ ok: false, code: 'timeout' }))).ok, false);
});

test('the eval passes its gate and a seeded drop fails it', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  assert.deepEqual(gate(runAskDocsEval().summary, baseline), []);
  assert.ok(gate(runAskDocsEval({ seedDrop: true }).summary, baseline).length > 0);
});
