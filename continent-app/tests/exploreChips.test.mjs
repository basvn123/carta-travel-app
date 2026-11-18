// G12 (decision.md step 8): the filter strip. Strong match is a chip that
// counts in the badge and goes with Clear all and the lens clear; the badge
// equals the chips; each width draws a chip once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DESK_SHOWN, badgeCount, deskChips, lensCount, phoneChips,
} from '../src/browse/explore/chipRules.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const chip = (key) => ({ key, label: key, remove: () => {} });
const many = ['strong', 'fav', 'budget', 'month', 'c:IT', 'c:FR', 'c:ES', 'nocar', 'q'].map(chip);

test('Strong match is a chip with its own remove', () => {
  const src = read('src/browse/explore/useExploreChips.js');
  assert.match(src, /if \(strongOnly && setStrongOnly\) list\.push\(\{ key: 'strong', label: t\('fit\.strong'\), remove: \(\) => setStrongOnly\(false\) \}\)/);
});

test('Clear all clears Strong match and Saved too', () => {
  const src = read('src/browse/explore/useExploreChips.js');
  const reset = src.slice(src.indexOf('const resetAll'), src.indexOf('};', src.indexOf('const resetAll')));
  assert.match(reset, /setStrongOnly\?\.\(false\)/);
  assert.match(reset, /setShowFavOnly\(false\)/);
});

test('the lens clear clears Strong match', () => {
  const src = read('src/browse/ExploreTab.jsx');
  const clear = src.slice(src.indexOf('clear: () => {'), src.indexOf('setPickedId(null);'));
  assert.match(clear, /setStrongOnly\(false\)/);
  assert.match(clear, /setShowFavOnly\(false\)/);
});

test('the badge equals the chips, Strong match, Saved and countries included', () => {
  assert.equal(badgeCount(many), 9);
  assert.equal(badgeCount([]), 0);
  // The phone row shows Saved as its pressed toggle plus every other chip.
  const phone = phoneChips(many);
  assert.equal(phone.length + 1, badgeCount(many));
  assert.ok(!phone.some((c) => c.key === 'fav'));
  assert.ok(phone.some((c) => c.key === 'strong'));
  // G12 (Explore top): the Filters button and its count left the toolbar.
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  assert.doesNotMatch(bar, /xfilters-n|<TripDock/);
});

test('Strong match and countries do not leave the overview; other chips do', () => {
  assert.equal(lensCount([chip('strong'), chip('c:IT')]), 0);
  assert.equal(lensCount([chip('strong'), chip('budget')]), 1);
});

test('a desktop chip row leaves out what the quick row and the toolbar show', () => {
  for (const k of ['s:city', 'role', 'budget', 'bmin', 'month', 'rating', 'fh', 'fav', 'strong']) {
    assert.ok(DESK_SHOWN.test(k), k);
  }
  assert.deepEqual(deskChips(many).map((c) => c.key), ['c:IT', 'c:FR', 'c:ES', 'nocar', 'q']);
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
