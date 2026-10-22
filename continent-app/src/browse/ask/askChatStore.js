/*
 * One Ask Carta chat for the whole app (T574). Explore hosts the panel (it
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

let state = { open: false, seed: null, n: 0 };
let opener = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function openAskChat(from = null, seed = null) {
  opener = from || (typeof document !== 'undefined' ? document.activeElement : null);
  // A seed is asked once: a door that opens the chat again carries none.
  state = { open: true, seed: seed?.text ? seed : null, n: state.n + 1 };
  emit();
}

export function closeAskChat() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
  const back = opener;
  opener = null;
  if (back?.isConnected) requestAnimationFrame(() => back.focus());
}

export function useAskChat() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
    () => state,
  );
}
