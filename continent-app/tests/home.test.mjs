// The home page (T462, src/lib/homeDemo.js and the home.* strings).
// Run: npm test (continent-app/)
//
// The fixtures pin the demo's arithmetic, the projection and the fallbacks.
// The real-data tests run when public/app_data.json and
// public/search/guided.json are present: the story must build from the
// shipped catalogue and its search must return its towns in Explore. The
// catalog tests keep the six languages in step and the copy inside the house
// rules (no dashes, no middots, no euro sign, no banned words, no counts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STORY, SEARCHES, KINDS, SCENES, buildDemo, project, isEstimate, kindPhotos, exploreHref,
} from '../src/lib/homeDemo.js';
import { computeCosts } from '../src/lib/costIndex.js';
import { matchAll, VIBE_MIN, vibeScore, areasOf } from '../src/lib/guidedSearch.js';
import { en } from '../src/i18n/en.js';
import { nl } from '../src/i18n/nl.js';
import { de } from '../src/i18n/de.js';
import { fr } from '../src/i18n/fr.js';
import { es } from '../src/i18n/es.js';
import { it as itCat } from '../src/i18n/it.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const CATALOGS = { en, nl, de, fr, es, it: itCat };

const dest = (id, over = {}) => ({
  city: id.replace('gem:', ''), iso2: 'FR', country: 'France',
  city_lat: 45.9, city_lon: 6.1,
  image: { url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${id}.jpg/960px-${id}.jpg`, credit: id },
  rating: { score: 8 }, climate: { best: [6, 7, 8] },
  ...over,
});
const cost = (dayEur, level = 'city') => ({ dayEur, stayLevel: level, foodLevel: level });

function storyFixture() {
  const destinations = {
    'gem:bled': dest('gem:bled', { iso2: 'SI', city_lat: 46.3683, city_lon: 14.1146 }),
    'gem:bohinj': dest('gem:bohinj', { iso2: 'SI', city_lat: 46.2792, city_lon: 13.881 }),
    'gem:zell-am-see': dest('gem:zell-am-see', { iso2: 'AT', city_lat: 47.3236, city_lon: 12.7966 }),
    LJU: dest('LJU', { iso2: 'SI', city_lat: 46.0508, city_lon: 14.5062 }),
  };
  const indices = new Map([
    ['LJU', cost(87.4, 'country')],
    ['gem:zell-am-see', cost(112.05)],
    ['gem:bled', cost(101.333)],
    ['gem:bohinj', cost(140.99)],
  ]);
  return { destinations, indices };
}

test('the story builds, and its trip lines add up to the total to the cent', () => {
  const { destinations, indices } = storyFixture();
  const demo = buildDemo(destinations, indices);
  assert.equal(demo.state, 'story');
  assert.deepEqual(demo.results.map((r) => r.id), STORY.results);
  assert.equal(demo.place.id, STORY.open);
  assert.deepEqual(demo.trip.lines.map((l) => [l.id, l.nights]), STORY.trip);
  // 2 x 87.40 + 3 x 101.33 + 2 x 140.99, each day figure taken to the cent first.
  assert.deepEqual(demo.trip.lines.map((l) => l.cents), [17480, 30399, 28198]);
  assert.equal(demo.trip.totalCents, 17480 + 30399 + 28198);
  assert.equal(demo.trip.lines.reduce((s, l) => s + l.cents, 0), demo.trip.totalCents);
  assert.equal(demo.trip.lines[0].est, true, 'a country-level figure carries the estimate mark');
  assert.equal(demo.trip.lines[1].est, false);
  assert.equal(demo.trip.est, true);
  assert.equal(demo.route.points.length, 3);
  assert.equal(demo.route.legs.length, 2);
  for (const l of demo.route.legs) assert.ok(Number.isFinite(l.ctrl.x) && Number.isFinite(l.ctrl.y));
  assert.equal(demo.route.labels.length, 3);
  for (const l of demo.route.labels) {
    assert.ok(l.x > 0 && l.x < 320, `label x ${l.x}`);
    assert.ok(l.y > 0 && l.y < 150, `label y ${l.y}`);
  }
});

test('a question keeps its facets in its address, so a new tab opens it', () => {
  assert.equal(exploreHref({ vibe: 'lake', area: 'alps', month: 7 }), '?tab=map&xe=lake&xa=alps&xm=7');
  assert.equal(exploreHref({ vibe: 'beach', country: 'PT', budget: 80 }), '?tab=map&xe=beach&xc=PT&xb=80');
  assert.equal(exploreHref({ vibe: 'oldtown', nocar: true }), '?tab=map&xe=oldtown&xp=c');
  assert.equal(exploreHref(), '?tab=map');
  for (const s of SEARCHES) assert.match(exploreHref(s.facets), /^\?tab=map&xe=/);
});

test('the estimate mark is the card predicate', () => {
  assert.equal(isEstimate(cost(50, 'city')), false);
  assert.equal(isEstimate({ dayEur: 50, stayLevel: 'city', foodLevel: 'country' }), true);
  assert.equal(isEstimate({ dayEur: null }), false);
  assert.equal(isEstimate(null), false);
});

test('projected points sit inside the drawing, with the margin kept', () => {
  const pts = project([{ lat: 45.9, lon: 6.13 }, { lat: 45.92, lon: 6.87 }, { lat: 46.02, lon: 7.75 }], 320, 150, 28);
  for (const p of pts) {
    assert.ok(p.x >= 27.9 && p.x <= 292.1, `x ${p.x}`);
    assert.ok(p.y >= 27.9 && p.y <= 122.1, `y ${p.y}`);
  }
  // West stays west, north stays up.
  assert.ok(pts[0].x < pts[1].x && pts[1].x < pts[2].x);
  assert.ok(pts[2].y < pts[0].y);
  assert.deepEqual(project([]), []);
  const one = project([{ lat: 45, lon: 6 }]);
  assert.equal(one.length, 1);
  assert.ok(Number.isFinite(one[0].x) && Number.isFinite(one[0].y));
});

test('a missing story town falls back to the best rated towns of one country', () => {
  const { destinations, indices } = storyFixture();
  delete destinations.LJU;
  delete destinations['gem:bohinj'];
  destinations['gem:a'] = dest('gem:a', { iso2: 'IT', country: 'Italy', city_lon: 9, rating: { score: 9 } });
  destinations['gem:b'] = dest('gem:b', { iso2: 'IT', country: 'Italy', city_lon: 11, rating: { score: 7 } });
  destinations['gem:c'] = dest('gem:c', { iso2: 'IT', country: 'Italy', city_lon: 10, rating: { score: 8 } });
  destinations['gem:d'] = dest('gem:d', { iso2: 'IT', country: 'Italy', city_lon: 12, rating: { score: 6 } });
  for (const k of ['gem:a', 'gem:b', 'gem:c', 'gem:d']) indices.set(k, cost(60));
  const demo = buildDemo(destinations, indices);
  assert.equal(demo.state, 'fallback');
  assert.equal(demo.query.key, 'home.queryCountry');
  assert.equal(demo.query.country, 'IT');
  assert.deepEqual(demo.results.map((r) => r.id), ['gem:a', 'gem:c', 'gem:b']);
  // The trip runs west to east.
  assert.deepEqual(demo.trip.stops.map((s) => s.id), ['gem:a', 'gem:c', 'gem:b']);
});

test('no data, no indices or an unpriceable catalogue says nothing and never throws', () => {
  assert.equal(buildDemo(null, null).state, 'none');
  assert.equal(buildDemo({}, new Map()).state, 'none');
  const { destinations } = storyFixture();
  assert.equal(buildDemo(destinations, new Map()).state, 'none');
  assert.equal(buildDemo(destinations, null).state, 'none');
});

test('every trip kind has a photo source, and a missing one is null', () => {
  assert.equal(KINDS.length, 6);
  const photos = kindPhotos({ types: [{ slug: 'rail', hero: { url: 'u', author: 'A', licence: 'CC0' } }] }, {});
  assert.equal(photos.trips.url, 'u');
  assert.equal(photos.trails, null);
  assert.equal(photos.lakes, null);
  assert.equal(photos.mountains, null);
  assert.deepEqual(Object.keys(photos), KINDS.map((k) => k.key));
});

test('scenes hold long enough to read and short enough to move', () => {
  assert.deepEqual(SCENES.map((s) => s.id), ['search', 'place', 'trip', 'share']);
  for (const s of SCENES) assert.ok(s.ms >= 3500 && s.ms <= 6000, `${s.id} ${s.ms}`);
});

const appData = join(pub, 'app_data.json');
const guidedFile = join(pub, 'search', 'guided.json');
const journeysFile = join(pub, 'journeys', 'index.json');

test('the shipped catalogue tells the story, not the fallback', { skip: !existsSync(appData) }, () => {
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const indices = computeCosts(data.destinations, {});
  const demo = buildDemo(data.destinations, indices);
  assert.equal(demo.state, 'story');
  assert.equal(demo.trip.lines.reduce((s, l) => s + l.cents, 0), demo.trip.totalCents);
  for (const r of [...demo.results, demo.place, ...demo.trip.stops]) {
    assert.ok(r.image, `${r.id} has a photo`);
    assert.ok(r.cost.dayEur > 0, `${r.id} is priced`);
  }
});

test('the story search returns its three towns in Explore', { skip: !existsSync(appData) || !existsSync(guidedFile) }, () => {
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const guided = JSON.parse(readFileSync(guidedFile, 'utf8'));
  for (const id of STORY.results) {
    const d = data.destinations[id];
    const p = { id, iso2: d.iso2, climate: d.climate, cost: null };
    assert.ok(vibeScore(guided, id, STORY.seed.vibe) >= VIBE_MIN, `${id} reads as ${STORY.seed.vibe}`);
    assert.ok(areasOf(guided, id).includes(STORY.seed.area), `${id} is in ${STORY.seed.area}`);
    assert.ok(matchAll(p, STORY.seed, { guided, nearRow: null }), `${id} matches the whole question`);
  }
});

test('every search offered under the hero returns at least three places today', { skip: !existsSync(appData) || !existsSync(guidedFile) }, () => {
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const guided = JSON.parse(readFileSync(guidedFile, 'utf8'));
  const indices = computeCosts(data.destinations, {});
  const rows = Object.entries(data.destinations).map(([id, d]) => ({
    id, iso2: d.iso2, climate: d.climate, crowding: d.crowding,
    local_transport: d.local_transport, cost: indices.get(id),
  }));
  for (const s of SEARCHES) {
    const hits = rows.filter((p) => matchAll(p, s.facets, { guided, nearRow: null })).length;
    assert.ok(hits >= 3, `${s.key} returns ${hits}`);
  }
});

test('every trip kind has its photo in the shipped data', { skip: !existsSync(journeysFile) || !existsSync(appData) }, () => {
  const ix = JSON.parse(readFileSync(journeysFile, 'utf8'));
  const data = JSON.parse(readFileSync(appData, 'utf8'));
  const photos = kindPhotos(ix, data.destinations);
  for (const k of KINDS) assert.ok(photos[k.key]?.url, `${k.key} has a photo`);
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
