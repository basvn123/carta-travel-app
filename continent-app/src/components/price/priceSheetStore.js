/**
 * The price sheet's one store (D10, explore polish step 6). Every row on a
 * long list has four parts that open the sheet; one sheet mounted once in
 * App (beside the docks) reads what to show from here, so a row carries a
 * button and nothing else, and the sheet has the app's data at hand.
 *
 *   { place, cost, tab, anchor }  or null when closed
 *   place   the Explore row ({ id, name, iso2, country })
 *   cost    the row's cost (with cost.way), as the row drew it
 *   tab     'flight' | 'stay' | 'food' | 'in', chosen by the tapped part
 *   anchor  the tapped element: the desktop popover hangs off it and focus
 *           returns to it on close
 */
import { useSyncExternalStore } from 'react';

let state = null;
const listeners = new Set();

function emit(next) {
  state = next;
  for (const fn of listeners) fn();
}

export function openPriceSheet({ place, cost, tab = 'in', anchor = null }) {
  emit({ place, cost, tab, anchor });
}

export function closePriceSheet() {
  if (state) emit(null);
}

export function getPriceSheet() {
  return state;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePriceSheet() {
  return useSyncExternalStore(subscribe, getPriceSheet, getPriceSheet);
}
