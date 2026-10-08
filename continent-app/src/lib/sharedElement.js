// Shared element transition: a card's photograph grows into the header
// photograph of the page it opens (G2). It rides on the View Transitions API,
// so where that is missing, or the traveller asked for reduced motion, the
// page simply opens as it always did.
//
// Two halves. openShared() runs at the click: it names the card's photograph,
// starts the transition and commits the state change inside it. claimShared()
// runs in the new page: its header photograph calls it on mount and takes the
// same name, which is what tells the browser the two pictures are one thing.
// The transition waits (never more than WAIT_MS) for that claim, because the
// trip page loads its detail after it opens and its photograph is not there
// on the first frame.

import { flushSync } from 'react-dom';

const NAME = 'carta-shared-hero';
const WAIT_MS = 450;

let pending = null; // { key, resolve }
let running = false; // a transition of ours is on screen: never start a second one

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

export function sharedSupported() {
  return typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
    && !reduced();
}

/**
 * @param {Element|null} from  the card (or its button); its first img is named
 * @param {string} key         what is being opened, the same key the page claims with
 * @param {Function} commit    the state change that opens the page
 */
export function openShared(from, key, commit) {
  const img = from?.querySelector?.('img');
  if (!img || !sharedSupported()) { commit(); return; }
  img.style.viewTransitionName = NAME;
  const clear = () => { img.style.viewTransitionName = ''; };
  if (running) { clear(); commit(); return; }
  let t;
  try {
    running = true;
    t = document.startViewTransition(async () => {
      const claimed = new Promise((resolve) => {
        pending = { key: String(key), resolve };
        setTimeout(resolve, WAIT_MS);
      });
      flushSync(commit);
      await claimed;
      clear(); // the card is under the page now; only the page's photo keeps the name
    });
  } catch {
    running = false;
    clear(); commit(); return;
  }
  t.finished.then(() => { pending = null; running = false; }, () => { pending = null; running = false; clear(); });
}

/**
 * A section change that reads as movement (T391, rule R5): the new tab's
 * content fades in and rises 8 px in --dur-2 while the header row and the
 * bottom nav, which carry their own view-transition-name (60-v6-shell.css),
 * stay exactly where they are; the outgoing tab does not move. Rides on the
 * same View Transitions API as openShared, with the same fallbacks: no API,
 * reduced motion, or a transition already running, and the tab simply
 * changes. The class on <html> scopes the keyframes to tab changes, so the
 * shared photograph's transition keeps its own.
 * @param {Function} commit  the state change that shows the new tab
 */
export function crossTab(commit) {
  if (running || !sharedSupported()) { commit(); return; }
  const root = document.documentElement;
  let t;
  try {
    running = true;
    root.classList.add('tab-vt');
    t = document.startViewTransition(() => { flushSync(commit); });
  } catch {
    running = false;
    root.classList.remove('tab-vt');
    commit();
    return;
  }
  const done = () => { running = false; root.classList.remove('tab-vt'); };
  t.finished.then(done, done);
}

/** Called with the page's header photograph. Returns nothing; safe to call always. */
export function claimShared(el, key) {
  if (!el || !pending || pending.key !== String(key)) return;
  el.style.viewTransitionName = NAME;
  const done = () => { el.style.viewTransitionName = ''; };
  const p = pending;
  p.resolve();
  setTimeout(done, 700);
}
