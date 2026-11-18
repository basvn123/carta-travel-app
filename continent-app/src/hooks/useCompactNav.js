/**
 * The bottom nav folds while the traveller reads (ROADMAP I7, app feel on a
 * phone).
 *
 * Installed apps give the screen back while you scroll a list down and bring
 * the tab bar back the moment you scroll up. A scroll down through any main
 * scroller on a phone sets `nav-compact` on the root element; 60-v6-shell.css
 * reads it, drops the tab names and shrinks the bar from 64 px to the 48 px
 * tap row, and `--bottom-nav-h` follows, so every layout that already uses the
 * variable takes the 16 px back. A scroll up, the top of a list, a place
 * change or keyboard focus on the bar brings the names back.
 *
 * The bar never hides: the three places stay one tap away at --tap-main, and
 * the names stay in the DOM, so a screen reader reads them either way.
 *
 * The scroll event does not bubble, so one capture listener on the document
 * hears every scroller. Only scrollers at least 40 percent of the screen tall
 * count (a list or a page, not a chip row or a small inner box), and only
 * vertical movement (a horizontal rail leaves scrollTop alone).
 */
import { useEffect } from 'react';

// Pixels of travel in one direction before the bar changes, so a finger that
// wobbles does not flick it.
export const FOLD_AFTER = 48;
export const UNFOLD_AFTER = 32;
// Near the top of a list the names are always back.
export const TOP_ZONE = 8;
// A list that barely scrolls has nothing to give room to.
export const MIN_TRAVEL = 120;
// After a change the scroller's own height moves by 16 px, which can clamp
// scrollTop at the end of a list and look like a scroll up; changes inside
// this window are ignored so the bar cannot bounce.
export const SETTLE_MS = 350;

export function initialFold() {
  return { compact: false, down: 0, up: 0, until: 0, el: null };
}

/**
 * The next fold state for one scroll step. Pure, exported for the tests.
 * @param {{compact:boolean, down:number, up:number, until:number, el:any}} s
 * @param {{el:any, top:number, delta:number, travel:number, now:number}} step
 *   travel is scrollHeight minus clientHeight of the scroller
 */
export function nextFold(s, { el, top, delta, travel, now }) {
  // Another scroller took over: start counting again.
  const base = s.el === el ? s : { ...s, down: 0, up: 0, el };
  if (top <= TOP_ZONE) {
    return base.compact ? { ...base, compact: false, down: 0, up: 0, until: now + SETTLE_MS } : { ...base, down: 0, up: 0 };
  }
  if (now < base.until || delta === 0) return base;
  if (delta > 0) {
    const down = base.down + delta;
    if (!base.compact && down >= FOLD_AFTER && travel >= MIN_TRAVEL) {
      return { ...base, compact: true, down: 0, up: 0, until: now + SETTLE_MS };
    }
    return { ...base, down, up: 0 };
  }
  const up = base.up - delta;
  if (base.compact && up >= UNFOLD_AFTER) {
    return { ...base, compact: false, down: 0, up: 0, until: now + SETTLE_MS };
  }
  return { ...base, up, down: 0 };
}

/**
 * @param {string} place  the place on screen; a change brings the names back
 */
export function useCompactNav(place) {
  useEffect(() => {
    const root = document.documentElement;
    const phone = window.matchMedia('(max-width: 768px)');
    let s = initialFold();
    const tops = new WeakMap();
    const apply = () => root.classList.toggle('nav-compact', s.compact && phone.matches);

    const onScroll = (e) => {
      const el = e.target === document ? document.scrollingElement : e.target;
      if (!el || el.nodeType !== 1 || !phone.matches) return;
      if (el.clientHeight < window.innerHeight * 0.4) return;
      const top = el.scrollTop;
      const last = tops.has(el) ? tops.get(el) : top;
      tops.set(el, top);
      const was = s.compact;
      s = nextFold(s, { el, top, delta: top - last, travel: el.scrollHeight - el.clientHeight, now: performance.now() });
      if (s.compact !== was) apply();
    };
    // Keyboard focus on the bar shows it whole.
    const onFocus = (e) => {
      if (s.compact && e.target?.closest?.('.bottom-nav')) { s = { ...initialFold(), until: performance.now() + SETTLE_MS }; apply(); }
    };
    const onMq = () => apply();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('focusin', onFocus);
    phone.addEventListener('change', onMq);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('focusin', onFocus);
      phone.removeEventListener('change', onMq);
      root.classList.remove('nav-compact');
    };
  // A new place mounts a fresh listener, so its names start out showing.
  }, [place]);
}
