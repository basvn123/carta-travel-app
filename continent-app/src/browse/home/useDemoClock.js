import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The home demo's clock (T462): which scene shows, and when the next one
 * comes. One timeout per scene that remembers how much of the scene is left,
 * so a pause in the middle of a scene resumes where it stopped (the CSS
 * animations inside the stage freeze on the same signal, so the picture and
 * the clock stay together).
 *
 *   durations   ms per scene, in order
 *   running     false stops the clock: reduced motion, the visitor's own
 *               pause, or an automatic one (off screen, hidden tab, a page
 *               over the home page, pointer or focus inside the stage)
 *
 * Returns { index, go(i) }. go() jumps to a scene and starts it from the top.
 */
export function useDemoClock(durations, running) {
  const [index, setIndex] = useState(0);
  const remaining = useRef(durations[0]);
  const n = durations.length;

  // A new scene starts with its whole duration. Declared before the timer so
  // React runs it first in the same commit (the timer's cleanup has already
  // run, so nothing overwrites it).
  useEffect(() => {
    remaining.current = durations[index];
  }, [index, durations]);

  useEffect(() => {
    if (!running || n < 2) return undefined;
    const started = performance.now();
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % n), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [index, running, n]);

  const go = useCallback((i) => {
    remaining.current = durations[i];
    setIndex(i);
  }, [durations]);

  return { index, go };
}

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
