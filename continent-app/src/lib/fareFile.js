/**
 * fareFile.js, naming for the per-origin fare slices in public/fares/.
 *
 * Windows still resolves the old DOS device names anywhere a path is parsed,
 * and the extension does not save you: PRN.json is the printer. Node reads and
 * writes those names fine (it goes through the \\?\ namespace), so the slice
 * for Pristina (PRN) lands on disk and serves normally, but git refuses to
 * index it (core.protectNTFS, on by default on Windows) and PowerShell cannot
 * see it at all. The file therefore never reaches the repo and Pristina ships
 * with no fares, with no error anywhere to explain why.
 *
 * One trailing underscore makes the name ordinary again. Origin codes are
 * alphanumeric IATA, so no real origin can collide with an escaped name, and
 * the escape has to be applied on both ends: sync-data.mjs writes the file,
 * appData.js fetches it.
 */

const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
]);

/** Basename (no extension) for an origin's fare slice. `PRN` -> `PRN_`. */
export function fareFileBase(origin) {
  const code = String(origin || '').toUpperCase();
  return RESERVED.has(code) ? `${code}_` : code;
}

/** Served path for an origin's fare slice. */
export function faresUrl(origin) {
  return `/fares/${fareFileBase(origin)}.json`;
}
