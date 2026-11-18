/*
 * Whether Settings is open and at which step (G12, Explore top). The band's
 * Settings button and its five chips live in the top bar, the search panel's
 * "You search as" rows in the search; the sheet is mounted once. This tiny
 * store is the line between them, the way searchDockStore is for the dock,
 * so no door needs a provider or a prop chain to open Settings.
 *
 *   openSettings({ step })   step: 'overview' | 'start' | 'when' | 'way' | 'prices'
 *   closeSettings()
 *   toggleSettings({ step }) the desktop Settings button: a second press closes
 *   useSettingsSheet()       { isOpen, step, nonce, open, close, toggle }
 *
 * `nonce` rises on every open, so a door pressed while the sheet is open
 * (a chip above the docked panel) moves the sheet to its step even when the
 * step is the one already showing.
 */
import { useSyncExternalStore } from 'react';

export const SETTINGS_STEPS = Object.freeze(['overview', 'start', 'when', 'way', 'prices']);

const CLOSED = Object.freeze({ isOpen: false, step: 'overview', nonce: 0 });
let state = CLOSED;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

/** A step name the sheet knows, else the overview. */
export function stepOf(step) {
  return SETTINGS_STEPS.includes(step) ? step : 'overview';
}

export function openSettings({ step } = {}) {
  state = { isOpen: true, step: stepOf(step), nonce: state.nonce + 1 };
  emit();
}

export function closeSettings() {
  if (!state.isOpen) return;
  state = { ...state, isOpen: false };
  emit();
}

export function toggleSettings({ step } = {}) {
  if (state.isOpen) closeSettings();
  else openSettings({ step });
}

/** The current state, for code outside React (tests, a verify script). */
export function settingsSheetState() {
  return state;
}

const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const snapshot = () => state;

export function useSettingsSheet() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...s, open: openSettings, close: closeSettings, toggle: toggleSettings };
}
