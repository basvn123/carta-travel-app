// Touch feedback (T184, G1; house style 2026-11). The visual change itself is
// CSS (the Press primitive in styles/02-base.css). Two things CSS cannot do:
//
// 1. iOS Safari only applies :active to elements when some touchstart listener
//    exists on the page, so a passive no-op on the document turns it on.
// 2. A haptic tick when a toggle outside the kit flips (a pressed button, a
//    switch, a checkbox written by a screen before the kit). It used to fire
//    on pointerdown, before the browser knew the touch was a tap, so a scroll
//    that started on a chip buzzed, and folds ([aria-expanded], navigation,
//    not a value) buzzed too. Now it listens for the CLICK (the commit), after
//    the screen's own handler has run, and skips the kit's controls, which
//    tick themselves (Chip, Segmented, Switch). haptic() applies the rest:
//    touch only, the "Vibrate on tap" setting, reduced motion, the 50 ms gap.
import { haptic, installHaptics } from './haptics.js';

const TOGGLES = '[aria-pressed], [role="switch"], [role="checkbox"], input[type="checkbox"]';
const KIT = '.ui-chip, .seg-item, .ui-switch, .haptic-switch';

/** The toggle a click committed, or null (exported for the tests). */
export function committedToggle(target) {
  const el = target && typeof target.closest === 'function' ? target.closest(TOGGLES) : null;
  if (!el || el.closest(KIT)) return null;
  if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') return null;
  return el;
}

export function installTouchFeedback() {
  if (typeof document === 'undefined') return;
  document.addEventListener('touchstart', () => {}, { passive: true });
  installHaptics();
  // Bubble phase, so the screen's own click handler has already set the state.
  document.addEventListener('click', (e) => {
    if (committedToggle(e.target)) haptic('tick');
  });
}
