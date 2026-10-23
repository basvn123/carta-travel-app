// The home page v2 (T606: src/lib/homeDemo.js and the home.* strings).
// Run: npm test (continent-app/)
//
// The fixtures pin the story's shape, the week card's sum, the route card's
// total and drawing, the hero film and each traveller (one real place: its
// photo, its name and its own day price). The real-data tests run when
// public/app_data.json and public/search/guided.json are present: every
// traveller's place must be one its own search returns, with a price, and the
// route's towns must all be priced. Every recorded clip must exist in all six
// languages. The catalog tests keep the six languages in step and the copy
// inside the house rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CHAPTERS, CLIP_LANGS, FILM, PERSONAS, ROUTE_PHOTO, ROUTE_STOPS, SLOVENIA, STORY_PLACE, STORY_SEARCH,
  WEEK_NIGHTS, WEEK_PLACES, clipSrc, exploreHref, fitProjection, isEstimate, pagePhotos, placeDay,
  routeTotals, searchRows, smoothPath, weekSum,
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
const parts = (stayEur, foodEur, level = 'city') => ({ stayEur, foodEur, dayEur: stayEur + foodEur, stayLevel: level, foodLevel: level });

test('the story has five chapters, each with its clip, words, door and ground', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.id), ['find', 'place', 'plan', 'day', 'share']);
  for (const c of CHAPTERS) {
    for (const k of ['tab', 'title', 'body', 'alt']) assert.ok(en[c[k]], `${c.id} ${k} ${c[k]} is a string`);
    assert.ok(['search', 'place', 'trip', 'day', 'trips'].includes(c.door), `${c.id} door`);
    assert.ok(['mist', 'lake', 'deep', 'clay', 'sea'].includes(c.ground), `${c.id} ground`);
  }
  // Two panels in a row never share a ground, so the story visibly moves on.
  CHAPTERS.slice(1).forEach((c, i) => assert.notEqual(c.ground, CHAPTERS[i].ground, `${c.id} ground`));
});

test('a clip is read in the UI language, and English stands in for any other', () => {
  assert.equal(clipSrc('de', 'plan'), '/home/clips/de/plan.mp4');
  assert.equal(clipSrc('pt', 'plan'), '/home/clips/en/plan.mp4');
  assert.equal(clipSrc('fr', 'day', 'poster'), '/home/clips/fr/day.webp');
});

test('a question keeps its facets in its address, so a new tab opens it', () => {
  assert.equal(exploreHref({ vibe: 'lake', area: 'alps', month: 7 }), '?tab=map&xe=lake&xa=alps&xm=7');
  assert.equal(exploreHref({ vibe: 'beach', country: 'PT', budget: 80 }), '?tab=map&xe=beach&xc=PT&xb=80');
  assert.equal(exploreHref({ vibe: 'oldtown', nocar: true }), '?tab=map&xe=oldtown&xp=c');
  assert.equal(exploreHref({ budget: 60 }), '?tab=map&xb=60');
  assert.equal(exploreHref(), '?tab=map');
  assert.equal(exploreHref(STORY_SEARCH), '?tab=map&xe=lake&xa=alps&xm=7');
});

test('the estimate mark is the card predicate', () => {
  assert.equal(isEstimate(cost(50, 'city')), false);
  assert.equal(isEstimate({ dayEur: 50, stayLevel: 'city', foodLevel: 'country' }), true);
  assert.equal(isEstimate({ dayEur: null }), false);
  assert.equal(isEstimate(null), false);
});

const ROWS = [
  { id: 'a', iso2: 'SI', cost: cost(77, 'country') },
  { id: 'b', iso2: 'AT', cost: cost(61) },
  { id: 'd', iso2: 'CH', cost: null },
];

test("a place's price is its own day, and nothing when it has none", () => {
  assert.equal(placeDay(ROWS, 'b').dayEur, 61);
  assert.equal(isEstimate(placeDay(ROWS, 'a')), true, 'a country-level stand-in keeps its mark');
  assert.equal(placeDay(ROWS, 'd'), null, 'an unpriced place shows no figure');
  assert.equal(placeDay(ROWS, 'zz'), null);
  assert.equal(placeDay([], 'a'), null);
  assert.equal(placeDay(ROWS, null), null);
});

test("the catalogue rows carry each place's day cost, and nothing without indices", () => {
  const rows = searchRows({ a: { iso2: 'SI' }, b: { iso2: 'AT' } }, new Map([['a', cost(50)]]));
  assert.deepEqual(rows.map((r) => [r.id, r.cost?.dayEur ?? null]), [['a', 50], ['b', null]]);
  assert.deepEqual(searchRows(null, new Map()), []);
  assert.deepEqual(searchRows({ a: {} }, null), []);
});

