/**
 * The price sheet's one store (D10; G12 place-prices decision section 2).
 * Every card and list row opens the same receipt; one sheet mounted once in
 * App reads what to show from here, so a card carries a button and nothing
 * else, and the sheet has the app's data at hand.
 *
 *   { place, cost, model, view, anchor, away }  or null when closed
 *   place   the Explore row ({ id, city, iso2, country })
 *   cost    the row's cost (with cost.way), as the card drew it
 *   model   the Settings model the card priced it with, so the receipt's
 *           figures are the card's even while Explore re-prices
 *   view    'receipt' | 'flights' (the flights screen, from the plane row)
 *   anchor  the tapped element: the desktop popover hangs off it and focus
 *           returns to it on close
 *   away    true while a chip's Settings step or the Style Studio is open
 *           over it; the receipt comes back when they close
 */
import { useSyncExternalStore } from 'react';

let state = null;
const listeners = new Set();

function emit(next) {
  state = next;
  for (const fn of listeners) fn();
}

/** `tab` 'flight' opens on the flights screen (the old Flight tab's door). */
export function openPriceSheet({ place, cost, model = null, tab = null, anchor = null }) {
  emit({ place, cost, model, view: tab === 'flight' ? 'flights' : 'receipt', anchor, away: false });
}

export function closePriceSheet() {
  if (state) emit(null);
}

export function getPriceSheet() {
  return state;
}

/** The card re-priced (a lever, a Settings step): the open receipt follows. */
export function refreshPriceSheet(id, { cost, model }) {
  if (!state || state.place?.id !== id) return;
  if (state.cost === cost && state.model === model) return;
  emit({ ...state, cost, model });
}

export function showPriceView(view) {
  if (state && state.view !== view) emit({ ...state, view });
}

/** Steps aside for Settings or the Style Studio, and comes back after. */
export function stepAway() {
  if (state && !state.away) emit({ ...state, away: true });
}

export function stepBack() {
  if (state?.away) emit({ ...state, away: false });
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePriceSheet() {
  return useSyncExternalStore(subscribe, getPriceSheet, getPriceSheet);
}

// A card needs only to know whether it is the open one: reading the anchor
// alone, a refresh or a view change redraws no card.
const anchorOf = () => (state && !state.away ? state.anchor : null);
export function usePriceSheetAnchor() {
  return useSyncExternalStore(subscribe, anchorOf, anchorOf);
}
