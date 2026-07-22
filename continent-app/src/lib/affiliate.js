/**
 * Affiliate deeplinks (Travelpayouts / Aviasales).
 *
 * The app shows a real harvested budget-airline fare and then offers a link to
 * verify and book it. That outbound click is the only thing here that earns:
 * Travelpayouts attributes on the `marker` in the URL, NOT on any API call, so
 * this module needs no token, no network request and no backend. (The Flight
 * Search API was evaluated and rejected: it is gated at 50k MAU, its signature
 * scheme requires a server we don't have, and it forbids collecting booking
 * links ahead of a click, which a precomputed static build would have to do.)
 *
 * The marker is public by design (it travels in the query string of every link
 * a visitor follows), but it is read from the environment rather than hardcoded
 * so dev, preview and production can be attributed separately and the value
 * never lands in the diff. Set VITE_TP_MARKER in .env and in the Vercel project
 * env vars; with it unset every builder returns null and callers fall back to
 * the plain unmarked Skyscanner link, so local builds keep working untouched.
 */

/** Travelpayouts partner ID. Empty string when unconfigured. */
const MARKER = (import.meta.env?.VITE_TP_MARKER || '').trim();

/** True when an affiliate marker is configured for this build. */
export function hasAffiliate() {
  return MARKER.length > 0;
}

/** Marker plus an optional sub-ID, the Travelpayouts `marker=12345.subid`
 *  convention. The sub-ID is how we tell in the dashboard WHICH surface earned
 *  a click (the detail panel, the itinerary, the exported PDF), which is the
 *  only way to know where to invest UI work later. Sub-IDs are restricted to
 *  [a-z0-9_] so a stray character can never break attribution silently. */
function markerWith(subId) {
  if (!MARKER) return null;
  const clean = String(subId || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return clean ? `${MARKER}.${clean}` : MARKER;
}

/** `YYYY-MM-DD` -> `DDMM`, the date form Aviasales search paths use.
 *  Returns null for anything that isn't a well-formed date, so a bad value
 *  produces "no link" rather than a link to the wrong day. */
function ddmm(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return m ? `${m[3]}${m[2]}` : null;
}

/**
 * The Aviasales search path for a route, e.g. `CRL0408BCN11081` = out of
 * Charleroi on 04 Aug to Barcelona, back on 11 Aug, one passenger.
 *
 * Format confirmed against the Travelpayouts docs' own worked example: a search
 * for MAD -> BCN with departure_at 2023-07-28 and return_at 2023-08-26 returns
 * the link `/search/MAD2807BCN26081`. Omitting `returnDate` yields the one-way
 * form (`ORIGIN + DDMM + DEST + PAX`).
 *
 * @returns the path segment, or null if any part is missing or malformed.
 */
export function aviasalesSearchPath({ origin, destIata, departDate, returnDate, adults = 1 }) {
  const out = ddmm(departDate);
  if (!origin || !destIata || !out) return null;
  const back = returnDate ? ddmm(returnDate) : '';
  if (returnDate && !back) return null;
  // Aviasales caps the passenger digit at 9; the app never books groups that
  // large in one search, but clamp rather than emit an invalid path.
  const pax = Math.min(9, Math.max(1, adults | 0));
  return `${origin.toUpperCase()}${out}${destIata.toUpperCase()}${back}${pax}`;
}

/**
 * Full marker-tagged Aviasales booking link, or null when no marker is
 * configured (caller should fall back to an unmarked link).
 *
 * Always searches per person (`adults` defaults to 1) to match the per-person
 * fare the app displays: a group search returns a group total that would not
 * line up with the number next to the link.
 *
 * @param subId  which surface the click came from, see markerWith().
 */
export function buildAviasalesLink({ origin, destIata, departDate, returnDate, adults = 1, subId = '' }) {
  const marker = markerWith(subId);
  if (!marker) return null;
  const path = aviasalesSearchPath({ origin, destIata, departDate, returnDate, adults });
  if (!path) return null;
  const params = new URLSearchParams({ marker, currency: 'eur' });
  return `https://www.aviasales.com/search/${path}?${params}`;
}
