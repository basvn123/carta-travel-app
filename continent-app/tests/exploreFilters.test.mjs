// G12, Explore top round 2 (decision.md section 2): the filters' model, the
// shortcuts' one label, the store Lane 2's band reads and the tab's wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TEMP_BANDS, BUDGET_STEPS, SHORTCUTS, SORT_OPTIONS, appliedChips, bandLabel, countNoTemp, labelForApplied,
  parsePicks, parseTemps, picksOk, rankVibe, shortcutOn, shortcutPatch, sortShown, tempOk,
} from '../src/browse/filters/filterModel.js';
import {
  applyShortcut, closeFilters, filtersState, openFilters, publishFilters, setFilterHandlers,
} from '../src/browse/filters/filtersStore.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const t = (k, v = {}) => `${k}${Object.keys(v).length ? JSON.stringify(v) : ''}`;
const highs = (june) => ({ taste: { tmax_by_month: [5, 6, 10, 15, 19, june, 24, 23, 20, 15, 10, 6] } });

test('the day high: bands are [lo, hi), several bands add up, no figure never matches', () => {
  assert.deepEqual(TEMP_BANDS.map((b) => b.id), ['15', '20', '25', '30']);
  assert.ok(tempOk(highs(20), 6, ['20']));
  assert.ok(!tempOk(highs(20), 6, ['15']));
  assert.ok(tempOk(highs(19), 6, ['15', '20']));
  assert.ok(tempOk(highs(34), 6, ['30']));
  assert.ok(!tempOk(highs(14), 6, ['15', '20', '25', '30']));
  assert.ok(!tempOk({ taste: null }, 6, ['20']));
  assert.equal(countNoTemp([highs(20), {}, { taste: { tmax_by_month: [] } }], 6), 2);
  assert.equal(bandLabel('20', t), 'filters.tempBand{"lo":20,"hi":25}');
  assert.equal(bandLabel('30', t), 'filters.tempOver{"lo":30}');
  assert.deepEqual(parseTemps(['30', 'x', '15', '15']), ['15', '30']);
});

test('the picks: any inside water, size and feel; all inside walking; AND between groups', () => {
  const guided = { d: { a: { v: { hiking: 70, oldtown: 60 } }, b: { v: { hiking: 70 } } } };
  const coast = { id: 'a', iso2: 'IT', categories: ['coast'], place: { class: 'town' } };
  const balaton = { id: 'c', iso2: 'HU', categories: ['coast'], place: { class: 'village' } };
  assert.ok(picksOk(coast, ['sea'], guided));
  assert.ok(!picksOk(balaton, ['sea'], guided), 'a landlocked coast is a lake shore');
  assert.ok(picksOk(balaton, ['lake'], guided));
  assert.ok(picksOk(coast, ['sea', 'lake'], guided), 'water is any');
  assert.ok(picksOk(coast, ['hiking', 'oldtown'], guided), 'walking is all');
  assert.ok(!picksOk({ id: 'b', categories: [] }, ['hiking', 'oldtown'], guided));
  assert.ok(picksOk(coast, ['city', 'town'], guided), 'size is any');
  assert.ok(!picksOk(coast, ['sea', 'village'], guided), 'groups are AND');
  assert.ok(picksOk({ id: 'm', place: { class: 'metro' } }, ['city'], guided), 'a metro is a city');
  assert.ok(!picksOk(coast, ['hiking'], null), 'a vibe pick waits for the guided data');
  assert.deepEqual(parsePicks(['beach', 'island', 'city', 'island']), ['city', 'island']);
  assert.equal(rankVibe(['city', 'hiking']), 'hiking');
  assert.equal(rankVibe(['city']), null);
});

test('budget steps are fixed and the sort is the four of the decision', () => {
  assert.deepEqual([...BUDGET_STEPS], [50, 75, 100, 150]);
  assert.deepEqual(SORT_OPTIONS.map((o) => o.key), ['beauty', 'cost', 'rating', 'name']);
  assert.equal(sortShown('country'), 'beauty');
  assert.equal(sortShown('cost'), 'cost');
});

