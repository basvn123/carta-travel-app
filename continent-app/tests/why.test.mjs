// T1208 (ROADMAP G9): "why this place" chips need evidence on both sides,
// confidence is said in two words, and the prices carry the date their
// blocks were refreshed. Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  placeTags, travellerNodes, whyChips, knownFor, confidenceOf, whyLabel, BROAD, STRONG, LIKELY,
} from '../src/lib/why.js';
import { asOfFor, formatDay, isStale, parseDay, ageDays } from '../src/lib/asOf.js';
import { liftProvenance } from '../src/lib/provenance.js';
import { baseRates } from '../src/lib/taste/profile.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const castleTown = () => ({ id: 'X', categories: ['castle', 'historic', 'village'], tags: [] });

test('confidence words: strong from the filter bar, likely from the profile bar, none under', () => {
  assert.equal(STRONG, 0.75);
  assert.equal(LIKELY, 0.6);
  assert.equal(confidenceOf(0.9), 'strong');
  assert.equal(confidenceOf(0.75), 'strong');
  assert.equal(confidenceOf(0.62), 'likely');
  assert.equal(confidenceOf(0.59), null);
  assert.equal(confidenceOf(undefined), null);
});

test('listing tags are scored like the tagger scores a mapped tag', () => {
  const tags = placeTags(castleTown());
  const castle = tags.find((x) => x.node === 'set.castle');
  assert.ok(castle, 'castle category gives set.castle');
  assert.equal(castle.score, 0.62);
  assert.equal(castle.conf, 'likely');
  assert.deepEqual(castle.evidence, [{ kind: 'listing', values: ['castle'] }]);
  // Two listing values on one node: noisy-OR of two, strong.
  const two = placeTags({ categories: ['city'], tags: [], vibes: [] });
  assert.ok(two.every((x) => x.evidence.length > 0));
});

test('a broader node gives way to a narrower one the place also carries', () => {
  const nodes = placeTags(castleTown()).map((x) => x.node);
  assert.ok(nodes.includes('set.castle'));
  assert.ok(!nodes.includes('set.heritage'), 'heritage is the parent of castle');
});

test('no traveller evidence, no chip', () => {
  assert.deepEqual(whyChips(castleTown(), travellerNodes({})), []);
  assert.deepEqual(whyChips(castleTown(), null), []);
});

test('a Yes on a broader node explains the narrower place tag, with both sides of evidence', () => {
  const you = travellerNodes({ verdicts: { 'set.heritage': { v: 'accept', at: 1 } } });
  const chips = whyChips(castleTown(), you);
  assert.equal(chips[0].node, 'set.castle');
  assert.deepEqual(chips[0].you, { kind: 'accepted', node: 'set.heritage' });
  assert.equal(chips[0].evidence[0].kind, 'listing');
});

test('a picked like counts as traveller evidence, a Not me wins over it', () => {
  const like = travellerNodes({ likes: ['culture'] });
  assert.equal(whyChips(castleTown(), like)[0].you.kind, 'like');
  const no = travellerNodes({ likes: ['culture'], verdicts: { 'set.castle': { v: 'reject', at: 1 } } });
  assert.ok(!whyChips(castleTown(), no).some((c) => c.node === 'set.castle'));
  const noParent = travellerNodes({ likes: ['culture'], verdicts: { 'set.heritage': { v: 'reject', at: 1 } } });
  assert.ok(!whyChips(castleTown(), noParent).some((c) => c.node === 'set.castle'), 'rejecting a parent hides the child');
});

test('a BROAD node needs a Yes by name, never a like', () => {
  const heritageOnly = { categories: ['historic'], tags: [] };
  assert.ok(placeTags(heritageOnly).some((x) => x.node === 'set.heritage'));
  assert.deepEqual(whyChips(heritageOnly, travellerNodes({ likes: ['culture'] })), []);
  const yes = travellerNodes({ verdicts: { 'set.heritage': { v: 'accept', at: 1 } } });
  assert.equal(whyChips(heritageOnly, yes)[0].node, 'set.heritage');
});

test('cards cap at two chips, Yes before likes', () => {
  const rec = { categories: ['castle', 'beach', 'lake', 'city'], tags: [] };
  const you = travellerNodes({ likes: ['beach', 'lakes', 'city'], verdicts: { 'set.castle': { v: 'accept', at: 1 } } });
  const chips = whyChips(rec, you);
  assert.equal(chips.length, 2);
  assert.equal(chips[0].node, 'set.castle');
});