test('the week card adds the flight to the bed and the food, and never guesses a flight', () => {
  const s = weekSum(parts(56, 41.5), 7, { perSeat: 133 });
  assert.equal(s.bed, 392);
  assert.equal(s.food, 290.5);
  assert.equal(s.flight, 133);
  assert.equal(s.total, 815.5);
  assert.ok(s.times > 6 && s.times < 6.2, 'the trip is about six times the flight');
  const ground = weekSum(parts(56, 41.5), 3, null);
  assert.equal(ground.flight, null, 'no flight in the sweep, no flight figure');
  assert.equal(ground.total, ground.ground, 'without a flight the total is the ground alone');
  assert.equal(weekSum(parts(56, 41.5), 3, { perSeat: 0 }).flight, null, 'a zero fare is no fare');
  assert.equal(weekSum(parts(56, 41.5, 'country'), 3, null).stayEst, true);
  assert.equal(weekSum(null, 7, null), null);
  assert.equal(weekSum(parts(56, 41.5), 0, null), null);
  assert.equal(weekSum({ dayEur: 90, stayEur: null, foodEur: 40 }, 7, null), null, 'a missing part is no sum');
  assert.deepEqual(WEEK_NIGHTS, [3, 5, 7]);
  assert.equal(new Set(WEEK_PLACES).size, WEEK_PLACES.length);
});

test("the route card sums each town's day for its nights, and nothing when a town has no price", () => {
  const rows = [
    { id: 'LJU', cost: cost(100) },
    { id: 'gem:bled', cost: cost(80, 'country') },
    { id: 'gem:bohinj', cost: cost(70) },
  ];
  const r = routeTotals(rows);
  assert.equal(r.nights, 7);
  assert.equal(r.total, 100 * 2 + 80 * 3 + 70 * 2);
  assert.equal(r.est, true, 'one estimated town marks the total');
  assert.equal(routeTotals(rows.slice(0, 2)).total, null);
  assert.deepEqual(ROUTE_STOPS.map((s) => s.id), ['LJU', 'gem:bled', 'gem:bohinj']);
});

test('the route drawing keeps north up and its points inside the card', () => {
  const p = fitProjection(SLOVENIA, 640, 420, 20);
  for (const pt of SLOVENIA) {
    const [x, y] = p(pt);
    assert.ok(x >= 19.9 && x <= 620.1 && y >= 19.9 && y <= 400.1, `${pt} lands at ${x},${y}`);
  }
  const north = p([14.5, 46.8]);
  const south = p([14.5, 45.5]);
  assert.ok(north[1] < south[1], 'north is up');
  const d = smoothPath([[0, 0], [10, 5], [20, 0]]);
  assert.match(d, /^M0 0 C/);
  assert.equal((d.match(/C/g) || []).length, 2, 'one curve between each pair of towns');
  assert.equal(smoothPath([[1, 1]]), '');
});

test('six travellers, hikers first, each with a question, a door, a place and a credited photo', () => {
  assert.equal(PERSONAS.length, 6);
  assert.equal(PERSONAS[0].id, 'hike');
  for (const p of PERSONAS) {
    assert.ok(p.facets || p.kind, `${p.id} opens something`);
    assert.ok(en[p.ask], `${p.id} asks a question`);
    if (p.askPrice) assert.match(en[p.ask], /\{price\}/, `${p.id} names its budget through a placeholder`);
    if (!p.facets) assert.ok(p.pill && en[p.pill], `${p.id} has a pill label`);
    if (p.facets) assert.ok(p.place && p.label, `${p.id} names its place`);
  }
  for (const ph of pagePhotos()) {
    assert.match(ph.url, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/1280px-/, `${ph.credit} is a Commons thumb`);
    assert.ok(ph.author && ph.licence && ph.credit, `${ph.credit} carries its credit`);
    assert.match(ph.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, `${ph.credit} links its file page`);
    assert.ok(Math.min(ph.w, ph.h) >= 2000, `${ph.credit} original is large enough`);
  }
  assert.equal(ROUTE_PHOTO.author, 'Canadianhockey91');
});

test('the hero film is five licensed clips of catalogue places, the lake first', () => {
  assert.equal(FILM.length, 5);
  assert.equal(FILM[0].place, 'gem:bled');
  for (const shot of FILM) {
    assert.ok(shot.place && shot.label, `${shot.id} names a place`);
    assert.ok(shot.credit?.author && shot.credit.licence === 'Pexels License' && shot.credit.page.startsWith('https://www.pexels.com/video/'), `${shot.id} is credited`);
    for (const f of [shot.clip.mp4, shot.clip.poster]) {
      assert.ok(existsSync(join(pub, f.slice(1))), `${f} is shipped`);
    }
  }
});

