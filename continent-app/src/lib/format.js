// Shared display formatting used across the panels/list/map.

/** Rounded euro amount, e.g. "€1,234". Returns '-' for null/undefined. */
export function eur(n) {
  return n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`;
}

/** House style: no em/en dashes in shipped copy (see the memory note and
 *  CountryIntel's original cleanDash). Numeric ranges and tight word joins
 *  become a plain hyphen; spaced prose dashes become a comma pause. Applied at
 *  build time to every shipped string (scripts/sync-data.mjs) and reusable at
 *  render time. Non-strings pass through untouched. */
export function stripDashes(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2')  // numeric ranges -> hyphen (1992-1995)
    .replace(/(\w)[—–](\w)/g, '$1-$2')         // tight word joins -> hyphen (Piraeus-Milos)
    .replace(/\s*[—–]\s*/g, ', ');             // remaining spaced prose dashes -> comma
}

/** Only allow http(s) URLs for links that come from harvested/remote data
 *  (activity links, image credit pages) - anything else (javascript:, data:,
 *  vbscript:) is dropped so it can never become a stored-XSS click target. */
export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  return /^https?:\/\//i.test(url.trim()) ? url : null;
}

// Human labels for dest.costs.price_source (on-the-ground spend).
export const PRICE_SOURCE_LABELS = {
  numbeo_city: 'city prices',
  numbeo_direct: 'country prices',
  pli_scaled: 'estimated prices',
};

// Human labels for dest.accommodation.price_source (Airbnb nightly rate).
export const ACCOM_SOURCE_LABELS = {
  inside_airbnb_city: 'Airbnb city rates',
  inside_airbnb_country: 'Airbnb country rates',
  airbnb_pli_scaled: 'estimated Airbnb rates',
};
