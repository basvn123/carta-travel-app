/**
 * J-11 (logic wave 2, E9): the traveller's trips changed in this tab.
 *
 * The account sync (auth/accountSync.js) watched the browser's `storage`
 * event, which fires only in OTHER tabs, plus two events of its own stores. A
 * trip edited in the open tab never scheduled a sync, so it waited for the
 * tab to be hidden and shown again. Each store that writes one of the keys the
 * sync watches (lib/stateKeys.js, `sync: 'things'`) calls this after the
 * write; the sync listens and debounces. It only adds a trigger, so it is not
 * behind a flag.
 */
export const THINGS_CHANGED = 'carta:things-changed';

export function announceThingsChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try { window.dispatchEvent(new Event(THINGS_CHANGED)); } catch { /* old browser */ }
}
