// A figure that updates in place (T380, design direction v6, part 2.3).
//
// Seven briefs want the same thing when an input changes a price: the figure
// changes at once, in tabular mono, inside a box that keeps its width, and
// the eye is told it changed by one short dip of the figure's opacity. No
// count-up (a count-up shows forty wrong figures on the way to the right
// one and PRODUCT.md says numbers never jitter), no scale bump, no sweep.
//
// Two doors. settleFigure(el) runs the dip on an element through the Web
// Animations API, reading --dur-2 and --ease-out from the token file, so no
// stylesheet has to carry a keyframe for it. useSettledFigure(ref, value)
// calls it from a component whenever `value` changes after the first render.
// Both are no-ops under prefers-reduced-motion and where element.animate is
// missing, so the figure still changes; only the dip is skipped.

import { useEffect, useRef } from 'react';
import { durationMs, prefersReducedMotion } from './motion.js';

const EASE_OUT_FALLBACK = 'cubic-bezier(0.16, 1, 0.3, 1)';

function easeOut() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim();
    return raw || EASE_OUT_FALLBACK;
  } catch {
    return EASE_OUT_FALLBACK;
  }
}

/**
 * Dip the element's opacity to 0.35 and back over --dur-2. Returns the
 * Animation, or null when nothing ran (reduced motion, no element, no API).
 * @param {Element|null|undefined} el
 */
export function settleFigure(el) {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return null;
  const duration = durationMs('--dur-2');
  if (!duration) return null;
  try {
    return el.animate(
      [{ opacity: 1 }, { opacity: 0.35, offset: 0.4 }, { opacity: 1 }],
      { duration, easing: easeOut() },
    );
  } catch {
    return null;
  }
}

/**
 * Run settleFigure on ref.current each time `value` changes after mount.
 * Compare by the rendered string so 24.99 and 24.990 do not count as a change.
 * @param {{current: Element|null}} ref
 * @param {unknown} value
 */
export function useSettledFigure(ref, value) {
  const key = value == null ? '' : String(value);
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    settleFigure(ref.current);
  }, [ref, key]);
}
