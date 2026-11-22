/*
 * The Explore filters' shared state (G12, Explore top round 2). The band
 * (its Filters control, the search panel's Browse shortcuts and the phone's
 * Filters row) lives in the top bar; the filters themselves live in
 * ExploreTab. This tiny store is the line between them, the way
 * settingsSheetStore is for Settings, so no door needs a prop chain.
 *
 *   useFilters()        { isOpen, group, nonce, count, total, shortcuts,
 *                         open, close, toggle, applyShortcut }
 *   open({ group, opener })
 *                       opens the sheet (phone) or the panel under the
 *                       search bar (desktop); `group` scrolls to a section
 *                       ('sort', 'temp', 'water', 'walk', 'kind', 'day', 'good')
 *   applyShortcut(id, on = true)
 *                       sets one shortcut's filter in place ('top', 'hiking',
 *                       'oldtown', 'sea', 'island', 'lake', 'gems'); false
 *                       takes it off. The list follows; nothing navigates.
 *
 * `count` is the number of applied chips (the search text excepted), the
 * figure the Filters control shows. `total` is the live number of places
 * the list holds. `shortcuts` is [{ id, label, on }] in the reader's
 * language, published by the tab while Explore's Places is on screen.
 *
 * The opener (the element that had focus when the sheet opened) is kept so
 * focus can go back to it on close.
 */
import { useSyncExternalStore } from 'react';

// G12 map view round 2: `quick` is the map's quick chips [{ id, label, on }]
// (filterModel.js QUICK), drawn by the band on a phone and over the map on
// a desktop; applyQuick(id, on) sets one.
const INITIAL = Object.freeze({ isOpen: false, group: null, nonce: 0, count: 0, total: null, shortcuts: [], quick: [] });
let state = INITIAL;
let handlers = { applyShortcut: null, applyQuick: null, clearAll: null };
let opener = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function openFilters({ group = null, opener: from = null } = {}) {
  opener = from || (typeof document !== 'undefined' ? document.activeElement : null);
  state = { ...state, isOpen: true, group, nonce: state.nonce + 1 };
  emit();
}

export function closeFilters() {
  if (!state.isOpen) return;
  state = { ...state, isOpen: false, group: null };
  emit();
}

export function toggleFilters(opts) {
  if (state.isOpen) closeFilters();
  else openFilters(opts);
}

/** The element to give focus back to, if it is still on screen. */
export function filtersOpener() {
  return opener?.isConnected && opener.getClientRects().length > 0 ? opener : null;
}

const sameShortcuts = (a, b) => a.length === b.length
  && a.every((x, i) => x.id === b[i].id && x.label === b[i].label && x.on === b[i].on);

/** The tab's figures and shortcuts; a no-op when nothing changed. */
export function publishFilters({ count = 0, total = null, shortcuts = [], quick = [] }) {
  if (state.count === count && state.total === total && sameShortcuts(state.shortcuts, shortcuts)
    && sameShortcuts(state.quick, quick)) return;
  state = { ...state, count, total, shortcuts, quick };
  emit();
}

/** Kept beside the state, not in it, so a tab render never re-renders the band. */
export function setFilterHandlers(next) {
  handlers = { ...handlers, ...next };
}

export function applyShortcut(id, on = true) {
  handlers.applyShortcut?.(id, on);
}

export function applyQuick(id, on = true) {
  handlers.applyQuick?.(id, on);
}

/** Every filter off: the quick row's Clear all (judgement-6). */
export function clearAllFilters() {
  handlers.clearAll?.();
}

/** The current state, for code outside React (tests, a verify script). */
export function filtersState() {
  return state;
}

const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const snapshot = () => state;

export function useFilters() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...s, open: openFilters, close: closeFilters, toggle: toggleFilters, applyShortcut, applyQuick };
}
