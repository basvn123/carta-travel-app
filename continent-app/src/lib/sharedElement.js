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
  let t;
  try {
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
    clear(); commit(); return;
  }
  t.finished.then(() => { pending = null; }, () => { pending = null; clear(); });
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
