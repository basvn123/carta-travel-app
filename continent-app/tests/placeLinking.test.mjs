// T1153 (ROADMAP F4): the place linker, its search adapter and its eval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { foldName } from '../src/lib/searchIndex.js';
import { fold, makeLinker, linkPlace } from '../src/lib/linking/index.js';
import { editDistance } from '../src/lib/linking/linker.js';
import { linkSearchHits, linkerFor } from '../src/lib/linking/search.js';
import { runLinkingEval, gate, BASELINE_PATH } from '../scripts/eval/linking/eval.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(APP, 'public', p), 'utf8'));
const inputs = { destinations: J('app_data.json').destinations, searchIndex: J('search_index.json'), lexicon: J('search/ask/lexicon.json') };
const L = makeLinker(inputs);
const top = (m, ctx) => linkPlace(L, m, ctx).candidates[0];

test('the linker fold is the search index fold', () => {
  for (const s of ['Kraków', 'Ærøskøbing', 'Straße', "L'Île-Rousse", 'Þingvellir', 'Đakovo', 'Český Krumlov']) assert.equal(fold(s), foldName(s));
});

test('edit distance counts a transposition as one edit', () => {
  assert.equal(editDistance('crosiic', 'croisic'), 1);
  assert.equal(editDistance('dubrovnk', 'dubrovnik'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
});

test('an IATA code links its airport, and two codes are not one place', () => {
  assert.equal(top('Flight to BCN').id, 'BCN');
  const two = linkPlace(L, 'Ryanair CRL to SZG');
  assert.equal(two.confident, false);
  assert.deepEqual(two.iata.sort(), ['CRL', 'SZG']);
});

test('typos, exonyms, endonyms, members and booking words', () => {
  assert.equal(top('Dubrovnk').id, 'DBV');
  assert.equal(top('lissabon').id, 'LIS');
  assert.equal(top('salisburgo').id, 'SZG');
  assert.equal(top('Hotel Ibis Lisboa Centro').id, 'LIS');
  assert.equal(top('Kraków Balice airport').id, 'KRK');
  const pos = top('positano');
  assert.equal(pos.id, 'gem:amalfi-coast');
  assert.equal(pos.kind, 'member');
  assert.equal(top('porto errcole').id, 'gem:porto-ercole');
});

test('a city with several airports is one place', () => {
  const r = linkPlace(L, 'rome');
  assert.equal(r.confident, true);
  assert.equal(r.linked.id, 'FCO');
  assert.ok(r.linked.members.includes('CIA'));
});

test('context tells near twins apart', () => {
  assert.equal(top('visegrad', { country: 'HU' }).id, 'gem:visegrad-hu');
  assert.equal(top('visegrad', { country: 'BA' }).id, 'gem:visegrad');
  assert.equal(top('roma', { country: 'SE' }).id, 'gem:roma');
  assert.equal(top('roma').id, 'FCO');
  assert.equal(top('burgis', { country: 'BG' }).id, 'BOJ');
});

test('below the threshold the answer is a did you mean', () => {
  const r = linkPlace(L, 'pafos');
  assert.equal(r.confident, false);
  assert.equal(r.linked, null);
  assert.ok(r.didYouMean.length >= 1 && r.didYouMean.length <= 3);
  assert.ok(r.didYouMean.some((x) => x.id === 'PFO'));
});

test('the linker builds from the search index alone', () => {
  const bare = makeLinker({ searchIndex: inputs.searchIndex });
  assert.equal(linkPlace(bare, 'firenze').candidates[0].id, 'FLR');
});

test('the search adapter keeps the querySearchIndex shape', () => {
  const lk = linkerFor(inputs.searchIndex, inputs.destinations, inputs.lexicon);
  assert.equal(linkerFor(inputs.searchIndex, inputs.destinations, inputs.lexicon), lk);
  const hit = linkSearchHits(lk, inputs.searchIndex, 'dubrovnk');
  assert.ok(hit.ids instanceof Set && hit.ids.has('DBV'));
  assert.deepEqual(hit.suggestions, []);
  const mem = linkSearchHits(lk, inputs.searchIndex, 'positano');
  assert.deepEqual(mem.memberHits, [{ id: 'gem:amalfi-coast', member: 'Positano' }]);
  const region = linkSearchHits(lk, inputs.searchIndex, 'tuscany');
  assert.ok(region.bbox && region.ids === null);
  assert.equal(linkSearchHits(lk, inputs.searchIndex, 'ro').ids, null);
  const dym = linkSearchHits(lk, inputs.searchIndex, 'pafos');
  assert.ok(dym.suggestions.length >= 1 && dym.ids.has('PFO'));
});

test('the eval: 300 cases, the linker beats today\'s search, a seeded drop fails the gate', () => {
  const { summary } = runLinkingEval();
  assert.equal(summary.n, 300);
  const a = summary.parts.all;
  assert.ok(a.after.mrr > a.before.mrr);
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  assert.deepEqual(gate(summary, baseline), []);
  const drop = runLinkingEval({ seedDrop: true }).summary;
  assert.ok(gate(drop, baseline).length > 0);
});

test('set.json is what build-set.mjs builds', () => {
  execFileSync(process.execPath, [join(APP, 'scripts/eval/linking/build-set.mjs'), '--check'], { stdio: 'pipe' });
});
