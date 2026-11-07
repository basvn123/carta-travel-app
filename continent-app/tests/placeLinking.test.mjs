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
import { soundKey } from '../src/lib/linking/fold.js';
import { linkSearchHits, linkerFor } from '../src/lib/linking/search.js';
import { locationMatch } from '../src/hooks/useDestinationSearch.js';
import { buildAskVocab, parseIntent, linkUnknownPlace } from '../src/lib/ask/intent.js';
import { linkBookingPlace, linkBookingPlaces, sanitizeTripContext } from '../../supabase/functions/parse-booking/logic.mjs';
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
  const r = linkPlace(L, 'iraklion');
  assert.equal(r.confident, false);
  assert.equal(r.linked, null);
  assert.ok(r.didYouMean.length >= 1 && r.didYouMean.length <= 3);
  assert.ok(r.didYouMean.some((x) => x.id === 'HER'));
});

// T1215 (row T1153-g): accents and sound-alike spellings.
test('the mention spelt with the name\'s accents links that name, not its unaccented twin', () => {
  const r = linkPlace(L, 'Fårö');
  assert.equal(r.confident, true);
  assert.equal(r.linked.id, 'gem:faro-gotland');
  // Without the accents Faro in Portugal still comes first.
  assert.equal(top('faro').id, 'FAO');
  assert.equal(top('Faro').id, 'FAO');
});

test('sound-alike keys fold Greek and Nordic spellings together', () => {
  assert.equal(soundKey('Pafos'), soundKey('Paphos'));
  assert.equal(soundKey('Hania'), soundKey('Chania'));
  assert.equal(soundKey('Aarhus'), soundKey('Århus'));
  assert.equal(soundKey('Tromsoe'), soundKey('Tromsø'));
  assert.notEqual(soundKey('Paros'), soundKey('Paphos'));
  assert.notEqual(soundKey('Hawes'), soundKey('Chaves'));
});

