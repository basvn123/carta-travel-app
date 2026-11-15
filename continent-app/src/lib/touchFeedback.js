// Touch feedback (T184, G1; house style 2026-11). The visual change itself is
// CSS (the Press primitive in styles/02-base.css). One thing CSS cannot do:
// iOS Safari only applies :active to elements when some touchstart listener
// exists on the page, so a passive no-op on the document turns it on.
//
// It used to vibrate on pointerdown over [aria-expanded], [aria-pressed] and
// switches. That fired before the browser knew the touch was a tap, so a
// scroll that started on a chip buzzed, and a fold (navigation, not a value)
// buzzed too. Haptics now come from src/lib/haptics.js, on the commit, from
// the kit components only.
import { installHaptics } from './haptics.js';

export function installTouchFeedback() {
  if (typeof document === 'undefined') return;
  document.addEventListener('touchstart', () => {}, { passive: true });
  installHaptics();
}
