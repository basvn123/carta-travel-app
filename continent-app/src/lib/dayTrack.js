/**
 * dayTrack.js, the arithmetic of the day track (T162, spec C2, the Day track
 * rule in the carta-design skill). The component in browse/DayTrack.jsx owns
 * the DOM; everything here is a pure function of numbers, so it is tested in
 * node (tests/dayTrack.test.mjs).
 *
 * The track is one row of cards in a scroller. `offsets` are each card's left
 * edge measured from the first card's, `maxScroll` is scrollWidth minus
 * clientWidth. On a phone one card fills most of the view, so every card has
 * its own scroll position. From 1024 px three cards share the view, and the
 * last three share the last position: a reader who presses Next there still
 * moves on (day 5, 6, 7) without the track moving, which is why the index is
 * state and not only a reading of scrollLeft.
 */

export const clampIndex = (i, n) => (n > 0 ? Math.max(0, Math.min(n - 1, i)) : 0);

/** The card the track is on, read from the scroll position. Near the far end,
 *  where the last cards share one position, the card the reader stepped to
 *  wins over the nearest one. */
export function trackIndex(offsets, scrollLeft, maxScroll, current = 0) {
  const n = offsets.length;
  if (!n) return 0;
  let best = 0;
  for (let i = 1; i < n; i += 1) {
    if (Math.abs(offsets[i] - scrollLeft) < Math.abs(offsets[best] - scrollLeft)) best = i;
  }
  const atEnd = maxScroll <= 0 || scrollLeft >= maxScroll - 2;
  if (atEnd && current > best) return clampIndex(current, n);
  return best;
}

/** Where to scroll so card i sits at the start, never past the end. */
export function trackLeft(offsets, i, maxScroll) {
  const at = offsets[clampIndex(i, offsets.length)] || 0;
  return Math.max(0, Math.min(at, Math.max(0, maxScroll)));
}

/** The card a key moves to, or null when the key is not the track's. No
 *  looping: Next on the last card stays on it. */
export function trackKey(key, index, n) {
  if (key === 'ArrowRight') return clampIndex(index + 1, n);
  if (key === 'ArrowLeft') return clampIndex(index - 1, n);
  if (key === 'Home') return 0;
  if (key === 'End') return clampIndex(n - 1, n);
  return null;
}