test('sound-alike spellings link the place they sound like', () => {
  const r = linkPlace(L, 'pafos');
  assert.equal(r.confident, true);
  assert.equal(r.linked.id, 'PFO');
  assert.equal(top('Páfos').id, 'PFO');
  assert.equal(top('hania').id, 'CHQ');
  assert.equal(top('tromsoe').id, 'TOS');
  // An exact name still beats a sound-alike of another place.
  assert.equal(top('paros').id, 'gem:paros');
  assert.equal(top('hawees').id, 'gem:hawes');
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
  const dym = linkSearchHits(lk, inputs.searchIndex, 'iraklion');
  assert.ok(dym.suggestions.length >= 1 && dym.ids.has('HER'));
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

// T1215 (row T1153-h): the Destinations hook reads the linker the way Explore does.
test('the Destinations location match: plain substring alone, widened by linker hits', () => {
  const dbv = { id: 'DBV', city: 'Dubrovnik', country: 'Croatia', lat: 42.56, lon: 18.27 };
  // Flag off (no hits): the plain substring, as before.
  assert.equal(locationMatch(dbv, '', null), true);
  assert.equal(locationMatch(dbv, 'dubrov', null), true);
  assert.equal(locationMatch(dbv, 'croatia', null), true);
  assert.equal(locationMatch(dbv, 'dubrovnk', null), false);
  // Flag on: the linker's hits count too, and never take a substring hit away.
  const lk = linkerFor(inputs.searchIndex, inputs.destinations, inputs.lexicon);
  const hits = linkSearchHits(lk, inputs.searchIndex, 'dubrovnk');
  assert.equal(locationMatch(dbv, 'dubrovnk', hits), true);
  assert.equal(locationMatch({ ...dbv, id: 'XXX', city: 'Elsewhere' }, 'dubrovnk', hits), false);
  assert.equal(locationMatch(dbv, 'croatia', { ids: new Set(), bbox: null }), true);
  assert.equal(locationMatch(dbv, 'dalmatia', { ids: null, bbox: [13, 42, 19.5, 44.5] }), true);
});

// T1215 (row T1153-d): Ask reads a place word its vocabulary does not hold through the linker.
test('Ask: an unknown place word links through the place linker, only when one is given', async () => {
  const { en } = await import('../src/i18n/en.js');
  const rows = Object.values(inputs.destinations);
  const guided = J('search/guided.json');
  const countries = [...new Map(rows.map((p) => [p.iso2, p.country])).entries()];
  const base = { t: (k) => en[k] ?? k, lang: 'en', guided, rows, countries, index: inputs.searchIndex, lexicon: inputs.lexicon };
  const now = new Date('2026-11-07T12:00:00');
  const link = (m) => linkPlace(L, m, { whole: true });
  const plain = buildAskVocab(base);
  const linked = buildAskVocab({ ...base, link });
  // Without a linker: as before, the typo stays unknown.
  const off = parseIntent('when to visit dubrovnk', { vocab: plain, lang: 'en', now });
  assert.deepEqual(off.places, []);
  assert.ok(off.unknown.includes('dubrovnk'));
  // With one (on the vocabulary or in ctx): a when question about Dubrovnik.
  const on = parseIntent('when to visit dubrovnk', { vocab: linked, lang: 'en', now });
  assert.equal(on.type, 'when');
  assert.deepEqual(on.places, ['DBV']);
  assert.ok(!on.unknown.includes('dubrovnk'));
  assert.deepEqual(parseIntent('when to visit pafos', { vocab: plain, lang: 'en', now, link }).places, ['PFO']);
  // A place outside Europe is not completed into a catalogue name (Peru is not Perugia).
  assert.deepEqual(parseIntent('vacaciones en peru', { vocab: linked, lang: 'es', now }).places, []);
  // A question that names a known place is read as before.
  assert.deepEqual(parseIntent('when to visit lisbon', { vocab: linked, lang: 'en', now }).places,
    parseIntent('when to visit lisbon', { vocab: plain, lang: 'en', now }).places);
  assert.equal(linkUnknownPlace(['ab'], link), null);
  assert.equal(linkUnknownPlace([], link), null);
});

// T1215 (row T1153-e): parse-booking links each booking's place, with the trip's countries as context.
test('parse-booking: a booking links its catalogue place, and nothing without the linker', () => {
  const linking = { linker: L, linkPlace };
  const ctx = sanitizeTripContext({ stops: [{ city: 'Visby', country: 'Sweden', nights: 3 }, { city: 'Stockholm', country: 'SE', nights: 2 }] });
  // The city field first, the title when the city is empty.
  assert.equal(linkBookingPlace({ title: 'Hotel Ibis Lisboa Centro', city: '' }, ctx, linking).id, 'LIS');
  assert.equal(linkBookingPlace({ title: 'Ryanair FR123', city: 'Dubrovnk' }, ctx, linking).id, 'DBV');
  // The stops' countries decide a near twin: Faro on a Swedish trip is Fårö.
  assert.equal(linkBookingPlace({ title: 'Cottage', city: 'Faro' }, ctx, linking).id, 'gem:faro-gotland');
  assert.equal(linkBookingPlace({ title: 'Cottage', city: 'Faro' }, sanitizeTripContext({ stops: [{ city: 'Lagos', country: 'Portugal' }] }), linking).id, 'FAO');
  // Not confident, no data, no booking: no place, and the rest of the booking is untouched.
  assert.equal(linkBookingPlace({ title: 'Booking 123', city: '' }, ctx, linking), null);
  assert.equal(linkBookingPlace({ title: 'Cottage', city: 'Faro' }, ctx, null), null);
  const out = linkBookingPlaces([{ title: 'Flight to BCN', city: 'Barcelona', code: 'X1' }, { title: 'Stay', city: '' }], ctx, linking);
  assert.deepEqual(out.map((b) => b.placeId), ['BCN', null]);
  assert.equal(out[0].code, 'X1');
  assert.deepEqual(linkBookingPlaces([{ title: 'A', city: 'Rome' }], ctx, null), [{ title: 'A', city: 'Rome', placeId: null }]);
  // What a Deno function could load (the search index and lexicon, not app_data) links too.
  const slim = { linker: makeLinker({ searchIndex: inputs.searchIndex, lexicon: inputs.lexicon }), linkPlace };
  assert.equal(linkBookingPlace({ title: 'Hotel', city: 'Lissabon' }, ctx, slim).id, 'LIS');
});
