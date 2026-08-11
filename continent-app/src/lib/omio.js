/**
 * Omio affiliate deeplinks (Impact network).
 *
 * Carta prices every overland leg itself (transport.js estimates); Omio is
 * where the traveller goes to see live fares and actually buy the ticket,
 * covering 2,300+ rail, coach and ferry operators in one checkout. The
 * affiliate program runs on impact.com: the ONLY thing that earns is the
 * outbound click through the partner tracking link, so like affiliate.js
 * this module needs no token, no network request and no backend. (The
 * program's standard tier has no fares API; live Omio prices would need
 * their separate B2B search API.)
 *
 * An Impact tracking link looks like
 *   https://omio.sjv.io/c/1234567/898765/12345
 * (partner id / ad id / campaign id, from the Impact dashboard: Brands ->
 * Omio -> Create link). Appending `u=<encoded Omio page>` deep-links the
 * click to any Omio page while keeping attribution, and `subId1=` tags
 * which surface earned the click, mirroring the Travelpayouts sub-ID
 * convention in affiliate.js.
 *
 * The link is public by design (every visitor sees it in the href) but read
 * from the environment so dev, preview and production stay separable and the
 * value never lands in the diff. Set VITE_OMIO_TRACKING_LINK in .env and in
 * the host's env vars; with it unset every builder returns null and callers
 * keep their existing operator links (SNCB, FlixBus, Google Maps), so local
 * builds and forks work untouched.
 */

/** The partner's own Impact tracking link. Empty string when unconfigured. */
const TRACKING = (import.meta.env?.VITE_OMIO_TRACKING_LINK || '').trim();

/** True when an Omio tracking link is configured for this build. */
export function hasOmio() {
  return TRACKING.length > 0;
}

// Letters NFD normalisation cannot fold because they are letters of their
// own, not letter + diacritic: Wroclaw's l-stroke, Danish o-slash and so on.
// Same gotcha the POI dedupe hit.
const FOLD = { ss: /ß/g, ae: /æ/g, o: /ø/g, l: /ł/g, d: /[đð]/g, th: /þ/g, oe: /œ/g };

/**
 * A city name as Omio spells it in route URLs: lowercase ASCII with hyphens
 * ("Aix-en-Provence" -> "aix-en-provence", "Kraków" -> "krakow").
 * Returns null when nothing survives, so a bad name yields "no link"
 * rather than a link to a 404.
 */
export function omioSlug(name) {
  if (!name) return null;
  // Dest labels qualify the airport in parentheses ("Milan (Bergamo)",
  // "Venice (Marco Polo)"); Omio's slug is the bare city.
  let s = String(name).replace(/\([^)]*\)/g, ' ');
  s = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [out, re] of Object.entries(FOLD)) s = s.replace(re, out);
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || null;
}

// Omio's per-mode route pages. Anything else (ferries, mixed sea crossings)
// lands on the multimode /travel/ journey page, which compares all modes.
const MODE_PATH = { train: 'trains', bus: 'buses' };

/**
 * The Omio landing page for a route, e.g.
 * https://www.omio.com/trains/rome/florence . Always the .com domain: the
 * localized domains localize the slugs too, and Omio serves the visitor's
 * language on arrival anyway.
 */
export function omioRouteUrl({ fromCity, toCity, mode = null }) {
  const a = omioSlug(fromCity);
  const b = omioSlug(toCity);
  if (!a || !b || a === b) return null;
  return `https://www.omio.com/${MODE_PATH[mode] || 'travel'}/${a}/${b}`;
}

/**
 * Wrap any Omio page in an Impact tracking link: `u=` carries the encoded
 * landing page, `subId1=` the surface tag. Pure so the format can be locked
 * by scripts/verify-omio.mjs under plain Node.
 *
 * @returns the full tracked URL, or null when either part is unusable.
 */
export function omioDeepLink(trackingLink, targetUrl, subId = '') {
  if (!trackingLink || !targetUrl) return null;
  let u;
  try {
    u = new URL(trackingLink);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const clean = String(subId || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (clean) u.searchParams.set('subId1', clean);
  u.searchParams.set('u', targetUrl);
  return u.toString();
}

/**
 * Full tracked Omio booking link for a leg, or null when no tracking link is
 * configured or the route can't be expressed (caller keeps its fallbacks).
 *
 * @param subId  which surface the click came from, see omioDeepLink().
 */
export function buildOmioLink({ fromCity, toCity, mode = null, subId = '' }) {
  if (!TRACKING) return null;
  const target = omioRouteUrl({ fromCity, toCity, mode });
  return omioDeepLink(TRACKING, target, subId);
}
