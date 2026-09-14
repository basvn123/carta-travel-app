import React from 'react';

/**
 * Where a filter sheet should sit on a pointer screen.
 *
 * The sheet is one component for every width, which was the right call for
 * the content and the wrong shape for a desktop window: a 560px panel rising
 * from the bottom edge with a grab handle on top and the whole page dimmed
 * behind it, to change one country. A phone has nowhere else to put it. A
 * 1920px screen has the space right under the button you pressed, which is
 * where a menu belongs.
 *
 * So on >= 769px this hook measures the trigger and returns fixed
 * coordinates for a panel hanging off it; below that it returns null and the
 * sheet stays the bottom sheet it always was. The caller adds `is-anchored`
 * when it gets coordinates back.
 *
 * It re-measures on resize and on scroll anywhere (capture phase: the tab
 * panel scrolls, not the document), so the panel tracks the button rather
 * than drifting off it.
 */
const DESKTOP_FROM = 769;
const GUTTER = 16;   // never closer than this to a window edge
const GAP = 8;       // between the trigger and the panel
const MAX_H = 620;   // a menu, not a page

export function useAnchoredSheet(anchorRef, width = 520) {
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    const el = anchorRef?.current;
    if (!el) return undefined;

    const place = () => {
      if (window.innerWidth < DESKTOP_FROM) { setPos(null); return; }
      const r = el.getBoundingClientRect();
      const w = Math.min(width, window.innerWidth - GUTTER * 2);
      // Hang from whichever edge of the trigger keeps the panel on screen:
      // right-aligned under a button in the right half of the window, left
      // under one in the left half. Then clamp, so a trigger near an edge
      // still opens a panel that is fully visible.
      const fromRight = r.left + r.width / 2 > window.innerWidth / 2;
      const left = Math.max(GUTTER, Math.min(
        fromRight ? r.right - w : r.left,
        window.innerWidth - w - GUTTER,
      ));
      const top = Math.round(r.bottom + GAP);
      setPos({
        top,
        left: Math.round(left),
        width: Math.round(w),
        // Whatever is left of the window, capped: a menu that runs the full
        // height of a 1080px screen reads as a page, not as a menu, and the
        // body scrolls inside it anyway. Floored too, so a short window still
        // gives it something to scroll in.
        maxHeight: Math.max(320, Math.min(MAX_H, Math.round(window.innerHeight - top - GUTTER))),
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, width]);

  return pos;
}
