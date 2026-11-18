// G12 (decision.md step 8): which filter chips show where, kept pure so the
// node tests can hold the rules without rendering the tab.

// Chips a desktop already shows as a control of its own: the toolbar's
// Saved toggle. G12: the quick row and Strong match left with the filter
// pane, so every other filter (a rail's See all, Ask) shows as a chip.
export const DESK_SHOWN = /^fav$/;

// The phone row draws Saved as its own toggle, so the saved chip is not drawn
// twice; it still counts, so the badge equals what the row shows as on.
export const phoneChips = (chips) => chips.filter((c) => c.key !== 'fav');

// The Filters badge: one per chip, Saved and countries too.
export const badgeCount = (chips) => chips.length;

// What moves the page off the overview. Countries belong to the trip, so
// they do not leave it.
export const lensCount = (chips) => chips.filter((c) => !c.key.startsWith('c:')).length;

// The chips a desktop draws in its one-line row.
export const deskChips = (chips) => chips.filter((c) => !DESK_SHOWN.test(c.key));
