// The home page (T463, after T462: src/lib/homeDemo.js and the home.* strings).
// Run: npm test (continent-app/)
//
// The fixtures pin the story's shape, the travellers' "from" price (the
// cheapest member of a search, never an average, and nothing over fewer than
// three places) and the photo sources. The real-data tests run when
// public/app_data.json and public/search/guided.json are present: every
// question and every traveller must return places today, and every captured
// screen must exist in all six languages. The catalog tests keep the six
// languages in step and the copy inside the house rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHAPTERS, PERSONAS, SEARCHES, SCREEN_LANGS, STORY_PLACE, STORY_SEARCH,
  cheapestDay, exploreHref, isEstimate, personaPhotos, screenSrc, searchRows,
} from '../src/lib/homeDemo.js';
import { computeCosts } from '../src/lib/costIndex.js';
import { matchAll } from '../src/lib/guidedSearch.js';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { de } from '../src/i18n/de.js';
import { fr } from '../src/i18n/fr.js';
import { es } from '../src/i18n/es.js';
import { it as itCat } from '../src/i18n/it.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const CATALOGS = { en, nl, de, fr, es, it: itCat };
const cost = (dayEur, level = 'city') => ({ dayEur, stayLevel: level, foodLevel: level });

test('the story has five chapters, each with its screen, words and door', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.id), ['find', 'place', 'plan', 'day', 'share']);
  for (const c of CHAPTERS) {
    for (const k of ['tab', 'title', 'body', 'alt']) assert.ok(en[c[k]], `${c.id} ${k} ${c[k]} is a string`);
    assert.ok(['search', 'place', 'trip', 'day', 'trips'].includes(c.door), `${c.id} door`);
  }
});

test('a screen is read in the UI language, and English stands in for any other', () => {
  assert.equal(screenSrc('de', 'plan'), '/home/de/plan.webp');
  assert.equal(screenSrc('pt', 'plan'), '/home/en/plan.webp');
  assert.equal(screenSrc(undefined, 'desk'), '/home/en/desk.webp');
});

test('a question keeps its facets in its address, so a new tab opens it', () => {
  assert.equal(exploreHref({ vibe: 'lake', area: 'alps', month: 7 }), '?tab=map&xe=lake&xa=alps&xm=7');
  assert.equal(exploreHref({ vibe: 'beach', country: 'PT', budget: 80 }), '?tab=map&xe=beach&xc=PT&xb=80');
  assert.equal(exploreHref({ vibe: 'oldtown', nocar: true }), '?tab=map&xe=oldtown&xp=c');
  assert.equal(exploreHref({ budget: 60 }), '?tab=map&xb=60');
  assert.equal(exploreHref(), '?tab=map');
  for (const s of SEARCHES) assert.match(exploreHref(s.facets), /^\?tab=map&xe=/);
  assert.equal(exploreHref(STORY_SEARCH), '?tab=map&xe=lake&xa=alps&xm=7');
});

test('the estimate mark is the card predicate', () => {
  assert.equal(isEstimate(cost(50, 'city')), false);
  assert.equal(isEstimate({ dayEur: 50, stayLevel: 'city', foodLevel: 'country' }), true);
  assert.equal(isEstimate({ dayEur: null }), false);
  assert.equal(isEstimate(null), false);
});

// A guided fixture: four lakes (one unpriced) and one place that is no lake.
const GUIDED = {
  d: {
    a: { v: { lake: 80 }, a: ['alps'] },
    b: { v: { lake: 90 }, a: ['alps'] },
    c: { v: { lake: 70 }, a: ['alps'] },
    d: { v: { lake: 95 }, a: ['alps'] },
    e: { v: { lake: 20 }, a: ['alps'] },
  },
};
const ROWS = [
  { id: 'a', iso2: 'SI', cost: cost(77, 'country') },
  { id: 'b', iso2: 'AT', cost: cost(61) },
  { id: 'c', iso2: 'IT', cost: cost(107) },
  { id: 'd', iso2: 'CH', cost: null },
  { id: 'e', iso2: 'CH', cost: cost(12) },
];

test("a traveller's price is the cheapest priced place its search returns", () => {
  const best = cheapestDay(ROWS, { vibe: 'lake', area: 'alps' }, GUIDED);
  assert.equal(best.dayEur, 61, 'the cheapest match, not the cheapest place (e is no lake)');
  assert.equal(isEstimate(best), false);
});

test('a "from" over fewer than three places, or before the data arrives, is left out', () => {
  assert.equal(cheapestDay(ROWS.slice(0, 2), { vibe: 'lake' }, GUIDED), null);
  assert.equal(cheapestDay(ROWS, { vibe: 'lake' }, null), null);
  assert.equal(cheapestDay([], { vibe: 'lake' }, GUIDED), null);
  assert.equal(cheapestDay(ROWS, null, GUIDED), null);
});

test("the catalogue rows carry each place's day cost, and nothing without indices", () => {
  const rows = searchRows({ a: { iso2: 'SI' }, b: { iso2: 'AT' } }, new Map([['a', cost(50)]]));
  assert.deepEqual(rows.map((r) => [r.id, r.cost?.dayEur ?? null]), [['a', 50], ['b', null]]);
  assert.deepEqual(searchRows(null, new Map()), []);
  assert.deepEqual(searchRows({ a: {} }, null), []);
});

