/**
 * The keyboard half of the phone bottom sheet's grip (T190).
 *
 * On a phone the trip and day planners sit in a sheet over the map, and the
 * grip strip resizes it by drag or toggles it by tap. Neither gesture exists
 * for a keyboard, so the grip is a focusable separator: Enter or Space does
 * what a tap does (peek <-> nearly full height, around the halfway mark),
 * the up and down arrows move the edge a tenth of the screen at a time, Home
 * tucks it to the peek and End raises it fully. The numbers mirror the tap
 * and drag handlers in TripPlannerTab and DayPlannerTab (150 px peek, 120 px
 * floor, 14 px gap at the top).
 *
 * Returns the next height in px, or null for a key the grip does not use.
 */
export function gripKeyHeight(e, sheet) {
  const screen = sheet?.parentElement;
  if (!screen) return null;
  const H = screen.clientHeight;
  const maxH = H - 14;
  const h = sheet.offsetHeight;
  const step = Math.round(H * 0.1);
  switch (e.key) {
    case 'ArrowUp': return Math.min(maxH, h + step);
    case 'ArrowDown': return Math.max(120, h - step);
    case 'Home': return 150;
    case 'End': return maxH;
    case 'Enter':
    case ' ': return h > H * 0.5 ? 150 : maxH;
    default: return null;
  }
}

/** aria-valuenow for the grip: the sheet's share of the screen, in percent. */
export function gripValue(sheetHeight) {
  if (typeof window === 'undefined' || !sheetHeight) return 50;
  return Math.max(0, Math.min(100, Math.round((100 * sheetHeight) / window.innerHeight)));
}
