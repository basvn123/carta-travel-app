// G12 (decision.md step 8, Explore top): the filter strip. The filter pane,
// its quick row and Strong match left Explore; what a rail's See all or Ask
// sets shows as a chip; the badge equals the chips; each width draws a chip
// once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DESK_SHOWN, badgeCount, deskChips, lensCount, phoneChips,
} from '../src/browse/explore/chipRules.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const chip = (key) => ({ key, label: key, remove: () => {} });
const many = ['fav', 'budget', 'month', 'c:IT', 'c:FR', 'c:ES', 'nocar', 'q'].map(chip);

test('Strong match and the pane-only filters are gone; Clear all and the lens clear keep Saved', () => {
  const chips = read('src/browse/explore/useExploreChips.js');
  const tab = read('src/browse/ExploreTab.jsx');
  for (const src of [chips, tab, read('src/hooks/useExploreCatalog.js')]) {
    assert.doesNotMatch(src, /strongOnly|setStrongOnly|strongMatch/);
  }
  // Kind, Good for, budget floor, flight limit, best of, near the sea: no state, no chip.
  assert.doesNotMatch(chips, /xf\.(kinds|roles|bmin|fh|sea|badged)\b/);
  assert.doesNotMatch(tab, /\b(kinds|roles|bmin|fh|sea|badged): /);
  const reset = chips.slice(chips.indexOf('const resetAll'), chips.indexOf('};', chips.indexOf('const resetAll')));
  assert.match(reset, /setShowFavOnly\(false\)/);
  const clear = tab.slice(tab.indexOf('clear: () => {'), tab.indexOf('setPickedId(null);'));
  assert.match(clear, /setShowFavOnly\(false\)/);
});

test('the badge equals the chips, Saved and countries included', () => {
  assert.equal(badgeCount(many), 8);
  assert.equal(badgeCount([]), 0);
  // The phone row shows Saved as its pressed toggle plus every other chip.
  const phone = phoneChips(many);
  assert.equal(phone.length + 1, badgeCount(many));
  assert.ok(!phone.some((c) => c.key === 'fav'));
  assert.ok(phone.some((c) => c.key === 'budget'));
  // G12 (Explore top): the Filters button and its count left the toolbar.
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  assert.doesNotMatch(bar, /xfilters-n|<TripDock/);
});

test('countries do not leave the overview; other chips do', () => {
  assert.equal(lensCount([chip('c:IT')]), 0);
  assert.equal(lensCount([chip('c:IT'), chip('budget')]), 1);
});

test('a desktop chip row leaves out only Saved (the toolbar toggle); a See all lens shows as a chip', () => {
  assert.ok(DESK_SHOWN.test('fav'));
  for (const k of ['budget', 'month', 'rating', 'nocar']) assert.ok(!DESK_SHOWN.test(k), k);
  assert.deepEqual(deskChips(many).map((c) => c.key), ['budget', 'month', 'c:IT', 'c:FR', 'c:ES', 'nocar', 'q']);
});

test('the phone row is Sort, then the chips with Clear all first', () => {
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  const phone = bar.slice(bar.indexOf('function PhoneTools'), bar.indexOf('export function ExploreToolbar'));
  const order = ['xtools-sort', 'xtools-chips', 'xtools-clear', 'xtools-saved', 'xtools-chip"'];
  let at = -1;
  for (const k of order) {
    const i = phone.indexOf(k);
    assert.ok(i > at, `${k} in order`);
    at = i;
  }
  // Share and Countries left the phone row (search field, Filters sheet).
  assert.doesNotMatch(phone, /shareView|CountriesButton/);
  assert.match(phone, /title=\{c\.label\}/);
});

test('the chips are capped with an ellipsis and the row never wraps', () => {
  const css = read('src/styles/84-explore-overview.css');
  assert.match(css, /\.xtools\.xtools--phone \{[^}]*flex-wrap: nowrap;[^}]*min-width: 0;/);
  assert.match(css, /max-width: min\(60vw, 220px\)/);
  assert.match(css, /\.xchip-text \{[^}]*text-overflow: ellipsis;/);
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /\.xtools--phone \.xtools-clear \{[^}]*position: sticky;/);
});
