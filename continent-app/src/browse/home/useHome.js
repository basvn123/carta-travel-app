import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion.js';

/**
 * Small hooks for the home page (T606). The page may move on its own
 * (DESIGN.md "Home page exception v2"), so every hook here also knows when
 * to stop: the tab is hidden, the thing is off screen, the visitor touched
 * it, or the visitor asked for reduced motion.
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

/** True while the document is visible (not a background tab). */
export function usePageVisible() {
  const [on, setOn] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));
  useEffect(() => {
    const change = () => setOn(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return on;
}

/**
 * Whether an element is on screen. `once` keeps the first true (for a
 * reveal or a drawing that happens once); without it the answer follows the
 * element in and out (for a film or a clip that pauses off screen). With no
 * IntersectionObserver the element counts as on screen, so nothing waits.
 */
export function useInView(ref, { once = false, margin = '0px', threshold = 0.15 } = {}) {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true);
        if (once) io.disconnect();
      } else if (!once) {
        setSeen(false);
      }
    }, { rootMargin: margin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, margin, threshold]);
  return seen;
}

/**
 * A section that arrives once (DESIGN.md: below the first screen only, and
 * only after the observer exists, so nothing is hidden without one). Spread
 * the returned props on the section: `data-reveal` is "wait" until it comes
 * into view, then "in"; a section already on screen at load never waits.
 */
export function useReveal() {
  const ref = useRef(null);
  const [state, setState] = useState('none');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return undefined;
    if (el.getBoundingClientRect().top < window.innerHeight) return undefined;
    setState('wait');
    // The observer brings it in; the scroll check backs it up, so a long
    // jump (a restored scroll position, a link to the foot of the page)
    // never leaves a section waiting above the screen.
    let done = false;
    const show = () => { if (!done) { done = true; setState('in'); stop(); } };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) show(); }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    const scroller = el.closest('.hv-page') || window;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (el.getBoundingClientRect().top < window.innerHeight * 0.88) show(); });
    };
    scroller.addEventListener('scroll', check, { passive: true });
    function stop() { io.disconnect(); scroller.removeEventListener('scroll', check); cancelAnimationFrame(frame); }
    return stop;
  }, []);
  return { ref, 'data-reveal': state };
}

/**
 * A set of `count` steps that moves on by itself every `ms` while `running`,
 * and stops for good once the visitor picks a step: a carousel that never
 * takes the page back from someone reading it. `ms` null leaves the moving
 * on to the caller's `step()` (a clip that ends).
 */
export function useAutoAdvance(count, { ms = 7000, running = true } = {}) {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const live = running && !held && count > 1;
  useEffect(() => {
    if (!live || ms == null) return undefined;
    const h = setTimeout(() => setIndex((i) => (i + 1) % count), ms);
    return () => clearTimeout(h);
  }, [live, index, count, ms]);
  const pick = useCallback((i) => { setHeld(true); setIndex(((i % count) + count) % count); }, [count]);
  const step = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const hold = useCallback(() => setHeld(true), []);
  return { index, pick, step, held, hold, live };
}
