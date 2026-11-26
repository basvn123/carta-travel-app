/*
 * One Ask Viantra chat for the whole app (T574). Explore hosts the panel (it
 * holds the catalogue the answers read, and it is mounted from the start),
 * and any number of doors open it from anywhere: the header on every place
 * on desktop, the Filters row on Explore and the Plan page on a phone. The
 * doors and the host share this tiny store, so there is never a second chat.
 *
 *   openAskChat(opener?, seed?)   open, remembering the door for focus
 *   closeAskChat()                close; focus goes back to that door
 *   useAskChat() -> { open, seed, n }
 */
import { useSyncExternalStore } from 'react';
// One side panel at a time (G12 round 2, flow-corners 1): Settings and Ask
// both dock on the right on a desktop; open together they stacked and the
// rails lost two panels' width. Opening one closes the other.
import { closeSettings } from '../settings/settingsSheetStore.js';

let state = { open: false, seed: null, n: 0 };
let opener = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function openAskChat(from = null, seed = null) {
  opener = from || (typeof document !== 'undefined' ? document.activeElement : null);
  closeSettings();
  // A seed is asked once: a door that opens the chat again carries none.
  state = { open: true, seed: seed?.text ? seed : null, n: state.n + 1 };
  emit();
}

/** `restoreFocus: false` when another panel takes Ask's place and moves
 *  focus itself (Settings opening). */
export function closeAskChat({ restoreFocus = true } = {}) {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
  const back = opener;
  opener = null;
  if (restoreFocus && back?.isConnected) requestAnimationFrame(() => back.focus());
}

/** Whether the chat is open, for code outside React (tests). */
export function askChatState() {
  return state;
}

export function useAskChat() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
    () => state,
  );
}
