/**
 * Where a listed route's own page lives, so a PDF (which cannot carry a
 * download button) can print the address where its GPX downloads (T632).
 * The same hash shapes TrailPage and CyclePage read at startup:
 * "#trail=ID&tc=CC" and "#cycle=ID&cc=CC".
 */
const CC_RE = /^[A-Z]{2}$/;

export function routePageUrl(activity, row, base = '') {
  if (!row || !Number.isInteger(Number(row.id)) || Number(row.id) <= 0) return '';
  const cc = String(row.cc || '').toUpperCase();
  const ccPart = CC_RE.test(cc) ? `&${activity === 'cycling' ? 'cc' : 'tc'}=${cc}` : '';
  const key = activity === 'cycling' ? 'cycle' : 'trail';
  return `${base}#${key}=${Number(row.id)}${ccPart}`;
}

/** The page address with its origin, in the browser; the bare hash elsewhere. */
export function routePageUrlHere(activity, row) {
  if (typeof window === 'undefined') return routePageUrl(activity, row);
  return routePageUrl(activity, row, `${window.location.origin}${window.location.pathname}`);
}
