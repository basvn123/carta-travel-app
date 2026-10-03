// Touch feedback helpers (T184, G1). The visual change itself is CSS
// (:active rules in styles/02-base.css). Two things CSS cannot do:
//
// 1. iOS Safari only applies :active to elements when some touchstart listener
//    exists on the page. A passive no-op on the document turns it on everywhere.
// 2. A haptic tick on touch for controls that flip a state (a fold, a switch, a
//    toggle chip). navigator.vibrate exists on Android Chrome and is absent on
//    iOS, where the guard makes this a no-op. It is skipped when the traveller
//    asks for reduced motion.
export function installTouchFeedback() {
  if (typeof document === 'undefined') return;
  document.addEventListener('touchstart', () => {}, { passive: true });
  const canBuzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  if (!canBuzz) return;
  let calm = false;
  try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no matchMedia */ }
  if (calm) return;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target instanceof Element ? e.target.closest('[aria-expanded], [aria-pressed], [role="switch"]') : null;
    if (t && !t.disabled) { try { navigator.vibrate(8); } catch { /* blocked */ } }
  }, { passive: true });
}
