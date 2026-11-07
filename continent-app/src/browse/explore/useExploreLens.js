import React from 'react';

// T586: the URL keys a lens sets. The overview's address keeps the rest
// (the countries, the sort), so Back lands on the same overview.
const LENS_KEYS = ['xk', 'xv', 'xr', 'xm', 'xb', 'xp', 'xe', 'xa', 'xn', 'xd', 'xg', 'xu', 'xw', 'xi', 'xall'];

function overviewHref() {
  if (typeof window === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  for (const k of LENS_KEYS) q.delete(k);
  const qs = q.toString();
  return `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`;
}

/**
 * The overview and its lenses as history (T586). Entering a focused view
 * (a chip, See all, Show all places, a search) is one history step, so the
 * browser's Back returns to the overview; filters changed inside a lens
 * replace that step as before. The step carries `cartaLens` in its state,
 * and a page opened from the lens spreads the state, so stepping back from
 * a place lands in the lens, not on the overview.
 */
export function useExploreLens({ isActive, railsIdle, focusAll, setFocusAll, clear }) {
  const clearRef = React.useRef(clear);
  clearRef.current = clear;
  const pushed = React.useRef(false);
  const idleRef = React.useRef(railsIdle);
  const wasIdle = React.useRef(railsIdle);
  // "Show all places" rides the URL as xall=1. Declared after the filter
  // writer in ExploreTab, so it runs after it and keeps its keys.
  React.useEffect(() => {
    if (!isActive) return;
    const q = new URLSearchParams(window.location.search);
    if (focusAll) q.set('xall', '1'); else q.delete('xall');
    const qs = q.toString();
    try {
      window.history.replaceState(window.history.state, '',
        `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
    } catch { /* sandboxed */ }
  }, [focusAll, isActive]);
  React.useEffect(() => {
    idleRef.current = railsIdle;
    if (!isActive) { wasIdle.current = railsIdle; return; }
    try {
      const st = window.history.state || {};
      if (railsIdle && st.cartaLens) {
        // Back on the overview by a chip or the link: this step is the
        // overview now, so a later lens steps back onto it.
        const { cartaLens: _drop, ...rest } = st;
        window.history.replaceState(rest, '', window.location.href);
      } else if (!railsIdle && wasIdle.current) {
        const lensUrl = window.location.href;
        window.history.replaceState(st, '', overviewHref());
        window.history.pushState({ ...st, cartaLens: 1 }, '', lensUrl);
        pushed.current = true;
      }
    } catch { /* sandboxed: the views still change */ }
    wasIdle.current = railsIdle;
  }, [railsIdle, isActive]);
  React.useEffect(() => {
    const onPop = (e) => {
      if (!pushed.current || idleRef.current) return;
      if ((e.state || {}).cartaLens) return;
      clearRef.current();
      setFocusAll(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setFocusAll]);
  const back = React.useCallback(() => {
    // The link always clears the lens in place. Stepping back through
    // history missed whenever a place page or the map had pushed their own
    // steps on top of the lens; the browser's Back still pops the lens.
    clearRef.current();
    setFocusAll(false);
  }, [setFocusAll]);
  return { back, href: overviewHref() };
}
