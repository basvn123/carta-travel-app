// G12 (decision.md step 8): which filter chips show where, kept pure so the
// node tests can hold the rules without rendering the tab.

// Chips a desktop already shows as a control of its own: the quick row's six
// (trip type, good for, budget, month, rating, flight) and the toolbar's
// Saved and Strong match toggles. Its chip row leaves them out.
export const DESK_SHOWN = /^(s:|role$|budget$|bmin$|month$|rating$|fh$|fav$|strong$)/;

// The phone row draws Saved as its own toggle, so the saved chip is not drawn
// twice; it still counts, so the badge equals what the row shows as on.
export const phoneChips = (chips) => chips.filter((c) => c.key !== 'fav');

// The Filters badge: one per chip, Strong match, Saved and countries too.
export const badgeCount = (chips) => chips.length;

// What moves the page off the overview. Countries belong to the trip and
// Strong match is the overview's own toggle, so neither leaves it.
export const lensCount = (chips) => chips.filter((c) => !c.key.startsWith('c:') && c.key !== 'strong').length;

// The chips a desktop draws in its one-line row.
export const deskChips = (chips) => chips.filter((c) => !DESK_SHOWN.test(c.key));
