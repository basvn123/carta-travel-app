import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion.js';

/**
 * Small hooks for the home page (T463; the T462 demo clock is gone with the
 * looping demo it drove).
 */

/** True once the browser has been idle after the first paint (or 3 s). */
export function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const ric = window.requestIdleCallback;
    const h = ric ? ric(() => setIdle(true), { timeout: 3000 }) : setTimeout(() => setIdle(true), 1500);
    return () => { if (ric) window.cancelIdleCallback?.(h); else clearTimeout(h); };
  }, []);
  return idle;
}

/** A media query's answer, kept current. */
export function useMedia(query) {
  const read = () => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  };
  const [on, setOn] = useState(read);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, [query]);
  return on;
}

/** prefers-reduced-motion, kept current. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return undefined; }
    const change = () => setReduced(mq.matches);
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, []);
  return reduced;
}
