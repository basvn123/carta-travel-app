/**
 * The docks' one store (G12, explore polish; decision.md "Dock semantics").
 * Only the Trip dock under the category tabs opens a card now: the style
 * disc in the corner opens the Style Studio instead (Style Studio, G12).
 * `focus` names the row a dock opens on (the price sheet's hand-off opens
 * the Trip dock at From).
 * The open state lives in memory only; a reload starts closed.
 *
 * Read it with useDock() (useSyncExternalStore); write it with openDock,
 * closeDock and toggleDock from anywhere, including outside React.
 */
import { useSyncExternalStore } from 'react';

const DOCKS = ['trip'];
const CLOSED = Object.freeze({ open: null, focus: null });

let state = CLOSED;
const listeners = new Set();

function emit(next) {
  if (next.open === state.open && next.focus === state.focus) return;
  state = next;
  // The Map pill and the list read which dock is open from the page root
  // (89-dock.css), so CSS can step aside without a prop chain.
  if (typeof document !== 'undefined') {
    if (state.open) document.documentElement.dataset.dock = state.open;
    else delete document.documentElement.dataset.dock;
  }
  for (const fn of listeners) fn();
}

export function getDock() {
  return state;
}

export function subscribeDock(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Open one dock, closing the other; `focus` is a row key or null. */
export function openDock(id, { focus = null } = {}) {
  if (!DOCKS.includes(id)) return;
  emit({ open: id, focus: focus || null });
}

/** Close the named dock, or whichever is open when no id is given. */
export function closeDock(id) {
  if (id && state.open !== id) return;
  emit(CLOSED);
}

export function toggleDock(id) {
  if (state.open === id) closeDock(id);
  else openDock(id);
}

/** The row focus has been honoured; keep the dock open. */
export function clearDockFocus() {
  if (state.focus) emit({ open: state.open, focus: null });
}

/** The store as React state: { open, focus }. */
export function useDock() {
  return useSyncExternalStore(subscribeDock, getDock, getDock);
}