const appData = join(pub, 'app_data.json');
const guidedFile = join(pub, 'search', 'guided.json');
const haveData = existsSync(appData) && existsSync(guidedFile);

function shipped() {
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const guided = JSON.parse(readFileSync(guidedFile, 'utf8'));
  const rows = searchRows(data.destinations, computeCosts(data.destinations, {}));
  return { data, guided, rows };
}

test("the story's place is in the catalogue and its search finds it", { skip: !haveData }, () => {
  const { data, guided, rows } = shipped();
  assert.ok(data.destinations[STORY_PLACE], STORY_PLACE);
  const row = rows.find((r) => r.id === STORY_PLACE);
  assert.ok(matchAll(row, STORY_SEARCH, { guided, nearRow: null }), 'the lakes question returns Lake Bled');
});

test("every traveller's place is in the catalogue, priced, and returned by its own search", { skip: !haveData }, () => {
  // The photo, the name and the figure are one place, and the answer opens a
  // search that lists it: the page never shows a place its door leaves out.
  const { data, guided, rows } = shipped();
  for (const p of PERSONAS.filter((x) => x.facets)) {
    assert.ok(data.destinations[p.place], `${p.id}: ${p.place} is in the catalogue`);
    const day = placeDay(rows, p.place);
    assert.ok(day && day.dayEur > 0, `${p.id}: ${p.place} has a day price`);
    const row = rows.find((r) => r.id === p.place);
    assert.ok(matchAll(row, p.facets, { guided, nearRow: null }), `${p.id}: its search returns ${p.place}`);
  }
});

test('the route and the week card price every town they name', { skip: !haveData }, () => {
  const { data, rows } = shipped();
  assert.notEqual(routeTotals(rows).total, null, 'every route town is priced');
  for (const id of WEEK_PLACES) {
    assert.ok(data.destinations[id], `${id} is in the catalogue`);
    assert.ok(weekSum(placeDay(rows, id), 7, null), `${id} has a bed and a food price`);
  }
});

test('every chapter clip and its poster exist in all six languages, inside the budget', () => {
  for (const lang of CLIP_LANGS) {
    for (const c of CHAPTERS) {
      const mp4 = join(pub, clipSrc(lang, c.id));
      const poster = join(pub, clipSrc(lang, c.id, 'poster'));
      assert.ok(existsSync(mp4), `${lang}/${c.id}.mp4`);
      assert.ok(existsSync(poster), `${lang}/${c.id}.webp`);
      const size = statSync(mp4).size;
      assert.ok(size > 20000 && size < 1600000, `${lang}/${c.id}.mp4 is ${size} bytes`);
    }
  }
});

// ---- the strings ----------------------------------------------------------

const homeKeys = (cat) => Object.keys(cat).filter((k) => k.startsWith('home.')).sort();
const vars = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');

test('every language carries the same home strings with the same placeholders', () => {
  const ref = homeKeys(en);
  assert.ok(ref.length >= 60, `en has ${ref.length} home strings`);
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    assert.deepEqual(homeKeys(cat), ref, `${lang} home keys`);
    for (const k of ref) assert.equal(vars(cat[k]), vars(en[k]), `${lang} ${k} placeholders`);
  }
});

test('the retired home strings are gone', () => {
  const retired = ['home.tryLabel', 'home.try2', 'home.try3', 'home.deskAlt', 'home.tripAlt', 'home.chapterPos',
    'home.addsTitle', 'home.promise1', 'home.promise2', 'home.promise3', 'home.credits', 'home.aDay', 'home.planStory'];
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    for (const k of retired) assert.equal(cat[k], undefined, `${lang} ${k}`);
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
      assert.ok(!/\best\./i.test(s), `${lang} ${k} writes the retired estimate word: ${s}`);
      // A catalogue count is three or more digits, or a grouped figure.
      assert.ok(!/\d{3,}|\d[.,]\d{3}/.test(s), `${lang} ${k} carries a count: ${s}`);
      for (const w of BANNED[lang] || []) {
        assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(s), `${lang} ${k} uses "${w}": ${s}`);
      }
    }
  }
  // The headline has no terminal punctuation (carta-design, Copy).
  for (const [lang, cat] of Object.entries(CATALOGS)) assert.ok(!/[.!]$/.test(cat['home.title']), `${lang} home.title`);
});
