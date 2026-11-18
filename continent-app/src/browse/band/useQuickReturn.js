import { useEffect, useState } from 'react';

// The scrollers the phone band rides over: Places and the five layers.
const SCROLLERS = ['explore-tab', 'places-tab'];
// Tuck once the list moved this far down in one go, so a reading jitter
// does not flap the band; a small pull up brings the search back
// (decision.md, APPROVED: "scrolling up brings the search back").
const DOWN_PX = 16;
const UP_PX = 24;
// The fold changes the scroller's height, and at the end of a list the
// browser then clamps scrollTop: that is layout, not the reader, so scroll
// events right after a change are ignored.
const SETTLE_MS = 320;

/**
 * The phone band's quick return (G12, Explore top). While the list scrolls
 * down past the search and the tabs, those two fold away and only the chip
 * row stays pinned; a short scroll up unfolds them again. One capture
 * listener on the document, so it follows whichever tab's scroller is on
 * screen without a ref through App.
 *
 * `foldPx` is how tall the part that folds is: above that the band never
 * tucks, so the top of a list always shows the search. A new `resetKey`
 * (the tab, the search opening) unfolds it.
 */
export function useQuickReturn(enabled, foldPx, resetKey) {
  const [state, setState] = useState({ tucked: false, key: resetKey });
  if (state.key !== resetKey) setState({ tucked: false, key: resetKey });
  useEffect(() => {
    if (!enabled) return undefined;
    const last = new WeakMap();
    let run = 0; // signed distance in the current direction
    let quietUntil = 0;
    let tucked = false;
    const set = (v) => {
      if (v !== tucked) { tucked = v; quietUntil = Date.now() + SETTLE_MS; }
      setState((s) => (s.tucked === v ? s : { ...s, tucked: v }));
    };
    const onScroll = (e) => {
      const el = e.target;
      if (!el || !el.classList || !SCROLLERS.some((c) => el.classList.contains(c))) return;
      const y = el.scrollTop;
      const prev = last.has(el) ? last.get(el) : y;
      last.set(el, y);
      const dy = y - prev;
      if (!dy) return;
      if (y <= foldPx) { run = 0; set(false); return; }
      if (Date.now() < quietUntil) { run = 0; return; }
      run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
      if (run > DOWN_PX) { run = 0; set(true); } else if (run < -UP_PX) { run = 0; set(false); }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [enabled, foldPx, resetKey]);
  return enabled && state.tucked;
}