test('a shortcut sets one filter and its chip wears the shortcut words', () => {
  assert.deepEqual(SHORTCUTS.map((s) => s.id), ['top', 'hiking', 'oldtown', 'sea', 'island', 'lake', 'gems']);
  const xf = { verdicts: [], picks: [] };
  assert.deepEqual(shortcutPatch('top', true, xf), { xf: { verdicts: ['excellent'] } });
  assert.deepEqual(shortcutPatch('gems', true, xf), { gemOnly: true });
  assert.deepEqual(shortcutPatch('hiking', true, { picks: ['sea'] }), { xf: { picks: ['sea', 'hiking'] } });
  assert.deepEqual(shortcutPatch('hiking', false, { picks: ['sea', 'hiking'] }), { xf: { picks: ['sea'] } });
  assert.ok(shortcutOn('top', { xf: { verdicts: ['excellent'] } }));
  assert.ok(!shortcutOn('top', { xf: { verdicts: ['very_good'] } }));
  assert.ok(shortcutOn('hiking', { xf: { picks: ['hiking'] } }));
  // One label before and after applying (proposal B, labelForApplied).
  for (const s of SHORTCUTS) {
    const key = s.id === 'top' ? 'rating' : s.id === 'gems' ? 'gem' : `p:${s.id}`;
    assert.equal(labelForApplied(key, t, { verdicts: ['excellent'] }), s.labelKey, s.id);
  }
  assert.equal(labelForApplied('rating', t, { verdicts: ['very_good'] }), null);
  assert.deepEqual(appliedChips([{ key: 'q' }, { key: 'p:sea' }]).map((c) => c.key), ['p:sea']);
});

test('the store: open, publish and applyShortcut reach the tab', () => {
  const calls = [];
  setFilterHandlers({ applyShortcut: (id, on) => calls.push([id, on]) });
  applyShortcut('sea');
  applyShortcut('sea', false);
  assert.deepEqual(calls, [['sea', true], ['sea', false]]);
  publishFilters({ count: 2, total: 46, shortcuts: [{ id: 'sea', label: 'By the sea', on: true }] });
  const a = filtersState();
  publishFilters({ count: 2, total: 46, shortcuts: [{ id: 'sea', label: 'By the sea', on: true }] });
  assert.equal(filtersState(), a, 'no change, no new state');
  openFilters({ group: 'water' });
  assert.equal(filtersState().isOpen, true);
  assert.equal(filtersState().group, 'water');
  closeFilters();
  assert.equal(filtersState().isOpen, false);
});

test('the tab: URL keys, every filter cleared, the sheet mounted, the phone shortcut row gone', () => {
  const tab = read('src/browse/ExploreTab.jsx');
  assert.match(tab, /setOrDrop\('xk', xf\.picks\.join\(','\)\)/);
  assert.match(tab, /setOrDrop\('xt', xf\.temps\.join\(','\)\)/);
  assert.match(tab, /temps: parseTemps\(list\('xt'\)\),\s*picks: parsePicks\(list\('xk'\)\)/);
  assert.match(tab, /<FilterSheet desktop=\{isDesktop\}/);
  assert.match(tab, /setFilterHandlers\(\{ applyShortcut \}\)/);
  assert.doesNotMatch(tab, /xsub--rails|FilterChips|explore\.regionFilter/);
  const chips = read('src/browse/explore/useExploreChips.js');
  assert.match(chips, /temps: \[\], picks: \[\] \}\)/);
  assert.match(chips, /setXf\(\{ \.\.\.XF_EMPTY \}\)/);
  assert.match(read('src/browse/explore/useExploreLens.js'), /'xk', 'xt'/);
  const rows = read('src/browse/explore/useExploreRows.js');
  assert.match(rows, /dxf\.temps\.length && travelMonth && !tempOk\(p, travelMonth, dxf\.temps\)/);
  assert.match(rows, /dxf\.picks\.length && !picksOk\(p, dxf\.picks, guided\)/);
});

test('every filters key exists in all six languages, without dashes', () => {
  const en = read('src/i18n/en.js');
  const keys = [...en.matchAll(/"(filters\.[a-zA-Z]+)":/g)].map((m) => m[1]);
  assert.ok(keys.length >= 40);
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const cat = read(`src/i18n/${lang}.js`);
    for (const k of keys) {
      const line = cat.split(/\r?\n/).find((l) => l.includes(`"${k}"`));
      assert.ok(line, `${lang} ${k}`);
      assert.doesNotMatch(line, /[–—]/, `${lang} ${k}`);
    }
  }
});
