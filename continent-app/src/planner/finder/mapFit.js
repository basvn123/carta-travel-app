/**
 * When the trips map moves its camera to the pins (G12 early results, owner
 * decision 2026-11-25). The list opens on its first proven cards, so the
 * first fit sees only those; later pins may land outside it.
 *   'first'  the first pins: fit at once
 *   'widen'  a pin outside the view: fit again (TripsMap eases it, a jump
 *            under reduced motion)
 *   null     leave the view: every pin is in it, or the traveller is
 *            moving the map or has moved it (their view wins)
 * Pure: tests/tripsMapFit.test.mjs.
 */
export function mapFit({ fitted, inView, touched, moving }) {
  if (!fitted) return 'first';
  if (inView || touched || moving) return null;
  return 'widen';
}