test('six travellers, hikers first, each with a door and a photo source', () => {
  assert.equal(PERSONAS.length, 6);
  assert.equal(PERSONAS[0].id, 'hike');
  for (const p of PERSONAS) {
    assert.ok(p.facets || p.kind, `${p.id} opens something`);
    // A card with no question has no price to show, so it names what it opens.
    if (!p.facets) assert.ok(p.pill && en[p.pill], `${p.id} has a pill label`);
    assert.ok(p.photo.style || p.photo.dest, `${p.id} has a photo source`);
  }
  const photos = personaPhotos({ types: [{ slug: 'hiking', hero: { url: 'u', author: 'A', licence: 'CC0' } }] }, {});
  assert.equal(photos.hike.url, 'u');
  assert.equal(photos.hike.licence, 'CC0');
  assert.equal(photos.city, null);
  assert.deepEqual(Object.keys(photos), PERSONAS.map((p) => p.id));
});

const appData = join(pub, 'app_data.json');
const guidedFile = join(pub, 'search', 'guided.json');
const journeysFile = join(pub, 'journeys', 'index.json');
const haveData = existsSync(appData) && existsSync(guidedFile);

function shipped() {
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const guided = JSON.parse(readFileSync(guidedFile, 'utf8'));
  const rows = searchRows(data.destinations, computeCosts(data.destinations, {}));
  return { data, guided, rows };
}

test('every search offered under the hero returns at least three places today', { skip: !haveData }, () => {
  const { guided, rows } = shipped();
  for (const s of SEARCHES) {
    const hits = rows.filter((p) => matchAll(p, s.facets, { guided, nearRow: null })).length;
    assert.ok(hits >= 3, `${s.key} returns ${hits}`);
  }
});

test("the story's place is in the catalogue and its search finds it", { skip: !haveData }, () => {
  const { data, guided, rows } = shipped();
  assert.ok(data.destinations[STORY_PLACE], STORY_PLACE);
  const row = rows.find((r) => r.id === STORY_PLACE);
  assert.ok(matchAll(row, STORY_SEARCH, { guided, nearRow: null }), 'the lakes question returns Lake Bled');
});

test('every traveller with a question shows a price from the shipped catalogue', { skip: !haveData }, () => {
  const { guided, rows } = shipped();
  for (const p of PERSONAS.filter((x) => x.facets)) {
    const best = cheapestDay(rows, p.facets, guided);
    assert.ok(best && best.dayEur > 0, `${p.id} has a "from" price`);
  }
});

test('every traveller has its photo in the shipped data', { skip: !existsSync(journeysFile) || !existsSync(appData) }, () => {
  const ix = JSON.parse(readFileSync(journeysFile, 'utf8'));
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const photos = personaPhotos(ix, data.destinations);
  for (const p of PERSONAS) assert.ok(photos[p.id]?.url, `${p.id} has a photo`);
});

test('every captured screen exists in all six languages', () => {
  for (const lang of SCREEN_LANGS) {
    for (const id of [...CHAPTERS.map((c) => c.id), 'trip', 'desk']) {
      const f = join(pub, screenSrc(lang, id));
      assert.ok(existsSync(f), `${lang}/${id}.webp`);
      const size = statSync(f).size;
      assert.ok(size > 10000 && size < 250000, `${lang}/${id}.webp is ${size} bytes`);
    }
  }
});

// ---- the strings ----------------------------------------------------------

const homeKeys = (cat) => Object.keys(cat).filter((k) => k.startsWith('home.')).sort();
const vars = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');

test('every language carries the same home strings with the same placeholders', () => {
  const ref = homeKeys(en);
  assert.ok(ref.length >= 30, `en has ${ref.length} home strings`);
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    assert.deepEqual(homeKeys(cat), ref, `${lang} home keys`);
    for (const k of ref) assert.equal(vars(cat[k]), vars(en[k]), `${lang} ${k} placeholders`);
  }
});

test('the old landing strings are gone', () => {
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    assert.deepEqual(Object.keys(cat).filter((k) => k.startsWith('landing.')), [], lang);
  }
});

const BANNED = {
  en: ['seamless', 'unlock', 'effortless', 'elevate', 'leverage', 'empower', 'curated', 'simply', 'just', 'easy'],
};

test('the home copy keeps the house rules in every language', () => {
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    for (const k of homeKeys(cat)) {
      const s = cat[k];
      assert.ok(!/[–—·•]/.test(s), `${lang} ${k} has a dash or a middot: ${s}`);
      assert.ok(!/€|EUR/.test(s), `${lang} ${k} carries a euro sign: ${s}`);
      // A catalogue count is three or more digits, or a grouped figure.
      assert.ok(!/\d{3,}|\d[.,]\d{3}/.test(s), `${lang} ${k} carries a count: ${s}`);
      for (const w of BANNED[lang] || []) {
        assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(s), `${lang} ${k} uses "${w}": ${s}`);
      }
    }
  }
});
