/**
 * The map drawer's three stops (T500), as pure functions so the snapping is
 * tested without a DOM (tests/mapDrawerState.test.mjs). The drawer itself is
 * src/components/MapDrawer.jsx.
 */
export const DRAWER_STATES = ['strip', 'half', 'full'];
export const STRIP_PX = 72;

/** How many pixels of the drawer show in a state, for a host this tall. */
export function drawerVisiblePx(state, hostPx) {
  if (state === 'full') return Math.max(STRIP_PX, hostPx);
  if (state === 'half') return Math.max(STRIP_PX, Math.round(hostPx * 0.5));
  return STRIP_PX;
}

/** The state a released drag settles in: the nearest of the three stops. */
export function nearestDrawerState(visiblePx, hostPx) {
  if (!(hostPx > 0)) return 'strip';
  let best = 'strip';
  let bestD = Infinity;
  for (const s of DRAWER_STATES) {
    const d = Math.abs(drawerVisiblePx(s, hostPx) - visiblePx);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/** What one press of the handle does: strip opens to half, half to full, full back to the map. */
export function nextDrawerState(state) {
  return state === 'strip' ? 'half' : state === 'half' ? 'full' : 'strip';
}
