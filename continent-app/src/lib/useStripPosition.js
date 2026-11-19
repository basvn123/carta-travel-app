import { useCallback, useEffect, useState } from 'react';

/**
 * Where a horizontal strip is scrolled (G1, house style 2026-11): at the
 * start, at the end, and the index of the item nearest its left edge. The
 * same logic as browse/StoryRail.jsx's own hook, shared so the kit's Rail
 * disables its arrows at the ends exactly as StoryRail does. Re-measures on
 * scroll (one frame at a time) and on resize.
 */
export function useStripPosition(ref, count) {
  const [pos, setPos] = useState({ atStart: true, atEnd: count <= 1, at: 0 });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft >= max - 2;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const items = [...el.children];
    let at = 0;
    let best = Infinity;
    items.forEach((child, i) => {
      const d = Math.abs(child.offsetLeft - pad - el.scrollLeft);
      if (d < best) { best = d; at = i; }
    });
    if (atEnd && items.length) at = items.length - 1;
    setPos((p) => (p.atStart === atStart && p.atEnd === atEnd && p.at === at ? p : { atStart, atEnd, at }));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    // G12, D10 (round 6): the observer's first call (right after the next
    // layout) is the first measure. Measuring here, in the commit, forced a
    // layout of the whole page for every rail that mounted (0.2 to 0.9 s at
    // 4x CPU on a desktop Explore).
    if (ro) ro.observe(el); else measure();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [ref, measure, count]);
  return pos;
}