test('tagger tags (fixture) bring their score and a quote; implied and evidence-less ones do not count', () => {
  const sample = JSON.parse(readFileSync(root('../cache/taxonomy/tags-sample.json'), 'utf8'));
  const item = sample.items['place:gem:avoise'];
  const tags = placeTags({ categories: [], tags: [] }, item.tags);
  const castle = tags.find((x) => x.node === 'set.castle');
  assert.equal(castle.conf, 'strong');
  assert.equal(castle.evidence[0].kind, 'quote');
  assert.match(castle.evidence[0].text, /castle/);
  assert.ok(!tags.some((x) => x.node === 'set.heritage'), 'implied parent is not a chip');
  const none = placeTags({}, [{ tag: 'set.castle', score: 0.99, evidence: [] }]);
  assert.deepEqual(none, [], 'no evidence, no tag');
});

test('known for: strong, not broad, not already a chip, not rejected', () => {
  const rec = { categories: ['castle'], tags: ['castle'] }; // two listing values? same value counted once
  assert.deepEqual(knownFor(rec), [], 'one listing value is only likely');
  const sample = JSON.parse(readFileSync(root('../cache/taxonomy/tags-sample.json'), 'utf8'));
  const tagged = sample.items['place:gem:avoise'].tags;
  const k = knownFor({}, { tagged });
  assert.ok(k.length > 0 && k.length <= 3);
  assert.ok(k.every((x) => x.conf === 'strong' && !BROAD.has(x.node)));
  assert.ok(!knownFor({}, { tagged, no: new Set(['set.heritage']) }).some((x) => x.node === 'set.castle'));
});

test('labels in six languages come from the taxonomy', () => {
  assert.equal(whyLabel('set.castle', 'nl'), 'Kasteel');
  assert.equal(whyLabel('set.castle', 'xx'), 'Castle');
});

test('BROAD is exactly the nodes on more than half of the shipped catalogue (plus sightseeing)', { skip: !existsSync(root('public/app_data.json')) }, () => {
  const data = JSON.parse(readFileSync(root('public/app_data.json'), 'utf8'));
  const { rates } = baseRates(data.destinations);
  const over = [...rates].filter(([, r]) => r > 0.5).map(([n]) => n);
  for (const n of over) assert.ok(BROAD.has(n), `${n} is on over half of the places: add it to BROAD`);
});

test('dates: parse, age, stale after 90 days, oldest block wins', () => {
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('nope'), null);
  const now = Date.UTC(2026, 10, 7);
  assert.equal(ageDays('2026-11-01', now), 6);
  assert.equal(isStale('prices', '2026-09-01', now), false);
  assert.equal(isStale('prices', '2026-06-07', now), true);
  const rec = liftProvenance({
    costs: { meal: 1, _src: 'carta_food', _asof: '2026-10-01' },
    accommodation: { bed: 1, _src: 'stays_scrape', _asof: '2026-09-20' },
  });
  assert.equal(asOfFor(rec, 'prices'), '2026-09-20');
  assert.equal(asOfFor({ costs: {} }, 'prices'), null, 'no stamp, no date');
});

test('dates format in six locales with no day shift', () => {
  assert.equal(formatDay('2026-06-07', 'en-GB'), '7 Jun 2026');
  for (const l of ['nl-NL', 'de-DE', 'fr-FR', 'es-ES', 'it-IT']) assert.match(formatDay('2026-06-07', l), /7/);
  assert.equal(formatDay('', 'en-GB'), '');
});

test('the why.place keys are in all six languages with the same placeholders', async () => {
  const langs = ['en', 'nl', 'de', 'fr', 'es', 'it'];
  const mods = await Promise.all(langs.map(async (l) => (await import(`../src/i18n/${l}.js`))[l]));
  const keys = Object.keys(mods[0]).filter((k) => k.startsWith('why.place.'));
  assert.equal(keys.length, 14);
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [i, m] of mods.entries()) {
    for (const k of keys) {
      assert.ok(m[k], `${langs[i]} ${k}`);
      assert.equal(holes(m[k]), holes(mods[0][k]), `${langs[i]} ${k} placeholders`);
      assert.ok(!/[\u2013\u2014]/.test(m[k]), `${langs[i]} ${k} has a dash`);
    }
  }
});
