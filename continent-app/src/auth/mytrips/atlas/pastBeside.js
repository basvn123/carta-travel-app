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
