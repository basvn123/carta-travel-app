// G12 (Explore top, decision.md APPROVED 2026-11-18): the band, its chips,
// the heart, the new glyphs, the removed filter doors and the frozen order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reorder } from '../src/browse/band/frozenOrder.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the band sits in the top bar on Explore and its layers, Settings mounted once', () => {
  const app = read('src/App.jsx');
  assert.match(app, /<ExploreBand head=\{appHeader\} places=\{activeTab === 'map'\}/);
  assert.doesNotMatch(app, /<SearchDock /);
  assert.equal(app.match(/<SettingsSheet \/>/g)?.length, 1);
});

test('Settings is a desktop Places button; chips open their step or the studio', () => {
  const band = read('src/browse/band/ExploreBand.jsx');
  assert.match(band, /\{places && isDesktop && \(/);
  assert.match(band, /toggleSettings\(\{ step: 'overview' \}\)/);
  assert.match(band, /<HouseIcon\.fader size=\{22\} \/>/);
  const chips = read('src/browse/band/SummaryChips.jsx');
  assert.match(chips, /isStyle \? openStudio\(ts\) : openSettings\(\{ step: it\.step \|\| 'overview' \}\)/);
  assert.match(chips, /settingsSummary\(s\.model \?\? s, style, t/);
  const css = read('src/styles/80-band.css');
  assert.match(css, /scroll-snap-type: x proximity/);
  assert.match(css, /min-height: var\(--tap\)/);
});

test('the style door is always the heart', () => {
  for (const f of ['src/components/dock/StyleDock.jsx']) {
    const s = read(f);
    assert.match(s, /<HeartIcon size=/, f);
    assert.doesNotMatch(s, /styleIcon\(/, f);
  }
});

test('the fader, the euro and six tab glyphs on one ground line', () => {
  const icons = read('src/components/HouseIcons.jsx');
  for (const k of ['fader', 'euro', 'places', 'trails', 'beaches', 'lakes', 'mountains', 'cycling']) {
    assert.match(icons, new RegExp(`\\n  ${k}: glyph\\('${k}'`), k);
  }
  assert.match(read('src/browse/ExploreCategories.jsx'), /shortKey: 'band\.peaks'/);
});

test('the filter pane and its doors left the top of Explore', () => {
  const tab = read('src/browse/ExploreTab.jsx');
  for (const re of [/<ExploreFilterRail/, /<PlacesFilterSheet/, /<ExploreQuickFilters/, /<PriceViewSwitch/, /strongToggle/, /<TripDock/]) {
    assert.doesNotMatch(tab, re);
  }
  assert.doesNotMatch(read('src/browse/explore/OverviewHero.jsx'), /allFilters|<TripDock|strongChip/);
  assert.match(tab, /useFrozenOrder\(frozen, toFreeze\)/);
});

test('the frozen order keeps known rows in place and new ones after', () => {
  const snap = new Map([['a', 0], ['b', 1], ['c', 2]]);
  const rows = [{ id: 'c' }, { id: 'x' }, { id: 'a' }, { id: 'b' }];
  assert.deepEqual(reorder(rows, snap).map((r) => r.id), ['a', 'b', 'c', 'x']);
  assert.equal(reorder(rows, null), rows);
});

// G12 round 2, m1: the phone fold resized its rows, so the top bar and the
// list's column moved with it (CLS 0.42 at 360 de over one scroll).
test('the phone fold slides the band with a transform; the list never moves', () => {
  const css = read('src/styles/80-band.css');
  assert.doesNotMatch(css, /grid-template-rows: 0fr/);
  assert.match(css, /\.band\.is-phone\.is-tucked > \* \{ transform: translateY\(calc\(var\(--fold-a, 0px\) \* -1\)\); \}/);
  assert.match(css, /transition: transform var\(--dur-2\) var\(--ease-out\), opacity var\(--dur-2\) var\(--ease-out\);/);
  // The lists scroll under the band, its height their top padding and scroll padding.
  assert.match(css, /html\.has-phone-band \.places-tab \{\s*top: 0;\s*padding-top: var\(--filter-h\);\s*scroll-padding-top: var\(--filter-h\);/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[\s\S]*?\.band\.is-phone > \*,/);
  const band = read('src/browse/band/ExploreBand.jsx');
  assert.match(band, /band\.style\.setProperty\('--fold-a'/);
  assert.match(band, /root\.classList\.add\('has-phone-band'\)/);
});
