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
  // G12 round 2: the search text is in the field, so it is no chip and
  // does not count.
  assert.equal(badgeCount(many), 7);
  assert.equal(badgeCount([]), 0);
  // The phone row shows every chip but the search, Saved included (its
  // toggle is in the Filters sheet), so the count equals the row.
  const phone = phoneChips(many);
  assert.equal(phone.length, badgeCount(many));
  assert.ok(phone.some((c) => c.key === 'fav'));
  assert.ok(!phone.some((c) => c.key === 'q'));
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  assert.doesNotMatch(bar, /xfilters-n|<TripDock/);
});

test('countries do not leave the overview; other chips do', () => {
  assert.equal(lensCount([chip('c:IT')]), 0);
  assert.equal(lensCount([chip('c:IT'), chip('budget')]), 1);
});

test('a desktop chip row leaves out Saved (the row toggle) and the search (the field); a See all lens shows as a chip', () => {
  assert.ok(DESK_SHOWN.test('fav'));
  assert.ok(DESK_SHOWN.test('q'));
  for (const k of ['budget', 'month', 'rating', 'nocar', 'p:sea', 't:20']) assert.ok(!DESK_SHOWN.test(k), k);
  assert.deepEqual(deskChips(many).map((c) => c.key), ['budget', 'month', 'c:IT', 'c:FR', 'c:ES', 'nocar']);
});

test('the applied row: Filters leads on a phone, then the chips, then Clear all; tools at the desktop end', () => {
  // G12 round 2 (decision.md section 2): one row, one chip style.
  const src = read('src/browse/filters/AppliedRow.jsx');
  const row = src.slice(src.indexOf('<div ref={rowRef}'));
  const order = ['xap-filters', 'xap-chip"', 'xap-clear', 'xap-tools'];
  let at = -1;
  for (const k of order) {
    const i = row.indexOf(k);
    assert.ok(i > at, `${k} in order`);
    at = i;
  }
  assert.match(row, /title=\{c\.label\}/);
  // The remove is its own button, named for what it removes.
  assert.match(row, /<IconButton className="xap-x" label=\{t\('filter\.removeChip', \{ name: c\.label \}\)\}/);
  assert.match(row, /role="status"/);
  const bar = read('src/browse/explore/ExploreToolbar.jsx');
  assert.doesNotMatch(bar, /PhoneTools|xtools|viewSwitch|xov-back/);
  assert.match(bar, /\{sortMenu\}\s*<SavedToggle/);
});

test('the chips are capped with an ellipsis; the phone row never wraps', () => {
  const css = read('src/styles/83-filters.css');
  assert.match(css, /\.xap-text \{[^}]*text-overflow: ellipsis;/);
  assert.match(css, /max-width: min\(70vw, 280px\)/);
  // Only the chips scroll on a phone; Filters and Clear all never shrink, so
  // Clear all is never cut (judge 1, "Cle" at 390).
  assert.match(css, /\.xap\.is-phone \.xap-chips > \.xap-scroll \{[^}]*overflow-x: auto;[^}]*mask-image: linear-gradient/);
  assert.match(css, /\.xap\.is-phone \.xap-chips > \* \{ flex: none; \}/);
  const src = read('src/browse/filters/AppliedRow.jsx');
  const scroller = src.slice(src.indexOf('className={`xap-scroll'), src.indexOf('className="xap-clear"'));
  assert.ok(scroller.lastIndexOf('</div>') > scroller.indexOf('xap-chip"'), 'Clear all stands after the scroller, outside it');
  // The remove's 44 px box spills over the 32 px chip.
  assert.match(css, /margin: calc\(\(32px - var\(--tap\)\) \/ 2\)/);
});
