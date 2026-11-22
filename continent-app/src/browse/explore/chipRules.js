// G12 (decision.md step 8): which filter chips show where, kept pure so the
// node tests can hold the rules without rendering the tab.
// G12 round 2 (Explore top 2): one applied row on both widths. The search
// text is never a chip there (the field shows it); a desktop draws Saved as
// the row's own toggle at its right end, a phone as a chip.

// Chips a desktop already shows as a control of its own: the row's Saved
// toggle. The search chip is in the field.
export const DESK_SHOWN = /^(fav|q)$/;

// The phone row: every chip but the search, Saved included (its toggle is
// in the Filters sheet).
export const phoneChips = (chips) => chips.filter((c) => c.key !== 'q');

// The Filters count: one per chip the applied row can show, the search
// text excepted.
export const badgeCount = (chips) => chips.filter((c) => c.key !== 'q').length;

// What moves the page off the overview. Countries belong to the trip, so
// they do not leave it.
export const lensCount = (chips) => chips.filter((c) => !c.key.startsWith('c:')).length;

// The chips a desktop draws in its row.
export const deskChips = (chips) => chips.filter((c) => !DESK_SHOWN.test(c.key));

// Each applied chip a quick chip on the map can show, by the quick chip's
// id (filterModel.js QUICK). Score, budget and match only at the quick
// chip's own value: Score 9+ is no quick chip.
export const QUICK_OF = Object.freeze({
  minScore: 'score8', budget: 'budget', 't:warm': 'warm', 'p:water': 'water',
  'p:hiking': 'hiking', gem: 'gems', minMatch: 'match', fav: 'saved',
});

// The applied row over the map from 769 px (judgement-6): a filter the quick
// row already shows checked is not drawn again above the map, so a quick
// filter shows once and the map keeps its place under the tabs. `quick` is
// the quick row's [{ id, on }].
export const mapRowChips = (chips, quick = []) => {
  const on = new Set(quick.filter((q) => q.on).map((q) => q.id));
  return deskChips(chips).filter((c) => !on.has(QUICK_OF[c.key]));
};
