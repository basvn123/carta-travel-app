import { useEffect, useState } from 'react';

/**
 * G12 atlas: from 1100 px wide and 720 px tall, Your Europe's past trips sit
 * under the map in the right column (a portal into the map slot); narrower
 * or shorter windows keep them inline, so a short list is never squeezed.
 */
export const PAST_BESIDE = '(min-width: 1100px) and (min-height: 720px)';

export function usePastBeside() {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PAST_BESIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(PAST_BESIDE);
    if (!mq) return undefined;
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener?.('change', change);
    return () => mq.removeEventListener?.('change', change);
  }, []);
  return on;
}

/** A stable tilt between -6 and +6 degrees from an id: an ink stamp, never random. */
export function stampTilt(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return (h % 13) - 6;
}

/** The Europe fill's step: 240 ms a year, the whole fill never past 1200 ms. */
export function fillStep(years) {
  return Math.min(240, Math.floor(1200 / Math.max(1, years)));
}
